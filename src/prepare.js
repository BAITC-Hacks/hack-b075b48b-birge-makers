import { loadCatalog, loadIndex, saveJsonAtomic, indexCoverage } from './storage.js';
import { AiClient, prepareIndex } from './ai.js';

try {
  const client = new AiClient();
  const dataset = await loadCatalog();
  const output = process.env.AI_INDEX_PATH || 'data/ai-index.json';
  const checkpoint = `${output}.checkpoint.json`;
  const current = await loadIndex(output), partial = await loadIndex(checkpoint);
  // A newer partial run supersedes completed entries only when models match.
  const previous = partial?.models?.llm === client.llm.model && partial?.models?.embedding === client.emb.model
    ? { ...partial, entries: { ...(current?.models?.llm === client.llm.model && current?.models?.embedding === client.emb.model ? current.entries : {}), ...partial.entries } } : current;
  const index = await prepareIndex(dataset.contractors, client, async (id, progress) => {
    await saveJsonAtomic(checkpoint, progress);
    console.error(`Подготовлен ${id} (${Object.keys(progress.entries).length}/${dataset.contractors.length})`);
  }, previous);
  if (!indexCoverage(dataset.contractors, index).ready) throw new Error('AI-индекс не покрывает весь каталог');
  await saveJsonAtomic(output, index);
  console.log(`AI-индекс сохранён: ${output}. Перезапустите сервер для применения.`);
} catch (error) { console.error(`AI-подготовка не завершена: ${error.message}`); process.exitCode = 1; }
