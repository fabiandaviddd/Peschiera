import { createRequire } from 'node:module';
import { ohneStartkarten } from './startfrei.mjs';
/* Playwright liegt global, nicht im Projekt — der Pfad kommt aus der Umgebung. */
const BASE = process.env.PK_BASE || 'http://localhost:8765';
/* Screenshots nur, wenn ein Zielordner uebergeben wird. */
const SHOT = process.argv[2] || null;
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');
const URL=`${BASE}/index.html`;
const R=[]; const ok=(n,p,x='')=>{R.push([p?'PASS':'FAIL',n,x]); if(!p) process.exitCode=1;};
const browser = ohneStartkarten(await chromium.launch());

// --- v14: Startansicht ist "Heute", die Ortsliste liegt unter "Orte" ---
const zuOrten = async (p) => {
  await p.evaluate(()=>{ const t=document.querySelector('[data-tab="orte"]'); if(t) t.click(); });
  await p.waitForTimeout(350);
};
const report=()=>{console.log(R.map(r=>`${r[0]}  ${r[1]}${r[2]?'  ['+r[2]+']':''}`).join('\n'));
  console.log('\n'+R.filter(r=>r[0]==='PASS').length+'/'+R.length+' passed');};
process.on('uncaughtException', async e=>{report();console.log('\nABBRUCH: '+e.message.split('\n')[0]);
  try{await browser.close();}catch(_){} process.exit(1);});

// --- Gerät A: Fabi -------------------------------------------------------
const ctxA = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true,
  permissions:['clipboard-read','clipboard-write']});
const A = await ctxA.newPage();
const errsA=[]; A.on('pageerror',e=>errsA.push(e.message));
await A.goto(URL,{waitUntil:'networkidle'}); await A.waitForSelector('#app:not([hidden])');
  await zuOrten(A);

// Teilen-Leiste nur im Gemerkt-Reiter
ok('Teilen-Leiste in "Orte" versteckt', await A.evaluate(()=>
  document.getElementById('sharebar').getBoundingClientRect().height===0));
await A.click('[data-tab="gemerkt"]'); await A.waitForTimeout(150);
ok('Teilen-Leiste in "Gemerkt" sichtbar', await A.evaluate(()=>
  document.getElementById('sharebar').getBoundingClientRect().height>0));
ok('Ohne Markierungen kein Teilen-Knopf', await A.evaluate(()=>
  document.getElementById('share-btn').getBoundingClientRect().height===0));
ok('Hinweis "Noch nichts markiert"', (await A.textContent('#sharebar-t')).includes('Noch nichts'));

// Fabi markiert etwas
await A.click('[data-tab="orte"]'); await A.waitForTimeout(150);
/* Seit v42 merkt der Tag-Chip in der Zeile; einen Haken gibt es dort nicht
   mehr -- "gesehen" steht im Ort und im Tagesplan. */
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Barcaccia'})})
  .first().locator('.daychip select').selectOption('vorrat');
await A.waitForTimeout(350);
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Lido ai Pioppi'})})
  .first().locator('.daychip select').selectOption('vorrat');
await A.waitForTimeout(350);
await A.locator('#list .card', {has: A.locator('.card__name',{hasText:'Festung Peschiera'})})
  .first().locator('.card__open').click();
await A.waitForTimeout(450);
await A.click('#sheet-body [data-seen]');
await A.waitForTimeout(200);
await A.keyboard.press('Escape');
await A.waitForTimeout(450);
await A.click('[data-tab="gemerkt"]'); await A.waitForTimeout(150);
/* Seit v33 nennt die Leiste beide Haelften, seit v47 in zwei Worten statt
   in "verplant" und "Vorrat". Hier hat keiner der beiden gemerkten einen Tag. */
ok('Leiste nennt Merk-, Tag- und Gesehen-Zahl',
   /2 gemerkt, 0 davon mit Tag.*1 gesehen/.test(await A.textContent('#sharebar-t')),
   await A.textContent('#sharebar-t'));
ok('Teilen-Knopf jetzt da', await A.evaluate(()=>
  document.getElementById('share-btn').getBoundingClientRect().height>0));

