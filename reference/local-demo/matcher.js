/* Pure deterministic matcher, shared by the browser and Node tests. */
(function (root) {
  'use strict';
  const WINDOW = { start: '2026-09-23', end: '2026-12-31' };
  const money = value => value.toLocaleString('ru-RU') + ' ₸';
  const displayDate = date => date.split('-').reverse().join('.');
  function invalid(code, message) { const error = new Error(message); error.code = code; throw error; }
  function validate(query) {
    if (!query.city || !query.category || !query.event) invalid('selection','Укажите город, категорию и тип мероприятия.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(query.date) || !Number.isFinite(Date.parse(query.date)) || new Date(query.date).toISOString().slice(0, 10) !== query.date) invalid('date','Укажите корректную дату.');
    if (query.date < WINDOW.start || query.date > WINDOW.end) invalid('dateRange','Календарь доступен только с 23.09 по 31.12.2026.');
    if (!Number.isFinite(query.budget) || query.budget <= 0) invalid('budget','Бюджет должен быть больше нуля.');
    if (query.hours != null && (!Number.isFinite(query.hours) || query.hours <= 0)) invalid('hours','Длительность должна быть больше нуля.');
  }
  function reasons(profile, query) {
    const result = [];
    if (!Array.isArray(profile.busy_dates)) result.push('calendar');
    else if (profile.busy_dates.includes(query.date)) result.push('busy');
    if (!Number.isFinite(profile.price_from_kzt) || profile.price_from_kzt > query.budget) result.push('budget');
    if (!profile.event_formats.includes(query.event)) result.push('format');
    if (query.language && !profile.languages.includes(query.language)) result.push('language');
    if (query.hours != null && profile.max_hours != null && profile.max_hours < query.hours) result.push('hours');
    return result;
  }
  function evidence(profile) {
    const text = profile.description.replace(/\s+/g, ' ').trim();
    const firstSentence = text.match(/^.*?[.!?](?:\s|$)/)?.[0].trim() || text;
    return firstSentence.length > 190 ? firstSentence.slice(0, 187).replace(/\s+\S*$/, '') + '…' : firstSentence;
  }
  function explain(profile, query) {
    const facts = [`По календарю свободен ${displayDate(query.date)}`, `принимает формат «${query.event}»`, `цена от ${money(profile.price_from_kzt)} при бюджете ${money(query.budget)} (запас ${money(query.budget - profile.price_from_kzt)})`];
    if (query.language) facts.push(`язык — ${query.language}`);
    if (query.hours != null) facts.push(profile.max_hours == null ? 'присутствие по часам не требуется' : `лимит ${profile.max_hours} ч покрывает ваши ${query.hours} ч`);
    return facts.join('; ') + '. В описании профиля: «' + evidence(profile) + '»';
  }
  function match(profiles, query) {
    validate(query);
    const pool = profiles.filter(p => p.city === query.city && p.categories.includes(query.category));
    const counts = { busy: 0, budget: 0, format: 0, language: 0, hours: 0, calendar: 0 };
    const excluded = [];
    const accepted = [];
    for (const profile of pool) {
      const failed = reasons(profile, query);
      if (failed.length) {
        failed.forEach(key => counts[key]++);
        excluded.push({ id: profile.id, name: profile.anon_name, reasons: failed });
      } else accepted.push(profile);
    }
    // All constraints are hard filters; prefer more budget reserve, then stable ID.
    accepted.sort((a, b) => a.price_from_kzt - b.price_from_kzt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
      status: !pool.length ? 'no_category' : !accepted.length ? 'no_match' : 'matched',
      poolCount: pool.length, eligibleCount: accepted.length, excluded, counts,
      cards: accepted.slice(0, 3).map(profile => ({ ...profile, explanation: explain(profile, query) }))
    };
  }
  const api = { match, validate, reasons, evidence, money, displayDate, WINDOW };
  root.BirgeMatcher = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
