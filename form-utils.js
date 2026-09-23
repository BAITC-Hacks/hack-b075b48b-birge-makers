/* Form values follow the HTTP contract. Options and dates are supplied by the backend. */
(function(root){
  'use strict';
  if(typeof module!=='undefined'&&module.exports&&!root.BirgeApi) require('./src/api/birge.js');
  const A=root.BirgeApi;
  const ids={city:'city',date:'date',event_format:'event',category:'category',budget:'budget',duration_hours:'hours',language:'language'};
  function parseBudget(value){return A.numericBudget(value);}
  function formatBudget(value){
    const text=String(value).trim().replace(/\s*₸$/,'').trim();
    let digits;
    if(/^[0-9\s]+$/.test(text)) digits=text.replace(/\s/g,'');
    else if(/^[0-9]{1,3}(?:,[0-9]{3})+$/.test(text)) digits=text.replace(/,/g,'');
    else return String(value);
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g,' ');
  }
  function validate(raw,options){
    const errors={};
    if(!options) return {errors:{},order:null};
    if(!options.cities.includes(raw.city)) errors.city='city';
    if(!raw.date) errors.date='dateRequired';
    else if(!A.isDate(raw.date)) errors.date='date';
    else if(raw.date<options.calendar_coverage.start||raw.date>options.calendar_coverage.end) errors.date='dateRange';
    if(!options.event_formats.includes(raw.event_format)) errors.event_format='event';
    if(!options.categories.includes(raw.category)) errors.category='category';
    if(!String(raw.budget??'').trim()) errors.budget='budgetRequired';
    else if(!Number.isFinite(parseBudget(raw.budget))) errors.budget='budget';
    const hours=String(raw.duration_hours??'').trim();
    if(hours&&(!/^\d+$/.test(hours)||!Number.isSafeInteger(Number(hours))||Number(hours)<1)) errors.duration_hours='hours';
    if(raw.language&&!options.languages.includes(raw.language)) errors.language='language';
    return {errors,order:Object.keys(errors).length?null:A.orderFromForm(raw)};
  }
  const api={ids,parseBudget,formatBudget,validate};
  root.BirgeForm=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(globalThis);
