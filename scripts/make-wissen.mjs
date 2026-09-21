/* Aus drei Listen in places.json wird data/wissen.json.

   Bis v37 lagen "Gut zu wissen" (17), "Offene Punkte" (18) und der
   Faktencheck (13) als drei Arrays IN places.json -- einer Datei, die sonst
   nur Orte enthaelt. Drei Folgen:

     1. Die Suche fand sie nie. Sie geht ueber Orte, und das Wissen war
        keiner. "Darf Jum in den Zug?" liess sich nicht suchen, obwohl die
        Antwort in der App steht.
     2. Achtundvierzig Eintraege standen in drei langen Listen untereinander,
        ohne Gruppe und ohne Rangfolge. Der Notruf stand als neunter Eintrag
        zwischen "Badeschuhe" und "Coperto & Trinkgeld".
     3. Wer einen Ort aendert, fasst dieselbe Datei an wie jemand, der eine
        Busabfahrt korrigiert.

   Dieses Skript macht die Umstellung EINMAL und bleibt danach als Beleg
   liegen: es zeigt, woher jeder Eintrag kommt und nach welcher Regel er in
   seine Gruppe gefallen ist. Es schreibt nur, wenn --schreiben dabeisteht.

       node scripts/make-wissen.mjs              Probelauf, zeigt die Zuordnung
       node scripts/make-wissen.mjs --schreiben  schreibt wissen.json und
                                                 raeumt places.json auf
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HIER = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HIER, '..');
const roh = readFileSync(join(ROOT, 'data', 'places.json'), 'utf8');
const daten = JSON.parse(roh);

/* Die Gruppen. Reihenfolge ist Rangfolge: was oben steht, steht in der App
   oben. "Notfall" ist gepinnt -- er gehoert nicht in eine Liste, in der man
   scrollt, sondern an die Stelle, an der man ihn ohne Suchen findet. */
const GRUPPEN = [
  { id: 'notfall',   titel: 'Notfall',        pin: true,
    lead: 'Steht oben, immer, ohne Suchen.' },
  { id: 'hund',      titel: 'Mit Jum',
    lead: 'Was für den Hund gilt — Regeln, Pflichten, Ausnahmen.' },
  { id: 'verkehr',   titel: 'Hin und zurück',
    lead: 'Busse, Züge, Schiffe und die letzten Abfahrten.' },
  { id: 'essen',     titel: 'Essen und bezahlen',
    lead: 'Was auf der Rechnung steht und was üblich ist.' },
  { id: 'saison',    titel: 'Jahreszeit',
    lead: 'Was in diesen zwei Wochen läuft — und was nicht mehr.' },
  { id: 'zeiten',    titel: 'Zeiten und Preise',
    lead: 'Noch nicht bestätigt — vor dem Hinfahren kurz prüfen.' },
  { id: 'praktisch', titel: 'Praktisches',
    lead: 'Wetter, Wasser, Ausrüstung.' },
  { id: 'korrektur', titel: 'Faktencheck',
    lead: 'Korrigiert gegenüber der ersten Recherche.' }
];

/* Die Zuordnung. Erste passende Regel gewinnt; was durchfaellt, landet in
   "praktisch" und wird unten ausdruecklich gemeldet -- eine stille
   Restekiste waere genau das, was hier abgeschafft werden soll. */
const REGELN = [
  [/notruf|112|polizei|feuerwehr|rettung/i,                         'notfall'],
  [/jum|hund|maulkorb|leine|heimtierausweis|tollwut/i,              'hund'],
  [/bus |linie \d|zug|bahnhof|schiff|fähre|navigarda|fahrplan|abfahrt|radverleih|fahrradmitnahme|seilbahn/i, 'verkehr'],
  [/coperto|trinkgeld|gedeck|restaurant|ristorante|osteria|enoteca|pescheri|cantina|weingut/i, 'essen'],
  /* Kein blankes "saison": "Ruhetag in der Sommersaison" ist eine Frage nach
     Öffnungszeiten, keine Jahreszeitennotiz. */
  [/weinlese|olivenernte|shuttlebus|rievocazione|arena verona|festival/i, 'saison'],
  [/öffnungszeit|eintritt|ruhetag|preis|\d\s*€|geöffnet|zeiten/i,     'zeiten']
];

function gruppeFuer(text, art) {
  if (art === 'korrektur') return 'korrektur';
  /* Steht ein Laden dauerhaft noch in den Guides, ist das keine Faustregel,
     sondern eine Korrektur -- auch wenn der Eintrag aus "Gut zu wissen"
     kommt. Nur fuer Regeln: eine offene FRAGE ("offen oder dauerhaft
     geschlossen?") ist das Gegenteil einer Korrektur. */
  if (art === 'regel' && /dauerhaft geschlossen|nicht hinlaufen/i.test(text)) {
    return 'korrektur';
  }
  for (const [muster, id] of REGELN) if (muster.test(text)) return id;
  return 'praktisch';
}

/* Eine Kennung, die sich aus dem Inhalt ergibt und stabil bleibt, solange
   der Titel steht. Keine laufende Nummer: die verschiebt sich, sobald
   jemand einen Eintrag einfuegt, und dann zeigen Lesezeichen woandershin. */
