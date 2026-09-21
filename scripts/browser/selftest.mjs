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
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/selbsttest.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);

ok('Seite lädt ohne JS-Fehler', errs.length===0, errs.join(' | '));
const out0 = await page.inputValue('#out');
ok('Bericht wird befüllt', out0.includes('Peschiera kompakt') && out0.includes('Gerät'), String(out0.length));
ok('Zeigt "noch nicht getippt"', (await page.textContent('#tap-res')).includes('noch nicht'));

// Tap mit echtem Touch simulieren
const b = await page.$eval('#tap-x', e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x,y:b.y}]});
await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x,y:b.y+9}]});
await page.waitForTimeout(20);
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(600);
const tapRes = await page.textContent('#tap-res');
ok('Tap wird gemessen', !tapRes.includes('noch nicht'), tapRes);

// Wischen
const s = await page.$eval('#swipe-zone', e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+10};});
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:s.x,y:s.y}]});
for (let i=1;i<=6;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:s.x,y:s.y+i*20}]}); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(300);
const swRes = await page.textContent('#swipe-res');
ok('Wischen wird gemessen', /\d+ px in \d+ ms/.test(swRes), swRes);
ok('Wischen über 80 px erkannt', swRes.startsWith('✓'), swRes);

const out = await page.inputValue('#out');
for (const key of ['Fingerwackler beim Tippen','Klick kam trotzdem an','Wischen:','UA:','100dvh ergibt',
                   'Safe Area','Vom Homescreen gestartet','Service Worker:','localStorage:','Schriften:','CSS color-mix']) {
  ok('Bericht enthält "'+key+'"', out.includes(key));
}
ok('Bericht ist kopierbar lang, aber nicht riesig', out.length>700 && out.length<4000, String(out.length));
ok('Zurück-Link zur App', await page.getAttribute('a.btn[href]','href') === './index.html');

if (SHOT) await page.screenshot({ path: SHOT + '/selbsttest.png' });
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
console.log('\n----- Beispielbericht -----\n'+out);
