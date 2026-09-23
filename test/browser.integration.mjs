/* Test-only end-to-end checks. No production data or real agent responses. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fixtureBackend,previewFrontend,fixtureOrigin,previewOrigin} from './preview-fixture.mjs';
const chrome=process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe';
await access(chrome);
const profile=await mkdtemp(path.join(tmpdir(),'birge-ui-'));
const child=spawn(chrome,['--headless','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0;const pending=new Map();
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(JSON.stringify(r.exceptionDetails));return r.result.value}
const ready="(async()=>{const end=Date.now()+6000;while(document.readyState!=='complete'||!document.querySelector('#catalog-status').hidden){if(Date.now()>end)throw Error('Catalog timeout');await new Promise(r=>setTimeout(r,30))}await document.fonts.ready;return true})()";
const settle="(async()=>{const end=Date.now()+6000;while(!document.querySelector('#loading-state').hidden){if(Date.now()>end)throw Error('Request timeout');await new Promise(r=>setTimeout(r,30))}return true})()";
async function submit(patch={}){
 const values={city:'Алматы',date:'2026-10-04',event_format:'корпоратив',category:'Ведущий',budget:'1500000',duration_hours:'',language:'',...patch};
 await evaluate("(()=>{const f=document.querySelector('#request-form');for(const [k,v]of Object.entries("+JSON.stringify(values)+")){f.elements[k].value=v;f.elements[k].dispatchEvent(new Event('input',{bubbles:true}))}f.requestSubmit();return true})()");
 await evaluate(settle);
}
const state=()=>evaluate("({status:document.querySelector('#result-summary').dataset.status,ids:[...document.querySelectorAll('.result-card')].map(x=>x.dataset.id),technical:!document.querySelector('#technical-error').hidden,formError:!document.querySelector('#request-error').hidden,budget:document.querySelector('#budget').value})");
try{
 let port;for(let i=0;i<100;i++){try{port=(await readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break}catch{await pause(50)}}
 if(!port)throw Error('Chrome did not start');
 const tabs=await(await fetch('http://127.0.0.1:'+port+'/json')).json();ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true})});
 ws.addEventListener('message',({data})=>{const m=JSON.parse(data),job=pending.get(m.id);if(job){pending.delete(m.id);m.error?job.reject(Error(JSON.stringify(m.error))):job.resolve(m.result)}});
 await call('Page.enable');await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:previewOrigin});await evaluate(ready);
 assert.deepEqual(await evaluate("({start:document.querySelector('#date').min,end:document.querySelector('#date').max,cities:document.querySelector('#city').options.length})"),{start:'2026-09-23',end:'2026-12-31',cities:4});
 await submit();assert.deepEqual((await state()).ids,['TEST-Z','TEST-A','TEST-M']);
 assert.equal(await evaluate("document.querySelectorAll('.result-card img').length"),0);
 assert.ok(await evaluate("document.querySelector('#result-cards').textContent.includes('<img src=x onerror=alert(1)>')"));
 assert.ok(await evaluate("document.querySelector('.card-evidence').textContent.includes('Факт из тестового профиля.')"));
 const ids=(await state()).ids;
 await evaluate("document.querySelector('#site-language').value='en';document.querySelector('#site-language').dispatchEvent(new Event('change'))");
 assert.deepEqual((await state()).ids,ids);assert.ok(await evaluate("document.querySelector('.explanation p').textContent.startsWith('Тестовый ответ сервера')"));
 console.log('PASS catalog, calendar, order, exact server text, evidence and safe rendering');
 await submit({category:'Флорист'});assert.equal((await state()).ids.length,1);assert.equal(await evaluate("document.querySelector('#explanation-limitations').hidden"),false);
 await submit({city:'Зарубежье'});assert.equal((await state()).status,'no_category');assert.equal((await state()).technical,false);
 await evaluate("document.querySelector('[aria-controls=city]').click()");assert.equal(await evaluate('document.activeElement.id'),'city');
 await submit({budget:'0'});assert.equal((await state()).status,'no_match');assert.equal((await state()).budget,'0');
 await evaluate("document.querySelector('[aria-controls=budget]').click()");assert.equal(await evaluate('document.activeElement.id'),'budget');assert.equal((await state()).budget,'0');
 await submit({city:'Астана',category:'Банкетный зал',event_format:'свадьба',date:'2026-11-14',budget:'3000000',duration_hours:'6'});assert.equal((await state()).status,'no_match');
 await submit({city:'Астана',category:'Банкетный зал',event_format:'свадьба',date:'2026-11-15',budget:'3000000',duration_hours:'6'});assert.deepEqual((await state()).ids,['TEST-VENUE']);
 console.log('PASS sparse result, limitations, no category, no match, field links and venue dates');
 const before=await evaluate("performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/recommend')).length");
 await submit({duration_hours:'1.5',budget:''});assert.equal(await evaluate("document.querySelector('#hours-error').hidden||document.querySelector('#budget-error').hidden"),false);
 assert.equal(await evaluate("performance.getEntriesByType('resource').filter(x=>x.name.includes('/api/recommend')).length"),before);
 await submit({budget:'123'});assert.equal((await state()).formError,true);assert.equal((await state()).technical,false);
 assert.equal(await evaluate("document.querySelector('#budget-error').textContent"),'Тестовая ошибка поля бюджета.');
 await submit({budget:'1500456'});assert.equal((await state()).technical,true);const saved=(await state()).budget;
 await evaluate("document.querySelector('#retry').click()");await evaluate(settle);assert.equal((await state()).technical,false);assert.equal((await state()).budget,saved);assert.equal((await state()).ids.length,3);
 await submit({budget:'789'});assert.equal((await state()).technical,true);
 console.log('PASS validation, backend 400, invalid envelope and retry with preserved input');
 await evaluate("(()=>{const f=document.querySelector('#request-form');f.elements.budget.value='1500001';f.requestSubmit();return true})()");
 assert.equal(await evaluate("document.querySelector('#loading-state').hidden"),false);
 await submit({city:'Астана'});await pause(850);assert.equal((await state()).ids[0],'TEST-NEW');assert.equal(await evaluate("document.querySelector('.submit').disabled"),false);
 console.log('PASS old delayed request cannot overwrite new results');
 await call('Emulation.setDeviceMetricsOverride',{width:320,height:844,deviceScaleFactor:1,mobile:true});await submit({category:'Флорист'});
 assert.equal(await evaluate("document.documentElement.scrollWidth>innerWidth"),false);
 console.log('PASS mobile layout');
 await fetch(fixtureOrigin+'/__test/offline-options');await call('Page.navigate',{url:previewOrigin});
 await evaluate("(async()=>{const end=Date.now()+6000;while(document.readyState!=='complete'||document.querySelector('#catalog-retry').hidden){if(Date.now()>end)throw Error('Catalog error timeout');await new Promise(r=>setTimeout(r,30))}return true})()");
 assert.equal(await evaluate("document.querySelector('.submit').disabled"),true);
 await fetch(fixtureOrigin+'/__test/online-options');await evaluate("document.querySelector('#catalog-retry').click()");await evaluate(ready);
 assert.equal(await evaluate("document.querySelector('.submit').disabled"),false);
 console.log('PASS catalog connection failure and recovery');
 await new Promise(r=>{fixtureBackend.close(r);fixtureBackend.closeAllConnections()});await submit();assert.equal((await state()).technical,true);
 console.log('PASS stopped backend produces a connection error');
}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await call('Browser.close')}catch{}ws.close()}
 child.kill();await new Promise(r=>{previewFrontend.close(r);previewFrontend.closeAllConnections()});
 if(fixtureBackend.listening)await new Promise(r=>{fixtureBackend.close(r);fixtureBackend.closeAllConnections()});
 await pause(200);await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
