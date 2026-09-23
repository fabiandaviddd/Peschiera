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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(import.meta.url);

const pk = require(join(root, 'app.js'));
const placesRaw = readFileSync(join(root, 'data', 'places.json'), 'utf8');
const data = JSON.parse(placesRaw);
/* Seit v38 liegt das Wissen in einer eigenen Datei. Bis v37 standen die drei
   Listen IN places.json, und die Suche fand sie nie -- sie geht ueber Orte,
   und das Wissen war keiner. */
const wissenRaw = readFileSync(join(root, 'data', 'wissen.json'), 'utf8');
const wissen = JSON.parse(wissenRaw);

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
/* Bis v47 stand hier "ergibt false". Ein Index ist kein Datum, closedToday
   faellt dann auf HEUTE zurueck -- und an einem Mittwoch ist der Ruhetag
   Mittwoch eben heute. Die Pruefung schlug damit jede Woche einen Tag lang
   fehl, zuerst am 23.09.2026. Gemeint war nie "false", sondern: stuerzt
   nicht ab und verhaelt sich wie ohne Datum. */
ok('ein durchgereichter Index stuerzt nicht ab',
   pk.closedToday(ruhetagMi, 1), pk.closedToday(ruhetagMi));
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

/* -------------------------------------------------- Termin: die dritte Lage */
group('terminStand — laeuft, kommt, vorbei');

/* runsToday sagte bis v44 nur ja oder nein, und sein Nein hiess dasselbe
   fuer einen Ort ohne Termin wie fuer eine Veranstaltung in vier Tagen.
   Daran lag es, dass die Rievocazione (25.–27.09.) am 21.09. unter "Jetzt"
   stand und die Festa di Castelnuovo (18.–20.09.) auch noch, als sie
   vorbei war. */
const stand = (badge, d) => pk.terminStand({ badge }, new Date(2026, 8, d));
ok('vor dem Termin', stand('25.–27.09.', 21), 'kommt');
ok('am ersten Tag', stand('25.–27.09.', 25), 'laeuft');
ok('am letzten Tag', stand('25.–27.09.', 27), 'laeuft');
ok('danach', stand('25.–27.09.', 28), 'vorbei');
ok('Einzeltermin davor', stand('Di 22.09.', 21), 'kommt');
ok('Einzeltermin danach', stand('Di 22.09.', 23), 'vorbei');
ok('kein Termin bleibt null', stand('Fine Dining', 21), null);
ok('ohne Badge bleibt null', pk.terminStand({}, sep19), null);

/* null darf nie zu "laeuft heute nicht" werden -- sonst faellt jeder Ort
   ohne Datum aus den Vorschlaegen. */
ok('terminAm ohne Termin ist null', pk.terminAm({ badge: 'Rohfisch' }, '2026-09-21'), null);
ok('terminAm am falschen Tag', pk.terminAm({ badge: '25.–27.09.' }, '2026-09-21'), false);
ok('terminAm am richtigen Tag', pk.terminAm({ badge: '25.–27.09.' }, '2026-09-26'), true);

/* Die drei Auskuenfte muessen zu runsToday und daysUntil passen -- sie
   lesen denselben Ausdruck, und drei Leser driften schneller als zwei. */
const dreiEinig = [18, 20, 21, 22, 25, 26, 27, 28].every((d) => {
  const n = new Date(2026, 8, d);
  const t = { badge: '25.–27.09.' };
  const st = pk.terminStand(t, n);
  return pk.runsToday(t, n) === (st === 'laeuft')
      && (pk.daysUntil(t, n) === null) === (st === 'vorbei');
});
truthy('terminStand, runsToday und daysUntil sind sich einig', dreiEinig);

/* Und an den Daten selbst: an jedem Reisetag darf kein Termin als laufend
   gelten, dessen Spanne den Tag nicht enthaelt. */
const terminOrte = data.places.filter((p) => pk.terminStand(p, new Date(2026, 8, 19)) !== null);
const falschLaufend = [];
for (const p of terminOrte) {
  for (let d = 14; d <= 28; d++) {
    const iso = `2026-09-${String(d).padStart(2, '0')}`;
    const st = pk.terminStand(p, new Date(2026, 8, d));
    if ((st === 'laeuft') !== (pk.terminAm(p, iso) === true)) falschLaufend.push(`${p.id} ${iso}`);
  }
}
ok('terminAm und terminStand stimmen an allen 15 Reisetagen überein', falschLaufend, []);
console.log('    ' + 'Orte mit Termin'.padEnd(38) + terminOrte.map((p) => p.id).join(' · '));

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

/* ---------------------------------------------------------- Dynamic Type */
/* iOS laesst die Schriftgroesse systemweit einstellen. Alle Groessen im Haus
   haengen an rem -- steht die Wurzel auf der Systemgroesse, waechst die App
   mit. Zwei Grenzen gehoeren dazu, und genau die werden hier gerechnet. */
group('typeSkala — die Systemschrift, in Grenzen');

ok('die Vorgabe bleibt, wie sie ist', pk.typeSkala(16), 16);
ok('eine groessere Einstellung kommt durch', pk.typeSkala(20), 20);
/* Nach unten nicht unter 16: iOS zoomt beim Fokus in ein Eingabefeld, dessen
   Schrift kleiner ist, und das Suchfeld steht auf 1rem. Eine kleiner
   eingestellte Systemschrift wuerde jedes Tippen zu einem Zoom machen. */
