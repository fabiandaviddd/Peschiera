/* Das Wissen ist durchsuchbar, gruppiert, und der Notruf steht oben.

   Bis v37 lagen "Gut zu wissen" (17), "Offene Punkte" (18) und der
   Faktencheck (13) als drei Arrays IN places.json -- einer Datei, die sonst
   nur Orte enthaelt. Drei Folgen, und diese Suite sichert alle drei
   Abhilfen ab:

     1. Die Suche fand das Wissen nie. Sie geht ueber Orte, und das Wissen
        war keiner. "Darf Jum in den Zug?" liess sich nicht suchen, obwohl
        die Antwort in der App steht.
     2. Achtundvierzig Eintraege standen ohne Gruppe untereinander -- der
        NOTRUF als neunter, zwischen "Badeschuhe" und "Coperto & Trinkgeld".
     3. Wer in "Entdecken" sucht, erfaehrt nichts davon, dass es im Wissen
        einen Treffer gibt. Dafuer gibt es seit v38 die Bruecke.

   Dazu: die eigene Notiz ist seit v38 mitdurchsucht. Wer "Wassernapf kommt
   von selbst" notiert hat, fand den Ort ueber "wassernapf" bis dahin nicht
   -- obwohl genau das der Satz ist, an den man sich erinnert. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const require2 = createRequire(import.meta.url);
const { chromium } = require2(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const WISSEN = require2('../../data/wissen.json');
const PLACES = require2('../../data/places.json');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};

/* Dieselbe Normalisierung wie norm() in app.js -- hier von Hand, damit die
   Suite nicht die App fragt, ob die App recht hat. */
const norm = (s) => String(s == null ? '' : s).toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const such = (e) => norm([e.titel || '', e.text || '', e.tel || ''].join(' · '));
const treffer = (q) => {
  const teile = norm(q).split(/\s+/).filter(Boolean);
  return WISSEN.eintraege.filter((e) => teile.every((t) => such(e).indexOf(t) >= 0));
};

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/?v=info', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.waitForSelector('#wq');

/* --- 1. Das Wissen liegt in einer eigenen Datei -------------------------- */
ok('places.json trägt kein Wissen mehr', await p.evaluate(async () => {
  const d = await (await fetch('./data/places.json')).json();
  return ['merken', 'open_questions', 'faktencheck'].filter((k) => k in d);
}), []);
ok('wissen.json ist erreichbar und hat Einträge', await p.evaluate(async () => {
  const w = await (await fetch('./data/wissen.json')).json();
  return w.eintraege.length;
}), WISSEN.eintraege.length);

/* --- 2. Der Notfall steht oben, vor dem Suchfeld ------------------------- */
/* Eine Nummer, die man im Ernstfall erst freisuchen muss, ist keine
   Notfallnummer. */
ok('der Notfall steht als eigener Block da', await p.locator('.wissen__pin').count(), 1);
ok('… mit der 112', /112/.test(await p.locator('.wissen__pin').textContent()));
ok('… und VOR dem Suchfeld', await p.evaluate(() => {
  const pin = document.querySelector('.wissen__pin').getBoundingClientRect();
  const feld = document.querySelector('#wq').getBoundingClientRect();
  return pin.top < feld.top;
}));

/* --- 3. Gruppen mit Kopf und Zahl ---------------------------------------- */
/* Die Zahlen kommen aus der Datei, nicht aus der App. */
for (const g of WISSEN.gruppen) {
  const soll = WISSEN.eintraege.filter((e) => e.gruppe === g.id).length;
  if (!soll || g.pin) continue;
  const kopf = await p.evaluate((titel) => {
    const h = [...document.querySelectorAll('#info .section__h')]
      .find((e) => e.childNodes[0] && e.childNodes[0].textContent.trim() === titel);
    return h ? (h.querySelector('.section__n') || {}).textContent : null;
  }, g.titel);
  ok(`Gruppe „${g.titel}" steht da und zählt richtig`, kopf, String(soll));
}

/* Jeder Eintrag steht genau einmal. Doppelte kaemen von einer Gruppe, die
   sowohl gepinnt als auch normal gerendert wird. */
ok('jeder Eintrag steht genau einmal',
  await p.locator('#info .panel--w').count(), WISSEN.eintraege.length);

/* --- 4. Die Art steht am Eintrag ----------------------------------------- */
/* Bis v37 unterschied nur die Sektion, in der der Eintrag stand -- wer ihn
   ueber eine Suche findet, sieht die Sektion nicht. */
ok('offene Punkte sind als solche ausgewiesen',
  await p.locator('#info .wissen__art--offen').count(),
  WISSEN.eintraege.filter((e) => e.art === 'offen').length);
ok('Korrekturen auch',
  await p.locator('#info .wissen__art--korrektur').count(),
  WISSEN.eintraege.filter((e) => e.art === 'korrektur').length);
ok('Telefonnummern sind Links',
  (await p.locator('#info a[href^="tel:"]').count()) > 0, true);

