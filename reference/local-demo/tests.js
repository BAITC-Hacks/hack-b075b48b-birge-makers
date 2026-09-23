/* Run with `node tests.js`; also importable into a JS runtime after data.js/matcher.js. */
(function (root) {
  'use strict';
  if (typeof require === 'function') { require('./data.js'); require('./matcher.js'); }
  const M = root.BirgeMatcher;
  const P = root.BIRGE_PROFILES;
  const q = { city:'Алматы', category:'Ведущий', event:'корпоратив', date:'2026-10-01', budget:1500000, hours:null, language:'' };
  let passed = 0;
  function assert(ok, message) { if (!ok) throw new Error(message); }
  function test(name, run) { run(); passed++; console.log('PASS ' + name); }
  function throws(run) { let failed = false; try { run(); } catch { failed = true; } assert(failed, 'Expected validation error'); }
  test('66 complete profiles, unique IDs and known calendars', () => {
    assert(P.length === 66 && new Set(P.map(p=>p.id)).size === 66, 'Dataset count/IDs');
    assert(P.every(p=>Array.isArray(p.busy_dates) && p.busy_dates.every(d=>d>=M.WINDOW.start&&d<=M.WINDOW.end)), 'Calendars missing');
    assert(P.filter(p=>p.synthetic).length === 13, 'Synthetic flags changed');
  });
  test('Result cap and deterministic order, including reversed input', () => {
    const result = M.match(P,q);
    assert(result.status==='matched' && result.cards.length===3, 'Expected three cards');
    const ids = result.cards.map(p=>p.id).join(',');
    assert(ids===M.match(P,q).cards.map(p=>p.id).join(','), 'Repeated request unstable');
    assert(ids===M.match([...P].reverse(),q).cards.map(p=>p.id).join(','), 'Input order affects ranking');
    assert(result.cards.every(p=>p.explanation.includes('01.10.2026') && p.explanation.includes(M.money(p.price_from_kzt))), 'Explanation lacks date/price');
    assert(new Set(result.cards.map(p=>M.evidence(p))).size===3, 'Interchangeable description evidence');
  });
  test('Different dates change results and name busy exclusions', () => {
    const first=M.match(P,q), second=M.match(P,{...q,date:'2026-10-02'});
    assert(first.cards.map(p=>p.id).join(',')!==second.cards.map(p=>p.id).join(','), 'Dates do not affect selection');
    assert(first.excluded.some(p=>p.reasons.includes('busy')) && second.counts.busy>0, 'Missing busy reasons');
  });
  test('Distinct missing-category and no-match outcomes', () => {
    assert(M.match(P,{...q,city:'Зарубежье',category:'Флорист'}).status==='no_category', 'Missing category');
    const none=M.match(P,{...q,budget:1});
    assert(none.status==='no_match' && none.poolCount>0 && none.cards.length===0 && none.counts.budget===none.poolCount,'No-match reason');
  });
  test('Rare category does not get padded to three', () => {
    const rare=M.match(P,{...q,category:'Флорист',date:'2026-10-04'});
    assert(rare.status==='matched' && rare.cards.length>0 && rare.cards.length<3, 'Expected rare category');
  });
  test('Language, format, budget and duration are hard constraints', () => {
    const p={...P[0],city:q.city,categories:[q.category],busy_dates:[],event_formats:[q.event],languages:['русский'],price_from_kzt:100,max_hours:5};
    const query={...q,budget:100,hours:5,language:'русский'};
    assert(M.match([p],query).cards.length===1,'Exact boundary should pass');
    for(const [key,value,reason] of [['budget',99,'budget'],['hours',5.5,'hours'],['language','английский','language'],['event','той','format']]) {
      const result=M.match([p],{...query,[key]:value});
      assert(result.status==='no_match'&&result.counts[reason]===1,reason+' not applied');
    }
    assert(M.match([{...p,max_hours:null}],{...query,hours:24}).cards.length===1,'null duration is not zero');
  });
  test('Venues obey busy dates and missing calendars are never assumed free', () => {
    const venue=P.find(p=>p.categories.includes('Банкетный зал'));
    const query={...q,city:venue.city,category:'Банкетный зал',event:venue.event_formats[0],budget:venue.price_from_kzt,date:venue.busy_dates[0]};
    assert(M.match([venue],query).counts.busy===1,'Busy venue returned');
    assert(M.match([{...venue,busy_dates:undefined}],query).counts.calendar===1,'Missing calendar assumed free');
  });
  test('Stable ID resolves price ties', () => {
    const p={...P[0],city:q.city,categories:[q.category],busy_dates:[],event_formats:[q.event],price_from_kzt:100};
    assert(M.match([{...p,id:'B'},{...p,id:'A'}],q).cards[0].id==='A','ID tie-break failed');
  });
  test('Out-of-window, impossible dates and invalid numeric inputs are rejected', () => {
    for(const date of ['2026-09-22','2027-01-01','2026-11-31','bad']) throws(()=>M.match(P,{...q,date}));
    for(const budget of [0,-1,NaN,Infinity]) throws(()=>M.match(P,{...q,budget}));
    throws(()=>M.match(P,{...q,hours:0}));
    M.match(P,{...q,date:M.WINDOW.start}); M.match(P,{...q,date:M.WINDOW.end});
  });
  test('All cities/categories across 100 days: no invalid recommendation', () => {
    const cities=[...new Set(P.map(p=>p.city))], categories=[...new Set(P.flatMap(p=>p.categories))];
    let checked=0;
    for(let day=0;day<100;day++) {
      const date=new Date(Date.parse(M.WINDOW.start)+day*86400000).toISOString().slice(0,10);
      for(const city of cities) for(const category of categories) {
        const query={...q,city,category,date,hours:6,language:'русский'};
        const result=M.match(P,query);
        assert(result.cards.length<=3,'Too many cards');
        assert(result.cards.every(p=>p.city===city&&p.categories.includes(category)&&M.reasons(p,query).length===0),'Invalid recommendation');
        assert(result.eligibleCount+result.excluded.length===result.poolCount,'Audit counts inconsistent');
        checked++;
      }
    }
    console.log('  Validated '+checked+' combinations');
  });
  console.log(passed+' test groups passed.');
})(globalThis);
