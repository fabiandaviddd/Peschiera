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
const placesRaw = readFileSync(join(root, 'data', 'places.json'), 'utf8');
const data = JSON.parse(placesRaw);

/* Ein doppelter Schluessel in einem Objekt ist fuer JSON.parse unsichtbar —
   der letzte gewinnt still. Genau das ist beim Zusammenfuehren zweier Zweige
   passiert, die beide ein moment eingefuegt hatten: lido39 trug danach zwei,
   die Datei las sich sauber, und ein Abschnitt war weg. Deshalb wird der
   Rohtext gescannt, nicht das geparste Ergebnis. */
function duplicateKeys(text) {
  const found = [];
  const stack = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '"') {
      let j = i + 1, key = '';
      while (j < text.length) {
        if (text[j] === '\\') { key += text[j + 1]; j += 2; continue; }
        if (text[j] === '"') break;
        key += text[j]; j++;
      }
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k])) k++;
      if (text[k] === ':' && stack.length) {
        const seen = stack[stack.length - 1];
        if (seen.has(key)) found.push(key);
        seen.add(key);
      }
      i = j + 1;
      continue;
    }
    if (ch === '{') stack.push(new Set());
    else if (ch === '}') stack.pop();
    i++;
  }
  return found;
}

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

/* ------------------------------------------------------------- Ruhetage */
group('closedOn — der Ruhetag steht woertlich da');

/* Die Schreibweisen, die in den Daten wirklich vorkommen. */
ok('"täglich 18–23, Ruhetag Mittwoch"', pk.closedOn('täglich 18–23, Ruhetag Mittwoch'), 3);
ok('"12–14 und 19–22:30, Ruhetag Dienstag"', pk.closedOn('12–14 und 19–22:30, Ruhetag Dienstag'), 2);
ok('"Abend Di–So 19–22, Ruhetag Montag"', pk.closedOn('Abend Di–So 19–22, Ruhetag Montag'), 1);
ok('"Di–So, Ruhetag Montag"', pk.closedOn('Di–So, Ruhetag Montag'), 1);
ok('"öffnet 10:00 · Mi geschlossen"', pk.closedOn('öffnet 10:00 · Mi geschlossen'), 3);
ok('"Di–Do 9:30–12:30, Fr–So 9:30–18:30, Mo zu"',
   pk.closedOn('Di–Do 9:30–12:30, Fr–So 9:30–18:30, Mo zu'), 1);
ok('"9:30–12:30 und 14:30–18, Mo zu"', pk.closedOn('9:30–12:30 und 14:30–18, Mo zu'), 1);
ok('"werktags nur abends, Sa/So auch 12–14, Ruhetag Dienstag"',
   pk.closedOn('werktags nur abends, Sa/So auch 12–14, Ruhetag Dienstag'), 2);

/* Die Gegenprobe wiegt schwerer als die Treffer: ein erfundener Ruhetag
   versteckt einen offenen Ort, und das faellt niemandem auf. */
ok('"Mi–Sa 19:00–23:00" ist eine Oeffnungszeit, kein Ruhetag',
   pk.closedOn('Mi–Sa 19:00–23:00 (ungeprüft)'), null);
ok('"Mo 9–13, Di–Sa 8:30–19:30, So 10–19:30" — drei Fenster, kein Ruhetag',
   pk.closedOn('Mo 9–13, Di–Sa 8:30–19:30, So 10–19:30'), null);
ok('"Mo–Sa 9–18:30, bis 01.11. auch So"', pk.closedOn('Mo–Sa 9–18:30, bis 01.11. auch So'), null);
ok('"Weinshop Mo–Sa 8:30–12:30 und 14–18"',
   pk.closedOn('Weinshop Mo–Sa 8:30–12:30 und 14–18'), null);
ok('"geöffnet bis 22:30"', pk.closedOn('geöffnet bis 22:30'), null);
ok('"täglich 9–19"', pk.closedOn('täglich 9–19'), null);
ok('"Zeiten ungeprüft"', pk.closedOn('Zeiten ungeprüft'), null);
ok('leer', pk.closedOn(''), null);
ok('null', pk.closedOn(null), null);
/* Sonntag ist 0 wie bei Date#getDay() — und 0 ist nicht null. */
ok('"Ruhetag Sonntag" ist 0, nicht null', pk.closedOn('Ruhetag Sonntag'), 0);

/* closedToday rechnet gegen ein uebergebenes Datum, nicht gegen die Uhr des
   Rechners — der 16.09.2026 ist ein Mittwoch. Ohne das waere die Pruefung
   an sechs von sieben Tagen gruen und am siebten rot. */
