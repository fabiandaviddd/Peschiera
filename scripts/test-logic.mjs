/* ==========================================================================
   Prüfstand für die reine Logik aus app.js — ohne Browser, ohne Build.

       node scripts/test-logic.mjs

   Geprüft wird, was Freitext liest: Öffnungszeiten, Termine im Badge, der
   Reisezeitraum im Untertitel, die Herleitung des Tagesabschnitts. Diese
   Funktionen liegen bei einem neuen Datensatz still falsch — kein Fehler in
   der Konsole, nur schlechtere Vorschläge. Dazu ein Blick auf places.json
   selbst: Felder, die von Hand gepflegt werden, tippen sich auch von Hand
   falsch.
   ========================================================================== */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

const pk = require(join(root, 'app.js'));
const data = JSON.parse(readFileSync(join(root, 'data', 'places.json'), 'utf8'));

let pass = 0;
const fails = [];

function ok(name, got, want) {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; return; }
  fails.push(`${name}\n      erwartet: ${b}\n      bekommen: ${a}`);
}

function truthy(name, got) {
  if (got) { pass++; return; }
  fails.push(`${name}\n      erwartet: irgendwas Wahres, bekommen: ${JSON.stringify(got)}`);
}

function group(title) { console.log('\n  ' + title); }

const mins = (h, m) => h * 60 + (m || 0);

/* ------------------------------------------------------ Öffnungszeiten lesen */
group('hoursWindow — Freitext zu Minuten');

ok('"geöffnet bis 22:30"', pk.hoursWindow('geöffnet bis 22:30'), { open: null, close: mins(22, 30) });
ok('"täglich 18–23, Ruhetag Mittwoch"', pk.hoursWindow('täglich 18–23, Ruhetag Mittwoch'),
   { open: mins(18), close: mins(23) });
ok('"ab 7:30"', pk.hoursWindow('ab 7:30'), { open: mins(7, 30), close: null });
ok('"öffnet 9.00, bis ca. 19:00"', pk.hoursWindow('öffnet 9.00, bis ca. 19:00'),
   { open: mins(9), close: mins(19) });
ok('"8:30–12:30 und 15:30–19:30"', pk.hoursWindow('8:30–12:30 und 15:30–19:30'),
   { open: mins(8, 30), close: mins(12, 30) });
ok('leer', pk.hoursWindow(''), { open: null, close: null });
ok('null', pk.hoursWindow(null), { open: null, close: null });
ok('"Zeiten ungeprüft" — keine Zahl, keine Behauptung',
   pk.hoursWindow('Zeiten ungeprüft'), { open: null, close: null });
/* Ein Fenster über Mitternacht ist kein Fenster: close <= open wird verworfen. */
ok('"22–2 Uhr" (über Mitternacht)', pk.hoursWindow('22–2 Uhr').close, null);

/* ----------------------------------------------------------- Tagesabschnitt */
group('momentsOf — was im JSON steht, gilt');

ok('moment im JSON schlägt alles',
   pk.momentsOf({ moment: ['abend'], category: 'cafe', badge: 'Früh morgens', tags: [] }),
   ['abend']);
ok('Badge "Der Abend"',
   pk.momentsOf({ category: 'essen', badge: 'Der Abend', tags: [] }), ['abend']);
ok('Café ohne alles → Morgen und Nachmittag',
   pk.momentsOf({ category: 'cafe', tags: [] }).sort(), ['frueh', 'nachmittag']);
ok('Essen ohne alles → Rückfall Mittag und Abend',
   pk.momentsOf({ category: 'essen', tags: [] }), ['mittag', 'abend']);
ok('Praktisches ist kein Tagesvorschlag',
   pk.momentsOf({ category: 'praktisch', tags: [] }), []);
ok('Sehen ohne alles → jeder helle Abschnitt',
   pk.momentsOf({ category: 'sehen', tags: [] }), ['frueh', 'mittag', 'nachmittag']);
