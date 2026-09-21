/* Vorschlag 6: eine eigene Zeile je Ort.

   Der Anlass steht in den Daten: bei 58 von 101 Orten ist die Hundregel
   ungeklaert, die App sagt zu Recht "vorher fragen" -- wer gefragt hat, konnte
   die Antwort bis v21 nirgends hinschreiben und las am naechsten Tag wieder
   "nicht geklaert". */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R = []; /* Dieselbe Signatur wie scripts/browser-abnahme.mjs: (Name, bekommen,
   erwartet). Die Suiten unter scripts/browser/ prueften urspruenglich nur auf
   Wahrheit -- wer dabei ok('...', wert, 'erwartet') schreibt, bekommt eine
   Pruefung, die immer besteht. Genau das ist mir am 19.09. bei mehreren
   Zeilen passiert und erst aufgefallen, als zwei RICHTIGE Zeilen
   fehlschlugen, weil ihr Wert leer bzw. 0 war. */
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};
const browser = await chromium.launch();
const mach = () => browser.newContext({ viewport: { width: 402, height: 754 }, hasTouch: true,
  locale: 'de-DE', permissions: ['clipboard-read', 'clipboard-write'] });

const oeffne = async (p, id) => {
  await p.evaluate((x) => {
    const el = document.querySelector(`[data-open="${x}"]`);
    if (el) el.click();
  }, id);
  await p.waitForSelector('#sheet:not([hidden])');
  await p.waitForTimeout(300);
};

{
  const c = await mach(); const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');

  await oeffne(p, 'bip');
  ok('Notizfeld steht im Sheet', await p.locator('#notiz-feld').isVisible());
  ok('… und ist zuerst leer', await p.inputValue('#notiz-feld'), '');
  ok('… und steht unter der Hundzeile', await p.evaluate(() => {
    const d = document.querySelector('.dogrow'), n = document.querySelector('.notiz');
    return !!(d && n) && (d.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  }));

  await p.fill('#notiz-feld', 'Jum durfte doch mit rein');
  await p.keyboard.press('Escape');            // schliesst ohne das Feld zu verlassen
  await p.waitForTimeout(500);
  const gespeichert = await p.evaluate(() => JSON.parse(localStorage.getItem('pk.notes') || '{}'));
  ok('Schliessen sichert die Notiz', gespeichert.bip, 'Jum durfte doch mit rein');

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(400);
  ok('Notiz steht in der Listenzeile',
     (await p.locator('.card__mine').first().textContent()).includes('Jum durfte doch'));
  await oeffne(p, 'bip');
  ok('… und wieder im Feld', await p.inputValue('#notiz-feld'), 'Jum durfte doch mit rein');

  /* Leeren loescht sie, statt einen leeren Eintrag zu hinterlassen. */
  await p.fill('#notiz-feld', '   ');
  await p.keyboard.press('Escape');
  await p.waitForTimeout(500);
  const leer = await p.evaluate(() => JSON.parse(localStorage.getItem('pk.notes') || '{}'));
  ok('Leeren entfernt die Notiz', Object.keys(leer).length, 0);
  ok('Keine JS-Fehler', errs.length ? errs.join(' | ') : 0, 0);
  await c.close();
}

/* Der Teilen-Link traegt die Notizen mit -- aber nur die vorhandenen. */
{
  const A = await mach(); const a = await A.newPage();
  await a.addInitScript(() => {
    try {
      localStorage.setItem('pk.saved', JSON.stringify(['bip']));
      localStorage.setItem('pk.notes', JSON.stringify({ bip: 'Terrasse hinten ist ruhiger' }));
    } catch (e) {}
  });
  await a.goto(`${BASE}/index.html?v=gemerkt`, { waitUntil: 'networkidle' });
  await a.waitForSelector('#app:not([hidden])');
  await a.click('#share-btn'); await a.waitForTimeout(600);
  /* Seit v40 fragt der Knopf erst, was drinsteht -- geteilt wird im Sheet. */
  await a.click('#share-go'); await a.waitForTimeout(700);
  const link = await a.evaluate(() => navigator.clipboard.readText());
  await A.close();

  const B = await mach(); const b = await B.newPage();
  await b.addInitScript(() => {
    try { localStorage.setItem('pk.notes', JSON.stringify({ bip: 'meine eigene' })); } catch (e) {}
  });
  await b.goto(`${BASE}/index.html` + link.slice(link.indexOf('#')), { waitUntil: 'networkidle' });
  await b.waitForSelector('#inbox:not([hidden])');
  await b.click('#inbox-merge'); await b.waitForTimeout(500);
  const nach = await b.evaluate(() => JSON.parse(localStorage.getItem('pk.notes') || '{}'));
  /* Die eigene Notiz ist hier undatiert (von Hand in den Speicher gelegt,
     ohne pk.stamps). Ein Stand ohne Datum wird seit v40 nicht
     ueberschrieben -- sonst waere das dieselbe stille Enteignung, die
     "Meine ersetzen" so gefaehrlich gemacht hat. */
  ok('Zusammenfuehren laesst die undatierte eigene Notiz stehen', nach.bip, 'meine eigene');

  const C = await mach(); const cc = await C.newPage();
  await cc.goto(`${BASE}/index.html` + link.slice(link.indexOf('#')), { waitUntil: 'networkidle' });
  await cc.waitForSelector('#inbox:not([hidden])');
  await cc.click('#inbox-merge'); await cc.waitForTimeout(500);
  const neu = await cc.evaluate(() => JSON.parse(localStorage.getItem('pk.notes') || '{}'));
  ok('… uebernimmt aber eine, die man nicht hat', neu.bip, 'Terrasse hinten ist ruhiger');
  await B.close(); await C.close();
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
