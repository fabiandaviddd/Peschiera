# Übergabe — Peschiera kompakt

Für den nächsten, der hier weiterarbeitet. Stand `v17`, 18.09.2026.

Geschrieben von der Sitzung, die den UI/UX-Audit gemacht und die vier
Schritte des Redesigns umgesetzt hat (`session_01XKR7hXRNhF2Y23GAgwp8Uf`).
Am Repo haben mindestens **vier Sitzungen parallel** gearbeitet — die
`Claude-Session`-Zeilen in den Commits nennen sie. Das ist die wichtigste
Eigenschaft dieses Projekts und der Grund für die meisten Fallen weiter
unten.

---

## 1. Was hier steht

Ein Nachschlagewerk für einen Urlaub in Peschiera del Garda: 101 Orte,
mobil-first, offline lauffähig, ein Hund namens Jum als durchgängiges
Filterkriterium. Vanilla HTML/CSS/JS, **kein Framework, kein Bundler, kein
Build-Schritt** — GitHub Pages liefert das Repo unverändert aus.

```
index.html          146 Zeilen   Shell
app.js             2375 Zeilen   Laden, Zustand, Filter, Sheet, Heute, Plan
style.css           993 Zeilen   Tokens, Light/Dark, Layout
sw.js               147 Zeilen   Service Worker
data/places.json   3139 Zeilen   alle Inhalte
scripts/test-logic.mjs  391      Prüfstand, 94 Prüfungen, ohne Browser
selbsttest.html                  Diagnoseseite für echte Geräte
koordinaten.html                 einmalige Koordinatensuche
docs/redesign-vorschlag.md       Audit + die vier Schritte + Umsetzungsstand
docs/koordinaten-pruefliste.md   Regeln der Geocodierung
```

Der **Default-Branch ist `claude/peschiera-kompakt-v2-vqzy9s`**, nicht
`main` — ein `main` existiert nicht. Die README behauptet an einer Stelle
noch das Gegenteil (siehe offene Punkte).

---

## 2. Die Regeln des Hauses

Halte dich daran, auch wenn du es anders gewohnt bist. Das Projekt ist an
diesen Punkten konsequent, und die Konsequenz ist sein Wert.

**Datenehrlichkeit.** `null` wird nie als 0 einsortiert. Es wird nie
behauptet, etwas habe gerade geöffnet — `hours` ist Freitext und fehlt bei
47 von 101 Orten. Abgeleitet wird daraus nur „schließt gleich", und auch das
nur, wenn eine Uhrzeit dasteht. Leerzustände sagen, *warum* sie leer sind,
und wenn möglich, was stattdessen geht.

**Was ein Filter kostet, steht dabei.** Der Jum-Schalter blendet 58 von 101
Orten aus; die Zählzeile sagt das. „Zu Fuß" verliert 53 Orte ohne
`walk_min`; das Filter-Sheet sagt das. Wer einen neuen Filter baut, schreibt
dazu, wen er stillschweigend verliert.

**Alles auf Deutsch.** Commits, Codekommentare, README, PR-Texte.
Umlaute in Commit-Nachrichten werden umschrieben (`ae`, `oe`, `ue`, `ss`),
in Code und Doku nicht.

**Kommentare sagen warum, nicht was.** Und sie nennen die verworfene
Alternative samt Zahl. Beispiel aus `style.css`:

> *Die Dämpfung läuft über den Rahmen, nicht über die Textdeckkraft:
> opacity .55 hätte den Kontrast auf 2,48:1 gedrückt, und das an einem
> Bedienelement.*

**Keine Laufzeit-Requests.** Einzige externe Quelle ist Google Fonts. Keine
Karten-Tiles, kein Geocoding zur Laufzeit, kein Tracking, keine Cookies.

**Touch-Ziele ≥ 44 px, Kontrast ≥ 4,5:1** in hell und dunkel.

---

## 3. Die Fallen

Das ist der eigentliche Wert dieser Übergabe. Jede davon hat jemanden Zeit
gekostet.

### 3.1 Die Basis wandert, während du arbeitest

Mehrere Sitzungen zweigen gleichzeitig von demselben Stamm ab. In dieser
Sitzung ist die Basis **zwischen Abzweig und PR viermal weitergezogen**.
Rechne fest damit:

- Vor dem PR die Basis nachziehen und die Konflikte lösen.
- Nach dem Merge nicht auf dem alten Branch weiterbauen, sondern frisch
  von der Basis abzweigen.
- Zwei Zweige haben **dreimal unabhängig dieselbe Versionsnummer vergeben**
  (v8, v11, v13). Siehe 3.3.

### 3.2 Doppelte JSON-Schlüssel verlieren still Daten

