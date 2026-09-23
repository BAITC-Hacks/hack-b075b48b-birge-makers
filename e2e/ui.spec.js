import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function open(page) { await page.goto('/'); await expect(page.locator('#city')).toBeEnabled(); }
async function fill(page, overrides={}) {
  const r={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:'1500000',duration_hours:'4',language:'русский',...overrides};
  for (const name of ['city','category','event_format','language']) await page.locator('#'+name).selectOption(r[name]);
  for (const name of ['date','budget','duration_hours']) await page.locator('#'+name).fill(r[name]);
}
const requestOrder={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:1500000,duration_hours:4,language:'русский'};
const decode=async response=>JSON.parse((await response.text()).slice(10,-11));

test('REAL backend: form, numeric payload, 3 cards, exact explanations and deterministic order',async({page,request})=>{
  await open(page); await fill(page);
  const outgoing=page.waitForRequest(r=>r.url().endsWith('/recommend'));
  await page.locator('#submit-order').click();
  expect((await outgoing).postDataJSON()).toEqual(requestOrder);
  await expect(page.locator('.contractor-card')).toHaveCount(3);
  const raw=await decode(await request.post('/recommend',{data:requestOrder}));
  expect(await page.locator('.contractor-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.contractorId))).toEqual(raw.cards.map(c=>c.id));
  expect(await page.locator('.card-explanation').allTextContents()).toEqual(raw.cards.map(c=>c.explanation));
  await page.locator('#submit-order').click(); await expect(page.locator('.contractor-card')).toHaveCount(3);
  expect(await page.locator('.contractor-card').evaluateAll(nodes=>nodes.map(n=>n.dataset.contractorId))).toEqual(raw.cards.map(c=>c.id));
  await page.screenshot({path:'reports/ui-desktop-results.png',fullPage:true});
});

test('REAL backend: optional fields are null, one result, missing category, no match',async({page})=>{
  await open(page); await fill(page,{city:'Астана',category:'Флорист',duration_hours:'',language:''});
  const outgoing=page.waitForRequest(r=>r.url().endsWith('/recommend'));
  await page.locator('#submit-order').click();
  expect((await outgoing).postDataJSON()).toMatchObject({duration_hours:null,language:null});
  await expect(page.locator('.contractor-card')).toHaveCount(1); await expect(page.locator('#meta-explanation')).toBeVisible();
  await page.locator('#category').selectOption('Национальный ансамбль'); await page.locator('#submit-order').click();
  await expect(page.locator('#state-title')).toHaveText('Бұл қалада мұндай санат жоқ');
  await expect(page.locator('.contractor-card')).toHaveCount(0);
  await fill(page,{budget:'1'}); await page.locator('#submit-order').click();
  await expect(page.locator('#state-title')).toHaveText('Шарттарға сай мердігер табылмады');
  await expect(page.locator('#meta-explanation')).toContainText('заняты');
});

test('REAL backend: occupied venue excluded, available venue returned',async({page})=>{
  await open(page); await fill(page,{city:'Астана',category:'Банкетный зал',event_format:'свадьба',budget:'3000000',duration_hours:'6',language:''});
  await page.locator('#submit-order').click(); await expect(page.locator('#state-title')).toHaveText('Шарттарға сай мердігер табылмады');
  await page.locator('#date').fill('2026-11-15'); await page.locator('#submit-order').click();
  await expect(page.locator('.contractor-card')).toHaveAttribute('data-contractor-id','HK-90012');
});

test('REAL backend: find an actual 2-card query and display both',async({page,request})=>{
  const data=JSON.parse(await readFile('data/contractors.json','utf8'));
  let found;
  for(const budget of [700000,1000000,1200000]) {
    const query={...requestOrder,budget};
    const result=await decode(await request.post('/recommend',{data:query}));
    if(result.cards.length===2){found=query;break;}
  }
  expect(data.contractors.length).toBe(66); expect(found).toBeTruthy();
  await open(page); await fill(page,{budget:String(found.budget)}); await page.locator('#submit-order').click();
  await expect(page.locator('.contractor-card')).toHaveCount(2);
});

test('REAL UI: validation, labels, keyboard focus, Kazakh and three languages',async({page})=>{
  await open(page); await page.locator('#submit-order').click();
  await expect(page.locator('#city')).toBeFocused(); await expect(page.locator('#city')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#city-error')).toBeVisible();
  await fill(page,{budget:'-1',duration_hours:'1.5',date:'2027-01-01'}); await page.locator('#submit-order').click();
  for(const id of ['budget','duration_hours','date']) await expect(page.locator('#'+id+'-error')).toBeVisible();
  for(const [lang,title] of [['ru','Какое событие вы планируете?'],['en','What are you planning?'],['kk','Қандай іс-шара жоспарлап жүрсіз?']]) {
    await page.locator(`[data-language=${lang}]`).click(); await expect(page.locator('html')).toHaveAttribute('lang',lang); await expect(page.locator('#form-title')).toHaveText(title);
  }
  await page.locator('#city').focus(); await page.keyboard.press('Tab'); await expect(page.locator('#date')).toBeFocused();
  expect(await page.locator('#date').evaluate(n=>getComputedStyle(n).outlineStyle)).not.toBe('none');
});

for(const width of [320,390,768,1440]) test(`REAL backend: layout and accessibility at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900}); await open(page);
  await fill(page); await page.locator('#submit-order').click(); await expect(page.locator('.contractor-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const results=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({path:`reports/ui-${width}.png`,fullPage:true});
});

test('REAL server: responsive local images, static allowlist and no keys in assets',async({page,request})=>{
  await open(page);
  const hero=page.locator('.hero-visual img');
  await expect(hero).toHaveAttribute('fetchpriority','high'); await expect(hero).toHaveAttribute('loading','eager');
  expect(await hero.evaluate(n=>n.complete&&n.naturalWidth>0)).toBe(true);
  for(const size of [640,960,1536]) expect((await request.get(`/assets/hero-${size}.svg`)).status()).toBe(200);
  for(const path of ['/.env','/src/ai.js','/data/contractors.json','/data/ai-index.json']) expect((await request.get(path)).status()).toBe(404);
  expect((await request.get('/app.js')).headers()['content-security-policy']).toContain("script-src 'self'");
});

test('MOCK network failure: technical error, no fake cards, retry to real backend',async({page})=>{
  await open(page); await fill(page);
  await page.route('**/recommend',route=>route.abort('failed'));
  await page.locator('#submit-order').click(); await expect(page.locator('#state-title')).toHaveText('Сервиспен байланыс үзілді');
  await expect(page.locator('.contractor-card')).toHaveCount(0);
  await page.unroute('**/recommend'); await page.locator('#retry-order').click();
  await expect(page.locator('.contractor-card')).toHaveCount(3);
});

test('MOCK catalog outage: disabled form and explicit retry',async({page})=>{
  await page.route('**/catalog/options',route=>route.abort('failed')); await page.goto('/');
  await expect(page.locator('#reload-catalog')).toBeVisible(); await expect(page.locator('#city')).toBeDisabled();
  await page.unroute('**/catalog/options'); await page.locator('#reload-catalog').click(); await expect(page.locator('#city')).toBeEnabled();
});

test('MOCK delayed old response cannot replace a newer real result; loading visible',async({page})=>{
  await open(page); await fill(page);
  let signalStarted; const started=new Promise(resolve=>{signalStarted=resolve;});
  let release; const delay=new Promise(resolve=>{release=resolve;});
  let first=true;
  await page.route('**/recommend',async route=>{
    if(!first){await route.continue();return;}
    first=false; signalStarted(); await delay;
    await route.fulfill({status:200,contentType:'application/xml',body:'<response>{"status":"no_match","cards":[],"eligible_count":0,"meta_explanation":"OLD RESPONSE"}</response>'}).catch(()=>{});
  });
  await page.locator('#submit-order').click(); await started; await expect(page.locator('#results')).toHaveAttribute('aria-busy','true');
  await page.locator('#budget').fill('1200000'); await page.locator('#submit-order').click();
  await expect(page.locator('.contractor-card')).toHaveCount(3);
  release(); await expect(page.locator('#meta-explanation')).not.toContainText('OLD RESPONSE');
});

test('MOCK unsafe server text is text, not HTML, and long names wrap at 320px',async({page,request})=>{
  const raw=await decode(await request.post('/recommend',{data:requestOrder}));
  raw.cards[0].name='Ұлттықөнерменмәдениеттінасихаттайтынмердігер'.repeat(5);
  raw.cards[0].explanation='<img src=x onerror="window.injected=true">';
  await page.route('**/recommend',route=>route.fulfill({status:200,contentType:'application/xml',body:`<response>${JSON.stringify(raw).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')}</response>`}));
  await page.setViewportSize({width:320,height:900}); await open(page); await fill(page); await page.locator('#submit-order').click();
  await expect(page.locator('.contractor-card')).toHaveCount(3);
  await expect(page.locator('.card-explanation').first()).toHaveText(raw.cards[0].explanation);
  expect(await page.evaluate(()=>window.injected)).toBeUndefined();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
