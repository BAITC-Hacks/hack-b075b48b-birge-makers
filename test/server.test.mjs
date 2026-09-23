import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {createFrontendServer} from '../server.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve('http://127.0.0.1:'+server.address().port)));
const close=server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()});
test('Same-origin proxy forwards path, verb, typed body, response and backend failures',async()=>{
 const requests=[];
 const backend=createServer((req,res)=>{
  const chunks=[];req.on('data',x=>chunks.push(x));req.on('end',()=>{
   requests.push({path:req.url,method:req.method,body:Buffer.concat(chunks).toString(),locale:req.headers['accept-language']});
   if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/xml'});res.end('<response>{"ai":{"ready":false}}</response>');return}
   res.writeHead(400,{'Content-Type':'application/xml'});res.end('<response>{"error":{"code":"INVALID_ORDER","message":"Проверьте дату"}}</response>');
  });
 });
 const origin=await listen(backend),frontend=createFrontendServer({rootDir:root,backendOrigin:origin}),base=await listen(frontend);
 try{
  const health=await fetch(base+'/api/health');assert.equal(health.status,200);assert.equal((await health.text()),'<response>{"ai":{"ready":false}}</response>');
  const recommendation=await fetch(base+'/api/recommend',{method:'POST',headers:{'Content-Type':'application/json','Accept-Language':'kk'},body:'{"budget":0}'});
  assert.equal(recommendation.status,400);assert.ok((await recommendation.text()).includes('Проверьте дату'));
  assert.deepEqual(requests[1],{path:'/recommend',method:'POST',body:'{"budget":0}',locale:'kk'});
  const page=await fetch(base+'/');assert.equal(page.status,200);const html=await page.text();assert.ok(html.includes('src/api/birge.js'));assert.ok(!html.includes('src="data.js"'));
  for(const resource of ['/server.mjs','/.env','/data.js','/api/explain'])assert.equal((await fetch(base+resource)).status,404);
  assert.equal((await fetch(base+'/api/recommend')).status,405);
  assert.equal((await fetch(base+'/api/recommend',{method:'POST',body:'x'.repeat(70000)})).status,413);
  assert.equal(requests.length,2);
  await close(backend);
  const offline=await fetch(base+'/api/health');assert.equal(offline.status,502);assert.ok((await offline.text()).includes('PROXY_ERROR'));
 }finally{await close(frontend);if(backend.listening)await close(backend)}
});
test('Slow backend gets a timeout envelope, not an empty recommendation',async()=>{
 const backend=createServer(()=>{}),origin=await listen(backend),frontend=createFrontendServer({rootDir:root,backendOrigin:origin,proxyTimeoutMs:20}),base=await listen(frontend);
 try{const response=await fetch(base+'/api/health');assert.equal(response.status,504);assert.ok((await response.text()).includes('TIMEOUT'))}finally{await close(frontend);await close(backend)}
});
