"""Next requires complete answers and participation consent; refusal stays put.

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
                ctx, page, control, errors = fixture(browser, base)
                if mode == 'participant':
                    start(page, base)
                else:
                    page.goto(base + '/survey/?' + mode + '=1')
                next_button = page.locator('#next')
                assert next_button.is_disabled()
                page.locator('input[name=consent_agree][value="2"]').check()
                assert next_button.is_disabled()
                page.locator('input[name=consent_pi][value="2"]').check()
                page.locator('input[name=consent_future][value="4"]').check()
                assert next_button.is_disabled()
                # The handler must also reject refusal if invoked directly.
                page.evaluate("document.getElementById('next').onclick()")
                assert page.locator('input[name=consent_agree]').count() == 2
                assert not control['requests'] and not page.locator('iframe').count()
                page.reload()
                assert next_button.is_disabled()
                # Agreement alone is insufficient while the other answers are blank.
                page.locator('input[name=consent_agree][value="1"]').check()
                assert next_button.is_disabled()
                page.locator('input[name=consent_pi][value="2"]').check()
                assert next_button.is_disabled()
                page.locator('input[name=consent_future][value="4"]').check()
                assert next_button.is_enabled()
                # Either participation/privacy refusal disables Next again.
                page.locator('input[name=consent_pi][value="3"]').check()
                assert next_button.is_disabled()
                page.evaluate("document.getElementById('next').onclick()")
                assert not control['requests']
                page.locator('input[name=consent_pi][value="2"]').check()
                assert next_button.is_enabled()
                page.locator('input[name=consent_agree][value="2"]').check()
                assert next_button.is_disabled()
                page.locator('input[name=consent_agree][value="1"]').check()
                assert next_button.is_enabled()
                next_button.click()
                page.locator('input[name=scr_live3m]').first.wait_for()
                if mode == 'participant':
                    assert stored(page)['meta']['consent'] == 1
                    assert stored(page)['meta']['consent_future'] == '4'
                else:
                    assert not control['requests']
                assert not any(r['action'] == 'assign' for r in control['requests'])
                assert not errors, errors
                ctx.close()
            browser.close()
            print('PASS: Next stays disabled on missing answers/refusal, toggles with consent, and only agreement advances in participant/admin/debug modes; declining future research alone is allowed')
    finally:
        server.shutdown()


if __name__ == '__main__':
    main()
