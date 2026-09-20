/* Die Hundregel: vier Zustaende, und ihr koennt sie berichtigen.

   Bis v33 filterte der Schalter auf dog === true und nahm damit 62 von 101
   Orten aus der Ansicht -- obwohl nur 4 davon ein ausdrueckliches "ohne Jum"
   tragen. Die uebrigen 58 sind ungeklaert, und eine Datenluecke ist keine
   Absage. Am Regenvormittag traf es sogar 7 von 7.

   Diese Suite sichert beide Haelften der Umstellung ab:
     1. der Schalter blendet nichts mehr aus, sondern zaehlt und beschriftet
     2. was ihr vor Ort erfahrt, ueberschreibt den Katalog -- dauerhaft,
        umkehrbar, und es faehrt beim Teilen mit

   Ohne sie koennte jemand den Filter zurueckholen, und keine andere Pruefung
   wuerde es merken: die Liste waere ja weiterhin vollstaendig sortiert. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const DATEN = createRequire(import.meta.url)('../../data/places.json');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};

const ALLE  = DATEN.places.length;
const JA    = DATEN.places.filter((p) => p.dog === true).length;
const NEIN  = DATEN.places.filter((p) => p.dog === false).length;
const OFFEN = ALLE - JA - NEIN;
/* Ein Ort mit offener Regel und Telefonnummer -- dort steht auch "Anrufen". */
const OFFENER = DATEN.places.find((p) => (p.dog === null || p.dog === undefined) && p.phone);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});
const page = await ctx.newPage();
const errs = []; page.on('pageerror', (e) => errs.push(e.message));

await page.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');

const zeilen = () => page.locator('.card').count();
const zeile  = (id) => page.locator(`.card:has([data-open="${id}"])`);
const zaehlzeile = () => page.locator('#count').textContent();

/* --- 1. Der Schalter blendet nichts mehr aus ------------------------------ */
ok('ohne Jum stehen alle Orte da', await zeilen(), ALLE);
await page.click('#jum-btn');
await page.waitForTimeout(500);
ok('mit Jum stehen immer noch alle da', await zeilen(), ALLE);
ok('… der Schalter ist wirklich an',
   await page.locator('#jum-btn').getAttribute('aria-checked'), 'true');

const z = await zaehlzeile();
ok('die Zaehlzeile nennt die sicheren', new RegExp(`${JA} sicher`).test(z));
ok('… die ungeklaerten', new RegExp(`${OFFEN} ungeklärt`).test(z));
ok('… und die ausdruecklich ohne Jum', new RegExp(`${NEIN} ohne Jum`).test(z));
ok('… und nichts von "ausgeblendet"', /ausgeblendet/.test(z), false);

/* --- 2. Jede Zeile traegt ihre Marke -------------------------------------- */
const marken = await page.evaluate(() => {
  const n = (k) => document.querySelectorAll('.card ' + k).length;
  return { ok: n('.fact--dog'), offen: n('.fact--dogopen'), nein: n('.fact--nodog') };
});
ok('jede gezeigte Zeile traegt eine Hundmarke',
   marken.ok + marken.offen + marken.nein, ALLE);
ok('… und die offenen sind als offen beschriftet', marken.offen, OFFEN);

/* Das ausdrueckliche Nein sinkt ans Ende -- ungeklaertes NICHT: in der Liste
   sucht man, und 58 Orte nach hinten waere eine Absage. */
const letzte = await page.evaluate((n) => {
  const k = [...document.querySelectorAll('.card')].slice(-n);
  return k.every((c) => c.querySelector('.fact--nodog'));
}, NEIN);
ok('das ausdrueckliche "ohne Jum" steht ganz hinten', letzte);

/* --- 3. Vor Ort klaeren --------------------------------------------------- */
ok('es gibt einen offenen Ort mit Telefonnummer', !!OFFENER);
await page.locator(`[data-open="${OFFENER.id}"]`).click();
await page.waitForTimeout(600);
ok('das Sheet ist offen', await page.locator('#sheet').isVisible());
ok('… und nennt die Regel als ungeklaert',
   await page.locator('.dogrow--unknown').count(), 1);
ok('… und fragt nach', await page.locator('.dogask__q').count(), 1);
ok('… mit einem Weg zum Anruf',
   await page.locator('.dogask a[href^="tel:"]').count(), 1);

await page.locator(`[data-dogset="${OFFENER.id}"][data-dogval="1"]`).click();
await page.waitForTimeout(500);
ok('nach dem Tippen steht eure Angabe da',
   await page.locator('.dogrow--you').count(), 1);
ok('… mit Datum', /notiert am \d\d\.\d\d\./.test(
   await page.locator('.dogrow--you .dogrow__x').first().textContent()));
ok('… und die Frage ist weg', await page.locator('.dogask__q').count(), 0);
ok('… gespeichert unter pk.dog', await page.evaluate((id) => {
  const d = JSON.parse(localStorage.getItem('pk.dog') || '{}');
  return !!(d[id] && d[id].v === true && d[id].at);
}, OFFENER.id));

