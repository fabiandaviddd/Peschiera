import { createRequire } from 'node:module';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
/* Screenshots nur, wenn ein Zielordner uebergeben wird. */
const SHOT = process.argv[2] || null;
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

// --- Gerät A: Fabi -------------------------------------------------------
const ctxA = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true,
  permissions:['clipboard-read','clipboard-write']});
const A = await ctxA.newPage();
const errsA=[]; A.on('pageerror',e=>errsA.push(e.message));
await A.goto(URL,{waitUntil:'networkidle'}); await A.waitForSelector('#app:not([hidden])');
  await zuOrten(A);

// Teilen-Leiste nur im Gemerkt-Reiter
ok('Teilen-Leiste in "Orte" versteckt', await A.evaluate(()=>
  document.getElementById('sharebar').getBoundingClientRect().height===0));
await A.click('[data-tab="gemerkt"]'); await A.waitForTimeout(150);
ok('Teilen-Leiste in "Gemerkt" sichtbar', await A.evaluate(()=>
  document.getElementById('sharebar').getBoundingClientRect().height>0));
ok('Ohne Markierungen kein Teilen-Knopf', await A.evaluate(()=>
  document.getElementById('share-btn').getBoundingClientRect().height===0));
ok('Hinweis "Noch nichts markiert"', (await A.textContent('#sharebar-t')).includes('Noch nichts'));

// Fabi markiert etwas
await A.click('[data-tab="orte"]'); await A.waitForTimeout(150);
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Barcaccia'})}).first().locator('.star').click();
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Lido ai Pioppi'})}).first().locator('.star').click();
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Festung Peschiera'})}).first().locator('.seen').click();
await A.waitForTimeout(150);
await A.click('[data-tab="gemerkt"]'); await A.waitForTimeout(150);
/* Seit v33 nennt die Leiste beide Haelften: verplant und ohne Tag. Hier ist
   nichts verplant, also stehen beide gemerkten unter "ohne Tag". */
ok('Leiste nennt Plan-, Merk- und Gesehen-Zahl',
   /0 verplant.*2 ohne Tag.*1 gesehen/.test(await A.textContent('#sharebar-t')),
   await A.textContent('#sharebar-t'));
ok('Teilen-Knopf jetzt da', await A.evaluate(()=>
  document.getElementById('share-btn').getBoundingClientRect().height>0));

// Link erzeugen (ohne navigator.share -> Zwischenablage)
await A.evaluate(()=>{ try{ delete navigator.share; }catch(e){ navigator.share=undefined; } });
await A.click('#share-btn'); await A.waitForTimeout(400);
const link = await A.evaluate(()=>navigator.clipboard.readText());
ok('Link in der Zwischenablage', link.includes('#liste='), link.slice(0,70));
ok('Knopf bestätigt', (await A.textContent('#share-btn')).includes('kopiert'), await A.textContent('#share-btn'));
ok('Link bleibt handlich', link.length < 400, 'Länge '+link.length);

