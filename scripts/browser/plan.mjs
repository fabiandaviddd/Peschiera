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

/* Seit v33 sind Plan und Merkliste zwei Haelften einer Ansicht hinter einer
   Umschaltleiste. Der Reiter landet immer auf "Plan" -- das ist die Antwort
   auf "was steht an" und damit die richtige Voreinstellung. */
const zumPlan = async (p) => {
  await p.locator('.tab[data-tab="gemerkt"]').click();
  await p.waitForTimeout(400);
  /* Auf .ptabs eingegrenzt: data-ptab traegt auch der Knopf im leeren Plan
     ("Zur Merkliste"), und ein Selektor, der beide trifft, waehlt beim
     naechsten Zustandswechsel das falsche Element. */
  if (await p.locator('.ptabs [data-ptab="plan"]:not(.ptab--an)').count()) {
    await p.locator('.ptabs [data-ptab="plan"]').click();
    await p.waitForTimeout(350);
  }
};
const zurMerk = async (p) => {
  await zumPlan(p);
  await p.locator('.ptabs [data-ptab="merk"]').click();
  await p.waitForTimeout(350);
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
    .map((x) => ({ id: x.id, min: x.time_min }));
});
ok('fuenf Orte mit Aufenthaltsdauer in den Daten', orte.length, 5);

await p.evaluate((ids) => localStorage.setItem('pk.saved', JSON.stringify(ids)),
  orte.map((o) => o.id));
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);

/* --- 1. Die zwei Haelften ------------------------------------------------ */
/* Bis v32 haengte die Merkliste als vierte "Tagesgruppe" unten am Plan. Das
   las sich wie ein Tag, war aber keiner -- und eine Summenzeile darueber
   musste beides zugleich beschreiben. Es sind zwei Dinge mit zwei Aufgaben:
   der Plan sagt, was an welchem Tag ansteht, die Merkliste haelt den Vorrat
   ohne Tag. Die Mengen sind ueberschneidungsfrei. */
ok('es gibt eine Umschaltleiste', await p.locator('.ptabs').count(), 1);
ok('… mit zwei Haelften', await p.locator('.ptab').count(), 2);
ok('… und der Plan steht vorn', await p.evaluate(() =>
  document.querySelector('.ptab--an').getAttribute('data-ptab')), 'plan');
const zaehler = async () => p.evaluate(() =>
  [...document.querySelectorAll('.ptab')].map((b) => ({
    was: b.getAttribute('data-ptab'), n: +b.querySelector('.ptab__n').textContent })));
ok('ohne Zuordnung ist der Plan leer und die Merkliste voll',
  await zaehler(), [{ was: 'plan', n: 0 }, { was: 'merk', n: 5 }]);
ok('… und die Summe der beiden ist die Merkliste',
  (await zaehler()).reduce((a, x) => a + x.n, 0), 5);

/* Der leere Plan sagt, was zu tun ist -- und steht IN der Liste, damit die
   Umschaltleiste erreichbar bleibt. Ein Leerzustand, der den Weg nach drueben
   verdeckt, ist eine Sackgasse. */
ok('der leere Plan nennt seinen Zustand',
  (await p.locator('.planleer h3').textContent()).trim(), 'Noch kein Tag geplant');
ok('… und die Umschaltleiste bleibt sichtbar', await p.locator('.ptabs').isVisible());
ok('… mit einem Weg in die Merkliste',
  await p.locator('.planleer [data-ptab="merk"]').count(), 1);
ok('im Plan stehen keine Zeilen', await p.locator('.planrow').count(), 0);

await zurMerk(p);
ok('in der Merkliste stehen alle fuenf', await p.locator('.planrow').count(), 5);
ok('jede Zeile traegt einen Tageswaehler', await p.locator('select[data-day]').count(), 5);
/* Keine Nummer und keine Pfeile: in der Merkliste gibt es keine Reihenfolge,
   die etwas bedeutet -- Pfeile waeren dort ein Bedienelement ohne Aussage. */
ok('… aber keine Nummern', await p.locator('.planrow__n').count(), 0);
ok('… und keine Umstell-Pfeile', await p.locator('.pmove').count(), 0);
ok('… und kein Reiseplan-Raster', await p.locator('.uebs').count(), 0);

