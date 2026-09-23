import { readFile } from 'node:fs/promises';
import { catalog, check, date, object } from './validation.js';

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
  date(request.date);
  const { start, end } = dataset.calendar_coverage;
  check(request.date >= start && request.date <= end, `date: календарь доступен только с ${start} по ${end}`);
}
export async function loadIndex(path = process.env.AI_INDEX_PATH || 'data/ai-index.json') {
  try {
    const index = JSON.parse(await readFile(path, 'utf8'));
    check(index.version === 1 && index.entries && typeof index.entries === 'object', 'Некорректный AI-индекс');
    return index;
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
