import {createFrontendServer} from './server.mjs';
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be 1–65535.');
const host=process.env.HOST||'127.0.0.1';
const backendOrigin=process.env.BACKEND_ORIGIN||'http://127.0.0.1:3000';
const server=createFrontendServer({backendOrigin});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,host,()=>{
  console.log('Birge frontend: http://'+host+':'+port);
  console.log('Backend proxy: '+backendOrigin+' (configured on the server only)');
});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
