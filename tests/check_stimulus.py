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
  v.dispatchEvent(new Event('playing'));
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
    jump('농장 게임')
    assert page.evaluate('tick < 1 && !previewSeeking') and page.locator('#pvNote').is_visible()
    page.evaluate('''() => Object.defineProperty(document.getElementById('streamVideo'), 'currentTime',
      {get:()=>window.qaTime, set:t=>{window.qaTime=t}, configurable:true})''')
    # Jump to the vote card, vote, then jump to the results.
    jump('투표 카드')
    assert not page.locator('#pvNote').is_visible()
    assert page.evaluate('Math.abs(tick - (POLLS[0].at - 3)) < 0.01 && chatOpen && !PS[0].shown')
    assert not page.evaluate("Logger.ev.some(e => e.type === 'seek_attempt')")
    advance(page, 141.55)
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
    assert not scheduled, 'CUES has no standalone laughs unrelated to the dialogue'
    assert not laughs, 'Do not fill dialogue with standalone laughter'
    assert not any(re.search(r'\b(?:chillin|chill|cozy|vibes)\b|^:\)$', m['text'], re.I) for m in rows)
    # Emoji only on dialogue reactions and farewells, spread across the stream, never hinting at the poll.
    scripted = {m['text'] for m in data['cues']} | set(data['outro'])
    emoji_rows = [m for m in data['lines'] if EMOJI.search(m['text'])]
    for m in emoji_rows:
        assert m['text'] in scripted and not m['stance'], m
        assert not TOPIC_EMOJI.search(m['text']), m
    times = [m['t'] for m in emoji_rows]
    assert any(t < 77 for t in times) and any(77 <= t < 151.75 for t in times) and any(t >= 205.45 for t in times), times
    # Editorial target of about 10% of live lines, not a measured platform rate.
    share = sum(1 for m in rows if EMOJI.search(m['text'])) / len(rows)
    assert 0.07 <= share <= 0.13, share
    assert any(144.5 <= m['t'] < 151.75 and len(m['text'].split()) >= 4 for m in rows), 'Keep substantive dialogue through the instructions'
    reactions = [m for m in rows if m['text'] in (
        'one more thing before you go?', 'one more thing before you leave?')]
    assert len(reactions) == 1, reactions
    assert reactions[0]['text'] == 'one more thing before you go?'
    assert 82 <= reactions[0]['t'] < 82.5, reactions
    condition = page.evaluate('({label:cond.label,ratio:cond.ratio})')
    expected = 'ai' if condition['label'] == 'mixed' and condition['ratio'] == 100 else 'human'
    assert reactions[0]['kind'] == expected, reactions


def check_one_side_per_viewer(lines):
    sides = {}
    for m in lines:
        if m.get('stance'):
            sides.setdefault(m['name'], set()).add(m['stance'])
    flips = [name for name, s in sides.items() if len(s) > 1]
    assert not flips, f'Viewers switched sides after the result: {flips}'


def script_without_badges(page):
    return page.evaluate('shownLines.map(({kind, ...line}) => line)')


def check_matched_scripts(browser, base):
    # Exercise alternate seeds, small/large rosters, and a participant who never votes.
    for extra, choice in [('&seed=2&viewers=100', 'A'),
                          ('&seed=2&viewers=100', None),
                          ('&seed=29&viewers=10000', 'B')]:
        baseline = None
        for code in ['m2', 'k3', 't8']:
            page, errors = prepare(browser, base, code, extra=extra)
            advance(page, 141.55)
            if choice:
                page.locator(f'#pollOpts button[data-v="{choice}"]').click()
                page.locator('input[name=confidence][value="5"]').check()
                page.locator('#voteSubmit').click()
            advance(page, 244.77)
            script = script_without_badges(page)
            if baseline is None:
                baseline = script
            else:
                assert script == baseline, (extra, choice, code, 'Identity changed the displayed script')
            check_one_side_per_viewer(page.evaluate('shownLines'))
            if choice:
                summary = page.evaluate('leaveSummary("end_button")')
                for stats in summary['polls'][0]['shown_by_identity'].values():
                    assert abs(stats['cong'] - stats['incong']) <= 1, (extra, code, stats)
            assert not errors, errors
            page.close()


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


