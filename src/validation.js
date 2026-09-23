export class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
export function check(condition, message) { if (!condition) throw new ValidationError(message); }
export const norm = value => value.normalize('NFKC').trim().toLocaleLowerCase('ru').replace(/\s+/g, ' ');
export function string(value, field, max = 200, multiline = false) {
  const forbidden = multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u : /[\u0000-\u001f]/u;
  check(typeof value === 'string' && value.trim().length > 0 && value.length <= max && !forbidden.test(value), `${field}: ожидается непустая строка длиной до ${max}`);
  return value.trim();
}
export function integer(value, field, min = 0) {
  check(Number.isSafeInteger(value) && value >= min, `${field}: ожидается целое число >= ${min}`);
  return value;
}
export function date(value, field = 'date') {
  check(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${field}: ожидается YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  check(!Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value, `${field}: несуществующая дата`);
  return value;
}
export function object(value, field) { check(value && typeof value === 'object' && !Array.isArray(value), `${field}: ожидается объект`); }
export function request(input) {
  object(input, 'client_request');
  const allowed = ['city', 'date', 'event_format', 'category', 'budget', 'duration_hours', 'language'];
  check(Object.keys(input).every(k => allowed.includes(k)), 'client_request: неизвестное поле');
  return {
    city: string(input.city, 'city'), date: date(input.date),
    event_format: string(input.event_format, 'event_format'), category: string(input.category, 'category'),
    budget: integer(input.budget, 'budget'),
    duration_hours: input.duration_hours == null ? null : integer(input.duration_hours, 'duration_hours', 1),
    language: input.language == null ? null : string(input.language, 'language'),
  };
}
function strings(value, field, allowEmpty = false) {
  check(Array.isArray(value) && value.length <= 100 && (allowEmpty || value.length > 0), `${field}: ожидается массив строк`);
  return value.map(v => string(v, field));
}
export function catalog(input, calendarRequired = true) {
  check(Array.isArray(input) && input.length <= 10000, 'catalog: ожидается массив до 10000 подрядчиков');
  const ids = new Set();
  return input.map((item, i) => {
    object(item, `catalog[${i}]`);
    const id = string(item.id, 'id');
    check(!ids.has(id), `Повторяющийся id: ${id}`); ids.add(id);
    const result = {
      id, anon_name: string(item.anon_name, 'anon_name'), city: string(item.city, 'city'),
      categories: strings(item.categories, 'categories'), event_formats: strings(item.event_formats, 'event_formats'),
      languages: strings(item.languages, 'languages', true), price_from_kzt: integer(item.price_from_kzt, 'price_from_kzt'),
      max_hours: item.max_hours == null ? null : integer(item.max_hours, 'max_hours', 1),
      description: item.description === '' ? '' : string(item.description, 'description', 5000, true),
    };
    for (const flag of ['price_imputed', 'city_imputed', 'synthetic']) {
      if (item[flag] !== undefined) { check(typeof item[flag] === 'boolean', `${flag}: ожидается boolean`); result[flag] = item[flag]; }
    }
    if (calendarRequired || item.busy_dates !== undefined) {
      check(Array.isArray(item.busy_dates), `busy_dates отсутствует у ${id}; доступность нельзя предполагать`);
      result.busy_dates = item.busy_dates.map(d => date(d, 'busy_dates'));
    }
    return result;
  });
}
export const rejectionKeys = ['wrong_category_count', 'busy_on_date_count', 'over_budget_count', 'wrong_format_count', 'wrong_language_count', 'insufficient_duration_count', 'unknown_duration_count'];
export function stats(input, availableCount) {
  object(input, 'rejection_stats');
  const result = { total_in_city: integer(input.total_in_city, 'total_in_city') };
  rejectionKeys.forEach((key, i) => { result[key] = integer(input[key] ?? (i >= 4 ? 0 : undefined), key); });
  check(Object.values(result).slice(1).reduce((a, b) => a + b, 0) + availableCount === result.total_in_city,
    'rejection_stats: нужны непересекающиеся причины; сумма отклонённых + available_contractors должна равняться total_in_city');
  return result;
}
