import assert from 'node:assert/strict';
import { AiClient, prepareIndex } from '../src/ai.js';
import { loadCatalog, indexCoverage, saveJsonAtomic } from '../src/storage.js';
import { snippets, recommend, wrap } from '../src/engine.js';

try {
  const dataset = await loadCatalog();
  const original = dataset.contractors.find(c => snippets(c.description).length >= 2);
  assert.ok(original, 'Нет профиля с двумя проверяемыми фактами');
  const contractor = { ...original, event_formats: [original.event_formats[0]] };
  const client = new AiClient();
  const index = await prepareIndex([contractor], client);
  assert.ok(indexCoverage([contractor], index).ready);
  let day = new Date(dataset.calendar_coverage.start + 'T00:00:00Z');
  while (contractor.busy_dates.includes(day.toISOString().slice(0, 10))) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  assert.ok(date <= dataset.calendar_coverage.end);
  const request = { city: contractor.city, date, event_format: contractor.event_formats[0], category: contractor.categories[0], budget: contractor.price_from_kzt };
  const result = recommend(request, [contractor], index);
  assert.equal(result.cards.length, 1);
  assert.ok(result.cards[0].ai_index_applied);
  assert.equal(wrap(result), wrap(recommend(request, [contractor], index)));
  const report = { result: 'passed', models: index.models, real_embedding_and_llm_calls: true, contractor_id: contractor.id, explanation: result.cards[0].explanation, ai_index_applied: true };
  await saveJsonAtomic('reports/ai-smoke.json', report);
  console.log(JSON.stringify(report, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
