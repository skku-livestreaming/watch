/* Real PostgreSQL RLS regression in an isolated in-memory PGlite database.
 * Install @electric-sql/pglite outside the application, then set PGLITE_MODULE
 * to its module directory if it is not on Node's normal module search path.
 * No Supabase connection, credentials, or participant data are used.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sinkSource = html.slice(html.indexOf('const Sink = (function(){'), html.indexOf('\nconst Logger = {'));

function makeSink(db, loseSessionAck = false){
  const storage = new Map();
  const calls = [];
  const context = {
    SUPABASE_URL:'https://local-test.invalid', SUPABASE_KEY:'test-public-key',
    navigator:{webdriver:false}, cond:{preview:false}, crypto:webcrypto,
    TextEncoder, AbortController, setTimeout, clearTimeout, Intl,
    screen:{width:1440,height:1000}, innerWidth:1440, innerHeight:1000,
    refreshDoneSaveState(){},
    localStorage:{getItem:k=>storage.get(k) ?? null, setItem:(k,v)=>storage.set(k,String(v))},
    async fetch(url, options){
      const request = new URL(url);
      const table = request.pathname.split('/').pop();
      assert.ok(['sessions','events'].includes(table));
      const payload = JSON.parse(options.body);
      calls.push({table,query:request.search,prefer:options.headers.Prefer});
      try {
        await db.exec('BEGIN');
        for (const row of Array.isArray(payload) ? payload : [payload]){
          const columns = Object.keys(row);
          const values = Object.values(row).map(v=>v && typeof v==='object' ? JSON.stringify(v) : v);
          let sql = `INSERT INTO ${table} (${columns.map(c=>'"'+c+'"').join(',')}) VALUES (`+
            columns.map((_,i)=>'$'+(i+1)).join(',')+')';
          // Model the original PostgREST request too: this is the regression trigger.
          if (options.headers.Prefer.includes('resolution=ignore-duplicates')){
            assert.equal(request.searchParams.get('on_conflict'),'id');
            sql += ' ON CONFLICT(id) DO NOTHING';
          }
          await db.query(sql,values);
        }
        await db.exec('COMMIT');
      } catch(error){
        await db.exec('ROLLBACK');
        return {ok:false,status:error.code==='23505' ? 409 : 401,
          json:async()=>({code:error.code,message:error.message,hint:error.hint})};
      }
      if (table==='sessions' && loseSessionAck){
        loseSessionAck=false;
        throw new TypeError('response lost after the database committed');
      }
      return {ok:true,status:201};
    }
  };
  vm.runInNewContext(sinkSource+'\nglobalThis.sink=Sink;',context);
  return {sink:context.sink,calls};
}

async function main(){
  const db = new PGlite();
  try {
    await db.exec('CREATE ROLE anon;');
    await db.exec(fs.readFileSync(path.join(root,'supabase_setup.sql'),'utf8'));
    // Model an existing Supabase project with table grants and INSERT-only RLS.
    await db.exec(`GRANT USAGE ON SCHEMA public TO anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON sessions,events TO anon;
      GRANT USAGE,SELECT ON SEQUENCE events_id_seq TO anon;`);
    const audit = await db.exec(fs.readFileSync(path.join(root,'supabase_storage_audit.sql'),'utf8'));
    assert.equal(audit[0].rows.length,2);
    assert.ok(audit[0].rows.every(row=>row.rls_enabled && row.anon_table_insert));
    assert.equal(audit[1].rows.length,2);
    console.log('PASS: storage audit queries inspect metadata successfully');

    await db.exec('SET ROLE anon;');
    await assert.rejects(db.query(`INSERT INTO sessions(id,pid)
      VALUES('00000000-0000-4000-8000-000000000001','TEST_RLS') ON CONFLICT(id) DO NOTHING`),
      error=>error.code==='42501' && error.message.includes('row-level security'));
    console.log('PASS: original targeted upsert fails despite a valid anonymous INSERT policy');

    for (const loseAck of [false,true]){
      const {sink,calls} = makeSink(db,loseAck);
      await sink.open('TEST_RLS',{preview:false});
      assert.equal(sink.status().session_pending,loseAck ? 1 : 0);
      sink.push({type:'leave',t:1});
      await sink.flush(true);
      assert.equal(sink.status().session_pending,0);
      assert.ok(calls.every(c=>!c.query && c.prefer==='return=minimal'));
      assert.deepEqual((await db.query('SELECT * FROM sessions')).rows,[]);
      assert.deepEqual((await db.query('SELECT * FROM events')).rows,[]);
      await db.exec('RESET ROLE;');
      const counts = await db.query(`SELECT
        (SELECT count(*)::int FROM sessions WHERE id=$1) AS sessions,
        (SELECT count(*)::int FROM events WHERE session_id=$1 AND type='leave') AS events`,[sink.id()]);
      assert.deepEqual(counts.rows,[{sessions:1,events:1}]);
      await db.exec('SET ROLE anon;');
      console.log('PASS: INSERT-only RLS saves session and leave exactly once; lost acknowledgment =',loseAck);
    }

    await db.exec('RESET ROLE; DROP POLICY "anon insert sessions" ON sessions; SET ROLE anon;');
    const {sink} = makeSink(db);
    await sink.open('TEST_DENIED',{preview:false});
    assert.ok(sink.status().session_pending>0);
    assert.match(sink.status().last_error,/42501.*row-level security/);
    console.log('PASS: a genuinely missing INSERT policy remains a failure with the record queued');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
