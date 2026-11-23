// Exercise the actual browser save loop without a browser or external services.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('survey/index.html','utf8');
const saveLoop = source.slice(source.indexOf('let flushing ='),source.indexOf('const flushWithin ='));
const terminal = source.slice(source.indexOf('function applyTerminalStatus('),source.indexOf('\nfunction start('));
async function check(status, expectedStage, expectedPending, withdraw, mobile=true) {
  const context = vm.createContext({
    S:{pid:'TEST_COMPLETION',stage:'done',meta:{},answers:{answer:6},pending:{status:'complete'}},
    C:{API_URL:'https://example.invalid'}, DEBUG:false,
    navigator:{userAgent:mobile ? 'Android' : 'Desktop',maxTouchPoints:0},screen:{width:1920,height:1080},
    api:async()=>({ok:true,status}),store:{set(){}},net(){},render(){},
    setTimeout(){return 1;},clearTimeout(){},console:{warn(){}},T:{errorSave:'save failed'},
  });
  vm.runInContext(terminal + '\n' + saveLoop,context);
  const saved = await vm.runInContext('flush()',context);
  assert.equal(context.S.stage,expectedStage);
  assert.equal(Object.keys(context.S.pending).length,expectedPending);
  assert.equal(saved,expectedPending===0);
  if (withdraw) assert.equal(context.S.meta.withdraw,'yes');
  if (status==='mobile' && mobile) assert.equal(context.S.meta.end_reason,'mobile');
}
(async()=>{
  await check('complete','done',0);
  await check(undefined,'done',1);
  await check('returned','done',1);
  await check('mobile','end',0);
  await check('mobile','done',1,false,false);
  await check('withdrawn','done',0,true);
  console.log('PASS: final saving requires confirmed completion; terminal and withdrawn server states are respected');
})().catch(error=>{console.error(error);process.exitCode=1;});