truthy('Tagesausflug (time_min 300) beginnt morgens',
   pk.momentsOf({ category: 'ausflug', time_min: 300, tags: [] }).indexOf('frueh') >= 0);
truthy('Schluss um 23:00 heißt Abend',
   pk.momentsOf({ category: 'essen', hours: 'geöffnet bis 23:00', tags: [] }).indexOf('abend') >= 0);

/* --------------------------------------------------------------- Abschnitte */
group('momentNow — Uhrzeit zu Abschnitt, inklusive Vorausschau');

ok('09:00 → Morgen', pk.momentNow(mins(9)).m.id, 'frueh');
ok('13:00 → Mittag', pk.momentNow(mins(13)).m.id, 'mittag');
ok('16:00 → Nachmittag', pk.momentNow(mins(16)).m.id, 'nachmittag');
ok('20:00 → Abend', pk.momentNow(mins(20)).m.id, 'abend');
/* Ab 45 Minuten Restzeit bringt der laufende Abschnitt nichts mehr. */
ok('17:40 → gleich Abend', pk.momentNow(mins(17, 40)).m.id, 'abend');
ok('17:40 ist Vorausschau', pk.momentNow(mins(17, 40)).soon, true);
ok('17:00 bleibt Nachmittag', pk.momentNow(mins(17)).m.id, 'nachmittag');
ok('02:00 → morgen früh', pk.momentNow(mins(2)).tomorrow, true);
ok('23:30 → morgen früh', pk.momentNow(mins(23, 30)).tomorrow, true);
/* Der letzte Abschnitt schaut nicht über sich hinaus. */
ok('22:30 bleibt Abend', pk.momentNow(mins(22, 30)).m.id, 'abend');

/* -------------------------------------------------------------- Termin heute */
group('runsToday — Datum im Badge');

const sep19 = new Date(2026, 8, 19);
truthy('"18.–20.09." läuft am 19.', pk.runsToday({ badge: '18.–20.09.' }, sep19));
ok('"21.–23.09." läuft am 19. nicht', pk.runsToday({ badge: '21.–23.09.' }, sep19), false);
truthy('"19.09." läuft am 19.', pk.runsToday({ badge: '19.09.' }, sep19));
ok('"18.–20.10." ist ein anderer Monat', pk.runsToday({ badge: '18.–20.10.' }, sep19), false);
ok('Badge ohne Datum', pk.runsToday({ badge: 'Der Abend' }, sep19), false);
ok('kein Badge', pk.runsToday({}, sep19), false);

/* ------------------------------------------------------------------ Reisetag */
group('tripDay — Tag n von m aus dem Untertitel');

pk.useMeta({ subtitle: '14.–28. September 2026 · Gardasee' });
ok('18.09.2026 ist Tag 5 von 15', pk.tripDay(new Date(2026, 8, 18)), { n: 5, of: 15 });
ok('erster Tag', pk.tripDay(new Date(2026, 8, 14)), { n: 1, of: 15 });
ok('letzter Tag', pk.tripDay(new Date(2026, 8, 28)), { n: 15, of: 15 });
ok('davor zählt nicht', pk.tripDay(new Date(2026, 8, 13)), null);
ok('danach zählt nicht', pk.tripDay(new Date(2026, 8, 29)), null);
pk.useMeta({ subtitle: 'ohne Zeitraum' });
ok('Untertitel ohne Muster → keine Zeile', pk.tripDay(new Date(2026, 8, 18)), null);
/* Der echte Untertitel muss greifen, sonst fehlt die Zeile stillschweigend. */
pk.useMeta(data.meta);
truthy('der Untertitel in places.json wird gelesen',
   pk.tripDay(new Date(2026, 8, 18)) !== null);

/* ------------------------------------------------------------- Ungeprüftes */
group('unverified — was nicht als erster Vorschlag taugt');

