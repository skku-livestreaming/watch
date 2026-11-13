/* ═══════════════════════════════════════════════════════════════
   설문 백엔드 (Google Apps Script)
   - assign : 셀 균등 배정 (같은 ID가 다시 오면 처음 배정을 그대로 돌려줌)
   - save   : 참가자당 1행으로 응답 저장(덮어쓰기), 새 문항은 열이 자동으로 추가됨
   - get    : 자극물에서 돌아왔는데 브라우저 기록이 없을 때 배정 정보 조회
   시트 3개가 자동으로 생깁니다: assignments / responses / log
   ═══════════════════════════════════════════════════════════════ */

const SH_ASSIGN = 'assignments';
const SH_RESP = 'responses';
const SH_LOG = 'log';
const ASSIGN_HEADERS = ['pid', 'cell', 'group', 'cong', 'code', 'status', 'assigned_at', 'updated_at', 'is_test'];
const PID_RE = /^[A-Za-z0-9_-]{1,64}$/;
// Server-owned conditions: participant requests cannot change the study cells.
const STUDY_CELLS = [
  {id:'AI_100',group:'ai',cong:'all',code:'q7'},
  {id:'AI_50',group:'ai',cong:'half',code:'m2'},
  {id:'AI_0',group:'ai',cong:'none',code:'z5'},
  {id:'HUMAN_100',group:'human',cong:'all',code:'b9'},
  {id:'HUMAN_50',group:'human',cong:'half',code:'k3'},
  {id:'HUMAN_0',group:'human',cong:'none',code:'r6'},
  {id:'MIXED_100',group:'mixed',cong:'all',code:'v3'},
  {id:'MIXED_50',group:'mixed',cong:'half',code:'t8'},
  {id:'MIXED_0',group:'mixed',cong:'none',code:'f1'}
];

// 셀 인원으로 세는 상태. 진행 중(assigned/stimulus)은 IN_PROGRESS_MINUTES 안일 때만 셉니다.
const COUNT_DONE = ['returned', 'complete'];
const COUNT_ACTIVE = ['assigned', 'consented', 'stimulus'];

// 철회 시 남기는 열(지급 처리·중복 참여 확인용). 나머지 응답은 지웁니다.
const KEEP_ON_WITHDRAW = ['pid', 'created_at', 'updated_at', 'status', 'withdraw', 'finish_at',
  'assignmentid', 'projectid', 'is_test', 'consent', 'consent_at', 'cell', 'group', 'cong', 'stim_code'];

function doGet() {
  return json_({ ok: true, msg: 'survey backend is running' });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); }
  catch (err) { return json_({ ok: false, error: 'bad request' }); }
  if (!req.pid || !PID_RE.test(String(req.pid))) return json_({ ok: false, error: 'bad pid' });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return json_({ ok: false, error: 'busy' });
  try {
    if (req.action === 'assign') return json_(assign_(req));
    if (req.action === 'save') return json_(save_(req));
    if (req.action === 'get') return json_(get_(req));
    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    try { log_(req.pid, 'error', { action: req.action, error: String(err) }); } catch (e2) {}
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ───────── 균등 배정 ───────── */
function assign_(req) {
  const sh = sheet_(SH_ASSIGN, ASSIGN_HEADERS);
  const rows = sh.getDataRange().getValues();
  const H = index_(rows[0]);
  const pid = String(req.pid);

  // 이미 배정된 사람은 같은 셀 (새로고침·재접속해도 바뀌지 않음)
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][H.pid]) === pid) {
      return { ok: true, existing: true, cell: cellOf_(rows[r], H), status: rows[r][H.status] };
    }
  }

  const cells = STUDY_CELLS;
  const isTest = pid.startsWith('TEST_');
  const settings = PropertiesService.getScriptProperties();

  let cell = null;
  if (isTest && req.forceCell) cell = cells.find(c => c.id === req.forceCell) || null;

  const counts = {};
  cells.forEach(c => { counts[c.id] = 0; });
  const now = Date.now();
  const windowMs = Math.max(1, Number(settings.getProperty('IN_PROGRESS_MINUTES')) || 60) * 60000;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (Number(row[H.is_test]) === 1) continue;           // 점검용 기록은 세지 않음
    const id = row[H.cell];
    if (!(id in counts)) continue;
    const st = String(row[H.status]);
    const recent = now - new Date(row[H.assigned_at]).getTime() < windowMs;
    if (COUNT_DONE.indexOf(st) >= 0 || (COUNT_ACTIVE.indexOf(st) >= 0 && recent)) counts[id]++;
  }

  if (!cell) {
    const quota = Math.max(0, Number(settings.getProperty('CELL_QUOTA')) || 0);
    const open = cells.filter(c => !quota || counts[c.id] < quota);
    if (!open.length) return { ok: true, full: true, counts: counts };
    const min = Math.min.apply(null, open.map(c => counts[c.id]));
    const tied = open.filter(c => counts[c.id] === min);
    cell = tied[Math.floor(Math.random() * tied.length)];   // 동률이면 무작위
  }

  const t = new Date().toISOString();
  sh.appendRow([pid, cell.id, cell.group, cell.cong, cell.code, 'assigned', t, t, isTest ? 1 : 0]);
  return { ok: true, cell: { id: cell.id, group: cell.group, cong: cell.cong, code: cell.code }, counts: counts };
}