ok('kleiner als 16 wird nicht durchgereicht', pk.typeSkala(12), 16);
ok('… auch nicht knapp darunter', pk.typeSkala(15.5), 16);
/* Nach oben nicht ueber 24: darueber bleibt bei 402 px Breite von einer
   Zeile mit Name, Bewertung und vier Fakten nichts Lesbares uebrig. */
ok('groesser als 24 wird gekappt', pk.typeSkala(53), 24);
ok('… und genau 24 bleibt', pk.typeSkala(24), 24);
ok('die Grenzen sind die dokumentierten', [pk.TYPE_MIN, pk.TYPE_MAX], [16, 24]);
/* Kennt der Browser das Schluesselwort nicht, kommt 0 zurueck -- dann bleibt
   die Wurzel unberuehrt statt auf 16 gezwungen zu werden. */
ok('ohne Messung bleibt es bei null', pk.typeSkala(0), null);
ok('… und auch bei Unsinn', pk.typeSkala('gross'), null);
ok('… und bei NaN', pk.typeSkala(NaN), null);

/* ------------------------------------------------- Sprache der Ortsnamen */
/* VoiceOver liest die Seite in der Sprache aus <html> -- hier Deutsch.
   "Osteria sugli Scavi" wird dann buchstabengetreu deutsch ausgesprochen,
   und wer danach fragt, wird nicht verstanden. */
group('sprachIt — welcher Name italienisch gelesen wird');

ok('ein italienischer Name gilt als italienisch', pk.sprachIt('Osteria sugli Scavi'), true);
ok('… auch mit Klammern', pk.sprachIt('Bella Italia Pesce (BIP)'), true);
/* Die Regel ist umgekehrt gebaut: italienisch, ES SEI DENN ein deutsches
   oder englisches Wort steht darin. Das ist die sichere Richtung -- wer
   nicht markiert wird, wird gelesen wie bisher. */
ok('ein deutsches Wort schliesst aus', pk.sprachIt('Festung Peschiera'), false);
ok('… auch mitten im Namen', pk.sprachIt('Giro delle Mura — Bootsfahrt'), false);
ok('ein englisches Wort ebenso', pk.sprachIt('Velolake Bike Rental'), false);
ok('leer ist nichts', pk.sprachIt(''), false);
ok('… und null auch nicht', pk.sprachIt(null), false);
/* "Bar" schliesst aus, "Barcaccia" nicht -- die Regel prueft ganze Woerter. */
ok('nur ganze Woerter zaehlen', pk.sprachIt('La Barcaccia'), true);
ok('… und "Lounge Bar" ist eines', pk.sprachIt('Lido 3.9 Lounge Bar'), false);

{
  /* Die grosse Mehrheit ist italienisch -- waere es umgekehrt, stimmte die
     Regel nicht mehr mit den Daten ueberein. Die Zahl selbst steht unten im
     Bericht. */
  const it = data.places.filter((x) => pk.sprachIt(x.name)).length;
  ok('die Mehrheit der Namen gilt als italienisch', it > data.places.length / 2, true);
}

/* ----------------------------------------------------------------- Wissen */
group('wissen.json — Gruppen, Arten, Kennungen');

ok('places.json trägt kein Wissen mehr',
   ['merken', 'open_questions', 'faktencheck'].filter((k) => k in data), []);
ok('wissen.json hat Gruppen', wissen.gruppen.length > 0, true);
ok('… und Einträge', wissen.eintraege.length > 0, true);

/* Kennungen sind Lesezeichen-fest: doppelte machten zwei Eintraege
   ununterscheidbar. */
ok('jede Kennung kommt genau einmal vor',
   new Set(wissen.eintraege.map((e) => e.id)).size, wissen.eintraege.length);
ok('keine Kennung ist leer', wissen.eintraege.filter((e) => !e.id).length, 0);

/* Eine unbekannte Gruppe hiesse: der Eintrag steht in keiner Sektion und ist
   unsichtbar. Die App faengt das ab, die Datei soll es gar nicht erst
   enthalten. */
{
  const ids = new Set(wissen.gruppen.map((g) => g.id));
  const fremd = wissen.eintraege.filter((e) => !ids.has(e.gruppe)).map((e) => e.id);
  ok('jeder Eintrag liegt in einer bekannten Gruppe', fremd, []);
  const leer = wissen.gruppen.filter((g) =>
    !wissen.eintraege.some((e) => e.gruppe === g.id)).map((g) => g.id);
  ok('keine Gruppe ist leer', leer, []);
}

ok('die Art ist immer eine der drei',
   wissen.eintraege.filter((e) => ['regel', 'offen', 'korrektur'].indexOf(e.art) < 0), []);
ok('jeder Eintrag hat Text oder Titel',
   wissen.eintraege.filter((e) => !e.text && !e.titel), []);

