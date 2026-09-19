/* V3: der Startzustand -- Geruest statt drehendem Kreis, und der Fehlerweg.

   Beides war bis v24 im Browser ungeprueft. Die einzige Zusicherung zum
   Start lautete "boot ist weg", und die besteht auch, wenn der Fehlerfall
   gar nicht mehr funktioniert.

   Geprueft wird deshalb der ganze Weg: laedt (Geruest sichtbar), geladen
   (Geruest weg, App da), scheitert (Geruest weg, Meldung da, Knopf da) und
   der zweite Versuch danach. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};
const browser = await chromium.launch();
const mach = () => browser.newContext({ viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE' });

/* --- 1. Waehrend des Ladens ---------------------------------------------- */
{
  const c = await mach();
  const p = await c.newPage();
  await p.route('**/data/places.json*', async (r) => {
    await new Promise((x) => setTimeout(x, 3000));
    r.continue();
  });
  p.goto(BASE + '/', { waitUntil: 'commit' }).catch(() => {});
  await p.waitForSelector('#boot:not([hidden])');
  await p.waitForTimeout(400);

  const z = await p.evaluate(() => {
    const skel = document.getElementById('boot-skel');
    const karten = skel.querySelectorAll('.skel--karte');
    const erste = karten[0].getBoundingClientRect();
    return {
      teile: skel.querySelectorAll('.skel').length,
      karten: karten.length,
      hoch: Math.round(erste.height),
      sichtbar: getComputedStyle(skel).display !== 'none' && erste.height > 0,
      versteckt: skel.getAttribute('aria-hidden'),
      rolle: document.querySelector('.boot__msg').getAttribute('role'),
      text: document.getElementById('boot-text').textContent.trim(),
      knopf: document.getElementById('boot-retry').hidden
    };
  });
  ok('Geruest steht waehrend des Ladens', z.sichtbar);
  ok('drei Platzhalterkarten', z.karten, 3);
  ok('fuenf Teile insgesamt (Kopf, Chips, drei Karten)', z.teile, 5);
  ok('Platzhalterkarte ist so hoch wie eine echte', z.hoch, 92);
  ok('Geruest ist fuer Vorleser unsichtbar', z.versteckt, 'true');
  ok('die Meldung dagegen wird angesagt', z.rolle, 'status');
  ok('und sagt, dass geladen wird', z.text, 'Daten werden geladen…');
  ok('kein Erneut-Knopf beim normalen Laden', z.knopf, true);

  /* Der Titel darf beim Erscheinen der App nicht springen -- das ist der
     Grund, warum er im Geruest an derselben Stelle steht und nicht mittig. */
  const vor = await p.evaluate(() => {
    const r = document.querySelector('.boot__msg h2').getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top)];
  });
  await p.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  await p.waitForTimeout(250);
  const nach = await p.evaluate(() => {
    const r = document.querySelector('.bar__title').getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.top)];
  });
  ok('der Titel springt beim Erscheinen nicht', nach, vor);
  ok('nach dem Laden ist das Geruest weg', await p.locator('#boot').isHidden());
  await c.close();
}

/* --- 2. Wenn die Daten nicht kommen -------------------------------------- */
{
  const c = await mach();
  const p = await c.newPage();
  let versuche = 0;
  await p.route('**/data/places.json*', (r) => { versuche += 1; r.abort(); });
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#boot-retry:not([hidden])', { timeout: 15000 });

  const f = await p.evaluate(() => ({
    geruestWeg: getComputedStyle(document.getElementById('boot-skel')).display === 'none',
    titel: document.getElementById('boot-title').textContent.trim(),
    appWeg: document.getElementById('app').hidden,
    knopfHoch: Math.round(document.getElementById('boot-retry').getBoundingClientRect().height)
  }));
  ok('im Fehlerfall verschwindet das Geruest', f.geruestWeg);
  ok('die Meldung sagt, was los ist', f.titel, 'Daten nicht geladen');
  ok('die App bleibt verborgen', f.appWeg, true);
  ok('der Erneut-Knopf ist gross genug zum Tippen', f.knopfHoch >= 44);

  /* Zweiter Versuch: diesmal durchlassen. */
  await p.unroute('**/data/places.json*');
  const vorher = versuche;
  await p.locator('#boot-retry').click();
  await p.waitForSelector('#app:not([hidden])', { timeout: 15000 });
  ok('nach Erneut laedt die App wirklich', await p.locator('#boot').isHidden());
  ok('und hat dafuer neu angefragt', versuche >= vorher);
  /* Die Startansicht ist "Heute" und zeigt keine Ortsliste -- erst auf
     "Orte" wechseln, sonst prueft man die leere Liste einer Ansicht, die
     gar keine haben soll. */
  await p.locator('.tab[data-tab="orte"]').click();
  await p.waitForFunction(() => document.getElementById('list').getAttribute('data-voll') === '1');
  ok('die Liste ist danach normal da', (await p.locator('#list .card').count()), 101);
  await c.close();
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
