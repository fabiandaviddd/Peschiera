/* Der Plan kann seit v28 Tage: jeder gemerkte Ort laesst sich einem
   Reisetag zuordnen, die Ansicht gruppiert danach und rechnet je Tag die
   eingeplante Zeit zusammen.

   Bis v27 konnte der Plan nur eine Reihenfolge. Fuer vierzehn Tage Reise ist
   eine einzige lange Liste kein Plan, sondern ein Stapel -- das Urteil kam
   vom Besitzer und stimmte.

   Geprueft wird der ganze Weg: zuordnen, gruppieren, rechnen, neu laden,
   innerhalb der Gruppe verschieben, teilen samt Tagen, zusammenfuehren ohne
   die eigene Planung zu verlieren, und ein alter Link ohne Tage. */
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
const mach = () => browser.newContext({
  viewport: { width: 402, height: 754 }, hasTouch: true, locale: 'de-DE'
});

/* Seit v36 ist "Reise" EINE Ansicht: Raster, Tageskarten, Vorrat
   untereinander. Bis v35 waren es zwei Haelften hinter einer Umschaltleiste
   -- wer den Vorrat sehen wollte, verlor den Plan aus dem Bild, obwohl man
   beim Planen staendig aus dem einen in den anderen zieht.

   zumPlan und zurMerk fuehren deshalb beide an dieselbe Stelle. Die Namen
   bleiben, damit die Stellen unten lesbar bleiben, an denen es um die eine
   oder die andere Haelfte geht. */
const zumPlan = async (p) => {
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(450);
};
const zurMerk = zumPlan;

/* Dieselbe Beschriftung, die tripTage() baut -- hier nachgerechnet, damit
   kein Datum fest in der Suite steht. */
const LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const langTag = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return LANG[d.getDay()] + ', ' + String(d.getDate()).padStart(2, '0')
    + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
};

/* Orte mit time_min direkt aus den Daten holen. IDs zu raten hiesse, dass die
   Suite mit dem naechsten Datenstand luegt statt fehlzuschlagen. */
const ctx = await mach();
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/', { waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
const orte = await p.evaluate(async () => {
  const d = await (await fetch('./data/places.json')).json();
  return d.places.filter((x) => x.time_min).slice(0, 5)
    .map((x) => ({ id: x.id, name: x.name, min: x.time_min }));
});
ok('fuenf Orte mit Aufenthaltsdauer in den Daten', orte.length, 5);

await p.evaluate((ids) => localStorage.setItem('pk.saved', JSON.stringify(ids)),
  orte.map((o) => o.id));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);

/* --- 1. Eine Ansicht: Raster, Tage, Vorrat ------------------------------- */
/* Bis v35 waren das zwei Haelften hinter einer Umschaltleiste. Die Trennung
   war richtig gedacht -- der Fahrplan und der Vorrat sind zwei Dinge --,
   kostete aber einen Umschalter fuer etwas, das man beim Planen staendig
   zusammen braucht. Die Mengen bleiben ueberschneidungsfrei: ein Ort ist
   entweder verplant oder im Vorrat. */
ok('es gibt keine Umschaltleiste mehr', await p.locator('.ptabs').count(), 0);
ok('die Ansicht nennt die Zahl der Reisetage',
  (await p.locator('.reise__t').textContent()).trim(), 'Fünfzehn Tage');
ok('… und sagt, dass noch nichts verplant ist',
  (await p.locator('.reise__s').textContent()).trim(), 'noch nichts verplant');

/* Das Raster steht seit v36 IMMER da, auch ohne eine einzige Zuordnung.
   Bis v35 erschien es erst mit der ersten -- mit der Begruendung, es waere
   sonst ein leeres Raster ueber einer Merkliste. Die Merkliste darunter gibt
   es nicht mehr, und wenn nichts geplant ist, IST das Raster die
   Aufforderung. */
ok('das Raster steht auch ohne Zuordnung da', await p.locator('.uebs').count(), 1);
ok('… mit allen fuenfzehn Tagen', await p.locator('.uebs__d').count(), 15);

/* Keine Tageskarte ohne Tag -- ausser der einen fuer den naechsten freien. */
ok('es gibt noch keine volle Tageskarte',
  await p.locator('.tagk:not(.tagk--frei)').count(), 0);
ok('… aber eine fuer den naechsten freien Tag',
  await p.locator('.tagk--frei').count(), 1);
ok('… und die sagt, wie viel im Vorrat liegt',
  /5 Orte liegen im Vorrat/.test(await p.locator('.tagk__leer').textContent()));

const vorratN = async () => p.evaluate(() =>
  +document.querySelector('.vorrat__n').textContent);
ok('der Vorrat steht darunter und zaehlt', await vorratN(), 5);
ok('… mit einer Zeile je Ort', await p.locator('.planrow').count(), 5);
ok('jede Zeile traegt einen Tageswaehler', await p.locator('select[data-day]').count(), 5);
/* Keine Nummer und keine Pfeile: im Vorrat gibt es keine Reihenfolge, die
   etwas bedeutet -- Pfeile waeren dort ein Bedienelement ohne Aussage. Seit
   v36 stehen sie im Tages-Sheet, wo geaendert wird. */
ok('… aber keine Nummern', await p.locator('.planrow__n').count(), 0);
ok('… und keine Umstell-Pfeile in der Uebersicht',
  await p.locator('#list .pmove').count(), 0);

/* Die Reisetage werden aus dem Waehler gelesen, nicht in die Suite
   geschrieben. Ein festes Datum faellt mit jedem Tag der Reise weiter in die
   Vergangenheit, und ein vergangener Tag ist nicht mehr waehlbar -- die
   Suite waere an einem Montag rot geworden, an dem die App heil ist. Genau
   das ist beim Lauf am 21.09. passiert. */
