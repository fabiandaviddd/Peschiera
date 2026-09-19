/* Gemeinsamer Datensatz fuer die Koordinaten-Suiten.

   Die vier Suiten koord, koord2, orts und stale ueben die Koordinatensuche.
   Dafuer brauchen sie Orte OHNE Koordinate -- und genau die verschwinden,
   wenn die Arbeit vorangeht. Am 19.09.2026 waren 100 von 101 versorgt, und
   alle vier Suiten fielen gleichzeitig um: zwei mit Abbruch, eine mit fuenf
   Fehlschlaegen, eine mit einem sauberen Ausstieg. Keiner davon war ein
   Fehler der Seite.

   Eine Suite, die nur laeuft, solange die Daten unfertig sind, prueft nichts
   -- sie zaehlt nur den Arbeitsstand mit. Deshalb bekommen die vier hier
   einen festen Ausgangszustand, unabhaengig davon, was in data/places.json
   inzwischen steht: die 28 Orte, die am 19.09. nachgetragen wurden, sind
   darin wieder leer.

   Benutzung in einer Suite, VOR dem ersten page.goto:

       import { fixtureRoute, FIXTURE } from './fixture.mjs';
       await fixtureRoute(ctx);
       // FIXTURE.alle / .mitGeo / .ohneGeo / .stand / .places
*/
import { createRequire } from 'node:module';

const ECHT = createRequire(import.meta.url)('../../data/places.json');

/* Die 28 vom 19.09. Bewusst als feste Liste und nicht "die letzten N":
   ein fester Ausgangszustand ist der halbe Zweck dieser Datei. */
export const GELEERT = [
  'combattente', 'ammazza-verona', 'fortezza', 'lungomincio', 'lago-frassino',
  'mercato', 'isola-del-garda', 'famila', 'bahnhof', 'imbarcadero', 'oreste',
  'bergamini', 'lungolago-lugana', 'jamaica-beach', 'rivoltella',
  'pacengo-lazise', 'monte-luppia', 'giro-delle-mura', 'linienschiff-hund',
  'ciclabile-lugana', 'ciclabile-ostufer', 'ponti-sul-mincio', 'ottella',
  'selva-capuzza', 'villa-dei-cedri', 'rocca-manerba', 'rievocazione',
  'pescheria-cavallaro',
];

const daten = JSON.parse(JSON.stringify(ECHT));
for (const p of daten.places) if (GELEERT.includes(p.id)) p.geo = null;

const mitGeo = daten.places.filter((p) => p.geo).length;

export const FIXTURE = {
  daten,
  places: daten.places,
  alle: daten.places.length,
  mitGeo,
  ohneGeo: daten.places.length - mitGeo,
  stand: `${mitGeo} von ${daten.places.length}`,
  base: daten.meta.base_geo,
};

/* Faengt den Abruf der Datei ab, egal ob die Seite sie mit oder ohne
   Cache-Buster holt. */
export async function fixtureRoute(ctx) {
  await ctx.route('**/data/places.json*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(daten),
    })
  );
}