truthy('"ungeprüft" in hours', pk.unverified({ hours: 'Zeiten ungeprüft' }));
truthy('"unbestätigt" in hours', pk.unverified({ hours: 'täglich, unbestätigt' }));
truthy('Badge "Zeiten prüfen"', pk.unverified({ badge: 'Zeiten prüfen' }));
truthy('Badge "Erst anrufen"', pk.unverified({ badge: 'Erst anrufen' }));
ok('belegte Zeit ist geprüft', pk.unverified({ hours: 'geöffnet bis 22:30' }), false);

/* ------------------------------------------------------------- Schließt gleich */
group('closingSoon / fitsLeft');

ok('22:30 Schluss, jetzt 22:20 → gleich zu',
   pk.closingSoon({ hours: 'geöffnet bis 22:30' }, mins(22, 20)), true);
ok('22:30 Schluss, jetzt 19:00 → nicht gleich zu',
   pk.closingSoon({ hours: 'geöffnet bis 22:30' }, mins(19)), false);
ok('ohne Zeitangabe wird nichts behauptet',
   pk.closingSoon({ hours: 'täglich geöffnet' }, mins(22)), false);

/* Beim Essen entscheidet nicht die Restzeit des Abschnitts. */
ok('Essen passt immer',
   pk.fitsLeft({ category: 'essen', time_min: 600 }, mins(22), mins(23)), true);
ok('Ausflug ohne Dauer passt',
   pk.fitsLeft({ category: 'ausflug' }, mins(9), mins(11)), true);
ok('4 h Ausflug um 9 Uhr bis 11 Uhr passt nicht',
   pk.fitsLeft({ category: 'ausflug', time_min: 240, walk_min: 10 }, mins(9), mins(11)), false);
ok('1 h Ausflug um 9 Uhr bis 11 Uhr passt',
   pk.fitsLeft({ category: 'ausflug', time_min: 60, walk_min: 10 }, mins(9), mins(11)), true);

/* ---------------------------------------------------------------- Im Trockenen */
group('indoorOf — nur was belegt ist');

ok('indoor: true gilt', pk.indoorOf({ indoor: true, tags: [] }), true);
ok('indoor: false gilt', pk.indoorOf({ indoor: false, tags: ['museum'] }), false);
ok('Badge "Regentag"', pk.indoorOf({ badge: 'Regentag', tags: [] }), true);
ok('Tag "museum" → drinnen', pk.indoorOf({ tags: ['museum'] }), true);
ok('Tag "strand" → draußen', pk.indoorOf({ tags: ['strand'] }), false);
ok('ohne Anhalt bleibt es offen', pk.indoorOf({ tags: ['pizza'] }), null);
/* Die Kategorieregel steht vor den Außen-Tags: "wasser" heißt bei einem
   Lokal „liegt am See", nicht „man sitzt im Regen". */
ok('Restaurant mit Tag "wasser" → drinnen',
   pk.indoorOf({ category: 'essen', tags: ['wasser', 'seeblick'] }), true);
ok('Café mit Tag "terrasse" → drinnen',
   pk.indoorOf({ category: 'cafe', tags: ['terrasse'] }), true);
/* … aber ein ausdrückliches false schlägt die Regel (7 Ponti). */
ok('Lokal mit "indoor": false bleibt draußen',
   pk.indoorOf({ category: 'cafe', indoor: false, tags: ['aperitivo'] }), false);
ok('Ausflug mit Tag "wasser" bleibt draußen',
   pk.indoorOf({ category: 'ausflug', tags: ['wasser'] }), false);

/* ------------------------------------------------------------------- Formate */
group('dur / km / norm');

