/* Browser-Abnahme der Änderungen. Läuft gegen den lokalen Server. */
/* Pfade nicht festnageln: diese Suiten liefen in einer Sitzung gegen ein
   fest eingerichtetes Chromium. Damit sie auch woanders starten, kommt alles
   Umgebungsabhaengige aus Umgebungsvariablen — die Vorgabe ist der Stand, in
   dem sie zuletzt gruen liefen.

     PLAYWRIGHT   Pfad zum playwright-Modul (index.mjs)
     CHROME       Pfad zur Chromium-Binaerdatei
     BASE         Adresse des lokalen Servers
     OUT          Ablage fuer die Bildschirmfotos
     ROOT         Wurzel des Arbeitsbaums

   Server: python3 -m http.server 8111 --directory <ROOT>
*/
const PW = process.env.PLAYWRIGHT
  || '/opt/node22/lib/node_modules/playwright/index.mjs';
const { chromium } = await import(PW);
const CHROME = process.env.CHROME
  || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ROOT = process.env.ROOT || process.cwd();
import { readFileSync, mkdirSync } from 'node:fs';

/* Die Fassung nicht abtippen — sie wandert bei jedem Merge, und ein
   Harness, das "v16" erwartet, meldet dann einen Fehler in der App,
   der keiner ist. Also aus app.js lesen. */
const VER = (readFileSync(ROOT + '/app.js', 'utf8')
  .match(/var VERSION = '([^']+)'/) || [])[1];
const MARK = (VER || '').split(' ')[0];          // "v17"
if (!MARK) { console.error('Fassung nicht in app.js gefunden'); process.exit(1); }
console.log('Fassung laut app.js: ' + MARK);

const BASE = process.env.BASE || 'http://127.0.0.1:8111';
/* Zweiter Server mit absichtlich altem CACHE in sw.js — pruef die
   Fassungs-Warnung. Fehlt er, wird der Block uebersprungen. */
const STALE = process.env.STALE || 'http://127.0.0.1:8114';
const OUT = process.env.OUT || ROOT + '/.screenshots';
mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log('  ok   ' + n); }
  else { fails.push(`${n}\n       erwartet ${b}, bekommen ${a}`); console.log('  FAIL ' + n); }
};

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  /* Kein isMobile: Playwright laesst dann das Layout-Viewport nach einem
     Feldfokus auf 877 stehen, klickt aber im 844er Raum — die fixierte
     Tableiste liegt damit ausserhalb und ist nicht mehr antippbar. Das ist
     eine Eigenheit des Treibers, nicht der App. */
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
  locale: 'de-DE',
  timezoneId: 'Europe/Berlin',
});
const page = await ctx.newPage();

/* Bei fokussiertem Suchfeld fährt die Tableiste weg (body.is-typing) — dann
   liegt an ihrer Stelle eine Karte. Erst den Fokus abgeben, dann tippen. */
const goTab = async (id) => {
  await page.evaluate(() => { const q = document.getElementById('q'); if (q) q.blur(); });
  await page.waitForTimeout(260);
  await page.locator(`.tab[data-tab="${id}"]`).click();
  await page.waitForTimeout(260);
};

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

await page.goto(BASE + '/index.html', { waitUntil: 'load' });
await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });

/* ------------------------------------------------------------- Startansicht */
console.log('\nStartansicht "Heute"');
ok('boot ist weg', await page.locator('#boot').isHidden());
ok('Suchfeld ist auf Heute sichtbar', await page.locator('#search-wrap').isVisible());
ok('Filterleiste bleibt auf Heute verborgen', await page.locator('#filters').isHidden());
ok('Zählzeile bleibt auf Heute verborgen', await page.locator('#meta-row').isHidden());
ok('Heute-Block ist da', await page.locator('#today').isVisible());
ok('kein role=tablist mehr', await page.locator('[role="tablist"]').count(), 0);
ok('kein role=tab mehr', await page.locator('[role="tab"]').count(), 0);
ok('aria-current steht auf Heute',
   await page.locator('.tab[aria-current="page"]').getAttribute('data-tab'), 'heute');