Der teuerste Fehler des Projekts. Beide Seiten eines Merges hatten bei
demselben Ort ein `moment` eingefügt, an verschiedenen Stellen im Objekt.
Nach dem Merge trug der Ort **zwei `moment`-Schlüssel**. `JSON.parse` nimmt
kommentarlos den letzten — aus `["nachmittag","abend"]` wurde `["abend"]`,
und die Datei las sich vollkommen sauber.

Aufgefallen ist das nur, weil eine Kennzahl um 1 fiel und jemand die Werte
gegen den Stand *vor* dem Merge verglichen hat, statt dem Merge zu glauben.

`scripts/test-logic.mjs` scannt seitdem den **Rohtext** auf doppelte
Schlüssel je Objekt, nicht nur das geparste Ergebnis. Nimm diese Prüfung
nie heraus.

### 3.3 `CACHE`, `VERSION` und `FONTS` müssen zusammen wandern

`app.js` trägt `VERSION`, `sw.js` trägt `CACHE` und `FONTS`. Der Prüfstand
vergleicht `CACHE` gegen `VERSION`. **Diese Prüfung fängt den gefährlichsten
Fall nicht:** wenn beide Zweige unabhängig auf dieselbe Nummer gezählt
haben, passt sie zusammen, aber der Merge trägt einen dritten Inhalt — und
ein Client mit der alten Nummer im Cache bekommt nichts Neues.

**Regel: bei einem Merge über beide Seiten hinaus hochzählen.** Zweimal v13
ergibt v14, nicht v13.

### 3.4 Kontrast messen ist schwerer, als es aussieht

Zwei Messfehler in einer Sitzung, beide mit demselben Muster — das Skript
misst Textfarbe gegen Hintergrundfarbe und ignoriert eine Ebene dazwischen:

- **`--wash` ist `rgba(32,32,28,.045)`**, also halbtransparent. Wer die
  RGB-Werte als deckend liest, misst dunkle Schrift gegen „dunkel" und
  bekommt 1,0:1 — scheinbar unsichtbaren Text, der in Wahrheit gut lesbar
  ist. Halbtransparente Flächen müssen über den Untergrund gelegt werden.
- **`opacity` auf dem Element** geht in die Messung gar nicht ein. Ein
  `opacity: .55` auf grauem Text ergibt effektiv **2,48:1** statt der
  gemessenen 6,86:1. Bei Bedienelementen ist das ein echter Mangel.

Wenn du Kontrast prüfst: Alpha überlagern, `opacity` gesondert
durchrechnen, und im Zweifel nicht mit `opacity` dämpfen, sondern mit einer
geprüften Farbe oder über den Rahmen.

### 3.5 `onTap` reicht sein Event durch

`onTap(node, fn)` ruft `fn(e)` auf. Jede Funktion, die du dort übergibst,
bekommt also ein Event als erstes Argument. `closeSheet(fromPop)` hat
deshalb **`fromPop === true`** zu prüfen — als truthy hätte das Event den
Verlaufseintrag stehen lassen und die Zurück-Geste getötet.

### 3.6 `hoursWindow()` liest notfalls das erste Zeitfenster

Bei `"Mi–Sa 12:30–14 und 19:30–22"` liefert sie `close = 14:00`. Das ist für
„schließt gleich" vertretbar, aber **niemals als eigenständige Aussage
zeigen** — „bis 14:00" über einem Restaurant, das abends bis 22 Uhr offen
hat, ist schlicht falsch. Die Öffnungs-Kachel im Sheet benutzt deshalb einen
strengeren eigenen Leser (`hoursShort()`), der nur ein ausgeschriebenes
„bis" oder „ab" akzeptiert: 22 der 54 Angaben.

### 3.7 iOS Safari ist von hier aus nicht prüfbar

Getestet wird in Chromium. **Chromium unterdrückt kleine
`touchmove`-Ereignisse, iOS Safari liefert sie aus** — so ist schon einmal
ein Gesten-Fehler durchgerutscht, bei dem sich das Sheet nur noch durch
Wischen schließen ließ.

