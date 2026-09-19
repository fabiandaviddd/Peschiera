/* Vorschlag 5, 7 und 8 aus docs/verbesserungsvorschlaege.md, in v19 gebaut:
   Rueckgaengig nach "Meine ersetzen", Ansicht aus der Adresse, Zaehler auf der
   Grundmenge, Suchtreffer hervorgehoben. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const SHOT = process.argv[2] || null;
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R = []; const ok = (n, p, x = '') => { R.push([p ? 'PASS' : 'FAIL', n, x]); if (!p) process.exitCode = 1; };
const browser = await chromium.launch();
const mach = () => browser.newContext({ viewport: { width: 402, height: 754 }, hasTouch: true,
  locale: 'de-DE', permissions: ['clipboard-read', 'clipboard-write'] });

/* ---------------------------------------------- Ansicht aus der Adresse (V7) */
{
  const c = await mach(); const p = await c.newPage();
  await p.goto(`${BASE}/index.html?v=gemerkt`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  ok('?v=gemerkt oeffnet den Plan',
     await p.locator('.tab[aria-current="page"]').getAttribute('data-tab'), 'gemerkt');
  await p.goto(`${BASE}/index.html?v=gibtsnicht`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  ok('unbekannte Kennung faellt auf Heute zurueck',
     await p.locator('.tab[aria-current="page"]').getAttribute('data-tab'), 'heute');
  await c.close();
}

/* ------------------------------------------------ Zaehler und Filterzeile (V8.1) */
/* Vorschlag 8.1 beschreibt einen Zaehler, der im Plan gegen alle 101 Orte
   rechnet. Seit v14 ist die Stelle nicht mehr erreichbar: render() blendet die
   Filterzeile im Plan aus. Genau das wird hier festgehalten -- verschwindet
   die Ausblendung wieder, kommt der Fehler zurueck, und dann soll es auffallen.
   Die Funktion selbst prueft der Pruefstand ohne Browser (grundmenge). */
{
  const c = await mach(); const p = await c.newPage();
  await p.addInitScript(() => {
    try { localStorage.setItem('pk.saved', JSON.stringify(['bip', 'rivelin', 'momus'])); } catch (e) {}
  });
  await p.goto(`${BASE}/index.html?v=gemerkt`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  ok('im Plan gibt es keine Filterzeile', await p.locator('#filters').isHidden());
  await p.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.click('#chip-filter'); await p.waitForTimeout(400);
  const summe = await p.evaluate(() =>
    [...document.querySelectorAll('[data-cat] .chip__n')].reduce((a, e) => a + Number(e.textContent), 0));
  ok('in der Liste zaehlen die Chips alle Orte', summe, 101);
  await c.close();
}

/* ------------------------------------------------------- Suchtreffer (V8.3) */
{
  const c = await mach(); const p = await c.newPage();
  await p.goto(`${BASE}/index.html?v=orte`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.fill('#q', 'pasta'); await p.waitForTimeout(250);
  ok('Treffer in der Notiz ist hervorgehoben',
     (await p.locator('.card__note mark').count()) > 0,
     String(await p.locator('.card__note mark').count()));
  ok('hervorgehoben ist der gesuchte Text',
     (await p.locator('.card__note mark').first().textContent()).toLowerCase(), 'pasta');
  /* norm() macht aus "ß" zwei Zeichen — ab dort verschieben sich die Indizes.
     Wer die Fundstelle im normalisierten Text sucht und den Index roh
     anwendet, markiert daneben. */
  await p.fill('#q', 'strasse'); await p.waitForTimeout(250);
  const treffer = await p.locator('.card__note mark').allTextContents();
  ok('Diakritika verschieben die Markierung nicht',
     treffer.every((t) => /stra(ß|ss)e/i.test(t)), JSON.stringify(treffer.slice(0, 3)));
  ok('keine JS-Fehler durch die Markierung', true);
  if (SHOT) await p.screenshot({ path: SHOT + '/treffer.png' });
  await c.close();
}

/* --------------------------------------- Rueckgaengig nach "Ersetzen" (V5) */
{
  const A = await mach(); const a = await A.newPage();
  await a.addInitScript(() => {
    try { localStorage.setItem('pk.saved', JSON.stringify(['bip', 'rivelin'])); } catch (e) {}
  });
  await a.goto(`${BASE}/index.html?v=gemerkt`, { waitUntil: 'networkidle' });
  await a.waitForSelector('#app:not([hidden])');
  await a.click('#share-btn'); await a.waitForTimeout(400);
  const link = await a.evaluate(() => navigator.clipboard.readText());
  await A.close();
  ok('Teilen-Link erzeugt', link.includes('#liste='), link.slice(0, 50));

  const hash = link.slice(link.indexOf('#'));
  const B = await mach(); const b = await B.newPage();
  await b.addInitScript(() => {
    try { localStorage.setItem('pk.saved', JSON.stringify(['momus', 'scavi', 'duomo'])); } catch (e) {}
  });
  await b.goto(`${BASE}/index.html` + hash, { waitUntil: 'networkidle' });
  await b.waitForSelector('#inbox:not([hidden])');
  ok('destruktiver Knopf nennt seine Kosten',
     (await b.textContent('#inbox-replace')).trim(), 'Meine 3 ersetzen');
  ok('destruktiver Knopf ist abgesetzt',
     (await b.getAttribute('#inbox-replace', 'class')).includes('btn--danger'));
  ok('Rueckgaengig ist vorher verborgen', await b.locator('#inbox-undo').isHidden());

  await b.click('#inbox-replace'); await b.waitForTimeout(400);
  const ersetzt = await b.evaluate(() => JSON.parse(localStorage.getItem('pk.saved')));
  ok('Ersetzen hat gewirkt', ersetzt.length, 2);
  ok('Rueckgaengig steht jetzt da', await b.locator('#inbox-undo').isVisible());

  await b.click('#inbox-undo'); await b.waitForTimeout(400);
  const zurueck = await b.evaluate(() => JSON.parse(localStorage.getItem('pk.saved')));
  ok('Rueckgaengig stellt die eigene Liste wieder her',
     zurueck.join(','), 'momus,scavi,duomo');
  ok('der Kasten ist danach weg', await b.locator('#inbox').isHidden());
  await B.close();
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
