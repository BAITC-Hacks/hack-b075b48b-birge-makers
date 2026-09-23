import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { catalog, check, date } from '../src/validation.js';

// RFC 4180 subset with quoted multiline cells, commas, and doubled quotes.
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/u, '');
  const rows = []; let row = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; } else cell += c;
    } else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); if (row.some(v => v !== '')) rows.push(row);
      row = []; cell = ''; closed = false;
    } else if (c === '"') { check(!closed && !cell.length, 'CSV: неожиданные кавычки'); quoted = true; }
    else { check(!closed, 'CSV: символы после закрывающей кавычки'); cell += c; }
  }
  check(!quoted, 'CSV: незакрытая кавычка');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift(); check(headers?.length && new Set(headers).size === headers.length, 'CSV: некорректный заголовок');
  return rows.map((values, i) => {
    check(values.length === headers.length, `CSV: неверное число колонок в строке ${i + 2}`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}
export function convertCsv(text, start, end) {
  date(start); date(end); check(start <= end, 'Некорректный диапазон календаря');
  const list = value => value ? value.split('|').map(s => s.trim()) : [];
  const bool = value => { check(/^(True|False)$/u.test(value), 'CSV: ожидается True/False'); return value === 'True'; };
  const number = value => { check(/^\d+$/u.test(value), 'CSV: ожидается целое число'); return Number(value); };
  const contractors = catalog(parseCsv(text).map(row => ({
    id: row.id, anon_name: row.anon_name, city: row.city, categories: list(row.categories),
    price_from_kzt: number(row.price_from_kzt), event_formats: list(row.event_formats), languages: list(row.languages),
    max_hours: row.max_hours ? number(row.max_hours) : null, busy_dates: list(row.busy_dates),
    description: row.description.replace(/\s+/gu, ' ').trim(),
    price_imputed: bool(row.price_imputed), city_imputed: bool(row.city_imputed), synthetic: bool(row.synthetic),
  })));
  check(contractors.every(c => c.busy_dates.every(d => d >= start && d <= end)), 'CSV: даты вне диапазона');
  return { source: 'hackathon dataset anonymized .csv', source_sha256: createHash('sha256').update(text).digest('hex'), calendar_coverage: { start, end }, contractors };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [input, output = 'data/contractors.json', start = '2026-09-23', end = '2026-12-31'] = process.argv.slice(2);
    check(input, 'Использование: node scripts/import-csv.js <input.csv> [output.json] [start] [end]');
    const data = convertCsv(await readFile(input, 'utf8'), start, end);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Импортировано ${data.contractors.length} профилей в ${output}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
