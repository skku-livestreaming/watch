"""Requested chat/layout changes and complete embedded-survey handoff.
Uses the same external-request blocking as check_stimulus.py.
"""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, prepare, advance, STUB_CLOCK


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    artifacts = ROOT / '.qa-artifacts'
    artifacts.mkdir(exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_PATH'))
        for code in ['q7','m2','z5','b9','k3','r6','v3','t8','f1']:
            page, errors = prepare(browser, base, code)
            advance(page, 141.55)
            page.locator('#pollOpts button[data-v="B"]').click()
            page.locator('input[name=confidence][value="6"]').check()
            page.locator('#voteSubmit').click()
            advance(page, 203.34)
            assert not page.evaluate('PS[0].resultDocked')
            advance(page, 203.35)
            assert page.evaluate('PS[0].resultDocked')
            advance(page, 212.45)
            lines = page.evaluate('shownLines.filter(m=>m.stance)')
            assert len(lines) >= 20, (code, len(lines))
            assert all(m['t'] >= 205.45 for m in lines)
            gaps = [round(b['t']-a['t'], 2) for a,b in zip(lines,lines[1:])]
            assert max(gaps) > min(gaps) * 2, gaps
            if code in ['v3','t8','f1']:
                ai = sum(m['kind'] == 'ai' for m in lines)
                assert abs(ai - (len(lines)-ai)) <= 1, (code, ai, len(lines))
            page.wait_for_timeout(950)
            assert page.locator('.ov').is_visible()
            assert page.evaluate('''() => {
              const poll = document.getElementById('poll').getBoundingClientRect();
              const overlay = document.querySelector('.ov').getBoundingClientRect();
              return poll.left > overlay.right || poll.top >= overlay.bottom;
            }'''), code
            if code == 't8':
                colors = page.evaluate('''() => ['#feed','#ovFeed'].map(id=>{
                  const color = kind => getComputedStyle(document.querySelector(id+' .nm.'+kind)).color;
                  return color('ai') !== color('human');
                })''')
                assert all(colors), colors
                page.screenshot(path=str(artifacts / 'result-docked.png'))
            advance(page, 244.77)
            assert not page.locator('.ov').is_visible()
            assert page.evaluate('''() => {
              const p = document.getElementById('player').getBoundingClientRect();
              const c = document.getElementById('endCard').getBoundingClientRect();
              const b = document.getElementById('leave').getBoundingClientRect();
              return Math.abs((b.left+b.right)/2 - (p.left+p.right)/2) < 2 &&
                Math.abs((c.top+c.bottom)/2 - (p.top+p.bottom)/2) < 2;
            }''')
            if code == 't8':
                page.wait_for_timeout(350)
                page.screenshot(path=str(artifacts / 'finish-centred.png'))
            assert not errors, errors
            page.close()
        print('PASS: 20+ opinions, uneven bursts, balanced mixed opinions, delayed docking without chat overlap, centred finish in all 9 conditions')

        page, errors = prepare(browser, base)
        page.wait_for_timeout(900)
        page.evaluate("Renderer.push({kind:'human',name:'delay-check',text:'timing check'})")
        assert page.locator('#feed .nm', has_text='delay-check').count() == 1
        page.wait_for_timeout(550)
        assert page.locator('#ovFeed .nm', has_text='delay-check').count() == 0
        page.wait_for_timeout(400)
        assert page.locator('#ovFeed .nm', has_text='delay-check').count() == 1
        assert page.evaluate('OV_DELAY_MS === 800 && CUE_DELAY >= 1')
        page.close()
        print('PASS: on-video chat appears after 0.8 seconds')

        page, errors = prepare(browser, base)
        page.evaluate('''async () => {
          await Sink.flush(false); // Clear local-only events before enabling the mocked sink.
          Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
          window.qaPosts=[]; window.qaFinal=false;
          window.fetch=(url)=>new Promise(resolve=>{
            qaPosts.push(new URL(url).pathname.split('/').pop());
            const release=()=>resolve({ok:true});
            if(new URL(url).pathname.endsWith('/sessions')) window.qaReleaseSession=release;
            else window.qaReleaseEvents=release;
          });
          Sink.open('TEST_ORDER',cond);
          Logger.add('qa_saved');
          Sink.flush(false);
          Sink.flush(true).then(()=>{window.qaFinal=true});
        }''')
        page.wait_for_timeout(50)
        assert page.evaluate('qaPosts') == ['sessions']
        assert not page.evaluate('qaFinal')
        page.evaluate('qaReleaseSession()')
        page.wait_for_function('qaPosts.length===2')
        assert not page.evaluate('qaFinal'), 'Final flush must wait for the periodic events batch'
        page.evaluate('qaReleaseEvents()')
        page.wait_for_function('qaFinal')
        assert page.evaluate('qaPosts') == ['sessions','events']
        assert not errors, errors
        page.close()
        print('PASS: final flush waits for session creation and an in-flight periodic batch (mocked fetch)')

        page = browser.new_page(viewport={'width':1440, 'height':1000})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.route('**/*', lambda r: r.fulfill(status=204) if r.request.url.endswith('/stream.mp4') else
                   (r.continue_() if r.request.url.startswith(base) else r.abort()))
        page.goto(base + '/survey/?admin=1')
        page.evaluate('''() => {
          sessionStorage.setItem('lsv_admin_fast','1');
          localStorage.setItem('lsv_livestream-ai-chat-2026_admin',JSON.stringify({
            pid:'TEST_HANDOFF',stage:'intro',page:0,answers:{},pending:{},att:0,meta:{is_test:1},
            cell:{id:'MIXED_50',group:'mixed',cong:'half',code:'t8'}
          }));
        }''')
        page.reload()
        assert 'Half' not in page.locator('#ir1').inner_text()
        page.locator('#enter').click(timeout=8000)
        frame = page.frame_locator('#stimWrap iframe')
        frame.locator('#watch.on').wait_for()
        child = page.locator('#stimWrap iframe').element_handle().content_frame()
        assert child.url.startswith(base + '/?')
        assert not child.locator('#intro').is_visible()
        child.evaluate(STUB_CLOCK)
        advance(child, 141.55)
        child.locator('#pollOpts button[data-v="B"]').click()
        child.locator('input[name=confidence][value="6"]').check()
        child.locator('#voteSubmit').click()
        advance(child, 244.77)
        child.locator('#leave').click()
        page.wait_for_function("!document.getElementById('stimWrap')", timeout=8000)
        state = page.evaluate("JSON.parse(localStorage.getItem('lsv_livestream-ai-chat-2026_admin'))")
        assert state['stage'] == 'post' and state['meta']['t1_vote'] == 'B'
        assert state['meta']['t1_conf'] == 6 and state['meta']['stim_code_seen'] == 't8'
        assert state['meta']['stim_session_id'] and state['meta']['stim_end'] == 'complete'
        assert not errors, errors
        page.screenshot(path=str(artifacts / 'survey-return.png'))
        browser.close()
        print('PASS: PR #6 copy, same-site embed, intro skipped, finish -> questionnaire with T1/confidence/session ID')
    server.shutdown()


if __name__ == '__main__':
    main()
