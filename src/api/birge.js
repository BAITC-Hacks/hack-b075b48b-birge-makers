/* Browser client for Birge Explain. The backend is the source of recommendations. */
(function (root) {
  'use strict';
  class BirgeApiError extends Error {
    constructor(message, {status=0, code='INVALID_RESPONSE', fields=null} = {}) {
      super(message); this.name='BirgeApiError'; this.status=status; this.code=code; this.fields=fields;
    }
  }
  const invalid = message => new BirgeApiError(message,{code:'INVALID_RESPONSE'});
  function parseEnvelope(text) {
    if(typeof text!=='string'||text.length>2000000) throw invalid('Некорректный размер ответа сервиса.');
    const match=text.replace(/^\uFEFF/,'').trim().match(/^<response>\s*([\s\S]*?)\s*<\/response>$/);
    if(!match) throw invalid('Сервис вернул ответ в неизвестном формате.');
    let value; try { value=JSON.parse(match[1]); } catch { throw invalid('Не удалось прочитать ответ сервиса.'); }
    if(!value||typeof value!=='object'||Array.isArray(value)) throw invalid('Некорректный ответ сервиса.');
    return value;
  }
  function isDate(value) {
    return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  }
  function validateOptions(value) {
    for(const field of ['cities','categories','event_formats','languages']) {
      if(!Array.isArray(value[field])||!value[field].every(x=>typeof x==='string'&&x.trim())||new Set(value[field]).size!==value[field].length) throw invalid('Некорректный справочник: '+field);
    }
    const coverage=value.calendar_coverage;
    if(!coverage||!isDate(coverage.start)||!isDate(coverage.end)||coverage.start>coverage.end) throw invalid('Сервис не предоставил корректный диапазон календаря.');
    return value;
  }
  function validateRecommendation(value) {
    if(!['matched','no_category_in_city','no_match'].includes(value.status)||!Array.isArray(value.cards)||value.cards.length>3) throw invalid('Некорректное состояние результата.');
    if(!Number.isSafeInteger(value.eligible_count)||value.eligible_count<0||value.cards.length!==Math.min(3,value.eligible_count)) throw invalid('Некорректное количество результатов.');
    if((value.status==='matched')!==(value.cards.length>0)) throw invalid('Результат не соответствует статусу.');
    if(value.meta_explanation!=null&&typeof value.meta_explanation!=='string'||value.cards.length<3&&!value.meta_explanation?.trim()) throw invalid('Сервис не предоставил пояснение результата.');
    const ids=new Set();
    for(const card of value.cards) {
      for(const key of ['id','name','category','city','explanation']) if(typeof card[key]!=='string'||!card[key].trim()) throw invalid('В карточке отсутствует поле '+key);
      if(card.price_note!=null&&typeof card.price_note!=='string') throw invalid('Некорректное примечание к цене.');
      if(ids.has(card.id)) throw invalid('Повторяющаяся карточка.'); ids.add(card.id);
      if(!Number.isSafeInteger(card.price_from_kzt)||card.price_from_kzt<0) throw invalid('Некорректная цена.');
      if(card.data_flags!=null) {
        if(typeof card.data_flags!=='object'||Array.isArray(card.data_flags)) throw invalid('Некорректные признаки данных.');
        for(const key of ['synthetic','price_imputed','city_imputed']) if(card.data_flags[key]!=null&&typeof card.data_flags[key]!=='boolean') throw invalid('Некорректный признак данных.');
      }
    }
    if(value.explanation_limitations!=null&&!(typeof value.explanation_limitations==='string'||Array.isArray(value.explanation_limitations)&&value.explanation_limitations.every(x=>typeof x==='string'))) throw invalid('Некорректные замечания к объяснениям.');
    if(value.rejection_stats!=null&&(typeof value.rejection_stats!=='object'||Array.isArray(value.rejection_stats)||!Object.values(value.rejection_stats).every(x=>Number.isSafeInteger(x)&&x>=0))) throw invalid('Некорректная статистика исключений.');
    return value;
  }
  function numericBudget(raw) {
    const value=String(raw??'').trim().replace(/\s*₸$/,'').trim();
    if(!value) return NaN;
    let digits;
    if(/^[0-9\s]+$/.test(value)) digits=value.replace(/\s/g,'');
    else if(/^[0-9]{1,3}(?:,[0-9]{3})+$/.test(value)) digits=value.replace(/,/g,'');
    else return NaN;
    const n=Number(digits); return Number.isSafeInteger(n)&&n>=0?n:NaN;
  }
  function orderFromForm(values) {
    const fields={};
    const stringField=name=>String(values[name]??'').trim();
    for(const name of ['city','category','event_format']) if(!stringField(name)) fields[name]='required';
    const date=stringField('date'); if(!isDate(date)) fields.date=date?'invalid':'required';
    const budget=numericBudget(values.budget); if(!Number.isFinite(budget)) fields.budget=stringField('budget')?'invalid':'required';
    const duration=stringField('duration_hours');
    const duration_hours=duration===''?null:Number(duration);
    if(duration_hours!==null&&(!/^\d+$/.test(duration)||!Number.isSafeInteger(duration_hours)||duration_hours<1)) fields.duration_hours='invalid';
    if(Object.keys(fields).length) throw new BirgeApiError('Проверьте обязательные поля, бюджет и целое число часов.',{code:'FORM_ERROR',fields});
    return {city:stringField('city'),date,event_format:stringField('event_format'),category:stringField('category'),budget,duration_hours,language:stringField('language')||null};
  }
  function createBirgeApi(base='/api',{fetchImpl=root.fetch?.bind(root),timeoutMs=20000}={}) {
    if(typeof fetchImpl!=='function') throw new Error('Fetch is unavailable.');
    const prefix=base.replace(/\/$/,'');
    async function request(path,{method='GET',body,signal,locale}={}) {
      const controller=new AbortController(); let timedOut=false;
      const abort=()=>controller.abort(signal?.reason);
      if(signal?.aborted) abort(); else signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeoutMs);
      try {
        const response=await fetchImpl(prefix+path,{method,headers:{Accept:'application/xml, text/xml, application/json',...(body?{'Content-Type':'application/json'}:{}),...(locale?{'Accept-Language':locale}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store',credentials:'same-origin'});
        const text=await response.text();
        let data;
        try { data=parseEnvelope(text); }
        catch(error) {
          if(!response.ok) throw new BirgeApiError('Сервис вернул ошибку HTTP '+response.status+'.',{status:response.status,code:'HTTP_ERROR'});
          throw error;
        }
        if(!response.ok||data.error) {
          const error=data.error||{};
          throw new BirgeApiError(typeof error.message==='string'?error.message:'Не удалось выполнить запрос.',{status:response.status,code:typeof error.code==='string'?error.code:'HTTP_ERROR',fields:error.fields||error.field_errors||null});
        }
        return data;
      } catch(error) {
        if(signal?.aborted) throw new DOMException('Request cancelled','AbortError');
        if(timedOut) throw new BirgeApiError('Сервис не ответил вовремя. Попробуйте ещё раз.',{code:'TIMEOUT'});
        if(error instanceof BirgeApiError) throw error;
        throw new BirgeApiError('Нет соединения с сервисом подбора. Попробуйте ещё раз.',{code:'NETWORK_ERROR'});
      } finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
    }
    return {
      getOptions:async options=>validateOptions(await request('/catalog/options',options)),
      recommend:async (order,options={})=>validateRecommendation(await request('/recommend',{...options,method:'POST',body:order})),
      getHealth:options=>request('/health',options)
    };
  }
  const api={BirgeApiError,parseEnvelope,validateOptions,validateRecommendation,numericBudget,orderFromForm,createBirgeApi,isDate};
  root.BirgeApi=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(globalThis);
