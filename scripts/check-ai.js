import { AiClient } from '../src/ai.js';

const client = new AiClient();
if (process.argv[2]) client.llm.model = process.argv[2];
try {
  await client.select('корпоратив', [{ index: 0, quote: 'В комплекте 2 микрофона.' }]);
  console.log(`LLM: OK (${client.llm.model})`);
} catch (error) { console.log(`LLM: ${error.message}`); process.exitCode = 1; }
try {
  const response = await fetch(`${client.llm.base.replace(/\/$/u, '')}/models`, {
    headers: { Authorization: `Bearer ${client.llm.key}` },
    signal: AbortSignal.timeout(client.timeout), redirect: 'error',
  });
  console.log(`Models: HTTP ${response.status}`);
  if (response.ok) {
    const result = await response.json();
    const ids = result.data.map(x => x.id);
    console.log(`Configured model listed: ${ids.includes(client.llm.model)}`);
    console.log('Candidates:', ids.filter(id => /instruct|nemotron|qwen/iu.test(id)).slice(0, 30).join(', '));
  }
} catch (error) { console.log(`Models: ${error.name}`); process.exitCode = 1; }