const frei = await p.evaluate(() => {
  const d = new Date();
  const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
    + '-' + String(d.getDate()).padStart(2, '0');
  return [...new Set([...document.querySelectorAll('select[data-day] option')]
    .filter((o) => o.value && !o.disabled).map((o) => o.value))].filter((v) => v > iso);
});
ok('mindestens vier Reisetage liegen noch vor uns', frei.length >= 4);
const [tagA, tagB, tagC, tagD] = frei;

/* --- 2. Zuordnen gruppiert und rechnet ------------------------------------ */
await p.selectOption(`select[data-day="${orte[0].id}"]`, tagA);
await p.waitForTimeout(300);
await p.selectOption(`select[data-day="${orte[1].id}"]`, tagA);
await p.waitForTimeout(300);
await p.selectOption(`select[data-day="${orte[2].id}"]`, tagB);
await p.waitForTimeout(300);

/* Zugeordnet wird im Vorrat -- der Ort verschwindet dort und taucht als
   Station einer Tageskarte auf. Genau dieser Uebergang ist die Aufgabe der
   beiden Sektionen. */
ok('der Vorrat schrumpft', await vorratN(), 2);
ok('… und zeigt nur noch zwei Zeilen', await p.locator('.planrow').count(), 2);
ok('die Ansicht zaehlt die verplanten Tage',
  (await p.locator('.reise__s').textContent()).trim(), '2 verplant · 3 Orte');

ok('es stehen zwei Tageskarten da',
  await p.locator('.tagk:not(.tagk--frei)').count(), 2);
ok('… in ihrer Reihenfolge',
  await p.evaluate(() => [...document.querySelectorAll('.tagk:not(.tagk--frei)')]
    .map((k) => k.getAttribute('data-dayopen'))), [tagA, tagB]);
ok('… mit einer Station je Ort',
  await p.locator('.tagk:not(.tagk--frei) .tagk__st').count(), 3);
/* Die Karte ist ein Knopf und oeffnet dasselbe Sheet wie eine Rasterzelle --
   ein Einstieg statt zweier. */
ok('… und jede Karte oeffnet ihren Tag', await p.evaluate(() =>
  [...document.querySelectorAll('.tagk')].every((k) =>
    k.tagName === 'BUTTON' && /^\d{4}-\d{2}-\d{2}$/.test(k.getAttribute('data-dayopen') || ''))));

/* Die Tagessumme muss aus den Daten kommen. Gegengerechnet wird mit denselben
   Minuten, die oben aus places.json gelesen wurden -- nicht mit dem, was die
   App gerade anzeigt. */
const summeSoll = orte[0].min + orte[1].min;
const minAus = (t) => {
  const h = /([\d,]+)\s*h/.exec(t), m = /(\d+)\s*Min/.exec(t);
  return (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
};
/* Seit v37 zaehlt die Kopfzahl Aufenthalt UND Wege -- bis v36 hiess "4,5 h"
   in Wahrheit "4,5 h Aufenthalt und null Wege". Der reine Aufenthalt steht
   in der Aufteilung darunter, und DER muss der Summe aus den Daten
   entsprechen. Die Wege haben ihre eigene Suite (wege.mjs). */
const aufIst = await p.evaluate(() =>
  document.querySelector('.tagk__auf').textContent.split('·')[0]);
ok('der Aufenthalt ist aus den Daten gerechnet', Math.round(minAus(aufIst)), summeSoll);
const summeIst = await p.evaluate(() => document.querySelector('.tagk__sum').textContent);
ok('… und die Kopfzahl zaehlt die Wege dazu',
  Math.round(minAus(summeIst)) > summeSoll, true);
ok('… und ist als geschaetzt gekennzeichnet', /^≈ /.test(summeIst.trim()));
ok('gespeichert unter pk.days', await p.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('pk.days') || '{}')).length), 3);

/* --- 3. Neu laden: alles noch da ------------------------------------------ */
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('nach dem Neuladen stehen die Tageskarten wieder',
  await p.locator('.tagk:not(.tagk--frei)').count(), 2);
ok('… und die Waehler zeigen ihren Tag', await p.evaluate((o) =>
  document.querySelector(`select[data-day="${o}"]`)
    ? document.querySelector(`select[data-day="${o}"]`).value : 'weg', orte[0].id), 'weg');
ok('… denn der zugeordnete Ort ist aus dem Vorrat heraus', await vorratN(), 2);

/* --- 4. Verschieben bleibt in der Gruppe ---------------------------------- */
/* Geaendert wird seit v36 im Tages-Sheet: die Uebersicht zeigt, das Sheet
   aendert. Verschoben wird innerhalb des Tages -- zwischen dem letzten Ort
   von Dienstag und dem ersten von Mittwoch liegt eine Nacht, keine
   Wanderung. */
await p.locator('.tagk:not(.tagk--frei)').first().click();
await p.waitForTimeout(600);
ok('die Tageskarte oeffnet das Sheet', await p.locator('#sheet').isVisible());
ok('… mit Nummern an den Stationen',
  await p.locator('.tagsheet__nr').count(), 2);
ok('… und Umstell-Pfeilen', await p.locator('#sheet .pmove').count(), 4);
const sheetNamen = () => p.evaluate(() =>
  [...document.querySelectorAll('.tagsheet__row--drin .tagsheet__name')]
    .map((e) => e.textContent));
const vorher = await sheetNamen();
await p.locator('#sheet .pmove[data-down]:not([disabled])').first().click();
await p.waitForTimeout(450);
const nachher = await sheetNamen();
ok('nach unten schieben vertauscht wirklich', nachher[0], vorher[1]);
ok('… und die Nummern zaehlen weiter von eins',
  await p.evaluate(() => [...document.querySelectorAll('.tagsheet__nr')]
    .map((e) => e.textContent)), ['1', '2']);
