import { readFile } from 'node:fs/promises';
import { recommend, explainPassed, parseEnvelope, wrap } from './engine.js';
import { loadCatalog, loadIndex, checkCoverage } from './storage.js';
import { object, request } from './validation.js';
try {
  const text = await readFile(process.argv[2] || 'examples/request.json', 'utf8');
  const input = text.trim().startsWith('<') ? parseEnvelope(text) : JSON.parse(text);
  object(input, 'input');
  const index = await loadIndex();
  let result;
  if (Object.hasOwn(input, 'client_request')) result = explainPassed(input, index);
  else { const parsed = request(input); const dataset = await loadCatalog(); checkCoverage(parsed, dataset); result = recommend(parsed, dataset.contractors, index); }
  console.log(wrap(result));
} catch (error) { console.log(wrap({ error: { code: 'INVALID_INPUT', message: error.message } })); process.exitCode = 1; }
