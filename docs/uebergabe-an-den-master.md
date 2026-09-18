# Übergabe an den Master-Coder

Aus der Sitzung `session_01PiP5TkvGVs8RtGdp3sTx5p`, Zweig
`claude/gifted-noether-15nca0`, Stand 18.09.2026, Fassung **v17**.

Diese Datei ist für die Instanz geschrieben, die die Arbeit der einzelnen
Sitzungen zusammenführt. Sie enthält kein Lob und keine Zusammenfassung meiner
Commits — die stehen in der Historie. Sie enthält das, was **nicht** im Code
steht und beim Zusammenführen Schaden anrichtet, wenn es niemand weiß.

---

## 1. Der wichtigste Satz

**Dieses Repo hat in einer Sitzung siebenmal dieselbe Fassungskollision
erzeugt, und zweimal hat git dabei gar nichts gemeldet.**

`app.js` trägt `var VERSION`, `sw.js` trägt `var CACHE` und `var FONTS`. Sie
müssen zusammenpassen, sonst läuft die App still aus einem alten
Offline-Speicher weiter — ohne Fehlermeldung, ohne Absturz, nur mit altem
Inhalt. Der Prüfstand hat dafür einen Wächter, und der ist **strukturell
blind**: er vergleicht `sw.js` gegen `app.js` *innerhalb eines Stands*. Zwei
Zweige, die unabhängig beide auf `v14` springen, sind für ihn beide in
Ordnung. Beim Merge sind die Zeilen identisch, also gibt es keinen Konflikt,
also fällt es niemandem auf — und der Merge-Stand trägt eine Marke, die schon
für etwas anderes ausgeliefert wurde.

**Für den Master:** die Fassungsmarke ist keine Datei-Eigenschaft, sondern
eine Aussage über einen ausgelieferten Stand. Sie gehört an genau eine Stelle
vergeben, nach dem Zusammenführen, nicht in den Zweigen. Solange das nicht so
ist, muss jeder Merge sie von Hand hochzählen, und niemand darf sich darauf
verlassen, dass ein ausbleibender Konflikt Richtigkeit bedeutet.

Kollisionen in dieser Sitzung: v9, v10, v12, v14, v15 (zweimal), v16.

---

## 2. Was mir still Daten gefressen hat

`data/places.json` ist die eigentliche Substanz des Projekts: 101 Orte, von
Hand gepflegt. Ein Merge auf dieser Datei hat mir **unbemerkt einen Wert
gelöscht**, und alle damals 93 Prüfungen blieben grün.

Ablauf: beide Seiten hatten für `lido39` ein `moment` eingefügt. Der Merge
legte beide ein — **zwei `moment`-Schlüssel im selben Objekt**. `JSON.parse`
nimmt davon still den letzten. Aus `["nachmittag","abend"]` wurde `["abend"]`.
Die Datei blieb gültiges JSON, die App lief, nichts schlug an. Gefunden habe
ich es nur, weil eine Kennzahl um eins fiel (nachmittag 48 → 47) und ich die
Werte gegen den Stand vor dem Merge gediffed habe.

Die Lücke ist geschlossen: `duplicateKeys()` in `scripts/test-logic.mjs`
scannt den **Rohtext**, nicht das geparste Objekt, weil das Problem im Parser
selbst verschwindet. Gegengeprüft durch Wiedereinsetzen des Duplikats. Der CI
aus `.github/workflows/pruefstand.yml` nennt genau diesen Fall in seiner
Begründung.

**Für den Master:** bei jedem Merge, der `data/places.json` berührt, sind zwei
Dinge Pflicht, und keines davon ist optional, weil beide Fehlerklassen
unsichtbar sind:

1. `node scripts/test-logic.mjs` — fängt das Duplikat.
2. Die Kennzahlen am Ende des Prüfstands gegen den Stand **vor** dem Merge
   vergleichen. Eine Zahl, die um eins fällt, ist ein gelöschter Wert.

Und: **niemals** programmatisch in diese Datei schreiben, ohne vorher zu
prüfen, dass `json.dumps(..., ensure_ascii=False, indent=2) + '\n'` die Datei
byteweise reproduziert. Sonst formatiert das Skript 101 Orte um und der Diff
ist nicht mehr lesbar. Ich habe das vor jedem Eingriff geprüft.

---

## 3. Inhaltliche Regeln, die man nicht am Code sieht

### `moment: []` heißt „nie als Tagesvorschlag", nicht „unbekannt"

Alle 101 Orte tragen ein `moment`. 13 tragen bewusst eine **leere Liste**:
Apotheke, Tierarzt, Bahnhof, Anleger, Supermärkte, Radverleih, Fischhändler.
Sie sollen über die Suche auffindbar bleiben, aber nie als „hier lang" oben
stehen.

Der Unterschied ist eine Zeile, und sie war falsch:

```js
if (Array.isArray(p.moment)) return p.moment;   // war: && p.moment.length
```

