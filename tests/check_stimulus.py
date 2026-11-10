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
    page.evaluate(STUB_CLOCK)
    return page, errors


# Drive the application clock directly instead of decoding media.
STUB_CLOCK = """() => {
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
}"""


def check_preview(browser, base):
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.route('**/*', lambda route: route.fulfill(status=204) if route.request.url.endswith('/stream.mp4') else
               (route.continue_() if route.request.url.startswith(base) else route.abort()))
    page.goto(f'{base}/?c=t8&preview=1')
    assert page.locator('#previewBar').is_visible()
    assert page.evaluate("cond.preview && cond.intro === 'off' && !Sink.enabled() && entered")
    assert not page.locator('#intro').is_visible()
    page.evaluate(STUB_CLOCK)
    # Speed changes stay and are not logged as participant attempts.
    page.locator('#previewBar [data-rate="4"]').click()
    page.wait_for_timeout(100)
    assert page.evaluate("document.getElementById('streamVideo').playbackRate === 4 && !Logger.ev.some(e => e.type === 'rate_attempt')")
    def jump(label):
        page.locator('#previewBar button', has_text=label).click()
        page.evaluate("document.getElementById('streamVideo').dispatchEvent(new Event('seeked'))")
    # A server without Range support cannot move the video; state must not run ahead of it.
    page.evaluate('''() => Object.defineProperty(document.getElementById('streamVideo'), 'currentTime',
      {get:()=>window.qaTime, set:()=>{}, configurable:true})''')
    jump('동물원')
    assert page.evaluate('tick < 1 && !previewSeeking') and page.locator('#pvNote').is_visible()
    page.evaluate('''() => Object.defineProperty(document.getElementById('streamVideo'), 'currentTime',
      {get:()=>window.qaTime, set:t=>{window.qaTime=t}, configurable:true})''')
    # Jump to the vote card, vote, then jump to the results.
    jump('투표 카드')
    assert not page.locator('#pvNote').is_visible()
    assert page.evaluate('Math.abs(tick - (POLLS[0].at - 3)) < 0.01 && !chatOpen && !PS[0].shown')
    assert not page.evaluate("Logger.ev.some(e => e.type === 'seek_attempt')")
    advance(page, 181.05)
    page.locator('#pollOpts button[data-v="B"]').click()
    page.locator('input[name=confidence][value="6"]').check()
    page.locator('#voteSubmit').click()
    jump('결과')
    advance(page, 230)
    assert page.evaluate('PS[0].voteLocked && PS[0].resultShown && chatOpen')
    # Fast-forward keeps the chat clock in step: no pre-poll topic lines after the result.
    late = page.evaluate('''() => {
      const topic = new Set(CHAT_PHASES.flatMap(p => p.texts));
      return shownLines.filter(m => m.t >= POLLS[0].result && topic.has(m.text)).map(m => m.text);
    }''')
    assert not late, late
    assert page.locator('#previewBar button', has_text='투표 안내').is_disabled(), 'No rewinding in preview'
    assert not errors, errors
    page.close()


def advance(page, t):
    page.evaluate('(t)=>window.qaAdvance(t)', t)


LAUGH = re.compile(r'^(?:lo+l+|lma+o+|lul|(?:ha){2,}|hehe)$', re.I)
EMOJI = re.compile('[\U0001F000-\U0001FAFF☀-➿]')
# Gorilla, monkey, monkey face, orangutan, flexed arm, fire, skull, skull and crossbones.
TOPIC_EMOJI = re.compile('[\U0001F98D\U0001F412\U0001F435\U0001F9A7\U0001F4AA\U0001F525\U0001F480☠]')


