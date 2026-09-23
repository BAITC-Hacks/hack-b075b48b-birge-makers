import { writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { loadCatalog } from './storage.js';
import { AiClient, prepareIndex } from './ai.js';

try {
  const client = new AiClient();
  const dataset = await loadCatalog();
  const index = await prepareIndex(dataset.contractors, client, id => console.error(`Подготовлен ${id}`));
  const output = process.env.AI_INDEX_PATH || 'data/ai-index.json';
  await mkdir(dirname(output), { recursive: true });
  await writeFile(`${output}.tmp`, JSON.stringify(index, null, 2), 'utf8');
  await rename(`${output}.tmp`, output);
  console.log(`AI-индекс сохранён: ${output}. Перезапустите сервер для применения.`);
} catch (error) { console.error(`AI-подготовка не завершена: ${error.message}`); process.exitCode = 1; }
