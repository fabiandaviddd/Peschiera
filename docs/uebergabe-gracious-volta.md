# Übergabe — Zweig `claude/gracious-volta-zgu6uv`

An die Hand, die zusammenführt. Stand 18.09.2026, `v16`.

Dieser Zweig hat sich um **Kalender und Bezugspunkt** gekümmert: was die App
über Wochentage weiß, und wovon aus sie Entfernungen misst. Dazu die CI.
Nichts davon ist Oberflächenarbeit — der Redesign-Vorschlag und seine vier
Schritte gehören einer anderen Hand, und ich bin ihr bewusst ausgewichen.

> **Nachtrag der zusammenführenden Hand, 18.09.2026.** Erledigt. „Von hier"
> liegt im Stamm — direkt nach `main`, ohne eigenen PR, wie unter Abschnitt 1
> zur Entscheidung gestellt. Weil PR #10 (Koordinaten) ebenfalls als `v16`
> fertig wurde, trägt der zusammengeführte Stand **`v17`**; das ist Falle 2
> dieses Dokuments, und sie ist zum dritten Mal an diesem Tag aufgetreten.
> Die Zeilen „Noch nicht im Stamm" und „PR für `v16`" in der Tabelle unten
> beschreiben den Stand vor dem Merge und bleiben als Beleg stehen.
>
> Ebenfalls überholt: `geo` liegt seit PR #10 bei **72** statt 78 Orten —
> sechs geerbte Ortsmittelpunkte wurden geleert. Im Fließtext unten
> nachgezogen, die Rechenwege bleiben gültig.

---

## 1. Merge-Zustand — das Wichtigste zuerst

| | |
|---|---|
| Zweig | `claude/gracious-volta-zgu6uv` |
| Basis | `claude/peschiera-kompakt-v2-vqzy9s` (der Stamm) |
| **Bereits im Stamm** | PR #9, gemergt 18:15 — Prüfstand-CI und Ruhetage (`v15`) |
| **Noch nicht im Stamm** | `9477ffc` „Von hier" (`v16`) + `6a10795` (Basis nachgezogen) |
| PR für `v16` | **keiner** — PR #9 war beim Fertigwerden schon gemergt |
| Zustand des Zweigs | Basis nachgezogen, konfliktfrei, 131 Prüfungen grün |

Die zwei offenen Commits sind gepusht und sauber auf dem aktuellen Stamm
aufgesetzt. Sie lassen sich ohne Konflikt übernehmen, **solange der Stamm
sich nicht weiterbewegt hat** — bewegt er sich, siehe Falle 1.

Eine Entscheidung liegt beim Master: eigener PR für `v16`, oder direkt in die
Sammlung. Ich habe von mir aus keinen aufgemacht.

---

## 2. Was in diesem Zweig entstanden ist

### a) Der Prüfstand läuft von selbst (`v15`, im Stamm)

`.github/workflows/pruefstand.yml` — `node scripts/test-logic.mjs` bei jedem
Push und jedem Pull Request. Keine Abhängigkeiten, kein `npm install`.

Vorher gab es kein `.github/`. Der Prüfstand ist das beste Stück
Infrastruktur im Repo und lief nur, wenn ihn jemand von Hand startete. Der
stille Datenverlust aus `9a8662b` hängt genau daran.

### b) Ruhetage werden gelesen (`v15`, im Stamm)

Bei **14 der 101 Orte** steht der Schließtag wörtlich in `hours` — gelesen
hat ihn vorher nichts. Nachgerechnet stand die Palazzina Storica mittwochs
auf **Platz 2 von 41** im Mittagsvorschlag, mit „Mittwochs geschlossen" in
der eigenen Notiz.

Verteilung: Mo 4 · Di 4 · Mi 6. Neun sind `essen`, zwei `cafe`.

### c) „Von hier" (`v16`, offen)

