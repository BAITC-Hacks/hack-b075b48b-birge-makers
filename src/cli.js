import { readFile } from 'node:fs/promises';
import { recommend, explainPassed, parseEnvelope, wrap } from './engine.js';
import { loadCatalog, loadIndex, checkCoverage } from './storage.js';
try {
  const text = await readFile(process.argv[2] || 'examples/request.json', 'utf8');
  const input = text.trim().startsWith('<') ? parseEnvelope(text) : JSON.parse(text);
  const index = await loadIndex();
  let result;
  if (input.client_request) result = explainPassed(input, index);
  else { const dataset = await loadCatalog(); checkCoverage(input, dataset); result = recommend(input, dataset.contractors, index); }
  console.log(wrap(result));
} catch (error) { console.log(wrap({ error: { code: 'INVALID_INPUT', message: error.message } })); process.exitCode = 1; }