/* --- 2. Zuordnen gruppiert und rechnet ------------------------------------ */
await p.selectOption(`select[data-day="${orte[0].id}"]`, '2026-09-20');
await p.waitForTimeout(300);
await p.selectOption(`select[data-day="${orte[1].id}"]`, '2026-09-20');
await p.waitForTimeout(300);
await p.selectOption(`select[data-day="${orte[2].id}"]`, '2026-09-21');
await p.waitForTimeout(300);

/* Zugeordnet wird in der Merkliste -- der Ort verschwindet dort und taucht
   im Plan auf. Genau dieser Uebergang ist die Aufgabe der zwei Haelften. */
ok('die Zaehler wandern mit', await zaehler(), [{ was: 'plan', n: 3 }, { was: 'merk', n: 2 }]);
ok('die zugeordneten sind aus der Merkliste weg', await p.locator('.planrow').count(), 2);

await zumPlan(p);
ok('im Plan stehen zwei Tage', await p.locator('.plantag').count(), 2);
ok('… in ihrer Reihenfolge',
  await p.evaluate(() => [...document.querySelectorAll('.plantag__t')]
    .map((t) => t.textContent.trim().slice(0, 3))),
  ['Son', 'Mon']);
ok('… und keine Merkliste dazwischen', await p.locator('.plantag--offen').count(), 0);

/* Die Tagessumme muss aus den Daten kommen. Gegengerechnet wird mit denselben
   Minuten, die oben aus places.json gelesen wurden -- nicht mit dem, was die
   App gerade anzeigt. */
const summeSoll = orte[0].min + orte[1].min;
const summeIst = await p.evaluate(() => {
  const t = document.querySelector('.plantag__sum').textContent;
  const h = /([\d,]+)\s*h/.exec(t);
  const m = /(\d+)\s*Min/.exec(t);
  return (h ? parseFloat(h[1].replace(',', '.')) * 60 : 0) + (m ? +m[1] : 0);
});
ok('die Tagessumme ist aus den Daten gerechnet', Math.round(summeIst), summeSoll);
ok('gespeichert unter pk.days', await p.evaluate(() =>
  Object.keys(JSON.parse(localStorage.getItem('pk.days') || '{}')).length), 3);

/* --- 3. Neu laden: alles noch da ------------------------------------------ */
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('nach dem Neuladen stehen die Gruppen wieder', await p.locator('.plantag').count(), 2);
ok('… und die Waehler zeigen ihren Tag', await p.evaluate((o) =>
  document.querySelector(`select[data-day="${o}"]`).value, orte[0].id), '2026-09-20');
ok('… und die Zaehler stimmen weiter',
  await zaehler(), [{ was: 'plan', n: 3 }, { was: 'merk', n: 2 }]);

/* --- 4. Verschieben bleibt in der Gruppe ---------------------------------- */
/* Seit die Ansicht nach Tagen gruppiert, waere ein globaler Nachbar oft
   unsichtbar in einer anderen Gruppe -- man tippte und saehe nichts. */
const vorher = await p.evaluate(() =>
  [...document.querySelectorAll('.planrow__name')].map((e) => e.textContent));
await p.locator('.pmove[data-down]:not([disabled])').first().click();
await p.waitForTimeout(350);
const nachher = await p.evaluate(() =>
  [...document.querySelectorAll('.planrow__name')].map((e) => e.textContent));
ok('nach unten tauscht mit dem Gruppen-Nachbarn',
  [nachher[0], nachher[1]], [vorher[1], vorher[0]]);
ok('die anderen Gruppen bleiben unberuehrt',
  nachher.slice(2), vorher.slice(2));

const rand = await p.evaluate(() =>
  [...document.querySelectorAll('.pmove')].map((e) => e.disabled));
/* Eine Zweier-Gruppe am Sonntag und ein Einzelner am Montag: an jeder
   Gruppengrenze ist ein Pfeil still, beim Einzelnen beide. */
ok('Pfeile enden an der Gruppengrenze, nicht am Listenende',
  rand, [true, false, false, true, true, true]);

