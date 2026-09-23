import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { catalog, check, date, object, norm } from './validation.js';
import { fingerprint, snippets } from './engine.js';

export async function loadCatalog(path = process.env.CATALOG_PATH || 'data/contractors.json') {
  const data = JSON.parse(await readFile(path, 'utf8'));
  object(data, 'dataset');
  object(data.calendar_coverage, 'calendar_coverage');
  const start = date(data.calendar_coverage.start), end = date(data.calendar_coverage.end);
  check(start <= end, 'Некорректный диапазон календаря');
  const contractors = catalog(data.contractors);
  check(contractors.every(c => c.busy_dates.every(d => d >= start && d <= end)), 'Занятые даты за пределами calendar_coverage');
  return { ...data, contractors, calendar_coverage: { start, end } };
}
export function checkCoverage(request, dataset) {
  object(request, 'client_request');
  date(request.date);
  const { start, end } = dataset.calendar_coverage;
  check(request.date >= start && request.date <= end, `date: календарь доступен только с ${start} по ${end}`);
}
export async function loadIndex(path = process.env.AI_INDEX_PATH || 'data/ai-index.json') {
  try {
    const index = JSON.parse(await readFile(path, 'utf8'));
    object(index, 'ai_index');
    check(index.version === 1, 'Неизвестная версия AI-индекса');
    object(index.entries, 'ai_index.entries');
    object(index.models, 'ai_index.models');
    check(['llm', 'embedding'].every(k => typeof index.models[k] === 'string' && index.models[k].length > 0), 'AI-индекс: отсутствуют названия моделей');
    for (const entry of Object.values(index.entries)) {
      object(entry, 'ai_index.entry');
      check(typeof entry.fingerprint === 'string' && /^[a-f0-9]{64}$/u.test(entry.fingerprint), 'AI-индекс: некорректный fingerprint');
      object(entry.by_format, 'ai_index.by_format');
      check(Object.entries(entry.by_format).every(([key, value]) => key.length > 0 && (value === null || typeof value === 'string' && value.length <= 240)), 'AI-индекс: некорректная цитата');
    }
    return index;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function indexCoverage(contractors, index) {
  let ready = 0, decisions = 0, quotes = 0;
  for (const c of contractors) {
    const entry = index?.entries?.[c.id];
    if (index?.version !== 1 || entry?.fingerprint !== fingerprint(c)) continue;
    const parts = snippets(c.description);
    const formats = [...new Set(c.event_formats.map(norm))];
    let valid = 0;
    for (const format of formats) {
      if (!Object.hasOwn(entry.by_format ?? {}, format)) continue;
      const quote = entry.by_format[format];
      if (quote === null || parts.includes(quote)) { valid++; decisions++; if (quote !== null) quotes++; }
    }
    if (valid === formats.length) ready++;
  }
  return { ready: ready === contractors.length, covered_contractors: ready, total_contractors: contractors.length, valid_decisions: decisions, selected_quotes: quotes };
}

export async function saveJsonAtomic(path, data) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
    for (let attempt = 0; ; attempt++) {
      try { await rename(temporary, path); break; }
      catch (error) {
        if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 6) throw error;
        await sleep(50 * 2 ** attempt);
      }
    }
  }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
