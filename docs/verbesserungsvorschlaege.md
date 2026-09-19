# Verbesserungsvorschläge — Stand 18.09.2026

Bestandsaufnahme einer vierten Hand am selben Repo. Alle Zahlen sind aus
`data/places.json` gerechnet, nicht geschätzt; die Rechenwege stehen jeweils
dabei. Die Befunde beschreiben den Stand `v13`.

**Vorschlag 1, 2, 4, 5, 7 und 8 sind umgesetzt** (`v15`, `v17`, `v19`) — siehe
„Umsetzungsstand" unten. Die Vorschläge 3 und 6 stehen weiter offen
und sind absichtlich so beschrieben, dass sie jede Hand einzeln aufgreifen
kann.

Der Vorschlag von `docs/redesign-vorschlag.md` ist bis Schritt 3 umgesetzt
(v8–v12). Was hier steht, ist bewusst **nicht** Schritt 4 — der ist dort schon
beschrieben und liegt bei der Hand, die die Schritte 1–3 gebaut hat.

---

## Was die App ist

Ein Nachschlagewerk für zwei Wochen Peschiera del Garda: 101 Orte in fünf
Kategorien, Suche, Filter, Merkliste, eine Tagesansicht mit einem begründeten
Vorschlag — mobil-first, ohne Framework, ohne Build, offline lauffähig, mit
dem Hund als Dauerkriterium. Alle Inhalte liegen in einer JSON-Datei, alle
Markierungen im `localStorage`, ein Server existiert nicht.

---

## Der rote Faden: die App kennt keinen Kalender

Sie kennt die Uhrzeit — `momentNow()`, `closingSoon()`, `fitsLeft()` rechnen
mit Minuten seit Mitternacht und tun das sauber. Vom **Wochentag** und vom
**Datum** weiß sie dagegen nur zwei Dinge: `WEEKDAYS[now.getDay()]` als
Überschrift und `runsToday()` für den Tag selbst. Der Rest der Woche ist
blind, obwohl die Daten ihn hergeben.

Das ist der Grund, warum die drei stärksten Vorschläge unten zusammengehören.

---

## Vorschläge, nach Wirkung je Aufwand

| # | Vorschlag | Wirkung | Aufwand | Kollisionsrisiko |
|---|---|---|---|---|
| 1 | Prüfstand als CI auf jedem PR | hoch | sehr klein | keins |
| 2 | Ruhetage lesen und beachten | hoch | mittel | mittel |
| 3 | Termine mit Vorlauf statt nur „heute" | mittel | klein | mittel |
| 4 | Standort „von hier" statt nur ab Zeltplatz | mittel–hoch | mittel | klein |
| 5 | „Meine ersetzen" rückgängig machen | mittel | sehr klein | sehr klein |
| 6 | Eigene Notiz je Ort | mittel | mittel | mittel |
| 7 | Manifest-Kurzbefehle und Screenshots | klein | sehr klein | sehr klein |
| 8 | Drei Kleinigkeiten | klein | sehr klein | klein |

---

## 1. Der Prüfstand läuft nicht von selbst

**Was fehlt.** `node scripts/test-logic.mjs` prüft 94 Dinge und ist das beste
Stück Infrastruktur im Repo. Es gibt aber kein `.github/` — niemand führt ihn
aus außer von Hand, und in einem Repo, an dem gerade fünf Hände gleichzeitig
arbeiten, ist „von Hand" gleichbedeutend mit „irgendwann nicht".

**Warum es zählt.** Das ist keine Vorsichtsmaßnahme gegen etwas Denkbares,
sondern gegen etwas bereits Geschehenes. Commit `9a8662b` beschreibt einen
stillen Datenverlust in einem Merge: zwei Zweige fügten bei `lido39` beide
ein `moment` ein, git nahm beide Zeilen an, `JSON.parse` nahm still die
letzte, und aus `["nachmittag","abend"]` wurde `["abend"]`. Die Datei las sich
sauber. Aufgefallen ist es nur, weil jemand die Abschnittszahl von Hand
verglichen hat. Der Prüfstand scannt seitdem den Rohtext auf doppelte
Schlüssel — aber nur, wenn ihn jemand startet.