// --- Gerät B: Sonja ------------------------------------------------------
const ctxB = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const B = await ctxB.newPage();
const errsB=[]; B.on('pageerror',e=>errsB.push(e.message));
// Sonja hat schon eigene Markierungen
await B.goto(URL,{waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.locator('#list .card', {has: B.locator('.card__name',{hasText:'Braccobaldo'})}).first().locator('.star').click();
await B.waitForTimeout(120);
ok('Sonja hat 1 eigenen Eintrag', (await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')))).length===1);

// Sie öffnet Fabis Link
const linkB = link.replace(`${BASE}`, `${BASE}`);
await B.goto(linkB, {waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.waitForTimeout(300);
ok('Empfangs-Panel erscheint', await B.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height>0));
const inboxTxt = await B.textContent('#inbox-x');
ok('Panel nennt die Zahlen', inboxTxt.includes('2 gemerkte') && inboxTxt.includes('1 gesehene'), inboxTxt);
ok('Empfangs-Panel steht in einer Ansicht mit Liste',
   await B.evaluate(()=>{ const t=document.querySelector('[data-tab][aria-current], [data-tab][aria-selected="true"]');
     return !!t && ['orte','heute'].includes(t.dataset.tab); }),
   await B.evaluate(()=>document.querySelector('[data-tab][aria-current], [data-tab][aria-selected="true"]')?.dataset.tab));

// Zusammenführen
await B.click('#inbox-merge'); await B.waitForTimeout(300);
const savedB = await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')));
const seenB = await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.seen')));
ok('Zusammenführen behält eigenes + fremdes', savedB.length===3 && savedB.includes('braccobaldo'),
   JSON.stringify(savedB));
ok('Gesehenes übernommen', seenB.length===1 && seenB.includes('fortezza'), JSON.stringify(seenB));
ok('Panel verschwindet', await B.evaluate(()=>document.getElementById('inbox').getBoundingClientRect().height===0));
ok('Adresse bereinigt', !(await B.evaluate(()=>location.hash)).includes('liste'),
   await B.evaluate(()=>location.hash));
await B.click('[data-tab="gemerkt"]'); await B.waitForTimeout(150);
ok('Plan zeigt die 3 übernommenen', (await B.evaluate(()=>
   JSON.parse(localStorage.getItem('pk.saved')||'[]').length))===3);

// Neu laden darf nicht erneut fragen
await B.reload({waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.waitForTimeout(250);
ok('Nach Reload kein zweites Nachfragen', await B.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height===0));

// --- Ersetzen statt Zusammenführen ---------------------------------------
const ctxC = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const C = await ctxC.newPage();
await C.goto(URL,{waitUntil:'networkidle'}); await C.waitForSelector('#app:not([hidden])');
  await zuOrten(C);
await C.locator('#list .card').first().locator('.star').click(); await C.waitForTimeout(120);
await C.goto(link,{waitUntil:'networkidle'}); await C.waitForSelector('#app:not([hidden])');
  await zuOrten(C);
await C.waitForTimeout(250);
await C.click('#inbox-replace'); await C.waitForTimeout(250);
const savedC = await C.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')));
ok('Ersetzen wirft eigenes weg', savedC.length===2 && !savedC.includes('lido-ai-pioppi')===false,
   JSON.stringify(savedC));

// --- Verwerfen -----------------------------------------------------------
const ctxD = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const Dp = await ctxD.newPage();
await Dp.goto(link,{waitUntil:'networkidle'}); await Dp.waitForSelector('#app:not([hidden])');
  await zuOrten(Dp);
await Dp.waitForTimeout(250);
await Dp.click('#inbox-cancel'); await Dp.waitForTimeout(200);
ok('Verwerfen ändert nichts', (await Dp.evaluate(()=>localStorage.getItem('pk.saved'))) === null,
   String(await Dp.evaluate(()=>localStorage.getItem('pk.saved'))));

// --- Kaputter Link darf nicht stören -------------------------------------
const E = await ctxD.newPage();
const errsE=[]; E.on('pageerror',e=>errsE.push(e.message));
await E.goto(URL+'#liste=nonsense___',{waitUntil:'networkidle'});
await E.waitForSelector('#app:not([hidden])');
  await zuOrten(E);
/* Seit v24 kommt die Liste in Stuecken: erst 18 Karten, der Rest ueber
   requestAnimationFrame hinterher. Auf data-voll warten statt auf eine
   Wartezeit zu hoffen -- mit waitForTimeout haette diese Zusicherung je nach
   Tageslaune der Maschine mal 101 und mal 42 gesehen. */
await E.waitForSelector('#list[data-voll="1"]');
ok('Kaputter Link: App läuft normal', (await E.$$('#list .card')).length===101 && errsE.length===0,
   errsE.join(' | '));
ok('Kaputter Link: kein Panel', await E.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height===0));

ok('Keine JS-Fehler', errsA.length===0 && errsB.length===0, [...errsA,...errsB].join(' | '));

await B.click('[data-tab="gemerkt"]'); await B.waitForTimeout(200);
if (SHOT) await B.screenshot({ path: SHOT + '/share.png' });
await ctxD.newPage().then(async pg=>{ await pg.goto(link,{waitUntil:'networkidle'});
  await pg.waitForSelector('#app:not([hidden])');
  await zuOrten(pg); await pg.waitForTimeout(300);
  if (SHOT) await pg.screenshot({ path: SHOT + '/inbox.png' }); });

await browser.close();
report();
