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
        for case in ['legacy','old-failure','in-flight','large-batch','storage-failure','rls-error','permission-error',
                     'session-duplicate','other-duplicate','event-duplicate']:
            page,errors=prepare(browser,base)
            result=page.evaluate('''async mode=>{
              await Sink.flush(false);
              localStorage.removeItem('stim_retry_q');
              if(['legacy','old-failure'].includes(mode)) localStorage.setItem('stim_retry_q',JSON.stringify([
                {p:'sessions',b:{id:'old-session'}},
                {p:'events',b:[{session_id:'old-session',type:'old'}]}
              ]));
              Object.defineProperty(navigator,'webdriver',{get:()=>false,configurable:true});
              const calls=[], committedSessions=new Set();
              window.fetch=async(url,options)=>{
                const body=JSON.parse(options.body);
                const path=new URL(url).pathname.split('/').pop();
                calls.push({path,query:new URL(url).search,body,prefer:options.headers.Prefer,
                  bytes:new TextEncoder().encode(options.body).length,keepalive:options.keepalive});
                if(mode==='session-duplicate' && path==='sessions'){
                  if(!committedSessions.has(body.id)){
                    committedSessions.add(body.id);throw new TypeError('response lost after commit');
                  }
                  return {ok:false,status:409,json:async()=>({code:'23505',
                    message:'duplicate key value violates unique constraint "sessions_pkey"'})};
                }
                if(['other-duplicate','event-duplicate'].includes(mode) && !window.qaRecover &&
                    path===(mode==='other-duplicate' ? 'sessions' : 'events')) return {
                  ok:false,status:409,json:async()=>({code:'23505',message:
                    'duplicate key value violates unique constraint "'+(mode==='other-duplicate' ? 'sessions_pid_key' : 'events_pkey')+'"'})
                };
                if(mode==='old-failure' && body.id==='old-session') return {ok:false,status:503};
                if(mode==='storage-failure' && !window.qaRecover) return {ok:false,status:503};
                if(['rls-error','permission-error'].includes(mode) && !window.qaRecover) return {
                  ok:false,status:401,json:async()=>({code:'42501',
                    message:mode==='rls-error' ? 'new row violates row-level security policy for table "sessions"'
                      : 'permission denied for table sessions',
                    details:'PRIVATE_FAILED_ROW'})
                };
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
              if(['storage-failure','rls-error','permission-error','other-duplicate','event-duplicate'].includes(mode)){
                window.qaRecover=true;await Sink.flush(true);
              }
              return {calls,pending:Sink.status().session_pending,global:Sink.status().pending,failed};
            }''',case)
            assert result['pending']==0,(case,result)
            if case=='legacy':
                assert sum(c['body'].get('id')=='old-session' for c in result['calls'] if isinstance(c['body'],dict))==1
                assert result['global']==0
                assert all(c['prefer']=='return=minimal' and not c['query']
                           for c in result['calls'] if c['path']=='sessions')
            elif case=='old-failure':assert result['global']==2
            elif case=='in-flight':assert result['journaled']==2 and result['types']==['sessions','events']
            elif case=='large-batch':
                batches=[c for c in result['calls'] if c['path']=='events']
                assert len(batches)>1 and all(c['bytes']<=48*1024 and c['keepalive'] for c in batches)
                assert sum(len(c['body']) for c in batches)==2000
            elif case=='storage-failure':
                assert result['failed']['session_pending']>0 and result['failed']['storage_error']
            elif case in ['rls-error','permission-error']:
                error=result['failed']['last_error']
                assert 'HTTP 401' in error and '42501' in error
                assert ('row-level security policy' if case=='rls-error' else 'permission denied for table') in error
                assert 'PRIVATE_FAILED_ROW' not in error
                assert result['failed']['session_pending']>0
            elif case=='session-duplicate':
                assert result['failed']['fail']>0
                assert sum(c['path']=='sessions' for c in result['calls'])==2
                assert sum(c['path']=='events' for c in result['calls'])==1
            elif case in ['other-duplicate','event-duplicate']:
                assert result['failed']['session_pending']>0
                assert 'HTTP 409' in result['failed']['last_error'] and '23505' in result['failed']['last_error']
            assert not errors,errors
            page.close()
            print('PASS: durable sink',case)
        browser.close()
    server.shutdown()


if __name__=='__main__':main()