**Umsetzung.** Eine Datei, kein Eingriff in bestehende:

```yaml
# .github/workflows/pruefstand.yml
name: Prüfstand
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: node scripts/test-logic.mjs
```

Kein `npm install`, keine Abhängigkeiten, Laufzeit unter einer Sekunde. Der
Prüfstand deckt bereits `CACHE` gegen `VERSION` ab — der vergessene
Fassungssprung, der bisher erst im Footer der laufenden App auffällt, würde
damit schon im PR auffallen.

**Kollision.** Keine. Neues Verzeichnis, das niemand anfasst.

---

## 2. Vierzehn Orte sagen, wann sie geschlossen haben — niemand liest es

**Der Befund.** In `hours` steht bei 14 Orten ein lesbarer Schließtag: elfmal
als `Ruhetag <Wochentag>`, dreimal als `Mi geschlossen` / `Mo zu`.

| Schließtag | Orte |
|---|---|
| Montag | rose-sapori, sette-ponti, castello-desenzano, torri-del-benaco |
| Dienstag | saligusta, mos, tancredi, esperidi |
| Mittwoch | palazzina-storica, momus, al-torcol, oreste, regio-patio, antiche-mura |

Neun davon sind `essen`, zwei `cafe` — also genau die Kategorien, aus denen
„Heute" mittags und abends seinen Vorschlag zieht.

**Was daraus folgt.** Die Sortierung in `todayList()` kennt den Wochentag
nicht. Nachgerechnet mit der bestehenden Rangfolge (ungeprüft nach hinten,
dann Gehzeit ≤ 25 Min, dann Bewertung):

- **Mittwoch, Mittag:** *Palazzina Storica* steht auf Platz **2 von 41** —
  mit „Mi geschlossen" in `hours` und „Mittwochs geschlossen" in `note`.
  Nachmittags ebenfalls Platz 2 von 48.
- **Dienstag, Mittag:** *Saligusta* auf Platz **3 von 41**, Ruhetag Dienstag.
- **Mittwoch, Abend:** *Momus* auf Platz 10, *Regio Patio* (4,6 ★) auf 20,
  *Antiche Mura* auf 25 — alle drei geschlossen.

Die Ansicht zeigt einen Vorschlag und zwei Alternativen. Platz 2 und 3 sind
also sichtbar, nicht theoretisch. Auf einer Reise von 14 Tagen kommt jeder
Wochentag zweimal.

**Warum das kein Widerspruch zum Grundsatz ist.** Die README sagt zu Recht:
„Was ‚Heute' **nicht** tut: behaupten, etwas habe gerade offen." Hier wird
auch nichts behauptet. Der umgekehrte Schluss ist der sichere: wo wörtlich
„Ruhetag Mittwoch" steht, ist der Ort mittwochs zu. Das ist dieselbe
Beweislast, die `hoursWindow()` schon trägt — lesen, was eindeutig dasteht,
und sonst nichts.

Und `moment` steht dem nicht im Weg. Die README hält ausdrücklich fest:
„`moment` kennt keine Wochentage", ein Abschnitt kommt nur hinein, wenn er an
**jedem Öffnungstag** gilt. Der Wochentag gehört also nicht in `moment`,
sondern in eine eigene Funktion — genau die fehlt.

**Umsetzung.**

1. `closedOn(hours)` neben `hoursWindow()`: liefert den Wochentagsindex oder
   `null`. Zwei Muster, mehr nicht — `/ruhetag\s+(montag|…)/i` und
   `/\b(Mo|Di|…)\s*(?:geschlossen|zu)\b/`. Alles Uneindeutige bleibt `null`.
2. In `todayList()` eine Stufe **vor** allen anderen: heute geschlossen →
   ganz nach hinten, so wie `fitsLeft` es mit dem Zuspäten macht. Nicht
   herausfiltern, damit die Liste nicht still schrumpft.
3. In `whyLine()` der Satz dazu, in der Sprache der bestehenden Zusätze:
   „heute Ruhetag".
