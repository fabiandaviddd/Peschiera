import { createRequire } from 'node:module';
import { fixtureRoute, FIXTURE } from './fixture.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
/* Zahlen, die sich aus places.json ergeben, gehoeren aus places.json gelesen.
   Hier standen 78, 81, 23 und 101 fest eingetippt. PR #10 hat sechs geerbte
   Ortsmittelpunkte geleert -- danach standen die Zusicherungen still auf dem
   alten Stand und meldeten fuenf Fehlschlaege, von denen keiner ein Fehler
   der Seite war. */
/* Nicht mehr aus data/places.json: die Suite prueft die Koordinatensuche,
   nicht den Arbeitsstand der Daten. Siehe fixture.mjs. */
const DATEN = FIXTURE.daten;
const ALLE = FIXTURE.alle;
const MIT_GEO = FIXTURE.mitGeo;
const OHNE_GEO = FIXTURE.ohneGeo;
const STAND = FIXTURE.stand;
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:402,height:754},hasTouch:true,acceptDownloads:true});
const page = await ctx.newPage();
await fixtureRoute(ctx);          // fester Ausgangszustand, siehe fixture.mjs
const errs=[]; page.on('pageerror',e=>errs.push(e.message));

// Realistische Antworten: der Dienst nennt bei Ortsteilen nur die Gemeinde
const ANTWORT = {
  'Colà di Lazise':               'Colà, Lazise, Verona, Veneto, Italia',
  'San Martino della Battaglia':  'San Martino della Battaglia, Desenzano del Garda, Brescia, Italia',
  'San Benedetto di Lugana':      'San Benedetto, Peschiera del Garda, Verona, Italia',
  'Manerba del Garda':            'Manerba del Garda, Brescia, Lombardia, Italia',
  'Lazise':                       'Peschiera del Garda, Verona, Italia',   // falscher Treffer wie im echten Lauf
  'Ponti sul Mincio':             'Peschiera del Garda, Verona, Italia',   // ebenso
};
await ctx.route('https://nominatim.openstreetmap.org/**', route => {
  const q = new URL(route.request().url()).searchParams.get('q') || '';
  let dn = null;
  for (const k in ANTWORT) if (q.includes(k)) { dn = ANTWORT[k]; break; }
  if (!dn) {
    const teile = q.split(',').map(x=>x.trim()).filter(Boolean);
    dn = (teile.length>=2 ? teile[teile.length-2] : 'Peschiera del Garda') + ', Verona, Italia';
  }
  route.fulfill({status:200, contentType:'application/json',
    body: JSON.stringify([{lat:45.4450, lon:10.6980, display_name:dn}])});
});

await page.goto(`${BASE}/koordinaten.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(500);
ok(`Stand ${STAND}`, (await page.textContent('#count')).trim()===STAND, await page.textContent('#count'));

await page.click('#start');
for (let i=0;i<150;i++){ await page.waitForTimeout(1000);
  if ((await page.textContent('#log')).includes('fertig —')) break; }
await page.waitForTimeout(500);
const log = await page.textContent('#log');

ok('Zeigt an, womit gestartet wird', new RegExp(`Starte mit ${OHNE_GEO} Orten`).test(log));
ok('Ortsteil Colà di Lazise wird akzeptiert', /✓.*Villa dei Cedri|Villa dei Cedri(?!.*—)/.test(log)
   && !/Villa dei Cedri — liegt nicht/.test(log),
   (log.match(/[^✓✗]*Villa dei Cedri[^✓✗]*/)||['fehlt'])[0]);
ok('Ortsteil San Martino wird akzeptiert', !/Selva Capuzza — liegt nicht/.test(log),
   (log.match(/[^✓✗]*Selva Capuzza[^✓✗]*/)||['fehlt'])[0]);
ok('Ortsteil San Benedetto wird akzeptiert', !/Ottella — liegt nicht/.test(log),
   (log.match(/[^✓✗]*Ottella[^✓✗]*/)||['fehlt'])[0]);
ok('Falscher Treffer bleibt abgelehnt (Oreste)', /Oreste — liegt nicht in Lazise/.test(log),
   (log.match(/[^✓✗]*Oreste[^✓✗]*/)||['fehlt'])[0]);
ok('Falscher Treffer bleibt abgelehnt (Ardietti)', /Ardietti[^✓✗]*liegt nicht in Ponti sul Mincio/.test(log),
   (log.match(/[^✓✗]*Ardietti[^✓✗]*/)||['fehlt'])[0]);
const treffer = (log.match(/✓/g)||[]).length;
ok('Deutlich mehr Treffer als vorher', treffer >= 15, String(treffer)+' Treffer');

// Zweiter Lauf nach Regeländerung muss Fehlschläge erneut versuchen
const gespeichert = await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.coords')));
ok('Regelstand wird mitgespeichert', gespeichert.regeln === 3, String(gespeichert.regeln));
await page.evaluate(()=>{ const r=JSON.parse(localStorage.getItem('pk.coords'));
  r.regeln = 1; localStorage.setItem('pk.coords', JSON.stringify(r)); });
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(600);
ok('Alte Fehlschläge werden nach Regeländerung neu versucht',
   (await page.textContent('#sub')).includes('offen'), await page.textContent('#sub'));

ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
