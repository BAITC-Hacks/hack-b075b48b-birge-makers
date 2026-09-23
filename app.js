'use strict';
const i18n=globalThis.BirgeI18n;
const {t,term}=i18n;
const F=globalThis.BirgeForm;
const API=globalThis.BirgeApi;
const api=API.createBirgeApi('/api');
const form=document.querySelector('#request-form');
const results=document.querySelector('#results');
const summary=document.querySelector('#result-summary');
const cards=document.querySelector('#result-cards');
const initial=document.querySelector('#initial-state');
const loading=document.querySelector('#loading-state');
const technical=document.querySelector('#technical-error');
const technicalText=document.querySelector('#technical-text');
const localeSelect=document.querySelector('#site-language');
const catalogStatus=document.querySelector('#catalog-status');
const catalogText=document.querySelector('#catalog-status-text');
const catalogRetry=document.querySelector('#catalog-retry');
let options=null, catalogController=null, activeRequest=null;
let requestVersion=0, lastResult=null, lastOrder=null, fieldErrors={}, serverFieldErrors={};
let catalogError=null, requestError=null, parameterError=null;

function element(tag,className,text){
  const node=document.createElement(tag);
  if(className) node.className=className;
  if(text!=null) node.textContent=text;
  return node;
}
function dateLabel(value){
  return new Intl.DateTimeFormat({kk:'kk-KZ',ru:'ru-RU',en:'en-GB'}[i18n.getLocale()],{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
}
function coverageValues(){
  return options?{start:dateLabel(options.calendar_coverage.start),end:dateLabel(options.calendar_coverage.end)}:{start:'',end:''};
}
function setOptions(id,values){
  const node=document.getElementById(id),value=node.value;
  node.replaceChildren(new Option(t(id==='language'?'any':'select_'+id),''));
  values.forEach(item=>node.add(new Option(term(item),item)));
  node.value=values.includes(value)?value:'';
}
function updateCatalog(){
  for(const [id,key] of [['city','cities'],['event','event_formats'],['category','categories'],['language','languages']]) setOptions(id,options?.[key]||[]);
  const date=form.elements.date;
  if(options){ date.min=options.calendar_coverage.start;date.max=options.calendar_coverage.end; }
  else { date.removeAttribute('min');date.removeAttribute('max'); }
  document.querySelector('#calendar-help').textContent=options?t('calendarHelp',coverageValues()):t('calendarPending');
  document.querySelector('#catalog-count').textContent=Number.isSafeInteger(options?.total_count)?t('catalogCount',{count:i18n.number(options.total_count)}):t('catalog');
}
function updateControls(){
  const ready=Boolean(options),busy=Boolean(activeRequest);
  document.querySelector('.submit').disabled=!ready||busy;
  for(const name of ['city','event_format','category','language']) form.elements[name].disabled=!ready;
  form.setAttribute('aria-busy',String(Boolean(catalogController)));
  document.querySelector('.results-panel').setAttribute('aria-busy',String(busy));
}
function errorMessage(error){
  if(location.protocol==='file:') return t('openWithServer');
  const translated={NETWORK_ERROR:'networkError',TIMEOUT:'timeoutError',INVALID_RESPONSE:'invalidResponse',PROXY_ERROR:'networkError'};
  return translated[error?.code]?t(translated[error.code]):error?.message||t('technicalText');
}
function renderCatalogStatus(){
  catalogStatus.hidden=Boolean(options);
  catalogStatus.dataset.state=catalogError?'error':'loading';
  catalogText.textContent=catalogError?errorMessage(catalogError):t('catalogLoading');
  catalogRetry.hidden=!catalogError;
  catalogRetry.disabled=Boolean(catalogController);
}
function rawFields(){
  const values=Object.fromEntries(new FormData(form));
  for(const name of ['date','duration_hours']) if(form.elements[name].validity.badInput) values[name]='invalid';
  return values;
}
function renderFieldErrors(focus=false){
  for(const [name,id] of Object.entries(F.ids)){
    const input=form.elements[name],node=document.getElementById(id+'-error');
    const message=serverFieldErrors[name]|| (fieldErrors[name]?t('error_'+fieldErrors[name],coverageValues()):'');
    node.textContent=message;node.hidden=!message;
    if(message) input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
  }
  if(focus){
    const name=[...Object.keys(fieldErrors),...Object.keys(serverFieldErrors)].find(name=>F.ids[name]);
    if(name)form.elements[name].focus();
  }
}
function cancelRequest(){
  requestVersion++;
  activeRequest?.abort();activeRequest=null;
  loading.hidden=true;updateControls();
}
function clearResult(){
  lastResult=lastOrder=null;requestError=parameterError=null;
  document.querySelector('#request-error').hidden=true;
  results.hidden=true;technical.hidden=true;initial.hidden=false;
}
function showTechnicalError(error,focus=true){
  requestError=error;lastResult=lastOrder=null;
  initial.hidden=true;results.hidden=true;loading.hidden=true;technical.hidden=false;
  technicalText.textContent=errorMessage(error);
  if(focus)technical.focus({preventScroll:true});
}
function evidenceText(value){
  if(typeof value==='string') return value;
  if(typeof value==='number') return i18n.number(value);
  if(typeof value==='boolean') return t(value?'yes':'no');
  if(Array.isArray(value)) return value.map(evidenceText).filter(Boolean).join(', ');
  return '';
}
function appendEvidence(card,profile){
  const evidence=profile.evidence;
  if(!evidence||typeof evidence!=='object'&&typeof evidence!=='string')return;
  const facts=[];
  const labels={city:'city',category:'category',event_format:'event',date:'date',language:'language',languages:'language',duration_hours:'hours',max_hours:'hours',budget:'budget',price_from_kzt:'evidencePrice',quote:'evidenceQuote',source_quote:'evidenceQuote',description_excerpt:'evidenceQuote',available:'evidenceAvailable'};
  if(typeof evidence==='string') facts.push(evidence);
  else if(Array.isArray(evidence)){
    evidence.forEach(item=>{
      if(typeof item==='string')facts.push(item);
      else if(item&&typeof item==='object'){
        const text=item.text||item.fact||item.quote;
        if(typeof text==='string')facts.push(text);
        else if(typeof item.label==='string'&&evidenceText(item.value))facts.push(item.label+': '+evidenceText(item.value));
      }
    });
  }else{
    for(const [key,value] of Object.entries(evidence)){
      if(labels[key]&&evidenceText(value))facts.push(t(labels[key])+': '+evidenceText(value));
      else if(value&&typeof value==='object'&&typeof value.text==='string')facts.push(value.text);
    }
  }
  if(!facts.length)return;
  const details=element('details','card-evidence');
  details.append(element('summary','',t('evidenceTitle')));
  const list=element('ul','');
  facts.forEach(fact=>list.append(element('li','',fact)));
  details.append(list);card.append(details);
}
function createCard(profile,order){
  const card=element('article','result-card');
  card.dataset.id=profile.id;
  const heading=element('div','card-heading');
  const initials=profile.name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toLocaleUpperCase();
  const monogram=element('span','profile-monogram',initials);monogram.setAttribute('aria-hidden','true');
  const identity=element('div','identity');
  identity.append(element('div','card-category',term(profile.category)),element('h3','',profile.name),element('div','location',term(profile.city)));
  heading.append(monogram,identity,element('div','price',i18n.startingPrice(profile.price_from_kzt)));
  const explanation=element('div','explanation');
  explanation.append(element('span','explanation-label',t('why')),element('p','',profile.explanation));
  const flags=profile.data_flags||{};
  const tags=element('div','card-tags');
  tags.append(element('span','badge available',t('available',{date:dateLabel(order.date)})));
  if(flags.synthetic)tags.append(element('span','badge synthetic',t('synthetic')));
  if(flags.price_imputed)tags.append(element('span','badge',t('priceImputed')));
  if(flags.city_imputed)tags.append(element('span','badge',t('cityImputed')));
  const notes=element('div','card-notes');
  notes.append(element('p','price-notice',profile.price_note||t('priceNotice')));
  if(flags.price_imputed)notes.append(element('p','',t('priceDataNote')));
  if(flags.city_imputed)notes.append(element('p','',t('cityDataNote')));
  card.append(heading,explanation,tags,notes);appendEvidence(card,profile);
  return card;
}
function render(result,order,focus=true){
  const state=globalThis.BirgeResultState.describe(result);
  initial.hidden=true;technical.hidden=true;results.hidden=false;
  summary.dataset.status=state.status;summary.replaceChildren();
  const heading=element('div','state-heading');
  const icon=element('span','state-icon',{matched:'✓',no_category:'∅',no_match:'≠'}[state.status]);
  icon.setAttribute('aria-hidden','true');heading.append(icon,element('h3','',state.title));summary.append(heading);
  if(state.message)summary.append(element('p','',state.message));
  if(state.shown)summary.append(element('div','result-count',t('resultCount',{shown:i18n.number(state.shown),eligible:i18n.number(state.eligible)})));
  if(state.counts.length&&state.shown<3){
    const reasons=element('div','state-reasons'),list=element('ul','reason-totals');
    reasons.append(element('h4','',t('reasonTitle')));
    state.counts.forEach(({reason,count})=>{const li=element('li','');li.append(element('span','',t('reason_'+reason)),element('strong','',i18n.number(count)));list.append(li)});
    reasons.append(list,element('p','audit-note',t('exclusiveReasons')));summary.append(reasons);
  }
  if(state.actions.length){
    const actions=element('div','result-actions');
    state.actions.forEach(id=>{
      const button=element('button','field-action',t('change_'+id));button.type='button';button.setAttribute('aria-controls',id);
      button.addEventListener('click',()=>{const field=document.getElementById(id);field.focus({preventScroll:true});field.scrollIntoView({block:'center',behavior:'auto'})});
      actions.append(button);
    });summary.append(actions);
  }
  const query=[term(order.city),dateLabel(order.date),term(order.event_format),term(order.category),t('queryBudget',{amount:i18n.money(order.budget)})];
  if(order.duration_hours!==null)query.push(t('queryHours',{hours:i18n.number(order.duration_hours)}));
  if(order.language)query.push(term(order.language));
  document.querySelector('#query-line').textContent=query.join(' · ');
  cards.replaceChildren(...result.cards.map(profile=>createCard(profile,order)));
  const limitations=document.querySelector('#explanation-limitations');
  limitations.hidden=!state.limitations.length;
  document.querySelector('#limitations-list').replaceChildren(...state.limitations.map(text=>element('li','',text)));
  if(focus)summary.focus({preventScroll:true});
}
async function loadCatalog(){
  catalogController?.abort();
  const controller=new AbortController();catalogController=controller;catalogError=null;
  renderCatalogStatus();updateControls();
  try{
    if(location.protocol==='file:')throw new API.BirgeApiError(t('openWithServer'),{code:'NETWORK_ERROR'});
    const loaded=await api.getOptions({signal:controller.signal,locale:i18n.getLocale()});
    if(catalogController!==controller)return;
    options=loaded;updateCatalog();renderFieldErrors();
  }catch(error){if(!controller.signal.aborted&&catalogController===controller)catalogError=error}
  finally{if(catalogController===controller){catalogController=null;renderCatalogStatus();updateControls()}}
}
async function submitQuery(){
  cancelRequest();clearResult();
  if(!options){renderCatalogStatus();catalogStatus.scrollIntoView({block:'center'});return}
  const raw=rawFields(),validation=F.validate(raw,options);
  fieldErrors=validation.errors;serverFieldErrors={};renderFieldErrors(true);
  if(Object.keys(fieldErrors).length)return;
  const order=validation.order,version=requestVersion,controller=new AbortController();
  activeRequest=controller;initial.hidden=true;loading.hidden=false;updateControls();
  try{
    const result=await api.recommend(order,{signal:controller.signal,locale:i18n.getLocale()});
    if(controller.signal.aborted||activeRequest!==controller||version!==requestVersion)return;
    lastResult=result;lastOrder=order;render(result,order);
  }catch(error){
    if(controller.signal.aborted||activeRequest!==controller||version!==requestVersion)return;
    if(error.status===400||error.code==='FORM_ERROR'){
      if(error.fields&&typeof error.fields==='object')for(const [name,message]of Object.entries(error.fields))if(F.ids[name]&&typeof message==='string')serverFieldErrors[name]=message;
      renderFieldErrors(true);
      parameterError=error;
      const feedback=document.querySelector('#request-error');feedback.hidden=false;feedback.textContent=error.message;
      initial.hidden=false;
    }else{
      showTechnicalError(error);
    }
  }finally{
    if(activeRequest===controller){activeRequest=null;loading.hidden=true;updateControls()}
  }
}
function applyLocale(locale){
  i18n.setLocale(locale);const chosen=i18n.getLocale();localeSelect.value=chosen;
  document.documentElement.lang=chosen;document.title=t('title');
  document.querySelectorAll('[data-i18n]').forEach(node=>{node.textContent=t(node.dataset.i18n,coverageValues())});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node=>{node.placeholder=t(node.dataset.i18nPlaceholder)});
  document.querySelectorAll('[data-i18n-aria]').forEach(node=>node.setAttribute('aria-label',t(node.dataset.i18nAria)));
  document.querySelectorAll('[data-i18n-alt]').forEach(node=>{node.alt=t(node.dataset.i18nAlt)});
  updateCatalog();renderFieldErrors();renderCatalogStatus();
  if(lastResult&&lastOrder)render(lastResult,lastOrder,false);
  if(requestError)technicalText.textContent=errorMessage(requestError);
  if(parameterError)document.querySelector('#request-error').textContent=parameterError.message;
}
let savedLocale='kk';try{savedLocale=localStorage.getItem('birge-locale')||'kk'}catch{}
applyLocale(savedLocale);updateControls();loadCatalog();
localeSelect.addEventListener('change',()=>{
  // Keep server explanations intact. Locale only formats UI and is sent as Accept-Language.
  applyLocale(localeSelect.value);
  try{localStorage.setItem('birge-locale',i18n.getLocale())}catch{}
});
form.addEventListener('submit',event=>{event.preventDefault();submitQuery()});
document.querySelector('#retry').addEventListener('click',submitQuery);
catalogRetry.addEventListener('click',loadCatalog);
document.querySelector('a[href="#how-it-works"]').addEventListener('click',()=>{document.querySelector('#how-it-works').open=true});
function invalidateResult(event){
  cancelRequest();clearResult();
  const name=event.target.name;
  delete serverFieldErrors[name];
  if(Object.hasOwn(fieldErrors,name)&&options){
    const errors=F.validate(rawFields(),options).errors;
    if(errors[name])fieldErrors[name]=errors[name];else delete fieldErrors[name];
  }
  renderFieldErrors();
}
function formatBudgetInput(){
  const input=form.elements.budget,before=input.value,caret=input.selectionStart??before.length;
  const digitsBefore=(before.slice(0,caret).match(/\d/g)||[]).length;
  const formatted=F.formatBudget(before);
  if(formatted===before)return;
  input.value=formatted;let position=0,seen=0;
  while(position<formatted.length&&seen<digitsBefore){if(/\d/.test(formatted[position]))seen++;position++}
  input.setSelectionRange(position,position);
}
form.elements.budget.addEventListener('input',formatBudgetInput);
form.elements.budget.addEventListener('blur',formatBudgetInput);
form.addEventListener('input',invalidateResult);
form.addEventListener('change',invalidateResult);
window.addEventListener('pagehide',()=>{catalogController?.abort();activeRequest?.abort()});
