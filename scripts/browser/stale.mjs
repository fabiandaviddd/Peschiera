import { createRequire } from 'node:module';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:402,height:754},hasTouch:true,acceptDownloads:true});
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await ctx.route('https://nominatim.openstreetmap.org/**', r =>
  r.fulfill({status:200, contentType:'application/json', body:'[]'}));

// Zustand eines früheren Laufs nachstellen: alte Fassung {id: geo},
// darin die drei nachweislich falschen Punkte plus ein gültiger
await page.goto(`${BASE}/koordinaten.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(600);   // erst fertig laden lassen, sonst überschreibt die Seite den Speicher
await page.evaluate(()=>{
  localStorage.setItem('pk.coords', JSON.stringify({
    saligusta:        {lat:45.449772, lon:10.665231},
    oreste:           {lat:45.461968, lon:10.719596},
    'ponti-sul-mincio':{lat:45.412515, lon:10.687221},
    famila:           {lat:45.4450,   lon:10.6980},
    bip:              {lat:45.4500,   lon:10.7000}   // steht längst in der Datei
  }));
});
await page.reload({waitUntil:'networkidle'});
await page.waitForTimeout(600);

ok('Versionsmarke sichtbar', (await page.textContent('.k__lead')).includes('18.09.2026'));
const nach = await page.evaluate(()=>JSON.parse(localStorage.getItem('pk.coords')).found||{});
ok("S'Aligusta aussortiert (Entfernungsregel)", !nach.saligusta, JSON.stringify(nach.saligusta||'weg'));
ok('bip verworfen (steht schon in der Datei)', !nach.bip, JSON.stringify(nach.bip||'weg'));
ok('famila bleibt erhalten', !!nach.famila);
ok('Protokoll nennt die Verwerfung', (await page.textContent('#log')).includes('früheren Lauf')
   || (await page.textContent('#log')).includes('frueheren Lauf'), await page.textContent('#log'));

const [dl] = await Promise.all([ page.waitForEvent('download'), page.click('#dl') ]);
const out = JSON.parse((await import('node:fs')).readFileSync(await dl.path(),'utf8'));
const s = out.places.find(p=>p.id==='saligusta');
ok('Falscher Punkt landet nicht in der Datei', !s.geo || s.geo.lat!==45.449772,
   JSON.stringify(s.geo));
const fam = out.places.find(p=>p.id==='famila').geo;
ok('Gültiger Nachtrag landet in der Datei', fam && fam.lat===45.445, JSON.stringify(fam));
ok('Vorhandene Werte unverändert', out.places.find(p=>p.id==='bip').geo.lat!==45.45);
ok('Keine JS-Fehler', errs.length===0, errs.join(' | '));
await browser.close();
console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');