/* Genau eine gepinnte Gruppe, und sie ist nicht leer: "gepinnt" heisst oben,
   immer -- zwei davon waeren keine Rangfolge mehr. */
{
  const pin = wissen.gruppen.filter((g) => g.pin === true);
  ok('genau eine Gruppe ist gepinnt', pin.length, 1);
  ok('… und sie heißt Notfall', pin[0].titel, 'Notfall');
  ok('… und steht an erster Stelle', wissen.gruppen[0].id, pin[0].id);
  ok('… und enthält die 112',
     wissen.eintraege.some((e) => e.gruppe === pin[0].id && /112/.test(e.text)), true);
}

/* Die Umstellung darf nichts verloren haben: 17 + 18 + 13 aus v37. */
ok('alle 48 Einträge sind mitgekommen', wissen.eintraege.length, 48);

/* ----------------------------------------------------------------- Wege */
/* Seit v37 rechnet die App Wege ZWISCHEN Orten. Geroutet wird nicht -- ein
   Routing-Dienst braucht Netz. Gerechnet wird aus der Luftlinie mal einem
   Umwegfaktor, und beide Zahlen stammen aus den eigenen Daten, nicht aus
   einer Faustregel. Genau das wird hier nachgerechnet: kippen die Daten,
   kippt diese Pruefung -- nicht die App still. */
group('Wege — gerechnet, nicht geroutet');

