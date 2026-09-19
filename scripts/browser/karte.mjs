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
/* Seit v25 wird gebuendelt -- "eine Nadel je Ort" gilt nicht mehr, und das
   ist der Punkt: 96 der 102 Nadeln lagen so dicht, dass sich ihre Punkte
   beruehrten. Die Zusicherung wird dadurch nicht schwaecher, sondern
   staerker: jeder verortete Ort muss vertreten sein, entweder als eigene
   Nadel oder in der Zahl auf einem Buendel. Geht dabei einer verloren,
   faellt es hier auf und nicht erst am See. */
const vertretung = async () => page.evaluate(() => {
  const mk = [...document.querySelectorAll('.leaflet-marker-icon.mk')];
  const bund = mk.filter((m) => m.classList.contains('mk--bund'));
  const einzeln = mk.filter((m) =>
    !m.classList.contains('mk--bund') && !m.classList.contains('mk--base'));
  return einzeln.length + bund.reduce((a, m) => a + Number(m.textContent.trim() || 0), 0);
});
ok('jeder verortete Ort ist vertreten', await vertretung(), MIT_GEO);
ok('der Zeltplatz ist dabei', await page.locator('.mk--base').count(), 1);

/* Und keine zwei Nadeln liegen naeher beieinander als eine Fingerkuppe --
   genau das war vorher der Fehler. Der Zeltplatz zaehlt nicht mit: er ist
   kein Bedienelement, sondern ein Bezugspunkt. */
const engsterAbstand = async () => page.evaluate(() => {
  const pos = [...document.querySelectorAll('.leaflet-marker-icon.mk')]
    .filter((m) => !m.classList.contains('mk--base'))
    .map((m) => { const r = m.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2]; });
  let min = Infinity;
  for (let i = 0; i < pos.length; i++) {
    for (let j = i + 1; j < pos.length; j++) {
      min = Math.min(min, Math.max(Math.abs(pos[i][0] - pos[j][0]),
                                   Math.abs(pos[i][1] - pos[j][1])));
    }
  }
  return min === Infinity ? 999 : Math.round(min);
});
ok('keine zwei Nadeln liegen naeher als 34 px', (await engsterAbstand()) >= 34);
if (SHOT) await page.screenshot({ path: SHOT + '/karte.png' });

/* Die Karte hoert auf dieselben Filter wie die Liste -- sonst zeigt sie etwas
   anderes als die Zaehlzeile darueber behauptet. */
await page.click('#jum-btn');
await page.waitForTimeout(1200);
const mitJum = DATEN.places.filter((p) => p.geo && p.dog === true).length;
ok('„Mit Jum" wirkt auch auf der Karte', await vertretung(), mitJum);
ok('… und auch dann ueberlappt nichts', (await engsterAbstand()) >= 34);
await page.click('#jum-btn');
await page.waitForTimeout(1200);

await page.fill('#q', 'zzzgibtesnicht');
await page.waitForTimeout(800);
ok('ohne Treffer verschwindet die Karte', await page.locator('#map').isHidden());
ok('… und der Leerzustand steht da', await page.locator('#empty').isVisible());
await page.fill('#q', '');
await page.waitForTimeout(1000);

/* Eine einzelne Nadel antippen oeffnet dasselbe Sheet wie eine Listenzeile.
   Ohne force: seit der Buendelung verdeckt nichts mehr etwas, und genau das
   soll die Zusicherung mitpruefen. Bis v24 stand hier force, weil sich die
   Nadeln im Ortskern ueberlappten -- der offene Punkt aus der README. */
await page.locator('.mk:not(.mk--base):not(.mk--bund)').first().click();
await page.waitForTimeout(700);
ok('einzelne Nadel öffnet das Detail-Sheet', await page.locator('#sheet').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* Ein Buendel antippen zoomt hinein und teilt es. Nachgemessen brach die
   Altstadt damit in drei Tipps von 72 auf 33 auf 9 auf 4 auf -- mit der
   zuerst gebauten Regel "zerfaellt in mindestens zwei" waren es 72, 61, 50,
   43, also drei Tipps fuer nicht einmal die Haelfte. */
const groesstesBuendel = async () => page.evaluate(() =>
  Math.max(0, ...[...document.querySelectorAll('.mk--bund')].map((m) => Number(m.textContent.trim()))));
const vorTipp = await groesstesBuendel();
ok('es gibt ueberhaupt ein Buendel', vorTipp > 1);
await page.evaluate(() => {
  const b = [...document.querySelectorAll('.mk--bund')]
    .sort((a, c) => Number(c.textContent) - Number(a.textContent))[0];
  b.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
await page.waitForTimeout(1200);
const nachTipp = await groesstesBuendel();
ok('ein Tipp halbiert das groesste Buendel mindestens', nachTipp <= Math.ceil(vorTipp / 2));
ok('dabei geht kein Ort verloren', await vertretung(), MIT_GEO);
ok('und es ueberlappt weiterhin nichts', (await engsterAbstand()) >= 34);

/* Neun Punkte in den Daten tragen mehr als einen Ort -- dieselbe Adresse,
   dieselbe Koordinate: "Osteria sugli Scavi" und "Dom San Martino" etwa.
   Dort hilft kein Zoom, auch bei maxZoom bleiben sie ein Buendel. Statt den
   Benutzer ins Leere tippen zu lassen, zeigt das Buendel dann die Namen. */
await page.evaluate(() => {
  const k = window.__karte;
  if (k) k.setView([45.43799, 10.695114], k.getMaxZoom());
});
await page.waitForTimeout(1200);
const aufPunkt = await page.evaluate(() => {
  const b = [...document.querySelectorAll('.mk--bund')];
  if (!b.length) return null;
  b[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  return b[0].textContent.trim();
});
if (aufPunkt === null) {
  ok('bei maxZoom bleibt ein Buendel auf gemeinsamem Punkt', 'kein Buendel gefunden', 'ein Buendel');
} else {
  await page.waitForTimeout(600);
  ok('auf gemeinsamem Punkt bleibt ein Buendel', Number(aufPunkt) > 1);
  ok('… und zeigt beim Tippen die Namen statt zu zoomen',
    await page.locator('.bundpop').count() > 0);
  const namen = await page.evaluate(() =>
    [...document.querySelectorAll('.bund__b .bund__n')].map((x) => x.textContent.trim()));
  ok('die Namensliste nennt so viele Orte wie das Buendel', namen.length, Number(aufPunkt));
  ok('jeder Eintrag ist gross genug zum Tippen', await page.evaluate(() =>
    [...document.querySelectorAll('.bund__b')].every((x) => x.getBoundingClientRect().height >= 44)));
  await page.locator('.bund__b').first().click();
  await page.waitForTimeout(700);
  ok('ein Name im Buendel oeffnet sein Detail', await page.locator('#sheet').isVisible());
  ok('… und die Namensliste ist danach zu', await page.locator('.bundpop').count(), 0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

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