def check_chat_output(page):
    data = page.evaluate('({lines:shownLines,cues:CUES,outro:REACT_OUTRO,delay:CUE_DELAY,step:STEP})')
    rows = [m for m in data['lines'] if m['ph'] != 'before_join']
    laughs = [m for m in rows if LAUGH.fullmatch(m['text'])]
    scheduled = [m for m in data['cues'] if LAUGH.fullmatch(m['text'])]
    assert not scheduled, 'The streamer never laughs outright, so CUES has no standalone laughs'
    assert not laughs, 'Do not fill dialogue with standalone laughter'
    assert not any(re.search(r'\b(?:chillin|chill|cozy|vibes)\b|^:\)$', m['text'], re.I) for m in rows)
    # Emoji only on dialogue reactions and farewells, spread across the stream, never hinting at the poll.
    scripted = {m['text'] for m in data['cues']} | set(data['outro'])
    emoji_rows = [m for m in data['lines'] if EMOJI.search(m['text'])]
    for m in emoji_rows:
        assert m['text'] in scripted and not m['stance'], m
        assert not TOPIC_EMOJI.search(m['text']), m
    times = [m['t'] for m in emoji_rows]
    assert any(t < 101.5 for t in times) and any(101.5 <= t < 169.1 for t in times) and any(t >= 216.2 for t in times), times
    # Editorial target of about 10% of live lines, not a measured platform rate.
    share = sum(1 for m in rows if EMOJI.search(m['text'])) / len(rows)
    assert 0.07 <= share <= 0.13, share
    assert any(147.5 <= m['t'] < 169.1 and len(m['text'].split()) >= 4 for m in rows), 'Keep substantive dialogue through the instructions'


def check_one_side_per_viewer(lines):
    sides = {}
    for m in lines:
        if m.get('stance'):
            sides.setdefault(m['name'], set()).add(m['stance'])
    flips = [name for name, s in sides.items() if len(s) > 1]
    assert not flips, f'Viewers switched sides after the result: {flips}'