4. In der Zeile und im Sheet eine Marke „heute zu" — die Öffnungskachel bleibt
   leer, wie sie es bei mehrdeutigen Zeiten schon tut.
5. Optional ein Filterchip „heute geöffnet" unter *Zustand*, mit derselben
   Ehrlichkeit wie „Zu Fuß": darunter die Zeile, wie viele Orte keine lesbare
   Angabe haben und deshalb bleiben.
6. Prüfstand: `closedOn` gegen alle 14 Schreibweisen, die wirklich
   vorkommen, plus die Gegenprobe an den 87 anderen.

**Kollision.** `app.js` im Bereich „Heute" und `scripts/test-logic.mjs`. Das
ist dieselbe Gegend, in der Schritt 4 des Redesigns (Segmentleiste,
Positionszähler) arbeiten wird, und die Prüfstand-Datei hat eine eigene Hand.
Vor dem Anfangen abstimmen; die Funktion selbst ist additiv und klein.

---

## 3. Termine kennt die App nur am Tag selbst

`runsToday()` erkennt Datumsbadges (`25.–27.09.`, `Di 22.09.`) — aber nur für
heute. Vier Orte tragen solche Termine:

| Ort | Termin |
|---|---|
| festa-castelnuovo | 18.–20.09. |
| mercato-desenzano | Di 22.09. |
| rievocazione | 25.–27.09. |
| visite-rocca | 26./27.09. |

Auf einer Reise mit Abfahrt am 28.09. ist „läuft heute" beim Wochenmarkt am
Dienstag zu spät: man packt keine Kühltasche mehr, wenn man morgens davon
liest. Die Rievocazione beschreibt sich selbst als „fotografisch das
ergiebigste Motiv der Woche" und braucht einen Vormittag Planung.

**Umsetzung.** `runsToday(p, now)` um einen Vorlauf erweitern —
`daysUntil(p, now)` mit demselben Regex, den es schon hat. In „Heute" eine
Zeile über dem Vorschlag, wenn innerhalb von drei Tagen etwas anfängt:
„In zwei Tagen: Rievocazione (25.–27.09.)". Ein Satz, keine neue Ansicht.

Dazu gehört ein wiederkehrender Termin, den heute nur der Fließtext trägt:
*Porta Brescia* — „Montags liegt hier der Wochenmarkt." Das ist ein
wöchentlicher Termin ohne Feld. Wenn Vorschlag 2 den Wochentag ohnehin
einführt, ist ein optionales `weekday`-Feld für solche Fälle die natürliche
Ergänzung — dann läuft der Markt jeden Montag statt einmal.

**Kollision.** Wie 2: „Heute"-Bereich. Gehört mit 2 in einen Zug.

---

## 4. `geo` liegt bei 78 Orten und wird von nichts gelesen

**Der Befund.** `app.js` erwähnt `geo` genau einmal — in `start()`, wo es
durchgereicht wird: `o.geo = o.geo || null;`. Sonst nirgends. 78 Koordinaten
plus `meta.base_geo` liegen ungenutzt in der Datei. Der Redesign-Vorschlag
verplant sie für die Wegwarnung im Plan-Tab, die README für die Karte — beides
noch offen, die Karte zusätzlich blockiert (`unpkg.com`,
`nominatim.openstreetmap.org` und `tile.openstreetmap.org` antworten in dieser
Umgebung weiterhin mit 403, heute nachgeprüft).

**Die Lücke dahinter.** Alle Entfernungen gelten „ab dem Zeltplatz". Das ist
die richtige Bezugsgröße für die Frage „gehen wir heute Abend hin?" — aber
man steht in diesen zwei Wochen oft woanders: in Sirmione, in Desenzano, auf
halbem Weg am Uferpfad. Dort sagt „22 Min zu Fuß" nichts über den Weg, den
man tatsächlich vor sich hat. Die Frage „was ist **hier** in der Nähe" kann
die App heute nicht beantworten, obwohl ihr dazu nichts fehlt außer zehn
Zeilen Haversine.

