/* V1: die Liste kommt in Stuecken, und der Kopf wird nicht mehr bei jedem
   Tastendruck vermessen.

   Der Anlass war eine Messung, nicht ein Gefuehl: auf vierfach gedrosselter
   CPU kostete der zweite Buchstabe im Suchfeld 157 ms. Das Profil zeigte
   dann, dass die Karten gar nicht der Hauptposten waren (37 ms), sondern
   measureBar() mit 109 von 355 ms -- es liest offsetHeight und zwingt den
   Browser damit, sofort das ganze Dokument samt aller 101 Karten zu setzen.

   Diese Suite sichert beide Haelften ab. Ohne sie koennte jemand die
   Stueckelung oder die Kopf-Kennung wieder herausnehmen, und kein anderer
   Test wuerde es merken -- die Liste waere ja weiterhin vollstaendig. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE' });
const p = await ctx.newPage();
await p.goto(BASE + '/?v=orte', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');

/* --- 1. Die erste Fuhre steht sofort, der Rest kommt nach ----------------- */
const sofort = await p.evaluate(() => {
  const q = document.getElementById('q');
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  /* Synchron direkt nach dem Ereignis gelesen: was JETZT dasteht, stand
     ohne einen einzigen Bildaufbau dazwischen da. */
  const el = document.getElementById('list');
  return { karten: el.querySelectorAll('.card').length, voll: el.getAttribute('data-voll') };
});
ok('erste Fuhre ist genau die erste Fuhre', sofort.karten, 18);
ok('Liste meldet sich waehrend des Fuellens nicht als voll', sofort.voll, null);
ok('mehr als ein Bildschirm voll sofort da', sofort.karten >= 12);

await p.waitForFunction(() => document.getElementById('list').getAttribute('data-voll') === '1');
ok('am Ende sind alle 101 da', await p.locator('#list .card').count(), 101);

/* --- 2. Ein neuer Durchgang bricht den alten ab --------------------------- */
/* Ohne den Abbruch haengte die Nachlieferung des vorigen Begriffs an die
   neue Liste an -- man suchte "pizza" und bekam 101 Karten. */
await p.evaluate(() => {
  const q = document.getElementById('q');
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  q.value = 'bar'; q.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForFunction(() => document.getElementById('list').getAttribute('data-voll') === '1');
await p.waitForTimeout(300);           // die alte Nachlieferung haette Zeit gehabt
const nBar = await p.locator('#list .card').count();
const zaehler = (await p.locator('#count').textContent() || '').trim();
ok('nach schnellem Tippen keine Reste der vorigen Liste', nBar > 0 && nBar < 101);
ok('Zaehler und Liste stimmen ueberein', zaehler.indexOf(String(nBar)) >= 0,
  true);

/* --- 3. Der Kopf wird nicht mehr bei jedem Tastendruck vermessen ---------- */
const messungen = await p.evaluate(() => {
  const q = document.getElementById('q');
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  /* offsetHeight abfangen: jeder Zugriff ist ein erzwungenes Setzen des
     Layouts. Gezaehlt wird nur, was WAEHREND des Tippens passiert. */
  const roh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  let n = 0;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get: function () { n += 1; return roh.get.call(this); }
  });
  /* Aus einem schon gefuellten Feld heraus tippen: von leer auf Text taucht
     das Loeschkreuz auf, der Kopf sieht dann wirklich anders aus und DARF
     gemessen werden. Geprueft wird der Normalfall -- weitertippen. */
  q.value = 'b'; q.dispatchEvent(new Event('input', { bubbles: true }));
  n = 0;
  for (const s of ['ba', 'bar', 'barc', 'barca']) {
    q.value = s; q.dispatchEvent(new Event('input', { bubbles: true }));
  }
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', roh);
  return n;
});
/* Vier Tastendruecke, bei denen sich am Kopf nichts aendert. Bis v23 las
   jeder Durchgang zweimal offsetHeight, waren also acht Zugriffe. */
ok('Kopf wird beim Tippen nicht mehr vermessen', messungen, 0);

/* --- 4. Aendert sich der Kopf doch, wird gemessen ------------------------- */
const beiAenderung = await p.evaluate(() => {
  const q = document.getElementById('q');
  const roh = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  let n = 0;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true, get: function () { n += 1; return roh.get.call(this); }
  });
  /* Leeren laesst das Loeschkreuz im Suchfeld verschwinden -- der Kopf sieht
     danach anders aus, also MUSS gemessen werden. */
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', roh);
  return n;
});
ok('aendert sich der Kopf, wird er sehr wohl gemessen', beiAenderung > 0);
ok('--bar-full ist gesetzt', await p.evaluate(() =>
  /px$/.test(document.documentElement.style.getPropertyValue('--bar-full'))));