/* --- 5. Die Suche über alle Einträge ------------------------------------- */
const begriff = 'hund';
ok('der Begriff kommt im Wissen vor', treffer(begriff).length > 0, true);
await p.locator('#wq').fill(begriff);
await p.waitForTimeout(400);
ok('die Suche zählt ihre Treffer',
  /^\d+ Treffer/.exec((await p.locator('.wissen__n').textContent()).trim())[0],
  treffer(begriff).length + ' Treffer');
ok('… und zeigt genau so viele', await p.locator('#info .panel--w').count(),
  /* Der gepinnte Notfall steht zusaetzlich oben -- er zaehlt einmal in der
     Suche und einmal als Pin, wenn er passt. */
  treffer(begriff).length + await p.locator('.wissen__pin .panel--w').count());
ok('der Notfall bleibt auch während der Suche stehen',
  await p.locator('.wissen__pin').count(), 1);
ok('der Fokus bleibt beim Tippen im Feld',
  await p.evaluate(() => document.activeElement && document.activeElement.id), 'wq');

await p.locator('#wq').fill('xyzzyqq');
await p.waitForTimeout(400);
ok('ohne Treffer sagt die Ansicht das',
  /Nichts gefunden/.test(await p.locator('#info').textContent()));
ok('… und der Notfall steht trotzdem noch da',
  await p.locator('.wissen__pin').count(), 1);

await p.locator('#wq-clear').click();
await p.waitForTimeout(400);
ok('Zurücksetzen leert das Feld', await p.locator('#wq').inputValue(), '');
ok('… und zeigt wieder alles',
  await p.locator('#info .panel--w').count(), WISSEN.eintraege.length);

/* --- 6. Die Brücke von der Ortssuche ins Wissen -------------------------- */
await p.locator('.tab[data-tab="orte"]').click();
await p.waitForTimeout(450);
ok('ohne Suchbegriff steht keine Brücke da', await p.locator('#wissbr').isVisible(), false);

const b2 = 'zug';
const sollW = treffer(b2).length;
ok('der Begriff hat Treffer im Wissen', sollW > 0, true);
await p.locator('#q').fill(b2);
await p.waitForTimeout(500);
ok('mit Treffern im Wissen erscheint die Brücke', await p.locator('#wissbr').isVisible());
ok('… und nennt ihre Zahl',
  new RegExp('^' + sollW + ' Ein').test((await p.locator('.wissbr__t').textContent()).trim()));
ok('… und den Begriff', new RegExp('„' + b2 + '“')
  .test(await p.locator('.wissbr__t').textContent()));

await p.locator('#wissbr-go').click();
await p.waitForTimeout(600);
ok('sie führt ins Wissen',
  await p.locator('.tab[aria-current="page"]').getAttribute('data-tab'), 'info');
/* Den Begriff dort noch einmal eintippen zu muessen waere genau der Bruch,
   den die Bruecke schliessen soll. */
ok('… und nimmt den Begriff mit', await p.locator('#wq').inputValue(), b2);
ok('… und zeigt dort dieselbe Zahl',
  /^\d+ Treffer/.exec((await p.locator('.wissen__n').textContent()).trim())[0],
  sollW + ' Treffer');

/* Ein Begriff ohne Treffer im Wissen bringt keine Bruecke -- eine Leiste,
   die immer dasteht, ist Tapete. */
await p.locator('.tab[data-tab="orte"]').click();
await p.waitForTimeout(450);
const ohne = PLACES.places[0].name.split(' ')[0].toLowerCase();
await p.locator('#q').fill('qqzzxx');
await p.waitForTimeout(500);
ok('ohne Treffer im Wissen keine Brücke', await p.locator('#wissbr').isVisible(), false);
void ohne;

/* --- 7. Die eigene Notiz wird mitdurchsucht ------------------------------ */
const ziel = PLACES.places[0];
await p.evaluate((id) => {
  localStorage.setItem('pk.notes', JSON.stringify({ [id]: 'Wassernapf kommt von selbst' }));
}, ziel.id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.locator('.tab[data-tab="orte"]').click();
await p.waitForTimeout(450);
await p.locator('#q').fill('wassernapf');
await p.waitForTimeout(500);
ok('ein Wort aus der eigenen Notiz findet den Ort',
  await p.locator('.card').count(), 1);
ok('… und zwar genau den', await p.evaluate(() =>
  document.querySelector('.card [data-open]').getAttribute('data-open')), ziel.id);

/* Wird die Notiz geloescht, faellt der Treffer weg -- sonst haengt der
   Suchindex der Wirklichkeit hinterher. */
await p.evaluate(() => { localStorage.setItem('pk.notes', '{}'); });
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.locator('.tab[data-tab="orte"]').click();
await p.waitForTimeout(450);
await p.locator('#q').fill('wassernapf');
await p.waitForTimeout(500);
ok('ohne die Notiz findet dasselbe Wort nichts',
  await p.locator('.card').count(), 0);

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
