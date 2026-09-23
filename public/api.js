export class ApiError extends Error {
  constructor(code, message = '', status = 0) { super(message); this.name = 'ApiError'; this.code = code; this.status = status; }
}
export function parseEnvelope(text) {
  const match = /^<response>([\s\S]*)<\/response>$/u.exec(text.trim());
  if (!match) throw new ApiError('INVALID_RESPONSE');
  try {
    const result = JSON.parse(match[1]);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch { throw new ApiError('INVALID_RESPONSE'); }
}
export async function api(path, { body, signal } = {}) {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/xml', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    });
    const result = parseEnvelope(await response.text());
    if (!response.ok || result.error) throw new ApiError(result.error?.code || 'HTTP_ERROR', result.error?.message || '', response.status);
    return result;
  } catch (error) {
    if (signal?.aborted || error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR');
  }
}
export function validateOrder(values, coverage) {
  const errors = {};
  for (const field of ['city','date','event_format','category','budget']) if (String(values[field] ?? '').trim() === '') errors[field] = 'required';
  const budget = Number(values.budget);
  if (!errors.budget && (!Number.isSafeInteger(budget) || budget < 0)) errors.budget = 'integer';
  const rawDuration = String(values.duration_hours ?? '').trim();
  const duration = rawDuration ? Number(rawDuration) : null;
  if (duration !== null && (!Number.isSafeInteger(duration) || duration < 1)) errors.duration_hours = 'hoursError';
  const date = String(values.date ?? '');
  const d = new Date(`${date}T00:00:00Z`);
  if (!errors.date && (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(d.valueOf()) || d.toISOString().slice(0,10) !== date || date < coverage.start || date > coverage.end)) errors.date = 'dateError';
  return { errors, order: { city: values.city, date, event_format: values.event_format, category: values.category, budget, duration_hours: duration, language: String(values.language ?? '').trim() || null } };
}
// Abort AND sequence guard: even a transport that ignores abort cannot publish stale data.
export function latestRequests() {
  let controller = null, generation = 0;
  return {
    cancel() { controller?.abort(); generation++; },
    begin() { controller?.abort(); controller = new AbortController(); const id = ++generation; return { signal: controller.signal, current: () => id === generation }; },
  };
}
