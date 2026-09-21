/* Die drei Startkarten aus dem Weg raeumen -- fuer alle Suiten ausser der,
   die sie prueft.

   Seit v41 legt die App beim ALLERERSTEN Start drei Erklaerkarten als Sheet
   ueber die Ansicht. Das ist richtig so: sie erklaeren die drei
   Eigenheiten, die sonst als Fehler gelesen werden (die Hundzeile, "offen
   heisst offen", das Teilen). Fuer den Pruefstand heisst es aber, dass
   jede Suite mit einem Sheet beginnt, das nichts mit ihr zu tun hat und
   jeden Tipp abfaengt.

   Statt in zwanzig Dateien dieselbe Zeile zu verstreuen, wird hier EINMAL
   browser.newContext umhuellt: jeder Kontext bekommt ein Init-Skript, das
   pk.start setzt -- also den Zustand "die Karten sind gesehen".

   Benutzung, direkt nach chromium.launch():

       import { ohneStartkarten } from './startfrei.mjs';
       const browser = ohneStartkarten(await chromium.launch());

   Wer die Karten SELBST pruefen will (willkommen.mjs), laesst das weg.    */

export function ohneStartkarten(browser) {
  const original = browser.newContext.bind(browser);
  browser.newContext = async function (opts) {
    const ctx = await original(opts);
    await ctx.addInitScript(() => {
      try { localStorage.setItem('pk.start', '1'); } catch (e) { /* Private Mode */ }
    });
    return ctx;
  };
  return browser;
}
