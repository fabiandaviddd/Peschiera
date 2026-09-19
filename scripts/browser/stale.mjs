import { createRequire } from 'node:module';
import { fixtureRoute, FIXTURE } from './fixture.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:402,height:754},hasTouch:true,acceptDownloads:true});
const page = await ctx.newPage();
await fixtureRoute(ctx);          // fester Ausgangszustand, siehe fixture.mjs
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await ctx.route('https://nominatim.openstreetmap.org/**', r =>
  r.fulfill({status:200, contentType:'application/json', body:'[]'}));

/* Die Faelle kommen aus den Daten, nicht aus der Tastatur. Vorher standen hier
   saligusta, oreste und ponti-sul-mincio fest eingetippt -- als saligusta eine
   Koordinate bekam, griff bei ihm der Zweig "steht schon in der Datei" statt der
   Entfernungsregel, raus blieb leer und die Protokoll-Pruefung fiel um. Der Test
   prueft aber die Regel, nicht diesen einen Ort. */
const DATEN = FIXTURE.daten;
const BASEGEO = FIXTURE.base;
const GRAD_KM = 111.2;                       // ein Grad Breite, unabhaengig von jeder Bibliothek
const grenze = (p) => p.distance_km * 1.15 + 0.5;
const nordVon = (kmWeit) => ({ lat: Number((BASEGEO.lat + kmWeit / GRAD_KM).toFixed(6)),
                               lon: BASEGEO.lon });

const offen = DATEN.places.filter((p) => !p.geo && typeof p.distance_km === 'number' && p.distance_km > 0);
if (offen.length < 2) { console.error('stale: zu wenige Orte ohne Koordinate fuer diesen Test'); process.exit(1); }
const WEIT = offen[0];                       // wird von der Entfernungsregel verworfen
const NAH  = offen[1];                       // bleibt erhalten
const DRIN = DATEN.places.find((p) => p.geo); // steht schon in der Datei

const P_WEIT = nordVon(grenze(WEIT) + 3);    // sicher jenseits der Grenze
const P_NAH  = nordVon(grenze(NAH) * 0.3);   // sicher innerhalb
const P_DRIN = nordVon(0.4);

// Zustand eines früheren Laufs nachstellen: alte Fassung {id: geo}
await page.goto(`${BASE}/koordinaten.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(600);   // erst fertig laden lassen, sonst überschreibt die Seite den Speicher
await page.evaluate(([w,n,d])=>{
  localStorage.setItem('pk.coords', JSON.stringify({
    [w.id]: w.geo, [n.id]: n.geo, [d.id]: d.geo
  }));
}, [{id:WEIT.id,geo:P_WEIT},{id:NAH.id,geo:P_NAH},{id:DRIN.id,geo:P_DRIN}]);
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(600);

ok('Versionsmarke sichtbar', (await page.textContent('.k__lead')).includes('18.09.2026'));
const nach = await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.coords')).found||{});
ok(`${WEIT.name} aussortiert (Entfernungsregel)`, !nach[WEIT.id], JSON.stringify(nach[WEIT.id]||'weg'));
ok(`${DRIN.name} verworfen (steht schon in der Datei)`, !nach[DRIN.id], JSON.stringify(nach[DRIN.id]||'weg'));
ok(`${NAH.name} bleibt erhalten`, !!nach[NAH.id], JSON.stringify(nach[NAH.id]||'weg'));
ok('Protokoll nennt die Verwerfung', (await page.textContent('#log')).includes('früheren Lauf')
   || (await page.textContent('#log')).includes('frueheren Lauf'), await page.textContent('#log'));

const [dl] = await Promise.all([ page.waitForEvent('download'), page.click('#dl') ]);
const out = JSON.parse((await import('node:fs')).readFileSync(await dl.path(),'utf8'));
const weit = out.places.find(p=>p.id===WEIT.id);
ok('Falscher Punkt landet nicht in der Datei', !weit.geo || weit.geo.lat!==P_WEIT.lat,
   JSON.stringify(weit.geo));
const nahRaus = out.places.find(p=>p.id===NAH.id).geo;
ok('Gültiger Nachtrag landet in der Datei', nahRaus && nahRaus.lat===P_NAH.lat, JSON.stringify(nahRaus));
ok('Vorhandene Werte unverändert', out.places.find(p=>p.id===DRIN.id).geo.lat!==P_DRIN.lat);
ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
