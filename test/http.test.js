import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { loadCatalog } from '../src/storage.js';

test('HTTP: health, справочник, рекомендации, XML-вход и контролируемые ошибки', async t => {
  const server = createApp(await loadCatalog());
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function call(path, body, contentType = 'application/json') {
    const response = await fetch(base + path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': contentType }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    const text = await response.text();
    assert.match(response.headers.get('content-type'), /application\/xml/);
    assert.ok(text.startsWith('<response>') && text.endsWith('</response>'));
    return { status: response.status, data: JSON.parse(text.slice(10, -11)), text };
  }
  assert.equal((await call('/health')).data.contractor_count, 66);
  assert.ok((await call('/catalog/options')).data.categories.includes('Банкетный зал'));
  const request = { city: 'Алматы', date: '2026-11-14', category: 'Ведущий', event_format: 'корпоратив', budget: 1500000, duration_hours: 4, language: 'русский' };
  const first = await call('/recommend', request);
  assert.equal(first.status, 200); assert.equal(first.data.cards.length, 3);
  assert.equal(first.text, (await call('/recommend', request)).text);
  assert.equal((await call('/recommend', { ...request, date: '2027-01-01' })).status, 400);
  assert.equal((await call('/recommend', 'broken json')).status, 400);
  assert.equal((await call('/explain', 'null')).status, 400);
  assert.equal((await call('/recommend', '{}', 'text/plain')).status, 415);
  assert.equal((await call('/recommend')).status, 405);
  assert.equal((await call('/missing')).status, 404);
  const xml = `<client_request>${JSON.stringify(request)}</client_request><rejection_stats>{"total_in_city":1,"wrong_category_count":0,"busy_on_date_count":1,"over_budget_count":0,"wrong_format_count":0}</rejection_stats><available_contractors>[]</available_contractors>`;
  const explained = await call('/explain', xml, 'application/xml');
  assert.equal(explained.status, 200); assert.equal(explained.data.status, 'no_match');
  assert.match(explained.data.meta_explanation, /заняты/);
  assert.equal((await call('/recommend', 'x'.repeat(1000001))).status, 413);
});
