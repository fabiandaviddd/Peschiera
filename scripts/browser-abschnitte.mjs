/* Prüft "Heute" zu vier Uhrzeiten, mit und ohne Jum: jeder Abschnitt muss
   einen echten Vorschlag zeigen, nicht den Leerzustand. */
/* Pfade nicht festnageln: diese Suiten liefen in einer Sitzung gegen ein
   fest eingerichtetes Chromium. Damit sie auch woanders starten, kommt alles
   Umgebungsabhaengige aus Umgebungsvariablen — die Vorgabe ist der Stand, in
   dem sie zuletzt gruen liefen.

     PLAYWRIGHT   Pfad zum playwright-Modul (index.mjs)
     CHROME       Pfad zur Chromium-Binaerdatei
     BASE         Adresse des lokalen Servers
     OUT          Ablage fuer die Bildschirmfotos
     ROOT         Wurzel des Arbeitsbaums

   Server: python3 -m http.server 8111 --directory <ROOT>
*/
import { mkdirSync } from 'node:fs';

const PW = process.env.PLAYWRIGHT
  || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const CHROME = process.env.CHROME
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = process.env.ROOT || process.cwd();

const BASE = process.env.BASE || 'http://127.0.0.1:8111';
const OUT = process.env.OUT || ROOT + '/.screenshots';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fails.push(`${n}\n       erwartet ${b}, bekommen ${a}`); console.log('  FAIL ' + n); }
};

const browser = await chromium.launch({
  executablePath: CHROME,
});

const TIMES = [
  { h: 8,  label: 'Morgen',     name: '8:00' },   // App schreibt keine fuehrende Null
  { h: 13, label: 'Mittag',     name: '13:00' },
  { h: 16, label: 'Nachmittag', name: '16:00' },
  { h: 20, label: 'Abend',      name: '20:00' },
];

async function look(t, { jum = false, wet = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'de-DE', timezoneId: 'Europe/Berlin',
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  /* Mit Zeitzonen-Versatz, sonst baut node die Zeit in UTC und die Seite
     sieht in Europe/Berlin zwei Stunden spaeter. Am 18.09. gilt CEST. */
  const hh = String(t.h).padStart(2, '0');
  await page.clock.setFixedTime(new Date(`2026-09-18T${hh}:00:00+02:00`));
  if (jum || wet) {
    await page.addInitScript(([j, w]) => {
      try {
        if (j) localStorage.setItem('pk.jum', 'true');
        if (w) sessionStorage.setItem('pk.wet', 'true');
      } catch (e) {}
    }, [jum, wet]);
  }
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  await page.waitForTimeout(350);

  const r = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const pick = q('.today__pick');
    return {
      headline: q('.today__now') ? q('.today__now').textContent.trim() : null,
      clock: q('.today__clock') ? q('.today__clock').textContent.trim() : null,
      kicker: q('.today__kicker') ? q('.today__kicker').textContent.trim() : null,
      name: pick && q('.today__name') ? q('.today__name').textContent.trim() : null,
      why: pick && q('.today__why') ? q('.today__why').textContent.trim() : null,
      cat: pick && q('.today__cat') ? q('.today__cat').textContent.trim() : null,
      empty: !!q('.today__none'),
      emptyText: q('.today__none') ? q('.today__none').textContent.trim() : null,
      others: Array.from(document.querySelectorAll('.today__small-n')).map((e) => e.textContent.trim()),
      pos: q('.today__pos') ? q('.today__pos').textContent.trim() : null,
    };
  });
  r.errs = errs;
  return { r, page, ctx };
}

/* --------------------------------------------------- Vier Abschnitte, alle */
for (const t of TIMES) {
  console.log(`\n${t.name} — erwartet "${t.label}"`);
  const { r, page, ctx } = await look(t);
  ok('Überschrift nennt den Abschnitt', r.headline.startsWith(t.label));
  ok('Uhr stimmt', r.clock, t.name);
  ok('ein Vorschlag steht da', r.empty, false);
  ok('Vorschlag hat einen Namen', typeof r.name === 'string' && r.name.length > 0);
  ok('Begründung steht darunter', typeof r.why === 'string' && r.why.length > 0);
  /* Seit "Schritt 4" zeigt "Sonst noch" drei Alternativen, dazu einen Ausblick
     auf den naechsten Abschnitt — zusammen vier Namen. */
  ok('mindestens drei Alternativen', r.others.length >= 3);
  /* Die Positionsanzeige nennt die Groesse des Abschnitts-Stapels; das ist die
     moment-Menge dieses Zweigs, im Bild nachpruefbar. */
  ok('Positionsanzeige nennt den Stapel (z. B. "1 / 34")',
     /^\d+ \/ \d+$/.test(r.pos || ''));
  ok('keine Skriptfehler', r.errs, []);
  console.log(`       ${r.kicker} → ${r.cat} · ${r.name}`);
  console.log(`       ${r.why}`);
  console.log(`       sonst: ${r.others.join(' / ')}`);
  await page.screenshot({ path: `${OUT}/moment-${t.h}.png` });
  await ctx.close();
}