Deshalb wurden in dieser Sitzung zwei Gesten bewusst *nicht* gebaut
(Wischen für „gesehen", Ziehen im Plan) und durch Knöpfe ersetzt. Halte es
genauso, solange niemand auf einem Gerät prüfen kann.

`selbsttest.html` ist die Diagnoseseite dafür. Sie gehört nicht zur App und
ist aus ihr nicht verlinkt.

### 3.8 Die Egress-Policy blockt einiges

In dieser Umgebung nicht erreichbar: `fonts.googleapis.com`,
`fabiandaviddd.github.io`, `nominatim.openstreetmap.org`, die CDNs,
`tile.openstreetmap.org`.

**Konsolenfehler von Google Fonts sind hier erwartbar, kein Bug.** Die
Fallback-Stacks (Georgia, `system-ui`) sind geprüft; Fraunces und Karla
selbst hat noch nie jemand hier gesehen.

---

## 4. Wie man hier arbeitet

**Vor jedem Push:**

```bash
node scripts/test-logic.mjs      # 94 Prüfungen, kein Browser, kein Build
node --check app.js && node --check sw.js
python3 -c "import json; json.load(open('data/places.json'))"
```

Der Prüfstand lädt `app.js` mit node. Dafür reicht die Datei am Ende ihre
reinen Helfer an `module.exports` und kehrt um — im Browser gibt es kein
`module`, dort passiert das nicht. Wenn du einen Helfer prüfbar machen
willst, trag ihn dort ein.

**Lokal ansehen:**

```bash
python3 -m http.server 8000      # ein Server ist nötig, file:// reicht nicht
```

**Im Browser prüfen:** Playwright liegt bereit, die Chromium-Binary unter
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` — **nicht** unter
`/opt/pw-browsers/chromium/`, das läuft ins Leere. Viewport 402×754 ist das
Referenzformat (iPhone). Immer hell *und* dunkel ansehen.

**Beim Ändern von Dateien** `CACHE` und `FONTS` in `sw.js` und `VERSION` in
`app.js` gemeinsam hochzählen. Die App lädt sich danach selbst neu und
schreibt eine Warnung in den Footer, wenn beide auseinanderlaufen.

---

## 5. Was offen ist

**Auf einem echten iPhone zu prüfen.** Drei Dinge haben sich angesammelt,
die nur ein Gerät beantwortet:

1. Der Kopf liegt seit `v10` `position: fixed`. Bei offener Tastatur hängt
   iOS fixierte Elemente an den sichtbaren Ausschnitt — für die Tableiste
   ist das behandelt (`body.is-typing`), für den Kopf ist das Einklappen
   während des Tippens abgeschaltet, aber ob er sauber sitzt, sagt nur das
   Gerät.
2. Die Zurück-Geste über `history.pushState` (seit `v11`) verhält sich in
   der iOS-PWA anders als im Browser-Tab.
3. Die Touch-Ziele der Umsortier-Pfeile im Plan (seit `v14`).

**Daten.** `indoor` ist nur bei 1 von 101 Orten ausdrücklich gesetzt; die
übrigen laufen über Tag-Heuristiken (`INDOOR_YES`/`INDOOR_NO` plus die Regel
„Gastronomie gilt als überdacht"), was 44 drinnen / 40 draußen / 17 offen
ergibt. `geo` fehlt bei 29 von 101 Orten — davon hängt die Wegwarnung im
Plan ab. `rating` fehlt bei 65, weshalb die Sortierung nach Bewertung
faktisch ein Drittel sortiert.

**Aus dem Redesign-Vorschlag nicht umgesetzt:** die größere Umbauung der
Informationsarchitektur aus Abschnitt 3.1 — ein Tab „Mehr", der Info,
Teilen und Einstellungen aufnimmt. Sie war nie Teil der vier Schritte.
Ebenfalls offen: die Karte (Abschnitt „Karte (offen)" in der README), die
Leaflet lokal im Repo und die fehlenden 29 Koordinaten voraussetzt.

**Eine Kleinigkeit am Deployment**, ein Einzeiler, offen:

- Es fehlt eine `.nojekyll`. Aktuell gibt es keine Datei mit führendem
  Unterstrich, es tut also nichts weh — bei einer statischen App ist sie
  trotzdem die übliche Absicherung.

Der zweite Punkt hat sich erledigt: `main` existiert seit dem Aufräumen,
ist der Default-Branch, und Pages liefert daraus. Die Angabe in der README
stimmt jetzt.

---

## 6. Wo der Zusammenhang steht

`docs/redesign-vorschlag.md` ist das lange Dokument: der Audit mit
gemessenen Zahlen, die Design-Richtung, die vier Schritte mit ASCII-Skizzen,
und unter „Umsetzungsstand" für jeden Schritt, was tatsächlich gebaut wurde
und **wo bewusst vom Vorschlag abgewichen wurde**. Diese Abweichungen sind
begründet dokumentiert; wenn du sie zurückdrehen willst, lies erst die
Begründung.

Eine Korrektur steht dort ebenfalls offen ausgewiesen: der Audit nannte
zuerst 16 Schriftgrößen, ausgezählt waren es 30. Solche Korrekturen gehören
sichtbar ins Dokument, nicht stillschweigend hineingerechnet.
