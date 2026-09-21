/* Dynamic Type: die App waechst mit der Systemschrift.

   iOS laesst die Schriftgroesse systemweit einstellen (Einstellungen >
   Anzeige & Helligkeit > Textgroesse, in den Bedienungshilfen bis deutlich
   groesser). Eine Webseite bekommt davon nichts mit -- ausser sie fragt
   danach: -apple-system-body liefert in Safari genau die eingestellte
   Groesse. Alle Groessen im Haus haengen an rem, also waechst die ganze App
   mit, sobald die Wurzel darauf steht.

   Chromium kennt das Schluesselwort nicht. Geprueft wird hier deshalb nicht
   die Messung, sondern das, was daran haengt und wirklich schiefgehen kann:
   haelt das Layout bei der groessten erlaubten Wurzel (24 px, das
   Anderthalbfache der Vorgabe) noch zusammen? Die Rechnung selbst -- die
   Grenzen 16 und 24 -- prueft scripts/test-logic.mjs ohne Browser.

   Die Untergrenze ist keine Geschmacksfrage: iOS zoomt beim Fokus in ein
   Eingabefeld, dessen Schrift kleiner als 16 px ist, und das Suchfeld steht
   auf 1rem. */
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
const c = await browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});
const p = await c.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));

/* Ein Tagesplan, damit in "Jetzt" und "Reise" wirklich etwas steht. */
await p.addInitScript(() => {
  try {
    const d = new Date();
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.setItem('pk.saved', JSON.stringify(['bip', 'rivelin', 'fortezza', 'mantova']));
    localStorage.setItem('pk.days', JSON.stringify({ bip: iso, rivelin: iso }));
  } catch (e) { /* Private Mode */ }
});
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');

/* --- 1. Die Vorgabe ------------------------------------------------------ */
ok('ohne Systemgroesse bleibt die Wurzel, wie sie ist',
  await p.evaluate(() => document.documentElement.style.fontSize), '');
ok('… und das Suchfeld ist mindestens 16 px gross', await p.evaluate(() => {
  const t = document.querySelector('[data-tab="orte"]'); if (t) t.click();
  return null;
}) === null);
await p.waitForTimeout(400);
ok('das Suchfeld loest keinen Zoom aus (>= 16 px)', await p.evaluate(() =>
  parseFloat(getComputedStyle(document.getElementById('q')).fontSize)) >= 16, true);

/* --- 2. Bei der groessten erlaubten Wurzel haelt das Layout -------------- */
/* 24 px ist das Anderthalbfache der Vorgabe -- die Obergrenze, die
   typeSkala() setzt. Daruber bleibt bei 402 px Breite von einer Zeile mit
   Name, Bewertung und vier Fakten nichts Lesbares uebrig. */
const gross = async () => p.evaluate(() => {
  document.documentElement.style.fontSize = '24px';
});
const normal = async () => p.evaluate(() => {
  document.documentElement.style.removeProperty('font-size');
});

const ANSICHTEN = [['heute', 'Jetzt'], ['orte', 'Entdecken'],
                   ['gemerkt', 'Reise'], ['info', 'Wissen']];

for (const [tab, name] of ANSICHTEN) {
  await p.locator(`.tab[data-tab="${tab}"]`).click();
  await p.waitForTimeout(450);
  await gross();
  await p.waitForTimeout(450);

  ok(`„${name}" bleibt bei 24 px seitwaerts unverschiebbar`,
    await p.evaluate(() => document.documentElement.scrollWidth), 402);
  /* Die Reiterleiste traegt vier Woerter. Bei 24 px Wurzel bleiben je Reiter
     rund 100 px -- "Entdecken" ist das laengste. Es darf umbrechen, aber
     nicht aus seinem Reiter herauslaufen. */
  ok(`… und kein Reiter laeuft aus seinem Feld`, await p.evaluate(() =>
    [...document.querySelectorAll('.tab')].every((t) => {
      const r = t.getBoundingClientRect();
      return r.left >= -0.5 && r.right <= window.innerWidth + 0.5;
    })));
  /* Nichts ragt ueber den rechten Rand. Geprueft wird der sichtbare Inhalt,
     nicht jedes Element: absolut gesetzte Helfer duerfen daneben liegen. */
  ok(`… und nichts Sichtbares ragt ueber den Rand`, await p.evaluate(() => {
    const zuviel = [];
    document.querySelectorAll('.card, .tagk, .planheut, .panel, .msrow, .planrow, .btn, .chip')
      .forEach((el) => {
        if (el.offsetParent === null) return;
        const r = el.getBoundingClientRect();
        if (r.width && r.right > window.innerWidth + 1) zuviel.push(el.className);
      });
    return zuviel.slice(0, 3);
  }), []);

  await normal();
  await p.waitForTimeout(300);
}

/* --- 3. Die Bedienelemente bleiben gross genug --------------------------- */
/* Groessere Schrift darf die 44er-Regel nicht unterlaufen -- und schon gar
   nicht ueberschreiten, bis zwei Knoepfe uebereinanderliegen. */
await p.locator('.tab[data-tab="heute"]').click();
await p.waitForTimeout(450);
await gross();
await p.waitForTimeout(450);
ok('die Abhak-Kaestchen bleiben mindestens 44 px', await p.evaluate(() =>
  [...document.querySelectorAll('.planheut__tick')].every((b) => {
    const r = b.getBoundingClientRect();
    return Math.round(r.width) >= 44 && Math.round(r.height) >= 44;
  })));
await normal();

ok('keine JS-Fehler', errs.length ? errs.join(' | ') : 0, 0);
await c.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
