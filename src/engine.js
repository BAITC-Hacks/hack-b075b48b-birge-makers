import { createHash } from 'node:crypto';
import { request, catalog, stats, norm, rejectionKeys, check, object } from './validation.js';

export const fingerprint = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const contains = (values, value) => values.some(v => norm(v) === norm(value));
const money = value => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export function reject(c, r, calendar = true) {
  if (!contains(c.categories, r.category)) return 'wrong_category_count';
  if (calendar && c.busy_dates.includes(r.date)) return 'busy_on_date_count';
  if (c.price_from_kzt > r.budget) return 'over_budget_count';
  if (!contains(c.event_formats, r.event_format)) return 'wrong_format_count';
  if (r.language && !contains(c.languages, r.language)) return 'wrong_language_count';
  if (r.duration_hours && c.max_hours === null) return 'unknown_duration_count';
  if (r.duration_hours && c.max_hours < r.duration_hours) return 'insufficient_duration_count';
  return null;
}

// Quotes are source evidence, never instructions or model-authored claims.
export function safeQuote(description, quote) {
  return typeof quote === 'string' && quote.length >= 8 && quote.length <= 240 && description.includes(quote)
    && !/[<>\n\r]/u.test(quote)
    && !/ignore|instruction|system|assistant|prompt|игнорир|инструкц|промпт|идеальн|отличн|лучш|прекрасн|востребован|незабываем|приветству|дорогие друзья|харизм|атмосфер|креативн|интеллигентн|комфорт|крупнейш|настоящий праздник|оригинальн|держит зал|меня зовут|тёплую|легкую|лёгкую/iu.test(quote)
    && /\d|оборудован|сценари|интерактив|DJ|дидже|скрипк|саксофон|домбр|репертуар|кавер|вокал|вместим|банкетн|террас|парков|экран|проектор|микрофон|телеканал|радиостанц|съёмк|съемк|монтаж|флорист|оформлен|букет|фотозон|свет|звук|костюм|церемон|русск|казахск|английск/iu.test(quote);
}
export function snippets(description) {
  return (description.match(/[^.!?•;]+[.!?]?/gu) || []).map(s => s.trim()).filter(s => safeQuote(description, s));
}
function detail(c, r, index) {
  const available = snippets(c.description);
  const entry = index?.entries?.[c.id];
  if (index?.version === 1 && entry?.fingerprint === fingerprint(c)) {
    const quote = entry.by_format?.[norm(r.event_format)];
    if (quote === null || available.includes(quote)) return { quote, source: 'ai_index' };
  }
  // Prefer measurable details and equipment over broad service descriptions.
  const specificity = quote => (/\d/u.test(quote) ? 3 : 0)
    + (/оборудован|микрофон|проектор|экран|телеканал|радиостанц|скрипк|саксофон|домбр/iu.test(quote) ? 2 : 0)
    + (norm(quote).includes(norm(r.event_format)) ? 1 : 0);
  const ranked = available.map((quote, i) => ({ quote, i, score: specificity(quote) }))
    .sort((a, b) => b.score - a.score || a.i - b.i);
  return { quote: ranked[0]?.quote ?? null, source: 'source_template' };
}
function card(c, r, index) {
  const evidence = [
    { field: 'price_from_kzt', value: c.price_from_kzt, budget_kzt: r.budget, headroom_from_starting_price_kzt: r.budget - c.price_from_kzt },
    { field: 'event_formats', value: c.event_formats.find(v => norm(v) === norm(r.event_format)) },
  ];
  const facts = [`формат «${r.event_format}» указан в каталоге`];
  if (c.languages.length) { facts.push(`языки — ${c.languages.join(', ')}`); evidence.push({ field: 'languages', value: c.languages, requested: r.language }); }
  if (r.duration_hours) { facts.push(`лимит ${c.max_hours} ч покрывает запрос на ${r.duration_hours} ч`); evidence.push({ field: 'max_hours', value: c.max_hours, requested: r.duration_hours }); }
  else if (c.max_hours !== null) { facts.push(`максимальная длительность — ${c.max_hours} ч`); evidence.push({ field: 'max_hours', value: c.max_hours }); }
  const d = detail(c, r, index);
  if (d.quote) evidence.push({ field: 'description', value: d.quote });
  const priceRelation = r.budget === c.price_from_kzt ? `равна бюджету ${money(r.budget)} ₸` : `на ${money(r.budget - c.price_from_kzt)} ₸ ниже бюджета ${money(r.budget)} ₸`;
  const explanation = `Цена от ${money(c.price_from_kzt)} ₸ — ${priceRelation}; ${facts.join('; ')}.`
    + (d.quote ? ` В описании: «${d.quote.replace(/[.!?]+$/u, '')}».` : '');
  return {
    id: c.id, name: c.anon_name, category: r.category, city: c.city,
    price_from_kzt: c.price_from_kzt, explanation, evidence,
    explanation_source: d.quote ? d.source : 'structured_facts',
    data_flags: { price_imputed: c.price_imputed ?? null, city_imputed: c.city_imputed ?? null, synthetic: c.synthetic ?? null },
    price_note: c.price_imputed ? 'Стартовая цена проставлена при подготовке датасета; итоговая стоимость заказа не подтверждена.' : 'В каталоге указана стартовая цена; итоговая стоимость заказа не подтверждена.',
  };
}
const labels = {
  wrong_category_count: 'другая категория', busy_on_date_count: 'заняты на выбранную дату',
  over_budget_count: 'стартовая цена выше бюджета', wrong_format_count: 'не указан нужный формат',
  wrong_language_count: 'не указан нужный язык', insufficient_duration_count: 'лимит часов меньше запрошенного',
  unknown_duration_count: 'не указана максимальная длительность',
};
function response(r, candidates, rejection, index, availabilitySource) {
  const selected = [...candidates].sort((a, b) => a.price_from_kzt - b.price_from_kzt || compare(a.id, b.id)).slice(0, 3);
  const categoryCount = rejection.total_in_city - rejection.wrong_category_count;
  const status = categoryCount === 0 ? 'no_category_in_city' : candidates.length ? 'matched' : 'no_match';
  const reasons = rejectionKeys.filter(k => rejection[k] > 0).map(k => `${labels[k]} — ${rejection[k]}`);
  let meta = null;
  if (selected.length < 3) {
    meta = categoryCount === 0
      ? `В каталоге для города «${r.city}» нет подрядчиков категории «${r.category}»; всего записей в городе — ${rejection.total_in_city}.`
      : `Условия прошли ${candidates.length} из ${categoryCount} подрядчиков категории «${r.category}» в городе «${r.city}» на ${r.date}.`;
    if (reasons.length) meta += ` Причины исключения (каждый подрядчик учтён один раз): ${reasons.join('; ')}.`;
    if (!reasons.length && candidates.length) meta += ` В каталоге доступны только ${candidates.length} записи этой категории в городе.`;
  }
  const cards = selected.map(c => card(c, r, index));
  const withoutNames = text => norm(cards.reduce((value, c) => value.replaceAll(c.name, ''), text));
  const duplicates = cards.filter((c, i) => cards.some((other, j) => j !== i && withoutNames(c.explanation) === withoutNames(other.explanation)));
  return {
    status, cards, meta_explanation: meta, eligible_count: candidates.length,
    rejection_stats: rejection, availability_source: availabilitySource,
    explanation_limitations: duplicates.length ? [`У записей ${duplicates.map(c => c.id).join(', ')} совпадают объясняющие факты; уникальные преимущества из этих данных вывести нельзя.`] : [],
    data_version: fingerprint({ candidates: [...candidates].sort((a,b) => compare(a.id,b.id)), rejection, index: index ?? null }),
  };
}
export function recommend(input, source, index = null) {
  const r = request(input), items = catalog(source);
  const rejection = { total_in_city: 0, ...Object.fromEntries(rejectionKeys.map(k => [k, 0])) };
  const candidates = [];
  for (const c of items) {
    if (norm(c.city) !== norm(r.city)) continue;
    rejection.total_in_city++;
    const reason = reject(c, r);
    if (reason) rejection[reason]++; else candidates.push(c);
  }
  return response(r, candidates, rejection, index, 'catalog_calendar');
}
export function explainPassed(input, index = null) {
  object(input, 'input');
  const r = request(input.client_request), items = catalog(input.available_contractors, false);
  const rejection = stats(input.rejection_stats, items.length);
  for (const c of items) {
    check(norm(c.city) === norm(r.city) && !reject(c, r, c.busy_dates !== undefined), `available_contractors: ${c.id} не проходит условия`);
  }
  return response(r, items, rejection, index, 'upstream_prefiltered');
}
export function wrap(value) {
  // Escaping inside JSON keeps the XML element valid and JSON.parse restores the originals.
  return `<response>${JSON.stringify(value).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e')}</response>`;
}
export function parseEnvelope(text) {
  let rest = text.trim(); const result = {};
  for (const tag of ['client_request', 'rejection_stats', 'available_contractors']) {
    const open = `<${tag}>`, close = `</${tag}>`;
    check(rest.startsWith(open), `Ожидается ${open}`);
    const end = rest.indexOf(close, open.length); check(end >= 0, `Ожидается ${close}`);
    try { result[tag] = JSON.parse(rest.slice(open.length, end)); } catch { check(false, `Некорректный JSON внутри ${open}`); }
    rest = rest.slice(end + close.length).trim();
  }
  check(rest === '', 'Лишние данные после XML-конверта'); return result;
}
