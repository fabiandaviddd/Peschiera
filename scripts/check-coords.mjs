#!/usr/bin/env node
/**
 * Haelt jede Koordinate in data/places.json gegen Nominatim.
 *
 *   node scripts/check-coords.mjs             # alle 101 Orte
 *   node scripts/check-coords.mjs lido saligusta   # nur diese ids
 *
 * Braucht Netz und laeuft deshalb NICHT im Pruefstand mit. Gedacht ist es
 * wie add-coords.mjs: gelegentlich von Hand, und immer, wenn eine Adresse
 * sich geaendert hat.
 *
 * Warum es diese Datei gibt. Die beiden alten Regeln (Ortsname im Treffer,
 * Luftlinie nicht laenger als die Strasse) fangen den groben Fehler --
 * Lazise statt Peschiera. Sie fangen den haeufigeren nicht: der Dienst
 * liefert auf "Lungolago Giuseppe Garibaldi 17" die STRASSE statt der
 * Hausnummer, und die Strasse ist einen halben Kilometer lang. Der Punkt
 * liegt dann im richtigen Ort, in der richtigen Strasse, und trotzdem
 * falsch. So lag der Strand Lido ai Pioppi bis v45 570 m neben dem
 * Zeltplatz, auf dem er liegt.
 *
 * Diese Pruefung fragt deshalb nach dem NAMEN und laesst Strassen,
 * Gemeinden und Verwaltungsgrenzen als Bestaetigung nicht gelten. Was uebrig
 * bleibt, ist ein benanntes Objekt -- und dessen Abstand zur gespeicherten
 * Koordinate ist die Antwort.
 *
 * Sie entscheidet nichts. Sie zeigt, wo nachzusehen ist: ein Uferweg oder
 * ein Radweg HAT keinen Punkt, und der Hafen als Anfang des Weges ist dort
 * die richtige Wahl, auch wenn kein Treffer sie bestaetigt.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'arilica/1.0 (https://github.com/fabiandaviddd/Peschiera)';
/* Dieselbe Reisegegend wie in add-coords.mjs */
const BOX = { lonMin: 10.35, latMax: 45.95, lonMax: 11.15, latMin: 45.05 };
const PAUSE = 1150;                  // ms -- Nominatim erlaubt 1 Anfrage/s
const GRENZE = 0.25;                 // km, ab hier wird nachgesehen
const NAH = 0.12;                    // km, ab hier ist es bestaetigt

/* Strassen, Orte, Grenzen und Flaechennutzung bestaetigen nichts: genau sie
   liefert der Dienst, wenn er die Hausnummer nicht kennt. */
const GROB = /^(highway|boundary|place|landuse|railway)$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const luft = (a, b) => {
  const R = 6371.0088, r = (x) => x * Math.PI / 180;
  const dp = r(b.lat - a.lat), dl = r(b.lon - a.lon);
  const h = Math.sin(dp / 2) ** 2
    + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

async function frage(q) {
  const u = new URL('https://nominatim.openstreetmap.org/search');
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '10');
  u.searchParams.set('viewbox', `${BOX.lonMin},${BOX.latMax},${BOX.lonMax},${BOX.latMin}`);
  u.searchParams.set('bounded', '1');
  const r = await fetch(u, { headers: { 'User-Agent': UA, 'Accept-Language': 'de,it' } });
  return r.ok ? r.json() : [];
}

const d = JSON.parse(await readFile(path.join(ROOT, 'data', 'places.json'), 'utf8'));
const nurDiese = process.argv.slice(2);
const orte = d.places.filter((p) => p.geo && p.name
  && (!nurDiese.length || nurDiese.some((x) => p.id.includes(x))));

const auffaellig = [], ohneTreffer = [];
for (const p of orte) {
  const addr = (p.address || '').trim();
  const ort = addr.includes(',') ? addr.split(',').pop().trim() : '';
  /* "Spiaggia — Lido ai Pioppi" sucht sich als "Lido ai Pioppi": der
     erklaerende Vorsatz steht in keiner Karte. */
  const kern = p.name.split(/\s+[—–-]\s+/).pop().trim();
  const fragen = [...new Set([
    ort ? `${kern}, ${ort}, Italia` : `${kern}, Italia`,
    kern !== p.name ? (ort ? `${p.name}, ${ort}, Italia` : `${p.name}, Italia`) : null
  ].filter(Boolean))];

  let best = null;
  for (const q of fragen) {
    let res = [];
    try { res = await frage(q); } catch (e) { /* Netz weg: gilt als ohne Treffer */ }
    await sleep(PAUSE);
    for (const t of res) {
      if (GROB.test(t.category)) continue;
      const km = luft(p.geo, { lat: +t.lat, lon: +t.lon });
      if (!best || km < best.km) {
        best = { km, lat: +t.lat, lon: +t.lon, typ: `${t.category}/${t.type}`, name: t.display_name };
      }
    }
    if (best && best.km < NAH) break;
  }

  if (!best) { ohneTreffer.push(p.id); console.log(`   —       ${p.id}`); continue; }
  const heikel = best.km > GRENZE;
  if (heikel) auffaellig.push({ p, best });
  console.log(`${(heikel ? '!!' : '  ') + best.km.toFixed(3).padStart(8)}  ${p.id}`);
}

console.log('\n' + orte.length + ' Orte geprüft · ' + auffaellig.length + ' auffällig · '
  + ohneTreffer.length + ' ohne benannten Treffer');

for (const { p, best } of auffaellig) {
  console.log(`\n== ${p.id} — ${p.name}`);
  console.log(`   Adresse   ${p.address || '—'}`);
  console.log(`   gesetzt   ${p.geo.lat}, ${p.geo.lon}`);
  console.log(`   gefunden  ${best.lat}, ${best.lon}  [${best.typ}]  ${best.km.toFixed(3)} km entfernt`);
  console.log(`             ${best.name}`);
}
if (ohneTreffer.length) {
  console.log('\nOhne benannten Treffer (Wege, Strände, Veranstaltungen — von Hand ansehen):');
  console.log('  ' + ohneTreffer.join(' · '));
}
