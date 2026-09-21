/* Der Plan schlaegt vor, statt nur zu verwalten.

   Zwei Zusagen aus v37, beide neu und beide leicht wieder zu verlieren:

   1. "Jetzt" sagt, was ein Vorschlag den heutigen Tag KOSTET ("≈ 12 Min
      Umweg — kaeme nach der Rocca") und legt ihn auf einen Tipp an genau
      die Stelle. Bis v36 sagte der Vorschlag nur, WAS er vorschlaegt: ein
      Ort auf dem Weg und einer am anderen Ende des Sees sahen gleich
      einladend aus, und der Weg vom Vorschlag in den Tag ging ueber Stern,
      Reiterwechsel und Tagwaehler.

   2. Das Tages-Sheet durchsucht ALLE 101 Orte, nicht nur den Vorrat. Wer am
      Mittwoch etwas sucht, hat es in der Regel noch nicht gemerkt -- "erst
      merken, dann Tag waehlen" waren zwei Schritte fuer einen Gedanken.

   Gerechnet wird IM TEST, nicht in der App: eine Pruefung, die die App
   fragt, ob die App recht hat, prueft nichts. */
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

const UMWEG = 1.5;
const luft = (a, b) => {
  const Rk = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Rk * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const wegKm = (a, b) => luft(a.geo, b.geo) * UMWEG;
const wegMin = (kmv) => Math.round(kmv / 4.5 * 60);
const basis = DATEN.meta.base_geo;

const browser = ohneStartkarten(await chromium.launch());
const ctx = await browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
const heute = await p.evaluate(() => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
});

/* --- 1. Ohne Tagesplan gibt es keinen Umweg ------------------------------ */
/* Ohne Kette gibt es nichts, wohinein man einfuegen koennte. Dann steht dort
   nichts -- keine Null, keine erfundene Zahl. */