await page.keyboard.press('Escape');
await page.waitForTimeout(600);
ok('die Liste zieht beim Schliessen nach',
   await zeile(OFFENER.id).locator('.fact--dog').count(), 1);
ok('… und die Zaehlzeile auch',
   new RegExp(`${JA + 1} sicher`).test(await zaehlzeile()));

/* --- 4. Es ueberlebt den Neustart ---------------------------------------- */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
await page.waitForTimeout(400);
ok('nach dem Neuladen gilt eure Angabe weiter',
   await zeile(OFFENER.id).locator('.fact--dog').count(), 1);

/* --- 5. Zuruecknehmen ----------------------------------------------------- */
await page.locator(`[data-open="${OFFENER.id}"]`).click();
await page.waitForTimeout(600);
await page.locator(`[data-dogset="${OFFENER.id}"][data-dogval=""]`).click();
await page.waitForTimeout(500);
ok('zuruecknehmen stellt den Katalog wieder her',
   await page.locator('.dogrow--unknown').count(), 1);
ok('… und raeumt den Speicher', await page.evaluate((id) =>
  !(JSON.parse(localStorage.getItem('pk.dog') || '{}')[id]), OFFENER.id));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

/* --- 6. Der Tag-Waehler steht an jedem Ort -------------------------------- */
/* Bis v33 war setDay() nur ueber die Merkliste erreichbar: der Stern war ein
   Tor, kein Merkmal. Sechs Tipps und ein Reiterwechsel, um einen gefundenen
   Ort auf den Mittwoch zu legen. */
const irgendeiner = DATEN.places.find((p) => p.id !== OFFENER.id);
await page.locator(`[data-open="${irgendeiner.id}"]`).click();
await page.waitForTimeout(600);
ok('jedes Ortssheet hat einen Tag-Waehler',
   await page.locator('#sheet [data-day]').count(), 1);
ok('… auch bei einem Ort, der nicht gemerkt ist', await page.evaluate(() =>
  (JSON.parse(localStorage.getItem('pk.saved') || '[]')).length), 0);

const ersterTag = await page.evaluate(() =>
  [...document.querySelectorAll('#sheet-day option')]
    .filter((o) => o.value && !o.disabled)[0].value);
await page.selectOption('#sheet-day', ersterTag);
await page.waitForTimeout(500);
ok('einen Tag zu waehlen plant den Ort ein', await page.evaluate((id) =>
  JSON.parse(localStorage.getItem('pk.days') || '{}')[id], irgendeiner.id), ersterTag);
ok('… und merkt ihn damit auch', await page.evaluate((id) =>
  JSON.parse(localStorage.getItem('pk.saved') || '[]').indexOf(id) >= 0, irgendeiner.id));
ok('… ohne dass das Sheet zugeht', await page.locator('#sheet').isVisible());

await page.keyboard.press('Escape');
await page.waitForTimeout(600);
ok('die Zeile zeigt den Tag',
   await zeile(irgendeiner.id).locator('.fact--day').count(), 1);

/* --- 7. Vergangene Reisetage nehmen nichts mehr auf ----------------------- */
/* Bis v33 trugen sie im Reiseraster ein "+" und standen im Waehler wie jeder
   andere Tag. Am 20.09. waren das sechs von fuenfzehn, am letzten Reisetag
   vierzehn -- ein Angebot, das nichts mehr bewirken kann. Ein bereits
   zugeordneter vergangener Tag bleibt waehlbar: sonst verloere ein Ort beim
   naechsten Neuzeichnen still seine Zuordnung. */
await page.locator(`[data-open="${OFFENER.id}"]`).click();
await page.waitForTimeout(600);
const tage = await page.evaluate(() => {
  const heute = new Date().toISOString().slice(0, 10);
  const o = [...document.querySelectorAll('#sheet-day option')].filter((x) => x.value);
  return {
    gesamt: o.length,
    vorbei: o.filter((x) => x.value < heute).length,
    vorbeiGesperrt: o.filter((x) => x.value < heute && x.disabled).length,
    kuenftigGesperrt: o.filter((x) => x.value >= heute && x.disabled).length,
    beschriftet: o.filter((x) => x.value < heute && / · vorbei$/.test(x.textContent)).length
  };
});
ok('der Waehler kennt alle fuenfzehn Reisetage', tage.gesamt, 15);
ok('vergangene Tage sind gesperrt', tage.vorbeiGesperrt, tage.vorbei);
ok('… und als vorbei beschriftet', tage.beschriftet, tage.vorbei);
ok('kuenftige Tage bleiben waehlbar', tage.kuenftigGesperrt, 0);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);

ok('keine Skriptfehler', errs, []);

await browser.close();
/* Genau das Format, das run.mjs liest: FAIL-Zeilen am Zeilenanfang und eine
   Schlusszeile "<n>/<m> passed". Eine Suite ohne lesbare Schlusszeile zaehlt
   dort als Fehler -- und das zu Recht. */
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