def check_chat_generation(page):
    data = page.evaluate('''() => {
      const run = c => buildTimeline(c, mulberry32(c.seed * 7919 + c.viewers), SPAN);
      const runs = [];
      for (const viewers of [100, 1243, 10000]) for (const seed of [1, 7, 29]) {
        const c = {...cond, viewers, seed};
        const built = run(c);
        const other = run({...c, label:'human', ratio:0, cong:'none'});
        runs.push({viewers, seed, list:built.list, counts:built.counts,
          identityIndependent:JSON.stringify(built) === JSON.stringify(other)});
      }
      resetDedup(); noteText('lolll');
      const laughVariantsBlocked = ['lol','LOL','lmao','lmaooo','LUL','hehe'].every(isRecentDup);
      resetDedup();
      const timelineTexts = [...SCRIPT, ...CHAT_PHASES.flatMap(p => p.texts),
        ...POLLS.flatMap(p => [...p.saysA, ...p.saysB, ...p.neutral])];
      return {runs, phases:CHAT_PHASES, lock:POLLS[0].lock - VIDEO_TRIM, laughVariantsBlocked, timelineTexts};
    }''')
    assert data['laughVariantsBlocked'], 'Different laugh spellings must share repetition protection'
    # Timeline speakers cannot be balanced by identity, so these pools stay emoji-free.
    assert not [t for t in data['timelineTexts'] if EMOJI.search(t)]
    for run in data['runs']:
        assert run['identityIndependent'], run
        assert sum(run['counts']) == len(run['list'])
        used = set()
        for m in run['list']:
            if m.get('pre') or m['t'] >= data['lock']:
                continue
            phase = next(p for p in reversed(data['phases']) if p['at'] <= m['t'])
            assert m['text'] in phase['texts'], (run['viewers'], run['seed'], m)
            assert not LAUGH.fullmatch(m['text']), m
            key = (phase['at'], m['text'])
            assert key not in used, 'Each topic line should be used once, even after pool exhaustion'
            used.add(key)


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
                assert page.locator('#previewBar').count() == 0, 'Participants never see the preview tools'
                advance(page, 169)
                assert page.evaluate('chatOpen')
                assert not page.evaluate('shownLines.some(m=>m.stance)')
                advance(page, 169.1)
                assert not page.evaluate('chatOpen')
                advance(page, 181.05)
                assert page.locator('#poll').is_visible()
                assert page.locator('#pollOpts button').all_text_contents() == ['One gorilla', '100 unarmed men']
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
                for width, side in zip(widths, ['B', 'A']):
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
                check_chat_output(page)
                emoji = summary['emoji_shown_by_identity']
                assert emoji['ai'] + emoji['human'] == sum(1 for m in lines if EMOJI.search(m['text']))
                if code in ['v3', 't8', 'f1']: assert abs(emoji['ai'] - emoji['human']) <= 1, emoji
                if code in ['q7', 'm2', 'z5']: assert emoji['human'] == 0, emoji
                if code in ['b9', 'k3', 'r6']: assert emoji['ai'] == 0, emoji
                assert not any(HANGUL.search(m['name'] + m['text']) for m in lines)
                assert not any(m.get('stance') and m['t'] >= 250.5 for m in lines)
                check_one_side_per_viewer(lines)
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

        check_preview(browser, base)
        print('PASS: researcher preview skips the intro, sends nothing, keeps speed, and fast-forwards in order')

        page, errors = prepare(browser, base)
        check_chat_generation(page)
        assert not errors, errors
        page.close()
        print('PASS: contextual chat across 9 viewer/seed combinations, identity independence, no exhaustion filler, laugh-family repetition protection, emoji-free timeline pools')

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
            if mode == 'no-answer':
                # Without a vote both sides are shown; each viewer still keeps one side.
                advance(page, 250.5)
                check_one_side_per_viewer(page.evaluate('shownLines'))
            assert not errors, errors
            page.close()
        print('PASS: missing confidence, no answer, deadline submission, confidence reset on answer change')

        # The participant's own message uses their ID as the nickname, in the same colour as other viewers.
        for extra, expected in [('', 'qa001'), ('&panel_id=Pnl_42', 'Pnl_42')]:
            if not extra:
                page, errors = prepare(browser, base, 'k3')
            else:
                # Panel entrants skip the ID field, so prepare() cannot fill it.
                page = browser.new_page(viewport={'width': 1440, 'height': 1000})
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('**/*', lambda route: route.fulfill(status=204) if route.request.url.endswith('/stream.mp4') else
                           (route.continue_() if route.request.url.startswith(base) else route.abort()))
                page.goto(f'{base}/?c=k3&debug=1{extra}')
                page.locator('#introGo').click()
                page.evaluate(STUB_CLOCK)
            advance(page, 30)
            page.locator('#say').fill('hello chat')
            page.locator('#sendBtn').click()
            mine = page.evaluate('''() => {
              const color = el => getComputedStyle(el).color;
              const me = document.querySelector('#feed .nm.me:last-of-type') || [...document.querySelectorAll('#feed .nm.me')].pop();
              const other = document.querySelector('#feed .nm.human, #feed .nm.ai');
              return {name: me.textContent, same: color(me) === color(other)};
            }''')
            assert mine['name'] == expected and 'You' not in mine['name'], mine
            assert mine['same'], 'Participant nickname colour must match other viewers'
            page.wait_for_timeout(700)   # the on-video overlay mirrors lines after a short delay
            assert page.evaluate('''() => {
              const me = [...document.querySelectorAll('#ovFeed .nm.me')].pop();
              const other = document.querySelector('#ovFeed .nm.human, #ovFeed .nm.ai');
              return !!me && getComputedStyle(me).color === getComputedStyle(other).color;
            }'''), 'Overlay nickname colour must match too'
            assert not errors, errors
            page.close()
        print('PASS: participant messages show the participant ID in the shared nickname colour')

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
            # Endpoint labels use common confidence-rating wording and stay inside the scale.
            assert page.locator('#confidenceEnds .anchor-min').inner_text() == 'Not at all confident'
            assert page.locator('#confidenceEnds .anchor-max').inner_text() == 'Extremely confident'
            assert page.evaluate("document.querySelector('.confidence-ends').scrollWidth <= document.querySelector('.confidence-ends').clientWidth"), (width, 'anchor overflow')
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