await p.keyboard.press('Escape');
await p.waitForTimeout(500);
ok('Escape schliesst das Sheet', await p.locator('#sheet').isVisible(), false);
ok('… und zeigt die neue Reihenfolge', await p.evaluate(() =>
  [...document.querySelectorAll('.tagk:not(.tagk--frei)')][0]
    .querySelector('.tagk__n').textContent), nachher[0]);

/* --- 5. Ein ueberfuellter Tag wird genannt, nicht bewertet ---------------- */
await p.evaluate((t) => {
  const d = JSON.parse(localStorage.getItem('pk.days') || '{}');
  JSON.parse(localStorage.getItem('pk.saved') || '[]')
    .forEach((id) => { d[id] = t; });
  localStorage.setItem('pk.days', JSON.stringify(d));
}, tagC);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
const alleMin = orte.reduce((a, o) => a + o.min, 0);
const voll = await p.evaluate(() => {
  const e = document.querySelector('.tagk__sum--voll');
  return e ? e.textContent.indexOf('mehr als 10 h') >= 0 : false;
});
ok('ueber 10 h an einem Tag traegt der Kopf den Hinweis',
  voll, alleMin > 600);
/* Der Hinweis darf nicht zur Bewertung werden: er nennt die Summe und die
   Grenze, mehr nicht. */
ok('… und nennt die Grenze woertlich statt zu urteilen',
  /mehr als 10 h/.test(await p.locator('.tagk__sum--voll').textContent()));

/* --- 6. Teilen traegt die Tage mit --------------------------------------- */
/* Der Link wird hier nachgebaut statt ueber den Teilen-Knopf geholt: der
   haengt an navigator.share bzw. der Zwischenablage, und beide sind im
   Testlauf launisch. Das Format ist dasselbe, das shareLink() erzeugt. */
