"""Browser regression checks. Install playwright, then run this file.

Uses a temporary local server and blocks external requests, including logging.
Set CHROME_PATH to use an installed Chrome/Edge instead of Playwright Chromium.
"""
import os
import re
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HANGUL = re.compile(r"[\uac00-\ud7a3\u3131-\u3163]")


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def copyfile(self, source, output):
        try:
            super().copyfile(source, output)
        except (ConnectionResetError, BrokenPipeError):
            pass


def check_english(page):
    assert not HANGUL.search(page.locator('body').inner_text())
    labels = page.locator('[aria-label], [title], [placeholder]').evaluate_all(
        "els => els.flatMap(el => ['aria-label','title','placeholder'].map(k => el.getAttribute(k) || ''))"
    )
    assert not HANGUL.search(' '.join(labels))


def prepare(browser, base, code='t8', width=1440, height=1000, extra=''):
    page = browser.new_page(viewport={'width': width, 'height': height})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    # These tests exercise the application clock, not media decoding or the network sink.
    page.route('**/*', lambda route: route.fulfill(status=204) if route.request.url.endswith('/stream.mp4') else
               (route.continue_() if route.request.url.startswith(base) else route.abort()))
    page.goto(f'{base}/?c={code}&debug=1{extra}')
    page.locator('#pidEmail').fill('QA001')
    page.locator('#introGo').click()
    page.evaluate("""() => {
      clearInterval(timer); clearTimeout(bufferTimer);
      const v = document.getElementById('streamVideo');
      v.pause(); window.qaTime = 0;
      Object.defineProperties(v, {
        currentTime:{get:()=>window.qaTime,set:t=>{window.qaTime=t},configurable:true},
        paused:{get:()=>false,configurable:true},
        readyState:{get:()=>4,configurable:true}
      });
      v.play=()=>Promise.resolve(); v.pause=()=>{};
      window.qaAdvance = target => {
        while (tick + STEP < target){ window.qaTime=tick+STEP; loop(); }
        window.qaTime=target; loop();
      };
    }""")
    return page, errors


