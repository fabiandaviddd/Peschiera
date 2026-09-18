# Peschiera kompakt

Nachschlagewerk für Peschiera del Garda — Essen, Café, Sehen, Ausflüge,
Praktisches. Mobil-first, offline lauffähig, Hund (Jum) durchgängig als
Filterkriterium.

Vanilla HTML/CSS/JS. Kein Framework, kein Bundler, kein Build-Schritt —
GitHub Pages liefert das Repo unverändert aus.

## Was drin ist

| | |
|---|---|
| **PWA** | `manifest.webmanifest` + `sw.js`. App-Shell und `places.json` liegen im Cache, nach einmaligem Laden läuft alles offline — Merkliste inklusive. Auf dem iPhone-Homescreen installierbar, mit Icon und Startbild. |
| **Suche** | Ein Feld, Volltext über Name, Adresse, Notiz und Tags. Filtert bei jedem Tastendruck, kein Enter nötig. Diakritika werden normalisiert: „cafe" findet „Caffè", „strasse" findet „Straße". Mehrere Begriffe sind UND-verknüpft. Das Feld steht auch auf „Heute" — sonst ist von der Startansicht aus nicht zu sehen, dass hinter dem einen Vorschlag 101 Orte liegen. Hineingreifen wechselt in die Liste. |
| **Heute** | Startansicht statt Liste: Datum, Reisetag, Tagesabschnitt aus der Geräteuhr, ein Vorschlag mit Begründung aus den Daten — jeder Ort ist dafür von Hand einem Tagesabschnitt zugeordnet (`moment`), geraten wird nicht mehr —, zwei Alternativen, ein Knopf für den nächsten. Weiß sie nichts Passendes, sagt sie das und verweist auf die Liste. Das Wetter wird **gefragt**, nicht abgerufen — kein externer Dienst, offline unverändert; die Antwort hält einen Besuch lang (`sessionStorage`, `pk.wet`), damit man sie am Regentag nicht bei jedem Öffnen neu gibt. Ab 45 Minuten vor Ende eines Abschnitts zeigt sie den nächsten („Gleich: Abend"). |
| **Mit Jum** | Dauerschalter im Kopf, kein Chip: der Hund ist vierzehn Tage lang bei jeder Entscheidung dabei, also bleibt die Einstellung an. Persistenz über `localStorage` (`pk.jum`), unabhängig von „Filter zurücksetzen". Die Zählzeile sagt immer, wie viele Orte er gerade ausblendet. |
| **Filter** | Chip-Leiste, beliebig kombinierbar: Kategorie, „Zu Fuß" (`walk_min ≤ 25`), „Noch nicht gesehen", „Unter 1 h" (`time_min ≤ 60`). Aktive Chips sind alle seeblau — eine Aussage, eine Farbe. Innerhalb einer Gruppe ODER, zwischen den Gruppen UND. Am rechten Rand zeigt ein Verlauf, dass die Reihe weitergeht. |
| **Tags** | Über achtzig Stück — zu viele für eine Chip-Reihe. Sie liegen hinter dem Knopf „Tags" im selben Sheet, das auch den Ort zeigt, nach Häufigkeit sortiert und mit laufender Trefferzahl. |
| **Aufenthaltsdauer** | Auf jeder Karte kompakt (`3 h`, `45 Min`), im Detail die volle Textfassung („1–1,5 h, mit Museum 2 h"). |
| **Sortierung** | Entfernung (Standard) oder Bewertung. Orte ohne Wert stehen hinten, nicht vorne. |
| **Merkliste** | Stern auf jeder Karte, eigener Tab „Gemerkt" mit Zähler. Persistenz über `localStorage`, jeder Zugriff in try/catch. |
| **Schon gesehen** | Haken auf jeder Karte und im Detail. Gesehene Orte werden gedämpft dargestellt und tragen eine Marke; der Chip „Noch nicht gesehen" blendet sie aus. Der Chip hieß bis v7 „Noch offen" und wurde neben Fakten wie „öffnet 9:30" als Öffnungszeit gelesen. Eigener Speicher, unabhängig vom Merken. |
| **Teilen** | Im Tab „Gemerkt": ein Link, der Merkliste und Gesehenes enthält. Empfänger kann zusammenführen, ersetzen oder verwerfen. |
| **Liste** | Eine Zeile je Ort statt einer Karte: Haarlinie statt Kasten, kein Schatten, Notiz einzeilig gekürzt, Tags nur im Detail, Luftlinie nur im Detail. Die Zahl der Bewertungen bleibt neben der Note — „4,9" aus 71 Stimmen ist nicht dasselbe wie „4,9" aus 1087. Die farbige Kante links bleibt das Kategoriesignal. Auf 402×754 sind es 102 px je Zeile statt 228; Zeilen mit vollständigen Angaben brauchen 123. Steht „Mit Jum" an, entfällt die Marke „Jum ok" an jeder Zeile — sie gilt dann für alle. |
| **Detailansicht** | Bottom Sheet: Bewertung, Öffnungsinfo, Entfernung zu Fuß und mit dem Rad, Adresse, Telefon als `tel:`-Link, Hundregelung, Anfahrt, Notiz, Google-Maps-Link. Schließt per Backdrop, ✕, `Esc` oder Wischen nach unten. Solange es offen ist, liegt der Rest der Seite still: `inert` plus `aria-hidden`, dazu ein Tab-Ring im Sheet als Rückfallebene für Engines ohne `inert`. Ohne das führt `aria-modal` nur in die Irre — der Tabulator lief vorher hinter dem Sheet weiter durch die Liste. |
| **Info** | „Gut zu wissen" (die 17 Hinweise aus `merken`), „Offene Punkte" (die 18 aus `open_questions`, mit Telefonnummer als Link) und der Faktencheck (13 Korrekturen). |
| **Dark Mode** | Über `prefers-color-scheme`, mit manuellem Override. Der Knopf oben rechts schaltet automatisch → hell → dunkel. |
| **Farbe und Schrift** | Fünf Kategoriefarben, je eine pro Kategorie (`praktisch` hat seit v8 ein eigenes, entsättigtes Stein statt des Seeblaus der Ausflüge). Gold heißt Merkliste, Verde heißt Jum, Ziegel heißt Achtung, Seeblau heißt „hier ist etwas an". Sechs Schriftgrößen als Tokens (`--t-display` bis `--t-micro`); Versalien gibt es nur noch an drei Stellen, alle in „Heute". Alle Textfarben ≥ 4,5:1 in hell und dunkel, im gerenderten DOM gemessen. |

Keine Cookies, kein Tracking, keine externen Requests außer Google Fonts.

## Bedienung in zehn Sekunden

Den Schalter **Mit Jum** einmal anstellen — er bleibt an, auch nach dem
Schließen der App. Die Frage „wo essen wir heute, das nah ist, gut ist und wo
Jum mit darf?" kostet danach zwei Tipps: **Essen** → **Zu Fuß**. Sortierung auf
**Bewertung** umstellen, wenn die Entfernung nicht das Kriterium ist.

Stand 18.09.2026 ist `dog: true` bei 39 der 101 Orte gesetzt, `false` bei 4;
bei 58 ist die Regelung ungeklärt (`null`), und sie fallen aus dem Hundefilter
heraus. Das ist Absicht — lieber zu wenig anzeigen als falsch. Weil das mehr
als die Hälfte ist, schreibt die Zählzeile bei angeschaltetem Jum dazu, wie
viele Orte gerade ausgeblendet sind.

## Orte ergänzen oder ändern

Nur `data/places.json` anfassen, nichts im HTML oder JS. Ein Eintrag:

```json
{
  "id": "kurz-und-eindeutig",
  "name": "Name des Ortes",
  "category": "essen",
  "badge": "Der Abend",
  "note": "Ein oder zwei Sätze, die auf der Karte stehen.",
  "address": "Via Sebino 29, Peschiera del Garda",
  "phone": "+390457553227",
  "rating": 4.6,
  "reviews": 1015,
  "hours": "geöffnet bis 22:30",
  "walk_min": 18,
  "distance_km": 1.2,
  "bike_min": null,
  "dog": null,
  "tags": ["fisch", "gehoben"],
  "geo": null,
  "time_min": 150,
  "moment": ["abend"]
}
```

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig, wird für die Merkliste gespeichert — nicht nachträglich ändern |
| `category` | eine der `id`s aus `categories` am Dateianfang |
| `badge` | optionale Kuratierungsnotiz („Der Abend", „Für Jum", „Regentag") |
| `dog` | `true` = erlaubt, `false` = verboten, `null` = ungeklärt. Nur `true` erscheint im Hundefilter. |
| `walk_min` / `bike_min` / `distance_km` | ab dem Zeltplatz. `null`, wenn nicht sinnvoll messbar. |
| `time_min` | empfohlene Aufenthaltsdauer in Minuten, **ohne** An- und Abreise. Basis für den Filter „Unter 1 h" und für die Frage in „Heute", ob sich etwas vor dem Abend noch ausgeht. |
| `moment` | Liste aus `frueh`, `mittag`, `nachmittag`, `abend`, in Tagesreihenfolge. Steuert „Heute" und **schlägt die Herleitung immer** — auch als leere Liste: `[]` heißt „kein Tagesvorschlag" und ist die Angabe für Apotheke, Supermarkt, Radverleih, Bahnhof und Anleger. Fehlt das Feld ganz, wird hergeleitet (siehe unten); bei allen 101 Orten steht es, die Herleitung ist die Rückfallebene für neue Einträge. |
| `indoor` | `true` = man sitzt im Trockenen, `false` = fällt bei Regen aus, fehlend = ungeklärt. Bei „nass" schlägt „Heute" nur `true` vor und rät nie. Für `essen` und `cafe` gilt `true` als Regel (ein Lokal hat einen Innenraum) — reine Terrasse, Schiff oder Bastion brauchen deshalb ein ausdrückliches `"indoor": false`. |
| `time_label` | Textfassung, oft mit kurzer und langer Variante. Steht im Detail; die Karte zeigt die aus `time_min` abgeleitete Kurzform. |
| `rating` / `reviews` | Google-Stand, Datum steht in `meta.stand` und im Footer |
| `connection` | optional, erscheint im Sheet als „Anfahrt" |
| `geo` | `null` oder `{ "lat": …, "lon": … }` — siehe Karte unten |

Fehlende Felder sind unkritisch: leere Werte werden weggelassen statt mit
Platzhaltern gefüllt, `null` wird nie als 0 einsortiert.

### Woher „Heute" den Tagesabschnitt nimmt

Steht `moment` im JSON, gilt es. Sonst wird in dieser Reihenfolge hergeleitet:

1. `badge` — „Der Abend", „Früh morgens", „Nur mittags", „Sonnenuntergang",
   „Livemusik" und Verwandte sind eindeutig.
2. `hours`, soweit lesbar: Schluss ab 21:00 heißt Abend, Öffnung bis 8:30
   heißt Morgen, Öffnung ab 17:00 heißt ebenfalls Abend, ein Fenster über
   die Mittagszeit heißt Mittag.
3. Kategorie `cafe` → Morgen und Nachmittag.
4. `time_min ≥ 240` → Morgen, weil ein Tagesausflug früh beginnt.
5. Bleibt nichts übrig: `essen` gilt mittags und abends, `sehen` und
   `ausflug` in jedem hellen Abschnitt, `praktisch` gar nicht — eine
   Apotheke ist kein Tagesvorschlag.

Stand 18.09.2026 ist das nur noch die Rückfallebene für neue Einträge: alle
101 Orte tragen ein eingetragenes `moment`. Vorher liefen 38 über den
Rückfall — der einem Fischrestaurant mit Abendkarte den Mittag gab und einer
Cocktailbar den Morgen.

Eingeordnet wurde nach diesen Grundsätzen, nicht nach Kategorie:

- **Belegte Zeiten schlagen die Kategorie.** Steht nur „geöffnet bis 22:30",
  ist der Abend belegt und der Mittag nicht — dann steht auch nur `abend`.
  `mittag` steht nur dort, wo ein Mittagsfenster wirklich in `hours` steht.
- **`moment` kennt keine Wochentage.** Ein Abschnitt kommt nur hinein, wenn er
  an jedem Öffnungstag gilt. „Il Giardino delle Esperidi" hat werktags nur
  abends geöffnet und Sa/So auch mittags — es steht deshalb nur unter `abend`.
- **Draußen-Ziele bekommen kein `abend`.** Ein Uferweg um 22 Uhr ist kein
  Vorschlag. Ausnahme, wo es ausdrücklich dasteht: „Abendlicht",
  „Sonnenuntergang", „Livemusik".
- **Wandern und Rad meiden die Mittagshitze**, also `frueh` und `nachmittag`.
- **Tagesausflüge ab etwa 4,5 h nur `frueh`.** Ob sich etwas heute noch
  ausgeht, entscheidet danach `fitsLeft`, nicht diese Liste.

Damit sind die Abschnitte so besetzt: `frueh` 49 Orte, `mittag` 41,
`nachmittag` 48, `abend` 35. 13 Orte tragen `[]` — Tierarzt, Apotheke,
Supermarkt, Radverleih, Bahnhof, Anleger, Fischladen. Strand, Hundestrand
und Wochenmarkt sind dagegen echte Vorschläge, obwohl sie unter `praktisch`
stehen; die Kategorie allein entscheidet das nicht.

Mit angeschaltetem Jum bleiben `frueh` 27, `mittag` 20, `nachmittag` 21 und
`abend` nur 7 Orte. Das liegt nicht an der Einordnung, sondern an den 58
ungeklärten Hundregeln: von den Orten mit `dog: true` sitzt man nur in fünf
im Trockenen, alle fünf sind Lokale. Ein Regenmorgen mit Hund hat deshalb
nichts anzubieten — „Heute" sagt das dann auch. Am schnellsten hilft dort
eine geklärte Hundregel bei den vier Frühstückscafés (Dallazia, Pavòn, BASƎ,
Ammazza), bei denen sie bisher `null` ist.

`indoor` läuft in derselben Reihenfolge: ausdrücklicher Wert, Badge
„Regentag", die Tags `museum`, `kirche`, `supermarkt`, `notfall`, `regen`,
dann die Kategorieregel für `essen` und `cafe`, erst danach die Außen-Tags
(`strand`, `natur`, `rad`, `markt` und Verwandte). Die Reihenfolge ist
wichtig: `wasser` an einem Restaurant heißt „liegt am See", nicht „man
sitzt im Regen". Damit gelten 44 Orte als drinnen und 40 als draußen; offen
bleiben 17, fast alle Ausflüge.

Die Kategorieregel ist eine Regel, keine Wahrheit: ein Lokal ohne Innenraum
braucht ein ausdrückliches `"indoor": false`. Bisher ist das genau ein Fall,
**7 Ponti** — die Bar liegt draußen an den Bastionen.

Diese Zahlen stehen nicht von Hand hier, sie kommen aus
`node scripts/test-logic.mjs` (siehe „Prüfen").

Ein Ort mit „ungeprüft" oder „unbestätigt" in `hours` und die Badges
„Zeiten prüfen" und „Erst anrufen" werden nie als erster Vorschlag gezeigt,
sondern nach hinten sortiert und mit dem Hinweis „Zeiten ungeprüft, vorher
anrufen" versehen. Badges mit Datum („18.–20.09.") gelten als Termin: fällt
heute hinein, steht der Ort oben und trägt „läuft heute".

Was „Heute" **nicht** tut: behaupten, etwas habe gerade offen. `hours` ist
Freitext und fehlt bei knapp der Hälfte. Abgeleitet wird daraus nur
„schließt in weniger als 30 Minuten" — und das nur, wenn eine Uhrzeit
dasteht.

`merken[]` und `open_questions[]` dürfen Objekte (`{title, text}` bzw.
`{topic, status, contact}`) und blanken Text gemischt enthalten. Bei blankem
Text in `open_questions[]` wird eine enthaltene Telefonnummer automatisch
anklickbar.

Nach einer Änderung an einer Datei **`CACHE` in `sw.js` hochzählen** und
`VERSION` in `app.js` mitziehen — beide müssen zusammenpassen. Vergisst man
das, fällt es nicht mehr still durch: `node scripts/test-logic.mjs` vergleicht
beide Stellen, und die App fragt den Service Worker beim Start nach seinem
Cache-Namen. Weichen sie ab, steht das als Warnung im Footer statt in keiner
Konsole.

Die App aktualisiert sich danach selbst: übernimmt eine neue Fassung die
Steuerung, lädt die Seite einmal neu. Beim Zurückholen in den Vordergrund wird
zusätzlich nach Updates gesehen. Zweimal von Hand neu laden ist nicht mehr
nötig.

Welche Fassung tatsächlich läuft, steht im Footer der App und im Bericht von
`selbsttest.html`. Das beantwortet die Frage „alter Stand im Offline-Speicher
oder echter Fehler?" eindeutig.

## Prüfen

Was Freitext liest, liegt bei neuen Daten still falsch: Öffnungszeiten,
Termine im Badge, der Reisezeitraum im Untertitel. Kein Fehler in der Konsole,
nur schlechtere Vorschläge. Dafür gibt es einen Prüfstand ohne Browser und
ohne Build:

```bash
node scripts/test-logic.mjs
```

Er prüft `hoursWindow`, `momentsOf`, `momentNow`, `runsToday`, `tripDay`,
`unverified`, `closingSoon`, `fitsLeft`, `indoorOf` und die Formatierer gegen
die Schreibweisen, die in den Daten wirklich vorkommen — und dazu
`places.json` selbst: eindeutige `id`s, bekannte Kategorien, `dog` nur
`true`/`false`/`null`, `moment` nur aus den vier Abschnitten, Zahlenfelder als
Zahlen, jeder Kategorie-Akzent mit passender `.acc-`Regel in `style.css`,
jede Datei aus `SHELL` vorhanden und `CACHE` wie `FONTS` gleich `VERSION`. Am
Ende stehen die Zahlen, die auch in dieser README vorkommen — abgeschrieben
veralten sie, gerechnet nicht.

`app.js` bleibt dafür eine Datei ohne Build: am Ende reicht sie ihre reinen
Helfer an `module.exports` weiter, was es im Browser nicht gibt. Dort passiert
an der Stelle nichts.

## Lokal testen

Im Projektordner:

```bash
python3 -m http.server 8000     # http://localhost:8000
```

Ein Server ist nötig, weil Browser das Lesen lokaler Dateien über `file://`
einschränken: **Safari** liest `data/places.json` per XHR meistens auch
direkt vom Dateisystem, **Chrome** blockiert es grundsätzlich. Die App fängt
das ab und zeigt statt eines Konsolenfehlers einen Hinweis mit genau diesem
Befehl. Der Service Worker registriert sich nur über `http`/`https`, offline
testen geht also nur über den Server.

## Deployment

GitHub Pages, Branch `main`, Ordner `/`. Kein Build.

```bash
git add -A && git commit -m "…" && git push
```

## Was für iOS Safari angepasst ist

Safari verhält sich an mehreren Stellen anders als die Engine, in der hier
getestet wird. Diese Punkte sind gezielt behandelt:

| Eigenheit | Behandlung |
|---|---|
| Nach `preventDefault()` auf `touchmove` liefert Safari keinen Klick mehr | Berührungen, die auf einem Bedienelement beginnen, starten keine Wischgeste; Schwelle 12 px statt 6 px |
| `overflow: hidden` hält den Hintergrund nicht fest | `body` wird bei offenem Sheet fixiert, Scrollposition gemerkt und wiederhergestellt |
| Wartezeit auf einen möglichen Doppeltipp, graues Aufblitzen | `touch-action: manipulation` und `-webkit-tap-highlight-color: transparent` auf allen Bedienelementen |
| Bei offener Tastatur kleben fixierte Elemente am sichtbaren Ausschnitt | Die Tableiste fährt weg, solange im Suchfeld getippt wird |
| `100vh` rechnet die Adressleiste mit | `dvh` mit `vh` als Rückfallebene |
| Langes Drücken öffnet die Textauswahl | `-webkit-touch-callout: none` auf der Kartenfläche |
| Eingabefelder unter 16 px lösen Zoom aus | Suchfeld auf `1rem` |
| Randbereiche bei randlosem Bildschirm | `viewport-fit=cover` plus `env(safe-area-inset-*)` in Kopf, Tableiste und Sheet |
| `color-mix()` erst ab Safari 16.4 | Fokusring hängt nicht mehr daran |
| `-webkit-overflow-scrolling: touch` hebt den Container auf eine eigene Ebene und macht darüberliegende Knöpfe untippbar | Entfernt (seit iOS 13 ohnehin wirkungslos); das ✕ liegt zusätzlich mit eigenem `z-index` darüber |
| Runde Knöpfe verschenken die Ecken ihrer Trefferfläche | Das ✕ ist ein abgerundetes Quadrat, alle 44×44 px treffen |

Nicht behandelbar von hier aus: Safari räumt bei Websites, die längere Zeit
nicht benutzt werden, den Offline-Speicher und `localStorage` weg. Bei
täglicher Nutzung im Urlaub kein Thema; nach Wochen Pause kann die Merkliste
weg sein.

## Listen zwischen zwei Geräten abgleichen

Es gibt keinen Server — die Markierungen liegen nur im jeweiligen Browser.
Der Abgleich läuft deshalb über den Link selbst: im Tab „Gemerkt" auf
**Teilen**, dann per iMessage, AirDrop oder sonstwie verschicken. Wo die
Teilen-Funktion des Systems fehlt, landet der Link in der Zwischenablage.

Der Link trägt Merkliste und Gesehenes als `#liste=<base64url>` mit, rund
120 Zeichen bei einer Handvoll Orte. Nichts verlässt das Gerät, außer über
diesen Link.

Beim Öffnen fragt die Gegenseite nach:

- **Zusammenführen** — eigene Markierungen bleiben, fremde kommen dazu
- **Meine ersetzen** — übernimmt die fremde Liste vollständig
- **Verwerfen** — ändert nichts

Danach wird der Anker aus der Adresse entfernt, ein Neuladen fragt also nicht
erneut. Orte, die es in `places.json` nicht (mehr) gibt, werden übersprungen
und im Hinweis mitgezählt. Ein beschädigter Link wird ignoriert.

Das ist ein Abgleich auf Zuruf, keine laufende Synchronisierung: wer später
etwas markiert, muss neu teilen. Für echte Synchronisierung bräuchte es einen
Dienst dazwischen — siehe unten.

## Auf dem iPhone prüfen

Die Entwicklungsumgebung hat kein iOS und kein Safari — getestet wird in
Chromium. Genau dort fällt eine Fehlerklasse durch: Chromium unterdrückt
kleine `touchmove`-Ereignisse, iOS Safari liefert sie aus. So ist der Fehler
entstanden, bei dem sich das Detailfenster nur durch Wischen schließen ließ.

Deshalb liegt `selbsttest.html` daneben. Auf dem iPhone öffnen:

```
https://<deine-pages-url>/selbsttest.html
```

Zweimal tippen, einmal wischen, „Ergebnis kopieren" — der Bericht enthält den
gemessenen Fingerwackler, ob der Klick nach einem `preventDefault()` noch
ankommt, die tatsächlichen Safe-Area-Werte, `100dvh`, den Zustand von Service
Worker und `localStorage` sowie die geladenen Schriften. Das sind die Zahlen,
die sich hier nicht ermitteln lassen.

Die Seite gehört nicht zur App, ist aus ihr nicht verlinkt und stört nichts.

## Später angedacht

- **Laufende Synchronisierung** statt Teilen auf Zuruf. Bräuchte einen Dienst
  dazwischen (etwa Supabase) und damit ein Backend — entgegen dem bisherigen
  Grundsatz, und es muss bei schlechtem Netz trotzdem offline funktionieren.
- **Tagesrouten**: Orte einem Datum zuordnen, eigener Reiter, Sortierung nach
  kürzester Runde ab dem Zeltplatz. Setzt die Koordinaten voraus (siehe unten),
  weil sich sonst keine Entfernungen zwischen zwei Orten rechnen lassen.

## Karte (offen)

Vorgesehen ist ein Tab „Karte" mit Leaflet und OpenStreetMap-Tiles, Marker in
den Kategoriefarben, Hundefilter live auf den Markern und Marker-Tap öffnet das
bestehende Sheet. Dafür fehlen noch zwei Dinge:

**1. Koordinaten.** Stand 18.09.2026 tragen 78 der 101 Orte ein `geo`, bei 23
steht noch `null`. Zur Laufzeit wird nie geocodiert — die Werte werden
einmalig nachgetragen. Zwei Wege:

**Ohne Terminal:** `koordinaten.html` im Browser öffnen, auf *Starten* tippen,
warten, *Datei herunterladen* — die geladene `places.json` ersetzt die alte.
Die Seite hält das Limit von einer Anfrage pro Sekunde ein, speichert laufend
mit und macht nach einem Abbruch dort weiter, wo sie war.

**Mit Terminal:** dasselbe als Skript.

```bash
node scripts/add-coords.mjs --dry     # zeigt nur, was passieren würde
node scripts/add-coords.mjs           # schreibt geo in places.json
```

Es hält Nominatims Limit von einer Anfrage pro Sekunde ein, schickt einen
eigenen User-Agent, probiert pro Ort mehrere Schreibweisen (Adresse → Adresse
ohne Hausnummer → Name plus Ort) und überspringt alles, wo `geo` schon steht.
Läuft also beliebig oft. Für die verbleibenden 23 Orte ist es eine halbe
Minute. Was es nicht findet, listet es am Ende auf — das von Hand aus Google
Maps nachtragen.

**2. Leaflet lokal.** Kein CDN zur Laufzeit, die Dateien gehören ins Repo:

```bash
mkdir -p vendor
curl -Lo vendor/leaflet.js  https://unpkg.com/leaflet@1.9.4/dist/leaflet.js
curl -Lo vendor/leaflet.css https://unpkg.com/leaflet@1.9.4/dist/leaflet.css
curl -Lo vendor/marker-shadow.png https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png
```

Beides musste lokal passieren: in der Umgebung, in der diese Version gebaut
wurde, sind `nominatim.openstreetmap.org`, die CDNs und
`tile.openstreetmap.org` durch die Egress-Policy gesperrt.

## Icons neu erzeugen

Motiv ist das Fünfeck der venezianischen Festung mit einer Wellenlinie.
Die PNGs liegen fest im Repo, das Skript ist nur zum Reproduzieren:

```bash
pip install Pillow
python3 scripts/make-icons.py
```

## Dateien

```
index.html              Shell
selbsttest.html         Diagnoseseite für echte Geräte (nicht Teil der App)
koordinaten.html        Einmalige Koordinatensuche im Browser (nicht Teil der App)
style.css               Tokens, Light und Dark, Layout
app.js                  Laden, Zustand, Filter, Sortierung, Sheet, Merkliste
sw.js                   Service Worker: App-Shell, places.json, Google Fonts
manifest.webmanifest
data/places.json        Alle Inhalte
icons/                  App-Icons und iOS-Startbilder
scripts/test-logic.mjs  Prüfstand für die Freitext-Logik und die Daten (node)
scripts/add-coords.mjs  einmaliges Geocoding für die Karte
scripts/make-icons.py   Icon-Generator
```

## Getestet

80 Browser-Checks in Chromium auf iPhone-Viewport (390×844): Suche, Filter und
Sortierung kombiniert, Merkliste über einen Reload, Detail-Sheet ohne
Layout-Shift, Dark Mode samt Override und Systempräferenz, Touch-Ziele,
Flugmodus-Test (offline laden, suchen, Merkliste), Fehlerzustand mit Retry und
der `file://`-Fall. Google Fonts waren in der Build-Umgebung nicht erreichbar —
die Fallback-Stacks (Georgia, `system-ui`) sind geprüft, Fraunces und Karla
selbst nicht.

Alle Angaben ohne Gewähr. Bewertungen und Öffnungsstatus sind Google-Stände vom
17.09.2026, Fahrpläne und Preise von Trenitalia, Navigazione Laghi, ATV und den
offiziellen Seiten.
