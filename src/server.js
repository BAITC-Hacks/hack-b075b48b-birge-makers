import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { recommend, explainPassed, parseEnvelope, wrap } from './engine.js';
import { ValidationError, request } from './validation.js';
import { loadCatalog, loadIndex, checkCoverage } from './storage.js';

export function createApp(dataset, index = null) {
  return createServer(async (req, res) => {
    const send = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/xml; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end(wrap(data)); };
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { status: 'ok', contractor_count: dataset.contractors.length, calendar_coverage: dataset.calendar_coverage, ai_index_loaded: !!index });
      if (req.method === 'GET' && req.url === '/catalog/options') return send(200, {
        cities: [...new Set(dataset.contractors.map(c => c.city))].sort(),
        categories: [...new Set(dataset.contractors.flatMap(c => c.categories))].sort(),
        event_formats: [...new Set(dataset.contractors.flatMap(c => c.event_formats))].sort(),
        languages: [...new Set(dataset.contractors.flatMap(c => c.languages))].sort(), calendar_coverage: dataset.calendar_coverage,
      });
      if (!['/recommend', '/explain'].includes(req.url)) return send(404, { error: { code: 'NOT_FOUND', message: 'Маршрут не найден' } });
      if (req.method !== 'POST') return send(405, { error: { code: 'METHOD_NOT_ALLOWED', message: 'Используйте POST' } });
      const contentType = (req.headers['content-type'] || '').split(';')[0];
      if (!['application/json', 'application/xml', 'text/xml'].includes(contentType)) return send(415, { error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Нужен application/json или application/xml' } });
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1_000_000) { send(413, { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Лимит тела запроса: 1 MB' } }); req.resume(); return; }
        chunks.push(chunk);
      }
      const text = Buffer.concat(chunks).toString('utf8');
      const input = contentType === 'application/json' ? JSON.parse(text) : parseEnvelope(text);
      if (req.url === '/explain') return send(200, explainPassed(input, index));
      const parsed = request(input);
      checkCoverage(parsed, dataset);
      return send(200, recommend(parsed, dataset.contractors, index));
    } catch (error) {
      if (error instanceof ValidationError || error instanceof SyntaxError) return send(400, { error: { code: 'INVALID_INPUT', message: error instanceof SyntaxError ? 'Некорректный JSON' : error.message } });
      console.error('Request failed:', error.name);
      return send(500, { error: { code: 'INTERNAL_ERROR', message: 'Внутренняя ошибка сервиса' } });
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const dataset = await loadCatalog(), index = await loadIndex();
    const server = createApp(dataset, index);
    const host = process.env.HOST || '127.0.0.1', port = Number(process.env.PORT || 3000);
    server.requestTimeout = 15000; server.headersTimeout = 10000;
    server.listen(port, host, () => console.log(`Birge Explain: http://${host}:${port}; ${dataset.contractors.length} профилей; AI-индекс: ${!!index}`));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
