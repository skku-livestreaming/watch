"""Durable stimulus logging tests with mocked fetch and browser storage."""
import os
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from check_stimulus import ROOT, QuietHandler, prepare


def main():
    server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    with sync_playwright() as pw:
        browser=pw.chromium.launch(headless=True,executable_path=os.environ.get('CHROME_PATH'))
        for case in ['legacy','old-failure','in-flight','large-batch','storage-failure']:
            page,errors=prepare(browser,base)
            result=page.evaluate('''async mode=>{
              await Sink.flush(false);
              localStorage.removeItem('stim_retry_q');
              if(['legacy','old-failure'].includes(mode)) localStorage.setItem('stim_retry_q',JSON.stringify([
                {p:'sessions',b:{id:'old-session'}},
                {p:'events',b:[{session_id:'old-session',type:'old'}]}
              ]));
              Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
              const calls=[];
              window.fetch=async(url,options)=>{
                const body=JSON.parse(options.body);
                calls.push({path:new URL(url).pathname.split('/').pop(),body,prefer:options.headers.Prefer,
                  bytes:new TextEncoder().encode(options.body).length,keepalive:options.keepalive});
                if(mode==='old-failure' && body.id==='old-session') return {ok:false,status:503};
                if(mode==='storage-failure' && !window.qaRecover) return {ok:false,status:503};
                if(mode==='in-flight' && !window.qaRecover) return new Promise(resolve=>{window.qaRelease=()=>resolve({ok:true})});
                return {ok:true};
              };
              if(mode==='storage-failure'){
                const original=Storage.prototype.setItem;
                Storage.prototype.setItem=function(k,v){if(k==='stim_retry_q')throw new Error('quota');return original.call(this,k,v)};
              }
              const opened=Sink.open('QA_SINK',cond);
              if(mode==='in-flight'){
                Sink.push({type:'leave',t:1});Sink.flush(true);
                const journal=JSON.parse(localStorage.getItem('stim_retry_q'));
                const snapshot={journaled:journal.length,types:journal.map(p=>p.p)};
                window.qaRecover=true;window.qaRelease();await opened;await Sink.flush(true);
                return {...snapshot,pending:Sink.status().session_pending};
              }
              await opened;
              if(mode==='large-batch')for(let i=0;i<2000;i++)Sink.push({type:'qa',t:i,text:'x'.repeat(120)});
              else Sink.push({type:'leave',t:1});
              await Sink.flush(true);
              const failed=Sink.status();
              if(mode==='storage-failure'){window.qaRecover=true;await Sink.flush(true);}
              return {calls,pending:Sink.status().session_pending,global:Sink.status().pending,failed};
            }''',case)
            assert result['pending']==0,(case,result)
            if case=='legacy':
                assert sum(c['body'].get('id')=='old-session' for c in result['calls'] if isinstance(c['body'],dict))==1
                assert result['global']==0
                assert all('ignore-duplicates' in c['prefer'] for c in result['calls'] if c['path']=='sessions')
            elif case=='old-failure':assert result['global']==2
            elif case=='in-flight':assert result['journaled']==2 and result['types']==['sessions','events']
            elif case=='large-batch':
                batches=[c for c in result['calls'] if c['path']=='events']
                assert len(batches)>1 and all(c['bytes']<=48*1024 and c['keepalive'] for c in batches)
                assert sum(len(c['body']) for c in batches)==2000
            elif case=='storage-failure':
                assert result['failed']['session_pending']>0 and result['failed']['storage_error']
            assert not errors,errors
            page.close()
            print('PASS: durable sink',case)
        browser.close()
    server.shutdown()


if __name__=='__main__':main()