ok('45 Min', pk.dur(45), '45 Min');
ok('60 → 1 h', pk.dur(60), '1 h');
ok('90 → 1,5 h', pk.dur(90), '1,5 h');
ok('120 → 2 h', pk.dur(120), '2 h');
ok('240 → 4 h', pk.dur(240), '4 h');
ok('null → leer', pk.dur(null), '');
ok('0,8 km → Meter', pk.km(0.8), '800 m');
ok('1,2 km', pk.km(1.2), '1,2 km');
ok('null → leer', pk.km(null), '');
/* Diakritika und ß: "cafe" muss "Caffè" finden, "strasse" die "Straße". */
ok('Caffè → caffe', pk.norm('Caffè'), 'caffe');
ok('Straße → strasse', pk.norm('Straße'), 'strasse');
ok('Ausflüge → ausfluge', pk.norm('Ausflüge'), 'ausfluge');

/* -------------------------------------------------------------- Sortierung */
group('Sortierung — ohne Wert nach hinten, nie als 0');

const withKm = { name: 'A', distance_km: 2.0 };
const noKm = { name: 'B', distance_km: null };
truthy('Ort ohne Entfernung steht hinten', pk.byDistance(withKm, noKm) < 0);
const rated = { name: 'A', rating: 3.9 };
const unrated = { name: 'B', rating: null };
truthy('Ort ohne Bewertung steht hinten', pk.byRating(rated, unrated) < 0);

/* --------------------------------------------------------------- Die Daten */
group('data/places.json — was von Hand gepflegt wird');

const catIds = data.categories.map((c) => c.id);
const ids = new Set();
const dupes = [];
const badCat = [];
const badDog = [];
const badMoment = [];
const badTime = [];
const badGeo = [];
const MOMENT_IDS = pk.MOMENTS.map((m) => m.id);

for (const p of data.places) {
  if (ids.has(p.id)) dupes.push(p.id);
  ids.add(p.id);
  if (!catIds.includes(p.category)) badCat.push(`${p.id}: ${p.category}`);
  if (!(p.dog === true || p.dog === false || p.dog === null || p.dog === undefined)) {
    badDog.push(`${p.id}: ${JSON.stringify(p.dog)}`);
  }
  if (p.moment !== undefined && p.moment !== null) {
    if (!Array.isArray(p.moment)) badMoment.push(`${p.id}: kein Array`);
    else for (const m of p.moment) if (!MOMENT_IDS.includes(m)) badMoment.push(`${p.id}: ${m}`);
  }
  for (const f of ['time_min', 'walk_min', 'bike_min', 'distance_km', 'rating', 'reviews']) {
    const v = p[f];
    if (v !== undefined && v !== null && typeof v !== 'number') badTime.push(`${p.id}.${f}`);
  }
  if (p.geo && !(typeof p.geo.lat === 'number' && typeof p.geo.lon === 'number')) {
    badGeo.push(p.id);
  }
}

ok('jede id genau einmal', dupes, []);
ok('jede category ist in categories definiert', badCat, []);
ok('dog nur true, false oder null', badDog, []);
ok('moment nur aus den vier Abschnitten', badMoment, []);
ok('Zahlenfelder sind Zahlen oder null', badTime, []);
ok('geo hat lat und lon als Zahl', badGeo, []);
truthy('jeder Ort hat einen Namen', data.places.every((p) => p.name && p.name.trim()));
/* Jeder Akzent muss in style.css als .acc-* stehen, sonst bleibt die Kante grau. */
const css = readFileSync(join(root, 'style.css'), 'utf8');
ok('jeder Kategorie-Akzent hat eine .acc-Regel',
   data.categories.map((c) => c.accent).filter((a) => !css.includes(`.acc-${a}`)), []);

/* Die Fassung in app.js und der Cache in sw.js müssen zusammenpassen — sonst
   läuft die App still auf altem Stand weiter. */
group('app.js und sw.js — dieselbe Fassung');

