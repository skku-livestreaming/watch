/* Server-side Supabase -> Google Sheets summary sync.
   Add this file beside Code.gs in the bound Apps Script project.
   Script Properties: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
   Never put the service key in config.js or participant-facing HTML.
   Run syncBehaviorMeasures manually, or installBehaviorSync once. */
const BEHAVIOR_HEADERS = [
  'session_id', 'pid', 'event_id', 'synced_at', 'started_at', 'stimulus_version',
  'code', 'cong', 'label', 'ratio', 'via', 'dwell_sec', 'after_end_sec',
  'vote', 'confidence', 'submitted', 'comments_typed', 'text_selections',
  'user_card_opens', 'user_card_clicks', 'next_video_clicks', 'reaction', 'subscribed',
  'saw_end', 'chat_exposure_sec', 'chat_panel_opens', 'chat_panel_open_ms',
  'scroll_up_events', 'scroll_max_depth_px', 'scroll_away_ms',
  'shown_congruent', 'shown_incongruent', 'seen_congruent', 'seen_incongruent',
  'seen_congruence_ratio', 'lines_total', 'lines_seen', 'visible_ms_total',
  'ai_opinions', 'human_opinions',
  'behavior_version', 'visible_watch_sec', 'hidden_playback_sec', 'visible_postpoll_sec',
  'visible_after_end_sec', 'next_video_selected', 'first_next_video_index',
  'first_next_video_latency_ms', 'first_next_video_visible_latency_ms', 'seen_supported',
  'seen_ai_congruent', 'seen_ai_incongruent', 'seen_human_congruent', 'seen_human_incongruent',
  'visible_ms_ai_congruent', 'visible_ms_ai_incongruent',
  'visible_ms_human_congruent', 'visible_ms_human_incongruent'
];

function behaviorRow_(event, session) {
  const d = event.data || {}, c = session.condition || {};
  const p = (d.polls || [])[0] || {}, s = d.scroll || {};
  const kinds = p.shown_by_identity || {};
  const seen = d.seen_by_identity || {};
  const opinions = k => kinds[k] ? Number(kinds[k].cong || 0) + Number(kinds[k].incong || 0) : null;
  const row = Object.assign({}, d, {
    session_id:session.id, pid:session.pid, event_id:event.id, synced_at:new Date().toISOString(),
    started_at:session.started_at, stimulus_version:c.stimulus_version,
    code:c.code, cong:c.cong, label:c.label, ratio:c.ratio,
    submitted:p.submitted, scroll_up_events:s.up_events,
    scroll_max_depth_px:s.max_depth_px, scroll_away_ms:s.away_ms,
    ai_opinions:opinions('ai'), human_opinions:opinions('human'),
    seen_ai_congruent:seen.ai && seen.ai.congruent,
    seen_ai_incongruent:seen.ai && seen.ai.incongruent,
    seen_human_congruent:seen.human && seen.human.congruent,
    seen_human_incongruent:seen.human && seen.human.incongruent,
    visible_ms_ai_congruent:seen.ai && seen.ai.congruent_ms,
    visible_ms_ai_incongruent:seen.ai && seen.ai.incongruent_ms,
    visible_ms_human_congruent:seen.human && seen.human.congruent_ms,
    visible_ms_human_incongruent:seen.human && seen.human.incongruent_ms
  });
  return BEHAVIOR_HEADERS.map(h => cell_(row[h]));
}

function supabaseRead_(path) {
  return supabaseRequest_(path,'get');
}

/* Append missing columns by name, preserving old rows, column order and any
   researcher-added columns. Old measurements stay blank rather than becoming 0. */
function behaviorSheet_(){
  const sh = sheet_('behavior', BEHAVIOR_HEADERS);
  const headers = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(String);
  const fresh = BEHAVIOR_HEADERS.filter(h => headers.indexOf(h) < 0);
  if (fresh.length){
    ensureSize_(sh,1,headers.length + fresh.length);
    sh.getRange(1,headers.length + 1,1,fresh.length).setValues([fresh]);
    headers.push(...fresh);
  }
  return {sh,headers};
}

