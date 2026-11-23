/*
 * 설문 백엔드 — Google Apps Script
 *
 * assign: Supabase에서 조건을 배정하고 시트에 복제
 * save:   참가자당 1행으로 설문 응답 저장
 * get:    Supabase의 기존 배정 조회
 *
 * 필요한 스크립트 속성:
 * SPREADSHEET_ID
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 *
 * 선택:
 * ASSIGNMENT_STUDY_ID
 */

const SH_ASSIGN = 'assignments';
const SH_RESP = 'responses';
const SH_LOG = 'log';

const ASSIGN_HEADERS = [
  'pid', 'cell', 'group', 'cong', 'code', 'status',
  'assigned_at', 'updated_at', 'is_test', 'assignment_id'
];

const PID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const STUDY_CELLS = [
  { id: 'AI_100', group: 'ai', cong: 'all', code: 'q7' },
  { id: 'AI_50', group: 'ai', cong: 'half', code: 'm2' },
  { id: 'AI_0', group: 'ai', cong: 'none', code: 'z5' },

  { id: 'HUMAN_100', group: 'human', cong: 'all', code: 'b9' },
  { id: 'HUMAN_50', group: 'human', cong: 'half', code: 'k3' },
  { id: 'HUMAN_0', group: 'human', cong: 'none', code: 'r6' },

  { id: 'MIXED_100', group: 'mixed', cong: 'all', code: 'v3' },
  { id: 'MIXED_50', group: 'mixed', cong: 'half', code: 't8' },
  { id: 'MIXED_0', group: 'mixed', cong: 'none', code: 'f1' }
];

// 철회 시 지급 처리·중복 참여 확인에 필요한 열만 유지합니다.
const KEEP_ON_WITHDRAW = [
  'pid', 'created_at', 'updated_at', 'status', 'withdraw', 'finish_at',
  'assignmentid', 'projectid', 'is_test', 'consent', 'consent_at',
  'cell', 'group', 'cong', 'stim_code'
];

function doGet() {
  return json_({
    ok: true,
    msg: 'survey backend is running'
  });
}

function doPost(e) {
  let req;

  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad request' });
  }

  if (!req.pid || !PID_RE.test(String(req.pid))) {
    return json_({ ok: false, error: 'bad pid' });
  }

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(25000)) {
    return json_({ ok: false, error: 'busy' });
  }

  try {
    if (req.action === 'assign') return json_(assign_(req));
    if (req.action === 'save') return json_(save_(req));
    if (req.action === 'get') return json_(get_(req));

    return json_({ ok: false, error: 'unknown action' });
  } catch (err) {
    try {
      log_(req.pid, 'error', {
        action: req.action,
        error: String(err)
      });
    } catch (e2) {}

    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* ───────── Supabase 통신 ───────── */

function supabaseRequest_(path, method, body) {
  const props = PropertiesService.getScriptProperties();

  const base = (props.getProperty('SUPABASE_URL') || '')
    .replace(/\/$/, '');

  const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '';

  if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) ||
    !key ||
    key.startsWith('sb_publishable_')
  ) {
    throw new Error(
      'Configure server-side Supabase URL and service role key.'
    );
  }

  const headers = { apikey: key };

  if (key.startsWith('eyJ')) {
    headers.Authorization = 'Bearer ' + key;
  }

  const options = {
    method: method || 'get',
    headers: headers,
    muteHttpExceptions: true
  };

  if (body !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(body);
  }

  const r = UrlFetchApp.fetch(base + '/rest/v1/' + path, options);

  if (r.getResponseCode() < 200 || r.getResponseCode() >= 300) {
    throw new Error(
      'Supabase request failed (HTTP ' + r.getResponseCode() + ').'
    );
  }

  const result = JSON.parse(r.getContentText());

  if (result && result.ok === false) {
    throw new Error('Supabase assignment request failed.');
  }

  return result;
}

function assignmentRpc_(name, body) {
  const study = PropertiesService.getScriptProperties()
    .getProperty('ASSIGNMENT_STUDY_ID') || 'livestream-ai-chat-2026';

  return supabaseRequest_(
    'rpc/' + name,
    'post',
    Object.assign({}, body, { p_study: study })
  );
}

/* ───────── 조건 배정·조회 ───────── */