function kennung(text, benutzt) {
  let id = String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40).replace(/-$/, '');
  if (!id) id = 'eintrag';
  let n = id, i = 2;
  while (benutzt.has(n)) n = id + '-' + (i++);
  benutzt.add(n);
  return n;
}

/* Eine Telefonnummer im Freitext. Dieselbe Erkennung wie in app.js. */
function telAus(text) {
  const m = /(\+?\d[\d\s/()-]{7,}\d)/.exec(String(text));
  return m ? m[1].trim() : '';
}

const benutzt = new Set();
const eintraege = [];

/* 1. "Gut zu wissen" -- Regeln und Faustregeln. */
daten.merken.forEach((m) => {
  const titel = typeof m === 'string' ? '' : String(m.title || '');
  const text = typeof m === 'string' ? String(m) : String(m.text || '');
  const beides = titel + ' ' + text;
  eintraege.push({
    id: kennung(titel || text, benutzt),
    art: 'regel',
    gruppe: gruppeFuer(beides, 'regel'),
    titel: titel,
    text: text,
    tel: telAus(beides),
    quelle: 'merken'
  });
});

/* 2. "Offene Punkte" -- ungeklaerte Fakten, bewusst sichtbar. */
daten.open_questions.forEach((q) => {
  const titel = typeof q === 'string' ? '' : String(q.topic || '');
  const text = typeof q === 'string' ? String(q) : String(q.status || '');
  const kontakt = typeof q === 'string' ? '' : String(q.contact || '');
  const beides = titel + ' ' + text + ' ' + kontakt;
  eintraege.push({
    id: kennung(titel || text, benutzt),
    art: 'offen',
    gruppe: gruppeFuer(beides, 'offen'),
    titel: titel,
    text: text,
    tel: kontakt || telAus(beides),
    quelle: 'open_questions'
  });
});

/* 3. Der Faktencheck -- was sich gegenueber der ersten Recherche geaendert
      hat. Eigene Gruppe: das ist kein Rat, sondern eine Korrektur. */
daten.faktencheck.forEach((f) => {
  const text = typeof f === 'string' ? String(f) : String(f.text || f.claim || '');
  eintraege.push({
    id: kennung(text, benutzt),
    art: 'korrektur',
    gruppe: 'korrektur',
    titel: '',
    text: text,
    tel: '',
    quelle: 'faktencheck'
  });
});

/* --- Bericht ------------------------------------------------------------- */
console.log('\nWissen aus places.json\n');
GRUPPEN.forEach((g) => {
  const drin = eintraege.filter((e) => e.gruppe === g.id);
  console.log('  ' + (g.titel + (g.pin ? ' (gepinnt)' : '')).padEnd(24)
    + String(drin.length).padStart(3));
  drin.forEach((e) => console.log('      ' + (e.art + ':').padEnd(11)
    + (e.titel || e.text).slice(0, 62)));
});
const ohneGruppe = eintraege.filter((e) => !GRUPPEN.some((g) => g.id === e.gruppe));
console.log('\n  ' + 'gesamt'.padEnd(24) + String(eintraege.length).padStart(3));
if (ohneGruppe.length) {
  console.log('\n  ACHTUNG: ohne Gruppe — ' + ohneGruppe.map((e) => e.id).join(', '));
}
const ohneText = eintraege.filter((e) => !e.text && !e.titel);
if (ohneText.length) console.log('\n  ACHTUNG: leere Eintraege — ' + ohneText.length);

if (!process.argv.includes('--schreiben')) {
  console.log('\n  (Probelauf. Mit --schreiben werden die Dateien geaendert.)\n');
  process.exit(0);
}

/* --- Schreiben ----------------------------------------------------------- */
const wissen = {
  meta: {
    stand: daten.meta.stand || '',
    note: 'Aus places.json herausgeloest (merken, open_questions, faktencheck). '
        + 'Erzeugt von scripts/make-wissen.mjs. Die Gruppen sind Kuratierung, '
        + 'die Kennungen leiten sich aus dem Titel ab und bleiben stabil.'
  },
  gruppen: GRUPPEN,
  eintraege: eintraege.map((e) => {
    const aus = { id: e.id, art: e.art, gruppe: e.gruppe };
    if (e.titel) aus.titel = e.titel;
    aus.text = e.text;
    if (e.tel) aus.tel = e.tel;
    return aus;
  })
};
writeFileSync(join(ROOT, 'data', 'wissen.json'), JSON.stringify(wissen, null, 2) + '\n');

/* places.json verliert die drei Arrays -- und sonst nichts. Geschrieben wird
   mit derselben Einrueckung, mit der die Datei bisher gespeichert war, damit
   der Diff die Umstellung zeigt und nicht eine Neuformatierung. */
delete daten.merken;
delete daten.open_questions;
delete daten.faktencheck;
writeFileSync(join(ROOT, 'data', 'places.json'), JSON.stringify(daten, null, 2) + '\n');
console.log('\n  geschrieben: data/wissen.json, data/places.json aufgeraeumt\n');