Mit dem `&& p.moment.length` fiel eine leere Liste auf die **Herleitung aus
Kategorie und Öffnungszeit** zurück — die Apotheke wurde also doch
vorgeschlagen, und zwar mit Badge. Genau das, was die leere Liste verhindern
soll. Wer `momentsOf` anfasst, muss wissen, dass leer und fehlend hier
verschiedene Dinge bedeuten.

### Koordinaten werden nicht geraten

`nominatim.openstreetmap.org` ist in dieser Umgebung durch die Egress-Policy
gesperrt (`403` auf CONNECT). Die Anweisung dazu lautet ausdrücklich melden,
nicht umgehen — also auch **kein Ausweichdienst**. Der gebaute Weg ist
`koordinaten.html` im eigenen Browser.

29 Orte haben deshalb keine Koordinate, und das ist der richtige Stand. Ein
erfundener Punkt sieht auf der Karte genauso zuversichtlich aus wie ein
richtiger und schickt jemanden an die falsche Stelle; eine fehlende Nadel
tut das nicht.

Sechs Koordinaten habe ich **geleert**, weil sie Ortsmittelpunkte waren statt
Adressen: `fortezza`, `bahnhof`, `imbarcadero` (ein Punkt für drei
Wahrzeichen), `combattente` und `lago-frassino` (ein Punkt, zwei verschiedene
Straßen), `ammazza-verona` (erbte den Stadtpunkt von Verona). `verona` selbst
behält seinen Punkt — für einen Städteausflug *ist* der Stadtpunkt die
richtige Nadel.

Die beiden alten Plausibilitätsregeln hätten alle sechs beim nächsten Lauf
**wieder durchgelassen**: „Peschiera del Garda" als Adresse bestätigt den
Gemeindepunkt, und die Luftlinie bleibt klein. Daraus sind zwei Regeln
abgeleitet, die jetzt im Prüfstand stehen:

- kein Punkt trägt drei oder mehr Orte,
- Orte auf einem Punkt nennen dieselbe Straße (Hausnummer und Ortsteil
  abgeschnitten, damit *Via Venezia 86* und *Via Venezia 72* zusammenfallen,
  *Strada Bergamini* und *Strada Santa Cristina* aber nicht).

### Zahlen in der Dokumentation werden gerechnet, nicht abgeschrieben

Ich habe in dieser Sitzung selbst vier veraltete Zahlen in der README
gefunden und bei einer Konfliktauflösung eine **neue falsche** produziert
(indoor 45/39 geraten, richtig war 44/40/17). Deshalb rechnet der Prüfstand
die Zahlen der README und die Kopfzeile von
`docs/koordinaten-pruefliste.md` aus den Daten und vergleicht sie.

**Für den Master:** eine Zahl in einem Dokument, die kein Test rechnet, ist
eine Zahl, die irgendwann lügt.

---

## 4. Wie man prüft

Drei Suiten, **278 Prüfungen**, alle grün auf `v17`:

```
node scripts/test-logic.mjs          # 130 — läuft in CI, keine Abhängigkeiten
python3 -m http.server 8111 &        # Server für die beiden Browser-Suiten
node scripts/browser-abnahme.mjs     #  92 — Oberfläche, Fokusfalle, offline
node scripts/browser-abschnitte.mjs  #  56 — "Heute" zu vier Uhrzeiten
```

Die beiden Browser-Suiten lagen bis eben **nur im Scratchpad** und wären mit
dem Container verschwunden. Sie sind jetzt im Repo und über
Umgebungsvariablen konfigurierbar (`PLAYWRIGHT`, `CHROME`, `BASE`, `OUT`,
`ROOT`, `STALE`); die Vorgaben sind der Stand, in dem sie zuletzt grün liefen.
In CI stehen sie nicht — dafür bräuchte es Chromium im Runner.

Fallen, die mich dort Zeit gekostet haben:

- **`isMobile` nicht setzen.** Playwright lässt das Layout-Viewport nach
  einem Feldfokus auf 877 stehen, klickt aber im 844er Raum — die fixierte
  Tableiste liegt damit außerhalb und ist nicht antippbar. Treibersache,
  nicht App-Fehler.
- **Vor einem Tab-Klick den Fokus abgeben.** `body.is-typing` fährt die
  Tableiste weg, während das Suchfeld Fokus hat; an ihrer Stelle liegt dann
  eine Karte. Das ist korrektes App-Verhalten.
- **Feste Zeiten mit Zeitzonen-Versatz bauen** (`...T08:00:00+02:00`), sonst
  baut node in UTC und die Seite sieht in Europe/Berlin zwei Stunden später.
- **Google Fonts sind durch den Proxy gesperrt.** Vier Konsolenfehler sind
  erwartet; die Konsolenprüfung blendet genau die aus.
- **Die App schreibt `8:00`, nicht `08:00`.** Meine Erwartung war falsch,
  nicht die App.
- **Die Fassung nicht abtippen.** Zwei Fälle hatten `v16` fest und meldeten
  nach dem Sprung einen Fehler, der keiner war. Die Suite liest sie jetzt
  aus `app.js`.

---

## 5. Was offen ist und Menschen braucht