/* --- 5. Ein ueberfuellter Tag wird genannt, nicht bewertet ---------------- */
await p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('pk.days') || '{}');
  JSON.parse(localStorage.getItem('pk.saved') || '[]')
    .forEach((id) => { d[id] = '2026-09-22'; });
  localStorage.setItem('pk.days', JSON.stringify(d));
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
const alleMin = orte.reduce((a, o) => a + o.min, 0);
const voll = await p.evaluate(() => {
  const e = document.querySelector('.plantag__sum--voll');
  return e ? e.textContent.indexOf('mehr als 10 h') >= 0 : false;
});
ok('ueber 10 h an einem Tag traegt der Kopf den Hinweis',
  voll, alleMin > 600);

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
    localStorage.setItem('pk.days', JSON.stringify({ [o]: '2026-09-25' }));
  }, orte[0].id);
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
  ok('Zusammenfuehren behaelt den eigenen Tag', d[orte[0].id], '2026-09-25');
  ok('… und uebernimmt fremde Tage nur in Luecken', d[orte[1].id], '2026-09-22');
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
  await q.locator('#inbox-replace').click();
  await q.waitForTimeout(500);
  await zumPlan(q);
  ok('alter Link ohne Tage: der Plan ist leer', await q.locator('.plantag').count(), 0);
  ok('… und sagt das auch',
    (await q.locator('.planleer h3').textContent()).trim(), 'Noch kein Tag geplant');
  /* Verloren ist nichts: ohne Tag gehoeren sie in die Merkliste, und dort
     stehen sie vollstaendig. */
  await zurMerk(q);
  ok('… aber alle Orte sind in der Merkliste', await q.locator('.planrow').count(), 5);
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
ok('der entfernte Ort ist weg', await p.locator('.planrow').count(), 4);
await p.evaluate((o) => {
  const s = JSON.parse(localStorage.getItem('pk.saved') || '[]');
  s.push(o);
  localStorage.setItem('pk.saved', JSON.stringify(s));
}, orte[0].id);
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zumPlan(p);
ok('wieder gemerkt: sein Tag gilt wieder', await p.evaluate((o) =>
  document.querySelector(`select[data-day="${o}"]`).value, orte[0].id), '2026-09-22');

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
await p.evaluate(() => {
  const d = {};
  JSON.parse(localStorage.getItem('pk.saved') || '[]').forEach((id) => { d[id] = '2026-09-27'; });
  localStorage.setItem('pk.days', JSON.stringify(d));
  localStorage.setItem('pk.seen', '[]');
});
await p.reload({ waitUntil: 'networkidle' });
await p.waitForSelector('#app:not([hidden])');
await zuHeute(p);
ok('ist fuer heute nichts geplant, steht kein Block da', await p.locator('.planheut').count(), 0);
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
ok('… und einem Fortschritt', (await p.locator('.planheut__n').textContent()).trim(), '0 von 3');
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

/* --- 10. Abhaken direkt in "Heute" --------------------------------------- */
const restVorher = (await p.locator('.planheut__f').textContent()).trim();
await p.locator('.planheut__tick').first().click();
await p.waitForTimeout(400);
ok('abhaken zaehlt hoch', (await p.locator('.planheut__n').textContent()).trim(), '1 von 3');
ok('… streicht die Zeile durch', await p.locator('.planheut__row--ab').count(), 1);
ok('… laesst sie aber stehen', await p.locator('.planheut__row').count(), 3);
const restNachher = (await p.locator('.planheut__f').textContent()).trim();
ok('… und rechnet die Restzeit neu', restNachher !== restVorher);
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
ok('… und die Marke ist weg', await p.locator('#tab-n').isVisible(), false);

