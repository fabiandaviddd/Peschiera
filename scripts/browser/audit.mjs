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
const report=()=>{console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
  console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');};
process.on('uncaughtException', async e=>{report();console.log('\nABBRUCH: '+e.message.split('\n')[0]);
  try{await browser.close();}catch(_){} process.exit(1);});

const ctx = await browser.newContext({ viewport:{width:402,height:754}, deviceScaleFactor:3,hasTouch:true });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(URL,{waitUntil:'networkidle'});
await page.waitForSelector('#app:not([hidden])');
  await zuOrten(page);

const openSheet = async () => {
  await page.locator('#list .card__open').first().click();
  await page.waitForTimeout(400);
};
const isOpen = () => page.$eval('#sheet', e=>!e.hidden);

/* Kernfrage: ruft ein Tap mit Fingerwackler auf diesem Element preventDefault auf?
   Wenn ja, unterdrückt iOS Safari den Klick und das Element wirkt tot. */
const jitterTap = (sel) => page.evaluate((sel)=>{
  const el = document.querySelector(sel);
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const x = r.x + r.width/2, y = r.y + r.height/2;
  const t = (cy)=>new Touch({identifier:7,target:el,clientX:x,clientY:cy});
  const send = (type,cy,cancelable=true)=>{
    const ev = new TouchEvent(type,{bubbles:true,cancelable,
      touches:type==='touchend'?[]:[t(cy)],changedTouches:[t(cy)]});
    el.dispatchEvent(ev); return ev;
  };
  send('touchstart',y,false);
  const m1 = send('touchmove',y+8);
  const m2 = send('touchmove',y+16);
  send('touchend',y+16,false);
  const moved = document.getElementById('sheet').style.transform !== '';
  document.getElementById('sheet').style.transform = '';
  return { prevented: m1.defaultPrevented || m2.defaultPrevented, moved };
}, sel);

// --- Bedienelemente im Sheet: Tap darf nie als Wischen enden
await openSheet();
for (const [name, sel] of [
  ['✕ Schließen', '#sheet-close'],
  ['Merken-Knopf', '#sheet-body [data-save]'],
  ['Google-Maps-Link', '#sheet-body a[href*="google.com/maps"]'],
]) {
  const r = await jitterTap(sel);
  ok(`Tap auf ${name} wird nicht zum Wischen`, r.prevented===false && r.moved===false, JSON.stringify(r));
}
await page.keyboard.press('Escape'); await page.waitForTimeout(400);

// Eintrag mit Telefonnummer -> Anrufen-Knopf
await page.fill('#q','Barcaccia'); await page.waitForTimeout(100);
await openSheet();
const telR = await jitterTap('#sheet-body a[href^="tel:"]');
ok('Tap auf Anrufen wird nicht zum Wischen', telR.prevented===false && telR.moved===false, JSON.stringify(telR));

// --- ✕ schließt wirklich, per Maus und per Tap
await page.click('#sheet-close'); await page.waitForTimeout(400);
ok('✕ schließt (Klick)', !(await isOpen()));
await openSheet();
const cb = await page.$eval('#sheet-close', e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
await page.touchscreen.tap(cb.x, cb.y); await page.waitForTimeout(400);
ok('✕ schließt (Tap)', !(await isOpen()));

// --- Wischen muss weiter funktionieren
await openSheet();
const swipe = await page.evaluate(()=>{
  const sheet=document.getElementById('sheet');
  const grip=document.getElementById('grip');
  const r=grip.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
  const t=(cy)=>new Touch({identifier:9,target:grip,clientX:x,clientY:cy});
  const send=(type,cy,cancelable=true)=>{const ev=new TouchEvent(type,{bubbles:true,cancelable,
    touches:type==='touchend'?[]:[t(cy)],changedTouches:[t(cy)]}); grip.dispatchEvent(ev); return ev;};
  send('touchstart',y,false);
  const m=send('touchmove',y+40); send('touchmove',y+160); send('touchend',y+160,false);
  return { prevented:m.defaultPrevented };
});
await page.waitForTimeout(450);
ok('Wischen am Griff schließt weiterhin', !(await isOpen()) && swipe.prevented===true, JSON.stringify(swipe));

// Kurzes Wischen federt zurück
await openSheet();
await page.evaluate(()=>{
  const grip=document.getElementById('grip');
  const r=grip.getBoundingClientRect(); const x=r.x+r.width/2, y=r.y+r.height/2;
  const t=(cy)=>new Touch({identifier:11,target:grip,clientX:x,clientY:cy});
  const send=(type,cy,c=true)=>grip.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:c,
    touches:type==='touchend'?[]:[t(cy)],changedTouches:[t(cy)]}));
  send('touchstart',y,false); send('touchmove',y+40); send('touchend',y+40,false);
});
await page.waitForTimeout(450);
ok('Kurzes Wischen federt zurück', await isOpen());
ok('Transform nach Zurückfedern zurückgesetzt', await page.$eval('#sheet', e=>e.style.transform===''));
await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await page.fill('#q',''); await page.waitForTimeout(80);

