import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { AiClient, prepareIndex } from '../src/ai.js';
import { catalog } from '../src/validation.js';
import { fingerprint, snippets, recommend } from '../src/engine.js';
import { indexCoverage, saveJsonAtomic, loadIndex } from '../src/storage.js';
import { createApp } from '../src/server.js';
import { once } from 'node:events';

const env = { LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'secret', LLM_MODEL: 'llm', EMBEDDING_BASE_URL: 'https://example.test/v1', EMBEDDING_API_KEY: 'secret', EMBEDDING_MODEL: 'emb' };
const c = catalog([{ id: 'a', anon_name: 'Тест', city: 'Алматы', categories: ['Ведущий'], event_formats: ['корпоратив', 'свадьба'], languages: ['русский'], max_hours: 4, price_from_kzt: 100, busy_dates: [], description: 'В комплекте 2 микрофона.' }])[0];
const fakeClient = { llm: { model: 'llm' }, emb: { model: 'emb' }, embed: async texts => texts.map(() => [1, 0]), select: async (format, choices) => choices[0].quote };

test('индекс содержит явный null для каждого формата без пригодных фрагментов', async () => {
  const source = { ...c, description: 'Отличный выбор для вас!' };
  const client = { ...fakeClient, embed: () => assert.fail('Не нужно вызывать API без фактов') };
  const index = await prepareIndex([source], client);
  assert.deepEqual({ ...index.entries.a.by_format }, { корпоратив: null, свадьба: null });
  assert.ok(indexCoverage([source], index).ready);
  const result = recommend({ city: c.city, category: 'Ведущий', event_format: 'корпоратив', date: '2026-11-14', budget: 100 }, [source], index);
  assert.equal(result.cards[0].explanation_source, 'structured_facts');
  assert.ok(result.cards[0].ai_index_applied);
});
test('повторная подготовка не вызывает API для готового каталога', async () => {
  const first = await prepareIndex([c], fakeClient);
  const client = { ...fakeClient, embed: () => assert.fail('Нельзя оплачивать повторный запрос') };
  const second = await prepareIndex([c], client, () => {}, first);
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
});
test('подготовка возобновляется после сбоя, смена модели инвалидирует кэш', async () => {
  let checkpoint;
  const second = { ...c, id: 'b' };
  await assert.rejects(prepareIndex([c, second], { ...fakeClient, select: async () => { if (checkpoint) throw new Error('temporary'); return c.description; } }, (id, progress) => { checkpoint = JSON.parse(JSON.stringify(progress)); }), /Подрядчик b: temporary/);
  let embeddingCalls = 0;
  const client = { ...fakeClient, embed: async texts => { embeddingCalls++; return texts.map(() => [1, 0]); } };
  const result = await prepareIndex([c, second], client, () => {}, checkpoint);
  assert.equal(embeddingCalls, 1);
  assert.ok(indexCoverage([c, second], result).ready);
  embeddingCalls = 0;
  await prepareIndex([c], { ...client, llm: { model: 'different' } }, () => {}, result);
  assert.equal(embeddingCalls, 1);
});
test('устаревшие и отсутствующие решения не объявляются готовым индексом', () => {
  const index = { version: 1, entries: { a: { fingerprint: fingerprint(c), by_format: { корпоратив: null } } } };
  assert.equal(indexCoverage([c], index).ready, false);
  index.entries.a.by_format.свадьба = c.description;
  assert.equal(indexCoverage([c], index).ready, true);
  assert.equal(indexCoverage([{ ...c, max_hours: 8 }], index).ready, false);
  index.entries.a.by_format.свадьба = 'Есть 5 микрофонов.';
  assert.equal(indexCoverage([c], index).ready, false);
});
test('429 и 503 повторяются с ограниченным ожиданием, 401 не повторяется', async () => {
  let calls = 0; const delays = [];
  const client = new AiClient(env, async () => {
    calls++;
    return calls === 1 ? new Response('', { status: 429, headers: { 'retry-after': '1000' } }) : calls === 2 ? new Response('', { status: 503 }) : Response.json({ choices: [{ message: { content: '{"index":0}' } }] });
  }, async ms => delays.push(ms));
  assert.equal(await client.select('корпоратив', [{ index: 0, quote: c.description }]), c.description);
  assert.equal(calls, 3); assert.deepEqual(delays, [10000, 1000]);
  calls = 0;
  const denied = new AiClient(env, async () => { calls++; return new Response('private', { status: 401 }); });
  await assert.rejects(denied.select('корпоратив', []), /HTTP 401/);
  assert.equal(calls, 1);
});
test('дробные числа и версии не обрезаются при выделении цитат', () => {
  const text = 'Съёмка длится 1.5 часа. Есть камера версии 2.0!';
  assert.deepEqual(snippets(text), ['Съёмка длится 1.5 часа.', 'Есть камера версии 2.0!']);
});
test('файл индекса сохраняется целиком; некорректный индекс отклоняется', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'birge-index-'));
  try {
    const path = join(directory, 'index.json');
    const index = await prepareIndex([c], fakeClient);
    await saveJsonAtomic(path, index);
    assert.ok(indexCoverage([c], await loadIndex(path)).ready);
    await saveJsonAtomic(path, { version: 1, entries: [], models: index.models });
    await assert.rejects(loadIndex(path), /ожидается объект/);
    assert.ok(JSON.parse(await readFile(path, 'utf8')));
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('birge-index-'));
    await rm(directory, { recursive: true, force: true });
  }
});
test('невалидный JSON провайдера и незавершённый ответ не попадают в индекс', async () => {
  const malformed = new AiClient(env, async () => new Response('private provider detail', { status: 200 }));
  await assert.rejects(malformed.embed(['x']), error => {
    assert.match(error.message, /некорректный JSON/); assert.ok(!error.message.includes('private provider')); return true;
  });
  const truncated = new AiClient(env, async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{"index":0}' } }] }));
  await assert.rejects(truncated.select('корпоратив', [{ index: 0, quote: c.description }]), /не завершила/);
});
test('health различает загруженный, но неполный индекс', async t => {
  const index = { version: 1, entries: { a: { fingerprint: fingerprint(c), by_format: {} } } };
  const server = createApp({ contractors: [c], calendar_coverage: { start: '2026-09-23', end: '2026-12-31' } }, index);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const text = await (await fetch(`http://127.0.0.1:${server.address().port}/health`)).text();
  const result = JSON.parse(text.slice(10, -11));
  assert.equal(result.ai_index_loaded, true); assert.equal(result.ai.ready, false);
});
