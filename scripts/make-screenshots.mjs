/* Bildschirmfotos fuer den Installationsdialog (manifest "screenshots").

       node scripts/make-screenshots.mjs

   Startet selbst einen Server auf Port 8766, faehrt die App in Chromium und
   legt die Bilder in screenshots/ ab. Vorbild ist scripts/browser/run.mjs;
   die Pfade kommen wie dort aus der Umgebung.

   Reproduzierbar gehalten: feste Fenstergroesse, feste Uhr, leerer Speicher.
   Ohne die feste Uhr zeigt "Heute" je nach Startzeit einen anderen Abschnitt,
   und jeder Lauf erzeugte einen Diff ohne Aenderung.
*/
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT = join(ROOT, 'screenshots');
const PORT = process.env.PK_PORT || '8766';
const BASE = `http://127.0.0.1:${PORT}`;
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const CHROME = process.env.CHROME
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* Mittwoch, 23. September 2026, 12:30 Ortszeit — Mittag mitten in der Reise,
   damit "Heute" einen Vorschlag zeigt und nicht den Leerzustand. */
const UHR = new Date('2026-09-23T10:30:00Z').getTime();

mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', PORT, '--directory', ROOT],
  { stdio: 'ignore' });
const ende = () => { try { server.kill(); } catch (e) {} };
process.on('exit', ende);

for (let i = 0; i < 40; i++) {
  try { const r = await fetch(BASE + '/index.html'); if (r.ok) break; } catch (e) {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  /* Einfache Aufloesung: der Installationsdialog zeigt die Bilder klein. Mit
     deviceScaleFactor 2 wogen die beiden zusammen 378 kB statt 162. */
  deviceScaleFactor: 1,
  hasTouch: true,
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
});
await ctx.addInitScript(`{
  const echt = Date;
  const fest = ${UHR};
  Date = class extends echt {
    constructor(...a) { return a.length ? new echt(...a) : new echt(fest); }
    static now() { return fest; }
  };
}`);

const page = await ctx.newPage();
const schuss = async (datei, tab) => {
  await page.goto(BASE + '/index.html', { waitUntil: 'load' });
  await page.waitForSelector('#app:not([hidden])');
  if (tab) {
    await page.evaluate(() => { const q = document.getElementById('q'); if (q) q.blur(); });
    await page.waitForTimeout(300);
    await page.locator(`.tab[data-tab="${tab}"]`).click();
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, datei) });
  console.log('  ' + datei);
};

console.log('Bildschirmfotos nach screenshots/');
await schuss('01-heute.png', null);
await schuss('02-orte.png', 'orte');
await browser.close();
ende();
