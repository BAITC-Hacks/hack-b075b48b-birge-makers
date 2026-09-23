import test from 'node:test';
import assert from 'node:assert/strict';
import { AiClient, cosine, prepareIndex } from '../src/ai.js';
import { catalog } from '../src/validation.js';
import { recommend } from '../src/engine.js';

const env = { LLM_BASE_URL: 'https://example.test/v1', LLM_API_KEY: 'test-only', LLM_MODEL: 'mock-llm', EMBEDDING_BASE_URL: 'https://example.test/v1', EMBEDDING_API_KEY: 'test-only', EMBEDDING_MODEL: 'mock-embedding' };
const c = catalog([{ id: 'ai', anon_name: 'Тест', city: 'Алматы', categories: ['Ведущий'], price_from_kzt: 100, languages: ['русский'], event_formats: ['корпоратив'], max_hours: 4, description: 'Работаю на сцене 12 лет. В комплекте 2 радиомикрофона.', busy_dates: [] }])[0];
test('полный AI-проход: embeddings → выбор LLM → проверенный индекс → объяснение', async () => {
  const calls = [];
  const client = new AiClient(env, async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.endsWith('/embeddings')) return Response.json({ data: [{ index: 2, embedding: [1, 0] }, { index: 0, embedding: [1, 0] }, { index: 1, embedding: [0, 1] }] });
    return Response.json({ choices: [{ message: { content: '{"index":1}' } }] });
  });
  const index = await prepareIndex([c], client);
  assert.equal(index.entries.ai.by_format.корпоратив, 'В комплекте 2 радиомикрофона.');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.messages.length, 2);
  const result = recommend({ city: 'Алматы', date: '2026-11-14', category: 'Ведущий', event_format: 'корпоратив', budget: 200 }, [c], index);
  assert.equal(result.cards[0].explanation_source, 'ai_index');
  assert.match(result.cards[0].explanation, /2 радиомикрофона/);
  assert.deepEqual(result, recommend({ city: 'Алматы', date: '2026-11-14', category: 'Ведущий', event_format: 'корпоратив', budget: 200 }, [c], index));
});
test('LLM не может добавить факт, вернуть чужой индекс или свободный текст', async () => {
  for (const content of ['{"index":999}', '{"index":0,"quote":"Выдумка"}', 'не JSON', 'null']) {
    const client = new AiClient(env, async () => Response.json({ choices: [{ message: { content } }] }));
    await assert.rejects(client.select('корпоратив', [{ index: 0, quote: c.description }]));
  }
});
test('отсутствие факта допускает null', async () => {
  const client = new AiClient(env, async () => Response.json({ choices: [{ message: { content: '{"index":null}' } }] }));
  assert.equal(await client.select('корпоратив', [{ index: 0, quote: c.description }]), null);
});
test('ошибки API, таймауты и повреждённые embedding-ответы не скрываются', async () => {
  const failed = new AiClient(env, async () => new Response('secret provider text', { status: 429 }));
  await assert.rejects(failed.embed(['test']), { message: 'AI API: HTTP 429 [EMBEDDING; model=mock-embedding; host=example.test].' });
  const timeout = new AiClient(env, async () => { throw new DOMException('Timeout', 'TimeoutError'); });
  await assert.rejects(timeout.embed(['test']), { name: 'TimeoutError' });
  for (const data of [[], [{ index: 1, embedding: [1] }], [{ index: 0, embedding: [0, 0] }], [{ index: 0, embedding: [null] }]]) {
    const broken = new AiClient(env, async () => Response.json({ data }));
    await assert.rejects(broken.embed(['test']));
  }
});
test('проверка конфигурации и размерности векторов', () => {
  assert.throws(() => new AiClient({}));
  assert.throws(() => new AiClient({ ...env, LLM_BASE_URL: 'http://remote.example/v1' }));
  assert.throws(() => cosine([1], [1, 2]));
  assert.equal(cosine([1, 0], [0, 1]), 0);
});
test('HTTP 410 указывает модель, этап и причину без утечки ключа или тела ответа', async () => {
  const client = new AiClient(env, async () => new Response('private error body', { status: 410 }));
  await assert.rejects(client.select('корпоратив', [{ index: 0, quote: '2 микрофона' }]), error => {
    assert.match(error.message, /HTTP 410 \[LLM; model=mock-llm; host=example.test\]/u);
    assert.match(error.message, /сняты с обслуживания/u);
    assert.ok(!error.message.includes(env.LLM_API_KEY));
    assert.ok(!error.message.includes('private error body'));
    return true;
  });
});
