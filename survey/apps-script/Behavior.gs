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
  'ai_opinions', 'human_opinions'
];

function behaviorRow_(event, session) {
  const d = event.data || {}, c = session.condition || {};
  const p = (d.polls || [])[0] || {}, s = d.scroll || {};
  const kinds = p.shown_by_identity || {};
  const opinions = k => kinds[k] ? Number(kinds[k].cong || 0) + Number(kinds[k].incong || 0) : null;
  const row = Object.assign({}, d, {
    session_id:session.id, pid:session.pid, event_id:event.id, synced_at:new Date().toISOString(),
    started_at:session.started_at, stimulus_version:c.stimulus_version,
    code:c.code, cong:c.cong, label:c.label, ratio:c.ratio,
    submitted:p.submitted, scroll_up_events:s.up_events,
    scroll_max_depth_px:s.max_depth_px, scroll_away_ms:s.away_ms,
    ai_opinions:opinions('ai'), human_opinions:opinions('human')
  });
  return BEHAVIOR_HEADERS.map(h => cell_(row[h]));
}

function supabaseRead_(path) {
  const props = PropertiesService.getScriptProperties();
  const base = (props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
  const key = props.getProperty('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) || !key || key.startsWith('sb_publishable_'))
    throw new Error('Set server-side SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Script Properties.');
  const headers = {apikey:key};
  if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;
  const response = UrlFetchApp.fetch(base + '/rest/v1/' + path, {headers:headers, muteHttpExceptions:true});
  if (response.getResponseCode() !== 200)
    throw new Error('Supabase read failed (HTTP ' + response.getResponseCode() + ').');
  return JSON.parse(response.getContentText());
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
    const sh = sheet_('behavior', BEHAVIOR_HEADERS);
    const values = sh.getDataRange().getValues();
    const positions = {};
    values.slice(1).forEach((r, i) => { positions[r[0]] = i + 1; });
    events.forEach(e => {
      const s = byId[e.session_id];
      if (!s) throw new Error('Missing session for event ' + e.id);
      if (withdrawn.has(String(s.pid))) return;
      const i = positions[s.id];
      // Retried batches are idempotent, and closing a page cannot overwrite completion.
      if (i && (Number(values[i][2]) >= Number(e.id) ||
          (values[i][10] === 'end_button' && e.data.via !== 'end_button'))) return;
      const row = behaviorRow_(e, s);
      if (i) values[i] = row;
      else { positions[s.id] = values.length; values.push(row); }
    });
    // Remove previously exported data for participants who have since withdrawn.
    const kept = values.slice(1).filter(r => !withdrawn.has(String(r[1])));
    ensureSize_(sh, kept.length + 1, BEHAVIOR_HEADERS.length);
    if (kept.length) sh.getRange(2, 1, kept.length, BEHAVIOR_HEADERS.length).setValues(kept);
    if (values.length - 1 > kept.length)
      sh.getRange(kept.length + 2, 1, values.length - 1 - kept.length, BEHAVIOR_HEADERS.length).clearContent();
    props.setProperty('BEHAVIOR_EVENT_CURSOR', String(events[events.length - 1].id));
    return {ok:true, processed:events.length, sessions:kept.length};
  } finally { lock.releaseLock(); }
}

function purgeBehavior_(pid) {
  const sh = sheet_('behavior', BEHAVIOR_HEADERS);
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--)
    if (String(values[i][1]) === String(pid)) sh.deleteRow(i + 1);
}

function installBehaviorSync() {
  // Validate settings before creating the periodic trigger.
  supabaseRead_('sessions?select=id&limit=1');
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncBehaviorMeasures')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncBehaviorMeasures').timeBased().everyMinutes(5).create();
}
