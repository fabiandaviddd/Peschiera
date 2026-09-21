import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = ohneStartkarten(await chromium.launch());

// --- v14: Startansicht ist "Heute", die Ortsliste liegt unter "Orte" ---
const zuOrten = async (p) => {
  await p.evaluate(()=>{ const t=document.querySelector('[data-tab="orte"]'); if(t) t.click(); });
  await p.waitForTimeout(350);
};
const page = await (await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true})).newPage();
await page.goto(`${BASE}/index.html`,{waitUntil:'networkidle'});
await page.waitForSelector('#app:not([hidden])');
  await zuOrten(page);

// touch-action auf Bedienelementen
const ta = await page.evaluate(()=>{
  const sel = ['.card__open','.star','.chip','.tab','.btn','#theme-btn','#q'];
  return sel.map(s=>{const e=document.querySelector(s);
    return s+'='+(e?getComputedStyle(e).touchAction:'fehlt');});
});
ok('Bedienelemente mit touch-action: manipulation',
   ta.filter(x=>x.endsWith('=manipulation')).length >= 6, ta.join(' '));
ok('Sheet behält touch-action: none', await page.evaluate(()=>
   getComputedStyle(document.getElementById('sheet')).touchAction==='none'));
ok('Sheet-Inhalt behält pan-y', await page.evaluate(()=>
   getComputedStyle(document.getElementById('sheet-body')).touchAction==='pan-y'));
ok('Karte ohne Textauswahl beim Langdrücken', await page.evaluate(()=>{
   const cs=getComputedStyle(document.querySelector('.card__open'));
   return cs.userSelect==='none'||cs.webkitUserSelect==='none';}));

// Tastatur-Zustand
const tabsY = () => page.evaluate(()=>document.querySelector('.tabs').getBoundingClientRect().top);
const before = await tabsY();
await page.focus('#q'); await page.waitForTimeout(260);
const during = await tabsY();
ok('Tableiste fährt bei Tastatur weg', during > before + 40, `${Math.round(before)} -> ${Math.round(during)}`);
ok('body markiert Tippen', await page.evaluate(()=>document.body.classList.contains('is-typing')));
await page.evaluate(()=>document.getElementById('q').blur()); await page.waitForTimeout(260);
ok('Tableiste kommt zurück', Math.abs((await tabsY())-before) < 2, `${Math.round(await tabsY())}`);

// Suche muss weiter funktionieren, während getippt wird
await page.focus('#q');
await page.fill('#q','fisch'); await page.waitForTimeout(80);
ok('Suche funktioniert mit weggefahrener Leiste', (await page.$$('#list .card')).length >= 5);
ok('Löschen-✕ sichtbar bei Eingabe', await page.evaluate(()=>
   document.getElementById('q-clear').getBoundingClientRect().height>0));
await page.fill('#q',''); await page.evaluate(()=>document.getElementById('q').blur());
await page.waitForTimeout(200);

await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