const mitte = (xs) => {
  const a = xs.slice().sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const basis = data.meta.base_geo;

/* 1. Der Umwegfaktor. Strasse geteilt durch Luftlinie ab dem Zeltplatz. */
const faktoren = data.places
  .filter((p) => p.geo && typeof p.distance_km === 'number' && p.distance_km > 0)
  .map((p) => p.distance_km / pk.airKmPoint(basis, p.geo))
  .filter(Number.isFinite);
ok('UMWEG entspricht dem Median aus den Daten',
   Number(mitte(faktoren).toFixed(2)), pk.UMWEG);

/* 2. Die Gehgeschwindigkeit. Zurueckgerechnet aus walk_min und distance_km:
      so schnell sind die beiden mit Jum wirklich unterwegs. */
const tempi = data.places
  .filter((p) => typeof p.walk_min === 'number' && p.walk_min > 0
                 && typeof p.distance_km === 'number' && p.distance_km > 0)
  .map((p) => p.distance_km / (p.walk_min / 60));
ok('V_FUSS entspricht dem Median aus den gemessenen Fusswegen',
   Number(mitte(tempi).toFixed(1)), pk.V_FUSS);

/* 3. Die Gegenprobe gegen die Messung. Kriterium aus dem Konzept (Annahme
      A7): der Median der Abweichung bleibt unter 20 %. Kein Mittelwert --
      ein einziger Ort in Sichtweite mit auf 0,1 km gerundetem distance_km
      kippt den, ohne dass irgendetwas falsch waere. */
const abw = data.places
  .filter((p) => p.geo && typeof p.walk_min === 'number' && p.walk_min > 0)
  .map((p) => Math.abs(pk.wegMin(pk.wegKm({ geo: basis }, p), 'fuss') - p.walk_min) / p.walk_min);
ok('die Rechnung trifft die Messung im Median auf 20 % genau',
   mitte(abw) < 0.2, true);

/* 4. Die Formeln selbst. 9 km Weg: zu Fuss zwei Stunden, mit dem Rad 36
      Minuten, mit dem Auto 12 plus 10 Minuten Parken. */
ok('zu Fuss: 9 km sind 120 Min', pk.wegMin(9, 'fuss'), 120);
ok('mit Rad: 9 km sind 36 Min', pk.wegMin(9, 'rad'), 36);
ok('mit Auto: 9 km sind 12 Min plus 10 Min Parken', pk.wegMin(9, 'auto'), 22);
/* Der feste Zuschlag faellt je Fahrt an, nicht je Kilometer -- und bei einem
   Weg von null faellt er gar nicht an, sonst kostete das Nebenhaus zehn
   Minuten Parken. */
ok('ohne Weg kein Parkzuschlag', pk.wegMin(0, 'auto'), 0);
ok('ein unbekannter Modus rechnet zu Fuss', pk.wegMin(9, 'quatsch'), 120);
ok('ohne Strecke kein Weg', pk.wegMin(null, 'fuss'), null);

/* 5. Ohne geo wird nicht geraten. */
ok('ein Ort ohne geo hat keinen Weg',
   pk.wegKm({ geo: null }, data.places[0]), null);

/* 6. Der Modusvorschlag haengt am GROESSTEN Sprung, nicht an der Summe:
      eine Kette mit einem Sprung von 30 km ist kein Fussweg, auch wenn die
      anderen drei je 500 m lang sind. */
const nah = data.places
  .filter((p) => p.geo && pk.airKmPoint(basis, p.geo) < 1.5).slice(0, 3);
const fern = data.places
  .filter((p) => p.geo && pk.airKmPoint(basis, p.geo) > 25)[0];
ok('drei nahe Orte sind ein Fusstag', pk.tagModusVorschlag(nah), 'fuss');
ok('einer weit draussen macht daraus einen Autotag',
   pk.tagModusVorschlag(nah.concat([fern])), 'auto');
ok('ein einzelner Ort hat keinen Weg und bleibt zu Fuss',
   pk.tagModusVorschlag([nah[0]]), 'fuss');
ok('ein leerer Tag auch', pk.tagModusVorschlag([]), 'fuss');

/* 7. Die Kette. Summe, Strecke und der groesste Sprung muessen zu den
      Einzelwegen passen -- und Paare ohne geo zaehlen nicht mit, sondern
      werden gezaehlt. */
const kette = pk.tagWege(nah.concat([fern]), 'auto');
ok('drei Wege bei vier Stationen', kette.wege.length, 3);
ok('die Summe ist die Summe der Einzelwege',
   kette.min, kette.wege.reduce((a, x) => a + (x ? x.min : 0), 0));
ok('der groesste Sprung ist der groesste Einzelweg',
   Number(kette.weit.toFixed(3)),
   Number(Math.max(...kette.wege.map((x) => (x ? x.km : 0))).toFixed(3)));
const luecke = pk.tagWege([nah[0], { id: 'x', geo: null }, nah[1]], 'fuss');
ok('ein Ort ohne geo reisst zwei Luecken', luecke.luecken, 2);
ok('… und die Summe bleibt null', luecke.min, 0);

/* ------------------------------------------------------- Die kuerzeste Runde */
/* "Sortierung nach kuerzester Runde" stand seit v28 unter "Spaeter
   angedacht". Sie war nicht machbar, solange die App keine Wege zwischen
   zwei Orten kannte. Gerechnet wird eine RUNDE, kein Pfad: abends schlaeft
   man wieder auf dem Zeltplatz. */
group('rundenVorschlag — kuerzeste Runde ab dem Zeltplatz');

pk.useData(data);

/* Drei Orte in bewusst schlechter Reihenfolge: der weiteste zuerst. Die
   Runde muss kuerzer werden -- oder die Reihenfolge war schon die beste. */
const dreiNah = data.places
  .filter((p) => p.geo && pk.airKmPoint(basis, p.geo) < 2)
  .slice(0, 6);
ok('genug nahe Orte fuer den Test', dreiNah.length, 6);

const v6 = pk.rundenVorschlag(dreiNah, 'fuss');
ok('sechs Stationen ergeben einen Vorschlag', !!v6, true);
ok('… exakt gerechnet, nicht geschaetzt', v6.exakt, true);
ok('… und er ist nie laenger als die jetzige Reihenfolge', v6.km <= v6.altKm + 1e-9, true);
ok('… mit allen Stationen, keine verloren', v6.orte.length, dreiNah.length);
ok('… und ohne Dubletten', new Set(v6.orte.map((p) => p.id)).size, dreiNah.length);

/* Die exakte Rechnung gilt bis acht Stationen. Darueber uebernimmt
   Naechster-Nachbar plus 2-opt -- das Ergebnis muss immer noch eine
   vollstaendige, dublettenfreie Runde sein. */
const neun = data.places.filter((p) => p.geo).slice(0, pk.RUNDE_EXAKT + 1);
const v9 = pk.rundenVorschlag(neun, 'fuss');
ok('ueber acht Stationen wird geschaetzt', v9.exakt, false);
ok('… aber die Runde bleibt vollstaendig', v9.orte.length, neun.length);
ok('… und dublettenfrei', new Set(v9.orte.map((p) => p.id)).size, neun.length);
ok('… und nicht laenger als vorher', v9.km <= v9.altKm + 1e-9, true);

/* Ein schon optimal sortierter Tag meldet das, statt eine Runde ohne
   Gewinn anzubieten. */
const schonGut = pk.rundenVorschlag(v6.orte, 'fuss');
ok('eine schon optimale Reihenfolge wird als solche erkannt', schonGut.gleich, true);

/* Orte ohne geo lassen sich nicht einsortieren. Sie bleiben hinten stehen,
   statt an eine geratene Stelle zu wandern. */
const mitLuecke = dreiNah.slice(0, 4).concat([{ id: 'ohne-geo', name: 'X', geo: null }]);
const vL = pk.rundenVorschlag(mitLuecke, 'fuss');
ok('ein Ort ohne geo wird gezaehlt', vL.ohne, 1);
ok('… und steht hinten', vL.orte[vL.orte.length - 1].id, 'ohne-geo');

/* Unter drei Stationen gibt es nichts zu drehen: A-B und B-A sind dieselbe
   Runde. Ein Vorschlag waere dort ein Knopf ohne Wirkung. */
ok('zwei Stationen ergeben keinen Vorschlag',
   pk.rundenVorschlag(dreiNah.slice(0, 2), 'fuss'), null);
ok('eine auch nicht', pk.rundenVorschlag(dreiNah.slice(0, 1), 'fuss'), null);

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
group('daysUntil — Termine mit Vorlauf');

/* "Laeuft heute" ist beim Wochenmarkt am Dienstag zu spaet. */
const termin = (badge) => ({ badge });
const amTag = (t, d) => pk.daysUntil(t, new Date(2026, 8, d));   // September 2026
ok('laeuft heute', amTag(termin('25.–27.09.'), 26), 0);
ok('erster Tag zaehlt als laufend', amTag(termin('25.–27.09.'), 25), 0);
ok('letzter Tag zaehlt als laufend', amTag(termin('25.–27.09.'), 27), 0);
ok('einen Tag vorher', amTag(termin('25.–27.09.'), 24), 1);
ok('drei Tage vorher', amTag(termin('25.–27.09.'), 22), 3);
ok('danach ist es vorbei', amTag(termin('25.–27.09.'), 28), null);
ok('Einzeltermin', amTag(termin('Di 22.09.'), 20), 2);
ok('Schraegstrich-Spanne', amTag(termin('26./27.09.'), 25), 1);
ok('ohne Badge kein Termin', pk.daysUntil({}, new Date(2026, 8, 20)), null);
ok('Badge ohne Datum ist kein Termin', amTag(termin('Der Abend'), 20), null);

/* runsToday und daysUntil lesen denselben Ausdruck -- sie muessen sich einig
   sein, sonst steht "in 0 Tagen" ueber einem Ort, der laut Liste nicht laeuft. */
const einig = [20, 22, 25, 26, 27, 28].every((d) => {
  const n = new Date(2026, 8, d);
  return pk.runsToday(termin('25.–27.09.'), n) === (pk.daysUntil(termin('25.–27.09.'), n) === 0);
});
truthy('runsToday und daysUntil sind sich einig', einig);

/* Die vier echten Termine im Bestand, gegen den Reisezeitraum gerechnet. */
const mitTermin = data.places
  .map((p) => ({ id: p.id, d: pk.daysUntil(p, new Date(2026, 8, 19)) }))
  .filter((t) => t.d !== null);
console.log('    ' + 'Termine ab dem 19.09.'.padEnd(38) + (mitTermin.map((t) => `${t.id} ${t.d}`).join(' · ') || 'keine'));

group('dogOf — vier Zustaende, eure Angabe gewinnt');

/* Bis v33 waren es drei Werte und ein Filter, der alles ausser true
   ausblendete: 62 von 101 Orten verschwanden, obwohl nur 4 ein
   ausdrueckliches "nein" tragen. Seit v34 gibt es einen vierten Zustand --
   das, was ihr vor Ort erfahren habt -- und er schlaegt den Katalog. */
pk.useData({ places: [
  { id: 'ja', dog: true, tags: [] },
  { id: 'nein', dog: false, tags: [] },
  { id: 'offen', dog: null, tags: [] },
  { id: 'ohnefeld', tags: [] },
] });
pk.useState({ dog: {} });
const d = (id) => pk.dogOf(pk.grundmenge().find((p) => p.id === id));

ok('Katalog: true', d('ja'), { v: true, q: 'katalog', at: '' });
ok('Katalog: false', d('nein'), { v: false, q: 'katalog', at: '' });
ok('Katalog: null ist offen, nicht nein', d('offen'), { v: null, q: 'offen', at: '' });
ok('fehlendes Feld zaehlt wie null', d('ohnefeld'), { v: null, q: 'offen', at: '' });
ok('… und als Wort', pk.dogState(pk.grundmenge().find((p) => p.id === 'offen')), 'offen');

/* Eure Angabe ueberschreibt den Katalog — in beide Richtungen. */
pk.useState({ dog: { offen: { v: true, at: '2026-09-20T19:44' } } });
ok('eure Angabe fuellt eine Luecke', d('offen'), { v: true, q: 'ihr', at: '2026-09-20T19:44' });
ok('… und heisst dann "ihr"', pk.dogState(pk.grundmenge().find((p) => p.id === 'offen')), 'ihr');
pk.useState({ dog: { ja: { v: false, at: '2026-09-21T10:00' } } });
ok('eure Angabe schlaegt auch ein belegtes Ja', d('ja').v, false);
ok('… und bleibt als eure erkennbar', d('ja').q, 'ihr');

/* Die Bilanz ist die Zahl, die in "Wissen" steht und ueber die Reise
   kuerzer werden soll. Ein von euch geklaerter Ort zaehlt nicht mehr als
   offen — sonst waere die Arbeit unsichtbar. */
pk.useState({ dog: { offen: { v: true, at: '2026-09-20T19:44' } } });
ok('Bilanz zaehlt eure Klaerungen getrennt',
   pk.dogBilanz(), { ja: 1, ihr: 1, offen: 1, nein: 1 });
ok('dogCount zaehlt Katalog und eure zusammen', pk.dogCount(), 2);
pk.useState({ dog: { nein: { v: true, at: '2026-09-22T09:00' } } });
ok('ein von euch geklaertes Nein wandert auf die Ja-Seite',
   pk.dogBilanz(), { ja: 1, ihr: 1, offen: 2, nein: 0 });
pk.useState({ dog: {} });

group('grundmenge und markiere — ohne Browser');

/* grundmenge() ist die einzige Quelle fuer selected() UND fuer die Zaehler an
   den Chips. Im Plan ist das die Merkliste. Dass der Nutzer die Zaehler dort
   heute gar nicht sieht (render() blendet die Filterzeile aus), aendert nichts
   daran, dass die Funktion stimmen muss. */
pk.useData({ places: [
  { id: 'a', tags: [] }, { id: 'b', tags: [] }, { id: 'c', tags: [] },
] });
pk.useState({ view: 'orte', saved: ['a', 'c'] });
ok('in der Liste zaehlt die Grundmenge alle Orte', pk.grundmenge().length, 3);
pk.useState({ view: 'gemerkt' });
ok('im Plan nur die gemerkten', pk.grundmenge().map((p) => p.id), ['a', 'c']);
pk.useState({ view: 'orte', saved: [] });

/* norm() bildet nicht 1:1 ab: "ß" wird "ss". Wer eine Fundstelle im
   normalisierten Text sucht und ihren Index roh auf das Original anwendet,
   markiert ab dort daneben -- und zwar still. */
const stellen = pk.normStellen('Straße');
ok('normStellen laengt bei ß mit', stellen.text, 'strasse');
ok('… und zeigt beide s auf dasselbe Zeichen', stellen.map, [0, 1, 2, 3, 4, 4, 5]);

pk.useState({ q: 'strasse' });
ok('markiert ueber die Laengenaenderung hinweg',
   pk.markiere('Zur Straße hin'), 'Zur <mark>Straße</mark> hin');
/* "caffe" trifft, "cafe" nicht -- das è wird zu e, das doppelte f bleibt. */
pk.useState({ q: 'caffe' });
ok('markiert trotz Diakritikum', pk.markiere('Caffè Momus'), '<mark>Caffè</mark> Momus');
pk.useState({ q: 'cafe' });
ok('… und erfindet keinen Treffer', pk.markiere('Caffè Momus'), 'Caffè Momus');
pk.useState({ q: 'a b' });
ok('markiert jeden Begriff', pk.markiere('a und b'), '<mark>a</mark> und <mark>b</mark>');
pk.useState({ q: 'x' });
ok('ohne Treffer bleibt der Text unveraendert', pk.markiere('nichts hier'), 'nichts hier');

/* Escapen kommt VOR dem Einsetzen von <mark>. Andersherum baut man eine
   Luecke, durch die eine Notiz eigenes HTML in die Seite bekaeme. */
pk.useState({ q: 'skript' });
ok('Markierung escapt weiterhin',
   pk.markiere('<b>skript</b> & "mehr"'),
   '&lt;b&gt;<mark>skript</mark>&lt;/b&gt; &amp; &quot;mehr&quot;');
pk.useState({ q: '<mark>' });
ok('ein Suchbegriff kann kein HTML einschleusen',
   pk.markiere('harmlos').indexOf('<mark>'), -1);
pk.useState({ q: '' });

group('manifest.webmanifest — was drinsteht, muss es geben');

/* Bis v18 fasste keine einzige Pruefung das Manifest an. Ein Tippfehler im
   Pfad faellt sonst erst auf, wenn jemand die App installieren will -- und
   dann sieht man nur einen leeren Dialog, keinen Fehler. */
let mani = null;
try { mani = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8')); }
catch (e) { /* faellt unten auf */ }
truthy('ist gültiges JSON', !!mani);

/* Die Groesse steht im PNG-Kopf ab Byte 16, gross-endian. Abgeschriebene
   sizes veralten sonst still, sobald jemand ein Bild neu erzeugt. */
const pngMasse = (rel) => {
  const b = readFileSync(join(root, rel.replace(/^\.\//, '')));
  return `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`;
};
const bilder = []
  .concat(mani?.icons || [], mani?.screenshots || [],
          (mani?.shortcuts || []).flatMap((s) => s.icons || []));
const fehlend = bilder.filter((b) => !existsSync(join(root, String(b.src).replace(/^\.\//, ''))));
ok('jede Bilddatei existiert', fehlend.map((b) => b.src), []);
const falscheMasse = bilder
  .filter((b) => b.sizes && !String(b.sizes).includes(' ')
                 && existsSync(join(root, String(b.src).replace(/^\.\//, ''))))
  .filter((b) => pngMasse(b.src) !== b.sizes)
  .map((b) => `${b.src}: steht ${b.sizes}, ist ${pngMasse(b.src)}`);
ok('sizes stimmen mit dem Bild überein', falscheMasse, []);

/* Kurzbefehle und Screenshots stehen bewusst NICHT im Manifest: sie wirken nur
   in einer installierten App, und diese hier laeuft in Safari. Die Pruefung
   bleibt trotzdem stehen -- traegt sie jemand wieder ein, muss wenigstens die
   Zielansicht existieren. */
const tabIds = [...(readFileSync(join(root, 'app.js'), 'utf8')
  .match(/var TABS = \[([\s\S]*?)\];/) || [, ''])[1]
  .matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
const zieleUnbekannt = (mani?.shortcuts || [])
  .map((s) => (/[?&]v=([a-z]+)/.exec(s.url || '') || [])[1])
  .filter((v) => v && tabIds.indexOf(v) < 0);
ok('jeder Kurzbefehl zeigt auf eine echte Ansicht', zieleUnbekannt, []);

group('Der Name steht überall gleich');

/* Mit v44 heisst die App Arilica -- der roemische Name Peschieras. Ein
   Umbenennen faellt sonst genau dort durch, wo niemand oft hinsieht: im
   Manifest, im iOS-Titel, im Namen des Caches. Der Ort heisst weiter
   Peschiera; geprueft wird nur, wo die App sich selbst benennt. */
const NAME = 'Arilica';
const idxSrc = readFileSync(join(root, 'index.html'), 'utf8');
const holen = (re) => (idxSrc.match(re) || [, ''])[1];

truthy('index.html: der Seitentitel nennt die App',
       holen(/<title>([^<]*)<\/title>/).includes(NAME));
ok('index.html: der iOS-Titel ist der App-Name',
   holen(/name="apple-mobile-web-app-title" content="([^"]*)"/), NAME);
ok('index.html: der Startbildschirm nennt die App',
   holen(/<h2 id="boot-title">([^<]*)<\/h2>/), NAME);
ok('manifest: name', mani?.name, NAME);
ok('manifest: short_name', mani?.short_name, NAME);
truthy('manifest: die id ist auf den Namen gezogen',
       /^arilica/.test(String(mani?.id || '')));

/* Der alte Name darf nur noch dort stehen, wo er den ORT meint. In diesen
   vier Dateien benennt sich die App selbst -- hier waere er ein Rest. */
const restVomAltenNamen = ['index.html', 'manifest.webmanifest', 'sw.js', 'app.js']
  .filter((f) => /Peschiera kompakt/.test(readFileSync(join(root, f), 'utf8')));
ok('kein "Peschiera kompakt" mehr in der App selbst', restVomAltenNamen, []);

group('Zwei Worte: Merken und Tag festlegen');

/* Seit v47 gibt es fuer "das will ich machen" genau zwei Begriffe. Bis dahin
   waren es sieben: Merken, Fuer spaeter, Vorrat, + Tag, der Stern, gemerkt,
   verplant -- und die leere Reise erklaerte sie in einem Satz, den man
   dreimal lesen musste ("... legt der Tag-Waehler im Ort einen Tag fest --
   oder der Stern legt ihn hier ab").

   Geprueft wird, was man SIEHT oder vorgelesen bekommt: die
   Zeichenketten in app.js, ohne Kommentare. Die Kommentare duerfen die
   alten Namen tragen -- sie erzaehlen, wie es dazu kam. Interne Namen
   (die Klasse .vorrat, der Wert "vorrat") sind keine Woerter fuer
   Menschen und fallen durch den Filter unten heraus. */
const ohneKommentar = readFileSync(join(root, 'app.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const sichtbar = [...ohneKommentar.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
  .map((m) => m[1])
  .filter((t) => !/^[a-z0-9_.#\-\[\]="]*$/.test(t));   /* Klassen, Werte, Schluessel */
const ALTE_WORTE = [/Vorrat/, /[Ff]ür später/, /\+ Tag\b/, /verplant/, /Merkliste/,
  /Reisetag/, /Tag offen/, /keinem Tag/, /Tageszuordnung/, /Stern/, /Zusammenführen gewinnt/,
  /In den Tag/, /nichts markiert/];
const reste = [];
for (const t of sichtbar) for (const w of ALTE_WORTE) if (w.test(t)) reste.push(t.slice(0, 60));
ok('kein altes Wort mehr in dem, was man sieht', reste, []);
truthy('„Merken" kommt vor', sichtbar.some((t) => /\bMerken\b/.test(t)));
truthy('„Tag festlegen" kommt vor', sichtbar.some((t) => /Tag festlegen/.test(t)));
/* Und der Stern heisst nur noch Bewertung. */
truthy('ICON.star gibt es nicht mehr', !/ICON\.star\b/.test(ohneKommentar));

group('app.js und sw.js — dieselbe Fassung');

const appSrc = readFileSync(join(root, 'app.js'), 'utf8');
const swSrc = readFileSync(join(root, 'sw.js'), 'utf8');
const appV = (appSrc.match(/var VERSION = '([^']+)'/) || [])[1];
const swV = (swSrc.match(/var CACHE = 'arilica-([^']+)'/) || [])[1];
truthy('VERSION steht in app.js', !!appV);
truthy('CACHE steht in sw.js', !!swV);
ok('CACHE passt zu VERSION', swV, appV ? appV.split(/[\s·]/)[0] : null);
/* Der zweite Cache FONTS ist mit v23 entfallen: die Schriften liegen im Repo
   und stehen in SHELL, also raeumt CACHE sie mit ab. Bliebe die Ausnahme in
   activate() stehen, truege jedes Bestandsgeraet den alten Google-Cache
   dauerhaft mit sich herum. */
truthy('kein zweiter Schriften-Cache mehr in sw.js', !/FONTS/.test(swSrc));

group('Schriften liegen im Repo');

/* Bis v22 kam das Schriften-Stylesheet von fonts.googleapis.com und
   blockierte das erste Rendern (gemessen 229 ms). Wer es zurueckholt, soll
   hier stolpern. */
for (const datei of ['index.html', 'selbsttest.html', 'koordinaten.html']) {
  let html = '';
  try { html = readFileSync(join(root, datei), 'utf8'); } catch { continue; }
  const verweise = (html.match(/(?:href|src)="https:\/\/fonts\.(?:googleapis|gstatic)\.com[^"]*"/g) || []);
  ok(datei + ' laedt keine Schrift von Google', verweise, []);
}

/* Jede Datei, die style.css als Schrift anzieht, muss es auch geben --
   ein Tippfehler im Pfad faellt sonst erst auf dem Geraet auf, und zwar
   als stiller Rueckfall auf Georgia. */
const cssSrc = readFileSync(join(root, 'style.css'), 'utf8');
const schriften = [...cssSrc.matchAll(/src:\s*url\('(\.[^']+)'\)/g)].map((m) => m[1]);
truthy('style.css zieht Schriften aus dem Repo an', schriften.length === 4);
const schriftFehlt = schriften.filter((rel) => {
  try { return readFileSync(join(root, rel)).subarray(0, 4).toString() !== 'wOF2'; }
  catch { return true; }
});
ok('jede angezogene Schrift liegt da und ist woff2', schriftFehlt, []);

/* Vorgeladen werden darf nur, was auch angezogen wird -- ein preload auf eine
   Datei, die keine Regel nutzt, laedt sie umsonst. */
const idx = readFileSync(join(root, 'index.html'), 'utf8');
const vorab = [...idx.matchAll(/rel="preload"[^>]*href="(\.[^"]+)"/g)].map((m) => m[1]);
ok('jede vorgeladene Schrift wird auch angezogen',
  vorab.filter((v) => schriften.indexOf(v) < 0), []);
truthy('preload traegt crossorigin', vorab.length === 0
  || (idx.match(/rel="preload"[^>]*crossorigin[^>]*>/g) || []).length === vorab.length);

group('Fuss und Reiter — was der Nutzer liest');

/* meta.note ist Provenienz-Doku (Feldnamen, Messdaten, Rechenwege) und stand
   bis v26 woertlich im Fuss der App: auf dem Plan dominierte ein Absatz
   ueber "distance_km" und "meta.base_geo" die halbe Ansicht. Der Fuss zeigt
   jetzt meta.hinweis. Diese Pruefungen halten die Trennung: der Nutzertext
   darf keine Interna tragen, und die App darf nicht zurueck auf note. */
const metaH = data.meta && data.meta.hinweis;
truthy('meta.hinweis ist gepflegt', typeof metaH === 'string' && metaH.length > 20);
truthy('… und ohne Feldnamen und Interna',
  !!metaH && !/[a-z]+_[a-z]+|meta\.|base_geo|json|routing/i.test(metaH));
truthy('… und in einer Laenge, die man liest, nicht ueberfliegt',
  !!metaH && metaH.length <= 300);
truthy('der Fuss zeigt hinweis, nicht note',
  /foot-note'\)\.textContent = has\(D\.meta\.hinweis\)/.test(appSrc)
  && !/foot-note'\)\.textContent = has\(D\.meta\.note\)/.test(appSrc));

/* Der vierte Reiter hiess "Info" — das versprach ein Impressum. Er traegt
   Hunderegeln, Notruf, Trinkgeld und die offenen Punkte; sein Name muss
   sagen, was man bekommt. Die id bleibt 'info', ?v=info ist ein dokumentiertes
   Lesezeichen. */
const tabInfo = /\{ id: 'info', label: '([^']+)'/.exec(appSrc);
ok('der vierte Reiter traegt einen sagenden Namen', tabInfo && tabInfo[1], 'Wissen');

group('app.js und sw.js — dieselbe Fassung (Fortsetzung)');

/* Jede Datei in SHELL muss es auch geben, sonst fehlt sie offline. */
/* Kommentare vorher heraus: ein Blockkommentar im Array hat den Parser am
   19.09. zerlegt, und die Fehlermeldung zeigte auf die Dateiliste statt auf
   den Kommentar. */
const shell = (swSrc.match(/var SHELL = \[([\s\S]*?)\]/) || [, ''])[1]
  .replace(/\/\*[\s\S]*?\*\//g, '')
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
  /* Die Wegerechnung in einer Zeile: wie weit die Orte auseinanderliegen und
     wie viele Paare ueberhaupt noch zu Fuss in Frage kommen. Ausfuehrlich in
     scripts/make-matrix.mjs. */
  const mitGeo2 = P.filter((p) => p.geo);
  const wegPaare = [];
  for (let i = 0; i < mitGeo2.length; i++) {
    for (let j = i + 1; j < mitGeo2.length; j++) {
      wegPaare.push(pk.airKmPoint(mitGeo2[i].geo, mitGeo2[j].geo) * pk.UMWEG);
    }
  }
  const sortP = wegPaare.slice().sort((a, b) => a - b);
  line('Wege: Paare / median',
    `${wegPaare.length} / ${sortP[Math.floor(sortP.length / 2)].toFixed(1)} km`);
  line(`… zu Fuss rechenbar (bis ${pk.FUSS_MAX_KM} km)`,
    wegPaare.filter((d) => d <= pk.FUSS_MAX_KM).length);
  {
    const it = P.filter((x) => pk.sprachIt(x.name)).length;
    line('Ortsnamen italienisch / anders', `${it} / ${P.length - it}`);
  }
  line('verschiedene Tags', new Set(P.flatMap((p) => p.tags)).size);
  line('Wissen: Einträge / Gruppen', `${wissen.eintraege.length} / ${wissen.gruppen.length}`);
  line('… Regeln / offen / korrigiert',
    ['regel', 'offen', 'korrektur']
      .map((a) => wissen.eintraege.filter((e) => e.art === a).length).join(' / '));
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
