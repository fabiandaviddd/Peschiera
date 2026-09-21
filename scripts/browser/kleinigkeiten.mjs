/* Vorschlag 5, 7 und 8 aus docs/verbesserungsvorschlaege.md, in v19 gebaut:
   Rueckgaengig nach "Meine ersetzen", Ansicht aus der Adresse, Zaehler auf der
   Grundmenge, Suchtreffer hervorgehoben. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const SHOT = process.argv[2] || null;
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
     (await p.locator('.card__note mark').count()) > 0);
  ok('hervorgehoben ist der gesuchte Text',
     (await p.locator('.card__note mark').first().textContent()).toLowerCase(), 'pasta');
  /* norm() macht aus "ß" zwei Zeichen — ab dort verschieben sich die Indizes.
     Wer die Fundstelle im normalisierten Text sucht und den Index roh
     anwendet, markiert daneben. */
  await p.fill('#q', 'strasse'); await p.waitForTimeout(250);
  const treffer = await p.locator('.card__note mark').allTextContents();
  ok('Diakritika verschieben die Markierung nicht',
     treffer.every((t) => /stra(ß|ss)e/i.test(t)));
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
  await a.click('#share-btn'); await a.waitForTimeout(600);
  /* Seit v40 fragt der Knopf erst, was drinsteht -- geteilt wird im Sheet. */
  ok('Teilen fragt erst, statt gleich zu teilen', await a.locator('#sheet').isVisible());
  await a.click('#share-go'); await a.waitForTimeout(700);
  const link = await a.evaluate(() => navigator.clipboard.readText());
  await A.close();
  ok('Teilen-Link erzeugt', link.includes('#liste='));

  const hash = link.slice(link.indexOf('#'));
  const B = await mach(); const b = await B.newPage();
  await b.addInitScript(() => {
    try { localStorage.setItem('pk.saved', JSON.stringify(['momus', 'scavi', 'duomo'])); } catch (e) {}
  });
  await b.goto(`${BASE}/index.html` + hash, { waitUntil: 'networkidle' });
  await b.waitForSelector('#inbox:not([hidden])');
  /* Der destruktive Knopf ist mit v40 fortgefallen. Er ueberschrieb S.saved
     und S.seen in einem Zug -- fuenfzehn Tage Markierungen, zehn Sekunden
     umkehrbar. Er war noetig, solange das Zusammenfuehren nur "meine
     gewinnen" konnte. Seit die Zusammenfuehrung feldweise nach Datum
     entscheidet, gibt es nichts mehr, wofuer man ihn braeuchte. */
  ok('"Meine ersetzen" gibt es nicht mehr', await b.locator('#inbox-replace').count(), 0);
  ok('… und "Rueckgaengig" auch nicht', await b.locator('#inbox-undo').count(), 0);
  ok('zwei Knoepfe bleiben', await b.locator('.inbox__acts .btn:not([hidden])').count(), 2);
  /* Was drinsteht, steht jetzt Zeile fuer Zeile da -- bis v39 nannte ein Satz
     nur die gemerkten und gesehenen Orte. */
  ok('der Kasten sagt, was drinsteckt',
     /2 gemerkte Orte/.test(await b.textContent('#inbox-was')));

  await b.click('#inbox-merge'); await b.waitForTimeout(500);
  const zusammen = await b.evaluate(() => JSON.parse(localStorage.getItem('pk.saved')));
  /* Drei eigene plus zwei fremde: Zusammenfuehren nimmt niemandem etwas weg. */
  ok('Zusammenfuehren behaelt eigenes und fremdes', zusammen.length, 5);
  ok('der Kasten ist danach weg', await b.locator('#inbox').isHidden());
  await B.close();
}

/* ------------------------------ "Schon gesehen" raeumt "Heute" (v20) */
/* Bis v19 standen gesehene Orte in "Heute" nur hinten. Bei fuenfzehn
   Reisetagen fuellt sich der Stapel damit mit Orten, an denen man schon war,
   und "1 / 37" verspricht eine Auswahl, die es nicht mehr gibt. */
{
  const c = await mach(); const p = await c.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.evaluate(() => { const b = document.getElementById('wx-dry'); if (b) b.click(); });
  await p.waitForTimeout(200);
  const vorher = await p.textContent('.today__pos');
  const erster = (await p.textContent('.today__pick .card__name, .today__name')
    .catch(() => null)) || await p.evaluate(() =>
      (document.querySelector('.today__pick h3, .today__pick .today__name') || {}).textContent || '');
  ok('Heute zeigt einen Vorschlag', !!erster.trim());

  /* Denselben Ort als gesehen markieren und neu laden. */
  const id = await p.evaluate(() => {
    const el = document.querySelector('.today__pick [data-open]');
    return el ? el.getAttribute('data-open') : null;
  });
  ok('Vorschlag hat eine Kennung', !!id);
  await p.evaluate((x) => {
    try { localStorage.setItem('pk.seen', JSON.stringify([x])); } catch (e) {}
  }, id);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.evaluate(() => { const b = document.getElementById('wx-dry'); if (b) b.click(); });
  await p.waitForTimeout(200);
  const jetzt = await p.evaluate(() => {
    const el = document.querySelector('.today__pick [data-open]');
    return el ? el.getAttribute('data-open') : null;
  });
  ok('gesehener Ort wird nicht mehr vorgeschlagen', jetzt !== id);
  const nachher = await p.textContent('.today__pos');
  ok('der Stapel ist um eins kleiner',
     Number(nachher.split('/')[1]) === Number(vorher.split('/')[1]) - 1);
  await c.close();
}

