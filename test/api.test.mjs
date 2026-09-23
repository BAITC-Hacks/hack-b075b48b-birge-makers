import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/api/birge.js';
import '../form-utils.js';
import '../i18n.js';
import '../result-state.js';
const A=globalThis.BirgeApi,F=globalThis.BirgeForm;
const options={cities:['Алматы','Астана'],categories:['Ведущий','Банкетный зал'],event_formats:['корпоратив','свадьба'],languages:['казахский','русский'],calendar_coverage:{start:'2027-01-01',end:'2027-02-28'}};
const raw={city:'Алматы',date:'2027-01-15',event_format:'корпоратив',category:'Ведущий',budget:'1 500 000 ₸',duration_hours:'6',language:''};
const card={id:'TEST-Z',name:'<img src=x onerror=alert(1)>',category:'Ведущий',city:'Алматы',price_from_kzt:700000,explanation:'Бюджет позволяет оплатить 6 часов.',price_note:'Начальная цена.',data_flags:{synthetic:true},evidence:['Рабочий язык: казахский']};
const matched={status:'matched',cards:[card],eligible_count:1,meta_explanation:'Один кандидат прошёл условия.',rejection_stats:{busy:1,budget:2},explanation_limitations:['Стоимость нужно уточнить.']};
const envelope=value=>'<response>'+JSON.stringify(value)+'</response>';
test('Typed form mapping: zero budget, grouped amounts, null optionals, strict whole hours',()=>{
 assert.deepEqual(A.orderFromForm(raw),{city:'Алматы',date:'2027-01-15',event_format:'корпоратив',category:'Ведущий',budget:1500000,duration_hours:6,language:null});
 assert.equal(A.orderFromForm({...raw,budget:'0'}).budget,0);
 assert.equal(A.orderFromForm({...raw,budget:'1,500,000 ₸',duration_hours:''}).duration_hours,null);
 for(const patch of [{budget:''},{budget:'-1'},{budget:'1.5'},{duration_hours:'1.5'},{duration_hours:'0'},{date:'2027-02-30'}])assert.throws(()=>A.orderFromForm({...raw,...patch}),error=>error.code==='FORM_ERROR');
 assert.equal(F.formatBudget('1500000'),'1 500 000');
});
test('Options drive validation and dates, input object is preserved',()=>{
 A.validateOptions(options);
 const before=JSON.stringify(raw);
 assert.deepEqual(F.validate(raw,options).errors,{});
 assert.equal(F.validate({...raw,date:'2026-10-04'},options).errors.date,'dateRange');
 assert.equal(F.validate({...raw,category:'Флорист'},options).errors.category,'category');
 assert.equal(F.validate({...raw,duration_hours:'2.5'},options).errors.duration_hours,'hours');
 assert.equal(JSON.stringify(raw),before);
});
test('XML envelope parses text without executing or rewriting it',()=>{
 const result=A.parseEnvelope(envelope(matched));
 assert.equal(result.cards[0].name,card.name);
 assert.deepEqual(A.validateRecommendation(result),matched);
 for(const bad of ['<html>fallback page</html>',JSON.stringify(matched),'<response>no</response>','<response>[]</response>'])assert.throws(()=>A.parseEnvelope(bad),error=>error.code==='INVALID_RESPONSE');
});
test('HTTP client sends exact contract and keeps backend order',async()=>{
 const response={...matched,cards:[card,{...card,id:'TEST-A',price_from_kzt:1}],eligible_count:2};
 let sent;
 const api=A.createBirgeApi('/api',{fetchImpl:async(url,init)=>{sent={url,init};return new Response(envelope(response),{status:200})}});
 const order=A.orderFromForm(raw),result=await api.recommend(order,{locale:'kk'});
 assert.equal(sent.url,'/api/recommend');assert.equal(sent.init.method,'POST');
 assert.equal(sent.init.headers['Content-Type'],'application/json');assert.deepEqual(JSON.parse(sent.init.body),order);
 assert.deepEqual(result.cards.map(x=>x.id),['TEST-Z','TEST-A']);
});
test('Three outcomes, exclusive counters and server explanations remain distinct',()=>{
 for(const locale of ['kk','ru','en']){
  globalThis.BirgeI18n.setLocale(locale);
  const found=globalThis.BirgeResultState.describe(matched);
  assert.equal(found.message,matched.meta_explanation);assert.equal(found.counts[0].count,1);
  assert.deepEqual(found.limitations,matched.explanation_limitations);
  assert.equal(globalThis.BirgeResultState.describe({...matched,status:'no_match',cards:[],eligible_count:0}).status,'no_match');
  assert.deepEqual(globalThis.BirgeResultState.describe({...matched,status:'no_category_in_city',cards:[],eligible_count:0,rejection_stats:{}}).actions,['city','category']);
 }
 assert.throws(()=>A.validateRecommendation({...matched,status:'unknown'}));
 assert.throws(()=>A.validateRecommendation({...matched,cards:[card,card]}));
});
test('Backend field error and HTTP status are preserved',async()=>{
 const api=A.createBirgeApi('/api',{fetchImpl:async()=>new Response(envelope({error:{code:'INVALID_ORDER',message:'Неверная дата',fields:{date:'Вне календаря'}}}),{status:400})});
 await assert.rejects(api.recommend(A.orderFromForm(raw)),e=>e.status===400&&e.code==='INVALID_ORDER'&&e.message==='Неверная дата'&&e.fields.date==='Вне календаря');
});
test('Network failure, invalid success response, cancellation and timeout differ',async()=>{
 await assert.rejects(A.createBirgeApi('/api',{fetchImpl:async()=>{throw new TypeError('offline')}}).getOptions(),e=>e.code==='NETWORK_ERROR');
 await assert.rejects(A.createBirgeApi('/api',{fetchImpl:async()=>new Response('<html>oops</html>')}).getOptions(),e=>e.code==='INVALID_RESPONSE');
 const slow=(_url,{signal})=>new Promise((_resolve,reject)=>{if(signal.aborted)reject(new DOMException('Aborted','AbortError'));else signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true})});
 const controller=new AbortController(),pending=A.createBirgeApi('/api',{fetchImpl:slow}).getOptions({signal:controller.signal});controller.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');
 await assert.rejects(A.createBirgeApi('/api',{fetchImpl:slow,timeoutMs:5}).getOptions(),e=>e.code==='TIMEOUT');
});
test('Localization keys and placeholders are complete in all three languages',()=>{
 const dict=globalThis.BirgeI18n.messages,keys=Object.keys(dict.kk).sort();
 for(const locale of ['ru','en']){
  assert.deepEqual(Object.keys(dict[locale]).sort(),keys);
  for(const key of keys)assert.deepEqual([...dict[locale][key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort(),[...dict.kk[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort());
 }
});
