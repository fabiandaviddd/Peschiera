# Übergabe — Zweig `claude/gifted-noether-15nca0`

Aus `session_01PiP5TkvGVs8RtGdp3sTx5p`. Stand **v18**, 18.09.2026.

**Lies zuerst `docs/uebergabe.md`.** Dort stehen die Hausregeln, der Aufbau
und die allgemeinen Fallen. Diese Datei wiederholt davon nichts. Sie enthält
nur, was bei mir dazukam und woanders nicht steht.

Was aus diesem Zweig über PR #10 schon im Stamm ist: das `moment`-Feld für
alle 101 Orte, die sechs geleerten Ortsmittelpunkte, die zwei daraus
abgeleiteten Punkt-Regeln, die Plausibilitätsprüfung auf der fertigen Datei,
die Fokusfalle und der Fassungswächter.

---

## 1. `moment: []` heißt „nie als Tagesvorschlag", nicht „unbekannt"

Das ist die Unterscheidung, an der man sich beim Anfassen von `momentsOf()`
schneidet, und sie war eine Zeile lang falsch:

```js
if (Array.isArray(p.moment)) return p.moment;   // war: && p.moment.length
```

Alle 101 Orte tragen ein `moment`. **13 tragen bewusst eine leere Liste** —
Apotheke, Tierarzt, Bahnhof, Anleger, Supermärkte, Radverleih,
Fischhändler. Sie sollen über die Suche auffindbar bleiben, aber nie als
„hier lang" oben stehen.

Mit dem `&& p.moment.length` fiel eine leere Liste auf die **Herleitung aus
Kategorie und Öffnungszeit** zurück. Die Apotheke wurde also doch
vorgeschlagen, und zwar mit Badge — genau das, was die leere Liste
verhindern soll. Leer und fehlend sind hier verschiedene Dinge; der
Prüfstand hält beide Fälle fest.

---

## 2. Zwei Punkt-Regeln, und warum die alten nicht genügten

Sechs Koordinaten waren Ortsmittelpunkte statt Adressen und sind geleert:
`fortezza`, `bahnhof`, `imbarcadero` (ein Punkt für drei Wahrzeichen),
`combattente` und `lago-frassino` (ein Punkt, zwei verschiedene Straßen),
`ammazza-verona` (erbte den Stadtpunkt). `verona` **behält** seinen Punkt —
für einen Städteausflug *ist* der Stadtpunkt die richtige Nadel.

Der Teil, der beim Weiterarbeiten zählt: die beiden alten
Plausibilitätsregeln hätten alle sechs beim nächsten Lauf **wieder
durchgelassen**. „Peschiera del Garda" als Adresse bestätigt den
Gemeindepunkt, und die Luftlinie bleibt klein. Deshalb prüft der Prüfstand
jetzt zusätzlich die Punkte selbst:

- kein Punkt trägt drei oder mehr Orte,
- Orte auf einem Punkt nennen dieselbe Straße — Hausnummer und Ortsteil
  abgeschnitten, damit *Via Venezia 86* und *Via Venezia 72* zusammenfallen,
  *Strada Bergamini* und *Strada Santa Cristina* aber nicht.

Die Normalisierung ist der Kern der zweiten Regel. Ohne sie fängt sie
nichts, mit einer zu groben fängt sie alles.

---

## 3. Die beiden Browser-Suiten liegen jetzt im Repo

`docs/uebergabe.md` sagt, Playwright liege bereit. Das war die Lücke: die
Suiten selbst lagen in einem Scratchpad und wären mit dem Container
verschwunden — **148 von 288 Prüfungen**.

```
node scripts/test-logic.mjs          # 140 — läuft in CI, keine Abhängigkeiten
python3 -m http.server 8111 &        # Server für die beiden Browser-Suiten
node scripts/browser-abnahme.mjs     #  92 — Oberfläche, Fokusfalle, offline
node scripts/browser-abschnitte.mjs  #  56 — „Heute" zu vier Uhrzeiten
```

Alles Umgebungsabhängige kommt aus Umgebungsvariablen (`PLAYWRIGHT`,
`CHROME`, `BASE`, `STALE`, `OUT`, `ROOT`); die Vorgaben sind der Stand, in
dem sie zuletzt grün liefen. In CI stehen sie nicht — dafür bräuchte es
Chromium im Runner.

`STALE` ist ein zweiter Server auf einer Kopie mit absichtlich altem `CACHE`
in `sw.js`. Nur damit lässt sich prüfen, dass die Fassungs-Warnung im Footer
wirklich erscheint:

```
cp -r . /tmp/stale && sed -i "s/peschiera-v18/peschiera-v6/g" /tmp/stale/sw.js
python3 -m http.server 8114 --directory /tmp/stale &
```

### Fallen, die dort Zeit kosten

- **`isMobile` nicht setzen.** Playwright lässt das Layout-Viewport nach
  einem Feldfokus auf 877 stehen, klickt aber im 844er Raum — die fixierte
  Tableiste liegt damit außerhalb und ist nicht antippbar. Treibersache,
  nicht App-Fehler.