function mirrorAssignment_(pid, result) {
  if (!result.found || !result.cell) return;

  const c = result.cell;

  const valid = STUDY_CELLS.some(k =>
    k.id === c.id &&
    k.code === c.code &&
    k.group === c.group &&
    k.cong === c.cong
  );

  if (!valid) {
    throw new Error(
      'Database and survey condition definitions do not match.'
    );
  }

  const sh = sheet_(SH_ASSIGN, ASSIGN_HEADERS);

  let headers = sh
    .getRange(1, 1, 1, sh.getLastColumn())
    .getValues()[0]
    .map(String);

  const fresh = ASSIGN_HEADERS.filter(h => headers.indexOf(h) < 0);

  if (fresh.length) {
    ensureSize_(sh, 1, headers.length + fresh.length);

    sh.getRange(1, headers.length + 1, 1, fresh.length)
      .setValues([fresh]);

    headers = headers.concat(fresh);
  }

  const found = findRow_(sh, pid);
  const r = found < 0 ? sh.getLastRow() + 1 : found;

  const previous = found < 0
    ? []
    : sh.getRange(r, 1, 1, headers.length).getValues()[0];

  const record = {
    pid: pid,
    cell: c.id,
    group: c.group,
    cong: c.cong,
    code: c.code,
    status: result.status,
    assigned_at: result.assigned_at,
    updated_at: result.updated_at,
    is_test: result.is_test ? 1 : 0,
    assignment_id: result.assignment_id
  };

  ensureSize_(sh, r, headers.length);

  sh.getRange(r, 1, 1, headers.length).setValues([
    headers.map((h, i) =>
      Object.prototype.hasOwnProperty.call(record, h)
        ? cell_(record[h])
        : (previous[i] ?? '')
    )
  ]);
}

function assign_(req) {
  const result = assignmentRpc_('assign_condition', {
    p_pid: String(req.pid),
    p_force_cell: String(req.pid).startsWith('TEST_')
      ? (req.forceCell || null)
      : null
  });

  if (
    !result.full &&
    (!result.found || !result.cell || !result.assignment_id)
  ) {
    throw new Error('Invalid assignment response.');
  }

  mirrorAssignment_(String(req.pid), result);
  return result;
}

function get_(req) {
  const result = assignmentRpc_('get_condition_assignment', {
    p_pid: String(req.pid)
  });

  mirrorAssignment_(String(req.pid), result);
  return result;
}

/* ───────── 응답 저장 ───────── */

