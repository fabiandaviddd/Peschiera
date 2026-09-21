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
// Genau sein Gerät: iPhone 16, 402x754
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true,
  userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1'});
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
/* ?v=orte, nicht die Startansicht: seit v35 steht das Suchfeld nur noch
   dort, wo gesucht wird. In "Jetzt" kostete es oben rund 60 px, und dort
   steht jetzt der Tagesplan. */
await page.goto(`${BASE}/index.html?v=orte`,{waitUntil:'networkidle'});
await page.waitForSelector('#app:not([hidden])');
await page.fill('#q','Sirmione'); await page.waitForTimeout(120);
await page.evaluate(()=>{
  const c=[...document.querySelectorAll('#list .card')]
    .find(x=>x.querySelector('.card__name').textContent.trim()==='Sirmione');
  (c||document.querySelector('#list .card')).querySelector('.card__open').click();
});
await page.waitForTimeout(450);

const g = await page.evaluate(()=>{
  const r = s => { const e=document.querySelector(s); const b=e.getBoundingClientRect();
    return {top:b.top, bottom:b.bottom, left:b.left, right:b.right, w:b.width, h:b.height}; };
  return { close:r('#sheet-close'), grip:r('#grip'), body:r('#sheet-body'), sheet:r('#sheet') };
});
ok('✕ misst 44×44', Math.round(g.close.w)===44 && Math.round(g.close.h)===44,
   `${Math.round(g.close.w)}x${Math.round(g.close.h)}`);
const overlaps = !(g.close.right <= g.grip.left || g.close.left >= g.grip.right ||
                   g.close.bottom <= g.grip.top || g.close.top >= g.grip.bottom);
ok('✕ und Griff überschneiden sich nicht', !overlaps,
   `✕ ${g.close.left.toFixed(0)}–${g.close.right.toFixed(0)}, Griff ${g.grip.left.toFixed(0)}–${g.grip.right.toFixed(0)}`);
ok('Griff nur noch in der Mitte', g.grip.left > g.sheet.left + 100 && g.grip.right < g.sheet.right - 100,
   `Griff ${g.grip.left.toFixed(0)}–${g.grip.right.toFixed(0)}, Sheet ${g.sheet.left.toFixed(0)}–${g.sheet.right.toFixed(0)}`);

// Trefferprüfung über die ganze Fläche des ✕
const hits = await page.evaluate(()=>{
  const e = document.getElementById('sheet-close');
  const b = e.getBoundingClientRect();
  const out = [];
  for (const fx of [0.15,0.5,0.85]) for (const fy of [0.15,0.5,0.85]) {
    const el = document.elementFromPoint(b.left+b.width*fx, b.top+b.height*fy);
    out.push(e.contains(el) || el===e);
  }
  return out;
});
ok('Alle 9 Punkte des ✕ treffen den Knopf', hits.every(Boolean), hits.map(h=>h?'✓':'✗').join(''));

// Kein -webkit-overflow-scrolling mehr, dafür eigene Ebene sauber geordnet
ok('Inhalt scrollt weiterhin', await page.evaluate(()=>{
  const b=document.getElementById('sheet-body');
  return getComputedStyle(b).overflowY==='auto' && b.scrollHeight>b.clientHeight; }));
ok('✕ liegt über dem Inhalt', await page.evaluate(()=>
  parseInt(getComputedStyle(document.getElementById('sheet-close')).zIndex,10) >
  parseInt(getComputedStyle(document.getElementById('sheet-body')).zIndex,10)));

// Auch nach dem Scrollen im Sheet bleibt das ✕ treffbar
await page.evaluate(()=>{ document.getElementById('sheet-body').scrollTop = 220; });
await page.waitForTimeout(150);
ok('✕ auch nach Scrollen treffbar', await page.evaluate(()=>{
  const e=document.getElementById('sheet-close'); const b=e.getBoundingClientRect();
  const el=document.elementFromPoint(b.left+b.width/2, b.top+b.height/2);
  return e.contains(el)||el===e; }));
await page.click('#sheet-close'); await page.waitForTimeout(450);
ok('✕ schließt nach Scrollen', await page.$eval('#sheet', e=>e.hidden));

ok('Version im Fuß', /App v\d+/.test(await page.textContent('#foot-offline')),
   await page.textContent('#foot-offline'));
ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));

await page.locator('#list .card__open').first().click(); await page.waitForTimeout(450);
if (SHOT) await page.screenshot({ path: SHOT + '/close-fix.png' });
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
