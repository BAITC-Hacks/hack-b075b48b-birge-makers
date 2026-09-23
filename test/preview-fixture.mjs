/* TEST ONLY. Synthetic contract responses, not the Birge agent or a production fallback. */
import {createServer} from 'node:http';
import {createFrontendServer} from '../server.mjs';
const options={cities:['Алматы','Астана','Зарубежье'],categories:['Ведущий','Флорист','Банкетный зал'],event_formats:['корпоратив','свадьба','той'],languages:['казахский','русский','английский'],calendar_coverage:{start:'2026-09-23',end:'2026-12-31'},total_count:6};
const send=(res,status,data)=>{if(!res.destroyed){res.writeHead(status,{'Content-Type':'application/xml; charset=utf-8'});res.end('<response>'+JSON.stringify(data)+'</response>')}};
const sample=(id,order,extra={})=>({id,name:'Тестовый профиль '+id,category:order.category,city:order.city,price_from_kzt:500000,explanation:'Тестовый ответ сервера: корпоратив, бюджет и язык совпадают.',price_note:'Тестовое примечание сервера: цена от 500 000 ₸.',data_flags:{synthetic:true,price_imputed:false,city_imputed:false},evidence:[{text:'Факт из тестового профиля.'}],...extra});
let catalogUnavailable=false, transientFailed=false;
export const fixtureBackend=createServer((req,res)=>{
 if(req.url==='/__test/offline-options'){catalogUnavailable=true;send(res,200,{ok:true});return}
 if(req.url==='/__test/online-options'){catalogUnavailable=false;send(res,200,{ok:true});return}
 if(req.url==='/health'){send(res,200,{ok:true,ai:{ready:false}});return}
 if(req.url==='/catalog/options'){send(res,catalogUnavailable?503:200,catalogUnavailable?{error:{code:'CATALOG_UNAVAILABLE',message:'Тест: каталог недоступен.'}}:options);return}
 if(req.url!=='/recommend'){send(res,404,{error:{message:'Unknown test route'}});return}
 const chunks=[];req.on('data',x=>chunks.push(x));req.on('end',()=>{
  const order=JSON.parse(Buffer.concat(chunks).toString());
  if(order.budget===123){send(res,400,{error:{code:'INVALID_ORDER',message:'Тест: исправьте бюджет.',fields:{budget:'Тестовая ошибка поля бюджета.'}}});return}
  if(order.budget===1500456&&!transientFailed){transientFailed=true;send(res,500,{error:{code:'INTERNAL_ERROR',message:'Тест: сбой сервиса.'}});return}
  if(order.budget===789){res.writeHead(200,{'Content-Type':'text/html'});res.end('<html>wrong proxy page</html>');return}
  let result;
  if(order.city==='Зарубежье')result={status:'no_category_in_city',cards:[],eligible_count:0,meta_explanation:'Тест: в этом городе нет такой категории.',rejection_stats:{}};
  else if(order.budget===0)result={status:'no_match',cards:[],eligible_count:0,meta_explanation:'Тест: начальная цена выше бюджета.',rejection_stats:{budget:3}};
  else if(order.category==='Банкетный зал'&&order.date==='2026-11-14')result={status:'no_match',cards:[],eligible_count:0,meta_explanation:'Тест: площадка занята на эту дату.',rejection_stats:{busy:1}};
  else if(order.category==='Банкетный зал')result={status:'matched',cards:[sample('TEST-VENUE',order)],eligible_count:1,meta_explanation:'Тест: единственная свободная площадка.',rejection_stats:{}};
  else if(order.category==='Флорист')result={status:'matched',cards:[sample('TEST-FLORIST',order)],eligible_count:1,meta_explanation:'Тест: только один флорист прошёл условия.',rejection_stats:{budget:1},explanation_limitations:['Тестовое ограничение объяснения.']};
  else result={status:'matched',cards:[sample(order.city==='Астана'?'TEST-NEW':'TEST-Z',order,{price_from_kzt:700000}),sample('TEST-A',order,{price_from_kzt:500000,name:'<img src=x onerror=alert(1)>',data_flags:{synthetic:true,price_imputed:true,city_imputed:true}}),sample('TEST-M',order,{price_from_kzt:600000})],eligible_count:4,meta_explanation:'Тест: подходят четыре, показаны три.',rejection_stats:{}};
  setTimeout(()=>send(res,200,result),order.budget===1500001?700:40);
 });
});
await new Promise(resolve=>fixtureBackend.listen(0,'127.0.0.1',resolve));
export const fixtureOrigin='http://127.0.0.1:'+fixtureBackend.address().port;
console.log('TEST FIXTURE backend: '+fixtureOrigin);
export const previewFrontend=createFrontendServer({backendOrigin:fixtureOrigin});
await new Promise(resolve=>previewFrontend.listen(0,'127.0.0.1',resolve));
export const previewOrigin='http://127.0.0.1:'+previewFrontend.address().port;
console.log('TEST ONLY frontend: '+previewOrigin);
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{previewFrontend.close();fixtureBackend.close()});