ok('Knopf heißt "Anderer Vorschlag"',
   (await page.locator('#today-next').textContent()).trim(), 'Anderer Vorschlag');
ok('Theme-Knopf nennt sein Ziel',
   /umschalten auf (hell|dunkel|automatisch)/.test(await page.locator('#theme-btn').getAttribute('title')));
await page.screenshot({ path: OUT + '/01-heute.png' });

/* -------------------------------------------- Suchfeld führt in die Liste */
console.log('\nSuche von Heute aus');
await page.locator('#q').focus();
await page.waitForTimeout(150);
ok('Fokus im Suchfeld wechselt in die Liste',
   await page.locator('.tab[aria-current="page"]').getAttribute('data-tab'), 'orte');
ok('Fokus liegt noch im Feld', await page.evaluate(() => document.activeElement.id), 'q');
await page.locator('#q').fill('caffe');
await page.waitForTimeout(150);
const nCaffe = await page.locator('.card').count();
ok('"caffe" findet Orte (Diakritika normalisiert)', nCaffe > 0);
await page.locator('#q').fill('strasse');
await page.waitForTimeout(150);
ok('"strasse" findet "Straße"', (await page.locator('.card').count()) > 0);
await page.locator('#q-clear').click();
await page.waitForTimeout(150);
ok('Löschen setzt zurück', await page.locator('#q').inputValue(), '');

/* ----------------------------------------------------------- Zurück zu Heute */
await goTab('orte');
await page.locator('#q').fill('pizza');
await page.waitForTimeout(120);
await goTab('heute');
ok('Wechsel auf Heute räumt die Suche', await page.locator('#q').inputValue(), '');

/* -------------------------------------------------------------- Detail-Sheet */
console.log('\nDetail-Sheet und Fokusfalle');
await goTab('orte');
const nAll = await page.locator('.card').count();
ok('Liste zeigt Orte', nAll > 0);
await page.locator('.card__open').first().click();
await page.waitForSelector('#sheet:not([hidden])');
await page.waitForTimeout(350);
ok('Sheet ist offen', await page.locator('#sheet').isVisible());
ok('#app ist inert', await page.locator('#app').getAttribute('inert') !== null);
ok('#app ist aria-hidden', await page.locator('#app').getAttribute('aria-hidden'), 'true');
ok('Skip-Link ist inert', await page.locator('.skip').getAttribute('inert') !== null);
ok('Fokus liegt auf dem ✕', await page.evaluate(() => document.activeElement.id), 'sheet-close');
await page.screenshot({ path: OUT + '/02-sheet.png' });

/* Tab-Ring: nach n Tabs muss der Fokus immer noch im Sheet liegen. */
let escaped = null;
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Tab');
  const inSheet = await page.evaluate(() =>
    document.getElementById('sheet').contains(document.activeElement));
  if (!inSheet) { escaped = await page.evaluate(() => document.activeElement.outerHTML.slice(0, 90)); break; }
}
ok('Tabulator bleibt im Sheet (14 Sprünge)', escaped, null);
let escapedBack = null;
for (let i = 0; i < 14; i++) {
  await page.keyboard.press('Shift+Tab');
  const inSheet = await page.evaluate(() =>
    document.getElementById('sheet').contains(document.activeElement));
  if (!inSheet) { escapedBack = await page.evaluate(() => document.activeElement.outerHTML.slice(0, 90)); break; }
}
ok('Shift+Tab bleibt im Sheet', escapedBack, null);

await page.keyboard.press('Escape');
await page.waitForTimeout(350);
ok('Esc schließt', await page.locator('#sheet').isHidden());
ok('#app ist wieder ansprechbar', await page.locator('#app').getAttribute('inert'), null);
ok('aria-hidden ist weg', await page.locator('#app').getAttribute('aria-hidden'), null);
const focusBack = await page.evaluate(() => document.activeElement.getAttribute('data-open'));
ok('Fokus ist auf der Karte zurück', typeof focusBack === 'string' && focusBack.length > 0);