function get_(req) {
  const sh = sheet_(SH_ASSIGN, ASSIGN_HEADERS);
  const rows = sh.getDataRange().getValues();
  const H = index_(rows[0]);
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][H.pid]) === String(req.pid)) {
      return { ok: true, found: true, cell: cellOf_(rows[r], H), status: rows[r][H.status], is_test: rows[r][H.is_test] };
    }
  }
  return { ok: true, found: false };
}

/* ───────── 응답 저장 (참가자당 1행) ───────── */
function save_(req) {
  const pid = String(req.pid);
  const data = Object.assign({}, req.data || {});
  const t = new Date().toISOString();
  data.pid = pid;
  data.updated_at = t;

  const sh = sheet_(SH_RESP, ['pid', 'created_at', 'updated_at', 'status']);
  let headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  let rowNum = findRow_(sh, pid);
  if (rowNum >= 0){
    const previous = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
    const status = previous[headers.indexOf('status')];
    if (status === 'withdrawn'){
      setStatus_(pid, 'withdrawn');
      purgeLog_(pid);
      if (typeof purgeBehavior_ === 'function') purgeBehavior_(pid);
      return {ok:true,status:'withdrawn'};
    }
    const rank = {consented:1,assigned:2,stimulus:3,returned:4,complete:5};
    if (data.status && data.status !== 'withdrawn' &&
        ((rank[status] && rank[data.status] && rank[status] > rank[data.status]) ||
         ['screened','attention_fail','technical','full','mobile'].includes(status))) data.status = status;
  }

  // 처음 보는 문항이면 열을 오른쪽에 추가
  const fresh = Object.keys(data).filter(k => headers.indexOf(k) < 0);
  if (fresh.length) {
    ensureSize_(sh, 1, headers.length + fresh.length);
    sh.getRange(1, headers.length + 1, 1, fresh.length).setValues([fresh]);
    headers = headers.concat(fresh);
  }

  let row;
  if (rowNum < 0) {
    rowNum = sh.getLastRow() + 1;
    row = headers.map(() => '');
    row[headers.indexOf('created_at')] = t;
  } else {
    row = sh.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  }
  Object.keys(data).forEach(k => { row[headers.indexOf(k)] = cell_(data[k]); });

  const withdrawn = data.withdraw === 'yes';
  if (withdrawn) {
    headers.forEach((h, i) => { if (KEEP_ON_WITHDRAW.indexOf(h) < 0) row[i] = ''; });
    row[headers.indexOf('status')] = 'withdrawn';
  }
  ensureSize_(sh, rowNum, headers.length);
  sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);

  if (data.status) setStatus_(pid, withdrawn ? 'withdrawn' : data.status);
  if (withdrawn) {
    purgeLog_(pid);
    if (typeof purgeBehavior_ === 'function') purgeBehavior_(pid);
  }
  else log_(pid, 'save', data);
  return { ok: true };
}

function setStatus_(pid, status) {
  const sh = sheet_(SH_ASSIGN, ASSIGN_HEADERS);
  const r = findRow_(sh, pid);
  if (r < 0) return;
  const H = index_(sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]);
  sh.getRange(r, H.status + 1).setValue(status);
  sh.getRange(r, H.updated_at + 1).setValue(new Date().toISOString());
}

/* ───────── 원본 기록 (백업) ───────── */
function log_(pid, action, obj) {
  const sh = sheet_(SH_LOG, ['time', 'pid', 'action', 'json']);
  sh.appendRow([new Date().toISOString(), pid, action, JSON.stringify(obj).slice(0, 45000)]);
}
function purgeLog_(pid) {
  const sh = sheet_(SH_LOG, ['time', 'pid', 'action', 'json']);
  const vals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();
  for (let r = vals.length; r >= 2; r--) if (String(vals[r - 1][0]) === pid) sh.deleteRow(r);
  sh.appendRow([new Date().toISOString(), pid, 'withdrawn', '{}']);
}

/* ───────── 도우미 ───────── */
function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    ensureSize_(sh, 1, headers.length);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function ensureSize_(sh, rows, columns) {
  if (sh.getMaxColumns() < columns) sh.insertColumnsAfter(sh.getMaxColumns(), columns - sh.getMaxColumns());
  if (sh.getMaxRows() < rows) sh.insertRowsAfter(sh.getMaxRows(), rows - sh.getMaxRows());
}
function index_(headerRow) {
  const H = {};
  headerRow.forEach((h, i) => { H[String(h)] = i; });
  return H;
}
function cellOf_(row, H) {
  return { id: row[H.cell], group: row[H.group], cong: row[H.cong], code: row[H.code] };
}
function findRow_(sh, pid) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const hit = sh.getRange(2, 1, last - 1, 1).createTextFinder(pid).matchCase(true).matchEntireCell(true).findNext();
  return hit ? hit.getRow() : -1;
}
// 참가자가 쓴 글이 =, +, -, @로 시작하면 시트가 수식으로 읽지 않게 막습니다
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') v = JSON.stringify(v);
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────── 현황 확인용: 편집기에서 직접 실행 ───────── */
function showCounts() {
  const rows = sheet_(SH_ASSIGN, ASSIGN_HEADERS).getDataRange().getValues();
  const H = index_(rows[0]);
  const out = {};
  for (let r = 1; r < rows.length; r++) {
    if (Number(rows[r][H.is_test]) === 1) continue;
    const k = rows[r][H.cell] + ' / ' + rows[r][H.status];
    out[k] = (out[k] || 0) + 1;
  }
  Logger.log(JSON.stringify(out, null, 2));
}