**Warum es zur App passt.** `navigator.geolocation` ist kein externer Dienst:
die Position kommt vom Gerät, funktioniert im Flugmodus, verlässt das Gerät
nicht und braucht kein Konto. Das ist derselbe Grundsatz, mit dem das Wetter
gefragt statt abgerufen wird.

**Umsetzung.**

1. Haversine gegen `meta.base_geo` — als reine Funktion exportierbar und
   damit im Prüfstand prüfbar.
2. Ein Knopf „Von hier aus" in der Filterzeile oder in „Heute". Erst auf Tipp
   wird gefragt; ohne Erlaubnis bleibt alles wie jetzt.
3. Mit Position: eine dritte Sortierung „von hier", und im Sheet eine Zeile
   „1,8 km Luftlinie von hier". **Keine** abgeleiteten Gehminuten — aus
   Luftlinie eine Gehzeit zu rechnen wäre geraten, und das tut diese App
   nicht.
4. Orte ohne `geo` fallen ans Ende, nicht als 0 nach vorn — wie `byDistance`
   es mit fehlenden Werten schon hält. Die Zählzeile sagt, wie viele das sind
   (23), in derselben Form wie beim Jum-Schalter.

**Kollision.** Klein. Gerätestandort kommt weder in der README noch im
Redesign-Vorschlag vor, ist also von niemandem belegt. Berührt wird der
Sortierknopf (dessen Umbau in v10 schon gelandet ist) und das Sheet. Wer
später die Karte oder den Plan-Tab baut, erbt die Haversine-Funktion, statt
sie ein zweites Mal zu schreiben.

---

## 5. „Meine ersetzen" ist unumkehrbar

`applyIncoming('replace')` überschreibt `S.saved` und `S.seen` vollständig und
schreibt sofort in den `localStorage`. Wer auf dem Telefon vierzehn Tage lang
markiert hat und beim Link der anderen Person einen Knopf zu weit rechts
trifft, verliert alles — ohne Rückfrage, ohne Rückweg.