/* Die Falle darf nur halten, solange wirklich etwas offen ist. hidden faellt
   erst nach dem 260-ms-Nachlauf; wer sofort Tab drueckt, wurde vorher in das
   verschwindende Sheet zurueckgezogen und stand danach auf <body>. */
await page.locator('.card__open').first().click();
await page.waitForTimeout(350);
await page.locator('#sheet-close').click();
await page.waitForTimeout(60);                 // mitten im Nachlauf
await page.keyboard.press('Tab');
const duringClose = await page.evaluate(() => ({
  inSheet: document.getElementById('sheet').contains(document.activeElement),
  tag: document.activeElement.tagName,
}));
ok('Tab im Nachlauf zieht nicht ins Sheet zurueck', duringClose.inSheet, false);
ok('Fokus bleibt auf einem Bedienelement', duringClose.tag !== 'BODY');
await page.waitForTimeout(300);

/* ------------------------------------------------------------ ✕ und Backdrop */
await page.locator('.card__open').first().click();
await page.waitForTimeout(350);
await page.locator('#sheet-close').click();
await page.waitForTimeout(350);
ok('✕ schließt', await page.locator('#sheet').isHidden());
await page.locator('.card__open').nth(1).click();
await page.waitForTimeout(350);
await page.locator('#scrim').click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(350);
ok('Backdrop schließt', await page.locator('#sheet').isHidden());

/* ------------------------------------------------------------- Filter / Tags */
/* Seit "Schritt 2" ist die Chipreihe durch einen Knopf plus Sheet ersetzt:
   #chip-filter oeffnet, darin [data-cat]/[data-flag]/[data-tag], abgeschlossen
   mit #filter-clear und #filter-done. Sortiert wird ueber #sort-btn. */
console.log('\nFilter, Tags, Sortierung');
await page.locator('#chip-filter').click();
await page.waitForSelector('#sheet:not([hidden])');
await page.waitForTimeout(300);
ok('Filter-Sheet zeigt die Trefferzahl',
   /\d+/.test(await page.locator('#filter-done').textContent()));
const firstTag = page.locator('#sheet-body [data-tag]').first();
await firstTag.click();
await page.waitForTimeout(200);
ok('Tag ist aktiv', await firstTag.getAttribute('aria-pressed'), 'true');
ok('Filter-Knopf im Kopf zaehlt',
   /1/.test(await page.locator('#chip-filter').textContent()));
const walkFlag = page.locator('#sheet-body [data-flag="walk"]');
ok('Zu-Fuss-Schalter liegt im Sheet', await walkFlag.count(), 1);
await walkFlag.click();
await page.waitForTimeout(200);
ok('"Zu Fuß" ist aktiv', await walkFlag.getAttribute('aria-pressed'), 'true');
await page.locator('#filter-clear').click();
await page.waitForTimeout(250);
ok('"Zurücksetzen" räumt die Tags', await firstTag.getAttribute('aria-pressed'), 'false');
ok('"Zurücksetzen" räumt "Zu Fuß"', await walkFlag.getAttribute('aria-pressed'), 'false');
await page.locator('#filter-done').click();
await page.waitForTimeout(400);
ok('Abschlussknopf schließt', await page.locator('#sheet').isHidden());
ok('Fokus zurück am Filter-Knopf', await page.evaluate(() => document.activeElement.id), 'chip-filter');

/* Sortierung ist jetzt ein Umschalter statt zweier Knoepfe. */
const sortLabel = async () => (await page.locator('#sort-btn').textContent()).trim();
ok('Sortierung steht auf Entfernung', /Entfernung/.test(await sortLabel()));
await page.locator('#sort-btn').click();
await page.waitForTimeout(250);
ok('ein Tipp schaltet auf Bewertung', /Bewertung/.test(await sortLabel()));
/* Orte ohne Bewertung müssen hinten stehen. */
const ratings = await page.evaluate(() => Array.from(document.querySelectorAll('.card'))
  .map((c) => { const f = c.querySelector('.fact--rating'); return f ? parseFloat(f.textContent.replace(',', '.')) : null; }));
