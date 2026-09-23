import {createServer, request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const defaultRoot=fileURLToPath(new URL('.',import.meta.url));
const routes=new Map([['/api/catalog/options','GET'],['/api/recommend','POST'],['/api/health','GET']]);
const publicFiles=new Set(['index.html','styles.css','app.js','i18n.js','form-utils.js','result-state.js','src/api/birge.js']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8'};
function errorResponse(res,status,code,message){
  if(res.writableEnded||res.destroyed)return;
  res.writeHead(status,{'Content-Type':'application/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end('<response>'+JSON.stringify({error:{code,message}})+'</response>');
}
function forward(req,res,target,timeoutMs){
  const chunks=[];let size=0,rejected=false;
  req.on('data',chunk=>{
    size+=chunk.length;
    if(size>65536){rejected=true;chunks.length=0;errorResponse(res,413,'BODY_TOO_LARGE','Запрос слишком большой.');}
    else if(!rejected)chunks.push(chunk);
  });
  req.on('end',()=>{
    if(rejected||res.destroyed)return;
    const payload=Buffer.concat(chunks);
    const headers={Accept:req.headers.accept||'application/xml'};
    if(req.headers['accept-language'])headers['Accept-Language']=req.headers['accept-language'];
    if(req.method==='POST'){
      headers['Content-Type']=req.headers['content-type']||'';
      headers['Content-Length']=payload.length;
    }
    const upstream=(target.protocol==='https:'?httpsRequest:httpRequest)(target,{method:req.method,headers},response=>{
      res.writeHead(response.statusCode||502,{'Content-Type':response.headers['content-type']||'application/xml; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      response.pipe(res);
      response.on('error',()=>res.destroy());
    });
    upstream.setTimeout(timeoutMs,()=>{errorResponse(res,504,'TIMEOUT','Сервис не ответил вовремя.');upstream.destroy();});
    upstream.on('error',()=>errorResponse(res,502,'PROXY_ERROR','Не удалось подключиться к сервису подбора.'));
    res.on('close',()=>{if(!res.writableEnded)upstream.destroy()});
    upstream.end(payload);
  });
  req.on('error',()=>{});
}
export function createFrontendServer({rootDir=defaultRoot,backendOrigin='http://127.0.0.1:3000',proxyTimeoutMs=15000}={}){
  const backend=new URL(backendOrigin);
  if(!['http:','https:'].includes(backend.protocol)||backend.username||backend.password||backend.search||backend.hash||backend.pathname!=='/')throw new Error('BACKEND_ORIGIN must be an http(s) origin without credentials or a path.');
  const base=path.resolve(rootDir);
  const server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,'http://localhost');
      if(url.pathname.startsWith('/api/')){
        const method=routes.get(url.pathname);
        if(!method)return errorResponse(res,404,'NOT_FOUND','Неизвестный API-маршрут.');
        if(req.method!==method){res.setHeader('Allow',method);return errorResponse(res,405,'METHOD_NOT_ALLOWED','Недопустимый метод запроса.');}
        const target=new URL(url.pathname.slice(4)+url.search,backend);
        forward(req,res,target,proxyTimeoutMs);return;
      }
      if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return errorResponse(res,405,'METHOD_NOT_ALLOWED','Недопустимый метод запроса.');}
      const relative=decodeURIComponent(url.pathname).replace(/^\/+/,'')||'index.html';
      const asset=relative.startsWith('assets/')&&/\.(?:png|jpg|jpeg|webp|svg|ttf|woff2|txt)$/i.test(relative);
      if(!publicFiles.has(relative)&&!asset)return errorResponse(res,404,'NOT_FOUND','Файл не найден.');
      const resolved=path.resolve(base,relative);
      if(!resolved.startsWith(base+path.sep))return errorResponse(res,404,'NOT_FOUND','Файл не найден.');
      const actual=await realpath(resolved);
      if(!actual.startsWith(base+path.sep))return errorResponse(res,404,'NOT_FOUND','Файл не найден.');
      const bytes=await readFile(actual);
      res.writeHead(200,{
        'Content-Type':types[path.extname(actual).toLowerCase()]||'application/octet-stream',
        'Content-Length':bytes.length,'Cache-Control':asset?'public, max-age=86400':'no-cache',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
        'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
      });
      res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){
      errorResponse(res,error.code==='ENOENT'||error.code==='ENOTDIR'?404:500,'SERVER_ERROR','Не удалось открыть ресурс.');
    }
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  return server;
}
