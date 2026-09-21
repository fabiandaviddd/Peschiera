/* Ein Tag kostet Aufenthalt PLUS Wege.

   Bis v36 hiess "4,5 h" auf einer Tageskarte in Wahrheit "4,5 h Aufenthalt
   und null Wege". Bei vier Stationen quer um den See fehlten darin zwei
   Stunden, und der Tag sah machbar aus, der es nicht war. Zwischen zwei
   Stationen stand nur dann etwas, wenn sie weiter als 1,2 km Luftlinie
   auseinanderlagen -- und dann eine Warnung ohne Zeitangabe.

   Seit v37 rechnet die App die Wege. Geroutet wird nicht: ein
   Routing-Dienst braucht Netz, und diese App funktioniert im Flugmodus.
   Gerechnet wird aus der Luftlinie mal 1,50, geteilt durch 4,5 / 15 / 45
   km/h. Diese Suite sichert die Zusagen ab, die daran haengen:

     1. jeder gerechnete Wert traegt ein "≈", jeder gemessene nicht
     2. ohne geo wird nicht geraten -- die Zeile bleibt weg
     3. die Wahl des Modus aendert die Zeiten und ueberlebt den Neustart
     4. ueber 8 km sagt die App, dass sie keinen Fussweg mehr rechnet
     5. Reise und "Jetzt" nennen fuer denselben Weg dieselbe Zahl

   Die Zahlen werden IM TEST nachgerechnet, nicht aus der App gelesen: eine
   Pruefung, die die App fragt, ob die App recht hat, prueft nichts. */
import { createRequire } from 'node:module';
const BASE = process.env.PK_BASE || 'http://localhost:8765';
const require2 = createRequire(import.meta.url);
const { chromium } = require2(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const DATEN = require2('../../data/places.json');
const R = [];
const ok = (n, got, want = true) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  R.push([a === b ? 'PASS' : 'FAIL', n, a === b ? '' : `erwartet ${b}, bekommen ${a}`]);
  if (a !== b) process.exitCode = 1;
};

/* Dieselbe Rechnung wie in app.js, hier von Hand. */
const UMWEG = 1.5, V = { fuss: 4.5, rad: 15, auto: 45 }, PARKEN = { fuss: 0, rad: 0, auto: 10 };
const luft = (a, b) => {
  const Rk = 6371, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const x = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return Rk * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const wegKm = (a, b) => luft(a.geo, b.geo) * UMWEG;
const wegMin = (kmv, m) => Math.round(kmv / V[m] * 60 + (kmv > 0.05 ? PARKEN[m] : 0));

const byId = {};
DATEN.places.forEach((p) => { byId[p.id] = p; });

const browser = await chromium.launch();
const mach = () => browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});

/* Zwei nahe Orte fuer den Fusstag, einer weit draussen fuer den Autotag --
   aus den Daten gesucht, nicht in die Suite geschrieben. */
const basis = DATEN.meta.base_geo;
const nah = DATEN.places.filter((p) => p.geo && luft(basis, p.geo) < 1.5).slice(0, 3);
const fern = DATEN.places.filter((p) => p.geo && luft(basis, p.geo) > 25)[0];
ok('drei nahe Orte in den Daten', nah.length, 3);
ok('ein Ort ueber 25 km draussen', !!fern);

const ctx = await mach();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');

/* Der Reisetag kommt aus dem Raster, nicht aus der Suite: ein festes Datum
   faellt mit jedem Tag der Reise weiter in die Vergangenheit. */
await p.locator('.tab[data-tab="gemerkt"]').click();
await p.waitForTimeout(450);
const tag = await p.evaluate(() => {
  const z = document.querySelector('.uebs__d:not(.uebs__d--vorbei):not(.uebs__d--heute)');
  return z ? z.getAttribute('data-dayopen') : '';
});
ok('es gibt einen Reisetag, der noch kommt', /^\d{4}-\d{2}-\d{2}$/.test(tag));

const lege = async (ids, iso) => {
  await p.evaluate(([list, t]) => {
    localStorage.setItem('pk.saved', JSON.stringify(list));
    const d = {};
    list.forEach((id) => { d[id] = t; });
    localStorage.setItem('pk.days', JSON.stringify(d));
    localStorage.setItem('pk.seen', '[]');
    localStorage.removeItem('pk.mode');
  }, [ids, iso]);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(450);
};

/* --- 1. Die Tageskarte zaehlt die Wege mit -------------------------------- */
const drei = nah.map((x) => x.id);
await lege(drei, tag);