const firstNull = ratings.indexOf(null);
ok('ohne Bewertung steht hinten',
   firstNull === -1 || ratings.slice(firstNull).every((r) => r === null));
await page.locator('#sort-btn').click();
await page.waitForTimeout(250);
ok('zurueck auf Entfernung', /Entfernung/.test(await sortLabel()));

/* --------------------------------------------------------------- Jum-Schalter */
console.log('\nJum, Merken, Gesehen');
await page.locator('#jum-btn').click();
await page.waitForTimeout(200);
ok('Jum ist an', await page.locator('#jum-btn').getAttribute('aria-checked'), 'true');
const cnt = await page.locator('#count').textContent();
ok('Zählzeile nennt Jum', /mit Jum/.test(cnt));
ok('Zählzeile nennt die Ausgeblendeten', /ohne Jum ausgeblendet/.test(cnt));
const jumN = await page.locator('.card').count();
ok('Jum blendet aus', jumN > 0 && jumN < nAll);
await page.screenshot({ path: OUT + '/03-jum.png' });
await page.locator('#jum-btn').click();
await page.waitForTimeout(200);

/* ------------------------------------- Luftlinie im Plan haengt an geo */
/* Zwischen zwei Stationen steht ab 1,2 km die Luftlinie als Warnung — aber nur,
   wenn beide ein geo tragen. Fehlt es bei einer, muss die Zeile wegbleiben statt
   eine Entfernung aus einem Gemeindepunkt zu rechnen.

   Der zweite Fall braucht eine Station OHNE Koordinate. Vorher stand dafuer
   fortezza fest im Text — als der am 19.09. eine bekam, meldete der Test eine
   Luftlinie, wo er keine erwartete, obwohl die App genau das Richtige tat.
   Geprueft wird die Regel, nicht der Datenstand: die Station ohne Koordinate
   wird deshalb ueber die geladene Datei erzeugt, nicht in den Daten gesucht. */
console.log('\nPlan: Luftlinie nur mit echten Koordinaten');
{
  const mk = async (ids, ohneGeo) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
    const pg = await c.newPage();
    if (ohneGeo) {
      await c.route('**/data/places.json*', async (route) => {
        const antwort = await route.fetch();
        const daten = JSON.parse(await antwort.text());
        for (const p of daten.places) if (p.id === ohneGeo) p.geo = null;
        await route.fulfill({ status: 200, contentType: 'application/json',
                              body: JSON.stringify(daten) });
      });
    }
    await pg.addInitScript((list) => {
      try { localStorage.setItem('pk.saved', JSON.stringify(list)); } catch (e) {}
    }, ids);
    await pg.goto(BASE + '/index.html', { waitUntil: 'load' });
    await pg.waitForSelector('#app:not([hidden])');
    await pg.evaluate(() => { const q = document.getElementById('q'); if (q) q.blur(); });
    await pg.waitForTimeout(240);
    await pg.locator('.tab[data-tab="gemerkt"]').click();
    await pg.waitForTimeout(350);
    const n = await pg.locator('.plan__far').count();
    const rows = await pg.locator('.planrow').count();
    await c.close();
    return { far: n, rows };
  };
  const both = await mk(['bip', 'mantova']);          // beide mit geo, weit auseinander
  ok('zwei Stationen mit geo: zwei Zeilen', both.rows, 2);
  ok('… und die Luftlinie steht da', both.far > 0);
  const one = await mk(['fortezza', 'mantova'], 'fortezza');  // fortezza hier ohne geo
  ok('ohne geo bei einer Station: zwei Zeilen', one.rows, 2);
  ok('… aber keine Luftlinie', one.far, 0);
}

