/* Input parsing and field validation, independent of the DOM. */
(function (root) {
  'use strict';
  const cities = ['Алматы', 'Астана', 'Зарубежье'];
  const events = ['свадьба', 'той', 'корпоратив', 'конференция', 'юбилей', 'день рождения'];
  const languages = ['казахский', 'русский', 'английский'];
  function budgetDigits(value) {
    const text = String(value).trim().replace(/\s*₸$/, '').trim();
    if (/^[0-9\s]+$/.test(text)) return text.replace(/\s/g, '');
    // Also accept a pasted English grouped amount, without treating a decimal comma as thousands.
    if (/^[0-9]{1,3}(?:,[0-9]{3})+$/.test(text)) return text.replace(/,/g, '');
    return null;
  }
  function parseBudget(value) {
    const digits = budgetDigits(value);
    if (!digits) return NaN;
    const number = Number(digits);
    return Number.isSafeInteger(number) && number > 0 ? number : NaN;
  }
  function formatBudget(value) {
    const digits = budgetDigits(value);
    if (!digits) return String(value);
    return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function validate(raw, categories) {
    const errors = {};
    if (!cities.includes(raw.city)) errors.city = 'city';
    if (!raw.date) errors.date = 'dateRequired';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.date) || !Number.isFinite(Date.parse(raw.date)) || new Date(raw.date).toISOString().slice(0,10) !== raw.date) errors.date = 'date';
    else if (raw.date < '2026-09-23' || raw.date > '2026-12-31') errors.date = 'dateRange';
    if (!events.includes(raw.event)) errors.event = 'event';
    if (!categories.includes(raw.category)) errors.category = 'category';
    const budget = parseBudget(raw.budget);
    if (!String(raw.budget).trim()) errors.budget = 'budgetRequired';
    else if (!Number.isFinite(budget)) errors.budget = 'budget';
    const hoursText = String(raw.hours).trim();
    const hours = hoursText === '' ? null : Number(hoursText);
    if (hours !== null && (!/^(?:\d+(?:[.]\d*)?|[.]\d+)$/.test(hoursText) || !Number.isFinite(hours) || hours <= 0)) errors.hours = 'hours';
    if (raw.language && !languages.includes(raw.language)) errors.language = 'language';
    return { errors, query:{city:raw.city,date:raw.date,event:raw.event,category:raw.category,budget,hours,language:raw.language} };
  }
  root.BirgeForm = { cities, events, languages, parseBudget, formatBudget, validate };
})(globalThis);
