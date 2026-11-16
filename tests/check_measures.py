"""Measurement semantics: visible playback, exposure cells, voluntary choices,
and T1/T2 missingness. External services and media are mocked throughout.
"""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, prepare, advance
from check_participant import fixture, state, start, stored


CONTROL_CLOCK = """() => {
  window.qaWall = 1000; window.qaHidden = false;
  Object.defineProperty(performance, 'now', {value:()=>qaWall, configurable:true});
  Object.defineProperty(document, 'visibilityState', {
    get:()=>qaHidden ? 'hidden' : 'visible', configurable:true});
  Object.defineProperty(document, 'hidden', {get:()=>qaHidden, configurable:true});
  window.setHidden = value => {
    qaHidden=value;
    document.dispatchEvent(new Event('visibilitychange', {bubbles:true}));
  };
  Object.assign(behaviorTime, {at:null,active:false,visible:false,playing:false,
    after:false,postpoll:false,watch:0,hidden:0,postchat:0,postend:0});
  syncBehaviorTime(true);
}"""


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_PATH'))
        page, errors = prepare(browser, base)
        page.evaluate(CONTROL_CLOCK)
        page.evaluate('qaWall+=2000;setHidden(true);qaWall+=3000')
        page.evaluate("document.getElementById('streamVideo').dispatchEvent(new Event('waiting'))")
        page.evaluate('qaWall+=4000;setHidden(false);qaWall+=1000')
        page.evaluate("document.getElementById('streamVideo').dispatchEvent(new Event('playing'))")
        advance(page,141.55)
        page.locator('#pollOpts button[data-v=B]').click()
        page.locator('input[name=confidence][value="6"]').check()
        page.locator('#voteSubmit').click()
        advance(page,205.45)
        page.evaluate("qaWall+=1500;document.getElementById('streamVideo').dispatchEvent(new Event('waiting'));qaWall+=1000")
        page.evaluate("document.getElementById('streamVideo').dispatchEvent(new Event('playing'));qaWall+=500")
        advance(page,244.77)
        values=page.evaluate('leaveSummary("qa")')
        assert values['visible_watch_sec']==4,values
        assert values['hidden_playback_sec']==3,values
        assert values['visible_postpoll_sec']==2,values
        assert values['visible_after_end_sec']==0
        assert values['next_video_selected'] is False
        assert values['first_next_video_latency_ms'] is None
        page.evaluate('qaWall+=250;setHidden(true);qaWall+=2000;setHidden(false);qaWall+=750')
        page.locator('.ec-item').nth(1).click()
        page.evaluate('qaWall+=200')
        page.locator('.ec-item').nth(2).click()
        page.locator('.ec-item').nth(1).click()
        values=page.evaluate('leaveSummary("qa")')
        assert values['visible_after_end_sec']==1.2,values
        assert values['next_video_selected'] is True and values['next_video_clicks']==3
        assert values['first_next_video_index']==1
        assert values['first_next_video_latency_ms']==3000
        assert values['first_next_video_visible_latency_ms']==1000
        assert page.evaluate('Logger.ev.filter(e=>e.type==="next_video_click" && e.first).length')==1
        page.locator('#leave').click()
        page.evaluate('qaWall+=10000')
        assert page.evaluate('leaveSummary("qa").visible_after_end_sec')==1.2
        assert not errors,errors
        page.close()
        print('PASS: visible playback excludes hidden/buffering time, post-poll and post-end windows differ, repeated clicks retain the first voluntary choice, final clocks stop')

        page, errors = prepare(browser,base)
        page.evaluate(CONTROL_CLOCK)
        page.evaluate('''() => {
          msgObserver.disconnect();ovObserver.disconnect();seen.msgs.length=0;
          PS[0].vote='B';PS[0].voteLocked=true;
          const rec=(kind,stance)=>({kind,stance,poll:0,ms:0,start:null,
            since:false,sinceO:false,el:document.body,ov:document.body});
          window.aiC=rec('ai','B');window.aiI=rec('ai','A');
          window.hC=rec('human','B');window.hI=rec('human','A');
          seen.msgs.push(aiC,aiI,hC,hI);
          seenOn(aiC,'since');seenOn(aiC,'sinceO');seenOn(hI,'since');
          qaWall+=800;
        }''')
        assert page.evaluate('seenSummary().lines_seen')==0
        page.evaluate('setHidden(true);qaWall+=5000;seenOn(aiI,"since")')
        assert page.evaluate('aiI.start') is None
        page.evaluate('setHidden(false);qaWall+=200')
        assert page.evaluate('seenSummary().lines_seen')==2
        page.evaluate('qaWall+=800')
        summary=page.evaluate('seenSummary()')
        assert summary['lines_seen']==3 and summary['visible_ms_total']==4600,summary
        assert summary['seen_by_identity']=={
            'ai':{'congruent':1,'incongruent':1,'congruent_ms':1800,'incongruent_ms':1000},
            'human':{'congruent':0,'incongruent':1,'congruent_ms':0,'incongruent_ms':1800}},summary
        assert summary['seen_congruent']==1 and summary['seen_incongruent']==2
        page.evaluate('PS[0].voteLocked=false;PS[0].vote=null')
        summary=page.evaluate('seenSummary()')
        assert summary['seen_by_identity'] is None and summary['seen_incongruent'] is None
        assert summary['lines_seen']==3
        page.evaluate('msgObserver=null')
        summary=page.evaluate('seenSummary()')
        assert summary['seen_supported'] is False and summary['lines_seen'] is None
        assert summary['visible_ms_total'] is None
        assert not errors,errors
        page.close()
        print('PASS: cumulative 1-second exposure, AI/human x stance cells, two-surface deduplication, background arrivals, missing votes and unsupported observation')

        for submitted, choice, confidence, changed, delta in [
            (1,'A',4,1,-2), (1,'B',6,0,0), (0,'A',4,'','')
        ]:
            initial=state('post',1)
            initial['meta'].update(t1_vote='B',t1_conf=6,t1_submitted=submitted)
            ctx,page,control,errors=fixture(browser,base,initial)
            start(page,base)
            page.locator(f'input[name=t2_vote][value={choice}]').check()
            page.locator(f'input[name=t2_conf][value="{confidence}"]').check()
            page.locator('#next').click()
            page.wait_for_function("JSON.parse(localStorage.getItem('lsv_livestream-ai-chat-2026_pid_QA_PARTICIPANT')).answers.t1_t2_comparable !== undefined")
            answers=stored(page)['answers']
            assert answers['t1_t2_comparable']==submitted
            assert answers['t1_t2_vote_changed']==changed
            assert answers['t1_t2_conf_delta']==delta
            assert not errors,errors
            ctx.close()
        initial=state('post',10)
        ctx,page,control,errors=fixture(browser,base,initial)
        start(page,base)
        assert page.locator('input[name=mc_author]').count()==4
        page.get_by_text('Both humans and AI',exact=True).wait_for()
        page.locator('input[name=mc_author][value="3"]').check()
        page.locator('input[name=mc_match][value="2"]').check()
        page.locator('#next').click()
        assert stored(page)['answers']['mc_author']=='3'
        assert not errors,errors
        ctx.close()
        browser.close()
        print('PASS: T1/T2 change and signed confidence delta save with missingness intact; mixed-condition manipulation check has a valid answer')
    server.shutdown()


if __name__=='__main__':main()