await p.evaluate(() => {
  localStorage.setItem('pk.saved', '[]');
  localStorage.setItem('pk.days', '{}');
  localStorage.setItem('pk.seen', '[]');
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.waitForTimeout(500);
/* Den Abschnitt ausdruecklich waehlen. Laeuft die Suite nachts, zeigt "Jetzt"
   von sich aus "Für morgen früh" -- und fuer morgen gibt es keinen Umweg,
   weil morgen eine andere Kette hat. Das ist richtig so und waere hier nur
   eine Pruefung, die von der Uhrzeit des Laufs abhaengt. */
const abschnitt = async () => {
  /* Einen Abschnitt waehlen, der NICHT ohnehin gerade dran ist: die Wahl
     schlaegt die Uhr nur, wenn sie von ihr abweicht (S.mid !== mn.m.id).
     Sonst bliebe nachts "Für morgen früh" stehen. */
  const andere = await p.evaluate(() => [...document.querySelectorAll('[data-mid]')]
    .filter((e) => e.getAttribute('aria-pressed') !== 'true')
    .map((e) => e.getAttribute('data-mid')));
  await p.locator(`[data-mid="${andere[0]}"]`).click();
  await p.waitForTimeout(450);
};
await abschnitt();
ok('ohne Tagesplan steht kein Umweg am Vorschlag',
  await p.locator('.today__umweg').count(), 0);
ok('… und der zweite Knopf ist "Merken"',
  /Merken|Gemerkt/.test(await p.locator('.today__acts').textContent()));

/* --- 2. Mit Tagesplan steht der Umweg da --------------------------------- */
const drei = DATEN.places.filter((x) => x.geo && luft(basis, x.geo) < 2).slice(0, 3);
ok('drei nahe Orte in den Daten', drei.length, 3);
await p.evaluate(([ids, h]) => {
  localStorage.setItem('pk.saved', JSON.stringify(ids));
  const d = {};
  ids.forEach((id) => { d[id] = h; });
  localStorage.setItem('pk.days', JSON.stringify(d));
}, [drei.map((x) => x.id), heute]);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.waitForTimeout(500);
await abschnitt();

ok('mit Tagesplan steht der Umweg am Vorschlag',
  await p.locator('.today__umweg').count(), 1);
const zeile = (await p.locator('.today__umweg').textContent()).trim();
ok('… als geschaetzt gekennzeichnet', /^≈ /.test(zeile));
ok('… mit der Stelle, an die er kaeme', /käme (nach |als Erstes)/.test(zeile));

/* Die Zahl gegengerechnet: guenstigste Einfuegestelle in die Kette
   Zeltplatz → Station 1 → … → Zeltplatz. */
const vorschlagId = await p.evaluate(() =>
  document.querySelector('.today__acts [data-open]').getAttribute('data-open'));
const kandidat = DATEN.places.filter((x) => x.id === vorschlagId)[0];
ok('der Vorschlag ist ein Ort aus den Daten', !!kandidat);
{
  const kette = [{ geo: basis }].concat(drei, [{ geo: basis }]);
  let best = Infinity;
  for (let i = 0; i < kette.length - 1; i++) {
    const mehr = wegKm(kette[i], kandidat) + wegKm(kandidat, kette[i + 1])
      - wegKm(kette[i], kette[i + 1]);
    if (mehr < best) best = mehr;
  }
  const sollMin = wegMin(best);
  const istMin = (() => {
    const t = zeile;
    const h = /([\d,]+)\s*h/.exec(t), m = /(\d+)\s*Min/.exec(t);
    return (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
  })();
  /* Auf zehn Minuten genau: die Anzeige rundet auf "1,5 h", die Rechnung nicht. */
  ok('… und der Umweg ist die guenstigste Einfuegestelle',
    Math.abs(istMin - sollMin) <= 10, true);
}

/* --- 3. "In den Tag" legt ihn an genau diese Stelle ---------------------- */
ok('statt "Merken" steht dort "In den Tag"',
  await p.locator('[data-einfuegen]').count(), 1);
await p.locator('[data-einfuegen]').click();
await p.waitForTimeout(500);
ok('der Ort steht danach im heutigen Plan', await p.evaluate(([id, h]) =>
  JSON.parse(localStorage.getItem('pk.days') || '{}')[id] === h,
  [vorschlagId, heute]), true);
ok('… und in der Merkliste', await p.evaluate((id) =>
  JSON.parse(localStorage.getItem('pk.saved') || '[]').indexOf(id) >= 0,
  vorschlagId), true);
ok('… der Tagesplan hat jetzt vier Stationen',
  await p.locator('.planheut__row').count(), 4);

/* Steht er schon drin, gibt es nichts mehr einzufuegen -- und das sagt die
   Zeile, statt einen Knopf ohne Wirkung anzubieten. */
await p.evaluate(() => { window.scrollTo(0, 0); });
const nochmal = await p.locator('.today__umweg--drin').count();
const weiterhin = await p.locator('[data-einfuegen]').count();
ok('ein Ort, der schon im Tag steht, wird nicht zweimal angeboten',
  nochmal === 1 || weiterhin === 1, true);

/* --- 4. Die Suche im Tages-Sheet geht ueber alle Orte -------------------- */
/* Einen Ort ohne Tag dazulegen, damit der Vorrat nicht leer ist: sonst
   prueft der naechste Schritt nur den Leerzustand. */
const imVorrat = DATEN.places.filter((x) => drei.indexOf(x) < 0 && x.id !== vorschlagId)[0];
await p.evaluate((id) => {
  const s2 = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  if (s2.indexOf(id) < 0) s2.push(id);
  localStorage.setItem('pk.saved', JSON.stringify(s2));
}, imVorrat.id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.locator('.tab[data-tab="gemerkt"]').click();
await p.waitForTimeout(450);
await p.locator('.tagk:not(.tagk--frei)').first().click();
await p.waitForTimeout(600);
ok('das Tages-Sheet hat ein Suchfeld', await p.locator('#tagsuche').count(), 1);
ok('… und es nennt die Zahl aller Orte',
  new RegExp('Alle ' + DATEN.places.length + ' Orte')
    .test(await p.locator('#tagsuche').getAttribute('placeholder')), true);
ok('ohne Begriff steht der Vorrat da',
  /Aus deinem Vorrat/.test(await p.locator('#tagtreffer').textContent()));

/* Ein Begriff, der in den Daten wirklich vorkommt -- gesucht wird nicht nach
   einem geratenen Wort. */
const begriff = 'markt';
const sollTreffer = DATEN.places.filter((x) => {
  const heu = [x.name, x.address, x.note, (x.tags || []).join(' ')].join(' · ')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  return heu.indexOf(begriff) >= 0;
});
ok('der Begriff kommt in den Daten vor', sollTreffer.length > 0, true);

await p.locator('#tagsuche').fill(begriff);
await p.waitForTimeout(400);
ok('die Suche ersetzt den Vorrat',
  /Gefunden/.test(await p.locator('#tagtreffer').textContent()));
/* Was an dem Tag schon steht, taucht nicht als Treffer auf -- man kann es
   nicht ein zweites Mal hinlegen. */
const schonDrin = await p.evaluate(() =>
  [...document.querySelectorAll('.tagk:not(.tagk--frei) .tagk__n')].map((e) => e.textContent));
const erwartet = sollTreffer.filter((x) => schonDrin.indexOf(x.name) < 0).length;
ok('… und zeigt alle Treffer ausser denen, die schon an dem Tag stehen',
  await p.locator('#tagtreffer .tagsheet__row').count(), erwartet);
/* Der Fokus bleibt im Feld: beim Tippen wird nur die Trefferliste neu
   gebaut, nicht das Sheet. Ein neu gezeichnetes Sheet verloere die
   Schreibmarke mitten im Wort. */
ok('der Fokus bleibt beim Tippen im Feld',
  await p.evaluate(() => document.activeElement && document.activeElement.id), 'tagsuche');

/* Ein Treffer, der noch nicht gemerkt ist, sagt das -- der Knopf daneben tut
   beides auf einmal. */
const ungemerkt = await p.locator('#tagtreffer .tagsheet__neu').count();
ok('ungemerkte Treffer sind als solche ausgewiesen', ungemerkt > 0, true);

const erster = await p.evaluate(() =>
  document.querySelector('#tagtreffer [data-dayset]').getAttribute('data-dayset'));
await p.locator('#tagtreffer [data-dayset]').first().click();
await p.waitForTimeout(500);
ok('ein Treffer laesst sich in einem Schritt auf den Tag legen',
  await p.evaluate(([id, h]) =>
    JSON.parse(localStorage.getItem('pk.days') || '{}')[id] === h, [erster, heute]), true);
ok('… und landet dabei in der Merkliste', await p.evaluate((id) =>
  JSON.parse(localStorage.getItem('pk.saved') || '[]').indexOf(id) >= 0, erster), true);

/* Nichts gefunden sagt, wonach gesucht wurde. */
await p.locator('#tagsuche').fill('xyzzyqq');
await p.waitForTimeout(400);
ok('ohne Treffer sagt das Sheet, wonach gesucht wurde',
  /Nichts gefunden für „xyzzyqq“/.test(await p.locator('#tagtreffer').textContent()));

/* Der Begriff gilt diesem Besuch, nicht dem naechsten. */
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
await p.locator('.tagk:not(.tagk--frei)').first().click();
await p.waitForTimeout(600);
ok('beim naechsten Oeffnen ist das Feld wieder leer',
  await p.locator('#tagsuche').inputValue(), '');

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
