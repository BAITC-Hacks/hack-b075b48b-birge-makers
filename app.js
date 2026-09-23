'use strict';
const profiles = globalThis.BIRGE_PROFILES;
const matcher = globalThis.BirgeMatcher;
const i18n = globalThis.BirgeI18n;
const formUtils = globalThis.BirgeForm;
const resultState = globalThis.BirgeResultState;
const categories = [...new Set(profiles.flatMap(p => p.categories))].sort((a,b) => a.localeCompare(b,'ru'));
const { t, term } = i18n;
const form = document.querySelector('#request-form');
const results = document.querySelector('#results');
const summary = document.querySelector('#result-summary');
const cards = document.querySelector('#result-cards');
const technicalError = document.querySelector('#technical-error');
const localeSelect = document.querySelector('#site-language');
const loadingState = document.querySelector('#loading-state');
let requestVersion = 0;
let lastResult = null;
let lastQuery = null;
let fieldErrors = {};
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function setOptions(id, values) {
  const select = document.getElementById(id);
  const selected = select.value;
  select.replaceChildren();
  select.add(new Option(t(id === 'language' ? 'any' : 'select_' + id), ''));
  // Values remain canonical dataset keys; only the visible labels change.
  values.forEach(value => select.add(new Option(term(value), value)));
  select.value = selected;
}
function getRawFields() {
  return {
    city: form.elements.city.value, date: form.elements.date.validity.badInput ? 'invalid' : form.elements.date.value,
    event: form.elements.event.value, category: form.elements.category.value,
    budget: form.elements.budget.value,
    hours: form.elements.hours.validity.badInput ? 'invalid' : form.elements.hours.value,
    language: form.elements.language.value
  };
}
function createCard(profile, index, query) {
  const card = element('article', 'result-card');
  const heading = element('div', 'card-heading');
  const initials = profile.anon_name.trim().split(/\s+/).slice(0,2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase();
  const rank = element('span', 'profile-monogram', initials);
  rank.setAttribute('aria-hidden', 'true');
  const identity = element('div', 'identity');
  identity.append(element('div', 'card-category', term(query.category)), element('h3', '', profile.anon_name), element('div', 'location', term(profile.city) + ' · ' + profile.id));
  const price = element('div', 'price');
  price.textContent = i18n.startingPrice(profile.price_from_kzt);
  heading.append(rank, identity, price);
  const explanation = element('div', 'explanation');
  explanation.append(element('span', 'explanation-label', t('why')), element('p', '', i18n.explain(profile, query)));
  const tags = element('div', 'card-tags');
  tags.append(element('span', 'badge available', t('available', {date:i18n.date(query.date)})));
  if (profile.synthetic) tags.append(element('span', 'badge synthetic', t('synthetic')));
  if (profile.price_imputed) tags.append(element('span', 'badge', t('priceImputed')));
  if (profile.city_imputed) tags.append(element('span', 'badge', t('cityImputed')));
  const notes = element('div', 'card-notes');
  notes.append(element('p', 'price-notice', t('priceNotice')));
  i18n.provenanceNotes(profile).forEach(note => notes.append(element('p', 'provenance-note', note)));
  card.append(heading, explanation, tags, notes);
  return card;
}
function render(result, query, moveFocus = true) {
  const state = resultState.describe(result,query);
  document.querySelector('#initial-state').hidden = true;
  technicalError.hidden = true;
  results.hidden = false;
  summary.dataset.status = result.status;
  summary.replaceChildren();
  const stateHeading = element('div','state-heading');
  const icon = element('span','state-icon',{matched:'✓',no_category:'∅',no_match:'≠'}[state.status]);
  icon.setAttribute('aria-hidden','true');
  stateHeading.append(icon,element('h3','',state.title));
  summary.append(stateHeading,element('p','',state.message));
  if (state.shown) summary.append(element('div','result-count',t('resultCount',{shown:i18n.number(state.shown),eligible:i18n.number(state.eligible)})));
  if (state.counts.length && state.shown < 3) {
    const reasons = element('div','state-reasons');
    reasons.append(element('h4','',t('reasonTitle')));
    const list = element('ul','reason-totals');
    state.counts.forEach(({reason,count}) => {
      const item = element('li','');
      item.append(element('span','',t('reason_' + reason)),element('strong','',i18n.number(count)));
      list.append(item);
    });
    reasons.append(list,element('p','audit-note',t('auditNote')));
    summary.append(reasons);
  }
  if (state.actions.length) {
    const actions = element('div','result-actions');
    state.actions.forEach(name => {
      const button = element('button','field-action',t('change_' + name));
      button.type = 'button';
      button.setAttribute('aria-controls',name);
      button.addEventListener('click',() => {
        const field = form.elements[name];
        field.focus({preventScroll:true});
        field.scrollIntoView({block:'center',behavior:'auto'});
      });
      actions.append(button);
    });
    summary.append(actions);
  }
  const queryParts = [term(query.city), i18n.date(query.date), term(query.event), term(query.category), t('queryBudget',{amount:i18n.money(query.budget)})];
  if (query.hours != null) queryParts.push(t('queryHours',{hours:i18n.number(query.hours)}));
  if (query.language) queryParts.push(term(query.language));
  document.querySelector('#query-line').textContent = queryParts.join(' · ');
  cards.replaceChildren(...result.cards.map((profile,index) => createCard(profile,index,query)));
  const audit = document.querySelector('#audit');
  audit.hidden = !result.excluded.length;
  if (moveFocus) audit.open = result.status === 'no_match';
  document.querySelector('#excluded-list').replaceChildren(...result.excluded.map(profile => element('li', '', profile.name + ' (' + profile.id + '): ' + profile.reasons.map(reason => t('reason_' + reason)).join('; '))));
  if (moveFocus) summary.focus({ preventScroll: true });
}
function renderFieldErrors(moveFocus = false) {
  for (const name of ['city','date','event','category','budget','hours','language']) {
    const input = form.elements[name];
    const errorNode = document.getElementById(name + '-error');
    const code = fieldErrors[name];
    errorNode.textContent = code ? t('error_' + code) : '';
    errorNode.hidden = !code;
    if (code) input.setAttribute('aria-invalid','true');
    else input.removeAttribute('aria-invalid');
  }
  if (moveFocus) {
    const firstName = Object.keys(fieldErrors)[0];
    if (firstName) form.elements[firstName].focus();
  }
}
function showTechnicalError(moveFocus = true) {
  setLoading(false);
  lastResult = lastQuery = null;
  results.hidden = true;
  document.querySelector('#initial-state').hidden = true;
  technicalError.hidden = false;
  if (moveFocus) technicalError.focus({preventScroll:true});
}
function setLoading(active) {
  loadingState.hidden = !active;
  document.querySelector('.results-panel').setAttribute('aria-busy',String(active));
  document.querySelectorAll('.submit, #retry, [data-demo]').forEach(button => { button.disabled = active; });
  if (active) {
    results.hidden = true;
    technicalError.hidden = true;
    document.querySelector('#initial-state').hidden = true;
  }
}
async function submitQuery() {
  const version = ++requestVersion;
  setLoading(false);
  technicalError.hidden = true;
  try {
    const raw = getRawFields();
    fieldErrors = formUtils.validate(raw,categories).errors;
    renderFieldErrors(true);
    lastResult = lastQuery = null;
    if (Object.keys(fieldErrors).length) {
      results.hidden = true;
      document.querySelector('#initial-state').hidden = false;
      return;
    }
    setLoading(true);
    // Let the browser paint the status before local matching, without an artificial delay.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (version !== requestVersion) return;
    const outcome = resultState.run(raw,categories);
    setLoading(false);
    if (outcome.kind === 'technical') {
      showTechnicalError();
    } else if (outcome.kind === 'validation') {
      fieldErrors = outcome.errors;
      renderFieldErrors(true);
      document.querySelector('#initial-state').hidden = false;
    } else {
      lastQuery = outcome.query; lastResult = outcome.result;
      render(lastResult,lastQuery);
    }
  } catch {
    if (version === requestVersion) showTechnicalError();
  } finally {
    if (version === requestVersion) setLoading(false);
  }
}
function applyLocale(locale) {
  i18n.setLocale(locale);
  const chosen = i18n.getLocale();
  localeSelect.value = chosen;
  document.documentElement.lang = chosen;
  document.title = t('title');
  document.querySelectorAll('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-i18n-aria]').forEach(node => { node.setAttribute('aria-label',t(node.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-alt]').forEach(node => { node.alt = t(node.dataset.i18nAlt); });
  setOptions('city',formUtils.cities);
  setOptions('category',categories);
  setOptions('event',formUtils.events);
  setOptions('language',formUtils.languages);
  document.querySelector('#catalog-count').textContent = t('catalogCount',{count:i18n.number(profiles.length)});
  if (lastResult && lastQuery) {
    try { render(lastResult,lastQuery,false); } catch { showTechnicalError(false); }
  }
  renderFieldErrors();
}
let savedLocale = 'kk';
try { savedLocale = localStorage.getItem('birge-locale') || 'kk'; } catch {}
applyLocale(savedLocale);
localeSelect.addEventListener('change', () => {
  applyLocale(localeSelect.value);
  try { localStorage.setItem('birge-locale',i18n.getLocale()); } catch {}
});
form.addEventListener('submit', event => { event.preventDefault(); submitQuery(); });
document.querySelector('#retry').addEventListener('click',submitQuery);
document.querySelector('a[href="#how-it-works"]').addEventListener('click',() => {
  document.querySelector('#how-it-works').open = true;
});
function invalidateResult(event) {
  requestVersion++;
  setLoading(false);
  lastResult = lastQuery = null;
  results.hidden = true;
  technicalError.hidden = true;
  document.querySelector('#initial-state').hidden = false;
  const fieldName = event.target.name;
  if (Object.hasOwn(fieldErrors,fieldName)) {
    const currentErrors = formUtils.validate(getRawFields(),categories).errors;
    if (currentErrors[fieldName]) fieldErrors[fieldName] = currentErrors[fieldName];
    else delete fieldErrors[fieldName];
    renderFieldErrors();
  }
}
function formatBudgetInput() {
  const input = form.elements.budget;
  const before = input.value;
  const caret = input.selectionStart ?? before.length;
  const digitsBefore = (before.slice(0,caret).match(/\d/g) || []).length;
  const formatted = formUtils.formatBudget(before);
  if (formatted === before) return;
  input.value = formatted;
  let position = 0, seen = 0;
  while (position < formatted.length && seen < digitsBefore) {
    if (/\d/.test(formatted[position])) seen++;
    position++;
  }
  input.setSelectionRange(position,position);
}
form.elements.budget.addEventListener('input',formatBudgetInput);
form.elements.budget.addEventListener('blur',formatBudgetInput);
form.addEventListener('input', invalidateResult);
form.addEventListener('change', invalidateResult);
function findDemo(category, rare = false) {
  for (let day = 1; day <= 30; day++) {
    const query = { city:'Алматы', category, event:'корпоратив', date:'2026-10-' + String(day).padStart(2,'0'), budget:1500000, hours:null, language:'' };
    const result = matcher.match(profiles, query);
    if (rare ? result.eligibleCount > 0 && result.eligibleCount < 3 : result.eligibleCount > 3) return query;
  }
  return { city:'Алматы', category, event:'корпоратив', date:'2026-10-10', budget:1500000, hours:null, language:'' };
}
document.querySelectorAll('[data-demo]').forEach(button => button.addEventListener('click', () => {
  try {
    const kind = button.dataset.demo;
    const query = kind === 'rare' ? findDemo('Флорист',true) : findDemo('Ведущий');
    if (kind === 'empty') query.budget = 1;
    for (const [key,value] of Object.entries(query)) form.elements[key].value = value ?? '';
    formatBudgetInput();
    submitQuery();
  } catch { showTechnicalError(); }
}));
