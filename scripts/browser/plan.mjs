/* Der Plan kann seit v28 Tage: jeder gemerkte Ort laesst sich einem
   Reisetag zuordnen, die Ansicht gruppiert danach und rechnet je Tag die
   eingeplante Zeit zusammen.

   Bis v27 konnte der Plan nur eine Reihenfolge. Fuer vierzehn Tage Reise ist
   eine einzige lange Liste kein Plan, sondern ein Stapel -- das Urteil kam
   vom Besitzer und stimmte.

   Geprueft wird der ganze Weg: zuordnen, gruppieren, rechnen, neu laden,
   innerhalb der Gruppe verschieben, teilen samt Tagen, zusammenfuehren ohne
   die eigene Planung zu verlieren, und ein alter Link ohne Tage. */
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
const mach = () => browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});

const zumPlan = async (p) => {
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(400);
};

/* Orte mit time_min direkt aus den Daten holen. IDs zu raten hiesse, dass die
   Suite mit dem naechsten Datenstand luegt statt fehlzuschlagen. */
const ctx = await mach();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
const orte = await p.evaluate(async () => {
  const d = await (await fetch('./data/places.json')).json();
  return d.places.filter((x) => x.time_min).slice(0, 5)
    .map((x) => ({ id: x.id, min: x.time_min }));
});
ok('fuenf Orte mit Aufenthaltsdauer in den Daten', orte.length, 5);

await p.evaluate((ids) => localStorage.setItem('pk.saved', JSON.stringify(ids)),
  orte.map((o) => o.id));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);

/* --- 1. Ohne Zuordnung sieht der Plan aus wie immer ----------------------- */
/* Gruppen erscheinen mit der ersten Zuordnung, nicht vorher: wer den Plan nur
   als Liste nutzt, soll keine leeren Koepfe vorgesetzt bekommen. */
ok('ohne Zuordnung keine Tageskoepfe', await p.locator('.plantag').count(), 0);
ok('jede Zeile traegt einen Tageswaehler', await p.locator('select[data-day]').count(), 5);

const w = await p.evaluate(() => {
  const s = document.querySelector('.pday select');
  const r = s.getBoundingClientRect();
  return {
    hoch: Math.round(r.height),
    label: s.getAttribute('aria-label') || '',
    optionen: s.options.length,
    erste: s.options[0].textContent,
    wert: s.value
  };
});
ok('der Waehler ist mindestens 44 px hoch', w.hoch >= 44);
ok('… und fuer Vorleser beschriftet', /einem Tag zuordnen$/.test(w.label));
ok('… erste Wahl ist "Tag offen"', w.erste, 'Tag offen');
ok('… und steht zu Beginn auf offen', w.wert, '');
/* 14.-28. September = 15 Reisetage, dazu "Tag offen". Die Zahl kommt aus dem
   Untertitel der Daten, nicht aus einer zweiten Liste im Code. */
ok('… bietet alle Reisetage plus "Tag offen"', w.optionen, 16);

/* --- 2. Zuordnen gruppiert und rechnet ------------------------------------ */
await p.selectOption(`select[data-day="${orte[0].id}"]`, '2026-09-20');
await p.waitForTimeout(250);
await p.selectOption(`select[data-day="${orte[1].id}"]`, '2026-09-20');
await p.waitForTimeout(250);
await p.selectOption(`select[data-day="${orte[2].id}"]`, '2026-09-21');
await p.waitForTimeout(250);

ok('drei Gruppen: zwei Tage und "offen"', await p.locator('.plantag').count(), 3);
ok('die Tage stehen in ihrer Reihenfolge, "offen" zuletzt',
  await p.evaluate(() => [...document.querySelectorAll('.plantag__t')]
    .map((t) => t.textContent.trim().slice(0, 3))),
  ['Son', 'Mon', 'Noc']);

/* Die Tagessumme muss aus den Daten kommen. Gegengerechnet wird mit denselben
   Minuten, die oben aus places.json gelesen wurden -- nicht mit dem, was die
   App gerade anzeigt. */
const summeSoll = orte[0].min + orte[1].min;
const summeIst = await p.evaluate(() => {
  const t = document.querySelector('.plantag__sum').textContent;
  const h = /([\d,]+)\s*h/.exec(t);
  const m = /(\d+)\s*Min/.exec(t);
  return (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
});
ok('die Tagessumme ist aus den Daten gerechnet', Math.round(summeIst), summeSoll);
ok('gespeichert unter pk.days', await p.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('pk.days') || '{}')).length), 3);

/* --- 3. Neu laden: alles noch da ------------------------------------------ */
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('nach dem Neuladen stehen die Gruppen wieder', await p.locator('.plantag').count(), 3);
ok('… und die Waehler zeigen ihren Tag', await p.evaluate((o) =>
  document.querySelector(`select[data-day="${o}"]`).value, orte[0].id), '2026-09-20');

/* --- 4. Verschieben bleibt in der Gruppe ---------------------------------- */
/* Seit die Ansicht nach Tagen gruppiert, waere ein globaler Nachbar oft
   unsichtbar in einer anderen Gruppe -- man tippte und saehe nichts. */
const vorher = await p.evaluate(() =>
  [...document.querySelectorAll('.planrow__name')].map((e) => e.textContent));
