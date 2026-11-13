// Real PostgreSQL integration tests, including concurrent transactions.
// Install with: npm install --prefix .qa-tools --no-save embedded-postgres pg
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname,'..');
const modules = process.env.TEST_NODE_MODULES || path.join(root,'.qa-tools/node_modules');
const {Pool} = require(path.join(modules,'pg'));
const STUDY = 'livestream-ai-chat-2026';

async function main(){
  const {default:EmbeddedPostgres} = await import(pathToFileURL(path.join(modules,'embedded-postgres/dist/index.js')).href);
  const port = await new Promise(resolve=>{
    const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{
      const p=socket.address().port;socket.close(()=>resolve(p));
    });
  });
  const artifacts=path.join(root,'.qa-artifacts');
  await fs.mkdir(artifacts,{recursive:true});
  const databaseDir=await fs.mkdtemp(path.join(artifacts,'assignment-pg-'));
  const messages=[];
  const db = new EmbeddedPostgres({databaseDir,port,user:'assignment_test',password:'local_test_only',
    persistent:true,createPostgresUser:false,
    postgresFlags:['-h','127.0.0.1','-c','max_connections=80','-c','fsync=off'],
    onLog:()=>{},onError:m=>messages.push(String(m))});
  let started=false,pool;
  try {
    await db.initialise();await db.start();started=true;
    pool=new Pool({host:'127.0.0.1',port,user:'assignment_test',password:'local_test_only',database:'postgres',max:40});
    await pool.query('create role anon; create role authenticated; create role service_role bypassrls;');
    const sql=await fs.readFile(path.join(root,'supabase_assignment.sql'),'utf8');
    await pool.query(sql);await pool.query(sql);
    const assign=async(pid,study=STUDY,force=null)=>(await pool.query(
      'select public.assign_condition($1,$2,$3) as result',[pid,study,force])).rows[0].result;
    const get=async(pid,study=STUDY)=>(await pool.query(
      'select public.get_condition_assignment($1,$2) as result',[pid,study])).rows[0].result;
    const status=async(pid,value,study=STUDY)=>(await pool.query(
      'select public.set_condition_status($1,$2,$3) as result',[pid,value,study])).rows[0].result;
    const configure=async(study,cellQuota=0,totalQuota=0)=>{
      await pool.query('insert into public.study_assignment_settings(study_id,enrollment_open,cell_quota,total_quota) values($1,true,$2,$3) on conflict(study_id) do update set enrollment_open=true,cell_quota=$2,total_quota=$3',[study,cellQuota,totalQuota]);
      if(study!==STUDY)await pool.query('insert into public.study_cells select $1,cell_id,group_name,congruence,stim_code,enabled from public.study_cells where study_id=$2',[study,STUDY]);
    };
    assert.equal((await assign('CLOSED')).reason,'closed');
    await configure(STUDY);
    const results=await Promise.all(Array.from({length:500},(_,i)=>assign('P'+i)));
    assert.equal(new Set(results.map(r=>r.assignment_id)).size,500);
    assert(results.every(r=>r.found && r.existing===false));
    const counts={};results.forEach(r=>{counts[r.cell.id]=(counts[r.cell.id]||0)+1});
    assert.equal(Object.keys(counts).length,9);
    assert(Math.max(...Object.values(counts))-Math.min(...Object.values(counts))<=1);
    console.log('PASS: 500 requests through 40 concurrent PostgreSQL connections produce 500 unique assignments, 55-56 per condition');

    const duplicates=await Promise.all(Array.from({length:100},()=>assign('SAME_PID')));
    assert.equal(new Set(duplicates.map(r=>r.assignment_id)).size,1);
    assert.equal((await pool.query("select count(*)::int n from public.study_assignments where pid='SAME_PID'")).rows[0].n,1);
    assert.equal((await get('SAME_PID')).cell.id,duplicates[0].cell.id);
    await assert.rejects(()=>assign('invalid@email'),{code:'22023'});
    await assert.rejects(()=>assign('NEW_REAL',STUDY,'AI_100'),{code:'22023'});
    console.log('PASS: 100 retries of one ID retain one condition and one row; invalid IDs/forced participant conditions rejected');

    const test=await assign('TEST_FORCE',STUDY,'MIXED_50');
    assert(test.is_test && test.cell.id==='MIXED_50');
    const afterTest=await assign('AFTER_TEST');
    assert.equal(Object.values(afterTest.counts).reduce((a,b)=>a+b,0),501);
    await status('SAME_PID','returned');await status('SAME_PID','assigned');
    assert.equal((await get('SAME_PID')).status,'returned');
    await status('SAME_PID','complete');await status('SAME_PID','stimulus');
    assert.equal((await get('SAME_PID')).status,'complete');
    await status('SAME_PID','withdrawn');await status('SAME_PID','complete');
    assert.equal((await get('SAME_PID')).status,'withdrawn');
    assert.equal((await status('NOT_ASSIGNED','consented')).found,false);
    await assert.rejects(()=>status('P0','unknown'),{code:'22023'});
    console.log('PASS: test exclusion, ordered status updates, sticky completion/withdrawal and pre-assignment consent');

    await pool.query("update public.study_assignments set updated_at=now()-interval '2 hours' where study_id=$1 and pid='P0'",[STUDY]);
    const expired=await assign('AFTER_EXPIRY');
    assert.equal(Object.values(expired.counts).reduce((a,b)=>a+b,0),500);
    assert.equal((await assign('P0')).assignment_id,results[0].assignment_id);
    await status('P0','returned');
    await pool.query("update public.study_assignments set updated_at=now()-interval '2 hours' where study_id=$1 and pid='P0'",[STUDY]);
    const returned=await assign('AFTER_RETURNED');
    assert.equal(Object.values(returned.counts).reduce((a,b)=>a+b,0),502);
    console.log('PASS: abandoned reservations expire, returned viewers remain counted, reconnects keep their original condition');

    await configure('quota_cells',1);
    const capped=await Promise.all(Array.from({length:100},(_,i)=>assign('CAP'+i,'quota_cells')));
    assert.equal(capped.filter(r=>!r.full).length,9);
    assert.equal(new Set(capped.filter(r=>!r.full).map(r=>r.cell.id)).size,9);
    await configure('quota_total',3,17);
    const total=await Promise.all(Array.from({length:80},(_,i)=>assign('TOTAL'+i,'quota_total')));
    assert.equal(total.filter(r=>!r.full).length,17);
    const existing=total.find(r=>!r.full);
    const pid=(await pool.query('select pid from public.study_assignments where assignment_id=$1',[existing.assignment_id])).rows[0].pid;
    await pool.query("update public.study_assignment_settings set enrollment_open=false where study_id='quota_total'");
    assert.equal((await assign(pid,'quota_total')).assignment_id,existing.assignment_id);
    assert.equal((await assign('FRESH_CLOSED','quota_total')).reason,'closed');
    console.log('PASS: simultaneous requests respect per-cell and total quotas; closed recruitment preserves existing assignments');

    const before=(await pool.query('select count(*)::int n from public.study_assignments')).rows[0].n;
    await pool.query(sql);
    assert.equal((await pool.query('select count(*)::int n from public.study_assignments')).rows[0].n,before);
    assert.equal((await get('SAME_PID')).status,'withdrawn');
    const client=await pool.connect();
    try {
      for(const role of ['anon','authenticated']){
        await client.query('set role '+role);
        await assert.rejects(()=>client.query('select * from public.study_assignments'),{code:'42501'});
        await assert.rejects(()=>client.query("select public.assign_condition('DENIED')"),{code:'42501'});
        await client.query('reset role');
      }
      await client.query('set role service_role');
      const allowed=await client.query("select public.assign_condition('SERVICE_CALL','quota_total') as result");
      assert.equal(allowed.rows[0].result.reason,'closed');
      await client.query('reset role');
    } finally {client.release();}
    console.log('PASS: repeatable migration retains data; only trusted service role can read or assign conditions');
  } catch(e){
    if(messages.length)console.error(messages.slice(-3).join('\n'));
    throw e;
  } finally {
    if(pool)await pool.end();
    if(started)await db.stop();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
