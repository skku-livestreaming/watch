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
from check_participant import fixture, nickname


PID = 'TEST_STORAGE_QA'
KEY = 'lsv_livestream-ai-chat-2026_pilot_pid_' + PID


def enter_stream(page, base):
    page.goto(base+'/survey/?pilot=1&participantId='+PID)
    page.get_by_role('heading',name='Researcher storage test',exact=True).wait_for()
    page.evaluate('SURVEY_CONFIG.INTRO_MIN_SECONDS=0.03')
    page.locator('#agree').check();page.locator('#next').click()
    page.get_by_role('heading',name='Before the live stream',exact=True).wait_for()
    page.locator('#next').click()
    assert page.get_by_role('heading',name='Before the live stream',exact=True).is_visible()
    page.locator('input[name=notice_ack][value="1"]').check()
    page.locator('#next').click()
    nickname(page)
    page.locator('#enter').click(timeout=8000)
    child=page.locator('#stimWrap iframe').element_handle().content_frame()
    child.locator('#watch.on').wait_for()
    return child


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
        const group=box.closest('[role=group]');
        if(boxes.has(group))continue;
        boxes.add(group);box.checked=true;
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
        child=enter_stream(page,base)
        assert page.evaluate('SURVEY_CONFIG.PARTICIPANT_OPEN') is False
        assert '[XXXX]' not in page.locator('#app').inner_text()
        assert page.locator('#pilotNotice').is_visible()
        assert child.evaluate('cond.panel_id')==PID
        assert child.evaluate('cond.preview') is False
        assert child.locator('#previewBar').count()==0
        assert page.locator('#pilotNotice').is_visible()
        child.evaluate(STUB_CLOCK)
        advance(child,177.03)
        child.locator('#pollOpts button[data-v=B]').click()
        child.locator('input[name=confidence][value="6"]').check()
        child.locator('#voteSubmit').click()
        advance(child,244.77);child.locator('#leave').click()
        page.wait_for_function("!document.getElementById('stimWrap')")
        for _ in range(30):
            if page.locator('#fin').count():break
            before=page.evaluate('(k)=>{const s=JSON.parse(localStorage.getItem(k));return [s.stage,s.page]}',KEY)
            if page.locator('form').count():fill_page(page)
            page.locator('#next').click()
            after=page.evaluate('(k)=>{const s=JSON.parse(localStorage.getItem(k));return [s.stage,s.page]}',KEY)
            assert after!=before, page.locator('#app').inner_text()
        page.locator('#fin').wait_for()
        saved=page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
        assert saved['stage']=='debrief'
        assert saved['meta']['t1_vote']=='B' and saved['meta']['t1_conf']==6
        assert saved['meta']['stim_session_id']
        assert saved['answers']['mc_comp']=='1'
        assert saved['answers']['notice_ack']=='1'
        assert not any(k.startswith('scr_online') for source in [saved['meta'],saved['answers']] for k in source)
        assert saved['answers']['nickname']=='QAUser'
        assert saved['answers']['op_conf']==1
        assert saved['answers']['t1_t2_conf_delta']==''
        assert 't2_conf' not in saved['answers']
        assert saved['answers']['sp_1']==1 and saved['answers']['sr_5']==1
        assert saved['answers']['op_why']=='Researcher storage test answer.'
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
        ctx.close()
        print('PASS: closed-recruitment test completes consent, server assignment, stream/T1, all survey pages and acknowledged saving; test flags, storage isolation and no Connect completion verified')

        ctx,page,control,errors=fixture(browser,base,configured=False)
        child=enter_stream(page,base)
        child.evaluate(STUB_CLOCK)
        advance(child,421.8)
        child.locator('#leave').click()
        page.wait_for_function("!document.getElementById('stimWrap')")
        page.wait_for_function('''key => {
          const s=JSON.parse(localStorage.getItem(key));
          return s.stage==='end' && s.meta.end_reason==='novote' &&
            Object.keys(s.pending).length===0;
        }''',arg=KEY)
        saved=page.evaluate('(k)=>JSON.parse(localStorage.getItem(k))',KEY)
        assert saved['meta']['t1_read']==1 and saved['meta']['t1_submitted']==0
        assert 'op_conf' not in saved['answers'] and not page.locator('form').count()
        saves=[r['data'] for r in control['requests'] if r['action']=='save']
        assert any(r.get('status')=='attention_fail' and r.get('end_reason')=='novote' for r in saves)
        assert not any(r.get('status') in ['returned','complete'] for r in saves)
        assert all(r['pid']==PID for r in control['requests'])
        assert not errors,errors
        ctx.close();browser.close()
        print('PASS: no vote skips the questionnaire and saves attention_fail with end_reason=novote')
    server.shutdown()


if __name__=='__main__':main()
