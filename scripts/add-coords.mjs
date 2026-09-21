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

const UA = 'arilica/1.0 (https://github.com/fabiandaviddd/Peschiera)';
/* Reisegegend — hält Treffer aus dem Rest Italiens fern */
const BOX = { lonMin: 10.35, latMax: 45.95, lonMax: 11.15, latMin: 45.05 };
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

const nrm = (x) => String(x || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

let TOWNS = [];
function buildTowns(places) {
  const seen = new Set();
  for (const p of places) {
    const a = (p.address || '').trim();
    if (!a.includes(',')) continue;
    const t = a.split(',').pop().trim();
    if (t && !seen.has(nrm(t))) { seen.add(nrm(t)); TOWNS.push(t); }
  }
  TOWNS.sort((a, b) => b.length - a.length);
}

function townOf(p) {
  const raw = (p.address || '').trim();
  const a = nrm(raw);
  if (!a) return null;
  for (const t of TOWNS) if (a.includes(nrm(t))) return t;
  if (!raw.includes(',') && !/\d/.test(raw)) {
    const w = raw.split(/\s+/);
    if (w.length <= 4 && !/^(via|piazza|ab|start|localita|località|centro|spitze|parco|lungolago|imbarcadero|festung)$/i.test(w[0])) {
      return raw;
    }
  }
  return null;
}

function kmBetween(a, b) {
  const R = 6371, r = (x) => x * Math.PI / 180;
  const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2
          + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** null = Treffer passt, sonst der Ablehnungsgrund. */
function reject(place, hit, displayName, base) {
  const t = townOf(place);
  if (t && !nrm(displayName).includes(nrm(t))) return `liegt nicht in ${t}`;
  if (base && typeof place.distance_km === 'number' && place.distance_km > 0) {
    const luft = kmBetween(base, hit);
    if (luft > place.distance_km * 1.15 + 0.5) {
      return `zu weit weg (${luft.toFixed(1)} km Luftlinie bei ${place.distance_km} km Straße)`;
    }
  }
  return null;
}

async function geocode(q) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', q);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '3');
  url.searchParams.set('countrycodes', 'it');
  url.searchParams.set('accept-language', 'de');
  url.searchParams.set('viewbox', `${BOX.lonMin},${BOX.latMax},${BOX.lonMax},${BOX.latMin}`);
  url.searchParams.set('bounded', '1');

  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (res.status === 429 || res.status === 503) {
    console.warn('  Rate Limit — 5 s warten und einmal wiederholen');
    await sleep(5000);
    return geocode(q);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} für "${q}"`);

  const hits = await res.json();
  if (!Array.isArray(hits) || !hits.length) return [];
  return hits.map((h) => ({
    geo: { lat: Number(Number(h.lat).toFixed(6)), lon: Number(Number(h.lon).toFixed(6)) },
    name: h.display_name || ''
  }));
}

const data = JSON.parse(await readFile(FILE, 'utf8'));
buildTowns(data.places);
const BASE = data.meta?.base_geo || null;
const todo = data.places.filter((p) => FORCE || !p.geo);

console.log(`${data.places.length} Orte, ${todo.length} zu geocodieren` + (DRY ? ' (Testlauf)' : ''));

let ok = 0;
const missed = [];

for (const [i, place] of todo.entries()) {
  let found = null;
  let grund = null;
  for (const q of queries(place)) {
    let hits = [];
    try {
      hits = await geocode(q);
    } catch (err) {
      console.warn(`  ${place.id}: ${err.message}`);
    }
    await sleep(PAUSE);
    for (const h of hits) {
      const warum = reject(place, h.geo, h.name, BASE);
      if (!warum) { found = h.geo; break; }
      if (!grund) grund = warum;
    }
    if (found) {
      console.log(`[${i + 1}/${todo.length}] ${place.id} → ${found.lat}, ${found.lon}   « ${q}`);
      break;
    }
  }
  if (found) { place.geo = found; ok++; }
  else {
    missed.push(place.id);
    console.log(`[${i + 1}/${todo.length}] ${place.id} → verworfen${grund ? ': ' + grund : ', nichts gefunden'}`);
  }
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
