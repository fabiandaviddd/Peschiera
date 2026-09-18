#!/usr/bin/env node
/**
 * Ergänzt die fehlenden Koordinaten in data/places.json über Nominatim.
 *
 *   node scripts/add-coords.mjs            # fehlende Einträge nachtragen
 *   node scripts/add-coords.mjs --dry      # nur zeigen, nichts schreiben
 *   node scripts/add-coords.mjs --force    # auch gesetzte geo neu abfragen
 *
 * Einmalig laufen lassen. Danach stehen die Werte fest im JSON — die App
 * geocodiert nie zur Laufzeit.
 *
 * Nominatim erlaubt maximal eine Anfrage pro Sekunde und verlangt einen
 * aussagekräftigen User-Agent. Beides ist hier eingehalten.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'places.json');

const UA = 'peschiera-kompakt/1.0 (https://github.com/fabiandaviddd/peschiera-kompakt)';
const PAUSE = 1100;                 // ms — etwas über dem Limit von 1 req/s
const DRY = process.argv.includes('--dry');
const FORCE = process.argv.includes('--force');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Suchanfragen von genau nach grob — die erste, die trifft, gewinnt. */
function queries(place) {
  const out = [];
  const addr = (place.address || '').trim();
  if (addr) {
    out.push(`${addr}, Italia`);
    // Hausnummer weglassen: "Via Sebino 29" -> "Via Sebino"
    const noNr = addr.replace(/\s+\d+[\/\w]*(?=,|$)/, '');
    if (noNr !== addr) out.push(`${noNr}, Italia`);
  }
  if (place.name) {
    const town = addr.split(',').pop()?.trim();
    out.push(town ? `${place.name}, ${town}, Italia` : `${place.name}, Italia`);
  }
  return [...new Set(out.filter(Boolean))];
}

async function geocode(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'it');
  url.searchParams.set('accept-language', 'de');

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 429 || res.status === 503) {
    console.warn('  Rate Limit — 5 s warten und einmal wiederholen');
    await sleep(5000);
    return geocode(q);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} für "${q}"`);

  const hits = await res.json();
  if (!Array.isArray(hits) || !hits.length) return null;
  return {
    lat: Number(Number(hits[0].lat).toFixed(6)),
    lon: Number(Number(hits[0].lon).toFixed(6))
  };
}

const data = JSON.parse(await readFile(FILE, 'utf8'));
const todo = data.places.filter((p) => FORCE || !p.geo);

console.log(`${data.places.length} Orte, ${todo.length} zu geocodieren` + (DRY ? ' (Testlauf)' : ''));

let ok = 0;
const missed = [];

for (const [i, place] of todo.entries()) {
  let found = null;
  for (const q of queries(place)) {
    try {
      found = await geocode(q);
    } catch (err) {
      console.warn(`  ${place.id}: ${err.message}`);
    }
    await sleep(PAUSE);
    if (found) {
      console.log(`[${i + 1}/${todo.length}] ${place.id} → ${found.lat}, ${found.lon}   « ${q}`);
      break;
    }
  }
  if (found) { place.geo = found; ok++; }
  else { missed.push(place.id); console.log(`[${i + 1}/${todo.length}] ${place.id} → nichts gefunden`); }
}

if (!DRY && ok) {
  await writeFile(FILE, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`\ndata/places.json geschrieben: ${ok} Koordinaten ergänzt.`);
} else {
  console.log(`\nNichts geschrieben${DRY ? ' (Testlauf)' : ''}.`);
}

const left = data.places.filter((p) => !p.geo).map((p) => p.id);
if (left.length) {
  console.log(`\nOhne geo (${left.length}): ${left.join(', ')}`);
  console.log('Diese von Hand nachtragen, z.B. aus Google Maps: "geo": { "lat": …, "lon": … }');
}
if (missed.length) console.log(`Nicht gefunden in diesem Lauf: ${missed.join(', ')}`);
