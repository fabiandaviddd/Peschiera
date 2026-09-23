/* Termine: was heute nicht stattfindet, wird heute nicht vorgeschlagen.

   Der Fehler, der diese Datei veranlasst hat: am 21.09.2026 stand die
   Rievocazione Storica (25.–27.09.) unter "Jetzt" — vier Tage zu frueh. Die
   App kannte den Termin, sie nutzte ihn aber nur zum Hochsortieren. Ihr
   "laeuft heute nicht" war dasselbe Nein wie bei einem Ort ganz ohne Datum.

   Geprueft wird mit gestellter Uhr (page.clock). Ohne sie waere jede dieser
   Zusagen am 28.09. still falsch — eine Pruefung, die nur bis naechste Woche
   gilt, ist keine. */
import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const require2 = createRequire(import.meta.url);
const { chromium } = require2(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const DATEN = require2('../../data/places.json');

const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};

/* Die Termine kommen aus den Daten, nicht aus dieser Datei — sonst prueft
   sie eine Liste, die mit dem Bestand auseinanderlaeuft. */
const DATUM = /(\d{1,2})\.(?:\s*[–\/-]\s*(\d{1,2})\.)?\s*(\d{1,2})\./;
const TERMINE = DATEN.places
  .filter((p) => p.badge && DATUM.test(p.badge))
  .map((p) => {
    const m = DATUM.exec(p.badge);
    const mon = +m[3];
    return { id: p.id, name: p.name, badge: p.badge, mon, von: +m[1], bis: m[2] ? +m[2] : +m[1] };
  });
const laeuftAm = (t, tag, mon = 9) => mon === t.mon && tag >= t.von && tag <= t.bis;

const browser = ohneStartkarten(await chromium.launch());
const ctx = await browser.newContext({
  viewport: { width: 402, height: 754 }, deviceScaleFactor: 3, hasTouch: true
});
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));

/* Die Uhr steht, bevor die App laedt: sie liest das Datum beim ersten
   Rendern. */
const stelleUhr = async (iso) => {
  await p.clock.setFixedTime(new Date(iso));
};

await stelleUhr('2026-09-21T15:00:00');
await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');

ok('die Daten tragen vier Termine', TERMINE.length, 4);
ok('die App steht auf dem gestellten Tag',
  await p.evaluate(() => new Date().toISOString().slice(0, 10)), '2026-09-21');

/* --- Der ganze Vorschlagsstapel, Karte fuer Karte -------------------- */
async function stapelNamen() {
  const namen = [];
  for (let i = 0; i < 60; i++) {
    const da = await p.locator('.today__pick .today__name').count();
    if (!da) break;
    namen.push((await p.locator('.today__pick .today__name').first().innerText()).trim());
    const next = p.locator('#today-next');
    if (!(await next.count())) break;
    const pos = await p.locator('.today__pos').count()
      ? await p.locator('.today__pos').first().innerText() : '';
    await next.click();
    await p.waitForTimeout(70);
    const neu = await p.locator('.today__pos').count()
      ? await p.locator('.today__pos').first().innerText() : '';
    if (pos && neu && pos === neu) break;          // Ende des Stapels
  }
  return namen;
}

const amEinundzwanzigsten = await stapelNamen();
ok('der Stapel hat ueberhaupt Vorschlaege', amEinundzwanzigsten.length > 3,
  true);
const zuFrueh = TERMINE.filter((t) => !laeuftAm(t, 21) && amEinundzwanzigsten.includes(t.name));
ok('kein Termin steht im Stapel, der am 21.09. nicht laeuft',
  zuFrueh.map((t) => `${t.name} (${t.badge})`), []);

/* Gegenprobe: an ihrem eigenen Tag muessen sie auftauchen duerfen. Ohne
   diese Haelfte waere die Zusage auch mit "nie anzeigen" erfuellt. */
await stelleUhr('2026-09-26T15:00:00');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
const amSechsundzwanzigsten = await stapelNamen();
const laufend = TERMINE.filter((t) => laeuftAm(t, 26));
ok('am 26.09. gibt es laufende Termine', laufend.length > 0, true);
ok('ein laufender Termin steht im Stapel',
  laufend.some((t) => amSechsundzwanzigsten.includes(t.name)), true);

/* --- Der Klartext im Ort ---------------------------------------------- */
const sheetText = async (id) => {
  await p.evaluate((x) => {
    const b = document.querySelector(`[data-open="${x}"]`);
    if (b) b.click();
  }, id);
  await p.waitForTimeout(400);
  const t = await p.locator('#sheet .sheet__termin').count()
    ? (await p.locator('#sheet .sheet__termin').first().innerText()).trim() : '';
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
  return t;
};

const suchen = async (wort) => {
  await p.evaluate(() => {
    const t = document.querySelector('[data-tab="orte"]');
    if (t) t.click();
  });
  await p.waitForTimeout(300);
  await p.fill('#q', wort);
  await p.waitForTimeout(250);
};

const rievo = TERMINE.find((t) => t.id === 'rievocazione');
await suchen('Rievocazione');
ok('am 26.09. sagt der Ort, dass der Termin laeuft',
  (await sheetText('rievocazione')).includes('Läuft heute'), true);