await p.locator('.pmove[data-down]:not([disabled])').first().click();
await p.waitForTimeout(350);
const nachher = await p.evaluate(() =>
  [...document.querySelectorAll('.planrow__name')].map((e) => e.textContent));
ok('nach unten tauscht mit dem Gruppen-Nachbarn',
  [nachher[0], nachher[1]], [vorher[1], vorher[0]]);
ok('die anderen Gruppen bleiben unberuehrt',
  nachher.slice(2), vorher.slice(2));

const rand = await p.evaluate(() =>
  [...document.querySelectorAll('.pmove')].map((e) => e.disabled));
/* Zwei Zweier-Gruppen und dazwischen der einzelne Montags-Ort: dessen beide
   Pfeile sind still, an jeder Gruppengrenze je einer. */
ok('Pfeile enden an der Gruppengrenze, nicht am Listenende',
  rand, [true, false, false, true, true, true, true, false, false, true]);

/* --- 5. Ein ueberfuellter Tag wird genannt, nicht bewertet ---------------- */
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('pk.days') || '{}');
  JSON.parse(localStorage.getItem('pk.saved') || '[]')
    .forEach((id) => { d[id] = '2026-09-22'; });
  localStorage.setItem('pk.days', JSON.stringify(d));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
const alleMin = orte.reduce((a, o) => a + o.min, 0);
const voll = await p.evaluate(() => {
  const e = document.querySelector('.plantag__sum--voll');
  return e ? e.textContent.indexOf('mehr als 10 h') >= 0 : false;
});
ok('ueber 10 h an einem Tag traegt der Kopf den Hinweis',
  voll, alleMin > 600);

/* --- 6. Teilen traegt die Tage mit --------------------------------------- */
/* Der Link wird hier nachgebaut statt ueber den Teilen-Knopf geholt: der
   haengt an navigator.share bzw. der Zwischenablage, und beide sind im
   Testlauf launisch. Das Format ist dasselbe, das shareLink() erzeugt. */
const link = await p.evaluate(() => {
  const payload = {
    v: 1,
    m: JSON.parse(localStorage.getItem('pk.saved') || '[]'),
    g: [],
    d: JSON.parse(localStorage.getItem('pk.days') || '{}')
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#liste=' + b64;
});
{
  const c2 = await mach();
  const q = await c2.newPage();
  await q.goto(link, { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  /* Der Empfaenger hat einen eigenen Plan: derselbe Ort, anderer Tag. */
  await q.evaluate((o) => {
    localStorage.setItem('pk.saved', JSON.stringify([o]));
    localStorage.setItem('pk.days', JSON.stringify({ [o]: '2026-09-25' }));
  }, orte[0].id);
  /* reload, NICHT noch einmal goto: dieselbe URL mit unveraendertem Hash ist
     fuer den Browser keine Navigation, die Seite laedt nicht neu und liest
     den eben gesetzten Speicher nie. Genau daran ist diese Pruefung beim
     ersten Lauf gescheitert -- und hat dabei einen Fehler im Test gemeldet,
     nicht in der App. */
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await q.waitForSelector('#inbox:not([hidden])');
  await q.locator('#inbox-merge').click();
  await q.waitForTimeout(500);
  const d = await q.evaluate(() => JSON.parse(localStorage.getItem('pk.days') || '{}'));
  ok('Zusammenfuehren behaelt den eigenen Tag', d[orte[0].id], '2026-09-25');
  ok('… und uebernimmt fremde Tage nur in Luecken', d[orte[1].id], '2026-09-22');
  await c2.close();
}

/* --- 7. Ein alter Link ohne Tage bleibt gueltig --------------------------- */
/* v bleibt 1: eine aeltere Fassung ignoriert d einfach, und ein Link von
   damals darf nicht als kaputt gelten. */
{
  const c3 = await mach();
  const q = await c3.newPage();
  const alt = await p.evaluate(() => {
    const payload = { v: 1, m: JSON.parse(localStorage.getItem('pk.saved') || '[]'), g: [] };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#liste=' + b64;
  });
  await q.goto(alt, { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await q.waitForSelector('#inbox:not([hidden])');
  await q.locator('#inbox-replace').click();
  await q.waitForTimeout(500);
  await zumPlan(q);
  ok('alter Link ohne Tage: keine Koepfe', await q.locator('.plantag').count(), 0);
  ok('… aber alle Orte sind da', await q.locator('.planrow').count(), 5);
  await c3.close();
}

/* --- 8. Ein Fehltipp auf den Stern kostet keine Planung ------------------- */
/* Die Zuordnung ist eine Zutat der Merkliste, kein eigener Zustand: fliegt
   ein Ort heraus, bleibt sein Tag gespeichert und gilt wieder. */
await p.evaluate((o) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  localStorage.setItem('pk.saved', JSON.stringify(s.filter((x) => x !== o)));
}, orte[0].id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('der entfernte Ort ist weg', await p.locator('.planrow').count(), 4);
await p.evaluate((o) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  s.push(o);
  localStorage.setItem('pk.saved', JSON.stringify(s));
}, orte[0].id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('wieder gemerkt: sein Tag gilt wieder', await p.evaluate((o) =>
  document.querySelector(`select[data-day="${o}"]`).value, orte[0].id), '2026-09-22');

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