/* ------------------------------------------------------------------- Merken */
await page.locator('.star').first().click();
await page.waitForTimeout(150);
ok('Stern ist gesetzt', await page.locator('.star').first().getAttribute('aria-pressed'), 'true');
ok('Reiter zählt', (await page.locator('#tab-n').textContent()).trim(), '1');
/* Der Reiter heisst seit v14 "Plan", das Label nennt das mit. */
ok('Zähler hat ein Label',
   await page.locator('#tab-n').getAttribute('aria-label'), '1 im Plan');
await page.locator('.seen').first().click();
await page.waitForTimeout(150);
ok('Haken ist gesetzt', await page.locator('.seen').first().getAttribute('aria-pressed'), 'true');
ok('Karte ist gedämpft', await page.locator('.card').first().evaluate((e) => e.classList.contains('card--seen')));

await goTab('gemerkt');
/* "Plan" rendert nummerierte Stationen (.planrow), keine Listenzeilen. */
ok('Plan zeigt eine Station', await page.locator('.planrow').count(), 1);
ok('die Station ist nummeriert',
   (await page.locator('.planrow__n').first().textContent()).trim(), '1');
ok('darüber steht das Zeitbudget',
   /Ort|Orte/.test(await page.locator('.plan__sum').textContent()));
ok('Teilen-Leiste ist da', await page.locator('#sharebar').isVisible());
ok('Teilen-Knopf ist sichtbar', await page.locator('#share-btn').isVisible());
await page.screenshot({ path: OUT + '/04-gemerkt.png' });

/* ------------------------------------------------------------------- Neu laden */
console.log('\nNeu laden: bleibt gemerkt?');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#app:not([hidden])');
await page.waitForTimeout(400);
ok('Merkliste übersteht den Reload', (await page.locator('#tab-n').textContent()).trim(), '1');

/* ------------------------------------------------------------------ Info-Tab */
console.log('\nInfo');
await goTab('info');
ok('Info zeigt Abschnitte', (await page.locator('.section').count()) >= 3);
ok('Suchfeld ist im Info-Tab verborgen', await page.locator('#search-wrap').isHidden());
ok('Telefonnummern sind Links', (await page.locator('#info a[href^="tel:"]').count()) > 0);
await page.screenshot({ path: OUT + '/05-info.png' });

/* -------------------------------------------------------------- Wetter / nass */
console.log('\nWetter hält den Besuch');
await goTab('heute');
await page.locator('#wx-wet').click();
await page.waitForTimeout(250);
ok('"nass" ist aktiv', await page.locator('#wx-wet').getAttribute('aria-pressed'), 'true');
const wetStored = await page.evaluate(() => sessionStorage.getItem('pk.wet'));
ok('nass liegt in sessionStorage', wetStored, 'true');
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('#app:not([hidden])');
await page.waitForTimeout(400);
ok('"nass" gilt nach dem Reload noch',
   await page.locator('#wx-wet').getAttribute('aria-pressed'), 'true');
await page.screenshot({ path: OUT + '/06-nass.png' });
await page.locator('#wx-dry').click();
await page.waitForTimeout(200);

/* -------------------------------------------------------------- Dark Mode */
console.log('\nFarbschema');
await page.locator('#theme-btn').click();
await page.waitForTimeout(150);
ok('erster Tipp → hell', await page.locator('html').getAttribute('data-theme'), 'light');
await page.locator('#theme-btn').click();
await page.waitForTimeout(150);
ok('zweiter Tipp → dunkel', await page.locator('html').getAttribute('data-theme'), 'dark');
await goTab('orte');
await page.screenshot({ path: OUT + '/07-dark.png' });
await page.locator('#theme-btn').click();
await page.waitForTimeout(150);
ok('dritter Tipp → automatisch', await page.locator('html').getAttribute('data-theme'), null);

/* ---------------------------------------------------------------- Leerzustand */
console.log('\nLeerzustand');
await page.locator('#q').fill('zzzquatschzzz');
await page.waitForTimeout(200);
ok('Leerzustand erscheint', await page.locator('#empty').isVisible());
ok('Text nennt die Kombination',
   /Kein Ort passt/.test(await page.locator('#empty-p').textContent()));
