/* Nicht-Text-Kontraste: mindestens 3:1.

   Text hat im Haus schon immer AA-Kontrast; geprueft wurde er bisher von
   Hand. Was NICHT geprueft wurde, sind die Flaechen, an denen kein Wort
   steht und an denen man trotzdem etwas erkennen muss: die Umrandung eines
   Kaestchens, die gestrichelte Kante eines freien Tages, der Balken im
   Tagesfortschritt, der Ring einer Kartennadel.

   WCAG 2.1 verlangt dafuer 3:1 (1.4.11 "Non-text Contrast"). Genau dort
   faellt ein Haus wie dieses durch: eine Haarlinie in --line sieht auf dem
   Entwurf ruhig aus und ist auf einem Telefon in der Sonne nicht da.

   Gerechnet wird IM TEST nach der WCAG-Formel, nicht in der App. Gemessen
   wird gegen die Flaeche, auf der das Element wirklich liegt -- dafuer wird
   die Farbe des naechsten undurchsichtigen Vorfahren gesucht, nicht pauschal
   die Hintergrundfarbe der Seite angenommen.

   Beide Schemata: hell und dunkel. Ein Kontrast, der nur im Hellen haelt,
   ist keiner. */
import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};
const browser = ohneStartkarten(await chromium.launch());

/* Die WCAG-Formel, hier von Hand. */
const kanal = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const leucht = ([r, g, b]) =>
  0.2126 * kanal(r / 255) + 0.7152 * kanal(g / 255) + 0.0722 * kanal(b / 255);
const verhaeltnis = (a, b) => {
  const la = leucht(a), lb = leucht(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};
/* "rgb(31, 29, 24)" / "rgba(...)" -> [31,29,24]; mit Alpha ueber der
   Unterlage gemischt, sonst waere ein halbtransparenter Rand zu gut
   gerechnet. */
const farbe = (txt, unter) => {
  const m = /rgba?\(([^)]+)\)/.exec(String(txt || ''));
  if (!m) return null;
  const t = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const rgb = [t[0], t[1], t[2]];
  const a = t.length > 3 ? t[3] : 1;
  if (a >= 1 || !unter) return rgb;
  if (a <= 0) return null;
  return rgb.map((c, i) => Math.round(c * a + unter[i] * (1 - a)));
};

/* Die Farbe der Flaeche, auf der ein Element liegt: der naechste Vorfahr
   mit undurchsichtigem Hintergrund. */
const UNTERGRUND = `(el) => {
  let n = el;
  while (n && n !== document.documentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    const m = /rgba?\\(([^)]+)\\)/.exec(bg || '');
    if (m) {
      const t = m[1].split(/[,\\s/]+/).filter(Boolean).map(Number);
      if ((t.length < 4 ? 1 : t[3]) >= 0.95) return bg;
    }
    n = n.parentElement;
  }
  return getComputedStyle(document.body).backgroundColor;
}`;

/* Eine Stelle: Selektor, welche Farbe geprueft wird, und wie sie heisst. */
const STELLEN = [
  { sel: '.planheut__tick', teil: 'borderTopColor', name: 'das Abhak-Kästchen in „Jetzt“' },
  /* Die Spur ist Flaeche, die Fuellung traegt die Aussage -- gemessen wird
     deshalb die Fuellung GEGEN DIE SPUR. */
  { sel: '.planheut__bar i', teil: 'backgroundColor', name: 'der Fortschrittsbalken',
    gegen: '.planheut__bar' },
  { sel: '.uebs__d--leer', teil: 'borderTopColor', name: 'ein freier Tag im Raster' },
  { sel: '.uebs__d--voll', teil: 'borderTopColor', name: 'ein verplanter Tag im Raster' },
  { sel: '.tagk--frei', teil: 'borderTopColor', name: 'die Karte des nächsten freien Tages' },
  { sel: '.chip', teil: 'borderTopColor', name: 'ein Chip im Kopf' },
  { sel: '.btn', teil: 'borderTopColor', name: 'ein Knopf' },
  { sel: '.seg', teil: 'borderTopColor', name: 'ein Abschnitt in der Leiste' },
  { sel: '.search__input', teil: 'borderTopColor', name: 'das Suchfeld' },
  { sel: '.tab[aria-current="page"] svg', teil: 'color', name: 'das Symbol des aktiven Reiters' }
];

/* Welche Stellen in welcher Ansicht ueberhaupt vorkommen -- und dass jede
   von ihnen irgendwo geprueft wurde. Eine Stelle stillschweigend zu
   ueberspringen, weil sie gerade nicht da ist, waere eine Pruefung, die sich
   selbst abschaltet. */
const gesehen = new Set();

async function pruefe(seite, schema) {
  for (const st of STELLEN) {
    const wert = await seite.evaluate(([sel, teil, unterFn, gegen]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const bezug = gegen ? document.querySelector(gegen) : (el.parentElement || el);
      if (!bezug) return null;
      const unter = eval('(' + unterFn + ')')(bezug);
      return { vorn: getComputedStyle(el)[teil], hinten: unter };
    }, [st.sel, st.teil, UNTERGRUND, st.gegen || '']);

    /* Nicht in dieser Ansicht -- dann eben in der naechsten. */
    if (!wert) continue;
    gesehen.add(st.name + '|' + schema);
    const hinten = farbe(wert.hinten, [255, 255, 255]);
    const vorn = farbe(wert.vorn, hinten);
    if (!vorn || !hinten) { ok(`${st.name} hat eine Farbe (${schema})`, wert, 'Farbe'); continue; }
    const v = verhaeltnis(vorn, hinten);
    ok(`${st.name}: ${v.toFixed(2)}:1 (${schema})`, v >= 3, true);
  }
}

for (const schema of ['light', 'dark']) {
  const c = await browser.newContext({
    viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE',
    colorScheme: schema
  });
  const p = await c.newPage();
  /* Ein Tagesplan fuer heute, damit Kaestchen und Balken ueberhaupt
     dastehen. */
  await p.addInitScript(() => {
    try {
      const d = new Date();
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
      localStorage.setItem('pk.saved', JSON.stringify(['bip', 'rivelin', 'fortezza']));
      localStorage.setItem('pk.days', JSON.stringify({ bip: iso, rivelin: iso }));
      localStorage.setItem('pk.theme', JSON.stringify(location.search.indexOf('dark') >= 0 ? 'dark' : 'light'));
    } catch (e) { /* Private Mode */ }
  });
  await p.goto(BASE + '/' + (schema === 'dark' ? '?dark=1' : ''), { waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.waitForTimeout(500);
  ok(`das Schema steht auf ${schema}`,
    await p.evaluate(() => document.documentElement.getAttribute('data-theme')), schema);
  await pruefe(p, schema);

  /* Das Raster und die Tageskarte stehen in "Reise". */
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(500);
  await pruefe(p, schema);
  /* Das Suchfeld steht nur in "Entdecken". */
  await p.locator('.tab[data-tab="orte"]').click();
  await p.waitForTimeout(450);
  await pruefe(p, schema);
  await c.close();

  /* Jede Stelle muss irgendwo vorgekommen sein. */
  for (const st of STELLEN) {
    ok(`${st.name} kam vor (${schema})`, gesehen.has(st.name + '|' + schema), true);
  }
}

await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
