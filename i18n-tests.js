(function (root) {
  'use strict';
  if (typeof require === 'function') {
    require('./data.js'); require('./matcher.js'); require('./evidence.js'); require('./i18n.js');
  }
  const I=root.BirgeI18n, M=root.BirgeMatcher, P=root.BIRGE_PROFILES;
  const q={city:'Алматы',category:'Ведущий',event:'корпоратив',date:'2026-10-04',budget:1500000,hours:5,language:'русский'};
  function assert(ok,message) { if(!ok) throw new Error(message); }
  const keys=Object.keys(I.messages.kk).sort();
  const expectedIDs=M.match(P,q).cards.map(p=>p.id).join(',');
  const terms=[...new Set(P.flatMap(p=>[p.city,...p.categories,...p.event_formats,...p.languages]))];
  for(const locale of ['kk','ru','en']) {
    I.setLocale(locale);
    assert(JSON.stringify(Object.keys(I.messages[locale]).sort())===JSON.stringify(keys),'Incomplete UI dictionary: '+locale);
    for(const key of keys) {
      const placeholders=[...I.messages.kk[key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
      assert(JSON.stringify([...I.messages[locale][key].matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort())===JSON.stringify(placeholders),'Placeholder mismatch: '+locale+'/'+key);
      assert(I.t(key).length>0,'Empty translation');
    }
    for(const term of terms) assert(Object.hasOwn(I.terms,term),'Untranslated dataset term: '+term);
    for(const profile of P) {
      if(locale!=='ru') assert(root.BIRGE_EVIDENCE[profile.id]?.[locale],'Missing profile evidence: '+profile.id+'/'+locale);
      const explanation=I.explain(profile,q);
      assert([...new Intl.Segmenter(locale,{granularity:'sentence'}).segment(explanation)].length<=2,'Explanation exceeds two sentences: '+profile.id);
      assert(!/\{\w+\}/.test(explanation),'Unresolved explanation placeholder');
      assert(explanation.includes(I.money(profile.price_from_kzt)),'Missing actual price');
      if(locale==='en') assert(!/[А-Яа-яЁё]/.test(explanation),'Russian text leaked into English explanation: '+profile.id);
    }
    for(const query of [q,{...q,budget:1},{...q,city:'Зарубежье',category:'Флорист'}]) {
      const result=M.match(P,query);
      const titleKey={matched:'matchedTitle',no_match:'noMatchTitle',no_category:'noCategoryTitle'}[result.status];
      assert(!/\{\w+\}/.test(I.t(titleKey,{count:result.cards.length})),'Untranslated result state');
    }
    assert(M.match(P,q).cards.map(p=>p.id).join(',')===expectedIDs,'Locale changes matching');
    assert(I.startingPrice(700000).includes(I.money(700000)),'Starting price lost its amount');
    if(locale==='kk') assert(I.startingPrice(700000).endsWith('₸ бастап / іс-шараға'),'Kazakh price format incorrect');
    for(const profile of P) {
      const notes=I.provenanceNotes(profile);
      assert(notes.includes(I.t('cityDataNote'))===profile.city_imputed,'Incorrect city provenance');
      assert(notes.includes(I.t('priceDataNote'))===profile.price_imputed,'Incorrect price provenance');
      assert(notes.length===Number(profile.city_imputed)+Number(profile.price_imputed),'Unexpected provenance note');
    }
    const sameRequest={...q,budget:10000000,hours:null,language:''};
    const musicA=P.find(p=>p.id==='HK-83709'),musicB=P.find(p=>p.id==='HK-23752');
    assert(I.explain(musicA,sameRequest)!==I.explain(musicB,sameRequest),'Similar bands have interchangeable explanations');
    for(const [patch,code] of [[{date:''},'date'],[{date:'2027-01-01'},'dateRange'],[{budget:0},'budget'],[{hours:-1},'hours'],[{city:''},'selection']]) {
      let caught=false;
      try { M.validate({...q,...patch}); } catch(error) { caught=true; assert(error.code===code,'Wrong validation code'); assert(I.t('error_'+error.code).length>0,'Untranslated error'); }
      assert(caught,'Invalid input accepted');
    }
    console.log('PASS '+locale+': '+keys.length+' UI strings, '+terms.length+' terms, 66 explanations, 3 outcomes, validation and stable matching');
  }
  I.setLocale('__proto__'); assert(I.getLocale()==='kk','Invalid saved locale should fall back to Kazakh');
  console.log('PASS unknown locale falls back to kk');
})(globalThis);