const mittwoch = new Date(2026, 8, 16);
const dienstag = new Date(2026, 8, 15);
ok('Ruhetag Mittwoch, am Mittwoch',
   pk.closedToday({ hours: 'täglich 18–23, Ruhetag Mittwoch' }, mittwoch), true);
ok('Ruhetag Mittwoch, am Dienstag',
   pk.closedToday({ hours: 'täglich 18–23, Ruhetag Mittwoch' }, dienstag), false);
ok('ohne Angabe nie geschlossen', pk.closedToday({ hours: 'geöffnet bis 22:30' }, mittwoch), false);
ok('ohne hours nie geschlossen', pk.closedToday({ hours: null }, mittwoch), false);
/* Array#map reicht den Index als zweites Argument durch, und .map(smallHtml)
   ist im Haus die uebliche Schreibweise. Vor dem Haerten warf closedToday bei
   Index 1 einen TypeError und nahm die ganze Heute-Ansicht mit — aufgetaucht
   ist das erst, als der Ruhetag-Zweig und der Tagesblatt-Zweig
   zusammenkamen. Keiner der beiden hatte den Fehler allein. */
const ruhetagMi = { hours: 'täglich 18–23, Ruhetag Mittwoch' };
ok('ein durchgereichter Index stuerzt nicht ab', pk.closedToday(ruhetagMi, 1), false);
ok('Index 0 ebenso', pk.closedToday(ruhetagMi, 0), pk.closedToday(ruhetagMi));
ok('ein ungueltiges Datum faellt auf heute zurueck',
   pk.closedToday(ruhetagMi, new Date('kein Datum')), pk.closedToday(ruhetagMi));
ok('ein String ist kein Datum', pk.closedToday(ruhetagMi, '2026-09-16'), pk.closedToday(ruhetagMi));

/* ----------------------------------------------------------- Tagesabschnitt */
group('momentsOf — was im JSON steht, gilt');

ok('moment im JSON schlägt alles',
   pk.momentsOf({ moment: ['abend'], category: 'cafe', badge: 'Früh morgens', tags: [] }),
   ['abend']);
/* Auch die leere Liste ist eine Angabe: „kein Tagesvorschlag". Vorher fiel
   sie in die Herleitung zurück, und die Apotheke stand wegen „ab 8:30"
   morgens im Vorschlag. */
ok('leeres moment heißt kein Vorschlag',
   pk.momentsOf({ moment: [], category: 'cafe', hours: 'ab 8:30', tags: [] }), []);
ok('leeres moment schlägt auch einen eindeutigen Badge',
   pk.momentsOf({ moment: [], category: 'essen', badge: 'Der Abend', tags: [] }), []);
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

/* ----------------------------------------------------------- Luftlinie */
group('airKmPoint — Entfernung ohne Dienst und ohne Raten');

/* Ein Grad Breite sind rund 111,19 km — unabhaengig von jeder Bibliothek
   nachschlagbar und deshalb der richtige Pruefstein. */
ok('ein Grad Breite', Math.round(pk.airKmPoint({ lat: 45, lon: 10 }, { lat: 46, lon: 10 }) * 10) / 10, 111.2);
ok('derselbe Punkt ist null km', pk.airKmPoint({ lat: 45.44, lon: 10.69 }, { lat: 45.44, lon: 10.69 }), 0);
/* Symmetrisch: hin wie zurueck. */
truthy('hin wie zurueck',
  Math.abs(pk.airKmPoint({ lat: 45.4, lon: 10.6 }, { lat: 45.5, lon: 10.8 })
         - pk.airKmPoint({ lat: 45.5, lon: 10.8 }, { lat: 45.4, lon: 10.6 })) < 1e-9);
/* Fehlt ein Punkt oder eine Zahl, kommt null — nie 0. 0 hiesse "hier". */
ok('ohne ersten Punkt', pk.airKmPoint(null, { lat: 45, lon: 10 }), null);
ok('ohne zweiten Punkt', pk.airKmPoint({ lat: 45, lon: 10 }, null), null);
ok('lat fehlt', pk.airKmPoint({ lon: 10 }, { lat: 45, lon: 10 }), null);
ok('lat ist ein String', pk.airKmPoint({ lat: '45', lon: 10 }, { lat: 45, lon: 10 }), null);
ok('geo: null wie in den Daten', pk.airKmPoint(null, null), null);

