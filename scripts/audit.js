import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadCatalog, loadIndex, indexCoverage, saveJsonAtomic } from '../src/storage.js';
import { recommend, wrap } from '../src/engine.js';
import { norm } from '../src/validation.js';
import { convertCsv } from './import-csv.js';

const dataset = await loadCatalog(), index = await loadIndex();
if (process.argv[2]) {
  const imported = convertCsv(await readFile(process.argv[2], 'utf8'), dataset.calendar_coverage.start, dataset.calendar_coverage.end);
  assert.deepEqual(imported.contractors, dataset.contractors, 'Каталог отличается от исходного CSV');
  assert.equal(imported.source_sha256, dataset.source_sha256, 'Хеш источника отличается');
}
const coverage = indexCoverage(dataset.contractors, index);
assert.ok(coverage.ready, 'AI-индекс неполный: выполните npm run ai:prepare');
const byId = new Map(dataset.contractors.map(c => [c.id, c]));
const groups = new Map();
for (const c of dataset.contractors) for (const category of c.categories) for (const format of c.event_formats) {
  groups.set(JSON.stringify([c.city, category, format]), { city: c.city, category, event_format: format });
}
const matches = (values, value) => values.some(v => norm(v) === norm(value));
let queries = 0, cards = 0, aiQuotes = 0, limitedResults = 0;
const outcomes = { matched: 0, no_match: 0, no_category_in_city: 0 };
let reversed = false;
function verify(request) {
  const result = recommend(request, dataset.contractors, index);
  const inCity = dataset.contractors.filter(c => norm(c.city) === norm(request.city));
  const category = inCity.filter(c => matches(c.categories, request.category));
  const eligible = category.filter(c => !c.busy_dates.includes(request.date) && c.price_from_kzt <= request.budget
    && matches(c.event_formats, request.event_format) && (!request.language || matches(c.languages, request.language))
    && (!request.duration_hours || c.max_hours !== null && c.max_hours >= request.duration_hours));
  assert.equal(result.status, !category.length ? 'no_category_in_city' : eligible.length ? 'matched' : 'no_match');
  assert.equal(result.eligible_count, eligible.length);
  assert.equal(result.cards.length, Math.min(3, eligible.length));
  assert.equal(result.rejection_stats.total_in_city, inCity.length);
  assert.equal(Object.entries(result.rejection_stats).filter(([k]) => k !== 'total_in_city').reduce((sum, [,n]) => sum+n, eligible.length), inCity.length);
  if (result.cards.length < 3) { assert.ok(result.meta_explanation); limitedResults++; }
  for (const card of result.cards) {
    const original = byId.get(card.id);
    assert.ok(eligible.some(c => c.id === card.id));
    assert.equal(card.price_from_kzt, original.price_from_kzt);
    assert.ok(card.ai_index_applied, `Нет решения AI-конвейера для ${card.id}`);
    for (const fact of card.evidence.filter(f => f.field === 'description')) assert.ok(original.description.includes(fact.value));
    assert.ok(!/отличный выбор|идеальный кандидат|прекрасный вариант/iu.test(card.explanation));
    if (card.explanation_source === 'ai_index') aiQuotes++;
    cards++;
  }
  const encoded = wrap(result); assert.deepEqual(JSON.parse(encoded.slice(10, -11)), result);
  if (!reversed) assert.equal(wrap(recommend(request, [...dataset.contractors].reverse(), index)), encoded);
  outcomes[result.status]++; queries++;
}
for (let day = new Date(dataset.calendar_coverage.start + 'T00:00:00Z'); day.toISOString().slice(0,10) <= dataset.calendar_coverage.end; day.setUTCDate(day.getUTCDate()+1)) {
  const date = day.toISOString().slice(0,10);
  for (const group of groups.values()) verify({ ...group, date, budget: 10000000 });
  reversed = true;
}
for (const c of dataset.contractors) {
  const base = { city: c.city, category: c.categories[0], event_format: c.event_formats[0], date: '2026-11-14', budget: c.price_from_kzt };
  verify(base);
  verify({ ...base, budget: Math.max(0, c.price_from_kzt - 1), duration_hours: (c.max_hours ?? 1) + 1, language: c.languages[0] ?? 'русский' });
  verify({ ...base, category: 'Несуществующая категория' });
}
const report = { catalog_records: dataset.contractors.length, calendar_coverage: dataset.calendar_coverage, request_groups: groups.size, queries, cards, aiQuotes, limitedResults, outcomes, ai_coverage: coverage, source_compared: !!process.argv[2], result: 'passed' };
await saveJsonAtomic('reports/audit.json', report);
console.log(JSON.stringify(report, null, 2));
