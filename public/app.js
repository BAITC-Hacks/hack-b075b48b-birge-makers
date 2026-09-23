import { api, ApiError, validateOrder, latestRequests } from './api.js';
import { t, label, locale } from './i18n.js';

const $ = id => document.getElementById(id);
let lang = 'kk';
try { const saved = localStorage.getItem('birge-language'); if (['kk','ru','en'].includes(saved)) lang = saved; } catch {}
let options = null, catalogState = 'loading', result = null, state = 'idle', requestError = null, fieldErrors = {};
const searchRequests = latestRequests(), catalogRequests = latestRequests();
const form = $('order-form');
const fields = ['city','date','event_format','category','budget','duration_hours','language'];
const formatMoney = value => new Intl.NumberFormat(locale(lang)).format(value);

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
function applyLanguage() {
  document.documentElement.lang = lang;
  document.title = `Birge Explain — ${t('hero1',lang)} ${t('hero2',lang)}`;
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n,lang); });
  document.querySelectorAll('[data-language]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.language === lang)));
  renderOptions(); renderCatalog(); renderErrors(); renderResults();
}
function renderOptions() {
  if (!options) return;
  for (const [name, list] of Object.entries({ city: options.cities, category: options.categories, event_format: options.event_formats, language: options.languages })) {
    const select = $(name), value = select.value;
    const placeholder = new Option(t(name === 'language' ? 'any' : 'choose',lang), '');
    select.replaceChildren(placeholder, ...list.map(v => new Option(label(v,lang),v)));
    select.value = value;
  }
  $('date').min = options.calendar_coverage.start;
  $('date').max = options.calendar_coverage.end;
}
function renderCatalog() {
  $('order-fields').disabled = catalogState !== 'ready';
  $('catalog-notice').classList.toggle('is-error', catalogState === 'error');
  $('catalog-message').textContent = t(catalogState === 'ready' ? 'coverage' : catalogState === 'error' ? 'catalogError' : 'catalogLoading',lang, options?.calendar_coverage);
  $('reload-catalog').hidden = catalogState !== 'error';
}
async function loadCatalog() {
  const request = catalogRequests.begin();
  catalogState = 'loading'; renderCatalog();
  try {
    const data = await api('/catalog/options', { signal: request.signal });
    if (!request.current()) return;
    if (!['cities','categories','event_formats','languages'].every(k => Array.isArray(data[k]) && data[k].every(v => typeof v === 'string')) || !data.calendar_coverage?.start || !data.calendar_coverage?.end) throw new ApiError('INVALID_RESPONSE');
    options = data; catalogState = 'ready'; renderOptions();
  } catch { if (request.current()) catalogState = 'error'; }
  if (request.current()) renderCatalog();
}
function renderErrors() {
  for (const field of fields) {
    const error = $(`${field}-error`);
    $(field).setAttribute('aria-invalid', String(!!fieldErrors[field]));
    if (error) { error.hidden = !fieldErrors[field]; error.textContent = fieldErrors[field] ? t(fieldErrors[field],lang) : ''; }
  }
}
function renderCard(card, position) {
  const article = element('article','contractor-card'); article.dataset.contractorId = card.id;
  const top = element('div','card-top');
  const initial = Array.from(card.name.trim())[0] ?? '';
  const avatar = element('span','avatar',initial); avatar.setAttribute('aria-hidden','true');
  top.append(avatar, element('span','card-rank',String(position + 1).padStart(2,'0')));
  const category = element('p','card-category',label(card.category,lang));
  const name = element('h3','',card.name); name.lang = 'ru';
  article.append(top,category,name,element('p','card-city',label(card.city,lang)));
  const price = element('p','card-price');
  const amount = document.createTextNode(`${formatMoney(card.price_from_kzt)} ₸`);
  if (lang === 'kk') price.append(amount,element('small','',` ${t('from',lang)}`));
  else price.append(element('small','',`${t('from',lang)} `),amount);
  const note = element('p','price-note',card.price_note); note.lang = 'ru';
  const why = element('div','why-block');
  const title = element('h4','',`✳ ${t('why',lang)}`);
  const explanation = element('p','card-explanation',card.explanation); explanation.lang = 'ru';
  why.append(title,explanation); article.append(price,note,why);
  const flags = element('div','flags');
  for (const [key, text] of [['synthetic','synthetic'],['price_imputed','imputed'],['city_imputed','cityImputed']]) if (card.data_flags?.[key]) flags.append(element('span','flag',t(text,lang)));
  if (flags.childElementCount) article.append(flags);
  if (Array.isArray(card.evidence) && card.evidence.length) {
    const details = element('details','evidence'); details.append(element('summary','',t('facts',lang)));
    const list = element('ul'); list.lang = 'ru';
    const factNames = { price_from_kzt:'Стартовая цена, ₸', event_formats:'Формат', languages:'Языки', max_hours:'Максимум часов', description:'Описание' };
    card.evidence.forEach(fact => list.append(element('li','',`${factNames[fact.field] || fact.field}: ${Array.isArray(fact.value) ? fact.value.join(', ') : String(fact.value)}`)));
    details.append(list); article.append(details);
  }
  return article;
}
function renderResults() {
  const loading = state === 'loading';
  $('results').setAttribute('aria-busy',String(loading));
  form.classList.toggle('is-loading',loading);
  $('submit-label').textContent = t(loading ? 'updating' : 'submit',lang);
  $('submit-icon').textContent = loading ? '' : '↗';
  $('cards').replaceChildren();
  $('meta-explanation').hidden = !result?.meta_explanation;
  $('meta-explanation').textContent = result?.meta_explanation ?? '';
  $('limitations').replaceChildren();
  (result?.explanation_limitations ?? []).forEach(text => $('limitations').append(element('li','',text)));
  $('limitations').hidden = !result?.explanation_limitations?.length;
  $('source-note').hidden = !result;
  $('result-count').hidden = state !== 'matched';
  $('result-message').hidden = state === 'matched';
  $('result-message').classList.toggle('is-error',state === 'error');
  $('retry-order').hidden = state !== 'error';
  $('technical-detail').hidden = !(state === 'error' && requestError?.status === 400 && requestError.message);
  $('technical-detail').textContent = requestError?.status === 400 ? requestError.message : '';
  if (state === 'matched') {
    // No client-side filtering or sorting: use the backend array as received.
    result.cards.forEach((card,index) => $('cards').append(renderCard(card,index)));
    $('result-count').textContent = t('count',lang,{ shown: result.cards.length, total: result.eligible_count });
  } else {
    const prefix = { idle:'idle', loading:'loading', no_category_in_city:'absent', no_match:'none', error: requestError?.status === 400 ? 'input' : 'error' }[state];
    $('state-title').textContent = t(`${prefix}Title`,lang);
    $('state-description').textContent = t(`${prefix}Description`,lang);
  }
}
function clearSearch() {
  searchRequests.cancel(); result = null; requestError = null; state = 'idle'; renderResults(); $('result-live').textContent = '';
}
async function submit(event) {
  event?.preventDefault();
  if (!options || catalogState !== 'ready') return;
  searchRequests.cancel();
  const values = Object.fromEntries(new FormData(form));
  const checked = validateOrder(values,options.calendar_coverage);
  fieldErrors = checked.errors; renderErrors();
  if (Object.keys(fieldErrors).length) {
    result = null; state = 'idle'; renderResults(); $('result-live').textContent = t('validationLive',lang);
    $(Object.keys(fieldErrors)[0]).focus(); return;
  }
  const request = searchRequests.begin();
  result = null; requestError = null; state = 'loading'; renderResults(); $('result-live').textContent = t('loadingTitle',lang);
  try {
    const data = await api('/recommend', { body: checked.order, signal: request.signal });
    if (!request.current()) return;
    if (!['matched','no_category_in_city','no_match'].includes(data.status) || !Array.isArray(data.cards) || data.cards.length > 3 || !data.cards.every(c => typeof c.id === 'string' && typeof c.name === 'string' && typeof c.explanation === 'string' && Number.isFinite(c.price_from_kzt))) throw new ApiError('INVALID_RESPONSE');
    result = data; state = data.status; renderResults();
    $('result-live').textContent = state === 'matched' ? t('successLive',lang,{count:data.cards.length}) : $('state-title').textContent;
    $('results-title').focus({preventScroll:true});
    $('results').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'start'});
  } catch (error) {
    if (!request.current()) return;
    state = 'error'; requestError = error; renderResults(); $('result-live').textContent = $('state-title').textContent;
  }
}
document.querySelectorAll('[data-language]').forEach(button => button.addEventListener('click',() => {
  lang = button.dataset.language; try { localStorage.setItem('birge-language',lang); } catch {} applyLanguage();
}));
form.addEventListener('submit',submit);
form.addEventListener('input', event => {
  if (!fields.includes(event.target.name)) return;
  delete fieldErrors[event.target.name]; renderErrors(); clearSearch();
});
$('retry-order').addEventListener('click',submit);
$('reload-catalog').addEventListener('click',loadCatalog);
window.addEventListener('pagehide',() => { searchRequests.cancel(); catalogRequests.cancel(); });
applyLanguage(); loadCatalog();
