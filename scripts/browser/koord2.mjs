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
const ctx = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,
  hasTouch:true, acceptDownloads:true});
const page = await ctx.newPage();
await fixtureRoute(ctx);          // fester Ausgangszustand, siehe fixture.mjs
const errs=[]; page.on('pageerror',e=>errs.push(e.message));

// Die echten Fehlerfälle von Lauf 1 nachstellen
const FAKE = {
  // oreste: Adresse sagt Lazise, Dienst liefert etwas in Peschiera -> muss abgelehnt werden
  'Fontana': [{lat:45.461968, lon:10.719596, display_name:'Via Fontana, Peschiera del Garda, Verona, Italia'}],
  // ponti-sul-mincio: Dienst liefert etwas in Peschiera statt Ponti sul Mincio
  'Ponti':   [{lat:45.412515, lon:10.687221, display_name:'Peschiera del Garda, Verona, Italia'}],
  // saligusta: Adresse stimmt, aber Punkt liegt 2,3 km weg bei 1,5 km Straße -> abgelehnt
  "Bell":    [{lat:45.449772, lon:10.665231, display_name:"Via Bell'Italia, Peschiera del Garda, Italia"}],
};
let queries = [];
await ctx.route('https://nominatim.openstreetmap.org/**', route => {
  const u = new URL(route.request().url());
  const q = u.searchParams.get('q') || '';
  queries.push({q, bounded: u.searchParams.get('bounded'), viewbox: u.searchParams.get('viewbox')});
  for (const key in FAKE) if (q.includes(key)) {
    return route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(FAKE[key])});
  }
  // alles andere: ein plausibler Treffer nahe der Basis, mit passendem Ortsnamen
  const town = (q.split(',').slice(-2)[0] || 'Peschiera del Garda').trim();
  route.fulfill({status:200, contentType:'application/json', body: JSON.stringify(
    [{lat:45.4420, lon:10.6930, display_name: town + ', Verona, Italia'}])});
});

await page.goto(`${BASE}/koordinaten.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(400);
ok('Startet beim echten Stand', (await page.textContent('#count')).trim()===STAND,
   await page.textContent('#count'));

await page.click('#start');
// warten bis fertig
for (let i=0;i<150;i++){ await page.waitForTimeout(1000);
  if ((await page.textContent('#log')).includes('fertig —')) break; }
await page.waitForTimeout(800);

const log = await page.textContent('#log');
ok('Region wird eingegrenzt', queries.every(q=>q.bounded==='1' && q.viewbox),
   JSON.stringify(queries[0]));

// Entscheidend ist das Ergebnis: der falsche Punkt darf nicht übernommen werden.
// Wird er abgelehnt, probiert die Seite die nächste Schreibweise — das ist gewollt.
const gespeichert = await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.coords')||'{}'));
const BAD = {
  saligusta:        {lat:45.449772, lon:10.665231},
  oreste:           {lat:45.461968, lon:10.719596},
  'ponti-sul-mincio':{lat:45.412515, lon:10.687221},
};
for (const id in BAD) {
  const g = (gespeichert.found||{})[id];
  ok(`${id}: falscher Punkt nicht übernommen`,
     !g || g.lat !== BAD[id].lat || g.lon !== BAD[id].lon,
     g ? JSON.stringify(g) : 'kein Treffer — ebenfalls ok');
}
ok('Ortsprüfung greift auch ohne Komma in der Adresse',
   /Ardietti.*liegt nicht in Ponti sul Mincio/.test(log),
   (log.match(/[^✓✗]*Ardietti[^✓✗]*/)||['nicht im Protokoll'])[0]);

ok('Abschlussbericht erscheint', /Orte ohne Koordinate —/.test(log));
ok('Gute Treffer wurden übernommen', (log.match(/✓/g)||[]).length >= 10,
   String((log.match(/✓/g)||[]).length));

// Zweiter Lauf darf die Fehlschläge nicht erneut durchprobieren
queries = [];
const nochOffen = await page.evaluate(()=>!document.getElementById('start').hidden);
if (nochOffen) { await page.click('#start'); await page.waitForTimeout(2500); }
ok('Zweiter Lauf wiederholt Fehlschläge nicht', queries.length === 0,
   String(queries.length)+' Anfragen');

// Datei prüfen
const [dl] = await Promise.all([ page.waitForEvent('download'), page.click('#dl') ]);
const fs = await import('node:fs');
const out = JSON.parse(fs.readFileSync(await dl.path(),'utf8'));
ok('Datei hat 101 Orte', out.places.length===101);
const drei = ['saligusta','oreste','ponti-sul-mincio'].map(id=>out.places.find(p=>p.id===id));
ok('Keiner der drei trägt wieder den falschen Punkt',
   drei.every(p=>!p.geo || p.geo.lat!==BAD[p.id].lat || p.geo.lon!==BAD[p.id].lon),
   JSON.stringify(drei.map(p=>p.id+':'+JSON.stringify(p.geo))));
const mitGeo = out.places.filter(p=>p.geo).length;
ok('Mehr Orte verortet als vorher', mitGeo > MIT_GEO, `${mitGeo} (vorher ${MIT_GEO})`);
ok('Bestehende Werte unangetastet', out.places.find(p=>p.id==='bip').geo.lat === 
   DATEN.places.find(p=>p.id==='bip').geo.lat);

/* Aus einem Fehlschlag muss ein Weg zurueckfuehren, der die Treffer behaelt.
   Vorher gab es nur "Von vorn anfangen", das auch alles Geholte wegwarf --
   also klickte niemand, und die Seite lieferte bei jedem weiteren Start
   stillschweigend nichts. */
const trefferVorher = await page.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('pk.coords')).found).length);
ok('Knopf für den Neuversuch ist sichtbar', await page.isVisible('#retry'));

queries = [];
await page.click('#retry');
await page.waitForTimeout(300);
const nachRetry = await page.evaluate(() => JSON.parse(localStorage.getItem('pk.coords')));
ok('Neuversuch behält die Treffer',
   Object.keys(nachRetry.found).length === trefferVorher,
   `${Object.keys(nachRetry.found).length} von ${trefferVorher}`);
ok('Neuversuch leert die Fehlschläge',
   Object.keys(nachRetry.failed).length === 0,
   String(Object.keys(nachRetry.failed).length));

await page.click('#start');
await page.waitForTimeout(3000);
ok('Dritter Lauf fragt die Fehlschläge wieder', queries.length > 0,
   `${queries.length} Anfragen`);

/* Ein Fehlschlag gilt nur fuer die Adresse, gegen die er entstanden ist.
   Die Pruefliste verlangt fuer Festung, Bahnhof und Anleger genauere
   Adressen -- ohne diese Regel bliebe der Ort danach trotzdem uebersprungen. */
await page.evaluate(() => {
  const r = JSON.parse(localStorage.getItem('pk.coords'));
  r.failed = { saligusta: ' — erfunden' };
  r.failedAddr = { saligusta: 'eine voellig andere Adresse' };
  localStorage.setItem('pk.coords', JSON.stringify(r));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const nachAdresse = await page.evaluate(() => JSON.parse(localStorage.getItem('pk.coords')));
ok('Geänderte Adresse lässt den Fehlschlag verfallen',
   !nachAdresse.failed.saligusta, JSON.stringify(nachAdresse.failed));
ok('Der Ort steht wieder in der Warteschlange',
   (await page.textContent('#sub')).includes('offen'), await page.textContent('#sub'));

ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
if (SHOT) await page.screenshot({ path: SHOT + '/koord2.png' });
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