/* ------------------------------------------------ Vier Abschnitte, mit Jum */
for (const t of TIMES) {
  console.log(`\n${t.name} mit Jum`);
  const { r, ctx } = await look(t, { jum: true });
  ok('Abschnitt stimmt', r.headline.startsWith(t.label));
  ok('auch mit Jum ein Vorschlag', r.empty, false);
  ok('Kicker nennt Jum', /mit Jum/.test(r.kicker || ''));
  ok('Vorschlag erlaubt den Hund', /Jum darf mit/.test(r.why || ''));
  console.log(`       ${r.cat} · ${r.name}`);
  console.log(`       sonst: ${r.others.join(' / ') || '—'}`);
  await ctx.close();
}

/* ------------------------------- Regenmorgen mit Hund: ehrlicher Leerzustand */
console.log('\n08:00 mit Jum und Regen — die bekannte Lücke');
{
  const { r, ctx } = await look(TIMES[0], { jum: true, wet: true });
  ok('Leerzustand statt schwachem Vorschlag', r.empty, true);
  /* Der Leerzustand ist seit "Schritt 4" konkreter: er nennt, dass es im
     Trockenen etwas gaebe, dass Jum es wegnimmt, und zaehlt die Orte auf. */
  ok('nennt das Trockene', /[Ii]m Trockenen/.test(r.emptyText || ''));
  ok('nennt den Jum-Schalter als Ursache',
     /nicht mit Jum|ohne den Schalter/i.test(r.emptyText || ''));
  ok('zeigt, was ohne Jum ginge', /\d+ Orte/.test(r.emptyText || ''));
  console.log(`       "${(r.emptyText || '').replace(/\s+/g, ' ')}"`);
  await ctx.close();
}

/* ------------------------------ Abend bei Regen: drinnen ist reichlich da */
console.log('\n20:00 bei Regen');
{
  const { r, ctx } = await look(TIMES[3], { wet: true });
  ok('Regenabend hat einen Vorschlag', r.empty, false);
  console.log(`       ${r.cat} · ${r.name}`);
  await ctx.close();
}

/* ------------------- Apotheke und Bahnhof dürfen nirgends Vorschlag sein */
console.log('\nKein Tagesvorschlag: die 13 mit leerem moment');
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#app:not([hidden])');
  const EXCLUDED = ['clinica-catullo', 'vet-san-benedetto', 'farmacia-giubertoni', 'famila',
    'orvea', 'penny', 'velolake', 'rentride', 'garda-south-cycling', 'bahnhof',
    'imbarcadero', 'lapescheria', 'pescheria-cavallaro'];
  /* Über alle vier Abschnitte und beide Wetterlagen hinweg prüfen, ob einer
     dieser Orte je als Vorschlag auftaucht. */
  const hits = await page.evaluate(async (ids) => {
    const found = [];
    const data = await (await fetch('./data/places.json')).json();
    const byId = {};
    data.places.forEach((p) => { byId[p.id] = p; });
    for (const id of ids) {
      const p = byId[id];
      if (!p) { found.push(id + ': fehlt in den Daten'); continue; }
      if (!Array.isArray(p.moment)) { found.push(id + ': kein moment'); continue; }
      if (p.moment.length) found.push(id + ': ' + p.moment.join(','));
    }
    return found;
  }, EXCLUDED);
  ok('alle 13 tragen eine leere Liste', hits, []);
  /* Und in der Liste müssen sie trotzdem auffindbar bleiben. */
  await page.locator('.tab[data-tab="orte"]').click();
  await page.waitForTimeout(250);
  await page.locator('#q').fill('apotheke');
  await page.waitForTimeout(250);
  const n = await page.locator('.card').count();
  ok('die Apotheke bleibt über die Suche auffindbar', n > 0);
  await page.locator('#q').fill('bahnhof');
  await page.waitForTimeout(250);
  ok('der Bahnhof bleibt auffindbar', (await page.locator('.card').count()) > 0);
  await ctx.close();
}

await browser.close();
console.log('');
if (fails.length) {
  console.log(`${fails.length} von ${pass + fails.length} Prüfungen fehlgeschlagen:\n`);
  fails.forEach((f) => console.log('  ✗ ' + f + '\n'));
  process.exit(1);
}
console.log(`✓ alle ${pass} Abschnitts-Prüfungen bestanden`);