/* Gegen die echten Daten: vom Zeltplatz aus liegt kein Ort weiter als der
   weiteste Ausflug, und keiner naeher als null. Faellt ein Komma im geo um,
   steht der Ort ploetzlich in Afrika. */
const base = data.meta.base_geo;
truthy('meta.base_geo hat lat und lon',
  base && typeof base.lat === 'number' && typeof base.lon === 'number');
const weit = data.places
  .filter((p) => p.geo)
  .map((p) => ({ id: p.id, d: pk.airKmPoint(base, p.geo) }))
  .filter((x) => x.d > 120)
  .map((x) => `${x.id}: ${Math.round(x.d)} km`);
ok('kein Ort liegt weiter als 120 km Luftlinie vom Zeltplatz', weit, []);

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
const badMomentOrder = [];
const noMoment = [];
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
  if (!Array.isArray(p.moment)) {
    /* Jeder Ort ist von Hand eingeordnet. Ein neuer Ort ohne moment liefe
       über die Herleitung — sie ist die Rückfallebene, nicht der Normalfall. */
    noMoment.push(p.id);
  } else {
    for (const m of p.moment) if (!MOMENT_IDS.includes(m)) badMoment.push(`${p.id}: ${m}`);
    const inOrder = p.moment.slice().sort((a, b) => MOMENT_IDS.indexOf(a) - MOMENT_IDS.indexOf(b));
    if (JSON.stringify(inOrder) !== JSON.stringify(p.moment)) {
      badMomentOrder.push(`${p.id}: ${p.moment.join(',')}`);
    }
    if (new Set(p.moment).size !== p.moment.length) badMoment.push(`${p.id}: doppelter Abschnitt`);
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
ok('moment in Tagesreihenfolge', badMomentOrder, []);
ok('jeder Ort trägt ein moment', noMoment, []);
ok('kein Schlüssel zweimal im selben Objekt', duplicateKeys(placesRaw), []);
ok('Zahlenfelder sind Zahlen oder null', badTime, []);
ok('geo hat lat und lon als Zahl', badGeo, []);
/* Wer einen Ruhetag in hours schreibt, muss ihn lesbar schreiben. Sonst
   sortiert „Heute" den Ort weiter nach vorn, als staende dort nichts — und
   das faellt erst vor der verschlossenen Tuer auf. */
const unreadableClosed = data.places
  .filter((p) => p.hours && /ruhetag|geschlossen|\bzu\b/i.test(p.hours))
  .filter((p) => pk.closedOn(p.hours) === null)
  .map((p) => `${p.id}: ${p.hours}`);
ok('jeder Ruhetag in hours ist lesbar', unreadableClosed, []);
truthy('jeder Ort hat einen Namen', data.places.every((p) => p.name && p.name.trim()));
/* Jeder Akzent muss in style.css als .acc-* stehen, sonst bleibt die Kante grau. */
const css = readFileSync(join(root, 'style.css'), 'utf8');
ok('jeder Kategorie-Akzent hat eine .acc-Regel',
   data.categories.map((c) => c.accent).filter((a) => !css.includes(`.acc-${a}`)), []);

/* ------------------------------------------------------------- Koordinaten */
/* Die Plausibilitätsregeln stehen in koordinaten.html und add-coords.mjs —
   dort greifen sie aber nur, während der Dienst befragt wird. Die 13 Orte
   ohne sinnvollen Einzelpunkt sollen laut docs/koordinaten-pruefliste.md von
   Hand aus Google Maps nachgetragen werden, und für die prüft bisher nichts.
   Deshalb hier dieselben zwei Regeln auf die fertige Datei, mit denselben
   Konstanten. */
group('data/places.json — Koordinaten');

const BOX = { lonMin: 10.35, lonMax: 11.15, latMin: 45.05, latMax: 45.95 };
const baseGeo = data.meta && data.meta.base_geo;

function airKm(a, b) {
  const R = 6371;
  const p1 = a.lat * Math.PI / 180, p2 = b.lat * Math.PI / 180;
  const dp = p2 - p1, dl = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

truthy('die Basis hat eine Koordinate',
   baseGeo && typeof baseGeo.lat === 'number' && typeof baseGeo.lon === 'number');

const outOfBox = [];
const tooFar = [];
for (const p of data.places) {
  const g = p.geo;
  if (!g) continue;
  if (g.lat < BOX.latMin || g.lat > BOX.latMax || g.lon < BOX.lonMin || g.lon > BOX.lonMax) {
    outOfBox.push(`${p.id}: ${g.lat}, ${g.lon}`);
  }
  /* Die Luftlinie kann nie länger sein als der gemessene Straßenweg. Grenze
     wie in der Prüfliste: distance_km × 1,15 + 0,5 km. */
  if (typeof p.distance_km === 'number') {
    const air = airKm(baseGeo, g);
    const limit = p.distance_km * 1.15 + 0.5;
    if (air > limit) {
      tooFar.push(`${p.id}: Luftlinie ${air.toFixed(2)} km > Grenze ${limit.toFixed(2)} km`);
    }
  }
}
ok('jede Koordinate liegt in der Reisegegend', outOfBox, []);
ok('keine Luftlinie länger als der Straßenweg', tooFar, []);

/* Ein Punkt, den mehrere Orte tragen, heisst fast immer: der Dienst hat einen
   Ortsmittelpunkt statt der Adresse geliefert. Die beiden Regeln oben fangen
   das nicht — "Peschiera del Garda" als Adresse bestaetigt den Ortspunkt, und
   die Luftlinie bleibt klein. Deshalb zwei Regeln ueber die Punkte selbst.
   Sie haetten die drei falschen Gruppen gefangen: Festung/Bahnhof/Anleger
   ueber die erste, Trattoria mit dem Lago del Frassino ueber die zweite. */
const spotsBy = new Map();
for (const p of data.places) {
  if (!p.geo) continue;
  const k = `${p.geo.lat},${p.geo.lon}`;
  if (!spotsBy.has(k)) spotsBy.set(k, []);
  spotsBy.get(k).push(p);
}

/* Strassen- oder Flurteil der Adresse, ohne Hausnummer und Ortsteil. So fallen
   "Via Venezia 86" und "Via Venezia 72" zusammen, "Strada Bergamini" und
   "Strada Santa Cristina" nicht. */
function addressStem(a) {
  return String(a || '').split(',')[0]
    .replace(/\s*\d+\s*[/A-Za-z]*\s*$/, '')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const crowded = [];
const mixedSpots = [];
for (const [k, group] of spotsBy) {
  if (group.length >= 3) crowded.push(`${k}: ${group.map((p) => p.id).join(', ')}`);
  if (group.length < 2) continue;
  const stems = new Set(group.map((p) => addressStem(p.address)));
  if (stems.size > 1) {
    mixedSpots.push(`${group.map((p) => p.id).join(' + ')} (${[...stems].join(' | ')})`);
  }
}
ok('kein Punkt mit drei oder mehr Orten', crowded, []);
ok('Orte auf einem Punkt nennen dieselbe Straße', mixedSpots, []);

/* Die Prüfliste nennt Zahlen im Kopf. Abgeschrieben veralten sie. */
const listeDoc = readFileSync(join(root, 'docs', 'koordinaten-pruefliste.md'), 'utf8');
const withGeo = data.places.filter((p) => p.geo).length;
const head = listeDoc.match(/(\d+) Orte · (\d+) mit Koordinaten · (\d+) offen/);
truthy('die Prüfliste nennt ihre Zahlen im Kopf', !!head);
if (head) {
  ok('Prüfliste: Zahl der Orte stimmt', Number(head[1]), data.places.length);
  ok('Prüfliste: Zahl der Koordinaten stimmt', Number(head[2]), withGeo);
  ok('Prüfliste: Zahl der offenen stimmt', Number(head[3]), data.places.length - withGeo);
}

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
const ORDER_LABEL = ['frueh', 'mittag', 'nachmittag', 'abend'];

function stats() {
  const P = data.places.map((p) => ({ ...p, tags: p.tags || [] }));
  const n = P.length;

  /* Alle Orte sind von Hand eingeordnet. Interessant ist damit nicht mehr,
     welche Herleitungsstufe greift, sondern wie die Abschnitte besetzt sind:
     ein Abschnitt mit zu wenigen Orten hat auf „Heute" nichts zu zeigen. */
  const seg = { frueh: 0, mittag: 0, nachmittag: 0, abend: 0 };
  let explicit = 0, noSuggestion = 0, derivedStill = 0;
  for (const p of P) {
    if (!Array.isArray(p.moment)) { derivedStill++; continue; }
    explicit++;
    if (!p.moment.length) { noSuggestion++; continue; }
    for (const m of p.moment) seg[m]++;
  }
  /* Wie viele Orte je Abschnitt bleiben, wenn Jum mitkommt? Der Dauerschalter
     ist vierzehn Tage an, das ist der Normalfall und nicht der Sonderfall. */
  const segJum = { frueh: 0, mittag: 0, nachmittag: 0, abend: 0 };
  for (const p of P) {
    if (p.dog !== true || !Array.isArray(p.moment)) continue;
    for (const m of p.moment) segJum[m]++;
  }

  const ind = { true: 0, false: 0, null: 0 };
  for (const p of P) ind[String(pk.indoorOf({ ...p }))]++;
  const dog = { true: 0, false: 0, null: 0 };
  for (const p of P) dog[String(p.dog === true ? true : p.dog === false ? false : null)]++;

  const line = (k, v) => console.log('    ' + k.padEnd(38) + v);
  console.log('\n  Zahlen für die README (aus den Daten gerechnet)');
  line('Orte', n);
  line('moment im JSON gepflegt', explicit);
  line('… davon leer, kein Vorschlag', noSuggestion);
  line('ohne moment, über die Herleitung', derivedStill);
  line('Orte je Abschnitt',
       ORDER_LABEL.map((k) => `${k} ${seg[k]}`).join(' · '));
  line('… davon mit Jum',
       ORDER_LABEL.map((k) => `${k} ${segJum[k]}`).join(' · '));
  line('indoor: drinnen / draußen / offen',
       `${ind.true} / ${ind.false} / ${ind.null}`);
  line('dog: true / false / ungeklärt', `${dog.true} / ${dog.false} / ${dog.null}`);
  line('geo gesetzt / fehlt',
       `${P.filter((p) => p.geo).length} / ${P.filter((p) => !p.geo).length}`);
  /* Mehrere Orte auf einem Punkt heisst meist: der Dienst gab einen
     Ortsmittelpunkt statt der Adresse. Teils harmlos (Nachbarn), teils
     grob — aufgelistet in docs/koordinaten-pruefliste.md. */
  const spots = new Map();
  for (const p of P) {
    if (!p.geo) continue;
    const k = `${p.geo.lat},${p.geo.lon}`;
    spots.set(k, (spots.get(k) || 0) + 1);
  }
  line('Punkte mit mehr als einem Ort',
       [...spots.values()].filter((n) => n > 1).length);
  line('hours fehlt', P.filter((p) => !p.hours).length);
  const shut = P.filter((p) => pk.closedOn(p.hours) !== null);
  line('Ruhetag lesbar in hours', shut.length);
  const mitGeo = P.filter((p) => p.geo);
  const fern = mitGeo.map((p) => pk.airKmPoint(data.meta.base_geo, p.geo));
  line('Luftlinie ab Zeltplatz: max / median',
    `${Math.round(Math.max(...fern))} km / `
    + `${(fern.slice().sort((a, b) => a - b)[Math.floor(fern.length / 2)]).toFixed(1)} km`);

  /* Der Umwegfaktor sagt mehr ueber die Daten als jede Einzelzahl: Strasse
     geteilt durch Luftlinie liegt real zwischen 1,1 und 1,6. Ein Median weit
     darueber heisst, dass der Bezugspunkt nicht stimmt -- genau so ist am
     19.09. aufgefallen, dass base_geo im Hafen lag statt am Zeltplatz (Median
     1,69 statt 1,25). Unter 1 ist die Luftlinie laenger als die Strasse, also
     unmoeglich; dort stimmt entweder die Koordinate oder distance_km nicht.

     Bewusst eine Meldung und keine Pruefung: distance_km ist auf 0,1 km
     gerundet, und bei einem Ort in Sichtweite kippt das den Faktor schon ohne
     jeden Fehler. Was auffallen soll, ist die Verschiebung des Medians. */
  const paare = data.places
    .filter((p) => p.geo && typeof p.distance_km === 'number' && p.distance_km > 0)
    .map((p) => ({ id: p.id, f: p.distance_km / pk.airKmPoint(data.meta.base_geo, p.geo) }))
    .filter((r) => Number.isFinite(r.f));
  const sortiert = paare.map((r) => r.f).sort((a, b) => a - b);
  line('Umwegfaktor Strasse/Luft: median',
    sortiert[Math.floor(sortiert.length / 2)].toFixed(2));
  const unmoeglich = paare.filter((r) => r.f < 1).map((r) => r.id);
  line('… Luftlinie laenger als Strasse',
    unmoeglich.length ? `${unmoeglich.length}: ${unmoeglich.join(', ')}` : 'keine');
  line('… verteilt auf', ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
    .map((w, i) => ({ w, n: shut.filter((p) => pk.closedOn(p.hours) === (i + 1) % 7).length }))
    .filter((x) => x.n).map((x) => `${x.w} ${x.n}`).join(' · '));
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
