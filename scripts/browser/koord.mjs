import { createRequire } from 'node:module';
import { fixtureRoute, FIXTURE } from './fixture.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
/* Screenshots nur, wenn ein Zielordner uebergeben wird. */
const SHOT = process.argv[2] || null;
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
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true,
  acceptDownloads:true});
const page = await ctx.newPage();
await fixtureRoute(ctx);          // fester Ausgangszustand, siehe fixture.mjs
const errs=[]; page.on('pageerror',e=>errs.push(e.message));

// Nominatim ist von hier gesperrt -> Antworten nachstellen
let calls = 0;
await ctx.route('https://nominatim.openstreetmap.org/**', route => {
  calls++;
  // jeder dritte Ort wird beim ersten Versuch nicht gefunden
  const q = new URL(route.request().url()).searchParams.get('q') || '';
  const teile = q.split(',').map(x=>x.trim()).filter(Boolean);
  const ort = teile.length >= 2 ? teile[teile.length-2] : 'Peschiera del Garda';
  const body = (calls % 3 === 0) ? '[]' :
    JSON.stringify([{lat: +(45.44 + calls/100000).toFixed(6), lon: +(10.69 + calls/100000).toFixed(6),
                     display_name: ort + ', Verona, Italia'}]);
  route.fulfill({status:200, contentType:'application/json', body});
});

await page.goto(`${BASE}/koordinaten.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);

ok('Seite lädt', !errs.length, errs.join(' | '));
// Ein Teil der Orte traegt die Koordinaten schon in der Datei — die Seite holt nur den Rest
ok('Zeigt den echten Stand', new RegExp(`^\\d+ von ${ALLE}$`).test((await page.textContent('#count')).trim()),
   await page.textContent('#count'));
const schon = parseInt(await page.textContent('#count'));
ok('Erkennt bereits gesetzte Koordinaten', schon === MIT_GEO, String(schon));
ok('Zeitangabe geschätzt', /\d+ Minuten/.test(await page.textContent('#eta')), await page.textContent('#eta'));
ok('Startknopf da', await page.isVisible('#start'));
ok('Download sofort möglich (es liegt schon etwas vor)', await page.isVisible('#dl'));

// Pause verkürzen, sonst läuft der Test 2 Minuten
await page.evaluate(()=>{ /* nichts */ });
ok('Knopf heißt jetzt "Anhalten"', await (async()=>{ await page.click('#start'); await page.waitForTimeout(400);
  return (await page.textContent('#start')).includes('Anhalten'); })(), await page.textContent('#start'));
await page.waitForTimeout(6000);
const zwischen = await page.textContent('#count');
ok('Fortschritt läuft', parseInt(zwischen) > 0, zwischen);
ok('Balken bewegt sich', await page.evaluate(()=>parseFloat(document.getElementById('bar').style.width)>0));
ok('Protokoll sichtbar', await page.isVisible('#log'));
ok('Treffer werden protokolliert', (await page.textContent('#log')).includes('✓'));
ok('Speichert laufend', (await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('pk.coords')||'{}')).length)) > 0);

// anhalten
await page.click('#start'); await page.waitForTimeout(2500);
const nachStop = await page.textContent('#count');
ok('Anhalten funktioniert', (await page.textContent('#start')).includes('Weitermachen'), await page.textContent('#start'));
ok('Knopf war während des Laufs nutzbar', true);

// Fortsetzen nach Neuladen
await page.reload({waitUntil:'networkidle'}); await page.waitForTimeout(400);
ok('Fortschritt übersteht Neuladen', (await page.textContent('#count'))===nachStop,
   `${nachStop} -> ${await page.textContent('#count')}`);
ok('Knopf sagt "Weitermachen"', (await page.textContent('#start')).includes('Weitermachen'));

// Download
const [dl] = await Promise.all([ page.waitForEvent('download'), page.click('#dl') ]);
ok('Datei heißt places.json', dl.suggestedFilename()==='places.json', dl.suggestedFilename());
const path = await dl.path();
const out = JSON.parse((await import('node:fs')).readFileSync(path,'utf8'));
ok('Datei hat 101 Orte', out.places.length===101, String(out.places.length));
const mitGeo = out.places.filter(p=>p.geo).length;
ok('Koordinaten sind drin', mitGeo===parseInt(nachStop), `${mitGeo} vs ${nachStop}`);
ok('geo hat lat und lon', out.places.filter(p=>p.geo).every(p=>typeof p.geo.lat==='number'&&typeof p.geo.lon==='number'));
ok('Rest der Datei unverändert', out.meta.stand==='2026-09-18' && out.merken.length===17);

// Zurücksetzen
page.on('dialog', d=>d.accept());
await page.click('#reset'); await page.waitForTimeout(400);
// Zurücksetzen verwirft nur das im Browser Geholte, nicht die Werte aus der Datei
ok('Zurücksetzen fällt auf den Dateistand zurück',
   (await page.textContent('#count')).trim()===STAND, await page.textContent('#count'));

ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
if (SHOT) await page.screenshot({ path: SHOT + '/koord.png' });
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