const link = await p.evaluate(() => {
  const payload = {
    v: 1,
    m: JSON.parse(localStorage.getItem('pk.saved') || '[]'),
    g: [],
    d: JSON.parse(localStorage.getItem('pk.days') || '{}')
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return location.origin + location.pathname + '#liste=' + b64;
});
{
  const c2 = await mach();
  const q = await c2.newPage();
  await q.goto(link, { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  /* Der Empfaenger hat einen eigenen Plan: derselbe Ort, anderer Tag. */
  await q.evaluate((o) => {
    localStorage.setItem('pk.saved', JSON.stringify([o]));
    localStorage.setItem('pk.days', JSON.stringify({ [o[0]]: o[1] }));
  }, [orte[0].id, tagD]);
  /* reload, NICHT noch einmal goto: dieselbe URL mit unveraendertem Hash ist
     fuer den Browser keine Navigation, die Seite laedt nicht neu und liest
     den eben gesetzten Speicher nie. Genau daran ist diese Pruefung beim
     ersten Lauf gescheitert -- und hat dabei einen Fehler im Test gemeldet,
     nicht in der App. */
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await q.waitForSelector('#inbox:not([hidden])');
  await q.locator('#inbox-merge').click();
  await q.waitForTimeout(500);
  const d = await q.evaluate(() => JSON.parse(localStorage.getItem('pk.days') || '{}'));
  ok('Zusammenfuehren behaelt den eigenen Tag', d[orte[0].id], tagD);
  ok('… und uebernimmt fremde Tage nur in Luecken', d[orte[1].id], tagC);
  await c2.close();
}

/* --- 7. Ein alter Link ohne Tage bleibt gueltig --------------------------- */
/* v bleibt 1: eine aeltere Fassung ignoriert d einfach, und ein Link von
   damals darf nicht als kaputt gelten. */
{
  const c3 = await mach();
  const q = await c3.newPage();
  const alt = await p.evaluate(() => {
    const payload = { v: 1, m: JSON.parse(localStorage.getItem('pk.saved') || '[]'), g: [] };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#liste=' + b64;
  });
  await q.goto(alt, { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await q.waitForSelector('#inbox:not([hidden])');
  /* "Meine ersetzen" gibt es seit v40 nicht mehr. Hier ist der Empfaenger
     ohnehin leer -- Zusammenfuehren uebernimmt dann alles. */
  await q.locator('#inbox-merge').click();
  await q.waitForTimeout(500);
  await zumPlan(q);
  ok('alter Link ohne Tage: keine Tageskarte',
    await q.locator('.tagk:not(.tagk--frei)').count(), 0);
  ok('… und die Ansicht sagt das auch',
    (await q.locator('.reise__s').textContent()).trim(), 'noch nichts verplant');
  /* Verloren ist nichts: ohne Tag gehoeren sie in den Vorrat, und dort
     stehen sie vollstaendig. */
  ok('… aber alle Orte sind im Vorrat', await q.locator('.planrow').count(), 5);
  await c3.close();
}

/* --- 8. Ein Fehltipp auf den Stern kostet keine Planung ------------------- */
/* Die Zuordnung ist eine Zutat der Merkliste, kein eigener Zustand: fliegt
   ein Ort heraus, bleibt sein Tag gespeichert und gilt wieder. */
await p.evaluate((o) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  localStorage.setItem('pk.saved', JSON.stringify(s.filter((x) => x !== o)));
}, orte[0].id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('der entfernte Ort ist aus der Tageskarte heraus',
  await p.locator('.tagk__st').count(), 4);
await p.evaluate((o) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  s.push(o);
  localStorage.setItem('pk.saved', JSON.stringify(s));
}, orte[0].id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
/* Der Tag haengt in pk.days am Ort, nicht an der Merkliste: wer den Stern
   zurueckdrueckt, bekommt seine Zuordnung zurueck statt einer leeren Zeile
   im Vorrat. */
ok('wieder gemerkt: sein Tag gilt wieder', await p.evaluate((a) =>
  [...document.querySelectorAll('#tag-' + a[1] + ' .tagk__n')]
    .map((e) => e.textContent).indexOf(a[0]) >= 0, [orte[0].name, tagC]));
ok('… und er liegt nicht im Vorrat', await p.locator('.planrow').count(), 0);

/* --- 9. Die Bruecke: "Heute" zeigt den Plan fuer heute -------------------- */
/* Bis v28 wussten die beiden Haelften der App nichts voneinander -- S.days
   kam in der ganzen Heute-Ansicht kein einziges Mal vor. Man ordnete abends
   Orte dem Samstag zu und bekam morgens auf dem Bildschirm namens "Heute"
   irgendetwas anderes aus allen 101 Orten vorgeschlagen. */
const heuteIso = await p.evaluate(() => {
  const d = new Date(), m = String(d.getMonth() + 1), t = String(d.getDate());
  return d.getFullYear() + '-' + (m.length < 2 ? '0' : '') + m + '-' + (t.length < 2 ? '0' : '') + t;
});
const zuHeute = async (p2) => { await p2.locator('.tab[data-tab="heute"]').click(); await p2.waitForTimeout(400); };

/* Erst alles auf einen Tag, der nicht heute ist: kein Block. */
await p.evaluate((t) => {
  const d = {};
  JSON.parse(localStorage.getItem('pk.saved') || '[]').forEach((id) => { d[id] = t; });
  localStorage.setItem('pk.days', JSON.stringify(d));
  localStorage.setItem('pk.seen', '[]');
}, tagD);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zuHeute(p);
/* Bis v34 stand hier gar nichts -- und die Ansicht fing mit einem Vorschlag
   an, ohne je zu erwaehnen, dass es einen Tagesplan gibt. Wer nie einen
   anlegt, erfaehrt nicht, dass er koennte. Seit v35 steht der Block da und
   sagt, was fehlt, mit einem Weg zum Fuellen. */
ok('ist fuer heute nichts geplant, sagt der Block das',
  await p.locator('.planheut--leer').count(), 1);
ok('… mit einem Weg zum Fuellen', await p.locator('#planheut-los').count(), 1);
ok('… und ohne Stationszeilen', await p.locator('.planheut__row').count(), 0);
ok('… und die Marke zaehlt dann die ganze Merkliste',
  await p.locator('#tab-n').textContent(), '5');

/* Jetzt drei Orte auf heute. */
await p.evaluate((h) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  const d = JSON.parse(localStorage.getItem('pk.days') || '{}');
  s.slice(0, 3).forEach((id) => { d[id] = h; });
  localStorage.setItem('pk.days', JSON.stringify(d));
}, heuteIso);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zuHeute(p);

ok('mit Tagesplan steht der Block da', await p.locator('.planheut').count(), 1);
ok('… mit einer Zeile je Station', await p.locator('.planheut__row').count(), 3);
/* Seit v35 nennt der Kopf auch die Restzeit: "0 von 3 · noch 6,5 h". Die
   Stunden haengen an den Daten, also wird nur der Anfang festgenagelt. */
ok('… und einem Fortschritt',
  /^0 von 3 · noch /.test((await p.locator('.planheut__n').textContent()).trim()));
ok('… nur die Orte von heute, nicht die vom 27.',
  await p.evaluate(() => document.querySelectorAll('.planheut__row').length), 3);

/* Der Block steht VOR der Abschnittsleiste: er gilt dem ganzen Tag, die
   Leiste engt auf einen Abschnitt ein. */
ok('der Block steht ueber der Abschnittsleiste', await p.evaluate(() => {
  const b = document.querySelector('.planheut').getBoundingClientRect();
  const seg = document.querySelector('.segbar, [data-mid]').getBoundingClientRect();
  return b.top < seg.top;
}));

/* Das Kaestchen muss aussehen wie eins und 44 px gross sein. Zuerst stand da
   nur ein Haken in var(--line) -- auf dem Bildschirm nicht als Bedienelement
   zu erkennen. */
const kasten = await p.evaluate(() => {
  const b = document.querySelector('.planheut__tick');
  const r = b.getBoundingClientRect();
  const c = getComputedStyle(b.querySelector('svg'));
  return { w: Math.round(r.width), h: Math.round(r.height),
    rand: parseFloat(c.borderTopWidth), rund: c.borderTopLeftRadius,
    label: (b.querySelector('.sr-only') || {}).textContent || '' };
});
ok('das Kaestchen ist 44 mal 44', [kasten.w, kasten.h], [44, 44]);
ok('… und sichtbar umrandet', kasten.rand >= 2);
ok('… mit einer Ansage fuer Vorleser', /abhaken$/.test(kasten.label.trim()));

/* --- 10. Abhaken direkt in "Jetzt" --------------------------------------- */
/* Seit v35 steht der Fortschritt im Kopf der Karte statt im Fuss: "0 von 3 ·
   noch 2,5 h", darunter ein Balken. Der Fuss sagt nur noch, was der Kopf
   nicht sagen kann -- dass die Restzeit sich auf weniger Stationen stuetzt,
   als dastehen, oder dass alles erledigt ist. */
const kopfVorher = (await p.locator('.planheut__n').textContent()).trim();
const balken = () => p.evaluate(() =>
  document.querySelector('.planheut__bar i').style.width);
ok('der Fortschritt steht im Kopf', /^0 von 3( · noch )?/.test(kopfVorher));
ok('… und der Balken steht auf null', await balken(), '0%');
await p.locator('.planheut__tick').first().click();
await p.waitForTimeout(400);
const kopfNachher = (await p.locator('.planheut__n').textContent()).trim();
ok('abhaken zaehlt hoch', /^1 von 3/.test(kopfNachher));
ok('… streicht die Zeile durch', await p.locator('.planheut__row--ab').count(), 1);
ok('… laesst sie aber stehen', await p.locator('.planheut__row').count(), 3);
ok('… und rechnet die Restzeit neu', kopfNachher !== kopfVorher);
ok('… der Balken zieht mit', await balken(), '33%');
ok('… die Marke zaehlt die offenen von heute',
  await p.locator('#tab-n').textContent(), '2');
ok('… und sagt das auch dem Vorleser',
  await p.evaluate(() => document.getElementById('tab-n').getAttribute('aria-label')),
  '2 heute noch offen');

/* Dieselbe Markierung wie ueberall sonst -- kein zweiter Zustand. */
ok('abgehakt heisst gesehen', await p.evaluate(() =>
  JSON.parse(localStorage.getItem('pk.seen') || '[]').length), 1);

/* --- 11. Alles abgehakt -------------------------------------------------- */
await p.locator('.planheut__tick').nth(1).click();
await p.waitForTimeout(300);
await p.locator('.planheut__tick').nth(2).click();
await p.waitForTimeout(400);
ok('alles abgehakt: der Kopf sagt es',
  (await p.locator('.planheut__t').textContent()).trim(), 'Heute erledigt');
ok('… der Fuss auch',
  /Alle 3 Stationen abgehakt/.test(await p.locator('.planheut__f').textContent()));
ok('… und der Balken ist voll', await balken(), '100%');
ok('… und die Marke ist weg', await p.locator('#tab-n').isVisible(), false);

/* Zuruecknehmen muss gehen -- ein Fehltipp darf nichts kosten. */
await p.locator('.planheut__tick').first().click();
await p.waitForTimeout(400);
ok('zuruecknehmen geht',
  /^2 von 3 · noch /.test((await p.locator('.planheut__n').textContent()).trim()));
ok('… und die Marke kommt wieder', await p.locator('#tab-n').textContent(), '1');

/* --- 12. Die Reiseuebersicht --------------------------------------------- */
/* An einem realistischen Stand gemessen -- 20 gemerkte Orte, sieben auf drei
   Tage verteilt -- war die Planansicht 3402 px hoch. Sichtbar waren die drei
   verplanten Tage; unsichtbar blieb, welche der fuenfzehn noch frei sind.
   Genau das ist beim Planen die Frage. */
{
  const c4 = await mach();
  const q = await c4.newPage();
  const errs4 = []; q.on('pageerror', (e) => errs4.push(e.message));
  await q.goto(BASE + '/', { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  const viele = await q.evaluate(async () => {
    const d = await (await fetch('./data/places.json')).json();
    return d.places.slice(0, 20).map((x) => x.id);
  });

  /* Seit v36 steht das Raster auch ohne Zuordnung da: es gibt keine
     Merkliste mehr, ueber der es Zierde waere -- ohne Zuordnung IST es die
     Aufforderung. */
  await q.evaluate((ids) => {
    localStorage.setItem('pk.saved', JSON.stringify(ids));
    localStorage.setItem('pk.days', '{}');
    localStorage.setItem('pk.seen', '[]');
  }, viele);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await zumPlan(q);
  ok('das Raster steht auch ohne Zuordnung da', await q.locator('.uebs').count(), 1);
  /* Im Vorrat ist die Gesamtzeit eine sinnvolle Aussage: so lange braeuchte
     man fuer alles, was noch keinen Tag hat. Ueber die ganze Ansicht waere
     dieselbe Zahl falsch -- sie addierte Tage und Vorrat zu einer Stunde,
     die nirgends vorkommt. */
  ok('der Vorrat nennt seine Gesamtzeit',
    /Aufenthalt/.test(await q.locator('.vorrat__s').textContent()));

  /* Sieben Orte auf drei Tage. */
  await q.evaluate(([ids, t]) => {
    localStorage.setItem('pk.days', JSON.stringify({
      [ids[0]]: t[0], [ids[1]]: t[0],
      [ids[2]]: t[1], [ids[3]]: t[1], [ids[4]]: t[1],
      [ids[5]]: t[3], [ids[6]]: t[3]
    }));
  }, [viele, [tagA, tagB, tagC, tagD]]);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await zumPlan(q);

  const g = await q.evaluate(() => {
    const raster = document.querySelector('.uebs__g');
    const r = raster.getBoundingClientRect();
    return {
      zellen: raster.querySelectorAll('.uebs__d').length,
      voll: raster.querySelectorAll('.uebs__d--voll').length,
      leer: raster.querySelectorAll('.uebs__d--leer').length,
      knoepfe: raster.querySelectorAll('button.uebs__d').length,
      heute: raster.querySelectorAll('.uebs__d--heute').length,
      links: Math.round(r.left), rechts: Math.round(r.right),
      spalten: getComputedStyle(raster).gridTemplateColumns.split(' ').length,
      zahlen: [...raster.querySelectorAll('.uebs__d--voll .uebs__c')].map((e) => e.textContent)
    };
  });
  ok('das Raster zeigt alle 15 Reisetage', g.zellen, 15);
  ok('… in fuenf Spalten, also ohne Schieben', g.spalten, 5);
  ok('… drei davon verplant', g.voll, 3);
  ok('… zwoelf frei', g.leer, 12);
  ok('… mit der Zahl der Orte je Tag', g.zahlen, ['2', '3', '2']);
  ok('… und innerhalb der Seitenraender', g.links >= 12 && g.rechts <= 390);
  /* Seit v31 sind ALLE Zellen Knoepfe. Bis v30 sprangen volle nur zu ihrer
     Gruppe und leere taten gar nichts -- ausgerechnet der freie Tag, den die
     Uebersicht gerade zur Frage gemacht hatte, war der tote Knopf. */
  ok('alle 15 Tage sind Knoepfe', g.knoepfe, 15);
  /* Seit v34 traegt nur ein Plus, was sich noch verplanen laesst.

     Bis v33 luden auch vergangene Reisetage dazu ein: am 20.09. waren das
     sechs von fuenfzehn Zellen, am letzten Reisetag vierzehn -- ein Angebot,
     das nichts mehr bewirken kann. Sie bleiben sichtbar und antippbar (man
     will nachsehen, was war), tragen aber kein Plus und sind gedaempft.

     Die Zahl haengt am Datum, an dem die Suite laeuft, also wird sie
     gerechnet statt geschrieben -- sonst faellt die Pruefung am naechsten
     Tag um, ohne dass sich etwas geaendert haette. */
  const rasterZahlen = await q.evaluate(() => {
    const zellen = [...document.querySelectorAll('.uebs__d')];
    return {
      vorbei: zellen.filter((z) => z.classList.contains('uebs__d--vorbei')).length,
      plusLeer: document.querySelectorAll('.uebs__d--leer .uebs__plus').length,
      plusVorbei: document.querySelectorAll('.uebs__d--vorbei .uebs__plus').length,
      plusVoll: document.querySelectorAll('.uebs__d--voll .uebs__plus').length,
      leer: zellen.filter((z) => z.classList.contains('uebs__d--leer')).length
    };
  });
  ok('vergangene Tage tragen kein Plus', rasterZahlen.plusVorbei, 0);
  ok('freie Tage in der Zukunft schon',
     rasterZahlen.plusLeer, rasterZahlen.leer - rasterZahlen.vorbei);
  ok('volle Tage tragen keins', rasterZahlen.plusVoll, 0);
  ok('die Seite bleibt seitwaerts unverschiebbar',
    await q.evaluate(() => document.documentElement.scrollWidth), 402);

  /* Kein aria-hidden mehr auf den leeren Zellen: sie sind seit v31 Knoepfe,
     und ein unsichtbarer Knopf waere schlimmer als eine Zeile Vorlesetext.
     Ihr Label sagt, was dort los ist -- es ist keine nackte Datumsangabe. */
  ok('keine Zelle ist fuer Vorleser versteckt', await q.evaluate(() =>
    [...document.querySelectorAll('.uebs__d')]
      .every((e) => e.getAttribute('aria-hidden') === null)));
  /* Eingegrenzt auf einen freien Tag, der weder vorbei noch heute ist: ein
     vergangener sagt seit v34 zusaetzlich "vorbei", der heutige "heute". Der
     Zusatz gehoert dazu -- geprueft wird hier der Satz ohne ihn. */
  ok('freie Tage sagen, dass nichts geplant ist', await q.evaluate(() =>
    /noch nichts geplant, öffnen$/.test(
      (document.querySelector('.uebs__d--leer:not(.uebs__d--vorbei):not(.uebs__d--heute)')
        || document.querySelector('.uebs__d--leer')).getAttribute('aria-label') || '')));
  ok('… und der heutige sagt zusaetzlich, dass er heute ist', await q.evaluate(() => {
    const z = document.querySelector('.uebs__d--heute');
    return !z || /, heute, öffnen$/.test(z.getAttribute('aria-label') || '');
  }));
  ok('vergangene Tage sagen, dass sie vorbei sind', await q.evaluate(() => {
    const z = document.querySelector('.uebs__d--vorbei');
    return !z || /, vorbei, öffnen$/.test(z.getAttribute('aria-label') || '');
  }));
  ok('volle Tage sagen, wie viel dort steht', await q.evaluate(() =>
    /— \d+ Orte? geplant/.test(
      document.querySelector('.uebs__d--voll').getAttribute('aria-label') || '')));

  /* --- 13. Ein freier Tag laesst sich fuellen ---------------------------- */
  /* Bis v30 zeigte die Uebersicht, dass Mittwoch frei ist -- und von dort aus
     liess sich nichts damit anfangen. Man musste die Luecke unten in der
     Merkliste suchen, den Ort finden und dessen Waehler auf den richtigen
     Tag stellen. Drei Schritte fuer etwas, das die Uebersicht gerade erst
     zur Frage gemacht hatte. */
  await q.locator(`[data-dayopen="${tagC}"]`).first().click();
  await q.waitForTimeout(600);
  ok('ein freier Tag oeffnet sein Sheet', await q.locator('#sheet').isVisible());
  ok('… mit dem Tag als Ueberschrift',
    (await q.locator('#sheet-name').textContent()).trim(), langTag(tagC));
  ok('… und sagt, dass noch nichts dasteht',
    /noch nichts geplant/.test(await q.locator('.tagsheet__leer').first().textContent()));
  const ausMerk = await q.locator(`[data-dayiso="${tagC}"]`).count();
  ok('… und bietet die Merkliste an', ausMerk, 13);

  /* Hinzufuegen laesst das Sheet offen: einen Tag fuellt man selten mit
     einem einzigen Ort. */
  await q.locator(`[data-dayiso="${tagC}"]`).first().click();
  await q.waitForTimeout(400);
  ok('Hinzufuegen laesst das Sheet offen', await q.locator('#sheet').isVisible());
  await q.locator(`[data-dayiso="${tagC}"]`).first().click();
  await q.waitForTimeout(400);
  ok('zwei Orte stehen jetzt an dem Tag', await q.evaluate((t) =>
    Object.values(JSON.parse(localStorage.getItem('pk.days') || '{}'))
      .filter((v) => v === t).length, tagC), 2);
  ok('… die Merkliste im Sheet ist um zwei kuerzer',
    await q.locator(`[data-dayiso="${tagC}"]`).count(), ausMerk - 2);

  /* Herunternehmen: der Ort wandert zurueck in die Merkliste, er verlaesst
     den Plan nicht. */
  const vorWeg = await q.evaluate(() =>
    JSON.parse(localStorage.getItem('pk.saved') || '[]').length);
  await q.locator('.tagsheet__b--weg').first().click();
  await q.waitForTimeout(400);
  ok('Herunternehmen nimmt den Ort vom Tag', await q.evaluate((t) =>
    Object.values(JSON.parse(localStorage.getItem('pk.days') || '{}'))
      .filter((v) => v === t).length, tagC), 1);
  ok('… aber nicht aus dem Plan', await q.evaluate(() =>
    JSON.parse(localStorage.getItem('pk.saved') || '[]').length), vorWeg);

  ok('die Knoepfe im Sheet sind 44 mal 44', await q.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__b')].every((e) => {
      const r = e.getBoundingClientRect();
      return Math.round(r.width) === 44 && Math.round(r.height) === 44;
    })));

  /* --- 13b. Vom Sheet in den Plan ---------------------------------------- */
  ok('vor dem Sprung steht die Seite oben',
    await q.evaluate(() => Math.round(window.scrollY)), 0);
  await q.locator('[data-daygoto]').click();
  await q.waitForTimeout(1000);
  const sprung = await q.evaluate((t) => {
    const z = document.getElementById('tag-' + t);
    const bar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-full'), 10) || 0;
    return { zu: document.getElementById('sheet').hidden,
      y: Math.round(window.scrollY),
      oben: z ? Math.round(z.getBoundingClientRect().top) : null, bar: bar };
  }, tagC);
  ok('"Im Plan anzeigen" schliesst das Sheet', sprung.zu);
  /* Erst nach dem Schliessen scrollen -- waehrend des Sheets ist body
     fixiert, ein scrollIntoView liefe ins Leere. */
  ok('… und springt wirklich', sprung.y > 100);
  ok('… das Ziel landet unter dem Kopf, nicht darunter verdeckt',
    sprung.oben !== null && sprung.oben >= sprung.bar - 6 && sprung.oben < 400);

  /* --- 14. Der Kopf zaehlt, was verplant ist ----------------------------- */
  /* Bis v32 addierte eine Summenzeile drei verplante Tage und dreizehn
     unverplante Orte zu "20 Orte · 30,8 h Aufenthalt" -- einer Stunde, die
     nirgends vorkommt. Seit v36 zaehlt der Kopf Tage und verplante Orte,
     der Vorrat zaehlt sich selbst, und keine Zahl vermischt beide. */
  const summe = (await q.locator('.reise__s').textContent()).trim();
  /* Acht statt sieben und vier Tage statt drei: der freie Tag ist eben
     dazugekommen, einer der zwei Hinzugefuegten wieder heruntergenommen. */
  ok('der Kopf zaehlt nur das Verplante', summe, '4 verplant · 8 Orte');
  ok('… und nennt keine Gesamtstundenzahl', /Aufenthalt|Weg/.test(summe), false);

  /* --- 15. Der Vorrat zaehlt sich selbst --------------------------------- */
  /* Bis v32 hing er als vierte "Tagesgruppe" namens "Gemerkt, noch ohne Tag"
     unten am Plan -- er las sich wie ein Tag und war keiner. Bis v35 lag er
     hinter einer Umschaltleiste. Seit v36 steht er als eigener Abschnitt
     unter den Tageskarten, mit eigener Zahl und eigener Zeit. */
  ok('der Vorrat zaehlt sich selbst',
    (await q.locator('.vorrat__n').textContent()).trim(), '12');
  ok('… und nennt seine Gesamtzeit',
    /Aufenthalt/.test(await q.locator('.vorrat__s').textContent()));
  ok('… und zeigt genau die Orte ohne Tag',
    await q.locator('.planrow').count(), 12);
  /* Die Mengen bleiben ueberschneidungsfrei: acht verplant, zwoelf im
     Vorrat, zusammen die zwanzig gemerkten. */
  ok('… ohne Ueberschneidung mit den Tageskarten',
    await q.locator('.tagk:not(.tagk--frei) .tagk__st').count(), 8);

  /* Die Leiste oben nennt beide Zahlen: "20 gemerkt" allein sagte nicht, wie
     viel davon schon einen Tag hat -- und genau das ist die Frage, die diese
     Ansicht beantwortet. */
  ok('die Teilen-Leiste zaehlt beide Haelften',
    (await q.locator('#sharebar-t').textContent()).trim(),
    '8 verplant · 12 im Vorrat · 0 gesehen');

  ok('keine JS-Fehler in der Uebersicht', errs4.length ? errs4.join(' | ') : 0, 0);
  await c4.close();
}

/* --- 16. Die Merkliste im Tages-Sheet steht nach Naehe --------------------- */
/* Bis v31 stand sie in der Reihenfolge, in der man gemerkt hat -- bei zwanzig
   Eintraegen sucht man darin. Gerechnet wird hier IM TEST, nicht in der App:
   eine Pruefung, die die App fragt, ob die App recht hat, prueft nichts. */
{
  const luft = (a, b) => {
    const R = 6371, r = Math.PI / 180;
    const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    const x = Math.sin(dLat / 2) ** 2
      + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };

  const c5 = await mach();
  const q = await c5.newPage();
  const errs5 = []; q.on('pageerror', (e) => errs5.push(e.message));
  await q.goto(BASE + '/', { waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  const daten = await q.evaluate(async () => {
    const d = await (await fetch('./data/places.json')).json();
    return { base: d.meta.base_geo,
      orte: d.places.map((x) => ({ id: x.id, name: x.name, geo: x.geo })) };
  });
  const byId = {};
  daten.orte.forEach((o) => { byId[o.id] = o; });
  const zwanzig = daten.orte.slice(0, 20).map((o) => o.id);

  const namenImSheet = async () => q.evaluate(() =>
    [...document.querySelectorAll('.tagsheet__l')].pop()
      .querySelectorAll('.tagsheet__name').length
      ? [...[...document.querySelectorAll('.tagsheet__l')].pop()
          .querySelectorAll('.tagsheet__name')].map((e) => e.textContent.trim())
      : []);

  /* (a) Leerer Tag: der Bezugspunkt der App gilt -- der Zeltplatz. */
  await q.evaluate((ids) => {
    localStorage.setItem('pk.saved', JSON.stringify(ids));
    localStorage.setItem('pk.days', '{}');
  }, zwanzig);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  /* Ohne Zuordnung gibt es kein Raster -- also erst in der Merkliste einen
     Ort belegen, damit der Plan eines bekommt. Seit v33 stehen die
     Tageswaehler drueben in der Merkliste, nicht im leeren Plan. */
  await zurMerk(q);
  await q.selectOption(`select[data-day="${zwanzig[0]}"]`, tagA);
  await q.waitForTimeout(350);
  await zumPlan(q);
  await q.locator(`[data-dayopen="${tagC}"]`).first().click();
  await q.waitForTimeout(600);

  ok('ein leerer Tag misst ab dem Zeltplatz',
    (await q.locator('.tagsheet__lead').textContent()).trim(),
    'Nach Entfernung vom Zeltplatz');
  const abZelt = await namenImSheet();
  const sollZelt = zwanzig.slice(1).map((id) => byId[id])
    .sort((x, y) => luft(daten.base, x.geo) - luft(daten.base, y.geo))
    .map((o) => o.name);
  ok('… und steht in dieser Reihenfolge', abZelt, sollZelt);
  ok('jede Zeile nennt ihre Entfernung', await q.evaluate(() =>
    [...[...document.querySelectorAll('.tagsheet__l')].pop()
      .querySelectorAll('.tagsheet__row')]
      .every((r) => !!r.querySelector('.tagsheet__weit'))));

  /* (b) Ein Ort am Tag: er ist der Anker, und er wird benannt. */
  const ankerA = zwanzig[7];
  await q.evaluate(([ids, a, t]) => {
    localStorage.setItem('pk.saved', JSON.stringify(ids));
    localStorage.setItem('pk.days', JSON.stringify({ [a]: t }));
  }, [zwanzig, ankerA, tagC]);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await zumPlan(q);
  await q.locator(`[data-dayopen="${tagC}"]`).first().click();
  await q.waitForTimeout(600);

  ok('ein belegter Tag nennt seinen Anker beim Namen',
    (await q.locator('.tagsheet__lead').textContent()).trim(),
    'Nach Nähe zu ' + byId[ankerA].name);
  const abAnker = await namenImSheet();
  const sollAnker = zwanzig.filter((id) => id !== ankerA).map((id) => byId[id])
    .sort((x, y) => luft(byId[ankerA].geo, x.geo) - luft(byId[ankerA].geo, y.geo))
    .map((o) => o.name);
  ok('… und sortiert nach der Luftlinie dorthin', abAnker, sollAnker);

  /* (c) Zwei weit auseinanderliegende Orte am Tag. Der entscheidende Fall:
     gemessen wird gegen den NAECHSTEN von beiden, nicht gegen ihren
     Mittelpunkt. Beim Mittelpunkt faellt der Bezug auf ein Feld dazwischen,
     und die Reihenfolge waere nach niemandem sortiert. */
  const weitWeg = daten.orte
    .filter((o) => o.geo && luft(daten.base, o.geo) > 20)
    .sort((x, y) => luft(daten.base, y.geo) - luft(daten.base, x.geo))[0];
  ok('es gibt einen Ort ueber 20 km entfernt fuer den Gegentest', !!weitWeg);
  if (weitWeg) {
    const zwei = [zwanzig[0], weitWeg.id];
    const rest = zwanzig.filter((id) => id !== zwei[0] && id !== zwei[1]);
    await q.evaluate(([alle, a, b2, t]) => {
      localStorage.setItem('pk.saved', JSON.stringify(alle));
      localStorage.setItem('pk.days', JSON.stringify({ [a]: t, [b2]: t }));
    }, [zwanzig.concat([weitWeg.id]), zwei[0], zwei[1], tagC]);
    await q.reload({ waitUntil: 'networkidle' });
    await q.waitForSelector('#app:not([hidden])');
    await zumPlan(q);
    await q.locator(`[data-dayopen="${tagC}"]`).first().click();
    await q.waitForTimeout(600);

    ok('bei mehreren Orten nennt der Kopf keinen einzelnen',
      (await q.locator('.tagsheet__lead').textContent()).trim(),
      'Nach Nähe zum nächsten Ort dieses Tages');
    const abZwei = await namenImSheet();
    const sollZwei = rest.map((id) => byId[id])
      .map((o) => ({ o: o, d: Math.min(luft(byId[zwei[0]].geo, o.geo),
                                       luft(weitWeg.geo, o.geo)) }))
      .sort((x, y) => x.d - y.d)
      .map((x) => x.o.name);
    ok('… und misst gegen den naechsten der beiden, nicht gegen die Mitte',
      abZwei, sollZwei);
  }

  ok('keine JS-Fehler beim Sortieren', errs5.length ? errs5.join(' | ') : 0, 0);
  await c5.close();
}

ok('keine JS-Fehler auf dem ganzen Weg', errs.length ? errs.join(' | ') : 0, 0);
await ctx.close();
await browser.close();
console.log(R.map((r) => `${r[0]}  ${r[1]}${r[2] ? '  [' + r[2] + ']' : ''}`).join('\n'));
console.log('\n' + R.filter((r) => r[0] === 'PASS').length + '/' + R.length + ' passed');
