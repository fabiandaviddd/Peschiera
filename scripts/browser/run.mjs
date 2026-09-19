#!/usr/bin/env node
/* ==========================================================================
   Läufer für die Browser-Prüfungen.

       node scripts/browser/run.mjs            alle Suiten
       node scripts/browser/run.mjs close ios  nur diese

   Startet selbst einen kleinen Server auf Port 8765 und beendet ihn wieder.
   Braucht Chromium über Playwright; der Pfad kommt aus PLAYWRIGHT_PATH,
   sonst wird die globale Installation genommen.

   Diese Suiten prüfen das Verhalten im Browser — vor allem die Eigenheiten
   von iOS Safari, die sich in Chromium NICHT zeigen und deshalb schon zweimal
   als Fehler beim Benutzer gelandet sind. scripts/test-logic.mjs prüft
   daneben die reine Logik ohne Browser; beides ergänzt sich.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const PORT = process.env.PK_PORT || '8765';
const BASE = `http://localhost:${PORT}`;

const alle = readdirSync(here)
  /* fixture.mjs ist gemeinsamer Datensatz, keine Suite -- ohne diese Zeile
     startet der Laeufer sie und meldet eine Suite ohne Ergebnis. */
  .filter((f) => f.endsWith('.mjs') && f !== 'run.mjs' && f !== 'fixture.mjs')
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();

const wahl = process.argv.slice(2);
const suiten = wahl.length ? wahl.filter((s) => alle.includes(s)) : alle;
if (wahl.length && suiten.length !== wahl.length) {
  console.error('Unbekannt:', wahl.filter((s) => !alle.includes(s)).join(', '));
  console.error('Vorhanden:', alle.join(', '));
  process.exit(2);
}

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function erreichbar() {
  for (let i = 0; i < 25; i++) {
    try {
      const r = await fetch(`${BASE}/index.html`);
      if (r.ok) return true;
    } catch (e) { /* noch nicht da */ }
    await warte(300);
  }
  return false;
}

const server = spawn('python3', ['-m', 'http.server', PORT], {
  cwd: root, stdio: 'ignore', detached: true
});

let code = 0;
try {
  if (!await erreichbar()) {
    console.error(`Server auf ${BASE} nicht erreichbar.`);
    process.exit(1);
  }

  const ergebnis = [];
  for (const s of suiten) {
    const t = await new Promise((fertig) => {
      /* Ohne Zielordner schreiben die Suiten keine Screenshots. */
      const p = spawn(process.execPath, [join(here, `${s}.mjs`)], {
        env: { ...process.env, PK_BASE: BASE }, stdio: ['ignore', 'pipe', 'pipe']
      });
      let out = '';
      p.stdout.on('data', (d) => { out += d; });
      p.stderr.on('data', (d) => { out += d; });
      p.on('close', (c) => fertig({ out, c }));
    });
    const zeile = (t.out.match(/^\d+\/\d+ passed$/m) || ['—'])[0];
    const fails = (t.out.match(/^FAIL .*/gm) || []);
    const abbruch = /ABBRUCH|TimeoutError/.test(t.out);
    ergebnis.push({ s, zeile, fails, abbruch, c: t.c });
    console.log(`${s.padEnd(10)} ${zeile}${abbruch ? '  ABBRUCH' : ''}`);
    fails.forEach((f) => console.log('   ' + f));
    if (t.c !== 0 || abbruch) code = 1;
  }

  const summe = ergebnis.reduce((n, e) => {
    const m = e.zeile.match(/^(\d+)\/(\d+)/);
    return m ? n + Number(m[1]) : n;
  }, 0);
  console.log('-----');
  console.log(`${summe} Prüfungen · ${code === 0 ? 'alle grün' : 'FEHLER'}`);
} finally {
  try { process.kill(-server.pid); } catch (e) { /* schon weg */ }
}
process.exit(code);
