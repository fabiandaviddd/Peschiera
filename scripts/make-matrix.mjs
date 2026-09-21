/* Die Entfernungsmatrix — oder genauer: ihre Eichung.

   Die App braucht Wege ZWISCHEN beliebigen Orten. In den Daten stehen nur
   Wege AB DEM ZELTPLATZ (walk_min, distance_km), und auch die nur bei 48 der
   101 Orte. Geroutet wird nicht: ein Routing-Dienst braucht Netz, und diese
   App funktioniert im Flugmodus.

   Gerechnet wird deshalb aus der Luftlinie, die bei allen 101 Orten vorliegt:

       weg_km  = luftlinie_km × UMWEG
       minuten = weg_km / geschwindigkeit + fester Zuschlag

   Dieses Skript holt die beiden Zahlen AUS DEN DATEN statt aus einer
   Faustregel und prueft, wie weit die Rechnung von den 48 wirklich
   gemessenen Fusswegen abweicht. Es schreibt nichts: das Ergebnis sind die
   Konstanten UMWEG und V_FUSS in app.js, und scripts/test-logic.mjs haelt
   sie gegen genau diese Rechnung. Aendern sich die Daten, faellt die Pruefung
   um — nicht die App.

   Warum keine vorgerechnete Datei? 101 × 101 Paare sind symmetrisch 5 050
   Werte, rund 12 kB binaer. Gelesen wuerden davon je Tag ein Dutzend. Der
   Haversine ist ein atan2 — 5 050 davon brauchen hier unter einer
   Millisekunde. Eine mitgelieferte Matrix waere also kein Tempogewinn,
   sondern eine zweite Wahrheit, die still veraltet, sobald ein Ort
   dazukommt. Dieselbe Begruendung wie beim Buendeln der Nadeln in v25.

       node scripts/make-matrix.mjs            Eichung und Gegenprobe
       node scripts/make-matrix.mjs --paare    dazu die groessten Spruenge
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const daten = JSON.parse(readFileSync(join(HIER, '..', 'data', 'places.json'), 'utf8'));

const R = 6371, rad = Math.PI / 180;
function luft(a, b) {
  if (!a || !b) return null;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
const median = (xs) => {
  const a = xs.slice().sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const zeile = (k, v) => console.log('  ' + k.padEnd(42) + String(v));

const basis = daten.meta.base_geo;
const orte = daten.places;
const mitGeo = orte.filter((p) => p.geo);

console.log('\nEichung der Wegerechnung\n');
zeile('Orte', orte.length);
zeile('… davon mit geo', mitGeo.length);
if (mitGeo.length !== orte.length) {
  console.log('\n  ACHTUNG: ohne geo laesst sich kein Weg rechnen — '
    + orte.filter((p) => !p.geo).map((p) => p.id).join(', '));
}

/* --- 1. Der Umwegfaktor ------------------------------------------------- */
/* Strasse geteilt durch Luftlinie, ab dem Zeltplatz. Real liegt er zwischen
   1,1 und 1,6; ein Median weit darueber heisst, dass der Bezugspunkt nicht
   stimmt — genau so ist am 19.09. aufgefallen, dass base_geo im Hafen lag
   statt am Zeltplatz. */
const mitStrasse = mitGeo.filter((p) => typeof p.distance_km === 'number' && p.distance_km > 0);
const faktoren = mitStrasse.map((p) => p.distance_km / luft(basis, p.geo)).filter(Number.isFinite);
const umweg = median(faktoren);
zeile('Orte mit distance_km', mitStrasse.length);
zeile('Umwegfaktor Strasse/Luft: median', umweg.toFixed(3));
zeile('… Spanne', Math.min(...faktoren).toFixed(2) + ' bis ' + Math.max(...faktoren).toFixed(2));

/* --- 2. Die Gehgeschwindigkeit ------------------------------------------ */
/* Nicht geschaetzt, sondern aus walk_min und distance_km zurueckgerechnet:
   so schnell sind die beiden mit Jum wirklich unterwegs. */
const mitWeg = mitStrasse.filter((p) => typeof p.walk_min === 'number' && p.walk_min > 0);
const tempi = mitWeg.map((p) => p.distance_km / (p.walk_min / 60));
const vFuss = median(tempi);
zeile('Orte mit gemessenem Fussweg', mitWeg.length);
zeile('Gehgeschwindigkeit km/h: median', vFuss.toFixed(3));

/* --- 3. Die Gegenprobe --------------------------------------------------- */
/* Die Rechnung gegen die Messung: luftlinie × umweg / tempo, verglichen mit
   walk_min. Kriterium aus dem Konzept (Annahme A7): Median der Abweichung
   hoechstens 20 %. */
const UMWEG = 1.50, V_FUSS = 4.5;   /* wie in app.js */
const abw = mitWeg.map((p) => {
  const geschaetzt = luft(basis, p.geo) * UMWEG / V_FUSS * 60;
  return { id: p.id, ist: p.walk_min, soll: geschaetzt,
           rel: Math.abs(geschaetzt - p.walk_min) / p.walk_min };
});
zeile('Konstanten in app.js', `UMWEG ${UMWEG} · V_FUSS ${V_FUSS} km/h`);
zeile('Abweichung zur Messung: median', (median(abw.map((a) => a.rel)) * 100).toFixed(1) + ' %');
zeile('… schlechtester Fall',
  (() => { const w = abw.slice().sort((a, b) => b.rel - a.rel)[0];
    return `${w.id}: ${Math.round(w.soll)} statt ${w.ist} Min (${(w.rel * 100).toFixed(0)} %)`; })());
zeile('… ueber 20 % daneben', abw.filter((a) => a.rel > 0.2).length + ' von ' + abw.length);

/* --- 4. Die Matrix selbst ------------------------------------------------ */
const n = mitGeo.length;
const paare = [];
for (let i = 0; i < n; i++) {
  for (let j = i + 1; j < n; j++) {
    const d = luft(mitGeo[i].geo, mitGeo[j].geo) * UMWEG;
    paare.push({ a: mitGeo[i].id, b: mitGeo[j].id, km: d });
  }
}
zeile('Paare (symmetrisch)', paare.length);
zeile('Weg zwischen zwei Orten: median', median(paare.map((p) => p.km)).toFixed(1) + ' km');
zeile('… unter 8 km (zu Fuss rechenbar)',
  paare.filter((p) => p.km <= 8).length + ' von ' + paare.length);

if (process.argv.includes('--paare')) {
  console.log('\n  Die zehn groessten Spruenge:');
  paare.slice().sort((x, y) => y.km - x.km).slice(0, 10)
    .forEach((p) => console.log(`    ${p.km.toFixed(1).padStart(6)} km  ${p.a} → ${p.b}`));
}

console.log('');