# Reveal the result and record both bar widths every animation frame until the motion ends.
# Bars are listed in display order: [Yes (A), No (B)].
SAMPLE_MOTION = """async () => {
  const frames = [];
  const read = () => [...document.querySelectorAll('#pollRes .bar')].map(b => parseFloat(b.style.width) || 0);
  if (!PS[0].resultShown) window.qaAdvance(POLLS[0].result);
  await new Promise(done => {
    const step = () => { frames.push(read()); if (resultAnim) requestAnimationFrame(step); else done(); };
    step();
  });
  frames.push(read());
  return {frames, final: [...document.querySelectorAll('#pollRes .bar')].map(b => parseFloat(b.style.width))};
}"""


def vote_and_close(page, choice):
    advance(page, 141.55)
    page.locator(f'#pollOpts button[data-v="{choice}"]').click()
    page.locator('input[name=confidence][value="5"]').check()
    page.locator('#voteSubmit').click()
    advance(page, 198.75)


def check_result_motion(browser, base):
    # all/none: both bars fill from the left and bounce off their target, never past it.
    for code, choice in [('q7', 'B'), ('z5', 'A')]:
        page, errors = prepare(browser, base, code)
        vote_and_close(page, choice)
        data = page.evaluate(SAMPLE_MOTION)
        frames = data['frames']
        targets = page.locator('#pollRes .bar').evaluate_all('els => els.map(el=>parseFloat(el.dataset.share))')
        assert len(frames) > 30, len(frames)
        assert all(w < 10 for w in frames[0]), frames[0]
        big = max(range(2), key=lambda j: targets[j])
        series = [f[big] for f in frames]
        # The first bounce drops back to about three quarters of the target.
        hit = next(n for n, w in enumerate(series) if w >= targets[big] * 0.9)
        assert hit < len(series) - 10 and min(series[hit:]) < targets[big] * 0.85, 'The bar should bounce back after reaching its target'
        # data-share is rounded to 0.1, so allow that rounding.
        assert all(f[j] <= targets[j] + 0.06 for f in frames for j in range(2)), 'Bars never overshoot past the target'
        assert data['final'] == [round(t, 1) for t in targets], (data['final'], targets)
        assert 0 < min(targets) < 10, 'The minority bar stays slightly filled'
        motion = page.evaluate('Logger.ev.find(e=>e.type==="poll_result_motion")')
        assert motion['motion'] == 'bounce' and not motion['deferred']
        assert not errors, errors
        page.close()

    # half: the bars swing in opposite directions, cross several times, then end exactly level.
    page, errors = prepare(browser, base, 'm2')
    vote_and_close(page, 'A')
    data = page.evaluate(SAMPLE_MOTION)
    gaps = [a - b for a, b in data['frames']]          # mine (A) minus other (B)
    first = next(g for g in gaps if abs(g) > 2)
    assert first > 0, 'The participant\'s side leads first'
    signs = [1 if g > 2 else -1 for g in gaps if abs(g) > 2]
    crossings = sum(1 for x, y in zip(signs, signs[1:]) if x != y)
    assert crossings >= 3, crossings
    assert max(gaps) > 10 and min(gaps) < -10, (max(gaps), min(gaps))
    assert data['final'] == [50, 50], data['final']
    assert page.evaluate('Logger.ev.find(e=>e.type==="poll_result_shown").motion_lead') == 'A'
    assert not errors, errors
    page.close()

    # A result revealed while the tab is hidden waits to animate until the page is visible again.
    page, errors = prepare(browser, base, 'm2')
    vote_and_close(page, 'B')
    page.evaluate('''() => {
      for (const k of ['hidden', 'visibilityState'])
        Object.defineProperty(document, k, {get: () => k === 'hidden' ? window.qaHidden : (window.qaHidden ? 'hidden' : 'visible'), configurable: true});
      window.qaHidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
      window.qaAdvance(POLLS[0].result);
    }''')
    page.wait_for_timeout(400)
    assert page.evaluate('resultAnim && resultAnim.started === null')
    assert page.locator('#pollRes .bar').evaluate_all('els => els.map(el=>el.style.width)') == ['0%', '0%']
    assert not page.evaluate('Logger.ev.some(e=>e.type==="poll_result_motion")')
    page.evaluate('() => { window.qaHidden = false; document.dispatchEvent(new Event("visibilitychange")); }')
    data = page.evaluate(SAMPLE_MOTION)
    assert data['final'] == [50, 50], data['final']
    assert len(data['frames']) > 30
    assert page.evaluate('Logger.ev.find(e=>e.type==="poll_result_motion").deferred')
    assert not errors, errors
    page.close()


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    checked = 0
    scripts = {}
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
                advance(page, 141.5)
                assert not page.evaluate('PS[0].shown')
                advance(page, 141.55)
                assert page.locator('#poll').is_visible() and page.evaluate('chatOpen')
                advance(page, 151.65)
                assert page.evaluate('chatOpen')
                assert not page.evaluate('shownLines.some(m=>m.stance)')
                advance(page, 151.75)
                assert not page.evaluate('chatOpen')
                assert page.locator('#poll').is_visible()
                assert page.locator('#pollOpts button').all_text_contents() == ['Yes', 'No']
                page.locator(f'#pollOpts button[data-v="{choice}"]').click()
                page.locator('#voteSubmit').click()
                assert not page.evaluate('PS[0].voteLocked'), 'Confidence must be required'
                page.locator('input[name=confidence][value="5"]').check()
                page.locator('#voteSubmit').click()
                assert page.evaluate('PS[0].voteLocked && PS[0].confidence===5')
                assert not page.evaluate('chatOpen'), 'Submitting must not unlock chat early'
                advance(page, 183.1)
                assert page.locator('#pollTimer').inner_text() == '15s left'
                advance(page, 196.55)
                assert page.evaluate('PS[0].closed && !chatOpen')
                advance(page, 198.85)
                assert page.evaluate('PS[0].resultShown && !chatOpen && PS[0].unlockAt === null')
                assert not page.evaluate('shownLines.some(m=>m.stance)'), 'Keep stance messages hidden until chat reopens'
                advance(page, 205.45)
                assert page.evaluate('chatOpen && PS[0].resultShown')
                assert page.evaluate('Logger.ev.find(e=>e.type==="chat_unlocked").scheduled_at') == 205.45
                result = page.evaluate('({condition:cond.cong,p:PS[0]})')
                mine = result['p']['result'][choice]
                total = result['p']['result']['total']
                # all/none leave the minority bar slightly filled, by the same share in both.
                minor = page.evaluate(f'Math.max(1, Math.round({total} * RESULT_MINOR_SHARE))')
                assert 0 < minor < total * 0.1
                if result['condition'] == 'all': assert mine == total - minor
                if result['condition'] == 'none': assert mine == minor
                if result['condition'] == 'half': assert mine * 2 == total
                # The total vote count is shown; per-option counts and percentages are not.
                # "100" belongs to the answer wording, not to the voting result.
                total_text = page.locator('#pollTotal').inner_text()
                assert total_text == f'Total votes: {total:,}', total_text
                result_text = page.locator('#poll').inner_text().replace(total_text, '')
                assert not re.search(r'\d|%', result_text), result_text
                assert page.locator('#pollTimer').inner_text() == ''
                assert not re.search(r'\d|%', page.locator('#feed .msg.sys').last.inner_text())
                # Bars animate toward these targets; check_result_motion covers the motion itself.
                shares = page.locator('#pollRes .bar').evaluate_all('els => els.map(el=>parseFloat(el.dataset.share))')
                for share, side in zip(shares, ['A', 'B']):
                    assert abs(share - result['p']['result'][side] / total * 100) < 0.1
                shown = page.evaluate('Logger.ev.find(e=>e.type==="poll_result_shown")')
                assert shown['total'] == total and shown['total_shown']
                assert shown['motion'] == ('cross' if result['condition'] == 'half' else 'bounce')
                advance(page, 223.75)
                assert page.evaluate('outroed')
                assert page.locator('#poll').is_visible(), 'Keep results visible through the outro'
                advance(page, 244.74)
                assert page.locator('#poll').is_visible(), 'Keep results visible until the stream ends'
                assert not page.evaluate('Logger.ev.some(e=>e.type==="poll_result_hidden")')
                advance(page, 244.77)
                assert page.locator('#endCard').is_visible()
                assert not page.locator('#poll').is_visible()
                assert page.evaluate('Logger.ev.filter(e=>e.type==="poll_result_hidden").length') == 1
                assert page.evaluate('Logger.ev.find(e=>e.type==="poll_result_hidden").at_sec - Logger.ev.find(e=>e.type==="poll_result_shown").at_sec') > 45
                summary = page.evaluate('leaveSummary("end_button")')
                assert len(summary['polls']) == 1 and summary['confidence'] == 5
                assert summary['saw_end'] and summary['polls'][0]['submitted']
                assert 'vote2' not in summary
                lines = page.evaluate('shownLines')
                # Compare the complete displayed conversation, not just the text pools.
                # Same congruence and vote must differ only in AI/human badges.
                key = (result['condition'], choice)
                script = script_without_badges(page)
                if key not in scripts:
                    scripts[key] = script
                else:
                    assert script == scripts[key], (code, choice, 'Identity changed words, order, times, or nicknames')
                check_chat_output(page)
                emoji = summary['emoji_shown_by_identity']
                assert emoji['ai'] + emoji['human'] == sum(1 for m in lines if EMOJI.search(m['text']))
                if code in ['v3', 't8', 'f1']: assert abs(emoji['ai'] - emoji['human']) <= 1, emoji
                if code in ['q7', 'm2', 'z5']: assert emoji['human'] == 0, emoji
                if code in ['b9', 'k3', 'r6']: assert emoji['ai'] == 0, emoji
                assert not any(HANGUL.search(m['name'] + m['text']) for m in lines)
                assert not any(m.get('stance') and m['t'] >= 223.75 for m in lines)
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
        print(f'PASS: {checked} condition/choice combinations, results visible for 46 seconds until stream end, submission, completion')
        print('PASS: complete transcripts match across AI, human, and mixed identities at every congruence and vote')

        check_matched_scripts(browser, base)
        print('PASS: matched transcripts across alternate seeds, small/large rosters, and no-vote sessions; stance balance and speaker consistency preserved')

        check_result_motion(browser, base)
        print('PASS: result bars bounce in from the left (all/none), swing and cross before ending exactly level (half), and wait for a hidden tab')

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
            advance(page, 141.55)
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
            advance(page, 205.45)
            state = page.evaluate('PS[0]')
            if mode == 'auto-submit':
                assert state['voteLocked'] and state['vote'] == 'A' and state['confidence'] == 7
            else:
                assert not state['voteLocked'] and state['vote'] is None
                assert page.evaluate('Logger.ev.some(e=>e.type==="poll_missed")')
            if mode == 'no-answer':
                # Without a vote both sides are shown; each viewer still keeps one side.
                advance(page, 223.75)
                check_one_side_per_viewer(page.evaluate('shownLines'))
            assert not errors, errors
            page.close()
        print('PASS: missing confidence, no answer, deadline submission, confidence reset on answer change')

        # Participant IDs stay in records; chat displays the anonymous label You.
        for extra, expected in [('', 'You'), ('&panel_id=Pnl_42', 'You')]:
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
            assert mine['name'] == expected, mine
            assert mine['same'], 'Participant nickname colour must match other viewers'
            page.wait_for_timeout(950)   # the on-video overlay mirrors lines after 800 ms
            assert page.evaluate('''() => {
              const me = [...document.querySelectorAll('#ovFeed .nm.me')].pop();
              const other = document.querySelector('#ovFeed .nm.human, #ovFeed .nm.ai');
              return !!me && getComputedStyle(me).color === getComputedStyle(other).color;
            }'''), 'Overlay nickname colour must match too'
            assert not errors, errors
            page.close()
        print('PASS: participant messages show You without exposing participant IDs')

        # Native media end can fire before the next loop tick; it must also hide/log the result.
        page, errors = prepare(browser, base)
        advance(page, 244.74)
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
            advance(page, 141.55)
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
            advance(page, 205.45)
            page.wait_for_function('!resultAnim', timeout=6000)
            # "Your choice" sits outside the chosen row, both rows stay equally wide, and nothing overflows.
            fit = page.evaluate("""() => {
              const box = r => r.getBoundingClientRect();
              const tag = box(document.querySelector('#pollRes .mine-tag'));
              const mine = box(document.querySelector('#pollRes .row.mine'));
              const rows = [...document.querySelectorAll('#pollRes .row')].map(box);
              const poll = box(document.getElementById('poll'));
              const lb = [...document.querySelectorAll('#pollRes .lb')].map(el =>
                box(el).height < parseFloat(getComputedStyle(el).fontSize) * 1.8 ? 1 : 2);
              return {outside: tag.left >= mine.right || tag.bottom <= mine.top,
                      sameWidth: Math.abs(rows[0].width - rows[1].width) < 4,
                      inside: tag.right <= poll.right && rows.every(r => r.right <= poll.right),
                      oneLine: lb.every(n => n === 1)};
            }""")
            assert all(fit.values()), (width, fit)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), (width, 'result overflow')
            advance(page, 244.77)
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
