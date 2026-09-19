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
    !m.classList.contains('mk--bund') && !m.classList.contains('mk--bezug'));
  return einzeln.length + bund.reduce((a, m) => a + Number(m.textContent.trim() || 0), 0);
});
ok('jeder verortete Ort ist vertreten', await vertretung(), MIT_GEO);
ok('der Zeltplatz ist dabei', await page.locator('.mk--zelt').count(), 1);

/* Und keine zwei Nadeln liegen naeher beieinander als eine Fingerkuppe --
   genau das war vorher der Fehler. Der Zeltplatz zaehlt nicht mit: er ist
   kein Bedienelement, sondern ein Bezugspunkt. */
const engsterAbstand = async () => page.evaluate(() => {
  const pos = [...document.querySelectorAll('.leaflet-marker-icon.mk')]
    .filter((m) => !m.classList.contains('mk--bezug'))
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
await page.locator('.mk:not(.mk--bezug):not(.mk--bund)').first().click();
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

/* --- Das Sheet muss VOR der Karte liegen -------------------------------- */
/* Leaflet vergibt intern z-index bis 700 (Kacheln 200, Nadeln 600, Popups
   700). Ohne eigenen Stapelkontext auf .map liegen die alle im selben Stapel
   wie der Rest der App, und das Sheet mit z-index: 50 verliert gegen jede
   davon: es stand vollstaendig da, aber Nadeln, Zoomknoepfe und Kacheln
   stanzten mitten hindurch. Gemeldet vom Besitzer, hier nachgestellt.

   Geprueft wird nicht der z-index, sondern die Wirkung: ueber die ganze
   Flaeche des Sheets darf an keiner Stelle etwas aus der Karte obenauf
   liegen. Ein Test auf die Zahl waere mit der naechsten Leaflet-Fassung
   wertlos. */
/* Ausschnitt zuruecksetzen: die Pruefungen davor haben bis maxZoom
   hineingezoomt, die einzelnen Nadeln liegen danach ausserhalb des Bildes.
   Einmal auf die Liste und zurueck laesst zeigeKarte neu einpassen. */
await page.click('#map-btn');
await page.waitForTimeout(500);
await page.click('#map-btn');
await page.waitForTimeout(1800);

await page.locator('.mk:not(.mk--bezug):not(.mk--bund)').first().click();
await page.waitForTimeout(700);
/* Nachweis ueber die Struktur, nicht ueber eine Trefferprobe.

   Versucht wurde beides. Weder ein Raster ueber das Sheet noch eine gezielte
   Messung in der Ueberschneidung mit jeder Kartennadel hat den Fehler
   gefunden: elementFromPoint meldete brav das Sheet, waehrend der
   Bildschirmabzug aus DEMSELBEN Lauf die Nadeln, die Zoomknoepfe und die
   Herkunftszeile darueber zeigte. Leaflet schiebt seine Nadeln mit
   translate3d, sie liegen also auf eigenen Grafikebenen -- und deren
   Zeichenreihenfolge muss in diesem Chromium nicht der Trefferreihenfolge
   entsprechen.

   Eine Pruefung, die den Fehler nicht sieht, ist schlimmer als keine: sie
   behauptet, es sei alles in Ordnung. Deshalb steht hier die Bedingung
   selbst, und die ist eindeutig -- bildet .map einen eigenen Stapelkontext,
   koennen Leaflets interne z-index-Werte gar nicht mehr mit dem Rest der App
   konkurrieren, egal welche Zahlen die naechste Fassung vergibt.

   Belegt wurde der Fehler mit zwei Bildschirmabzuegen, einmal mit und einmal
   ohne die zwei Zeilen in .map. */
const stapel = await page.evaluate(() => {
  const c = getComputedStyle(document.getElementById('map'));
  const s = getComputedStyle(document.getElementById('sheet'));
  return { pos: c.position, z: c.zIndex, isolation: c.isolation, sheetZ: s.zIndex };
});
/* Ein eigener Stapelkontext entsteht durch position + z-index (oder
   isolation: isolate). Beides wird akzeptiert -- geprueft ist die
   Eigenschaft, nicht die Schreibweise. */
ok('die Karte bildet einen eigenen Stapelkontext',
  stapel.isolation === 'isolate' || (stapel.pos !== 'static' && stapel.z !== 'auto'));
/* Und zwar unterhalb des Sheets. Ein eigener Kontext mit z-index: 99 waere
   genauso falsch wie gar keiner. */
ok('… und liegt darin unter dem Sheet',
  stapel.isolation === 'isolate' || Number(stapel.z) < Number(stapel.sheetZ));
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

/* --- Von wo starte ich? -------------------------------------------------- */
/* Der Zeltplatz trug bis v25 einen Tooltip. Ein Tooltip braucht ein
   Ueberfahren mit der Maus -- auf dem Zielgeraet gibt es das nicht, die
   Beschriftung war dort nie zu sehen. Jetzt steht sie fest daneben. */
const zelt = await page.evaluate(() => {
  const m = document.querySelector('.mk--zelt');
  if (!m) return null;
  const t = m.querySelector('.mk__text');
  const p = m.querySelector('.mk__punkt');
  const tr = t.getBoundingClientRect(), pr = p.getBoundingClientRect();
  const karte = document.getElementById('map').getBoundingClientRect();
  return {
    text: t.textContent.trim(),
    schildSichtbar: tr.width > 0 && tr.height > 0 && getComputedStyle(t).display !== 'none',
    schildUnterDemPunkt: tr.top > pr.bottom,
    punktRund: Math.round(pr.width) === 22 && Math.round(pr.height) === 22,
    imBild: pr.left >= karte.left && pr.right <= karte.right
      && pr.top >= karte.top && pr.bottom <= karte.bottom,
    durchlaessig: getComputedStyle(m).pointerEvents
  };
});
ok('der Zeltplatz traegt seinen Namen sichtbar', zelt && zelt.text, 'Zeltplatz');
ok('… ohne dass man mit der Maus darueberfahren muss', zelt && zelt.schildSichtbar);
ok('… das Schild steht unter dem Punkt', zelt && zelt.schildUnterDemPunkt);
ok('… der Punkt sitzt rund und mittig auf der Koordinate', zelt && zelt.punktRund);
ok('… und liegt im sichtbaren Ausschnitt', zelt && zelt.imBild);
/* Ein Bezugspunkt ist eine Auskunft, kein Bedienelement: er darf keinem Ort
   den Tipp wegnehmen. Am Zeltplatz liegt das groesste Buendel darunter. */
ok('… und nimmt keinem Ort den Tipp weg', zelt && zelt.durchlaessig, 'none');

/* --- Der eigene Standort, in einem Fenster mit Ortungsrecht -------------- */
const browser2 = await chromium.launch();
{
  const ctx2 = await browser2.newContext({
    viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE',
    permissions: ['geolocation'], geolocation: { latitude: 45.4402, longitude: 10.6905 }
  });
  const q = await ctx2.newPage();
  await q.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');

  await q.click('#map-btn');
  await q.waitForTimeout(2000);
  ok('ohne gesetzten Standort gibt es keine Hier-Nadel',
    await q.locator('.mk--hier').count(), 0);

  await q.click('#map-btn');            // zurueck zur Liste
  await q.waitForTimeout(400);
  await q.click('#chip-filter');
  await q.waitForTimeout(600);
  await q.click('#here-btn');
  await q.waitForTimeout(1800);
  await q.keyboard.press('Escape');
  await q.waitForTimeout(500);
  await q.click('#map-btn');
  await q.waitForTimeout(2000);

  const hier = await q.evaluate(() => {
    const m = document.querySelector('.mk--hier');
    if (!m) return null;
    const t = m.querySelector('.mk__text').getBoundingClientRect();
    const p = m.querySelector('.mk__punkt').getBoundingClientRect();
    const k = document.getElementById('map').getBoundingClientRect();
    return {
      text: m.querySelector('.mk__text').textContent.trim(),
      schildUeberDemPunkt: t.bottom < p.top,
      imBild: p.left >= k.left && p.right <= k.right && p.top >= k.top && p.bottom <= k.bottom,
      zeltAuchDa: !!document.querySelector('.mk--zelt')
    };
  });
  ok('mit Standort steht eine Hier-Nadel auf der Karte', hier !== null);
  ok('… und sagt es auch', hier && /^Du bist hier/.test(hier.text));
  /* Zeltplatz nach unten, eigener Standort nach oben -- liegen beide nah
     beieinander, stehen die Schilder sonst uebereinander. */
  ok('… ihr Schild steht ueber dem Punkt', hier && hier.schildUeberDemPunkt);
  ok('… sie liegt im sichtbaren Ausschnitt', hier && hier.imBild);
  ok('… und der Zeltplatz bleibt daneben stehen', hier && hier.zeltAuchDa);

  /* Standort wieder abschalten: die Nadel muss mit verschwinden, sonst zeigt
     die Karte einen Bezugspunkt, nach dem nicht mehr gemessen wird. */
  await q.click('#map-btn');
  await q.waitForTimeout(400);
  await q.click('#chip-filter');
  await q.waitForTimeout(600);
  await q.click('#here-btn');
  await q.waitForTimeout(800);
  await q.keyboard.press('Escape');
  await q.waitForTimeout(400);
  await q.click('#map-btn');
  await q.waitForTimeout(1800);
  ok('Standort aus -> Hier-Nadel weg', await q.locator('.mk--hier').count(), 0);
  ok('… der Zeltplatz bleibt', await q.locator('.mk--zelt').count(), 1);
  await ctx2.close();
}
await browser2.close();
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
