(function(root) {
  'use strict';
  if(typeof require === 'function') { require('./data.js');require('./matcher.js');require('./form-utils.js');require('./i18n.js'); }
  const F=root.BirgeForm, P=root.BIRGE_PROFILES, M=root.BirgeMatcher;
  const categories=[...new Set(P.flatMap(p=>p.categories))];
  const valid={city:'Алматы',date:'2026-10-04',event:'корпоратив',category:'Ведущий',budget:'1 500 000',hours:'',language:''};
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  let count=0;
  function test(name,run){run();count++;console.log('PASS '+name);}
  test('All five required fields report individual errors',()=>{
    const result=F.validate({city:'',date:'',event:'',category:'',budget:'',hours:'',language:''},categories);
    assert(Object.keys(result.errors).join(',')==='city,date,event,category,budget','Missing inline errors');
    assert(result.errors.date==='dateRequired'&&result.errors.budget==='budgetRequired','Required errors not specific');
  });
  test('Grouped budget input, pasted currency and safe round trips',()=>{
    for(const input of ['1500000','1 500 000','1\u00a0500\u202f000','1 500 000 ₸','1,500,000 ₸']) {
      assert(F.parseBudget(input)===1500000,'Failed valid input '+input);
      assert(F.formatBudget(input)==='1 500 000','Failed formatting '+input);
      assert(F.parseBudget(F.formatBudget(input))===1500000,'Round trip altered budget');
    }
    for(const value of [1,999,1000,999999,1500000,Number.MAX_SAFE_INTEGER]) assert(F.parseBudget(F.formatBudget(String(value)))===value,'Amount changed');
  });
  test('Invalid amounts are rejected, never silently converted',()=>{
    for(const input of ['', '0', '-100', '500.50', '1,5', '1e6', '120abc', 'Infinity','9007199254740992']) assert(Number.isNaN(F.parseBudget(input)),'Accepted invalid budget '+input);
    assert(F.formatBudget('-100')==='-100'&&F.formatBudget('12abc')==='12abc','Invalid input overwritten');
  });
  test('Missing, impossible and out-of-window dates get distinct messages',()=>{
    for(const [date,code] of [['','dateRequired'],['2026-11-31','date'],['invalid','date'],['2026-09-22','dateRange'],['2027-01-01','dateRange']]) assert(F.validate({...valid,date},categories).errors.date===code,'Wrong date error '+date);
    for(const date of ['2026-09-23','2026-12-31']) assert(!F.validate({...valid,date},categories).errors.date,'Valid boundary rejected');
  });
  test('Optional fields, exact cities/events and catalogue venue categories',()=>{
    assert(Object.keys(F.validate(valid,categories).errors).length===0,'Optional fields required');
    assert(F.validate(valid,categories).query.hours===null,'Empty hours should be null');
    for(const hours of ['0','-1','invalid']) assert(F.validate({...valid,hours},categories).errors.hours==='hours','Invalid hours accepted');
    assert(F.validate({...valid,hours:'2.5',language:'казахский'},categories).query.hours===2.5,'Fractional hours rejected');
    assert(!F.validate({...valid,hours:'.5'},categories).errors.hours,'Half an hour rejected');
    assert(F.cities.join('|')==='Алматы|Астана|Зарубежье'&&F.events.length===6&&F.languages.length===3,'Wrong options');
    for(const category of ['Банкетный зал','Отель']) assert(!F.validate({...valid,category},categories).errors.category,'Venue missing from common categories');
    for(const [field,value] of [['city','Лондон'],['category','Unknown'],['event','Unknown'],['language','Unknown']]) assert(F.validate({...valid,[field]:value},categories).errors[field]===field,'Unknown option accepted');
  });
  test('Validation keeps input intact and valid currency drives actual matching',()=>{
    const raw={...valid,date:'2027-01-01',budget:'-300',hours:'7'};const before=JSON.stringify(raw);
    F.validate(raw,categories);assert(JSON.stringify(raw)===before,'Input changed on validation');
    const result=M.match(P,F.validate(valid,categories).query);
    assert(result.status==='matched'&&result.cards.length===3,'Formatted currency broke matching');
    assert(result.cards.every(p=>p.price_from_kzt<=1500000),'Budget not enforced');
  });
  test('Every field error is available in all three interface languages',()=>{
    const codes=['city','dateRequired','date','dateRange','event','category','budgetRequired','budget','hours','language'];
    for(const locale of ['kk','ru','en']) {root.BirgeI18n.setLocale(locale);for(const code of codes)assert(root.BirgeI18n.t('error_'+code).length>0,'Missing translated error');}
    root.BirgeI18n.setLocale('kk');
  });
  console.log(count+' form test groups passed.');
})(globalThis);
