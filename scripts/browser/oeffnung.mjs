/* Oeffnungszeiten: was zu hat, wird nicht vorgeschlagen -- und was man
   nicht weiss, wird gesagt.

   Vier Meldungen aus der Benutzung, alle vier zutreffend:

   1. "Tag planen" schlug die Osteria Bakarè fuer einen Dienstag vor, mit
      "an dem Tag geoeffnet" darueber. Ihre Angabe: "Mi–Sa 19:00–23:00". Auf
      den Dienstag gelegt, warnte "Reise" nicht.
   2. Um 16:48 stand der Dienstagsmarkt in Desenzano (8–13 Uhr) ganz oben.
   3. Die Palazzina Storica wurde fuer den Nachmittag empfohlen, "oeffnet
      10:00" -- wann sie schliesst, stand nirgends.
   4. Im Tages-Sheet stand "887 m", ueberall sonst "18 Min" und im Ort
      "1,3 km". Welche Zahl stimmt?

   Geprueft mit gestellter Uhr: Dienstag, 22.09.2026. Ohne sie gaelten die
   Zusagen nur an einem Dienstag. */
import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const require2 = createRequire(import.meta.url);
const { chromium } = require2(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const DATEN = require2('../../data/places.json');
const ort = (id) => DATEN.places.find((p) => p.id === id);

const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};