function syncBehaviorMeasures() {
  // One bounded page per run; a failed run never advances the cursor.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {ok:false, busy:true};
  try {
    const props = PropertiesService.getScriptProperties();
    const cursor = props.getProperty('BEHAVIOR_EVENT_CURSOR') || '0';
    const events = supabaseRead_('events?select=id,session_id,data&type=eq.leave&id=gt.' +
      encodeURIComponent(cursor) + '&order=id.asc&limit=100');
    if (!events.length) return {ok:true, processed:0};
    const ids = [...new Set(events.map(e => e.session_id))];
    const sessions = supabaseRead_('sessions?select=id,pid,condition,started_at&id=in.(' + ids.join(',') + ')');
    const byId = {};
    sessions.forEach(s => { byId[s.id] = s; });
    const responses = sheet_(SH_RESP, ['pid', 'created_at', 'updated_at', 'status']).getDataRange().getValues();
    const rh = index_(responses[0]);
    const withdrawn = new Set(responses.slice(1).filter(r => r[rh.status] === 'withdrawn').map(r => String(r[rh.pid])));
    const {sh,headers} = behaviorSheet_(), h = index_(headers);
    // Delete withdrawn rows in the sheet itself so researcher formulas move
    // with their rows, rather than being replaced with computed values.
    let values = sh.getDataRange().getValues();
    for (let r = values.length - 1; r >= 1; r--)
      if (withdrawn.has(String(values[r][h.pid]))) sh.deleteRow(r + 1);
    values = sh.getDataRange().getValues();
    const positions = {};
    values.slice(1).forEach((r, i) => { positions[r[h.session_id]] = i + 1; });
    events.forEach(e => {
      const s = byId[e.session_id];
      if (!s) throw new Error('Missing session for event ' + e.id);
      if (withdrawn.has(String(s.pid))) return;
      const i = positions[s.id];
      // Retried batches are idempotent, and closing a page cannot overwrite completion.
      // Reapply an equal event ID: a previous run may have written only one
      // column block before failing. Older events still cannot roll back a row.
      if (i && (Number(values[i][h.event_id]) > Number(e.id) ||
          (values[i][h.via] === 'end_button' && e.data.via !== 'end_button'))) return;
      const measured = behaviorRow_(e, s);
      const record = Object.fromEntries(BEHAVIOR_HEADERS.map((name,j) => [name,measured[j]]));
      const row = headers.map((name,j) => Object.prototype.hasOwnProperty.call(record,name)
        ? record[name] : (i ? values[i][j] : ''));
      if (i) values[i] = row;
      else { positions[s.id] = values.length; values.push(row); }
    });
    // Remove previously exported data for participants who have since withdrawn.
    const kept = values.slice(1);
    ensureSize_(sh, kept.length + 1, headers.length);
    // Write measured columns in contiguous blocks, leaving researcher-added
    // formulas, values and formatting in other columns untouched.
    for (let j = 0; kept.length && j < headers.length;){
      if (!BEHAVIOR_HEADERS.includes(headers[j])){ j++; continue; }
      const start = j;
      while (j < headers.length && BEHAVIOR_HEADERS.includes(headers[j])) j++;
      sh.getRange(2,start + 1,kept.length,j - start).setValues(kept.map(r => r.slice(start,j)));
    }
    props.setProperty('BEHAVIOR_EVENT_CURSOR', String(events[events.length - 1].id));
    return {ok:true, processed:events.length, sessions:kept.length};
  } finally { lock.releaseLock(); }
}

function purgeBehavior_(pid) {
  const sh = sheet_('behavior', BEHAVIOR_HEADERS);
  const values = sh.getDataRange().getValues();
  const h = index_(values[0]);
  for (let i = values.length - 1; i >= 1; i--)
    if (String(values[i][h.pid]) === String(pid)) sh.deleteRow(i + 1);
}

function installBehaviorSync() {
  // Validate settings before creating the periodic trigger.
  supabaseRead_('sessions?select=id&limit=1');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncBehaviorMeasures')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncBehaviorMeasures').timeBased().everyMinutes(5).create();
}
