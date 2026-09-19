/* Die Karte: dieselbe Auswahl wie die Liste, nur anders dargestellt.

   Kachelbilder werden hier NICHT geprueft. Dieses Chromium traut dem
   MITM-Zertifikat des Agent-Proxys nicht, alle fremden Anfragen enden in
   ERR_ABORTED -- aus demselben Grund meldet browser-abnahme.mjs "Google Fonts
   nicht erreichbar". Das ist eine Eigenheit der Umgebung, kein Fehler der App:
   mit ignoreHTTPSErrors laden die Kacheln (nachgestellt am 19.09.2026, 200er
   Antworten von tile.openstreetmap.org). Geprueft wird deshalb alles, was die
   App selbst tut -- Nadeln, Umschalter, Filter, Leerzustand. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const SHOT = process.argv[2] || null;
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const DATEN = createRequire(import.meta.url)('../../data/places.json');
const R = []; /* Dieselbe Signatur wie scripts/browser-abnahme.mjs: (Name, bekommen,
   erwartet). Die Suiten unter scripts/browser/ prueften urspruenglich nur auf
   Wahrheit -- wer dabei ok('...', wert, 'erwartet') schreibt, bekommt eine
   Pruefung, die immer besteht. Genau das ist mir am 19.09. bei mehreren
   Zeilen passiert und erst aufgefallen, als zwei RICHTIGE Zeilen
   fehlschlugen, weil ihr Wert leer bzw. 0 war. */
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));

const MIT_GEO = DATEN.places.filter((p) => p.geo).length;

await page.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');

ok('Umschalter ist in der Liste sichtbar', await page.locator('#map-btn').isVisible());
ok('… und heißt zuerst „Karte"', (await page.textContent('#map-btn')).trim(), 'Karte');
ok('Karte ist zuerst verborgen', await page.locator('#map').isHidden());

await page.click('#map-btn');
await page.waitForTimeout(2500);
ok('Karte erscheint', await page.locator('#map').isVisible());
ok('Liste ist weg', await page.locator('#list').isHidden());
ok('… und der Knopf heißt jetzt „Liste"', (await page.textContent('#map-btn')).trim(), 'Liste');
/* Eine Nadel je verortetem Ort, plus der Zeltplatz als Bezugspunkt. */
ok('eine Nadel je Ort plus Zeltplatz', await page.locator('.mk').count(), MIT_GEO + 1);
ok('der Zeltplatz ist dabei', await page.locator('.mk--base').count(), 1);
if (SHOT) await page.screenshot({ path: SHOT + '/karte.png' });

/* Die Karte hoert auf dieselben Filter wie die Liste -- sonst zeigt sie etwas
   anderes als die Zaehlzeile darueber behauptet. */
await page.click('#jum-btn');
await page.waitForTimeout(1200);
const mitJum = DATEN.places.filter((p) => p.geo && p.dog === true).length;
ok('„Mit Jum" wirkt auch auf der Karte', await page.locator('.mk').count(), mitJum + 1);
await page.click('#jum-btn');
await page.waitForTimeout(1200);

await page.fill('#q', 'zzzgibtesnicht');
await page.waitForTimeout(800);
ok('ohne Treffer verschwindet die Karte', await page.locator('#map').isHidden());
ok('… und der Leerzustand steht da', await page.locator('#empty').isVisible());
await page.fill('#q', '');
await page.waitForTimeout(1000);

/* Eine Nadel antippen oeffnet dasselbe Sheet wie eine Listenzeile.
   force, weil sich die Nadeln im Ortskern ueberlappen -- Playwright weigert
   sich sonst, auf ein teilweise verdecktes Element zu klicken. Das Ueberlappen
   ist real und steht als offener Punkt in der README; hier geht es um den
   Weg von der Nadel ins Sheet, nicht um die Treffsicherheit. */
await page.locator('.mk:not(.mk--base)').first().click({ force: true });
await page.waitForTimeout(700);
ok('Nadel öffnet das Detail-Sheet', await page.locator('#sheet').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* In Heute, Plan und Info hat die Karte nichts zu suchen. */
for (const [tab, name] of [['heute', 'Heute'], ['gemerkt', 'Plan'], ['info', 'Info']]) {
  await page.evaluate(() => { const q = document.getElementById('q'); if (q) q.blur(); });
  await page.waitForTimeout(260);
  await page.locator(`.tab[data-tab="${tab}"]`).click();
  await page.waitForTimeout(500);
  ok(`Karte ist in „${name}" weg`, await page.locator('#map').isHidden());
  ok(`Umschalter ist in „${name}" weg`, await page.locator('#map-btn').isHidden());
}

ok('Keine JS-Fehler', errs.length ? errs.join(' | ') : 0, 0);
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