const browser = ohneStartkarten(await chromium.launch());
const ctx = await browser.newContext({
  viewport: { width: 402, height: 754 }, deviceScaleFactor: 2, hasTouch: true
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

const DIENSTAG = '2026-09-22';
const zu = async (iso, speicher) => {
  await p.clock.setFixedTime(new Date(iso));
  await p.evaluate((s) => {
    localStorage.setItem('pk.saved', JSON.stringify(s.saved || []));
    localStorage.setItem('pk.days', JSON.stringify(s.days || {}));
    localStorage.setItem('pk.seen', '[]');
  }, speicher || {}).catch(() => {});
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
};
const reiter = async (id) => {
  await p.evaluate((t) => document.querySelector(`[data-tab="${t}"]`).click(), id);
  await p.waitForTimeout(400);
};
const tagSheet = async (iso) => {
  await reiter('gemerkt');
  await p.locator(`[data-dayopen="${iso}"]`).first().click();
  await p.waitForTimeout(600);
};
const schliessen = async () => { await p.keyboard.press('Escape'); await p.waitForTimeout(400); };
const vorschlagNamen = () => p.locator('.tagvor .tagsheet__name').allTextContents();

/* Der ganze Stapel in "Jetzt", Karte fuer Karte -- samt dem Satz darunter. */
async function stapel() {
  const out = [];
  for (let i = 0; i < 80; i++) {
    if (!(await p.locator('.today__pick .today__name').count())) break;
    out.push({
      name: (await p.locator('.today__pick .today__name').first().innerText()).trim(),
      why: (await p.locator('.today__pick .today__why').first().innerText()).trim()
    });
    const pos = await p.locator('.today__pos').first().innerText().catch(() => '');
    await p.locator('#today-next').click();
    await p.waitForTimeout(60);
    const neu = await p.locator('.today__pos').first().innerText().catch(() => '');
    if (!pos || pos === neu || /^1 \//.test(neu)) break;
  }
  return out;
}

await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });

/* === 1. Die Osteria Bakarè am Dienstag ================================== */
const bak = ort('bakare');
ok('die Daten sagen "Mi–Sa"', /^Mi–Sa/.test(bak.hours), true);

await zu(`${DIENSTAG}T10:00:00`);
await tagSheet(DIENSTAG);
const vorDienstag = await vorschlagNamen();
ok('"Tag planen" hat fuer Dienstag ueberhaupt Vorschlaege', vorDienstag.length > 0, true);
ok('… und die Osteria Bakarè ist nicht darunter', vorDienstag.includes(bak.name), false);
const lead = (await p.locator('.tagvor .tagsheet__lead').innerText()).trim();
ok('die Zeile darueber behauptet nicht mehr "geöffnet"', /geöffnet/.test(lead), false);
ok('… sondern sagt, was aussortiert ist', /Geschlossenes aussortiert/.test(lead), true);
await schliessen();

/* Am Mittwoch hat sie offen: dort darf sie auftauchen. Gegenprobe, sonst
   waere die Zusage auch mit "nie vorschlagen" erfuellt. */
await tagSheet('2026-09-23');
ok('am Mittwoch darf sie vorgeschlagen werden', (await vorschlagNamen()).includes(bak.name), true);
await schliessen();

/* Auf den Dienstag gelegt: jetzt warnen alle drei Stellen. */
await zu(`${DIENSTAG}T10:00:00`, { saved: ['bakare'], days: { bakare: DIENSTAG } });
await reiter('gemerkt');
const karte = await p.locator(`.tagk[data-dayopen="${DIENSTAG}"]`).innerText();
ok('die Tageskarte in "Reise" warnt', /an dem Tag zu/.test(karte), true);
/* Nicht im selben Grau wie die Dauer daneben -- das las man beim
   Ueberfliegen weg. */
ok('… sichtbar, in Ziegel und mit Zeichen', await p.locator(
  `.tagk[data-dayopen="${DIENSTAG}"] .tagk__zu svg`).count(), 1);
await p.locator(`.tagk[data-dayopen="${DIENSTAG}"]`).click();
await p.waitForTimeout(600);
ok('das Tages-Sheet warnt an der Station selbst',
  /an dem Tag zu/.test(await p.locator('.tagsheet__row--drin').first().innerText()), true);
await schliessen();
await reiter('heute');
ok('der heutige Plan in "Jetzt" warnt',
  /heute zu/.test(await p.locator('.planheut').innerText()), true);

/* Und schon beim Waehlen: der Chip in der Liste steht auf Ziegel, und in
   seiner Auswahl tragen die geschlossenen Tage ein "· zu". */
await reiter('orte');
await p.fill('#q', 'Bakar');
await p.waitForTimeout(400);
const chip = p.locator('#list .card .daychip').first();
ok('der Chip auf einem geschlossenen Tag faerbt sich',
  await chip.evaluate((e) => e.classList.contains('daychip--zu')), true);
ok('… und sagt es dem Vorleser',
  /geschlossen/.test(await chip.locator('select').getAttribute('aria-label')), true);
const optionen = await chip.locator('option').evaluateAll((os) =>
  os.map((o) => ({ v: o.value, t: o.textContent })));
const zuTage = optionen.filter((o) => /· zu$/.test(o.t)).map((o) => o.v);
ok('in der Auswahl steht an Montag und Sonntag "· zu"',
  ['2026-09-21', '2026-09-27'].every((d) => zuTage.includes(d)), true);
ok('… an Mittwoch bis Samstag nicht',
  ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26'].some((d) => zuTage.includes(d)), false);
await p.fill('#q', '');

/* === 2. Der Markt, der vorbei ist ========================================= */
const markt = ort('mercato-desenzano');
ok('die Daten sagen "Di 8–13"', markt.hours, 'Di 8–13');

await zu(`${DIENSTAG}T16:48:00`);
await tagSheet(DIENSTAG);
ok('um 16:48 schlaegt "Tag planen" fuer heute den Markt nicht mehr vor',
  (await vorschlagNamen()).includes(markt.name), false);
await schliessen();

/* Der zweite Weg: in "Jetzt" den Mittag antippen. Bis v47 rechnete die App
   dann so, als waere es 11:30. */
await reiter('heute');
await p.locator('[data-mid="mittag"]').click();
await p.waitForTimeout(400);
const mittag = await stapel();
ok('"Mittag" um 16:48 hat ueberhaupt Vorschlaege', mittag.length > 0, true);
ok('… aber nicht den Markt', mittag.some((x) => x.name === markt.name), false);

/* Gegenprobe um 9 Uhr: da laeuft er, und er darf ganz nach oben. */
await zu(`${DIENSTAG}T09:00:00`);
await tagSheet(DIENSTAG);
const morgens = await vorschlagNamen();
ok('um 9:00 steht der Markt in "Tag planen"', morgens.includes(markt.name), true);
ok('… an erster Stelle, als Termin des Tages', morgens[0], markt.name);
await schliessen();

/* === 3. Wann schliesst die Palazzina? ======================================= */
const pal = ort('palazzina-storica');
ok('die Daten nennen nur die Oeffnung', pal.hours, 'öffnet 10:00 · Mi geschlossen');

/* Donnerstag, nicht Mittwoch: mittwochs hat sie zu. */
await zu('2026-09-24T16:48:00');
await reiter('heute');
const nachmittag = await stapel();
const palKarte = nachmittag.find((x) => x.name === pal.name);
ok('die Palazzina steht am Donnerstagnachmittag im Stapel', !!palKarte, true);
const ankunft = `${16 + Math.floor((48 + pal.walk_min) / 60)}:${String((48 + pal.walk_min) % 60).padStart(2, '0')}`;
ok('… und sagt, dass die Schliesszeit unbekannt ist',
  !!palKarte && /Schließzeit unbekannt/.test(palKarte.why), true);
ok(`… samt Ankunft (≈ ${ankunft})`, !!palKarte && palKarte.why.includes(ankunft), true);
/* Was sicher reicht, steht davor. Dahinter duerfen nur Orte kommen, die
   ebenfalls einen Vorbehalt tragen: unbekannte oder knappe Schlusszeit,
   ungepruefte Zeiten, oder "dafuer ist es heute zu spaet". */
const pos = nachmittag.findIndex((x) => x.name === pal.name);
const davor = nachmittag.slice(0, pos);
const danach = nachmittag.slice(pos + 1);
const VORBEHALT = /Schließzeit unbekannt|schließt um|ungeprüft|zu spät/;
ok('… davor steht nichts mit Vorbehalt', davor.some((x) => VORBEHALT.test(x.why)), false);
ok('… dahinter nur, was selbst einen traegt', danach.every((x) => VORBEHALT.test(x.why)), true);

/* Am Mittwoch hat sie zu -- dort fehlt sie ganz. */
await zu('2026-09-23T16:48:00');
await reiter('heute');
ok('am Mittwoch fehlt sie, denn da ist Ruhetag',
  (await stapel()).some((x) => x.name === pal.name), false);

/* === 4. Minuten, nicht Meter ================================================ */
await zu(`${DIENSTAG}T10:00:00`);
await tagSheet('2026-09-24');
const zeilen = await p.locator('.tagvor .tagsheet__row').evaluateAll((rs) => rs.map((r) => ({
  name: r.querySelector('.tagsheet__name').textContent.trim(),
  weg: (r.querySelector('.tagsheet__weit') || {}).textContent || ''
})));
ok('das Tages-Sheet zeigt keine Meter mehr', zeilen.some((z) => /\d m$/.test(z.weg.trim())), false);
const mitMin = zeilen.map((z) => ({ ...z, d: DATEN.places.find((q) => q.name === z.name) }))
  .filter((z) => z.d && z.d.walk_min != null);
ok('es gibt Zeilen mit Gehzeit', mitMin.length > 0, true);
ok('… und jede nennt dieselbe Zahl wie der Ort selbst',
  mitMin.every((z) => z.weg.trim() === `${z.d.walk_min} Min zu Fuß`), true);
await schliessen();

/* Die Osteria im Ort und im Tages-Sheet: dieselbe Zahl. */
await p.evaluate(() => { localStorage.setItem('pk.saved', '["bakare"]'); localStorage.setItem('pk.days', '{}'); });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await tagSheet('2026-09-24');
/* Gemerktes steht oben unter "Gemerkt, noch ohne Tag" -- und darf nicht ein
   zweites Mal unter den Vorschlaegen stehen, deren Zeile "Nicht gemerkt"
   sagt. Gefunden beim Fotografieren fuer die Vorstellung. */
ok('Gemerktes steht nicht noch einmal unter den Vorschlaegen',
  (await vorschlagNamen()).includes(bak.name), false);
const bakZeile = await p.locator('.tagfrei .tagsheet__row', { hasText: bak.name }).innerText();
ok(`die Osteria Bakarè steht im Tages-Sheet mit "${bak.walk_min} Min zu Fuß"`,
  bakZeile.includes(`${bak.walk_min} Min zu Fuß`), true);
ok('… nicht mit "887 m"', /887 m/.test(bakZeile), false);
await schliessen();

/* Und die Trefferliste unter der Karte: dieselbe Zahl wie die Liste. */
await reiter('orte');
await p.click('#map-btn');
await p.waitForTimeout(1500);
await p.evaluate(() => document.getElementById('mapsheet-grip').click());
await p.waitForTimeout(400);
const ms = await p.locator('#mapsheet .msrow').evaluateAll((rs) => rs.slice(0, 20).map((r) => ({
  id: r.getAttribute('data-open'), m: r.querySelector('.msrow__m').textContent
})));
const msMin = ms.map((r) => ({ ...r, d: ort(r.id) })).filter((r) => r.d && r.d.walk_min != null);
ok('auch unter der Karte: Gehminuten wie in der Liste',
  msMin.length > 0 && msMin.every((r) => r.m.includes(`${r.d.walk_min} Min zu Fuß`)), true);
await p.click('#map-btn');

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