// Link erzeugen (ohne navigator.share -> Zwischenablage)
await A.evaluate(()=>{ try{ delete navigator.share; }catch(e){ navigator.share=undefined; } });
await A.click('#share-btn'); await A.waitForTimeout(600);
/* Seit v40 fragt der Knopf erst, was drinsteht -- geteilt wird im Sheet. */
await A.click('#share-go'); await A.waitForTimeout(700);
const link = await A.evaluate(()=>navigator.clipboard.readText());
ok('Link in der Zwischenablage', link.includes('#liste='), link.slice(0,70));
ok('Knopf bestätigt', (await A.textContent('#share-btn')).includes('kopiert'), await A.textContent('#share-btn'));
ok('Link bleibt handlich', link.length < 400, 'Länge '+link.length);

// --- Gerät B: Sonja ------------------------------------------------------
const ctxB = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const B = await ctxB.newPage();
const errsB=[]; B.on('pageerror',e=>errsB.push(e.message));
// Sonja hat schon eigene Markierungen
await B.goto(URL,{waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.locator('#list .card', {has: B.locator('.card__name',{hasText:'Braccobaldo'})})
  .first().locator('.daychip select').selectOption('vorrat');
await B.waitForTimeout(350);
ok('Sonja hat 1 eigenen Eintrag', (await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')))).length===1);

// Sie öffnet Fabis Link
const linkB = link.replace(`${BASE}`, `${BASE}`);
await B.goto(linkB, {waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.waitForTimeout(300);
ok('Empfangs-Panel erscheint', await B.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height>0));
const inboxTxt = await B.textContent('#inbox-x');
ok('Panel sagt, was Zusammenfuehren tut',
   inboxTxt.includes('Feld für Feld nach Datum'), inboxTxt);
/* Seit v40 steht Zeile fuer Zeile da, was drinsteckt. Bis v39 nannte ein Satz
   nur die gemerkten und gesehenen Orte; Notizen, Tage und Hundregeln fuhren
   ungenannt mit -- und Notizen sind das Persoenlichste, was diese App kennt. */
const wasTxt = await B.textContent('#inbox-was');
ok('… und die Aufstellung nennt die gemerkten', wasTxt.includes('2 gemerkte Orte'), wasTxt);
ok('… und die gesehenen', wasTxt.includes('1 gesehener Ort'), wasTxt);
ok('Empfangs-Panel steht in einer Ansicht mit Liste',
   await B.evaluate(()=>{ const t=document.querySelector('[data-tab][aria-current], [data-tab][aria-selected="true"]');
     return !!t && ['orte','heute'].includes(t.dataset.tab); }),
   await B.evaluate(()=>document.querySelector('[data-tab][aria-current], [data-tab][aria-selected="true"]')?.dataset.tab));

// Zusammenführen
await B.click('#inbox-merge'); await B.waitForTimeout(300);
const savedB = await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.saved')));
const seenB = await B.evaluate(()=>JSON.parse(localStorage.getItem('pk.seen')));
ok('Zusammenführen behält eigenes + fremdes', savedB.length===3 && savedB.includes('braccobaldo'),
   JSON.stringify(savedB));
ok('Gesehenes übernommen', seenB.length===1 && seenB.includes('fortezza'), JSON.stringify(seenB));
ok('Panel verschwindet', await B.evaluate(()=>document.getElementById('inbox').getBoundingClientRect().height===0));
ok('Adresse bereinigt', !(await B.evaluate(()=>location.hash)).includes('liste'),
   await B.evaluate(()=>location.hash));
await B.click('[data-tab="gemerkt"]'); await B.waitForTimeout(150);
ok('Plan zeigt die 3 übernommenen', (await B.evaluate(()=>
   JSON.parse(localStorage.getItem('pk.saved')||'[]').length))===3);

// Neu laden darf nicht erneut fragen
await B.reload({waitUntil:'networkidle'}); await B.waitForSelector('#app:not([hidden])');
  await zuOrten(B);
await B.waitForTimeout(250);
ok('Nach Reload kein zweites Nachfragen', await B.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height===0));

// --- Feldweise Zusammenfuehrung: das juengere Feld gewinnt ---------------
/* Bis v39 war das eine GLOBALE Entscheidung: "meine gewinnen, fremde fuellen
   Luecken" -- oder "Meine ersetzen", der destruktivste Knopf der App. Hatte
   der andere eine Notiz berichtigt, blieb die eigene, veraltete stehen.

   Seit v40 traegt jedes Feld ein Datum. Geprueft wird beides: dass das
   juengere gewinnt, und dass ein Stand OHNE Datum nicht ueberschrieben wird. */
{
  const ctxC = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
  const C = await ctxC.newPage();
  await C.goto(URL,{waitUntil:'networkidle'}); await C.waitForSelector('#app:not([hidden])');
  await zuOrten(C);

  /* Drei Notizen zu einem Ort: eine alte eigene, eine neue fremde, und
     umgekehrt. Die Stempel werden von Hand gesetzt -- die Uhr des
     Testlaeufers waere sonst die Pruefung. */
  const gebaut = await C.evaluate(() => {
    const id1 = 'bip', id2 = 'fortezza', id3 = 'mantova';
    localStorage.setItem('pk.saved', JSON.stringify([id1, id2, id3]));
    localStorage.setItem('pk.notes', JSON.stringify({
      [id1]: 'meine alte Notiz',
      [id2]: 'meine neue Notiz',
      [id3]: 'meine Notiz ohne Datum'
    }));
    localStorage.setItem('pk.stamps', JSON.stringify({
      [id1]: { n: '2026-09-18T10:00' },
      [id2]: { n: '2026-09-20T10:00' }
      /* id3 bekommt keinen Stempel: ein Stand von vor v40. */
    }));
    /* Der fremde Link, von Hand gebaut -- shareLink() zu benutzen hiesse,
       die App zu fragen, ob die App recht hat. */
    const payload = {
      v: 1, m: [id1, id2, id3], g: [],
      n: { [id1]: 'fremde neue Notiz', [id2]: 'fremde alte Notiz',
           [id3]: 'fremde Notiz mit Datum' },
      t: { [id1]: { n: '2026-09-19T10:00' }, [id2]: { n: '2026-09-19T10:00' },
           [id3]: { n: '2026-09-19T10:00' } }
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return location.origin + location.pathname + '#liste=' + b64;
  });
  await C.reload({waitUntil:'networkidle'});
  await C.waitForSelector('#app:not([hidden])');
  await C.goto(gebaut, {waitUntil:'networkidle'});
  await C.waitForSelector('#app:not([hidden])');
  await C.waitForSelector('#inbox:not([hidden])');
  ok('"Meine ersetzen" gibt es nicht mehr',
     (await C.locator('#inbox-replace').count()) === 0);
  await C.click('#inbox-merge'); await C.waitForTimeout(400);

  const notizen = await C.evaluate(() => JSON.parse(localStorage.getItem('pk.notes') || '{}'));
  ok('die juengere fremde Notiz gewinnt',
     notizen['bip'] === 'fremde neue Notiz', notizen['bip']);
  ok('die juengere eigene Notiz bleibt',
     notizen['fortezza'] === 'meine neue Notiz', notizen['fortezza']);
  /* Ein Stand von vor v40 laesst sich nicht datieren. Ihn zu ueberschreiben
     waere dieselbe stille Enteignung, die "Meine ersetzen" so gefaehrlich
     gemacht hat. */
  ok('ohne eigenes Datum bleibt die eigene Notiz stehen',
     notizen['mantova'] === 'meine Notiz ohne Datum', notizen['mantova']);

  /* Das uebernommene Datum wandert mit -- sonst gewaenne beim naechsten
     Abgleich wieder dasselbe. */
  const stempel = await C.evaluate(() => JSON.parse(localStorage.getItem('pk.stamps') || '{}'));
  ok('das uebernommene Datum wandert mit',
     stempel['bip'].n === '2026-09-19T10:00', stempel['bip'].n);
  ok('das eigene, juengere Datum bleibt',
     stempel['fortezza'].n === '2026-09-20T10:00', stempel['fortezza'].n);

  /* Zusammenfuehren nimmt nie etwas weg: es gibt keine Grabsteine im Link. */
  const savedC = await C.evaluate(() => JSON.parse(localStorage.getItem('pk.saved') || '[]'));
  ok('Zusammenfuehren nimmt keinen Ort weg', savedC.length === 3, String(savedC.length));
  await ctxC.close();
}

// --- Vor dem Teilen sagen, was drinsteht ---------------------------------
/* Der Link traegt eigene Notizen, geklaerte Hundregeln und Zeitstempel. Das
   ist richtig so -- aber wer etwas verschickt, soll vorher wissen, was. */
{
  const ctxF = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
  const F = await ctxF.newPage();
  await F.goto(URL,{waitUntil:'networkidle'}); await F.waitForSelector('#app:not([hidden])');
  await F.evaluate(() => {
    localStorage.setItem('pk.saved', JSON.stringify(['bip', 'fortezza']));
    localStorage.setItem('pk.seen', JSON.stringify(['fortezza']));
    localStorage.setItem('pk.notes', JSON.stringify({ bip: 'Wassernapf kommt von selbst' }));
    localStorage.setItem('pk.dog', JSON.stringify({ bip: { v: true, at: '2026-09-20T12:00' } }));
  });
  await F.reload({waitUntil:'networkidle'}); await F.waitForSelector('#app:not([hidden])');
  await F.click('[data-tab="gemerkt"]'); await F.waitForTimeout(400);
  await F.click('#share-btn'); await F.waitForTimeout(600);

  ok('Teilen fragt erst, statt gleich zu teilen', await F.locator('#sheet').isVisible());
  /* Im Sheet, nicht im Posteingang: beide benutzen dieselbe Aufstellung, und
     .inbox__was gibt es deshalb zweimal im Dokument. */
  const inhalt = await F.textContent('#sheet .inbox__was');
  ok('… und nennt die gemerkten Orte', inhalt.includes('2 gemerkte Orte'), inhalt);
  ok('… und die gesehenen', inhalt.includes('1 gesehener Ort'), inhalt);
  ok('… und die eigenen Notizen beim Namen', inhalt.includes('1 eigene Notiz'), inhalt);
  ok('… und die geklaerten Hundregeln', inhalt.includes('1 geklärte Hundregel'), inhalt);
  ok('… und sagt, was NICHT drinsteht',
     (await F.textContent('#sheet .sheet__hint')).includes('keinen Standort'));
  /* --- Die Liste in der Adresse (Safari raeumt localStorage weg) -------- */
  /* Safari raeumt bei Seiten, die laenger nicht benutzt werden, den
     localStorage weg -- nach Wochen Pause kann die Merkliste weg sein. Ein
     Lesezeichen mit der Liste IN der Adresse ueberlebt das, weil es kein
     Speicher ist, sondern Text. */
  await F.click('#share-mark'); await F.waitForTimeout(400);
  const adresse = await F.evaluate(() => location.hash);
  ok('die Liste steht jetzt in der Adresse', adresse.startsWith('#liste='), adresse.slice(0, 20));
  ok('… und der Knopf sagt es', (await F.textContent('#share-mark')).includes('✓'));
  ok('… und der Hinweis erklaert, wozu',
     (await F.textContent('#sheet .sheet__hint')).includes('Lesezeichen'));
  /* Kein Posteingang fuer die eigene Liste: replaceState loest kein
     hashchange aus. */
  ok('die eigene Liste wird nicht als fremde angeboten',
     await F.locator('#inbox').isHidden());

  /* Abbrechen teilt nichts und aendert nichts. */
  await F.click('#share-ab'); await F.waitForTimeout(500);
  ok('Abbrechen schliesst das Sheet', !(await F.locator('#sheet').isVisible()));
  /* Das Sheet legt beim Oeffnen einen Historieneintrag an (daran haengt die
     Zurueck-Geste) und nimmt ihn beim Schliessen mit history.back() zurueck
     -- samt der eben geschriebenen Adresse. Sie muss danach trotzdem
     dastehen, sonst waere das Lesezeichen in dem Moment weg, in dem man es
     setzen will. */
  ok('die Adresse ueberlebt das Schliessen des Sheets',
     (await F.evaluate(() => location.hash)).startsWith('#liste='),
     await F.evaluate(() => location.hash));

  /* Beim Neuladen liest showInbox() den Hash -- und erkennt ihn als die
     eigene Liste. Ohne das bekaeme man beim Oeffnen des eigenen Lesezeichens
     seine eigene Liste als fremde angeboten. */
  await F.reload({ waitUntil: 'networkidle' });
  await F.waitForSelector('#app:not([hidden])');
  await F.waitForTimeout(500);
  ok('das eigene Lesezeichen fragt nichts', await F.locator('#inbox').isHidden());
  ok('… und raeumt die Adresse auf',
     !(await F.evaluate(() => location.hash)).includes('liste'),
     await F.evaluate(() => location.hash));

  /* Ist der Speicher weg, ist dasselbe Lesezeichen die Rettung. Geprueft
     wird das in einem FRISCHEN Kontext -- localStorage.clear() in der
     laufenden Seite raeumt nur den Speicher, nicht den Zustand im
     Arbeitsspeicher, und die App wuesste die Liste weiterhin. */
  const gesichert = adresse;
  const ctxG = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
  const G = await ctxG.newPage();
  await G.goto(URL + gesichert, { waitUntil: 'networkidle' });
  await G.waitForSelector('#app:not([hidden])');
  await G.waitForSelector('#inbox:not([hidden])');
  await G.click('#inbox-merge'); await G.waitForTimeout(500);
  const wieder = await G.evaluate(() => ({
    m: JSON.parse(localStorage.getItem('pk.saved') || '[]').length,
    n: Object.keys(JSON.parse(localStorage.getItem('pk.notes') || '{}')).length
  }));
  ok('nach geraeumtem Speicher stellt das Lesezeichen die Liste wieder her',
     wieder.m === 2, String(wieder.m));
  ok('… samt der eigenen Notiz', wieder.n === 1, String(wieder.n));
  await ctxG.close();
  await ctxF.close();
}

// --- Verwerfen -----------------------------------------------------------
const ctxD = await browser.newContext({viewport:{width:402,height:754},deviceScaleFactor:3,hasTouch:true});
const Dp = await ctxD.newPage();
await Dp.goto(link,{waitUntil:'networkidle'}); await Dp.waitForSelector('#app:not([hidden])');
  await zuOrten(Dp);
await Dp.waitForTimeout(250);
await Dp.click('#inbox-cancel'); await Dp.waitForTimeout(200);
ok('Verwerfen ändert nichts', (await Dp.evaluate(()=>localStorage.getItem('pk.saved'))) === null,
   String(await Dp.evaluate(()=>localStorage.getItem('pk.saved'))));

// --- Kaputter Link darf nicht stören -------------------------------------
const E = await ctxD.newPage();
const errsE=[]; E.on('pageerror',e=>errsE.push(e.message));
await E.goto(URL+'#liste=nonsense___',{waitUntil:'networkidle'});
await E.waitForSelector('#app:not([hidden])');
  await zuOrten(E);
/* Seit v24 kommt die Liste in Stuecken: erst 18 Karten, der Rest ueber
   requestAnimationFrame hinterher. Auf data-voll warten statt auf eine
   Wartezeit zu hoffen -- mit waitForTimeout haette diese Zusicherung je nach
   Tageslaune der Maschine mal 101 und mal 42 gesehen. */
await E.waitForSelector('#list[data-voll="1"]');
ok('Kaputter Link: App läuft normal', (await E.$$('#list .card')).length===101 && errsE.length===0,
   errsE.join(' | '));
ok('Kaputter Link: kein Panel', await E.evaluate(()=>
  document.getElementById('inbox').getBoundingClientRect().height===0));

ok('Keine JS-Fehler', errsA.length===0 && errsB.length===0, [...errsA,...errsB].join(' | '));

await B.click('[data-tab="gemerkt"]'); await B.waitForTimeout(200);
if (SHOT) await B.screenshot({ path: SHOT + '/share.png' });
await ctxD.newPage().then(async pg=>{ await pg.goto(link,{waitUntil:'networkidle'});
  await pg.waitForSelector('#app:not([hidden])');
  await zuOrten(pg); await pg.waitForTimeout(300);
  if (SHOT) await pg.screenshot({ path: SHOT + '/inbox.png' }); });

await browser.close();
report();
