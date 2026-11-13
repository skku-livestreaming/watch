// In-memory Apps Script contract tests. No credentials or network requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

class Sheet {
  constructor() { this.data = []; this.cols = 26; this.rows = 4; }
  getMaxColumns() { return this.cols; }
  getMaxRows() { return this.rows; }
  insertColumnsAfter(_, n) { this.cols += n; }
  insertRowsAfter(_, n) { this.rows += n; }
  getLastColumn() { return Math.max(1, ...this.data.map(r => r.length)); }
  getLastRow() {
    let n = this.data.length;
    while (n && !this.data[n-1].some(v => v !== '' && v != null)) n--;
    return n;
  }
  setFrozenRows() {}
  appendRow(row) {
    const n = this.getLastRow();
    this.rows = Math.max(this.rows,n+1); this.cols = Math.max(this.cols,row.length);
    this.data[n] = [...row];
  }
  deleteRow(n) { this.data.splice(n-1, 1); }
  getDataRange() { return this.getRange(1, 1, Math.max(1,this.getLastRow()), this.getLastColumn()); }
  getRange(r, c, nr=1, nc=1) {
    assert(r + nr - 1 <= this.rows && c + nc - 1 <= this.cols, 'Range exceeds grid');
    const sh = this;
    return {
      getValues() { return Array.from({length:nr}, (_,i) => Array.from({length:nc}, (_,j) => sh.data[r+i-1]?.[c+j-1] ?? '')); },
      setValue(value) { this.setValues([[value]]); },
      createTextFinder(value) {
        return {matchCase(){return this;},matchEntireCell(){return this;},findNext(){
          for(let i=0;i<nr;i++) if(String(sh.data[r+i-1]?.[c-1])===String(value)) return {getRow:()=>r+i};
          return null;
        }};
      },
      setValues(values) {
        assert.equal(values.length, nr);
        values.forEach((row,i) => {
          assert.equal(row.length, nc);
          sh.data[r+i-1] ||= [];
          row.forEach((v,j) => { sh.data[r+i-1][c+j-1] = v; });
        });
      },
      clearContent() { this.setValues(Array.from({length:nr}, () => Array(nc).fill(''))); }
    };
  }
}