`geo` liegt bei 72 Orten (bis PR #10: 78). Bis `v13` las es nichts, `v14` baute die erste
Stelle (Luftlinie im Plan), dies ist die zweite: ein Knopf im Filter-Sheet
misst ab dem Gerätestandort statt ab dem Zeltplatz.

Mit gestelltem Standort in Sirmione stehen vorn Sirmione (286 m), Antiche
Mura und Al Torcol — alle drei ohne `walk_min`, alle drei 9–13 km vom
Zeltplatz und vorher weit hinten.

---

## 3. Was ich der Codebasis hinzugefügt habe

**Funktionen** (alle in `app.js`, Reihenfolge wie im File):

| Name | Zeile ≈ | Zweck | exportiert |
|---|---|---|---|
| `hereChipHtml()` | 595 | Knopf der Gruppe „Standort" | – |
| `closedOn(hours)` | 1054 | Wochentag wie `Date#getDay()` oder `null` | ja |
| `closedToday(p, when)` | 1072 | ist `p` an diesem Datum zu? | ja |
| `airKmPoint(a, b)` | 2068 | Luftlinie zwischen zwei `{lat, lon}` | ja |
| `hereKm(p)` | 2090 | Luftlinie Standort → Ort, sonst `null` | – |
| `toggleHere()` | 2098 | Standort holen / wieder abschalten | – |
| `hereAt()`, `noGeoCount()`, `hereNote()` | 2121+ | Beschriftung und Hinweis | – |

`airKm(a, b)` aus `v14` rechnet **nicht mehr selbst**, sondern reicht an
`airKmPoint` durch. Eine zweite Haversine-Formel im selben Bündel wäre eine
Stelle zu viel zum Auseinanderlaufen.

**Zustand** in `S`: `here` (`{lat, lon, at}` oder `null`) und `hereState`
(`off | wait | on | denied | failed`). **Bewusst nirgends gespeichert** —
eine Position ist nach dem nächsten Spaziergang falsch, und eine falsche
Entfernung ist schlechter als gar keine.

**CSS** (`style.css`): `.fact--closed`, `.fact--here`, `.tile--closed`,
`.today__shut`, `.chip--here:disabled`. Fünf Regeln, alle einzeilig, keine
bestehende verändert.

**Angefasste Bestandsfunktionen** — hier liegen die Berührungspunkte mit
anderen Händen: `byDistance`, `factsHtml`, `tilesHtml`, `sheetHtml`,
`todayList`, `whyLine`, `smallHtml`, `aheadHtml`, `wetNoneHtml`, `syncChips`,
`syncFilterBar`, `renderCount`, `activeChipsHtml`, `offChip`, `offFilter`,
`anyFilter`, `filterSheetHtml`.

---

## 4. Fallen — bitte vor dem Zusammenführen lesen

### Falle 1: Die Fassungsnummer kollidiert lautlos

`VERSION` in `app.js` muss zu `CACHE` **und** `FONTS` in `sw.js` passen; der
Prüfstand prüft das. Zwei Zweige haben unabhängig `v14` vergeben — kein
Konflikt in git, weil beide dieselbe Zeile gleich schrieben. Beim
Zusammenführen vergibt der Master eine neue Nummer und zieht alle drei
Stellen mit.

### Falle 2: Eine geänderte Signatur und `.map(fn)`

**Das ist der Fehler, der diesen Zweig fast in den Stamm gebracht hätte.**

Ich gab `smallHtml(p)` ein zweites Argument (das Bezugsdatum). Die andere Hand
rief dieselbe Funktion an zwei neuen Stellen als `.map(smallHtml)` auf — und
`Array#map` reicht als zweites Argument den **Index** durch. Index 0 ging gut
(falsy, Rückfall auf heute); ab Index 1 warf `closedToday` einen `TypeError`
und nahm die ganze Heute-Ansicht mit. Weg dorthin: Regen, Jum an, mindestens
zwei Orte im Trockenen.

Beide Zweige waren für sich in Ordnung. Der Fehler entstand erst im Merge.

Behoben an beiden Enden: die Aufrufstellen reichen das Datum ausdrücklich
durch, und `closedToday` nimmt **nur ein echtes `Date`** an. Vier Prüfungen
halten das fest.

> **Für den Master:** `.map(fn)` ist im Haus die übliche Schreibweise. Jede
> Funktion, die so gerufen wird und von irgendeinem Zweig ein zweites Argument
> bekommt, ist derselbe Fehler. Stand `v16` gibt es drei solche Stellen:
>
> ```
> $ grep -n "\.map([a-zA-Z_$][a-zA-Z0-9_$]*)" app.js
> 560:  … .map(flagChipHtml).join('')
> 576:  … .map(flagChipHtml).join('')
> 860:  $('list').innerHTML = items.map(cardHtml).join('');
> ```
>
> `cardHtml(p)` und `flagChipHtml(f)` haben heute je ein Argument und sind
> damit unauffällig — bis jemand ihnen ein zweites gibt. `smallHtml` steht
> nicht mehr in der Liste: dort reichen beide Aufrufstellen das Datum jetzt
> ausdrücklich durch. Diesen `grep` nach jedem Zusammenführen einmal laufen
> lassen und gegen die Signaturen halten, die ein Zweig erweitert hat.

### Falle 3: Der Prüfstand sieht keine Ansicht

Er prüft reine Logik. Falle 2 lief grün durch, weil dort nichts gerendert
wird. Aufgefallen ist sie nur, weil der zusammengeführte Stand im Browser
nachgestellt wurde. **Nach jedem Merge einmal im Browser nachsehen** — das
Rezept steht in Abschnitt 6.

### Falle 4: Doppelte Schlüssel in `places.json`

Fügen zwei Zweige dasselbe Feld an verschiedenen Stellen desselben Objekts
ein, nimmt git beide Zeilen an und `JSON.parse` still die letzte. Der
Prüfstand scannt seit `9a8662b` den Rohtext darauf. Läuft er bei jedem Merge
(seit `v15` tut er das in CI), ist die Falle entschärft.

---

## 5. Hausregeln, die ich eingehalten habe

Sie stehen nicht als Gesetz irgendwo, ergeben sich aber aus README und Code.
Wer zusammenführt, sollte sie nicht versehentlich brechen:

1. **Nie behaupten, etwas habe offen.** Der umgekehrte Schluss ist erlaubt:
   wo „Ruhetag Mittwoch" steht, ist mittwochs zu.
2. **Gelesen wird `hours`, nie `note`.** Dort steht bei `lapescheria` eine
   Faustregel über italienische Pescherie allgemein — keine Angabe über
   diesen Laden.
3. **Aus Luftlinie wird nie eine Gehzeit.** Der Weg ums Hafenbecken ist nicht
   die Strecke darüber.
4. **Fehlende Werte fallen ans Ende, nie als 0 nach vorn.**
5. **Nichts wird still ausgeblendet.** Wo etwas verschwindet oder sich
   verschiebt, sagt die Zählzeile oder ein Hinweis, wie viel es kostet — wie
   bei „Zu Fuß" mit seinen 53 fehlenden Gehzeiten.
6. **Feste Slots in der Faktenzeile.** Neue Information ersetzt einen
   bestehenden Slot, statt einen sechsten aufzumachen: die Zeilenhöhe von
   97 px ist Absicht. Genau so sind „heute zu" und „von hier" gebaut.
7. **Farben sind belegt:** Ziegel = Achtung, Seeblau = hier ist etwas an,
   Gold = Merkliste, Verde = Jum.
8. **Kein Laufzeit-Request nach draußen** außer Google Fonts.

---

## 6. Wie man nachprüft

```bash
node scripts/test-logic.mjs      # muss 131 Prüfungen grün melden
python3 -m http.server 8000      # http://localhost:8000
```

Der Prüfstand rechnet am Ende die Zahlen aus, die in der README stehen. Bei
`v16` müssen sie so aussehen:

```
Orte 101 · moment gepflegt 101 · dog 39/4/58 · geo 78/23
Ruhetag lesbar in hours 14 · verteilt auf Mo 4 · Di 4 · Mi 6
Luftlinie ab Zeltplatz: max / median  38 km / 1.9 km
```

**Browser-Gegenprobe.** Playwright ist keine Abhängigkeit des Repos, in der
Entwicklungsumgebung aber vorhanden. Dieses Skript stellt Uhr und Standort
und prüft genau die Stellen, an denen die beiden Zweige sich berührt haben:

```js
import { chromium } from 'playwright';
const b = await chromium.launch();
const P = (n, v) => console.log((v === false ? 'FEHL ' : 'ok   ') + n + '  → ' + v);

// 1. Mittwochmittag: die Palazzina Storica darf NICHT unter den drei stehen.
let ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
let page = await ctx.newPage();
page.on('pageerror', (e) => console.log('JS-FEHLER: ' + e.message));
await page.clock.setFixedTime(new Date(2026, 8, 16, 12, 30));
await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
P('Vorschlag', (await page.locator('.today__name').textContent()).trim());
P('Sonst noch', (await page.locator('.today__small-n').allTextContents()).join(' | '));

// 2. Der Pfad, der beim letzten Merge abstuerzte: Regen + Jum an.
await page.locator('#jum-btn').click();
await page.locator('#wx-wet').click();
await page.waitForTimeout(200);
P('Regen+Jum rendert', (await page.locator('#today').count()) === 1);
await ctx.close();

// 3. Standort in Sirmione: die drei Sirmione-Orte muessen nach vorn.
ctx = await b.newContext({ viewport: { width: 390, height: 844 },
  permissions: ['geolocation'], geolocation: { latitude: 45.4906, longitude: 10.6060 } });
page = await ctx.newPage();
await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
await page.locator('[data-tab="orte"]').click();
await page.locator('#chip-filter').click();
await page.waitForSelector('#sheet:not([hidden])');
await page.locator('#here-btn').click();
await page.waitForTimeout(400);
await page.locator('#filter-done').click();
await page.waitForTimeout(350);
P('erste Orte', (await page.locator('.card__name').allTextContents()).slice(0, 3).join(' · '));
await b.close();
```

Erwartet: Mittwochmittag ohne Palazzina Storica, Regen+Jum ohne JS-Fehler,
und ab Sirmione `Sirmione · Enoteca delle Antiche Mura · Osteria Al Torcol`.

**Das Sheet schließt mit 260 ms Animation** — wer `hidden` sofort nach dem
`Esc` prüft, misst einen Fehler, der keiner ist.

---

## 7. Was offen bleibt

Aus `docs/verbesserungsvorschlaege.md` sind **1, 2 und 4** erledigt. Offen,
mit Begründung und Umsetzungsskizze jeweils dort:

| # | Vorschlag | Wirkung | Aufwand |
|---|---|---|---|
| 3 | Termine mit Vorlauf statt nur „heute" | mittel | klein |
| 5 | „Meine ersetzen" rückgängig machen | mittel | sehr klein |
| 6 | Eigene Notiz je Ort | mittel | mittel |
| 7 | Manifest-Kurzbefehle und Screenshots | klein | sehr klein |
| 8 | Drei Kleinigkeiten (Zähler, `aria-live`, Trefferhervorhebung) | klein | sehr klein |

Nummer 3 gehört sachlich zu dem, was dieser Zweig angefangen hat: die App
kennt jetzt den Wochentag, aber vom Datum weiß sie weiter nur „heute". Vier
Orte tragen Termine, und beim Wochenmarkt am Dienstag ist „läuft heute" zu
spät.

**Die Karte bleibt blockiert.** `unpkg.com`, `nominatim.openstreetmap.org` und
`tile.openstreetmap.org` antworten aus dieser Umgebung mit 403 — am 18.09.
erneut nachgeprüft. Wer sie bauen will, braucht eine Umgebung ohne diese
Sperre. Die 23 fehlenden `geo` brauchen Nominatim oder Handarbeit.

---

## 8. Was ich an eurer Stelle zuerst täte

1. **`v16` übernehmen oder bewusst verwerfen.** Er liegt fertig und geprüft
   da; liegen bleiben ist die einzige schlechte Variante.
2. **Nach dem Zusammenführen aller Zweige einmal Falle 2 durchsuchen**
   (`grep -n "\.map(\w" app.js`) und die Browser-Gegenprobe fahren. Die
   Kombination zweier gesunder Zweige war hier schon einmal krank.
3. **Eine Fassungsnummer vergeben** und `VERSION`/`CACHE`/`FONTS` zusammen
   ziehen.
4. **Die README-Zahlen neu rechnen lassen**, statt sie abzuschreiben — der
   Prüfstand gibt sie am Ende aus.