const appSrc = readFileSync(join(root, 'app.js'), 'utf8');
const swSrc = readFileSync(join(root, 'sw.js'), 'utf8');
const appV = (appSrc.match(/var VERSION = '([^']+)'/) || [])[1];
const swV = (swSrc.match(/var CACHE = 'peschiera-([^']+)'/) || [])[1];
const swF = (swSrc.match(/var FONTS = 'peschiera-fonts-([^']+)'/) || [])[1];
truthy('VERSION steht in app.js', !!appV);
truthy('CACHE steht in sw.js', !!swV);
ok('CACHE passt zu VERSION', swV, appV ? appV.split(/[\s·]/)[0] : null);
ok('FONTS passt zu VERSION', swF, appV ? appV.split(/[\s·]/)[0] : null);

/* Jede Datei in SHELL muss es auch geben, sonst fehlt sie offline. */
const shell = (swSrc.match(/var SHELL = \[([\s\S]*?)\]/) || [, ''])[1]
  .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
const missing = shell.filter((rel) => {
  if (rel === './') return false;
  try { readFileSync(join(root, rel)); return false; } catch { return true; }
});
ok('jede Datei aus SHELL liegt im Repo', missing, []);

/* ------------------------------------------------- Zahlen für die README */

/* Die README nennt Zahlen aus den Daten — und genau die sind einmal
   veraltet. Hier stehen sie nachrechenbar, statt abgeschrieben zu werden. */
function stats() {
  const P = data.places.map((p) => ({ ...p, tags: p.tags || [] }));
  const n = P.length;

  /* Greifen die Stufen 1–4, oder läuft der Ort über den Rückfall? Die Frage
     lässt sich mit momentsOf selbst beantworten, ohne die Stufen hier
     nachzubauen: Stufe 3 greift bei jedem Café; für alle anderen zeigt ein
     Lauf als „praktisch", ob Badge, Öffnungszeit oder Dauer etwas hergeben —
     denn nur dort ist der Rückfall leer. */
  let explicit = 0, derived = 0, fallback = 0, never = 0;
  for (const p of P) {
    if (Array.isArray(p.moment) && p.moment.length) { explicit++; continue; }
    const found = p.category === 'cafe'
      || pk.momentsOf({ ...p, category: 'praktisch', _m: undefined }).length > 0;
    if (found) derived++;
    else if (p.category === 'praktisch') never++;
    else fallback++;
  }

  const ind = { true: 0, false: 0, null: 0 };
  for (const p of P) ind[String(pk.indoorOf({ ...p }))]++;
  const dog = { true: 0, false: 0, null: 0 };
  for (const p of P) dog[String(p.dog === true ? true : p.dog === false ? false : null)]++;

  const line = (k, v) => console.log('    ' + k.padEnd(38) + v);
  console.log('\n  Zahlen für die README (aus den Daten gerechnet)');
  line('Orte', n);
  line('moment explizit im JSON', explicit);
  line('Tagesabschnitt aus Stufe 1–4', explicit + derived);
  line('… über den Rückfall', fallback);
  line('… praktisch, nie ein Vorschlag', never);
  line('indoor: drinnen / draußen / offen',
       `${ind.true} / ${ind.false} / ${ind.null}`);
  line('dog: true / false / ungeklärt', `${dog.true} / ${dog.false} / ${dog.null}`);
  line('geo gesetzt / fehlt',
       `${P.filter((p) => p.geo).length} / ${P.filter((p) => !p.geo).length}`);
  line('hours fehlt', P.filter((p) => !p.hours).length);
  line('verschiedene Tags', new Set(P.flatMap((p) => p.tags)).size);
  line('merken / offene Punkte / Faktencheck',
       `${data.merken.length} / ${data.open_questions.length} / ${data.faktencheck.length}`);
}

/* ------------------------------------------------------------------ Ergebnis */
stats();

console.log('');
if (fails.length) {
  console.log(`  ${fails.length} von ${pass + fails.length} Prüfungen fehlgeschlagen:\n`);
  fails.forEach((f) => console.log('  ✗ ' + f + '\n'));
  process.exit(1);
}
console.log(`  ✓ alle ${pass} Prüfungen bestanden`);