await page.locator('#empty-reset').click();
await page.waitForTimeout(200);
ok('Zurücksetzen räumt die Suche', await page.locator('#q').inputValue(), '');

/* ------------------------------------------------------- Service Worker / Footer */
console.log('\nService Worker und Fassung');
const sw = await page.evaluate(() => navigator.serviceWorker.controller ? 'da' : 'nein');
ok('Service Worker steuert die Seite', sw, 'da');
const foot = await page.locator('#foot-offline').textContent();
ok('Footer nennt die Fassung', foot.includes('App ' + MARK));
ok('keine Fassungs-Warnung bei passenden Ständen',
   await page.locator('.foot__warn').count(), 0);
console.log('       Footer: ' + foot.trim().replace(/\s+/g, ' '));

/* -------------------------------------------------------------- Teilen-Link */
console.log('\nTeilen und Empfangen');
await goTab('gemerkt');
const link = await page.evaluate(() => {
  const saved = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  const seen = JSON.parse(localStorage.getItem('pk.seen') || '[]');
  const s = btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, m: saved, g: seen }))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#liste=' + s;
});
const p2 = await ctx.newPage();
await p2.goto(link, { waitUntil: 'load' });
await p2.waitForSelector('#app:not([hidden])');
await p2.waitForTimeout(400);
ok('Empfangs-Kasten erscheint', await p2.locator('#inbox').isVisible());
ok('Text nennt die Anzahl', /geschickt/.test(await p2.locator('#inbox-x').textContent()));
await p2.screenshot({ path: OUT + '/08-inbox.png' });
await p2.locator('#inbox-merge').click();
await p2.waitForTimeout(300);
ok('Zusammenführen schließt den Kasten', await p2.locator('#inbox').isHidden());
ok('Anker ist aus der Adresse weg', (await p2.url()).includes('#liste='), false);
await p2.close();

/* ------------------------------------------------------------------- Offline */
console.log('\nOffline (Flugmodus)');
await ctx.setOffline(true);
await page.reload({ waitUntil: 'load' }).catch(() => {});
await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
await page.waitForTimeout(400);
ok('App startet offline aus dem Cache', await page.locator('#app').isVisible());
ok('Orte sind offline da', (await page.evaluate(() =>
   document.querySelectorAll('.card').length + (document.querySelector('#today') ? 1 : 0))) > 0);
await goTab('orte');
ok('Liste ist offline vollstaendig', (await page.locator('.card').count()) > 50);
const footOff = await page.locator('#foot-offline').textContent();
ok('Footer sagt offline', /Offline —/.test(footOff));
ok('Merkliste ist offline da', (await page.locator('#tab-n').textContent()).trim(), '1');
await page.screenshot({ path: OUT + '/09-offline.png' });
await ctx.setOffline(false);

/* ----------------------------------------------- Warnung bei falscher Fassung */
console.log('\nFassungs-Warnung (sw.js absichtlich auf v6)');
/* Der zweite Server ist optional. Der Kopf dieser Datei sagt das seit jeher
   zu -- getan hat es der Code nicht: ohne ihn lief page.goto in
   ERR_CONNECTION_REFUSED und riss die ganze Suite mit, nach 80 gruenen
   Pruefungen und noch vor Schriften und Konsole. Jetzt wird vorher
   angeklopft. */
let staleUp = true;
try {
  const r = await fetch(STALE + '/index.html', { method: 'HEAD' });
  staleUp = r.ok;
} catch { staleUp = false; }