await stelleUhr('2026-09-21T15:00:00');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await suchen('Rievocazione');
const vorlauf = await sheetText('rievocazione');
ok('am 21.09. sagt er, wie lange es noch dauert',
  /Läuft erst in 4 Tagen/.test(vorlauf), true, vorlauf);
ok('und nennt dabei den Termin selbst', vorlauf.includes(rievo.badge), true);

await stelleUhr('2026-09-28T15:00:00');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await suchen('Rievocazione');
ok('nach dem Termin sagt er, dass er vorbei ist',
  (await sheetText('rievocazione')).includes('vorbei'), true);

/* --- Die Listenzeile -------------------------------------------------- */
/* Die Festa di Castelnuovo (18.–20.09.) ist am 21.09. Geschichte. Sie
   verschwindet nicht — in der Liste wird gesucht —, aber sie sagt es. */
await stelleUhr('2026-09-21T15:00:00');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await suchen('Castelnuovo');
const badge = await p.locator('#list .card .card__badge').first();
ok('der Badge eines vergangenen Termins steht noch da', await badge.count(), 1);
ok('… und sagt, dass er vorbei ist',
  (await badge.innerText()).toLowerCase().includes('vorbei'), true);
ok('… und traegt die gedaempfte Klasse',
  await badge.evaluate((e) => e.classList.contains('card__badge--vorbei')), true);

await suchen('Rievocazione');
const kommend = p.locator('#list .card .card__badge').first();
ok('ein Termin, der noch kommt, bleibt unveraendert',
  (await kommend.innerText()).toLowerCase().includes('vorbei'), false);

/* --- Der falsche Tag im Plan ------------------------------------------ */
/* Der teuerste Planfehler der App: die Rievocazione auf den Dienstag legen
   und am Dienstag vor der leeren Festung stehen. */
await p.evaluate(() => {
  localStorage.setItem('pk.saved', JSON.stringify(['rievocazione']));
  localStorage.setItem('pk.days', JSON.stringify({ rievocazione: '2026-09-22' }));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.evaluate(() => {
  const t = document.querySelector('[data-tab="gemerkt"]');
  if (t) t.click();
});
await p.waitForTimeout(400);
await p.locator('[data-dayopen="2026-09-22"]').first().click();
await p.waitForTimeout(500);
const tagText = await p.locator('#sheet').innerText();
ok('das Tages-Sheet warnt vor dem falschen Tag',
  tagText.includes('läuft an dem Tag nicht'), true);

await p.keyboard.press('Escape');
await p.waitForTimeout(400);
await p.evaluate(() => {
  localStorage.setItem('pk.days', JSON.stringify({ rievocazione: '2026-09-26' }));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.evaluate(() => {
  const t = document.querySelector('[data-tab="gemerkt"]');
  if (t) t.click();
});
await p.waitForTimeout(400);
await p.locator('[data-dayopen="2026-09-26"]').first().click();
await p.waitForTimeout(500);
ok('am richtigen Tag warnt es nicht',
  (await p.locator('#sheet').innerText()).includes('läuft an dem Tag nicht'), false);

/* --- Der Grund im Vorschlag ist lesbar ----------------------------------

   In v46 stand der Grund am Ende der Zeile, und die Zeile endet in einer
   Ellipse: von "nur an diesem Tag" blieb auf 402 px "nur an d…". Das war
   genau der Teil, um den es ging. Gefunden nicht durch einen Test, sondern
   beim Ansehen der Bildschirmabzuege fuer die Praesentationsseite. */
await p.evaluate(() => {
  localStorage.setItem('pk.saved', '[]');
  localStorage.setItem('pk.days', '{}');
});
await stelleUhr('2026-09-23T10:00:00');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.evaluate(() => {
  const t = document.querySelector('[data-tab="gemerkt"]');
  if (t) t.click();
});
await p.waitForTimeout(400);
await p.locator('[data-dayopen="2026-09-26"]').first().click();
await p.waitForTimeout(600);
const gruende = await p.evaluate(() =>
  [...document.querySelectorAll('.tagvor .tagsheet__grund')].map((g) => {
    const r = g.getBoundingClientRect();
    const zeile = g.closest('.tagsheet__m').getBoundingClientRect();
    return { text: g.textContent.trim(), ganz: r.right <= zeile.right + 0.5 && r.width > 0 };
  }));
ok('am 26.09. tragen die laufenden Termine einen Grund', gruende.length >= 1, true);
ok('… er lautet "nur an diesem Tag"', gruende.every((g) => g.text === 'nur an diesem Tag'), true);
ok('… und ist ganz zu sehen, nicht abgeschnitten', gruende.every((g) => g.ganz), true);
ok('… weil er vorne steht', await p.evaluate(() => {
  const m = document.querySelector('.tagvor .tagsheet__m');
  return !!m && m.firstElementChild && m.firstElementChild.classList.contains('tagsheet__grund');
}), true);
/* toLowerCase() machte in v46 aus "Nach Entfernung vom Zeltplatz" "nach
   entfernung vom zeltplatz". */
const vorLead = (await p.locator('.tagvor .tagsheet__lead').innerText()).trim();
ok('die Zeile ueber den Vorschlaegen schreibt Substantive gross',
  /Entfernung vom Zeltplatz/.test(vorLead) && !/entfernung vom zeltplatz/.test(vorLead), true);
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