function save_(req) {
  const pid = String(req.pid);
  const data = Object.assign({}, req.data || {});
  const t = new Date().toISOString();

  data.pid = pid;
  data.updated_at = t;

  const sh = sheet_(SH_RESP, [
    'pid', 'created_at', 'updated_at', 'status'
  ]);

  let headers = sh
    .getRange(1, 1, 1, sh.getLastColumn())
    .getValues()[0]
    .map(String);

  let rowNum = findRow_(sh, pid);

  if (rowNum >= 0) {
    const previous = sh
      .getRange(rowNum, 1, 1, headers.length)
      .getValues()[0];

    const status = previous[headers.indexOf('status')];
    const desktopResume = (status === 'full' || (status === 'mobile' && data.is_mobile === 0)) &&
      ['consented', 'assigned', 'stimulus', 'returned', 'complete'].includes(data.status);
    if (desktopResume) {
      data.end_reason = '';
      data.end_at = '';
    }

    // 철회한 응답이 늦게 도착한 요청으로 복구되지 않도록 합니다.
    if (status === 'withdrawn') {
      setStatus_(pid, 'withdrawn');
      purgeLog_(pid);

      if (typeof purgeBehavior_ === 'function') {
        purgeBehavior_(pid);
      }

      return { ok: true, status: 'withdrawn' };
    }

    // Reject new answers for a terminal attempt; allow withdrawal.
    if (
      ['screened', 'attention_fail', 'technical', 'full', 'mobile', 'declined']
        .includes(status) && !desktopResume && data.withdraw !== 'yes'
    ) {
      return { ok: true, status: status };
    }

    const rank = {
      consented: 1,
      assigned: 2,
      stimulus: 3,
      returned: 4,
      complete: 5
    };

    if (
      data.status &&
      data.status !== 'withdrawn' &&
      (
        (
          rank[status] &&
          rank[data.status] &&
          rank[status] > rank[data.status]
        ) ||
        [
          'screened', 'attention_fail', 'technical', 'full', 'mobile'
        ].includes(status) && !desktopResume
      )
    ) {
      data.status = status;
    }
  }

  // 새 문항이 있으면 열을 추가합니다.
  // Preserve the first server-side completion timestamp across retries.
  if (data.status === 'complete') {
    const completedIndex = headers.indexOf('completed_at');
    const completedAt = rowNum >= 0 && completedIndex >= 0
      ? sh.getRange(rowNum, completedIndex + 1).getValues()[0][0]
      : '';

    data.completed_at = completedAt || t;
  } else {
    delete data.completed_at;
  }

  const fresh = Object.keys(data)
    .filter(k => headers.indexOf(k) < 0);

  if (fresh.length) {
    ensureSize_(sh, 1, headers.length + fresh.length);

    sh.getRange(1, headers.length + 1, 1, fresh.length)
      .setValues([fresh]);

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

  Object.keys(data).forEach(k => {
    row[headers.indexOf(k)] = cell_(data[k]);
  });

  const withdrawn = data.withdraw === 'yes';

  if (withdrawn) {
    headers.forEach((h, i) => {
      if (KEEP_ON_WITHDRAW.indexOf(h) < 0) row[i] = '';
    });

    row[headers.indexOf('status')] = 'withdrawn';
  }

  ensureSize_(sh, rowNum, headers.length);

  sh.getRange(rowNum, 1, 1, headers.length).setValues([row]);

  if (data.status) {
    setStatus_(pid, withdrawn ? 'withdrawn' : data.status);
  }

  if (withdrawn) {
    purgeLog_(pid);

    if (typeof purgeBehavior_ === 'function') {
      purgeBehavior_(pid);
    }
  } else {
    log_(pid, 'save', data);
  }

  return {
    ok: true,
    status: row[headers.indexOf('status')]
  };
}

function setStatus_(pid, status) {
  const result = assignmentRpc_('set_condition_status', {
    p_pid: String(pid),
    p_status: status
  });

  mirrorAssignment_(String(pid), result);
}

/* ───────── 백업 로그 ───────── */

function log_(pid, action, obj) {
  const sh = sheet_(SH_LOG, ['time', 'pid', 'action', 'json']);

  sh.appendRow([
    new Date().toISOString(),
    pid,
    action,
    JSON.stringify(obj).slice(0, 45000)
  ]);
}

function purgeLog_(pid) {
  const sh = sheet_(SH_LOG, ['time', 'pid', 'action', 'json']);
  const vals = sh.getRange(1, 2, sh.getLastRow(), 1).getValues();

  for (let r = vals.length; r >= 2; r--) {
    if (String(vals[r - 1][0]) === pid) sh.deleteRow(r);
  }

  sh.appendRow([
    new Date().toISOString(),
    pid,
    'withdrawn',
    '{}'
  ]);
}

/* ───────── 시트 접근·공통 도우미 ───────── */

function sheet_(name, headers) {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId || !spreadsheetId.trim()) {
    throw new Error('Configure SPREADSHEET_ID in Script Properties.');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId.trim());

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
  if (sh.getMaxColumns() < columns) {
    sh.insertColumnsAfter(
      sh.getMaxColumns(),
      columns - sh.getMaxColumns()
    );
  }

  if (sh.getMaxRows() < rows) {
    sh.insertRowsAfter(
      sh.getMaxRows(),
      rows - sh.getMaxRows()
    );
  }
}

function index_(headerRow) {
  const H = {};

  headerRow.forEach((h, i) => {
    H[String(h)] = i;
  });

  return H;
}

function cellOf_(row, H) {
  return {
    id: row[H.cell],
    group: row[H.group],
    cong: row[H.cong],
    code: row[H.code]
  };
}

function findRow_(sh, pid) {
  const last = sh.getLastRow();

  if (last < 2) return -1;

  const hit = sh
    .getRange(2, 1, last - 1, 1)
    .createTextFinder(pid)
    .matchCase(true)
    .matchEntireCell(true)
    .findNext();

  return hit ? hit.getRow() : -1;
}

// 입력한 텍스트가 수식으로 실행되지 않도록 처리합니다.
function cell_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'object') v = JSON.stringify(v);

  if (typeof v === 'string' && /^[=+\-@]/.test(v)) {
    return "'" + v;
  }

  return v;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────── 편집기에서 실행하는 현황 확인 함수 ───────── */

function showCounts() {
  const rows = sheet_(SH_ASSIGN, ASSIGN_HEADERS)
    .getDataRange()
    .getValues();

  const H = index_(rows[0]);
  const out = {};

  for (let r = 1; r < rows.length; r++) {
    if (Number(rows[r][H.is_test]) === 1) continue;

    const k = rows[r][H.cell] + ' / ' + rows[r][H.status];
    out[k] = (out[k] || 0) + 1;
  }

  Logger.log(JSON.stringify(out, null, 2));
}