if (!staleUp) {
  console.log('       uebersprungen -- kein Server auf ' + STALE);
  console.log('       (python3 -m http.server 8114 --directory <Kopie mit altem CACHE>)');
} else {
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'de-DE' });
  const p3 = await ctx2.newPage();
  await p3.goto(STALE + '/index.html', { waitUntil: 'load' });
  await p3.waitForSelector('#app:not([hidden])');
  await p3.waitForTimeout(1200);
  await p3.reload({ waitUntil: 'load' });        // erst jetzt steuert der Worker
  await p3.waitForSelector('#app:not([hidden])');
  await p3.waitForTimeout(1200);
  ok('Warnung steht im Footer', await p3.locator('.foot__warn').count(), 1);
  const warn = await p3.locator('.foot__warn').textContent();
  ok('Warnung nennt beide Staende', /v6/.test(warn) && warn.includes(MARK));
  console.log('       ' + warn.trim().replace(/\s+/g, ' '));
  await p3.screenshot({ path: OUT + '/10-warnung.png' });
  await ctx2.close();
}

/* ------------------------------------------------------------------ Schriften */
console.log('\nSchriften');
const fontUsed = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.card__name')).fontFamily);
console.log('       Überschrift laeuft auf: ' + fontUsed);
ok('Fallback-Stack greift (Fraunces oder Georgia)', /Fraunces|Georgia|serif/.test(fontUsed));

/* Seit v23 liegen die Schriften im Repo. Damit ist nicht mehr nur der
   Rueckfall pruefbar, sondern die Schrift selbst -- vorher war das hier
   nicht moeglich, weil Google aus dieser Umgebung nie antwortete. */
const schrift = await page.evaluate(async () => {
  await document.fonts.ready;
  const woff = performance.getEntriesByType('resource')
    .filter((e) => e.name.endsWith('.woff2'));
  const breit = (w) => {
    const s = document.createElement('span');
    s.style.cssText = 'position:absolute;visibility:hidden;font:' + w + ' 40px Fraunces';
    s.textContent = 'Peschiera kompakt';
    document.body.appendChild(s);
    const x = s.getBoundingClientRect().width;
    s.remove();
    return x;
  };
  return {
    fremd: woff.filter((e) => e.name.indexOf(location.origin) !== 0).map((e) => e.name),
    doppelt: woff.map((e) => e.name).filter((n, i, a) => a.indexOf(n) !== i),
    fuenfhundert: document.fonts.check('500 20px Fraunces'),
    sechshundert: document.fonts.check('600 20px Fraunces'),
    karla: document.fonts.check('700 15px Karla'),
    achseGreift: Math.abs(breit(500) - breit(600)) > 1
  };
});
ok('keine Schrift von fremdem Server', schrift.fremd, []);
ok('keine Schrift doppelt geladen (preload mit crossorigin)', schrift.doppelt, []);
ok('Fraunces 500 ist da', schrift.fuenfhundert);
ok('Fraunces 600 ist da', schrift.sechshundert);
ok('Karla 700 ist da', schrift.karla);
/* Beweist, dass die variable Achse wirkt und nicht nur zweimal derselbe
   Schnitt geladen wurde -- 500 und 600 kommen aus EINER Datei. */
ok('Gewichtsachse wirkt (500 und 600 verschieden breit)', schrift.achseGreift);

/* ------------------------------------------------------------------ Konsole */
console.log('\nKonsole');
/* Seit v23 laedt die App nichts mehr von fremden Servern, der Filter auf
   fonts.googleapis.com ist damit entfallen. Was bleibt, ist das Zertifikat
   des Proxys dieser Umgebung: Kartenkacheln laufen darueber und werden
   abgewiesen. Das ist ein Artefakt der Umgebung, kein Fehler der App. */
const realErrors = errors.filter((e) =>
  !/ERR_CERT_AUTHORITY_INVALID|ERR_FAILED/.test(e));
ok('keine Fehler in der Konsole', realErrors, []);
console.log(`       ${errors.length - realErrors.length} unterdrueckt (Proxy-Zertifikat)`);

/* ----------------------------------------------------------------- Ergebnis */
await browser.close();
console.log('');
if (fails.length) {
  console.log(`${fails.length} von ${pass + fails.length} Prüfungen fehlgeschlagen:\n`);
  fails.forEach((f) => console.log('  ✗ ' + f + '\n'));
  process.exit(1);
}
console.log(`✓ alle ${pass} Browser-Prüfungen bestanden`);