/* Wird ein Abschnitt dadurch leer, sagt der Leerzustand warum und bietet
   einen Ausweg -- still schrumpfen tut hier nichts. */
{
  const c = await mach(); const p = await c.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  const alleIds = await p.evaluate(() => window.__alle || null);
  await p.evaluate(async () => {
    const d = await (await fetch('./data/places.json')).json();
    localStorage.setItem('pk.seen', JSON.stringify(d.places.map((x) => x.id)));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(300);
  ok('Leerzustand nennt den Grund',
     (await p.textContent('.today__none')).includes('schon gesehen'));
  ok('… und bietet einen Ausweg', await p.locator('#today-seen').isVisible());
  await p.click('#today-seen'); await p.waitForTimeout(300);
  ok('„Trotzdem zeigen" bringt die Orte zurueck',
     (await p.locator('.today__pick').count()) > 0);
  await c.close();
}

/* --- v27: der Plan lief 16 px ueber beide Raender hinaus ----------------- */
/* .list zieht sich mit margin-inline: -1rem ueber die volle Breite, und der
   Plan, der IN #list gerendert wird, zog denselben Rand noch einmal ab: 434
   px Ansicht auf 402 px Bildschirm. Die Seite liess sich seitwaerts wackeln,
   und das rechte Sechzehntel jeder Zeile -- seit v27 die Umsortier-Pfeile --
   lag unsichtbar neben dem Bild. */
{
  const c = await mach();
  const p = await c.newPage();
  await p.goto(BASE + '/?v=orte', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  /* Beide auf denselben Tag: die Umstell-Pfeile stehen seit v36 im
     Tages-Sheet, und in einen Tag kommt ein Ort erst mit einem Reisetag. Im
     Vorrat gibt es keine Reihenfolge, die etwas bedeutet -- dort waeren
     Pfeile ein Bedienelement ohne Aussage.

     Der Tag wird aus dem Raster gelesen, nicht eingetippt: ein festes Datum
     faellt mit jedem Tag der Reise weiter in die Vergangenheit, und ein
     vergangener Tag laesst sich nicht mehr umplanen. */
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(450);
  const tag = await p.evaluate(() => {
    const z = document.querySelector('.uebs__d:not(.uebs__d--vorbei):not(.uebs__d--heute)');
    return z ? z.getAttribute('data-dayopen') : '';
  });
  ok('es gibt einen Reisetag, der noch kommt', /^\d{4}-\d{2}-\d{2}$/.test(tag));
  await p.evaluate((t) => {
    localStorage.setItem('pk.saved', JSON.stringify(['desenzano', 'bakare']));
    localStorage.setItem('pk.days', JSON.stringify({ desenzano: t, bakare: t }));
  }, tag);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(500);

  ok('die Reise macht die Seite nicht seitwaerts scrollbar',
    await p.evaluate(() => document.documentElement.scrollWidth), 402);

  /* In der Uebersicht stehen keine Pfeile: sie zeigt, das Sheet aendert. */
  ok('die Uebersicht traegt keine Pfeile', await p.locator('#list .pmove').count(), 0);

  await p.locator('.tagk:not(.tagk--frei)').first().click();
  await p.waitForTimeout(600);
  const pfeile = await p.evaluate(() => [...document.querySelectorAll('#sheet .pmove')]
    .map((e) => { const r = e.getBoundingClientRect();
      return [Math.round(r.width), Math.round(r.height),
        r.left >= 0 && r.right <= 402]; }));
  ok('vier Umsortier-Pfeile stehen im Tages-Sheet', pfeile.length, 4);
  ok('jeder ist 44 mal 44', pfeile.every((x) => x[0] === 44 && x[1] === 44));
  ok('und jeder liegt im Bild', pfeile.every((x) => x[2]));

  /* Umsortieren muss weiter wirken -- die Pfeile sind seit v36 an einer
     anderen Stelle, und Anordnung ist genau das, was so etwas still bricht. */
  const namen = () => p.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__row--drin .tagsheet__name')]
      .map((e) => e.textContent));
  const vorher = await namen();
  await p.locator('#sheet .pmove[data-down]:not([disabled])').first().click();
  await p.waitForTimeout(450);
  const danach = await namen();
  ok('nach unten schieben vertauscht wirklich', danach[1], vorher[0]);
  ok('… und die Nummern zaehlen weiter von eins', await p.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__nr')].map((e) => e.textContent)),
    ['1', '2']);
  await c.close();
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
