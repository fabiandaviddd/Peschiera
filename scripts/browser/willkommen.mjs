/* Die drei Startkarten -- einmal, und dann nie wieder.

   Sie erklaeren NICHT die Bedienung: vier Reiter und ein Suchfeld brauchen
   keine Anleitung. Sie erklaeren die drei Eigenheiten, die sonst als Fehler
   gelesen werden:

     1. Warum an jedem Ort eine Hundzeile steht.
     2. Warum 58 Orte ein Fragezeichen tragen und trotzdem in der Liste
        stehen -- die wichtigste Karte, weil sie die eine Konvention
        erklaert, die sonst wie ein Datenfehler aussieht.
     3. Dass Teilen existiert, bevor man es braucht.

   Diese Suite benutzt startfrei.mjs bewusst NICHT: sie ist die eine, die
   den Zustand "noch nie hier gewesen" wirklich braucht. */
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
const mach = () => browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});

/* --- 1. Beim ersten Start stehen sie da ---------------------------------- */
{
  const c = await mach();
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(700);

  ok('beim ersten Start steht die erste Karte da', await p.locator('#sheet').isVisible());
  ok('… und sagt, die wievielte sie ist',
    (await p.locator('.sheet__cat').textContent()).trim(), '1 von 3');
  ok('… mit drei Punkten', await p.locator('.start__dot').count(), 3);
  ok('… von denen einer an ist', await p.locator('.start__dot--an').count(), 1);
  ok('die erste Karte erklaert den Hund',
    /Jum/.test(await p.locator('#sheet-name').textContent()));

  await p.locator('[data-startnext]').click();
  await p.waitForTimeout(400);
  ok('Weiter fuehrt zur zweiten',
    (await p.locator('.sheet__cat').textContent()).trim(), '2 von 3');
  /* Die wichtigste: sie erklaert die eine Konvention, die sonst wie ein
     Datenfehler aussieht. */
  ok('die zweite erklaert "offen heisst offen"',
    /Offen heißt offen/.test(await p.locator('#sheet-name').textContent()));
  ok('… und nennt die Zahl aus den Daten',
    /58 der 101/.test(await p.locator('.start__x').textContent()));

  await p.locator('[data-startnext]').click();
  await p.waitForTimeout(400);
  ok('und zur dritten', (await p.locator('.sheet__cat').textContent()).trim(), '3 von 3');
  ok('die dritte erklaert das Teilen',
    /Telefone/.test(await p.locator('#sheet-name').textContent()));
  /* Auf der letzten steht kein "Ueberspringen" mehr -- es gaebe nichts
     mehr zu ueberspringen. */
  ok('… ohne "Ueberspringen"', await p.locator('#start-skip').count(), 0);
  ok('… und der Knopf heisst anders',
    /Los geht/.test(await p.locator('[data-startnext]').textContent()));

  await p.locator('[data-startnext]').click();
  await p.waitForTimeout(600);
  ok('"Los geht’s" schliesst die Karten', await p.locator('#sheet').isVisible(), false);
  ok('… und merkt sich das', await p.evaluate(() => localStorage.getItem('pk.start')), '1');

  /* Danach nie wieder. */
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(700);
  ok('beim zweiten Start stehen sie nicht mehr da',
    await p.locator('#sheet').isVisible(), false);
  ok('keine JS-Fehler', errs.length ? errs.join(' | ') : 0, 0);
  await c.close();
}

/* --- 2. Ueberspringen zaehlt auch als gelesen ---------------------------- */
{
  const c = await mach();
  const p = await c.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(700);
  await p.locator('#start-skip').click();
  await p.waitForTimeout(600);
  ok('Ueberspringen schliesst die Karten', await p.locator('#sheet').isVisible(), false);
  ok('… und gilt als gelesen',
    await p.evaluate(() => localStorage.getItem('pk.start')), '1');
  await c.close();
}

/* --- 3. Wegwischen, Esc und das Kreuz zaehlen ebenfalls ------------------ */
/* Die Karten ein zweites Mal zu zeigen, weil jemand sie anders weggeklickt
   hat als vorgesehen, waere eine Strafe fuers Bedienen. */
{
  const c = await mach();
  const p = await c.newPage();
  await p.goto(BASE + '/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(700);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(600);
  ok('Esc schliesst die Karten', await p.locator('#sheet').isVisible(), false);
  ok('… und gilt als gelesen',
    await p.evaluate(() => localStorage.getItem('pk.start')), '1');
  await c.close();
}

/* --- 4. Eine geteilte Liste hat Vorrang ---------------------------------- */
/* Wer einen Link von jemandem oeffnet, hat eine dringendere Frage als drei
   Erklaerkarten. */
{
  const c = await mach();
  const p = await c.newPage();
  const payload = Buffer.from(JSON.stringify({ v: 1, m: ['bip', 'fortezza'], g: [] }))
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await p.goto(BASE + '/#liste=' + payload, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(700);
  ok('bei einer geteilten Liste steht der Posteingang da',
    await p.locator('#inbox').isVisible());
  ok('… und die Startkarten warten', await p.locator('#sheet').isVisible(), false);
  ok('… und gelten noch nicht als gelesen',
    await p.evaluate(() => localStorage.getItem('pk.start')), null);
  await c.close();
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
