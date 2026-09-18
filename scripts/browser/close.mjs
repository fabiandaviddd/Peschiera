import { createRequire } from 'node:module';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const URL=`${BASE}/index.html`;
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = await chromium.launch();

// --- v14: Startansicht ist "Heute", die Ortsliste liegt unter "Orte" ---
const zuOrten = async (p) => {
  await p.evaluate(()=>{ const t=document.querySelector('[data-tab="orte"]'); if(t) t.click(); });
  await p.waitForTimeout(350);
};
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForSelector('#app:not([hidden])');
  await zuOrten(page);

const open = async () => { await page.locator('#list .card__open').first().click(); await page.waitForTimeout(400); };
const shut = () => page.$eval('#sheet', e=>e.hidden);
const boxOf = (sel) => page.$eval(sel, e=>{const r=e.getBoundingClientRect();
  return {x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height, top:r.top};});

ok('Version im Fuß sichtbar', /App v\d+/.test(await page.textContent('#foot-offline')),
   await page.textContent('#foot-offline'));

// 1) Maus
await open(); await page.click('#sheet-close'); await page.waitForTimeout(450);
ok('✕ per Maus', await shut());

// 2) Sauberer Tap
await open();
let b = await boxOf('#sheet-close');
await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(450);
ok('✕ per sauberem Tap', await shut());

// 3) Tap mit Wackler — der Fall, der auf iOS versagte
for (const jitter of [6, 12, 20, 30]) {
  await open();
  b = await boxOf('#sheet-close');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x,y:b.y-8}]});
  for (let i=1;i<=3;i++){
    await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x,y:b.y-8+jitter*i/3}]});
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(450);
  ok(`✕ mit ${String(jitter).padStart(2)} px Bewegung`, await shut());
  if (!(await shut())) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
}

// 4) Auch wenn der Browser gar keinen Klick liefert
await open();
b = await boxOf('#sheet-close');
await page.evaluate(({x,y})=>{
  const el = document.getElementById('sheet-close');
  const t = (cy)=>new Touch({identifier:3,target:el,clientX:x,clientY:cy});
  const send=(type,cy,c)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:c,
    touches:type==='touchend'?[]:[t(cy)],changedTouches:[t(cy)]}));
  send('touchstart',y,false); send('touchmove',y+9,true); send('touchend',y+9,false);
  // bewusst KEIN click — genau das macht Safari nach einer abgefangenen Geste
}, b);
await page.waitForTimeout(450);
ok('✕ schließt auch ohne Klick-Ereignis', await shut());

// 5) Finger rutscht vom ✕ weg -> darf nicht auslösen
await open();
b = await boxOf('#sheet-close');
await page.evaluate(({x,y})=>{
  const el = document.getElementById('sheet-close');
  const t = (cx,cy)=>new Touch({identifier:4,target:el,clientX:cx,clientY:cy});
  const send=(type,cx,cy,c)=>el.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:c,
    touches:type==='touchend'?[]:[t(cx,cy)],changedTouches:[t(cx,cy)]}));
  send('touchstart',x,y,false); send('touchend',x-160,y+200,false);
}, b);
await page.waitForTimeout(400);
ok('Weggerutschter Finger löst nicht aus', !(await shut()));

// 6) Kein Doppelauslösen
await page.evaluate(()=>{ window.__closes=0;
  const s=document.getElementById('sheet');
  new MutationObserver(()=>{ if(s.hidden) window.__closes++; }).observe(s,{attributes:true,attributeFilter:['hidden']});
});
b = await boxOf('#sheet-close');
await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(500);
ok('Genau einmal geschlossen', (await page.evaluate(()=>window.__closes)) === 1,
   String(await page.evaluate(()=>window.__closes)));

// 7) Hintergrund ebenso
await open();
await page.touchscreen.tap(20, 60); await page.waitForTimeout(450);
ok('Hintergrund-Tap schließt', await shut());

// 8) Wischen weiter möglich
await open();
const g = await boxOf('#grip');
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:g.x,y:g.y}]});
for (let i=1;i<=6;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:g.x,y:g.y+i*30}]}); await page.waitForTimeout(16); }
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(450);
ok('Wischen schließt weiterhin', await shut());

// Schliessen und sofort wieder oeffnen: der nachlaufende Timer darf das
// neue Sheet nicht mitnehmen (Regression aus dem Zurueck-Gesten-Umbau).
await open();
await page.click('#sheet-close');
await page.waitForTimeout(80);
await page.evaluate(()=>document.querySelectorAll('[data-open]')[3].click());
await page.waitForTimeout(600);
ok('Sofort neu geöffnetes Sheet bleibt offen', !(await shut()));
await page.keyboard.press('Escape'); await page.waitForTimeout(450);

// Zurueck-Geste schliesst weiterhin
await open();
await page.goBack(); await page.waitForTimeout(600);
ok('Zurück-Geste schließt das Sheet', await shut());

ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