const sheets = {};
const props = new Map([['SUPABASE_URL','https://example.supabase.co'], ['SUPABASE_SERVICE_ROLE_KEY','server-test-key']]);
const rpcCalls=[], mockAssignments=new Map();
let failCursor = false, failNetwork = false, lockReleased = 0;
const sessions = Array.from({length:500}, (_,i) => ({
  id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`, pid:`P${i}`,
  condition:{code:'t8',cong:'half',label:'mixed',ratio:50,stimulus_version:'test'}, started_at:'2026-11-13'
}));
const events = sessions.map((s,i) => ({id:i+1,session_id:s.id,data:{
  via:'end_button',vote:'B',confidence:6,comments_typed:2,text_selections:3,
  subscribed:false,polls:[{submitted:true,shown_by_identity:{ai:{cong:5,incong:5},human:{cong:5,incong:5}}}]
}}));
const ctx = vm.createContext({
  console,
  SpreadsheetApp:{getActiveSpreadsheet:()=>({
    getSheetByName:n=>sheets[n], insertSheet:n=>(sheets[n]=new Sheet())
  })},
  PropertiesService:{getScriptProperties:()=>({
    getProperty:k=>props.get(k), setProperty:(k,v)=>{
      if (failCursor) { failCursor=false; throw new Error('cursor failed'); }
      props.set(k,v);
    }
  })},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>lockReleased++})},
  UrlFetchApp:{fetch:(url,options={})=>{
    if (failNetwork) throw new Error('offline');
    const u = new URL(url);
    if(u.pathname.includes('/rpc/')){
      const body=JSON.parse(options.payload);rpcCalls.push({name:u.pathname.split('/').pop(),body});
      let result=mockAssignments.get(body.p_pid) || {ok:true,found:false};
      if(u.pathname.endsWith('/assign_condition')){
        if(!result.found){
          result={ok:true,found:true,existing:false,assignment_id:'00000000-0000-4000-8000-000000000001',
            cell:{id:'MIXED_50',group:'mixed',cong:'half',code:'t8'},status:'assigned',is_test:body.p_pid.startsWith('TEST_'),
            assigned_at:'2026-11-13T00:00:00Z',updated_at:'2026-11-13T00:00:00Z'};
          mockAssignments.set(body.p_pid,result);
        }else result={...result,existing:true};
      }else if(u.pathname.endsWith('/set_condition_status') && result.found){
        result={...result,status:body.p_status};mockAssignments.set(body.p_pid,result);
      }
      return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};
    }
    const result = u.pathname.endsWith('/events')
      ? events.filter(e => e.id > Number(u.searchParams.get('id').slice(3))).slice(0,100)
      : sessions.filter(s=>u.searchParams.get('id').includes(s.id));
    return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(result)};
  }}
});
for (const file of ['Code.gs','Behavior.gs'])
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../survey/apps-script',file),'utf8'),ctx);
const run = code => vm.runInContext(code,ctx);
for (let i=0;i<5;i++) assert.equal(run('syncBehaviorMeasures().processed'),100);
assert.equal(sheets.behavior.getLastRow(),501);
assert.equal(props.get('BEHAVIOR_EVENT_CURSOR'),'500');
const headers = sheets.behavior.data[0];
const field = (name,row=1) => sheets.behavior.data[row][headers.indexOf(name)];
assert.equal(field('ai_opinions'),10);
assert.equal(field('human_opinions'),10);
assert.equal(field('subscribed'),0);
assert.equal(field('confidence'),6);
assert.equal(run('syncBehaviorMeasures().processed'),0);
assert.equal(sheets.behavior.getLastRow(),501);

events.push({id:501,session_id:sessions[0].id,data:{via:'closed',text_selections:999}});
run('syncBehaviorMeasures()');
assert.equal(field('via'),'end_button');
assert.equal(field('text_selections'),3);
events.push({...events[0],id:502,data:{...events[0].data,text_selections:4}});
failCursor = true;
assert.throws(()=>run('syncBehaviorMeasures()'),/cursor failed/);
assert.equal(props.get('BEHAVIOR_EVENT_CURSOR'),'501');
run('syncBehaviorMeasures()');
assert.equal(props.get('BEHAVIOR_EVENT_CURSOR'),'502');
assert.equal(field('text_selections'),4);
assert.equal(sheets.behavior.getLastRow(),501);

run("purgeBehavior_('P0')");
assert.equal(sheets.behavior.getLastRow(),500);
const response = sheets.responses;
response.getRange(1,1,2,4).setValues([['pid','created_at','updated_at','status'],['P0','','','withdrawn']]);
events.push({...events[0],id:503});
run('syncBehaviorMeasures()');
assert(!sheets.behavior.data.some(r=>r[1]==='P0'));
failNetwork = true;
assert.throws(()=>run('syncBehaviorMeasures()'),/offline/);
assert.equal(props.get('BEHAVIOR_EVENT_CURSOR'),'503');
assert(lockReleased >= 10);
assert.equal(run("cell_('=SUM(A1:A2)')"),"'=SUM(A1:A2)");
props.set('SUPABASE_SERVICE_ROLE_KEY','sb_publishable_test');
assert.throws(()=>run("supabaseRead_('sessions?select=id')"),/server-side/);
props.set('SUPABASE_SERVICE_ROLE_KEY','server-test-key');failNetwork=false;
console.log('PASS: 500 mocked participants, grid expansion, paged sync, deduplication, completion precedence, retry after partial failure, withdrawal, formula escaping, server-key validation');
run("save_({pid:'P1',data:{status:'complete',answer:'retained'}})");
run("save_({pid:'P1',data:{status:'assigned'}})");
const resultRow = () => sheets.responses.data.find(r=>r[0]==='P1');
const resultField = name => resultRow()[sheets.responses.data[0].indexOf(name)];
assert.equal(resultField('status'),'complete');
run("save_({pid:'P1',data:{status:'withdrawn',withdraw:'yes'}})");
assert.equal(resultField('answer'),'');
run("save_({pid:'P1',data:{status:'complete',answer:'must not return'}})");
assert.equal(resultField('status'),'withdrawn');
assert.equal(resultField('answer'),'');
assert(!sheets.behavior.data.some(r=>r[1]==='P1'));
console.log('PASS: late saves cannot roll back completion or resurrect withdrawn answers/behavior');
const assigned=run("assign_({pid:'REAL_RPC',cells:[{id:'tampered',code:'bad'}],study:'tampered',forceCell:'AI_100'})");
assert.equal(assigned.cell.id,'MIXED_50');
const request=rpcCalls.find(r=>r.name==='assign_condition').body;
assert.equal(request.p_study,'livestream-ai-chat-2026');
assert.equal(request.p_force_cell,null);
assert(!('cells' in request));
const again=run("assign_({pid:'REAL_RPC'})");
assert(again.existing && again.assignment_id===assigned.assignment_id);
assert.equal(sheets.assignments.data.filter(r=>r[0]==='REAL_RPC').length,1);
assert.equal(run("get_({pid:'REAL_RPC'})").assignment_id,assigned.assignment_id);
run("setStatus_('REAL_RPC','returned')");
assert.equal(sheets.assignments.data.find(r=>r[0]==='REAL_RPC')[5],'returned');
console.log('PASS: Apps Script uses trusted database RPCs and mirrors condition/assignment ID without duplicate rows');
