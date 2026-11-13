"""Participant deployment failures, recovery, and researcher isolation.
All API and media requests are mocked; no research data leaves this test.
"""
import json
import os
import re
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, STUB_CLOCK, advance

PID = 'QA_PARTICIPANT'
KEY = 'lsv_livestream-ai-chat-2026_pid_' + PID
CELL = {'id':'MIXED_50','group':'mixed','cong':'half','code':'t8'}
ASSIGNMENT_ID = '00000000-0000-4000-8000-000000000001'


def state(stage='consent', page=0):
    return {'pid':PID,'stage':stage,'page':page,'cell':CELL if stage != 'consent' else None,
            'meta':{'is_test':0,'assignment_id':ASSIGNMENT_ID},'answers':{},'pending':{},'att':0}


def fixture(browser, base, initial=None, configured=True, randomized=False, missing=None):
    context = browser.new_context(viewport={'width':1440,'height':1000})
    page = context.new_page()
    control = {'save_fail':False,'assign_fail':False,'frame_fail':False,'requests':[],
               'get_fail':False,'get_assignment':ASSIGNMENT_ID,'get_status':'assigned','assign_status':'assigned'}
    errors = []
    page.on('pageerror', lambda e:errors.append(str(e)))
    config = (ROOT / 'survey/config.js').read_text(encoding='utf-8')
    if configured:
        config, replacements = re.subn(r"API_URL:\s*'[^']*'", "API_URL: 'https://script.google.com/macros/s/QA/exec'", config, count=1)
        assert replacements == 1, 'API fixture must replace the configured endpoint'
        config = config.replace('PARTICIPANT_OPEN: false', 'PARTICIPANT_OPEN: true')
        config = config.replace("COMPLETION_CODE: ''", "COMPLETION_CODE: 'QA_COMPLETE'")
        config = config.replace("STIMULUS_EXTRA: {intro: 'off'}", "STIMULUS_EXTRA: {intro:'off',preview:'1',label:'human',ratio:'0'}")
        for token in ['[N]','[Amount]','[XXXX]','[Researcher name]','[email]']:
            config = config.replace(token,'QA')
    if randomized:
        config = config.replace("id: 'shared', required: true", "id: 'shared', required: true, randomize: true")
    if missing=='api':config=config.replace("API_URL: 'https://script.google.com/macros/s/QA/exec'", "API_URL: ''")
    if missing=='completion':config=config.replace("COMPLETION_CODE: 'QA_COMPLETE'", "COMPLETION_CODE: ''")
    if missing=='consent':config=config.replace('Research Consent','[XXXX] Research Consent')
    if missing=='t1':config=config.replace('READ_T1: true','READ_T1: false')
    if missing=='origin':config=config.replace("STIMULUS_URL: new URL('../', window.location.href).href.split('?')[0]", "STIMULUS_URL: 'https://example.com/'")
    def route(r):
        url = r.request.url
        if url.split('?')[0].endswith('/survey/config.js'):
            return r.fulfill(status=200,content_type='text/javascript',body=config)
        if url.startswith('https://script.google.com/'):
            req = json.loads(r.request.post_data)
            control['requests'].append(req)
            if req['action']=='get':
                if control['get_fail']: return r.fulfill(status=503,body='unavailable')
                return r.fulfill(json={'ok':True,'found':True,'cell':CELL,
                                      'assignment_id':control['get_assignment'],'status':control['get_status']})
            if req['action']=='assign':
                if control['assign_fail']: return r.fulfill(status=503,body='unavailable')
                return r.fulfill(json={'ok':True,'found':True,'cell':CELL,'assignment_id':ASSIGNMENT_ID,'status':control['assign_status']})
            if control['save_fail']: return r.fulfill(status=503,body='unavailable')
            return r.fulfill(json={'ok':True})
        if url.startswith(base + '/?') and control['frame_fail']:
            return r.fulfill(status=404,content_type='text/html',body='Not found')
        if url.endswith('/stream.mp4'): return r.fulfill(status=204)
        if url.startswith(base): return r.continue_()
        r.abort()
    context.route('**/*', route)
    if initial:
        context.add_init_script("if(!localStorage.getItem("+json.dumps(KEY)+"))localStorage.setItem("+
                                json.dumps(KEY)+","+json.dumps(json.dumps(initial))+");")
    return context, page, control, errors


def start(page, base):
    page.goto(base + '/survey/?participantId=' + PID)


def stored(page):
    return page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)


def stream(page, base):
    start(page,base)
    page.locator('#back').click()
    element = page.locator('#stimWrap iframe').element_handle()
    child = element.content_frame()
    child.locator('#watch.on').wait_for()
    child.evaluate(STUB_CLOCK)
    return child


