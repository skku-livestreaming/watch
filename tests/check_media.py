"""Decode the real MP4 in installed Chrome and verify native media-end cleanup.
Preview mode runs at 8x; requests outside the local server are blocked.
"""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler


def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_PATH'))
        page=browser.new_page(viewport={'width':1440,'height':1000})
        errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.route('**/*',lambda r:r.continue_() if r.request.url.startswith(base) else r.abort())
        page.goto(base+'/?c=t8&preview=1')
        page.wait_for_function("document.getElementById('streamVideo').readyState>=2",timeout=30000)
        if page.locator('#videoRetry').is_visible():page.locator('#videoRetry').click()
        page.wait_for_function("document.getElementById('streamVideo').currentTime>0.5",timeout=15000)
        media=page.evaluate("({w:streamVideo.videoWidth,h:streamVideo.videoHeight,duration:streamVideo.duration,paused:streamVideo.paused,error:streamVideo.error})")
        assert media['w']==1920 and media['h']==1080 and not media['error'] and not media['paused'],media
        print('PASS: real H.264/AAC MP4 decodes and starts at 1920x1080',flush=True)
        page.evaluate("document.getElementById('streamVideo').playbackRate=8")
        page.locator('#leave').wait_for(state='visible',timeout=100000)
        assert page.locator('#endCard').is_visible()
        assert page.locator('#poll').is_hidden() and page.locator('#ov').is_hidden()
        assert page.locator('#buffer').is_hidden()
        assert page.evaluate("ended && !Sink.enabled() && Logger.ev.some(e=>e.type==='stream_ended')")
        assert not errors,errors
        page.locator('#leave').click()
        assert page.locator('#done').is_visible()
        browser.close()
        print('PASS: real media end hides chat/results/loading and permits finishing',flush=True)
    server.shutdown()


if __name__=='__main__':main()