- **Vor einem Tab-Klick den Fokus abgeben.** `body.is-typing` fährt die
  Tableiste weg, während das Suchfeld Fokus hat; an ihrer Stelle liegt dann
  eine Karte. Korrektes App-Verhalten.
- **Feste Zeiten mit Zeitzonen-Versatz bauen** (`...T08:00:00+02:00`), sonst
  baut node in UTC und die Seite sieht in Europe/Berlin zwei Stunden später.
- **Die App schreibt `8:00`, nicht `08:00`.**
- **Die Fassung nicht abtippen.** Zwei Fälle hatten `v16` fest und meldeten
  nach einem Sprung einen Fehler, der keiner war. Die Suite liest sie
  seitdem aus `app.js`.

---

## 4. Ein Fehler, den erst ein Merge erzeugt hat

Als Muster wichtiger als der Einzelfall: **zwei Seiten, jede einzeln
richtig, ergeben zusammen einen Fehler, und git meldet keinen Konflikt.**

Der Stamm brachte einen 260-ms-Nachlauf beim Schließen des Sheets mit
(`sheetTimer`, `sheetClosing`). Meine Fokusfalle hing an `sheet.hidden`.
Zwischen Schließen und Ausblenden gab `closeSheet()` den Fokus korrekt an
die Karte zurück — `trapTab()` hielt aber weiter und zog ihn bei einem
Tastendruck in diesem Fenster zurück in das verschwindende Sheet. Danach
stand er auf `<body>`. Ein Tastaturnutzer verlor damit seine Stelle in der
Liste.

Behoben mit der Sperre, die der Stamm schon mitgebracht hatte:

```js
if (sheet.hidden || sheetClosing) return;
```

Nachgestellt und als fester Fall in `scripts/browser-abnahme.mjs`: Tab im
Nachlauf landet auf dem nächsten Knopf der Liste, nicht im Sheet.

**Für das Zusammenführen:** ein konfliktfreier Merge sagt, dass sich die
Zeilen nicht widersprechen. Über das Verhalten sagt er nichts. Bei jedem
Merge, der Zustand über Zeit anfasst — Timer, Fokus, Verlauf, `hidden` —
gehört die Browser-Suite dazu, nicht nur der Prüfstand.

---

## 5. Die Fassungsmarke, zum neunten Mal

`docs/uebergabe.md` 3.3 und `uebergabe-gracious-volta.md` Falle 1 nennen es
beide. Nach neun Fällen in einer Sitzung — v9, v10, v12, v14, v15 (zweimal),
v16, v17 (zweimal) — ist es keine Falle mehr, sondern die Bauweise:

**Die Marke wird in Zweigen vergeben, gehört aber einem ausgelieferten
Stand.** Zwei Zweige, die unabhängig auf `v17` springen, erzeugen identische
Zeilen. Identische Zeilen sind kein Konflikt. Also fällt nichts auf, und der
Merge-Stand trägt eine Marke, unter der schon etwas anderes ausgeliefert
wurde. Zweimal in dieser Sitzung hat git dabei überhaupt nichts gemeldet.

Der Wächter im Prüfstand kann das nicht sehen: er vergleicht `sw.js` gegen
`app.js` **innerhalb eines Stands**.

Solange die Marke in Zweigen vergeben wird, muss sie nach jedem Merge von
Hand hoch — und ein ausbleibender Konflikt darf nicht als Richtigkeit gelesen
werden. Wer sie zentral vergibt, ist die Falle los.

---

## 6. Was ich an eurer Stelle zuerst täte

1. **Die Fassungsmarke aus den Zweigen nehmen.** Neun Kollisionen, zwei
   davon unsichtbar. Einzige Ursache: sie wird an der falschen Stelle
   vergeben.
2. **`data/places.json` unter eine Hand.** Zwei Sitzungen, die gleichzeitig
   Orte pflegen, erzeugen doppelte Schlüssel (`uebergabe.md` 3.2), und die
   sind ohne den Rohtext-Scanner unsichtbar. Dazu: nach jedem Merge auf
   dieser Datei die Kennzahlen am Ende des Prüfstands gegen den Stand
   **vorher** vergleichen. Eine Zahl, die um eins fällt, ist ein gelöschter
   Wert.
3. **Die Browser-Suiten in CI.** 148 der 288 Prüfungen laufen heute nur,
   wenn jemand sie startet. Beim Prüfstand war das genauso — bis der stille
   Datenverlust passierte.
4. **Vier Adressen klären, dann geocodieren.** `fortezza`, `bahnhof`,
   `imbarcadero`, `ammazza-verona` liefern ohne genauere Adresse wieder den
   Gemeindepunkt, und die beiden alten Regeln nicken ihn wieder durch. Die
   zwei neuen Regeln aus Abschnitt 2 fangen ihn erst, wenn mehrere Orte
   darauf landen — bei einem einzelnen greift keine. Reihenfolge zählt hier.
