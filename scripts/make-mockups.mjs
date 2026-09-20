#!/usr/bin/env node
/* ==========================================================================
   Rendert die Konzept-Entwuerfe aus docs/bilder/konzept/mockups.html
   nach docs/bilder/konzept/*.png -- 402x754 bei dreifacher Pixeldichte,
   also im Format des Zielgeraets.

       node scripts/make-mockups.mjs

   Gehoert nicht zur App. Wie scripts/make-icons.py ist das Skript nur da,
   um die Bilder reproduzierbar zu machen; die PNGs liegen fest im Repo.
   Braucht Chromium ueber Playwright (Pfad aus PLAYWRIGHT_PATH).
   ========================================================================== */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PK_PORT || '8811';
const BASE = `http://localhost:${PORT}`;

const RAHMEN = [
  ['f-start',   '01-start'],
  ['f-jetzt',   '02-jetzt'],
  ['f-liste',   '03-entdecken-liste'],
  ['f-karte',   '04-entdecken-karte'],
  ['f-ort',     '05-ort'],
  ['f-reise',   '06-reise'],
  ['f-tag',     '07-reisetag'],
  ['f-regen',   '08-jetzt-regen'],
  ['f-wissen',  '09-wissen'],
  ['f-dunkel',  '10-jetzt-dunkel']
];

const warte = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('python3', ['-m', 'http.server', PORT],
  { cwd: root, stdio: 'ignore', detached: true });

let code = 0;
try {
  let da = false;
  for (let i = 0; i < 30 && !da; i++) {
    try { da = (await fetch(`${BASE}/docs/bilder/konzept/mockups.html`)).ok; }
    catch (e) { /* noch nicht */ }
    if (!da) await warte(300);
  }
  if (!da) throw new Error('Server kam nicht hoch');

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  await page.goto(`${BASE}/docs/bilder/konzept/mockups.html`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  for (const [id, name] of RAHMEN) {
    const el = page.locator('#shot-' + id.replace(/^f-/, ''));
    if (!await el.count()) { console.error('fehlt:', id); code = 1; continue; }
    await el.screenshot({ path: join(root, 'docs/bilder/konzept', name + '.png') });
    console.log('  ✓', name);
  }
  await browser.close();
} catch (e) {
  console.error('FEHLER:', e.message);
  code = 1;
} finally {
  try { process.kill(-server.pid); } catch (e) { /* schon weg */ }
}
process.exit(code);