// --- Hintergrund darf hinter dem Sheet nicht scrollen
await page.evaluate(()=>window.scrollTo(0,500));
await page.waitForTimeout(100);
const yBefore = await page.evaluate(()=>window.pageYOffset);
ok('Seite ist gescrollt', yBefore > 300, String(yBefore));
// Ohne Playwrights Autoscrollen öffnen, sonst springt die Seite vorher auf 0
await page.evaluate(()=>{
  const c=[...document.querySelectorAll('#list .card__open')]
    .find(e=>{const r=e.getBoundingClientRect(); return r.top>60 && r.bottom<700;});
  c.click();
});
await page.waitForTimeout(400);
await page.evaluate(()=>window.scrollTo(0,0));
await page.waitForTimeout(100);
const locked = await page.evaluate(()=>({
  fixed: getComputedStyle(document.body).position === 'fixed',
  top: document.body.style.top
}));
ok('Hintergrund festgehalten', locked.fixed && locked.top === `-${yBefore}px`, JSON.stringify(locked));
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
const yAfter = await page.evaluate(()=>window.pageYOffset);
ok('Scrollposition nach Schließen wiederhergestellt', Math.abs(yAfter - yBefore) <= 2, `${yBefore} -> ${yAfter}`);
ok('body wieder normal', await page.evaluate(()=>getComputedStyle(document.body).position === 'static'
   && document.body.style.top === '' && document.body.style.paddingRight === ''));

// --- Kein Layout-Shift beim Öffnen (Regression)
await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(100);
const g = async () => page.evaluate(()=>{
  const c=document.querySelector('#list .card').getBoundingClientRect();
  return { x:Math.round(c.x), w:Math.round(c.width), bw:document.body.clientWidth };
});
const b1 = await g();
await page.locator('#list .card__open').first().click(); await page.waitForTimeout(400);
const b2 = await g();
ok('Kein Layout-Shift beim Öffnen', JSON.stringify(b1)===JSON.stringify(b2), JSON.stringify([b1,b2]));
await page.keyboard.press('Escape'); await page.waitForTimeout(450);

// --- Fokus kehrt zurück
await page.locator('#list .card__open').first().click(); await page.waitForTimeout(400);
await page.click('#sheet-close'); await page.waitForTimeout(450);
ok('Fokus zurück auf der Karte', await page.evaluate(()=>
  document.activeElement && document.activeElement.hasAttribute('data-open')));

// --- Merken und Entmerken im Sheet: der Zustand folgt, nichts bleibt gesperrt.
// Lief bis v13 ueber die Merkliste; die heisst jetzt "Plan" und stellt ihre
// Eintraege anders dar. Geprueft wird derselbe Code-Pfad von der Liste aus.
await page.evaluate(()=>document.querySelector('#list .card [data-save]').click());
await page.waitForTimeout(150);
const gemerkt1 = await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')||'[]').length);
await page.evaluate(()=>document.querySelector('#list .card [data-open]').click());
await page.waitForTimeout(450);
ok('Sheet über der gemerkten Karte offen', !(await page.$eval('#sheet', e=>e.hidden)));
await page.click('#sheet-body [data-save]'); await page.waitForTimeout(400);
ok('Entmerken im Sheet wirkt sofort', await page.evaluate(()=>
   JSON.parse(localStorage.getItem('pk.saved')||'[]').length) === gemerkt1 - 1);
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
ok('body nach diesem Weg entsperrt', await page.evaluate(()=>getComputedStyle(document.body).position==='static'),
   await page.evaluate(()=>getComputedStyle(document.body).position));
await page.evaluate(()=>document.querySelector('[data-tab="orte"]').click());
await page.waitForTimeout(350);

// --- Tab-Wechsel bei offenem Sheet
await page.locator('#list .card__open').first().click(); await page.waitForTimeout(400);
await page.keyboard.press('Escape'); await page.waitForTimeout(450);
ok('Nach Escape kein Sperrzustand übrig', await page.evaluate(()=>
  !document.body.classList.contains('is-locked')));

// --- Schnelles Auf/Zu darf nichts hängen lassen
for (let i=0;i<3;i++){
  await page.locator('#list .card__open').first().click(); await page.waitForTimeout(60);
  await page.keyboard.press('Escape'); await page.waitForTimeout(60);
}
await page.waitForTimeout(500);
ok('Schnelles Auf/Zu hinterlässt keinen Sperrzustand', await page.evaluate(()=>
  getComputedStyle(document.body).position==='static' && document.getElementById('sheet').hidden));

ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
await browser.close();
report();
