import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
/* Screenshots nur, wenn ein Zielordner uebergeben wird. */
const SHOT = process.argv[2] || null;
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = ohneStartkarten(await chromium.launch());

// --- v14: Startansicht ist "Heute", die Ortsliste liegt unter "Orte" ---
// --- v15: die Filter-Chips liegen im Filter-Sheet hinter #chip-filter ---
const chipMit = (p, txt) => p.evaluate(t=>{
  const c=[...document.querySelectorAll('#sheet .chip')].find(x=>x.textContent.includes(t));
  return c ? { da:true, text:c.textContent.replace(/\s+/g,' ').trim(), gedrueckt:c.getAttribute('aria-pressed') } : { da:false };
}, txt);

const chipKlick = (p, txt) => p.evaluate(t=>{
  const c=[...document.querySelectorAll('#sheet .chip')].find(x=>x.textContent.includes(t));
  if(c) c.click(); return !!c;
}, txt);

const imFilter = async (p, tun) => {
  await p.evaluate(()=>document.getElementById('chip-filter').click());
  await p.waitForTimeout(400);
  const r = await tun();
  await p.evaluate(()=>{ const b=document.getElementById('sheet-close'); if(b) b.click(); });
  await p.waitForTimeout(420);
  return r;
};

const zuOrten = async (p) => {
  await p.evaluate(()=>{ const t=document.querySelector('[data-tab="orte"]'); if(t) t.click(); });
  await p.waitForTimeout(350);
};
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`${BASE}/index.html`,{waitUntil:'networkidle'});
await page.waitForSelector('#app:not([hidden])');
  await zuOrten(page);
const cards = () => page.$$('#list .card');

ok('Chip "Noch nicht gesehen" im Filter',
   (await imFilter(page, ()=>chipMit(page,'Noch nicht gesehen'))).da);

// Auf der Karte als gesehen markieren
const first = page.locator('#list .card').first();
await first.locator('.seen').click(); await page.waitForTimeout(120);
ok('Karte als gesehen markiert', await first.evaluate(e=>e.classList.contains('card--seen')));
ok('Marke "gesehen" sichtbar', await first.locator('.card__seen').count() === 1);
ok('Zähler zeigt "1 gesehen"', (await page.textContent('#count')).includes('1 gesehen'),
   await page.textContent('#count'));

ok('localStorage pk.seen gesetzt', (await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.seen')))).length===1);

// Gesehen ist unabhängig vom Merken
ok('Stern unberührt', await first.locator('.star').getAttribute('aria-pressed') === 'false');
await first.locator('.star').click(); await page.waitForTimeout(100);
ok('Beides gleichzeitig möglich',
   await first.locator('.star').getAttribute('aria-pressed')==='true' &&
   await first.locator('.seen').getAttribute('aria-pressed')==='true');

// Filter
await imFilter(page, ()=>chipKlick(page,'Noch nicht gesehen'));
await page.waitForTimeout(250);
ok('Filter "Noch nicht gesehen" blendet aus', (await cards()).length === 100, String((await cards()).length));
await imFilter(page, ()=>chipKlick(page,'Noch nicht gesehen'));
await page.waitForTimeout(250);
ok('Filter aus -> 101', (await cards()).length === 101);

// Im Sheet umschalten
await page.locator('#list .card__open').first().click(); await page.waitForTimeout(400);
const sheetTxt = await page.$eval('#sheet', e=>e.innerText);
ok('Sheet hat einen Gesehen-Schalter', (await page.$$('#sheet [data-seen]')).length === 1);
ok('Schalter zeigt den Zustand an',
   await page.getAttribute('#sheet [data-seen]','aria-pressed') === 'true',
   await page.getAttribute('#sheet [data-seen]','aria-pressed'));
await page.click('#sheet-body [data-seen]'); await page.waitForTimeout(150);
ok('Sheet-Knopf nimmt zurück', (await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.seen')))).length===0);
ok('Schalter folgt dem Zustand',
   await page.getAttribute('#sheet [data-seen]','aria-pressed') === 'false',
   await page.getAttribute('#sheet [data-seen]','aria-pressed'));
await page.click('#sheet-body [data-seen]'); await page.waitForTimeout(150);
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
ok('Karte nach Sheet wieder markiert', await page.locator('#list .card').first().evaluate(e=>e.classList.contains('card--seen')));

// Reload
await page.reload({waitUntil:'networkidle'}); await page.waitForSelector('#app:not([hidden])');
  await zuOrten(page);
ok('Gesehen übersteht Reload', await page.locator('#list .card').first().evaluate(e=>e.classList.contains('card--seen'))
   && (await page.textContent('#count')).includes('1 gesehen'));

// Tippen auf den Haken darf das Sheet nicht öffnen
await page.locator('#list .card').nth(1).locator('.seen').click(); await page.waitForTimeout(300);
ok('Haken öffnet kein Sheet', await page.$eval('#sheet', e=>e.hidden));
ok('Touch-Ziele der Marken ≥44px', await page.evaluate(()=>
  [...document.querySelectorAll('.star,.seen')].every(e=>{
    const r=e.getBoundingClientRect(); return r.width>=44 && r.height>=44; })));
ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));

if (SHOT) await page.screenshot({ path: SHOT + '/seen.png' });
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
