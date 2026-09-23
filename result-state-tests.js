(function(root) {
  'use strict';
  if(typeof require==='function') {
    require('./data.js');require('./matcher.js');require('./form-utils.js');require('./evidence.js');require('./i18n.js');require('./result-state.js');
  }
  const P=root.BIRGE_PROFILES,M=root.BirgeMatcher,S=root.BirgeResultState,I=root.BirgeI18n;
  const categories=[...new Set(P.flatMap(p=>p.categories))];
  const raw=Object.freeze({city:'Алматы',date:'2026-10-04',event:'корпоратив',category:'Ведущий',budget:'1 500 000',hours:'',language:''});
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  let count=0;
  function test(name,run){run();count++;console.log('PASS '+name);}
  test('All three normal states stay separate from technical failure',()=>{
    const found=S.run(raw,categories),absent=S.run({...raw,city:'Зарубежье',category:'Флорист'},categories),none=S.run({...raw,budget:'1'},categories);
    assert([found,absent,none].every(x=>x.kind==='result'),'Normal empty result treated as error');
    assert(found.state.status==='matched'&&found.state.shown===3,'Matched state');
    assert(absent.state.status==='no_category'&&absent.state.shown===0,'Absent category state');
    assert(none.state.status==='no_match'&&none.result.poolCount>0&&none.state.shown===0,'No-match state');
    assert(absent.state.actions.join(',')==='city,category','Missing city/category actions');
    assert(none.state.actions.includes('budget')&&none.state.actions.includes('category'),'Missing relevant actions');
  });
  test('Counts come from real exclusions, including overlapping reasons',()=>{
    const outcome=S.run({...raw,budget:'1'},categories);
    for(const item of outcome.state.counts) {
      assert(item.count===outcome.result.excluded.filter(p=>p.reasons.includes(item.reason)).length,'Invented count');
      assert(item.count>0,'Zero reason shown');
    }
    assert(outcome.state.counts.find(x=>x.reason==='budget').count===outcome.result.poolCount,'Budget counts wrong');
    assert(outcome.state.actions.includes('date')===(outcome.result.counts.busy>0),'Date action unrelated to busy data');
  });
  test('Rare category explains a short result and keeps the exact count',()=>{
    const outcome=S.run({...raw,category:'Флорист'},categories);
    assert(outcome.kind==='result'&&outcome.state.shown===1,'Rare result count');
    assert(outcome.state.eligible===outcome.result.eligibleCount&&outcome.state.counts.length>0,'Short result lacks exclusions');
    const single=outcome.result.cards[0];
    const only=S.run({...raw,category:'Флорист'},categories,(_,query)=>M.match([single],query));
    assert(only.state.shown===1&&only.state.counts.length===0,'Invented exclusions in a small catalogue');
    assert(only.state.message.includes(I.t('rare')),'Small catalogue explanation missing');
  });
  test('Field actions match language, duration and format failures',()=>{
    const outcome=S.run({...raw,budget:'1',hours:'100',language:'английский'},categories);
    const mapping={busy:'date',budget:'budget',format:'event',hours:'hours',language:'language'};
    for(const [reason,field] of Object.entries(mapping)) assert(outcome.state.actions.includes(field)===(outcome.result.counts[reason]>0),'Wrong field action '+field);
  });
  test('A technical exception can be retried without changing inputs',()=>{
    const before=JSON.stringify(raw);let attempts=0;
    const temporaryFailure=(profiles,query)=>{attempts++;if(attempts===1)throw new Error('temporary failure');return M.match(profiles,query);};
    assert(S.run(raw,categories,temporaryFailure).kind==='technical','Exception classified as no-match');
    const retried=S.run(raw,categories,temporaryFailure);
    assert(retried.kind==='result'&&retried.state.status==='matched'&&attempts===2,'Retry failed');
    assert(JSON.stringify(raw)===before,'Retry changed input');
    assert(retried.result.cards.map(p=>p.id).join(',')===S.run(raw,categories).result.cards.map(p=>p.id).join(','),'Retry altered ranking');
  });
  test('Validation failures do not invoke matching or show a technical error',()=>{
    let called=false;
    const outcome=S.run({...raw,date:'',budget:''},categories,()=>{called=true;throw Error('should not run');});
    assert(outcome.kind==='validation'&&outcome.errors.date&&outcome.errors.budget&&!called,'Invalid form reached matcher');
  });
  test('Malformed responses show technical failure, not a normal empty result',()=>{
    for(const result of [null,{}, {status:'no_category',cards:[],eligibleCount:1,poolCount:0,excluded:[],counts:{}}]) assert(S.run(raw,categories,()=>result).kind==='technical','Malformed result accepted');
  });
  test('State text, action labels and technical retry are translated in all languages',()=>{
    for(const locale of ['kk','ru','en']) {
      I.setLocale(locale);
      const outcomes=[S.run(raw,categories),S.run({...raw,budget:'1'},categories),S.run({...raw,city:'Зарубежье',category:'Флорист'},categories)];
      assert(new Set(outcomes.map(x=>x.state.title)).size===3,'Indistinguishable titles');
      for(const outcome of outcomes) {
        assert(!/\{\w+\}/.test(outcome.state.title+outcome.state.message),'Unresolved text');
        outcome.state.actions.forEach(field=>assert(I.t('change_'+field).length>0,'Missing action translation'));
      }
      for(const key of ['technicalTitle','technicalText','retry'])assert(I.t(key).length>0,'Missing technical translation');
    }
    I.setLocale('kk');
  });
  console.log(count+' result-state test groups passed.');
})(globalThis);
