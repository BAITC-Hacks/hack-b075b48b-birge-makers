import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnvelope, validateOrder, latestRequests } from '../public/api.js';
import { t, label } from '../public/i18n.js';

const values={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:'1500000',duration_hours:'',language:' '};
const coverage={start:'2026-09-23',end:'2026-12-31'};
test('UI: бюджет — число, необязательные пустые поля — null; пустой бюджет не ноль',()=>{
  const result=validateOrder(values,coverage);
  assert.deepEqual(result.errors,{}); assert.equal(result.order.budget,1500000);
  assert.equal(result.order.duration_hours,null); assert.equal(result.order.language,null);
  assert.equal(validateOrder({...values,budget:''},coverage).errors.budget,'required');
  assert.equal(validateOrder({...values,duration_hours:'1.5'},coverage).errors.duration_hours,'hoursError');
  assert.equal(validateOrder({...values,date:'2026-02-30'},coverage).errors.date,'dateError');
});
test('UI: клиент принимает XML-конверт backend, но отклоняет HTML/невалидный JSON',()=>{
  assert.deepEqual(parseEnvelope('<response>{"text":"\\u003cimg\\u003e"}</response>'),{text:'<img>'});
  for(const text of ['<html>hi</html>','<response>bad</response>','<response>null</response>']) assert.throws(()=>parseEnvelope(text),{code:'INVALID_RESPONSE'});
});
test('UI: поздний ответ игнорируется, даже если транспорт не поддерживает отмену',async()=>{
  const requests=latestRequests(), old=requests.begin(); let published='';
  let release; const ignoredAbortTransport=new Promise(resolve=>{release=resolve;});
  const oldWork=ignoredAbortTransport.then(()=>{if(old.current())published='old';});
  const current=requests.begin(); assert.ok(old.signal.aborted);
  if(current.current())published='new'; release(); await oldWork;
  assert.equal(published,'new'); requests.cancel(); assert.equal(current.current(),false);
});
test('UI: три локали меняют только подписи, без изменения канонических значений',()=>{
  assert.equal(label('Ведущий','kk'),'Жүргізуші');
  assert.equal(label('Ведущий','en'),'Host');
  assert.equal(label('Ведущий','ru'),'Ведущий');
  for(const lang of ['kk','ru','en']) assert.ok(t('sourceNote',lang).length>20);
});