ok('drei Stationen stehen auf der Karte', await p.locator('.tagk__st').count(), 3);
ok('… und zwei Wege dazwischen', await p.locator('.tagk__wg').count(), 2);

const sollFuss = wegMin(wegKm(nah[0], nah[1]), 'fuss') + wegMin(wegKm(nah[1], nah[2]), 'fuss');
const sollAuf = nah.reduce((a, x) => a + (x.time_min || 0), 0);
const kopf = (await p.locator('.tagk__sum').first().textContent()).trim();
/* Alles Gerechnete traegt das Zeichen. Gemessenes (walk_min ab dem
   Zeltplatz) traegt keines -- das ist dieselbe Beweislast, die hoursWindow()
   schon traegt. */
ok('die Tagessumme ist als geschaetzt gekennzeichnet', /^≈ /.test(kopf));
const minAus = (txt) => {
  const h = /([\d,]+)\s*h/.exec(txt), m = /(\d+)\s*Min/.exec(txt);
  return (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
};
/* Auf zehn Minuten genau: die Karte rundet auf "4,5 h", die Rechnung nicht. */
ok('… und enthaelt Aufenthalt plus Wege',
  Math.abs(minAus(kopf) - (sollAuf + sollFuss)) <= 10, true);

const auf = (await p.locator('.tagk__auf').first().textContent()).trim();
ok('die Aufteilung nennt beides', /vor Ort · ≈ .* Wege zu Fuß/.test(auf));
ok('… und der Aufenthalt darin ist der gemessene', minAus(auf.split('·')[0]), sollAuf);

/* --- 2. Das Tages-Sheet: Wege zwischen den Stationen ---------------------- */
await p.locator('.tagk:not(.tagk--frei)').first().click();
await p.waitForTimeout(600);
ok('im Sheet stehen zwei Wegzeilen', await p.locator('.tagweg').count(), 2);
const w1 = (await p.locator('.tagweg').first().textContent()).trim();
ok('die Wegzeile ist gekennzeichnet', /^≈ /.test(w1));
ok('… und nennt den Modus', /zu Fuß$/.test(w1));
ok('… mit der gerechneten Zeit',
  minAus(w1.split('·')[1]), wegMin(wegKm(nah[0], nah[1]), 'fuss'));

/* --- 3. Der Modus aendert die Zeiten ------------------------------------- */
ok('drei Modi stehen zur Wahl', await p.locator('.wmode__b').count(), 3);
ok('zu Fuss ist vorgeschlagen und an',
  await p.locator('.wmode__b[data-wmode="fuss"]').getAttribute('aria-pressed'), 'true');
await p.locator('.wmode__b[data-wmode="rad"]').click();
await p.waitForTimeout(400);
ok('nach der Wahl ist Rad an',
  await p.locator('.wmode__b[data-wmode="rad"]').getAttribute('aria-pressed'), 'true');
const w2 = (await p.locator('.tagweg').first().textContent()).trim();
ok('… und die Zeit ist die Radzeit',
  minAus(w2.split('·')[1]), wegMin(wegKm(nah[0], nah[1]), 'rad'));
ok('… und die Strecke bleibt dieselbe', w2.split('·')[0].trim(), w1.split('·')[0].trim());
/* Die Uebersicht dahinter muss mitziehen -- die Tageskarte nennt dieselbe
   Summe, und zwei Zahlen fuer denselben Tag waeren ein Fehler. */
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
const sollRad = wegMin(wegKm(nah[0], nah[1]), 'rad') + wegMin(wegKm(nah[1], nah[2]), 'rad');
ok('die Tageskarte zieht nach',
  Math.abs(minAus((await p.locator('.tagk__sum').first().textContent())) - (sollAuf + sollRad)) <= 10,
  true);
ok('… und nennt den gewaehlten Modus',
  /mit dem Rad/.test(await p.locator('.tagk__auf').first().textContent()));

/* Die Wahl ueberlebt den Neustart: sie steht in pk.mode, und nur die
   Abweichung vom Vorschlag wird gespeichert. */
ok('gespeichert unter pk.mode', await p.evaluate((t) =>
  JSON.parse(localStorage.getItem('pk.mode') || '{}')[t], tag), 'rad');
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await p.locator('.tab[data-tab="gemerkt"]').click();
await p.waitForTimeout(450);
ok('nach dem Neuladen gilt sie weiter',
  /mit dem Rad/.test(await p.locator('.tagk__auf').first().textContent()));

/* --- 4. Ueber 8 km rechnet die App keinen Fussweg ------------------------ */
await lege(drei.concat([fern.id]), tag);
await p.locator('.tagk:not(.tagk--frei)').first().click();
await p.waitForTimeout(600);
ok('ein Ort weit draussen macht den Tag zum Autotag',
  await p.locator('.wmode__b[data-wmode="auto"]').getAttribute('aria-pressed'), 'true');
await p.locator('.wmode__b[data-wmode="fuss"]').click();
await p.waitForTimeout(400);
ok('wer trotzdem zu Fuss waehlt, bekommt es gesagt',
  await p.locator('.tagsheet__warn').count(), 1);
ok('… mit der Grenze im Wortlaut',
  /Über 8 km rechnet die App keinen Fußweg/.test(
    await p.locator('.tagsheet__warn').textContent()));
/* Genannt, nicht verboten: die Wahl bleibt bestehen. */
ok('… aber die Wahl bleibt',
  await p.locator('.wmode__b[data-wmode="fuss"]').getAttribute('aria-pressed'), 'true');
await p.keyboard.press('Escape');
await p.waitForTimeout(450);

/* --- 5. Ohne geo wird nicht geraten -------------------------------------- */
{
  const c2 = await mach();
  await c2.route('**/data/places.json*', async (route) => {
    const antwort = await route.fetch();
    const daten = JSON.parse(await antwort.text());
    for (const o of daten.places) if (o.id === nah[1].id) o.geo = null;
    await route.fulfill({ status: 200, contentType: 'application/json',
                          body: JSON.stringify(daten) });
  });
  const q = await c2.newPage();
  /* Der Speicher wird VOR dem ersten Laden gesetzt, nicht danach mit einem
     reload: nach dem ersten Laden steht der Service Worker und liefert
     places.json aus seinem Cache -- die abgefangene Fassung ohne geo kaeme
     nie an, und die Pruefung liefe gegen die echten Daten. */
  await q.addInitScript(([list, t]) => {
    try {
      localStorage.setItem('pk.saved', JSON.stringify(list));
      const d = {};
      list.forEach((id) => { d[id] = t; });
      localStorage.setItem('pk.days', JSON.stringify(d));
    } catch (e) { /* Private Mode -- dann eben ohne */ }
  }, [drei, tag]);
  await q.goto(BASE + '/', { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await q.locator('.tab[data-tab="gemerkt"]').click();
  await q.waitForTimeout(450);
  ok('drei Stationen, aber die mittlere ohne Koordinate',
    await q.locator('.tagk__st').count(), 3);
  ok('… also keine einzige Wegzeile', await q.locator('.tagk__wg').count(), 0);
  await q.locator('.tagk:not(.tagk--frei)').first().click();
  await q.waitForTimeout(600);
  ok('… auch nicht im Sheet', await q.locator('.tagweg').count(), 0);
  /* Gezaehlt wird die Luecke trotzdem: eine Summe muss sagen, worauf sie
     sich stuetzt. */
  ok('… aber die Luecken werden genannt',
    /2 Wege ohne Koordinate/.test(await q.locator('.tagsheet__budget').textContent()));
  await c2.close();
}

/* --- 6. "Jetzt" nennt fuer denselben Weg dieselbe Zahl ------------------- */
/* Zwei Wahrheiten fuer denselben Weg waeren schlimmer als gar keine. */
const heute = await p.evaluate(() => {
  const d = new Date(), m = String(d.getMonth() + 1).padStart(2, '0');
  return d.getFullYear() + '-' + m + '-' + String(d.getDate()).padStart(2, '0');
});
await lege(drei, heute);
await p.locator('.tab[data-tab="heute"]').click();
await p.waitForTimeout(500);
ok('in "Jetzt" stehen die Wege zwischen den Stationen',
  await p.locator('.planheut__w').count(), 2);
const jw = (await p.locator('.planheut__w').first().textContent()).trim();
ok('… gekennzeichnet und mit Modus', /^≈ .* zu Fuß$/.test(jw));
ok('… und mit derselben Zahl wie in der Reise',
  minAus(jw.split('·')[1]), wegMin(wegKm(nah[0], nah[1]), 'fuss'));
/* Die Restzeit zaehlt die Wege mit -- aber nur die, die noch bevorstehen. */
const restVor = (await p.locator('.planheut__n').textContent()).trim();
ok('die Restzeit ist als geschaetzt gekennzeichnet', /noch ≈ /.test(restVor));
await p.locator('.planheut__tick').first().click();
await p.waitForTimeout(400);
ok('abhaken zaehlt hoch', /^1 von 3/.test(
  (await p.locator('.planheut__n').textContent()).trim()));
/* Station 1 ist erledigt -- der Weg von 1 nach 2 steht aber noch bevor,
   denn 2 ist noch offen. Erst wenn 2 abgehakt ist, faellt er heraus. */
const restNach1 = minAus((await p.locator('.planheut__n').textContent()));
await p.locator('.planheut__tick').nth(1).click();
await p.waitForTimeout(400);
const restNach2 = minAus((await p.locator('.planheut__n').textContent()));
ok('ein erledigter Weg faellt aus der Restzeit',
  restNach2 < restNach1, true);

/* --- 7. Die kuerzeste Runde ---------------------------------------------- */
/* "Sortierung nach kuerzester Runde" stand seit v28 unter "Spaeter
   angedacht". Vorgeschlagen, nicht durchgesetzt: die App kennt die
   Entfernungen, nicht die Oeffnungszeiten im Kopf des Planers. */
{
  /* Fuenf nahe Orte in der SCHLECHTESTEN Reihenfolge. "Der weiteste zuerst"
     reicht nicht: bei fuenf Orten rund um den Hafen ist das zufaellig oft
     schon die kuerzeste Runde, und dann steht zu Recht kein Vorschlag da --
     die Pruefung waere rot, obwohl die App recht hat.

     Also wird hier IM TEST gerechnet, welche Reihenfolge die laengste ist,
     und genau die gelegt. Dann MUSS die App etwas Kuerzeres finden. */
  const kandidaten = DATEN.places.filter((x) => x.geo && luft(basis, x.geo) < 2).slice(0, 5);
  const rundeKm = (folge) => {
    let summe = 0, vorher = { geo: basis };
    folge.forEach((o) => { summe += wegKm(vorher, o); vorher = o; });
    return summe + wegKm(vorher, { geo: basis });
  };
  const alleFolgen = (rest, gebaut = []) => rest.length
    ? rest.flatMap((x, i) => alleFolgen(rest.slice(0, i).concat(rest.slice(i + 1)), gebaut.concat([x])))
    : [gebaut];
  const folgen = alleFolgen(kandidaten);
  const fuenf = folgen.reduce((a, b) => (rundeKm(b) > rundeKm(a) ? b : a));
  ok('die schlechteste Runde ist laenger als die beste',
    rundeKm(fuenf) > rundeKm(folgen.reduce((a, b) => (rundeKm(b) < rundeKm(a) ? b : a))), true);
  await lege(fuenf.map((x) => x.id), tag);
  await p.locator('.tagk:not(.tagk--frei)').first().click();
  await p.waitForTimeout(600);

  const gibtVorschlag = await p.locator('[data-runde]').count();
  ok('bei fuenf Stationen steht ein Rundenvorschlag da', gibtVorschlag, 1);
  const text = (await p.locator('.runde__s').textContent()).trim();
  ok('… mit beiden Zahlen', /≈ .* statt ≈ /.test(text));
  ok('… und dem Bezugspunkt im Wortlaut', /ab dem Zeltplatz und zurück/.test(text));

  const vorher = await p.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__row--drin .tagsheet__name')]
      .map((e) => e.textContent));
  await p.locator('[data-runde]').click();
  await p.waitForTimeout(500);
  const nachher = await p.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__row--drin .tagsheet__name')]
      .map((e) => e.textContent));
  ok('Übernehmen ändert die Reihenfolge wirklich', nachher.join('|') !== vorher.join('|'));
  ok('… ohne eine Station zu verlieren', nachher.slice().sort().join('|'),
    vorher.slice().sort().join('|'));
  /* Danach ist nichts mehr zu holen -- und dann steht dort kein Knopf ohne
     Wirkung, sondern eine Zeile, die das sagt. */
  ok('danach meldet die App, dass es die kuerzeste ist',
    await p.locator('.runde--gut').count(), 1);
  ok('… und bietet keinen Knopf mehr an', await p.locator('[data-runde]').count(), 0);

  /* Die Reihenfolge steht in pk.saved und ueberlebt den Neustart. */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(450);
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app:not([hidden])');
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(450);
  ok('die neue Reihenfolge ueberlebt den Neustart', await p.evaluate(() =>
    [...document.querySelectorAll('.tagk:not(.tagk--frei) .tagk__n')]
      .map((e) => e.textContent)), nachher);

  /* Unter drei Stationen gibt es nichts zu drehen: A-B und B-A sind
     dieselbe Runde. */
  await lege(fuenf.slice(0, 2).map((x) => x.id), tag);
  await p.locator('.tagk:not(.tagk--frei)').first().click();
  await p.waitForTimeout(600);
  ok('bei zwei Stationen steht kein Vorschlag da',
    await p.locator('[data-runde], .runde--gut').count(), 0);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(400);
}

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