Nichts davon ist durch Nachdenken lösbar — es fehlt Wissen über die Welt.

**29 Orte ohne Koordinate.** Vier brauchen **zuerst eine genauere Adresse**,
sonst liefert der nächste Lauf denselben Gemeindepunkt und beide alten Regeln
nicken ihn wieder durch: `fortezza`, `bahnhof`, `imbarcadero`,
`ammazza-verona`. `combattente` und `lago-frassino` haben brauchbare
Adressen. Alles mit Vorschlag in `docs/koordinaten-pruefliste.md`.

**58 von 101 Orten haben eine ungeklärte Hunderegel** (`dog: null`). Das ist
keine Kleinigkeit, sondern eine Lücke, die die App selbst zeigt: am
Regenmorgen mit Hund bleibt der Tagesvorschlag leer und zählt namentlich auf,
was ohne den Jum-Schalter ginge — Dallazia, Pavòn, BASƎ. Das sind
Frühstückscafés, deren Regel niemand kennt. Wer vier Anrufe macht, macht den
Regenmorgen brauchbar.

**47 Orte ohne `hours`.** Öffnungszeiten treiben „Heute", `closingSoon` und
die Sortierung.

---

## 6. Zustand meines Zweigs

`claude/gifted-noether-15nca0`, offen als
[fabiandaviddd/Peschiera#10](https://github.com/fabiandaviddd/Peschiera/pull/10),
Basis `main`.

Inhalt: das `moment`-Feld für alle 101 Orte, die eine Zeile in `momentsOf`,
die sechs geleerten Ortsmittelpunkte, die zwei neuen Punkt-Regeln, die
Plausibilitätsprüfung auf der fertigen Datei, die Fokusfalle
(`inert` + `aria-hidden` + Tab-Ring, weil Safari `inert` erst ab 15.5 kann),
der Fassungswächter über `MessageChannel`, der Prüfstand selbst und die beiden
Browser-Suiten.

**Zwei Warnungen zur Historie dieses Zweigs**, beide relevant fürs
Zusammenführen:

1. `a4ad35c` auf `main` ist **mein eigener Commit**, von einer anderen Sitzung
   einzeln nach `main` gepflückt (`cherry picked from a983c166`, dieselbe
   Sitzungs-Kennung) — in einer **älteren** Fassung, vor dem Leeren der sechs
   Punkte. Beim Merge war er deshalb byteweise deckungsgleich, und git meldete
   nur die Stelle, an der dieser Zweig weiter ist. Wer einen Konflikt hier
   sieht, sieht keinen inhaltlichen Widerspruch, sondern dieselbe Arbeit unter
   zwei Nummern. Die Obermenge gewinnt.
2. Eine parallele Sitzung (`session_01XWHxSbvGSEfALQu5Y2ypCr`) hat **denselben
   Merge gleichzeitig auf denselben Zweig gepusht** (`f45647a`). Gleich
   entschieden, aber ohne Fassungssprung und ohne den Fokus-Fehler unten. Ich
   habe ihren Commit eingezogen statt ihn zu überschreiben und vorher geprüft,
   dass `data/places.json` zwischen beiden Ständen byteweise identisch ist.

**Ein Fehler, den erst dieser Merge sichtbar gemacht hat** — als Beispiel für
die Klasse von Problemen, die beim Zusammenführen entsteht und die kein
Konflikt anzeigt: `main` brachte einen 260-ms-Nachlauf beim Schließen des
Sheets mit, meine Fokusfalle hing an `sheet.hidden`. Zwischen Schließen und
Ausblenden gab `closeSheet` den Fokus korrekt an die Karte zurück, `trapTab`
hielt aber weiter und zog ihn bei einem Tastendruck in dieses Fenster zurück
in das verschwindende Sheet — danach stand er auf `<body>`. Ein
Tastaturnutzer verlor damit seine Stelle in der Liste. Beide Seiten waren
einzeln richtig. Im Browser nachgestellt, behoben, als fester Fall
aufgenommen.

---

## 7. Was ich dem Master empfehlen würde

1. **Fassungsmarke zentralisieren.** Sie in den Zweigen zu vergeben ist die
   Ursache von sieben Kollisionen, von denen zwei unsichtbar waren.
2. **`data/places.json` unter eine Hand.** Zwei Sitzungen, die gleichzeitig
   Orte pflegen, erzeugen doppelte Schlüssel, und die sind ohne den
   Rohtext-Scanner nicht zu sehen.
3. **Den Stamm nicht während offener Zweige umhängen.** In dieser Sitzung ist
   er siebenmal gewandert, zuletzt von
   `claude/peschiera-kompakt-v2-vqzy9s` auf `main`. Jeder Zug kostete einen
   Merge, eine Neuberechnung der Kennzahlen, einen Fassungssprung und eine
   Anpassung der Harnesse an umgebaute Oberfläche.
4. **Die Browser-Suiten in CI bringen.** 148 der 278 Prüfungen laufen heute
   nur, wenn jemand sie startet. Genau das war beim Prüfstand auch so, bis
   der stille Datenverlust passierte.