def advance(page, t):
    page.evaluate('(t)=>window.qaAdvance(t)', t)


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    checked = 0
    with sync_playwright() as pw:
        opts = {'headless': True}
        if os.environ.get('CHROME_PATH'):
            opts['executable_path'] = os.environ['CHROME_PATH']
        browser = pw.chromium.launch(**opts)
        # Every experimental condition, both choices, from entry through completion.
        for code in ['q7','m2','z5','b9','k3','r6','v3','t8','f1']:
            for choice in ['A', 'B']:
                page, errors = prepare(browser, base, code)
                check_english(page)
                advance(page, 169)
                assert page.evaluate('chatOpen')
                assert not page.evaluate('shownLines.some(m=>m.stance)')
                advance(page, 169.1)
                assert not page.evaluate('chatOpen')
                advance(page, 181.05)
                assert page.locator('#poll').is_visible()
                assert page.locator('#pollOpts button').all_text_contents() == ['100 unarmed men', 'One gorilla']
                page.locator(f'#pollOpts button[data-v="{choice}"]').click()
                page.locator('#voteSubmit').click()
                assert not page.evaluate('PS[0].voteLocked'), 'Confidence must be required'
                page.locator('input[name=confidence][value="5"]').check()
                page.locator('#voteSubmit').click()
                assert page.evaluate('PS[0].voteLocked && PS[0].confidence===5')
                assert not page.evaluate('chatOpen'), 'Submitting must not unlock chat early'
                advance(page, 200)
                assert page.locator('#pollTimer').inner_text() == '10s left'
                advance(page, 210.7)
                assert page.evaluate('PS[0].closed && !chatOpen')
                advance(page, 216.2)
                assert page.evaluate('chatOpen && PS[0].resultShown')
                result = page.evaluate('({condition:cond.cong,p:PS[0]})')
                mine = result['p']['result'][choice]
                total = result['p']['result']['total']
                if result['condition'] == 'all': assert mine == total
                if result['condition'] == 'none': assert mine == 1
                if result['condition'] == 'half': assert mine * 2 == total
                # Result magnitudes remain visible as bars, with no count/percentage text.
                # "100" belongs to the answer wording, not to the voting result.
                result_text = page.locator('#poll').inner_text().replace('100 unarmed men', '')
                assert not re.search(r'\d|%', result_text), result_text
                assert page.locator('#pollTimer').inner_text() == ''
                assert not re.search(r'\d|%', page.locator('#feed .msg.sys').last.inner_text())
                widths = page.locator('#pollRes .bar').evaluate_all('els => els.map(el=>parseFloat(el.style.width))')
                for width, side in zip(widths, ['A', 'B']):
                    assert abs(width - result['p']['result'][side] / total * 100) < 0.1
                assert page.evaluate('Logger.ev.find(e=>e.type==="poll_result_shown").total') == total
                advance(page, 250.5)
                assert page.evaluate('outroed')
                assert page.locator('#poll').is_visible(), 'Keep results visible through the outro'
                advance(page, 266.65)
                assert page.locator('#poll').is_visible(), 'Keep results visible until the stream ends'
                assert not page.evaluate('Logger.ev.some(e=>e.type==="poll_result_hidden")')
                advance(page, 266.69)
                assert page.locator('#endCard').is_visible()
                assert not page.locator('#poll').is_visible()
                assert page.evaluate('Logger.ev.filter(e=>e.type==="poll_result_hidden").length') == 1
                assert page.evaluate('Logger.ev.find(e=>e.type==="poll_result_hidden").at_sec - Logger.ev.find(e=>e.type==="poll_result_shown").at_sec') > 50
                summary = page.evaluate('leaveSummary("end_button")')
                assert len(summary['polls']) == 1 and summary['confidence'] == 5
                assert summary['saw_end'] and summary['polls'][0]['submitted']
                assert 'vote2' not in summary
                lines = page.evaluate('shownLines')
                assert not any(HANGUL.search(m['name'] + m['text']) for m in lines)
                assert not any(m.get('stance') and m['t'] >= 250.5 for m in lines)
                assert page.evaluate('Logger.ev.filter(e=>e.type==="vote").length') == 1
                assert not page.evaluate('Logger.ev.some(e=>e.poll>1)')
                if result['condition'] == 'all': assert summary['shown_incongruent'] == 0
                if result['condition'] == 'none': assert summary['shown_congruent'] == 0
                if result['condition'] == 'half':
                    for kind in ['ai', 'human']:
                        stats = summary['polls'][0]['shown_by_identity'][kind]
                        assert abs(stats['cong'] - stats['incong']) <= 1
                page.locator('#endSub').click()
                page.locator('.ec-item').first.click()
                assert page.locator('#ecNote').is_visible()
                page.locator('#leave').click()
                assert page.locator('#done').is_visible()
                check_english(page)
                assert not errors, errors
                page.close()
                checked += 1
        print(f'PASS: {checked} condition/choice combinations, results visible for 50 seconds until stream end, submission, completion')

        # Draft-only choices are not submitted; complete responses can auto-submit at the deadline.
        for mode in ['missing-confidence','auto-submit','no-answer','change-answer']:
            page, errors = prepare(browser, base)
            advance(page, 181.05)
            if mode != 'no-answer':
                page.locator('#pollOpts button[data-v="A"]').click()
                draft = page.evaluate('leaveSummary("closed")')
                assert draft['vote'] is None and draft['polls'][0]['draft_choice'] == 'A'
            if mode in ['auto-submit','change-answer']:
                page.locator('input[name=confidence][value="7"]').check()
            if mode == 'change-answer':
                page.locator('#pollOpts button[data-v="B"]').click()
                assert page.evaluate('PS[0].confidence === null')
                assert page.locator('input[name=confidence]:checked').count() == 0
            advance(page, 216.2)
            state = page.evaluate('PS[0]')
            if mode == 'auto-submit':
                assert state['voteLocked'] and state['vote'] == 'A' and state['confidence'] == 7
            else:
                assert not state['voteLocked'] and state['vote'] is None
                assert page.evaluate('Logger.ev.some(e=>e.type==="poll_missed")')
            assert not errors, errors
            page.close()
        print('PASS: missing confidence, no answer, deadline submission, confidence reset on answer change')

        # Native media end can fire before the next loop tick; it must also hide/log the result.
        page, errors = prepare(browser, base)
        advance(page, 266.65)
        assert page.locator('#poll').is_visible()
        page.evaluate('tick=END_AT;endStream()')
        assert not page.locator('#poll').is_visible()
        assert page.locator('#leave').is_visible()
        assert page.evaluate('Logger.ev.filter(e=>e.type==="poll_result_hidden").length') == 1
        assert not errors, errors
        page.close()
        print('PASS: native media-end cleanup and result visibility logging')

        # Small viewports: poll, radio labels, and result rows must fit their containers.
        for width, height in [(390,844),(320,740),(1024,768),(1440,900)]:
            page, errors = prepare(browser, base, width=width, height=height)
            advance(page, 181.05)
            page.locator('#pollOpts button[data-v="A"]').click()
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'horizontal overflow')
            assert page.evaluate("document.querySelector('.confidence-grid').scrollWidth <= document.querySelector('.confidence-grid').clientWidth")
            assert page.locator('#voteSubmit').is_visible()
            check_english(page)
            page.locator('input[name=confidence][value="4"]').check()
            page.locator('#voteSubmit').click()
            advance(page, 266.69)
            assert page.evaluate("""() => {
              const player=document.getElementById('player').getBoundingClientRect();
              const finish=document.getElementById('leave').getBoundingClientRect();
              return finish.top >= player.top && finish.bottom <= player.bottom &&
                     finish.left >= player.left && finish.right <= player.right;
            }"""), (width, 'finish button clipped')
            page.locator('#leave').click()
            assert page.locator('#done').is_visible()
            assert not errors, errors
            page.close()
        print('PASS: 320, 390, 1024, and 1440 px layouts and English UI/accessibility labels')
        browser.close()
    server.shutdown()


if __name__ == '__main__':
    main()