Drei Knöpfe nebeneinander, von denen einer harmlos („Zusammenführen"), einer
destruktiv („Meine ersetzen") und einer folgenlos („Verwerfen") ist, sind
außerdem optisch gleichrangig gebaut.

**Umsetzung.** Vor dem Überschreiben eine Kopie in eine Variable, danach im
Hinweisstreifen für ein paar Sekunden „Rückgängig". Das ist ein halber
Bildschirm Code, kein neuer Zustand im Speicher. Zusätzlich könnte der
destruktive Knopf die Zahl nennen, die er kostet: „Meine 12 ersetzen".

**Kollision.** Sehr klein. Der Inbox-Code ist seit v7 unberührt.

---

## 6. Vierzehn Tage, aber kein Platz für eine eigene Zeile

Die App merkt sich zwei Bits je Ort: gemerkt, gesehen. Was auf einer Reise
wirklich anfällt, passt in keines davon — „Tisch Donnerstag 20 Uhr bestellt",
„Jum durfte doch mit rein", „Parkplatz war voll, mit dem Rad besser".

Besonders sichtbar wird das bei der Hundregel: bei 58 von 101 Orten ist sie
`null`, und die App sagt zu Recht „Nicht geklärt — vorher fragen". Nur: wer
gefragt hat, kann die Antwort nirgends hinschreiben. Am nächsten Tag steht
wieder „nicht geklärt".

**Umsetzung.** `pk.notes` als `{id: text}` im `localStorage`, ein einzeiliges
Feld im Sheet unter der Hundzeile, Anzeige in der Liste als drittes Zeichen
neben Stern und Haken. Im Teilen-Link ein weiteres Feld `n` — der Link wächst
dadurch, also nur die Orte mitschicken, die eine Notiz tragen.

Grenze: Notizen sind persönlich und gehören nicht in `places.json`. Wenn aus
einer Notiz eine Tatsache wird („Jum darf mit"), gehört sie in die Daten —
dafür genügt der bestehende Weg über die offenen Punkte.

**Kollision.** Mittel. Das Sheet ist frisch umgebaut (v11/v12) und der
Teilen-Link bekommt in Schritt 4 ohnehin ein Feld für die Reihenfolge. Beides
sollte in einem Zug passieren, nicht in zweien.

---

## 7. Das Manifest lässt zwei einfache Dinge liegen

`manifest.webmanifest` ist sauber, aber ohne `shortcuts` und ohne
`screenshots`.

- **`shortcuts`** — langes Drücken auf das Symbol am Homescreen: „Heute",
  „Gemerkt". Dafür muss die Ansicht aus der Adresse lesbar sein
  (`?v=gemerkt`), was heute nicht geht. Zwei Zeilen in `start()`.
- **`screenshots`** — sie bestimmen, wie der Installationsdialog aussieht.
  Die Bilder lassen sich in dieser Umgebung erzeugen, es gibt bereits einen
  Icon-Generator als Vorbild.

Nebenbei: `sw.js` legt in `SHELL` keine der Splash-Dateien ab — die sind mit
rund 130 kB zusammen aber auch verzichtbar, das ist Absicht und sollte es
bleiben.

**Kollision.** Sehr klein. `manifest.webmanifest` hat seit v1 niemand
angefasst; nur der Fassungssprung in `sw.js`/`app.js` ist wie immer
mitzuziehen.

---

## 8. Drei Kleinigkeiten

1. **Der Zähler am Chip „Noch nicht gesehen" zählt immer global.**
   `flagCount('unseen')` rechnet `D.places.length - S.seen.length`, auch im
   Reiter „Gemerkt", wo die Grundmenge die Merkliste ist. Bei 8 gemerkten
   Orten steht am Chip trotzdem „94". Die Kategorie- und Tag-Zähler haben
   dasselbe Verhalten. Entweder auf die aktuelle Grundmenge rechnen oder im
   Sheet dazuschreiben, dass die Zahlen sich auf alle 101 Orte beziehen.
2. **`#filter-count` wird laufend aktualisiert, ohne es anzusagen.** Die Zeile
   „7 Orte passen" ändert sich bei jedem Tipp im Sheet; ohne `aria-live` hört
   sie niemand. Die Zählzeile der Liste macht es mit `role="status"` schon
   richtig.
3. **Die Suche hebt nicht hervor, was sie gefunden hat.** Bei einem Treffer
   über `note` oder `address` sieht man den Namen und weiß nicht, warum der
   Ort dasteht. Ein `<mark>` um die Fundstelle im Notiztext kostet wenig —
   die Normalisierung in `norm()` macht die Stellensuche allerdings etwas
   mühsam, weil Diakritika die Indizes verschieben.

---

## Was hier bewusst nicht vorgeschlagen wird

| Nicht vorgeschlagen | Grund |
|---|---|
| **Karte mit Leaflet** | In der README als „offen" beschrieben und zweifach blockiert: `unpkg.com` und `tile.openstreetmap.org` sind aus dieser Umgebung nicht erreichbar (heute geprüft, 403), und 23 Orte haben kein `geo`, wofür Nominatim gebraucht würde — ebenfalls 403. |
| **Plan-Tab, Segmentleiste, Positionszähler, Wischen zwischen Tabs, Haptik** | Steht als Schritt 4 und Abschnitt 3.11 in `docs/redesign-vorschlag.md`. Gehört der Hand, die Schritte 1–3 gebaut hat. |
| **Weitere Typo-, Farb- und Badge-Arbeit** | In v8–v12 abgeschlossen. |
| **Gehzeiten aus der Luftlinie rechnen** | Bei 53 Orten fehlt `walk_min`, und aus Koordinaten ließe sich etwas ableiten — aber das wäre geraten. Die App zeigt lieber nichts, und das ist richtig so. Der ehrliche Weg ist, die 53 Werte nachzutragen. |
| **Laufende Synchronisierung über einen Dienst** | Steht in der README unter „Später angedacht" und widerspricht dem Grundsatz „kein Backend". |
| **Bilder zu den Orten** | Kostet Offline-Gewicht und ist für ein Nachschlagewerk nicht die knappe Ressource. |

---

## Umsetzungsstand

### Vorschlag 1 — umgesetzt in `v15`

`.github/workflows/pruefstand.yml`: `node scripts/test-logic.mjs` bei jedem
Push und jedem Pull Request. Kein `npm install`, keine Abhängigkeiten.

### Vorschlag 2 — umgesetzt in `v15`

| | v14 | v15 |
|---|---|---|
| Orte mit lesbarem Ruhetag in `hours` | 14 — von nichts gelesen | 14 — gelesen |
| Palazzina Storica, Mittwochmittag | Platz 2 von 41 | ans Ende sortiert, nicht mehr unter den drei gezeigten |
| S'Aligusta, Dienstagmittag | Platz 3 von 41 | ans Ende sortiert |
| Prüfungen im Prüfstand | 94 | 121 |

Gebaut wurde:

- `closedOn(hours)` neben `hoursWindow()` — Wochentagsindex wie
  `Date#getDay()` oder `null`. Zwei Muster: `Ruhetag <Wochentag>` und
  `<Mo|Di|…> geschlossen` / `<Mo|Di|…> zu`. Gelesen wird nur `hours`, nie
  `note`.
- `closedToday(p, datum)` — rechnet gegen ein übergebenes Datum, damit „Heute"
  nach 23 Uhr seinen Vorausblick auf morgen mitgeben kann und der Prüfstand
  nicht an sechs von sieben Tagen grün und am siebten rot ist.
- In `todayList()` eine Sortierstufe **vor** allen anderen. Nicht
  herausgefiltert — die Liste soll nicht still schrumpfen.
- In `whyLine()` der Grund, wenn ein geschlossener Ort doch erscheint:
  „— heute Ruhetag". Am Mittwochabend erreicht man Café Momus nach 30 Klicks
  auf „Anderer Vorschlag", und dann steht der Grund dabei.
- In der Faktenzeile und auf der Öffnungskachel ersetzt „heute zu" die
  Öffnungsangabe. Derselbe Slot, keine neue Zeilenhöhe; der volle Wortlaut
  bleibt im Sheet stehen.
- 23 neue Prüfungen, davon zehn Gegenproben: ein erfundener Ruhetag versteckt
  einen offenen Ort, und das fällt niemandem auf. Dazu ein Datenwächter —
  wer künftig „Ruhetag" oder „geschlossen" in `hours` schreibt, muss es
  lesbar schreiben, sonst schlägt der Prüfstand an.

Nicht gebaut: der optionale Filterchip „heute geöffnet". Er berührt die
Filterleiste, und die ist frisch umgebaut — der Gewinn rechtfertigt die
Kollision nicht.

### Ein Fehler, den erst der Merge erzeugt hat

Schritt 4 des Redesigns (`v14`, Tagesblatt und Plan) und dieser Zweig sind
gleichzeitig entstanden und im selben Bereich gelandet. Beide für sich waren
in Ordnung; zusammen nicht.

`smallHtml(p)` hat hier ein zweites Argument bekommen, das Bezugsdatum.
`v14` ruft die Funktion an zwei neuen Stellen als `.map(smallHtml)` auf — und
`Array#map` reicht als zweites Argument den **Index** durch. Bei Index 0 ging
das gut, weil 0 falsch ist und auf „heute" zurückfiel. Bei Index 1 warf
`closedToday` einen `TypeError` und nahm die ganze Heute-Ansicht mit. Der Weg
dorthin ist keiner der seltenen: Regen, Jum an, mindestens zwei Orte im
Trockenen.

Behoben an beiden Enden — die zwei Aufrufstellen reichen das Datum jetzt
ausdrücklich durch, und `closedToday` nimmt nur noch ein echtes `Date` an und
fällt bei allem anderen auf heute zurück. Dazu vier Prüfungen, die genau das
festhalten.

Geprüft: 121 Prüfungen im Prüfstand, dazu Chromium auf 390×844 mit gestellter
Uhr auf Mittwoch 12:30, Mittwoch 19:30 und Dienstag 12:30 — die
Gegenrichtung zählt mit, S'Aligusta verschwindet dienstags und steht
mittwochs wieder da. Der Regen-Leerzustand mit Jum ist eigens nachgestellt.

---

### Vorschlag 4 — umgesetzt in `v17`

| | v15 | v16 |
|---|---|---|
| Stellen, die `geo` lesen | 1 (Luftlinie im Plan) | 2 |
| Bezugspunkt für Entfernungen | immer der Zeltplatz | wahlweise der Gerätestandort |
| Prüfungen im Prüfstand | 121 | 131 |

Gebaut:

- `airKmPoint(a, b)` auf rohen `{lat, lon}`. Die vorhandene `airKm(a, b)` aus
  `v14` rechnet nicht mehr selbst, sondern reicht durch — eine zweite
  Haversine-Formel im selben Bündel wäre eine Stelle zu viel zum Auseinanderlaufen.
- `hereKm(p)` und `toggleHere()`. Gefragt wird erst auf Tippen, nie beim
  Start. `S.here` wird **nirgends gespeichert**: eine Position ist nach dem
  nächsten Spaziergang falsch, und eine falsche Entfernung ist schlechter als
  gar keine.
- Im Filter-Sheet die Gruppe „Standort" mit einem Knopf und einem Hinweis, der
  seinen Zustand nennt — inklusive der Auskunft, dass 23 Orte keine
  Koordinaten haben und dann hinten stehen. Dieselbe Ehrlichkeit, die „Zu Fuß"
  über seine 53 fehlenden Gehzeiten gibt.
- Im Kopf ein Chip mit Kreuz, wie bei jedem aktiven Filter — obwohl der
  Standort keiner ist: er blendet nichts aus und zählt deshalb nicht in
  `anyFilter()` mit, sonst stünde über der Liste „101 von 101 Orten".
- Faktenzeile und Öffnungskachel: die Luftlinie ab hier im **Weg-Slot**, nicht
  in einem zusätzlichen. Im Detail bleibt die Angabe ab dem Zeltplatz als
  eigene Zeile stehen, damit nichts verlorengeht.
- Aus der Luftlinie wird **nie** eine Gehzeit. Der Weg um ein Hafenbecken
  herum ist nicht die Strecke darüber.

Nachgerechnet mit einem Standort in Sirmione: vorn stehen Sirmione (286 m),
die Enoteca delle Antiche Mura und die Osteria Al Torcol — alle drei ohne
`walk_min`, alle drei 9 bis 13 km vom Zeltplatz und damit vorher weit hinten
in der Liste. Genau der Fall, für den der Vorschlag da war.

Zehn neue Prüfungen, darunter der von jeder Bibliothek unabhängige Prüfstein
(ein Grad Breite sind 111,2 km), die Symmetrie, `null` statt `0` bei fehlendem
Punkt — `0` hieße „hier" — und ein Datenwächter: kein `geo` darf weiter als
120 km Luftlinie vom Zeltplatz liegen. Ein umgefallenes Komma stellt einen Ort
sonst unbemerkt nach Afrika.

Geprüft: 131 Prüfungen, dazu Chromium auf 390×844 mit gestelltem Standort —
einschalten, sortieren, Detail, über das Kreuz wieder ausschalten, und der
Fall, dass der Browser den Standort verweigert.

---

### Vorschlag 5 — umgesetzt in `v19`

`applyIncoming('replace')` legt vor dem Überschreiben eine Kopie in eine
Modulvariable und bietet danach zehn Sekunden lang „Rückgängig" im selben
Kasten an — kein zweites Bedienmuster, kein neuer Zustand im `localStorage`
(nach dem Neuladen ist das Angebot ohnehin vorbei). Der destruktive Knopf
nennt seine Kosten („Meine 3 ersetzen") und trägt `btn--danger`: Ziegel als
Rand und Schrift, nicht als Fläche — gefüllt wäre er lauter als der
empfohlene Weg. Die Knopfreihenfolge ist jetzt empfohlen → folgenlos →
destruktiv.

Eine Falle steckte im Zusammenspiel: `setInert()` legt `#app` still, sobald
ein Sheet öffnet, und `#inbox` liegt darin. Ein offenes Angebot wäre sichtbar,
aber nicht mehr antippbar gewesen. `showSheet()` beendet es deshalb.

### Vorschlag 7 — umgesetzt in `v19`

`shortcuts` für „Heute" und „Plan", die über `?v=` in die Ansicht springen;
`start()` liest den Parameter und prüft ihn gegen `TABS`, damit eine getippte
Kennung keine leere App erzeugt. Ein Teilen-Link überstimmt das — `showInbox()`
läuft später und setzt auf „Orte".

`screenshots`: zwei Bilder, erzeugt von `scripts/make-screenshots.mjs` mit
fester Uhr (Mittwoch 12:30) und fester Fenstergröße, sonst rauscht jeder Lauf
einen Diff. Einfache Auflösung statt doppelter — 162 kB statt 378 bei einem
Dialog, der die Bilder klein zeigt. Nicht in `SHELL`: sie kosten sonst
Offline-Gewicht für etwas, das nur einmal vor der Installation zu sehen ist.

Neu dazu eine Prüfgruppe im Prüfstand: bis `v18` fasste **keine einzige**
Prüfung das Manifest an. Jetzt wird geprüft, dass jede genannte Bilddatei
existiert, dass `sizes` mit dem PNG-Kopf übereinstimmt und dass jeder
Kurzbefehl auf eine Ansicht zeigt, die es gibt.

### Vorschlag 8 — umgesetzt in `v19`

**8.1 (Chip-Zähler):** Die Beschreibung stimmt seit `v14` nicht mehr.
`render()` setzt `$('filters').hidden = bare || isPlan` — im Plan gibt es
keine Filterzeile, die Zähler werden dort nie gezeichnet, der Fehler ist nicht
erreichbar. Die Zusammenführung auf `grundmenge()` bleibt trotzdem: sie nimmt
die doppelte Pool-Logik aus `selected()` heraus und stimmt von selbst, falls
die Filter je zurückkehren. Eine Browser-Prüfung hält die Ausblendung fest —
verschwindet sie, kommt der Fehler zurück.

**8.2 (`aria-live`):** in `v19` gebaut, siehe eigener Abschnitt weiter oben im
Verlauf. Entscheidend war die Vorbedingung: `#filter-count` entsteht genau
einmal und wird danach nur über `textContent` beschrieben — ein Element, das
je Aktualisierung neu gebaut wird, sagt auch mit `aria-live` nichts an.

**8.3 (Suchtreffer):** `markiere()` setzt `<mark>` um jede Fundstelle in der
Notiz, in Liste und Detail. Die Vermutung im Vorschlag war richtig und der
Kern der Sache: `norm()` bildet **nicht** 1:1 ab — „Straße" wird „strasse",
ein Zeichen mehr. `normStellen()` normalisiert deshalb zeichenweise und merkt
zu jedem Zeichen, woher es kam. Escapen läuft **vor** dem Einsetzen von
`<mark>`, sonst bekäme eine Notiz eigenes HTML in die Seite; eine Gegenprobe
im Prüfstand hält das fest. `mark` trägt `color: inherit` — die
Browservorgabe (schwarz auf gelb) fiele im dunklen Schema auf 2,1:1.

---

## Vorgeschlagene Reihenfolge

1. **Vorschlag 1** sofort — er kostet zehn Minuten und schützt alle anderen.
2. **Vorschläge 2 und 3** zusammen, nach Absprache mit der Hand, die „Heute"
   umbaut. Der Wochentag ist die größte inhaltliche Lücke der App.
3. ~~**Vorschlag 4**~~ — erledigt in `v16`.
4. **Vorschläge 5, 7, 8** als kleine Züge nebenher.
5. **Vorschlag 6** zuletzt, gemeinsam mit dem Teilen-Link aus Schritt 4.

Offen sind damit: **3** (Termine mit Vorlauf), **5** („Meine ersetzen"
rückgängig), **6** (eigene Notiz je Ort), **7** (Manifest) und **8** (drei
Kleinigkeiten).