/* Zuruecknehmen muss gehen -- ein Fehltipp darf nichts kosten. */
await p.locator('.planheut__tick').first().click();
await p.waitForTimeout(400);
ok('zuruecknehmen geht', (await p.locator('.planheut__n').textContent()).trim(), '2 von 3');
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

  /* Ohne Zuordnung: kein Raster. Ein leeres Raster ueber einer Merkliste
     waere Zierde. */
  await q.evaluate((ids) => {
    localStorage.setItem('pk.saved', JSON.stringify(ids));
    localStorage.setItem('pk.days', '{}');
    localStorage.setItem('pk.seen', '[]');
  }, viele);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await zumPlan(q);
  ok('ohne Zuordnung kein Reiseplan-Raster', await q.locator('.uebs').count(), 0);
  /* In der Merkliste ist die Gesamtzeit eine sinnvolle Aussage: so lange
     braeuchte man fuer alles, was noch keinen Tag hat. Im Plan waere dieselbe
     Zahl falsch -- sie addierte dort Tage und Vorrat zu einer Stunde, die
     nirgends vorkommt. */
  await zurMerk(q);
  ok('die Merkliste nennt die Gesamtzeit',
    /Aufenthalt/.test(await q.locator('.plan__sum').textContent()));
  await zumPlan(q);

  /* Sieben Orte auf drei Tage. */
  await q.evaluate((ids) => {
    localStorage.setItem('pk.days', JSON.stringify({
      [ids[0]]: '2026-09-20', [ids[1]]: '2026-09-20',
      [ids[2]]: '2026-09-21', [ids[3]]: '2026-09-21', [ids[4]]: '2026-09-21',
      [ids[5]]: '2026-09-24', [ids[6]]: '2026-09-24'
    }));
  }, viele);
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
  /* Eingegrenzt auf einen freien Tag, der noch kommt: ein vergangener sagt
     seit v34 zusaetzlich "vorbei", und der erste im Raster ist der 14. */
  ok('freie Tage sagen, dass nichts geplant ist', await q.evaluate(() =>
    /noch nichts geplant, öffnen$/.test(
      (document.querySelector('.uebs__d--leer:not(.uebs__d--vorbei)')
        || document.querySelector('.uebs__d--leer')).getAttribute('aria-label') || '')));
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
  await q.locator('[data-dayopen="2026-09-23"]').click();
  await q.waitForTimeout(600);
  ok('ein freier Tag oeffnet sein Sheet', await q.locator('#sheet').isVisible());
  ok('… mit dem Tag als Ueberschrift',
    (await q.locator('#sheet-name').textContent()).trim(), 'Mittwoch, 23.09.');
  ok('… und sagt, dass noch nichts dasteht',
    /noch nichts geplant/.test(await q.locator('.tagsheet__leer').first().textContent()));
  const ausMerk = await q.locator('[data-dayiso="2026-09-23"]').count();
  ok('… und bietet die Merkliste an', ausMerk, 13);

  /* Hinzufuegen laesst das Sheet offen: einen Tag fuellt man selten mit
     einem einzigen Ort. */
  await q.locator('[data-dayiso="2026-09-23"]').first().click();
  await q.waitForTimeout(400);
  ok('Hinzufuegen laesst das Sheet offen', await q.locator('#sheet').isVisible());
  await q.locator('[data-dayiso="2026-09-23"]').first().click();
  await q.waitForTimeout(400);
  ok('zwei Orte stehen jetzt an dem Tag', await q.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('pk.days') || '{}'))
      .filter((v) => v === '2026-09-23').length), 2);
  ok('… die Merkliste im Sheet ist um zwei kuerzer',
    await q.locator('[data-dayiso="2026-09-23"]').count(), ausMerk - 2);

  /* Herunternehmen: der Ort wandert zurueck in die Merkliste, er verlaesst
     den Plan nicht. */
  const vorWeg = await q.evaluate(() =>
    JSON.parse(localStorage.getItem('pk.saved') || '[]').length);
  await q.locator('.tagsheet__b--weg').first().click();
  await q.waitForTimeout(400);
  ok('Herunternehmen nimmt den Ort vom Tag', await q.evaluate(() =>
    Object.values(JSON.parse(localStorage.getItem('pk.days') || '{}'))
      .filter((v) => v === '2026-09-23').length), 1);
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
  const sprung = await q.evaluate(() => {
    const z = document.getElementById('tag-2026-09-23');
    const bar = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--bar-full'), 10) || 0;
    return { zu: document.getElementById('sheet').hidden,
      y: Math.round(window.scrollY),
      oben: z ? Math.round(z.getBoundingClientRect().top) : null, bar: bar };
  });
  ok('"Im Plan anzeigen" schliesst das Sheet', sprung.zu);
  /* Erst nach dem Schliessen scrollen -- waehrend des Sheets ist body
     fixiert, ein scrollIntoView liefe ins Leere. */
  ok('… und springt wirklich', sprung.y > 100);
  ok('… das Ziel landet unter dem Kopf, nicht darunter verdeckt',
    sprung.oben !== null && sprung.oben >= sprung.bar - 6 && sprung.oben < 400);

  /* --- 14. Die Summenzeile luegt nicht mehr ------------------------------ */
  /* "20 Orte · 30,8 h Aufenthalt" addierte drei verplante Tage und dreizehn
     unverplante Orte zu einer Stunde, die nirgends vorkommt. */
  const summe = (await q.locator('.plan__sum').textContent()).trim();
  ok('die Summenzeile des Plans zaehlt nur den Plan',
    /* Acht statt sieben und vier Tage statt drei: der Mittwoch ist eben
       dazugekommen, einer der zwei Hinzugefuegten wieder heruntergenommen.
       Seit v33 zaehlt der Plan nur noch sich selbst -- der Vorrat steht
       drueben und hat seine eigene Zeile. */
    summe, '8 Orte an 4 Tagen');
  ok('… und nennt keine Gesamtstundenzahl', /Aufenthalt|Weg/.test(summe), false);

  /* --- 15. Die Merkliste ist eine eigene Haelfte ------------------------- */
  /* Bis v32 hing sie als vierte "Tagesgruppe" namens "Gemerkt, noch ohne Tag"
     unten am Plan -- sie las sich wie ein Tag und war keiner. */
  ok('im Plan haengt keine Merklisten-Gruppe mehr',
    await q.locator('.plantag--offen').count(), 0);

  await zurMerk(q);
  const merkSum = (await q.locator('.plan__sum').textContent()).trim();
  ok('die Merkliste zaehlt sich selbst', /^12 Orte ohne Tag/.test(merkSum));
  ok('… und nennt ihre Gesamtzeit', /Aufenthalt/.test(merkSum));
  ok('… mit einem Hinweis, wie daraus ein Tag wird',
    /Tag-Wähler/.test(await q.locator('.plan__hint').textContent()));
  ok('… und zeigt genau die Orte ohne Tag',
    await q.locator('.planrow').count(), 12);

  /* Die Leiste oben nennt beide Zahlen: "20 gemerkt" allein sagte nicht, wie
     viel davon schon einen Tag hat -- und genau das ist die Frage, die diese
     Ansicht beantwortet. */
  ok('die Teilen-Leiste zaehlt beide Haelften',
    (await q.locator('#sharebar-t').textContent()).trim(),
    '8 verplant · 12 ohne Tag · 0 gesehen');

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
  await q.selectOption(`select[data-day="${zwanzig[0]}"]`, '2026-09-21');
  await q.waitForTimeout(350);
  await zumPlan(q);
  await q.locator('[data-dayopen="2026-09-23"]').click();
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
  await q.evaluate(([ids, a]) => {
    localStorage.setItem('pk.saved', JSON.stringify(ids));
    localStorage.setItem('pk.days', JSON.stringify({ [a]: '2026-09-23' }));
  }, [zwanzig, ankerA]);
  await q.reload({ waitUntil: 'networkidle' });
  await q.waitForSelector('#app:not([hidden])');
  await zumPlan(q);
  await q.locator('[data-dayopen="2026-09-23"]').click();
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
    await q.evaluate(([alle, a, b2]) => {
      localStorage.setItem('pk.saved', JSON.stringify(alle));
      localStorage.setItem('pk.days', JSON.stringify({ [a]: '2026-09-23', [b2]: '2026-09-23' }));
    }, [zwanzig.concat([weitWeg.id]), zwei[0], zwei[1]]);
    await q.reload({ waitUntil: 'networkidle' });
    await q.waitForSelector('#app:not([hidden])');
    await zumPlan(q);
    await q.locator('[data-dayopen="2026-09-23"]').click();
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
