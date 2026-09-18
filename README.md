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
| **Suche** | Ein Feld, Volltext über Name, Adresse, Notiz und Tags. Filtert bei jedem Tastendruck, kein Enter nötig. Diakritika werden normalisiert: „cafe" findet „Caffè", „strasse" findet „Straße". Mehrere Begriffe sind UND-verknüpft. |
| **Filter** | Chip-Leiste, beliebig kombinierbar: Kategorie, „Hund erlaubt" (`dog: true`), „Zu Fuß" (`walk_min ≤ 25`), Tags. Innerhalb einer Gruppe ODER, zwischen den Gruppen UND. |
| **Sortierung** | Entfernung (Standard) oder Bewertung. Orte ohne Wert stehen hinten, nicht vorne. |
| **Merkliste** | Stern auf jeder Karte, eigener Tab „Gemerkt" mit Zähler. Persistenz über `localStorage`, jeder Zugriff in try/catch. |
| **Schon gesehen** | Haken auf jeder Karte und im Detail. Gesehene Orte werden gedämpft dargestellt und tragen eine Marke; der Chip „Noch offen" blendet sie aus. Eigener Speicher, unabhängig vom Merken. |
| **Teilen** | Im Tab „Gemerkt": ein Link, der Merkliste und Gesehenes enthält. Empfänger kann zusammenführen, ersetzen oder verwerfen. |
| **Detailansicht** | Bottom Sheet: Bewertung, Öffnungsinfo, Entfernung zu Fuß und mit dem Rad, Adresse, Telefon als `tel:`-Link, Hundregelung, Anfahrt, Notiz, Google-Maps-Link. Schließt per Backdrop, ✕, `Esc` oder Wischen nach unten. |
| **Info** | „Gut zu wissen" (die 9 Hinweise aus `merken`), „Offene Punkte" (die 8 aus `open_questions`, mit Telefonnummer als Link) und der Faktencheck. |
| **Dark Mode** | Über `prefers-color-scheme`, mit manuellem Override. Der Knopf oben rechts schaltet automatisch → hell → dunkel. |

Keine Cookies, kein Tracking, keine externen Requests außer Google Fonts.

## Bedienung in zehn Sekunden

Die Frage „wo essen wir heute, das nah ist, gut ist und wo Jum mit darf?"
beantwortet man mit drei Tipps: **Essen** → **Hund erlaubt** → **Zu Fuß**.
Übrig bleibt die Osteria Rivelin. Sortierung auf **Bewertung** umstellen, wenn
die Entfernung nicht das Kriterium ist.

Stand 17.09.2026 ist `dog: true` nur bei 21 der 54 Orte gesetzt; bei 32 ist die
Regelung ungeklärt (`null`) und sie fallen aus dem Hundefilter heraus. Das ist
Absicht — lieber zu wenig anzeigen als falsch.

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
  "geo": null
}
```

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig, wird für die Merkliste gespeichert — nicht nachträglich ändern |
| `category` | eine der `id`s aus `categories` am Dateianfang |
| `badge` | optionale Kuratierungsnotiz („Der Abend", „Für Jum", „Regentag") |
| `dog` | `true` = erlaubt, `false` = verboten, `null` = ungeklärt. Nur `true` erscheint im Hundefilter. |
| `walk_min` / `bike_min` / `distance_km` | ab dem Zeltplatz. `null`, wenn nicht sinnvoll messbar. |
| `rating` / `reviews` | Google-Stand, Datum steht in `meta.stand` und im Footer |
| `connection` | optional, erscheint im Sheet als „Anfahrt" |
| `geo` | `null` oder `{ "lat": …, "lon": … }` — siehe Karte unten |

Fehlende Felder sind unkritisch: leere Werte werden weggelassen statt mit
Platzhaltern gefüllt, `null` wird nie als 0 einsortiert.

Nach einer Änderung an einer Datei **`CACHE` in `sw.js` hochzählen** und
`VERSION` in `app.js` mitziehen — beide müssen zusammenpassen.

Die App aktualisiert sich danach selbst: übernimmt eine neue Fassung die
Steuerung, lädt die Seite einmal neu. Beim Zurückholen in den Vordergrund wird
zusätzlich nach Updates gesehen. Zweimal von Hand neu laden ist nicht mehr
nötig.

Welche Fassung tatsächlich läuft, steht im Footer der App und im Bericht von
`selbsttest.html`. Das beantwortet die Frage „alter Stand im Offline-Speicher
oder echter Fehler?" eindeutig.

## Lokal testen

```bash
cd ~/Sites/peschiera-kompakt
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

**1. Koordinaten.** In `places.json` ist `geo` überall `null`. Das Skript trägt
sie einmalig nach — zur Laufzeit wird nie geocodiert:

```bash
node scripts/add-coords.mjs --dry     # zeigt nur, was passieren würde
node scripts/add-coords.mjs           # schreibt geo in places.json
```

Es hält Nominatims Limit von einer Anfrage pro Sekunde ein, schickt einen
eigenen User-Agent, probiert pro Ort mehrere Schreibweisen (Adresse → Adresse
ohne Hausnummer → Name plus Ort) und überspringt alles, wo `geo` schon steht.
Läuft also beliebig oft. 54 Orte brauchen ein paar Minuten. Was es nicht
findet, listet es am Ende auf — das von Hand aus Google Maps nachtragen.

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
style.css               Tokens, Light und Dark, Layout
app.js                  Laden, Zustand, Filter, Sortierung, Sheet, Merkliste
sw.js                   Service Worker: App-Shell, places.json, Google Fonts
manifest.webmanifest
data/places.json        Alle Inhalte
icons/                  App-Icons und iOS-Startbilder
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