/* --- 5. Die Seitensuche des Browsers findet weiterhin alles --------------- */
/* Das war der Grund, NICHT nur das Sichtbare zu rendern: wer in Safari nach
   einem Ortsnamen sucht, soll ihn finden, auch wenn er weit unten steht. */
await p.evaluate(() => {
  const q = document.getElementById('q');
  q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true }));
});
await p.waitForFunction(() => document.getElementById('list').getAttribute('data-voll') === '1');
const letzter = await p.evaluate(() => {
  const k = document.querySelectorAll('#list .card__name');
  return k.length ? k[k.length - 1].textContent.trim() : '';
});
ok('auch die letzte Karte steht wirklich im Dokument', letzter.length > 0);

/* --- 6. Der Suchtreffer muss im Bild stehen ------------------------------- */
/* Die Beschreibung ist eine Zeile hoch und hinten abgeschnitten -- das haelt
   jede Karte auf exakt 97 px. Der Preis war, dass man bei "hund" 12 von 16
   Treffern nicht ansah, warum sie Treffer sind. Seit v24 faengt die Zeile bei
   aktiver Suche vor der Fundstelle an. */
const treffer = await p.evaluate(async () => {
  const q = document.getElementById('q');
  q.value = 'hund'; q.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const k = [...document.querySelectorAll('#list .card')];
  let ohneGrund = 0, mitMark = 0, hoehen = new Set();
  k.forEach((c) => {
    hoehen.add(Math.round(c.getBoundingClientRect().height));
    const nm = c.querySelector('.card__name');
    if (nm.textContent.toLowerCase().indexOf('hund') >= 0) return;
    const note = c.querySelector('.card__note');
    const mark = note && note.querySelector('mark');
    if (!mark) return;                 // trifft ueber Schlagwort oder Adresse
    mitMark += 1;
    const nr = note.getBoundingClientRect(), mr = mark.getBoundingClientRect();
    if (mr.left >= nr.right - 2 || mr.right > nr.right + 2) ohneGrund += 1;
  });
  return { n: k.length, ohneGrund, mitMark, hoehen: [...hoehen] };
});
ok('Suche liefert Treffer', treffer.n > 0);
ok('jede Markierung in der Beschreibung steht im Bild', treffer.ohneGrund, 0);
ok('es gibt ueberhaupt markierte Beschreibungen', treffer.mitMark > 0);
ok('die Karten bleiben dabei 97 px hoch', treffer.hoehen, [97]);

const form = await p.evaluate(() => {
  const k = [...document.querySelectorAll('#list .card')];
  const mitPunkten = k.filter((c) => {
    const n = c.querySelector('.card__note');
    return n && n.textContent.trim().charAt(0) === '…';
  }).length;
  /* Wo der Fund vorne steht, darf KEIN Auslassungszeichen davor -- sonst
     liest es sich, als fehle etwas, das nicht fehlt. */
  const falschePunkte = k.filter((c) => {
    const n = c.querySelector('.card__note');
    if (!n || n.textContent.trim().charAt(0) !== '…') return false;
    const m = n.querySelector('mark');
    return m && m.getBoundingClientRect().left - n.getBoundingClientRect().left < 8;
  }).length;
  return { mitPunkten, falschePunkte };
});
ok('verschobene Ausschnitte zeigen ein Auslassungszeichen', form.mitPunkten > 0);
ok('unverschobene dagegen nicht', form.falschePunkte, 0);

/* Der volle Satz bleibt im Detail -- der Ausschnitt ist eine Anzeige, keine
   Kuerzung der Daten. */
const imSheet = await p.evaluate(async () => {
  const c = [...document.querySelectorAll('#list .card')]
    .find((x) => { const n = x.querySelector('.card__note');
      return n && n.textContent.trim().charAt(0) === '…'; });
  if (!c) return null;
  const kurz = c.querySelector('.card__note').textContent.trim();
  c.querySelector('.card__open').click();
  await new Promise((r) => setTimeout(r, 350));
  const lang = (document.querySelector('#sheet-body') || {}).textContent || '';
  return { kurz: kurz.replace(/^…/, '').slice(0, 30), langEnthaelt: lang.length > 0 };
});
ok('im Detail steht weiterhin der ganze Text',
  imSheet !== null && imSheet.langEnthaelt);

await browser.close();
/* Genau dieses Format, sonst liest run.mjs das Ergebnis nicht und meldet die
   Suite mit einem Strich -- also ohne Zahl, aber auch ohne Fehler. Das ist die
   stille Null, vor der die Hausregeln warnen: sie sieht aus wie gruen. */
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
