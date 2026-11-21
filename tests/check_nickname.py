"""Nickname display and stable CloudResearch identity; external services are mocked."""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, STUB_CLOCK, advance
from check_participant import fixture, state, PID, KEY


def send_and_check(frame, name):
    frame.evaluate(STUB_CLOCK)
    advance(frame, 30)
    frame.locator('#say').fill('Hello from this participant')
    frame.locator('#sendBtn').click()
    assert frame.locator('#feed .nm.me').last.inner_text() == name
    frame.wait_for_timeout(950)
    assert frame.locator('#ovFeed .nm.me').last.inner_text() == name


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_PATH'))
        context, page, control, errors = fixture(browser, base, initial=state('pre'))
        context.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>false})")
        supabase_writes = []
        def capture_supabase(route):
            supabase_writes.append((route.request.url, route.request.post_data_json))
            route.fulfill(status=201, json={})
        context.route('https://*.supabase.co/**', capture_supabase)
        page.clock.install()
        page.goto(base + '/survey/?participantId=' + PID)
        page.locator('#q_nickname_0 input').fill('ChatFan_42')
        page.reload()
        assert page.locator('#q_nickname_0 input').input_value() == 'ChatFan_42'
        page.locator('#next').click()
        page.locator('#ir1').wait_for()
        assert page.locator('#chatNickname').count() == 0, 'Nickname must only be requested once'
        page.clock.fast_forward(60000)
        page.locator('#enter').wait_for(state='visible')
        assert page.locator('#chatDemoName').inner_text() == 'ChatFan_42'
        assert PID not in page.locator('#irList').inner_text()
        page.screenshot(path=str(ROOT / '.qa-artifacts' / 'nickname-survey-intro.png'), full_page=True)
        page.locator('#enter').click()
        child = page.locator('#stimWrap iframe').element_handle().content_frame()
        child.locator('#watch.on').wait_for()
        assert child.evaluate('cond.pid') == PID
        assert child.evaluate('cond.panel_id') == PID
        send_and_check(child, 'ChatFan_42')
        page.screenshot(path=str(ROOT / '.qa-artifacts' / 'nickname-chat.png'), full_page=True)
        assert child.evaluate('JSON.parse(Logger.dump()).pid') == PID
        advance(child, 244.77)
        child.locator('#leave').click()
        page.wait_for_function("!document.getElementById('stimWrap')")
        saved = page.evaluate('(key)=>JSON.parse(localStorage.getItem(key))', KEY)
        assert saved['pid'] == PID and saved['answers']['nickname'] == 'ChatFan_42'
        assert saved['stage'] == 'post'
        assert control['requests'] and all(r['pid'] == PID for r in control['requests'])
        saves = [r['data'] for r in control['requests'] if r['action'] == 'save']
        assert saves and all(r['nickname'] == 'ChatFan_42' for r in saves)
        sessions = [body for url, body in supabase_writes if url.split('?')[0].endswith('/sessions')]
        events = [event for url, body in supabase_writes if url.split('?')[0].endswith('/events') for event in body]
        assert sessions and all(s['pid'] == PID and s['condition']['nickname'] == 'ChatFan_42' for s in sessions)
        for kind in ['watch_start', 'user_comment', 'leave']:
            matching = [e for e in events if e['type'] == kind]
            assert matching and all(e['data']['nickname'] == 'ChatFan_42' for e in matching), kind
        assert not errors, errors
        context.close()
        print('PASS: PID and nickname persist through reload/return and reach Sheets save requests and Supabase sessions/events')

        for nickname, expected in [('', 'You'), (None, 'You'), ({'bad': True}, 'You'),
                                   ('\u200b\u202e  ', 'You'), ('<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>')]:
            initial = state('intro')
            initial['answers']['nickname'] = nickname
            context, page, control, errors = fixture(browser, base, initial=initial)
            page.clock.install()
            page.goto(base + '/survey/?participantId=' + PID)
            page.locator('#ir1').wait_for()
            page.clock.fast_forward(60000)
            page.locator('#enter').wait_for(state='visible')
            assert page.locator('#chatDemoName').inner_text() == expected
            page.locator('#enter').click()
            child = page.locator('#stimWrap iframe').element_handle().content_frame()
            child.locator('#watch.on').wait_for()
            send_and_check(child, expected)
            assert child.evaluate('leaveSummary("closed").nickname') == expected
            saves = [r['data'] for r in control['requests'] if r['action'] == 'save']
            assert saves and all(r['nickname'] == expected for r in saves)
            assert child.locator('#feed .nm.me img').count() == 0
            assert child.evaluate('cond.pid') == PID
            child.evaluate('cond.nickname = {bad:true}')
            child.locator('#say').fill('Fallback message')
            child.locator('#sendBtn').click()
            assert child.locator('#feed .nm.me').last.inner_text() == 'You'
            assert not errors, errors
            context.close()
        print('PASS: invalid/missing nicknames fall back to You; markup displays safely as text')

        for query in ['panel_id', 'participantId']:
            context, page, control, errors = fixture(browser, base)
            page.goto(base + '/?c=k3&' + query + '=Case_Sensitive42')
            page.locator('#chatNickname').fill('StandaloneFan')
            page.locator('#introGo').click()
            send_and_check(page, 'StandaloneFan')
            assert page.evaluate('leaveSummary("closed").nickname') == 'StandaloneFan'
            assert page.evaluate('cond.pid') == 'Case_Sensitive42'
            assert page.evaluate('JSON.parse(Logger.dump()).pid') == 'Case_Sensitive42'
            page.reload()
            assert page.locator('#chatNickname').input_value() == 'StandaloneFan'
            page.goto(base + '/?c=k3&' + query + '=AnotherParticipant')
            assert page.locator('#chatNickname').input_value() == ''
            page.locator('#introGo').click()
            send_and_check(page, 'You')
            assert not errors, errors
            context.close()
        print('PASS: standalone nicknames preserve case-sensitive IDs and stay isolated by participant')
        browser.close()
    server.shutdown()


if __name__ == '__main__':
    main()
