"""Researcher storage test uses real-mode paths with mocked external services.
Recruitment stays closed and invalid/non-test IDs must never reach the API.
"""
import json
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, STUB_CLOCK, advance
from check_participant import fixture


PID = 'TEST_STORAGE_QA'
KEY = 'lsv_livestream-ai-chat-2026_pilot_pid_' + PID


def fill_page(page):
    page.locator('form').evaluate('''form => {
      const names=new Set();
      for(const radio of form.querySelectorAll('input[type=radio]')){
        if(names.has(radio.name))continue;
        names.add(radio.name);radio.checked=true;
        radio.dispatchEvent(new Event('change',{bubbles:true}));
      }
      const boxes=new Set();
      for(const box of form.querySelectorAll('input[type=checkbox]')){
        if(boxes.has(box.name))continue;
        boxes.add(box.name);box.checked=true;
        box.dispatchEvent(new Event('change',{bubbles:true}));
      }
      for(const el of form.querySelectorAll('textarea'))el.value='Researcher storage test answer.';
      for(const el of form.querySelectorAll('input.num'))el.value='1990';
      for(const el of form.querySelectorAll('select'))el.value=[...el.options].find(o=>o.value).value;
    }''')


def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_PATH'))
        for pid in ['', 'REAL_PARTICIPANT', 'TEST_', 'TEST_bad.dot', 'TEST_'+'a'*60]:
            ctx,page,control,errors=fixture(browser,base,configured=False)
            page.goto(base+'/survey/?pilot=1&participantId='+pid)
            page.get_by_text('Invalid storage-test link',exact=True).wait_for()
            assert not control['requests'] and not errors
            ctx.close()
        for missing in ['api','t1','origin']:
            ctx,page,control,errors=fixture(browser,base,configured=False,missing=missing)
            page.goto(base+'/survey/?pilot=1&participantId='+PID)
            page.get_by_text('Study unavailable',exact=True).wait_for()
            assert not control['requests'] and not errors
            ctx.close()
        print('PASS: storage-test access requires an explicit TEST_ ID, HTTPS API, T1 and same-origin embedding')

        ctx,page,control,errors=fixture(browser,base,configured=False)
        outgoing=[];page.on('request',lambda req:outgoing.append(req.url))
        page.goto(base+'/survey/?pilot=1&participantId='+PID)
        page.get_by_role('heading',name='Researcher storage test').wait_for()
        assert page.evaluate('SURVEY_CONFIG.PARTICIPANT_OPEN') is False
        assert '[XXXX]' not in page.locator('#app').inner_text()
        assert page.locator('#pilotNotice').is_visible()
        page.evaluate('SURVEY_CONFIG.INTRO_MIN_SECONDS=0.03')
        page.locator('#agree').check();page.locator('#next').click()
        page.locator('#enter').click(timeout=8000)
        child=page.locator('#stimWrap iframe').element_handle().content_frame()
        child.locator('#watch.on').wait_for()
        assert child.evaluate('cond.panel_id')==PID
        assert child.evaluate('cond.preview') is False
        assert child.locator('#previewBar').count()==0
        assert page.locator('#pilotNotice').is_visible()
        child.evaluate(STUB_CLOCK)
        advance(child,141.55)
        child.locator('#pollOpts button[data-v=B]').click()
        child.locator('input[name=confidence][value="6"]').check()
        child.locator('#voteSubmit').click()
        advance(child,244.77);child.locator('#leave').click()
        page.wait_for_function("!document.getElementById('stimWrap')")
        for _ in range(30):
            if page.locator('#fin').count():break
            if page.locator('form').count():fill_page(page)
            page.locator('#next').click()
        page.locator('#fin').wait_for()
        saved=page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
        assert saved['stage']=='debrief'
        assert saved['meta']['t1_vote']=='B' and saved['meta']['t1_conf']==6
        assert saved['meta']['stim_session_id']
        assert saved['answers']['mc_author']=='1'
        assert saved['answers']['t1_t2_comparable']==1
        assert saved['answers']['t1_t2_vote_changed']==1
        # Even future completion settings must not escape the test path.
        page.evaluate("SURVEY_CONFIG.REDIRECTS.complete='https://connect.cloudresearch.com/QA';SURVEY_CONFIG.COMPLETION_CODE='DO_NOT_SHOW'")
        control['save_fail']=True
        page.locator('input[name=wd][value=keep]').check();page.locator('#fin').click()
        page.locator('#saveRetry').wait_for(timeout=10000)
        assert not page.get_by_role('heading',name='Storage test saved').count()
        control['save_fail']=False;page.locator('#saveRetry').click()
        page.get_by_role('heading',name='Storage test saved').wait_for()
        assert PID in page.locator('#app').inner_text()
        assert 'DO_NOT_SHOW' not in page.locator('#app').inner_text()
        assert all(r['pid']==PID for r in control['requests'])
        saves=[r['data'] for r in control['requests'] if r['action']=='save']
        assert saves and all(r['is_test']==1 and r['storage_test']==1 for r in saves)
        assert any(r.get('status')=='complete' for r in saves)
        assert not any('connect.cloudresearch.com' in url for url in outgoing)
        assert page.evaluate('sessionStorage.getItem("lsv_livestream-ai-chat-2026_last_pid")') is None
        before=len(control['requests'])
        page.goto(base+'/survey/?participantId=REAL_PARTICIPANT')
        page.get_by_text('Study unavailable',exact=True).wait_for()
        assert len(control['requests'])==before and not errors,errors
        ctx.close();browser.close()
        print('PASS: closed-recruitment test completes consent, server assignment, stream/T1, all survey pages and acknowledged saving; test flags, storage isolation and no Connect completion verified')
    server.shutdown()


if __name__=='__main__':main()
