"""Consent refusal takes precedence over unanswered consent questions.

All external requests are mocked; no participant records are written.
"""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer

from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler
from check_participant import fixture, start, stored


def main():
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROME_PATH'))
            for mode in ['participant', 'admin', 'debug']:
                for name, value in [('consent_agree', '2'), ('consent_pi', '3')]:
                    for complete in [False, True]:
                        ctx, page, control, errors = fixture(browser, base)
                        if mode == 'participant':
                            start(page, base)
                        else:
                            page.goto(base + '/survey/?' + mode + '=1')
                        if complete:
                            for field, answer in [('consent_pi', '2'), ('consent_future', '3'), ('consent_agree', '1')]:
                                page.locator(f'input[name={field}][value="{answer}"]').check()
                        page.locator(f'input[name={name}][value="{value}"]').check()
                        page.locator('#next').click()
                        page.get_by_text('You have chosen not to participate in this study. Thank you for your time. You may now close this window.', exact=True).wait_for(timeout=3000)
                        page.reload()
                        page.get_by_text('You have chosen not to participate in this study. Thank you for your time. You may now close this window.', exact=True).wait_for()
                        assert not page.locator('#next').count()
                        assert not page.locator('iframe').count()
                        assert not any(r['action'] == 'assign' for r in control['requests'])
                        if mode == 'participant':
                            saved = stored(page)
                            assert saved['stage'] == 'end' and saved['meta']['consent'] == 0
                            assert saved['meta']['end_reason'] == 'declined'
                        else:
                            assert not control['requests']
                        assert not errors, errors
                        ctx.close()
            print('PASS: participation/privacy refusal exits without other answers, persists after reload, and never assigns a condition in participant/admin/debug modes')

            ctx, page, control, errors = fixture(browser, base)
            start(page, base)
            page.locator('#next').click()
            assert page.locator('.consent-q.missing').count() == 3
            page.locator('input[name=consent_agree][value="1"]').check()
            page.locator('#next').click()
            assert stored(page)['stage'] == 'consent' and not control['requests']
            page.locator('input[name=consent_pi][value="2"]').check()
            page.locator('input[name=consent_future][value="4"]').check()
            page.locator('#next').click()
            page.locator('input[name=scr_live3m]').first.wait_for()
            assert stored(page)['meta']['consent'] == 1
            assert stored(page)['meta']['consent_future'] == '4'
            assert not any(r['action'] == 'assign' for r in control['requests'])
            assert not errors, errors
            ctx.close()
            browser.close()
            print('PASS: participation still requires all answers; declining future research alone allows participation')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