def main():
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_PATH'))
        ctx,p,c,errors = fixture(browser,base,configured=False)
        start(p,base)
        assert 'Study unavailable' in p.locator('body').inner_text()
        assert not c['requests'] and p.locator('iframe').count()==0
        p.goto(base+'/survey/?admin=1')
        assert p.locator('#adm').is_visible()
        p.locator('#admCell').select_option('MIXED_50')
        p.locator('#admScreen').select_option('post:1')
        assert p.locator('input[type=radio]').count()>0
        assert not c['requests'] and not errors,errors
        ctx.close()
        print('PASS: closed participant deployment, researcher screens and condition controls still available')
        for missing in ['api','completion','consent','t1','origin']:
            ctx,p,c,errors=fixture(browser,base,missing=missing)
            start(p,base)
            assert 'Study unavailable' in p.locator('body').inner_text(),missing
            assert not c['requests'] and not errors,(missing,errors)
            ctx.close()
        print('PASS: opening recruitment still requires API, completion, consent, T1 and same-origin setup')
        broken=state('post');broken['page']=-1
        ctx,p,c,errors=fixture(browser,base,broken)
        start(p,base);p.locator('#agree').wait_for()
        assert not errors,errors
        ctx.close()
        print('PASS: corrupt cached participant progress recovers without a script error')
        ctx,p,c,errors=fixture(browser,base,state('post',1))
        c['get_fail']=True;start(p,base)
        p.locator('#resumeRetry').wait_for()
        assert not any(r['action']=='assign' for r in c['requests'])
        c['get_fail']=False;p.locator('#resumeRetry').click()
        p.locator('form').wait_for()
        assert stored(p)['meta']['assignment_id']==ASSIGNMENT_ID and not errors,errors
        ctx.close()
        ctx,p,c,errors=fixture(browser,base,state('post',1))
        c['get_assignment']='00000000-0000-4000-8000-000000000002';start(p,base)
        p.get_by_text('Session not found',exact=True).wait_for()
        assert not any(r['action']=='assign' for r in c['requests']) and not errors,errors
        ctx.close()
        ctx,p,c,errors=fixture(browser,base,state('post',1))
        c['get_status']='withdrawn';start(p,base)
        p.get_by_text('Your data withdrawal has been recorded. Enter this completion code on CloudResearch.',exact=True).wait_for()
        assert stored(p)['stage']=='done' and stored(p)['answers']=={} and not errors,errors
        ctx.close()
        print('PASS: server assignment recovery, mismatch rejection and withdrawn status prevent silent reassignment')
        initial=state('assign');initial['cell']=None
        ctx,p,c,errors=fixture(browser,base,initial)
        c['assign_status']='complete';start(p,base)
        p.locator('#code').wait_for()
        assert stored(p)['cell']==CELL and stored(p)['meta']['assignment_id']==ASSIGNMENT_ID
        c['get_status']='complete';p.reload();p.locator('#code').wait_for()
        assert not errors,errors
        ctx.close()
        print('PASS: already-completed server assignment retains its identity across a fresh browser resume')

        ctx,p,c,errors = fixture(browser,base)
        p.goto(base+'/survey/?debug=1&participantId='+PID)
        p.locator('#agree').check();p.locator('#next').click()
        p.wait_for_timeout(100)
        assert not c['requests']
        assert p.evaluate("!!localStorage.getItem('lsv_livestream-ai-chat-2026_debug')")
        start(p,base)
        assert p.locator('#agree').is_visible() and p.locator('#dbg').is_hidden()
        p.locator('#agree').check();p.locator('#next').click()
        p.locator('#ir1').wait_for()
        assert any(r['action']=='assign' for r in c['requests'])
        assert all(not r.get('data',{}).get('is_test') for r in c['requests'])
        assert not errors,errors
        ctx.close()
        print('PASS: debug preview never writes and cannot overwrite participant progress')

        initial=state('assign');initial['cell']=None
        ctx,p,c,errors = fixture(browser,base,initial)
        c['assign_fail']=True
        start(p,base)
        p.locator('#assignRetry').wait_for(timeout=20000)
        assert stored(p)['cell'] is None
        assert not p.locator('#ir1').count()
        c['assign_fail']=False;p.locator('#assignRetry').click()
        p.locator('#ir1').wait_for()
        assert stored(p)['cell']==CELL and not errors,errors
        ctx.close()
        print('PASS: assignment failure cannot silently choose a random participant condition')

        ctx,p,c,errors = fixture(browser,base,state('debrief'))
        c['save_fail']=True
        start(p,base);p.locator('input[name=wd][value=keep]').check();p.locator('#fin').click()
        p.locator('#saveRetry').wait_for(timeout=18000)
        assert p.locator('#code').count()==0 and stored(p)['pending']['status']=='complete'
        p.reload();p.locator('#saveRetry').wait_for(timeout=18000)
        c['save_fail']=False;p.locator('#saveRetry').click()
        assert p.locator('#code').inner_text()=='QA_COMPLETE'
        assert stored(p)['pending']=={} and not errors,errors
        ctx.close()
        print('PASS: final save failure/reload retains responses, hides completion, and recovers after acknowledgment')

        ctx,p,c,errors = fixture(browser,base,state('post',1),randomized=True)
        start(p,base)
        random_page=p.evaluate('SURVEY_CONFIG.PAGES.post.findIndex(p=>p.blocks?.some(b=>b.randomize))')
        assert random_page>=0
        p.evaluate('([key,i])=>{const s=JSON.parse(localStorage.getItem(key));s.page=i;localStorage.setItem(key,JSON.stringify(s))}',[KEY,random_page])
        p.reload()
        groups=p.locator('input[type=radio]').evaluate_all('els=>[...new Set(els.map(e=>e.name))]')
        for name in groups:p.locator('input[name="'+name+'"]').last.check()
        before=p.locator('form').inner_text()
        selected=p.locator('input:checked').evaluate_all('els=>els.map(e=>[e.name,e.value])')
        p.reload()
        assert p.locator('form').inner_text()==before
        assert p.locator('input:checked').evaluate_all('els=>els.map(e=>[e.name,e.value])')==selected
        assert not errors,errors
        ctx.close()
        print('PASS: page drafts and randomized item order survive participant reload')

        ctx,p,c,errors = fixture(browser,base,state())
        start(p,base);p.locator('#agree').wait_for()
        second=ctx.new_page();start(second,base)
        second.get_by_text('Study already open',exact=True).wait_for()
        assert not c['requests']
        p.close();second.reload();second.locator('#agree').wait_for()
        assert not errors,errors
        ctx.close()
        print('PASS: duplicate participant tabs are blocked; closing the first tab permits resume')

        ctx,p,c,errors = fixture(browser,base,state('stimulus'))
        c['frame_fail']=True;start(p,base);p.locator('#back').click()
        p.locator('#stimError').wait_for(state='visible')
        assert stored(p)['stage']=='stimulus' and p.locator('#stimFallback').is_hidden()
        c['frame_fail']=False;p.locator('#stimReload').click()
        child=p.locator('#stimWrap iframe').element_handle().content_frame()
        child.locator('#watch.on').wait_for()
        assert child.locator('#previewBar').count()==0 and not child.locator('#intro').is_visible()
        assert child.evaluate("cond.label==='mixed' && cond.ratio===50 && !cond.preview")
        assert child.evaluate('cond.assignment_id')==ASSIGNMENT_ID
        assert not errors,errors
        ctx.close()
        print('PASS: missing iframe can be retried, cannot bypass the stream, and participant parameters stay locked')

        ctx,p,c,errors = fixture(browser,base,state('stimulus'))
        child=stream(p,base)
        advance(child,141.55);child.locator('#pollOpts button[data-v=B]').click()
        child.locator('input[name=confidence][value="6"]').check();child.locator('#voteSubmit').click()
        child.evaluate('''async()=>{
          await Sink.flush(false);
          Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
          window.fetch=async()=>({ok:false,status:503});
          await Sink.open('QA_PARTICIPANT',cond);
        }''')
        advance(child,244.77);child.locator('#leave').click()
        p.locator('#stimSaveRetry').wait_for(timeout=10000)
        assert stored(p)['stage']=='stimulus'
        assert child.evaluate("JSON.parse(localStorage.getItem('stim_retry_q')).length>0")
        child.evaluate('window.fetch=async()=>({ok:true})')
        p.locator('#stimSaveRetry').click()
        p.wait_for_function("!document.getElementById('stimWrap')")
        s=stored(p)
        assert s['stage']=='post' and s['meta']['t1_conf']==6 and s['meta']['t1_vote']=='B'
        assert s['meta']['stim_session_id'] and s['meta']['stim_code_seen']=='t8'
        assert not errors,errors
        ctx.close()
        print('PASS: stream logs stay journaled on failure and questionnaire waits for a successful retry')

        ctx,p,c,errors = fixture(browser,base,state('stimulus'))
        child=stream(p,base)
        child.evaluate('''async()=>{
          videoFails=0;failedAttempt=-1;
          Object.defineProperty(document.getElementById('streamVideo'),'error',{get:()=>({code:4}),configurable:true});
          document.getElementById('streamVideo').play=()=>Promise.reject(new Error('unsupported'));
          for(let i=0;i<3;i++){playVideo();await new Promise(r=>setTimeout(r,0));}
        }''')
        child.locator('#videoOut').click()
        p.wait_for_function("!document.getElementById('stimWrap')")
        assert stored(p)['stage']=='end' and stored(p)['meta']['end_reason']=='technical'
        assert not p.locator('#code').count()
        assert not errors,errors
        ctx.close()
        print('PASS: repeated video failure exits as a technical failure without pretending the study was completed')
        browser.close()
    server.shutdown()


if __name__=='__main__':main()
