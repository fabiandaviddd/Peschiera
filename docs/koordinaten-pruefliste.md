# Koordinaten — Stand und Prüfregeln

101 Orte · 100 mit Koordinaten · 1 offen

## Wie geprüft wird

Beim ersten Durchlauf sind drei Orte falsch verortet worden. Aus den Daten
ließen sich zwei Regeln ableiten, die alle drei abfangen. Sie stecken jetzt in
`koordinaten.html` und `scripts/add-coords.mjs`:

1. **Ortsname.** Steht in der Adresse ein Ort, muss er auch im Ergebnis des
   Dienstes vorkommen. *Via F. Fontana 32, Lazise* darf nicht in Peschiera landen.
   Greift auch bei Adressen ohne Komma, sofern sie wie ein Ortsname aussehen
   (höchstens vier Wörter, keine Ziffern, kein Straßenwort am Anfang).
2. **Entfernung.** Die Luftlinie kann nie länger sein als die gemessene
   Straßenentfernung aus `distance_km`. Grenze: `distance_km × 1,15 + 0,5 km`.

Dazu wird die Suche auf die Reisegegend eingegrenzt
(`viewbox` 10,35–11,15 Ost / 45,05–45,95 Nord, `bounded=1`).

### Was bewusst nicht geprüft wird

Eine **Untergrenze** für die Entfernung wäre untauglich. An den vorhandenen
Daten gemessen: jeder Schwellenwert, der die falschen Treffer fängt, verwirft
auch 17 bis 25 korrekte Orte. Kurze Strecken sind zu grob gerundet.

Wird ein Treffer verworfen, probiert die Suche die nächste Schreibweise.
Erst wenn alle scheitern, bleibt der Ort leer — mit Begründung im Protokoll.

### Wann ein Fehlschlag wieder verfällt

Gescheiterte Orte werden gemerkt, damit ein zweiter Lauf nicht dieselben
aussichtslosen Anfragen wiederholt — der Dienst verlangt eine Sekunde Pause je
Anfrage. Gemerkt heißt aber nicht *für immer*. Ein Fehlschlag verfällt:

- wenn sich die **Prüfregeln** ändern (`REGELN` in `koordinaten.html`),
- wenn sich die **Adresse des Ortes** in `places.json` ändert — genau das
  verlangt die Liste unten für Festung, Bahnhof, Anleger und das Ammazza,
- wenn man **„Nicht gefundene erneut versuchen"** drückt. Der Knopf erscheint,
  sobald es Fehlschläge gibt, und lässt die bereits geholten Treffer stehen.

Vorher fehlten die letzten beiden. Wer einmal durchgelaufen war, bekam bei
jedem weiteren Start **stillschweigend nichts** — die Arbeitsliste war leer,
und die Seite sagte es nicht. Der einzige Ausweg hieß „Von vorn anfangen" und
warf alles Geholte weg, weshalb ihn zu Recht niemand drückte. Eine bessere
Adresse einzutragen half ebenfalls nicht, weil der Ort übersprungen blieb.
Sechs Prüfungen in `scripts/browser/koord2.mjs` halten das jetzt fest.

### Auch die fertige Datei wird geprüft

Die beiden Regeln griffen bisher nur, während der Dienst befragt wird. Die 13
Orte unten sollen von Hand aus Google Maps nachgetragen werden, und für die
prüfte nichts. `node scripts/test-logic.mjs` prüft deshalb dieselben Regeln mit
denselben Konstanten auf `places.json` selbst:

- jede Koordinate liegt in der Reisegegend (`viewbox` von oben),
- keine Luftlinie ab dem Zeltplatz ist länger als `distance_km × 1,15 + 0,5`,
- **kein Punkt trägt drei oder mehr Orte**,
- **Orte auf demselben Punkt nennen dieselbe Straße** (Hausnummer und Ortsteil
  abgeschnitten, damit *Via Venezia 86* und *Via Venezia 72* zusammenfallen,
  *Strada Bergamini* und *Strada Santa Cristina* aber nicht),
- die drei Zahlen in der Kopfzeile dieser Datei stimmen mit den Daten überein.

Die beiden Punkt-Regeln sind aus den drei falschen Gruppen unten abgeleitet.
Die zwei Regeln davor hätten sie **nicht** gefangen: „Peschiera del Garda" als
Adresse bestätigt den Ortspunkt, und die Luftlinie bleibt dabei klein.

Ein Zahlendreher beim Abtippen fällt damit auf, bevor er auf der Karte landet.

## Offener Punkt (1)

- **Uferweg Desenzano – Rivoltella** (`rivoltella`) — geliefert wurde exakt die
  Nadel des *MoS Bistrot Portovecchio*. Ein Uferweg übernimmt nicht den Punkt
  eines Restaurants, das zufällig am selben Hafen liegt. Bleibt leer, bis der
  Startpunkt am Porto Vecchio eigenständig bestimmt ist.

## Der Nachtrag vom 19.09.2026

28 Koordinaten nachgeschlagen, 27 übernommen. Damit tragen 100 der 101 Orte
einen Punkt. Drei brauchten eine Entscheidung:

- **Festung Peschiera** (`fortezza`) — geliefert wurde exakt der Punkt des
  *Bastione San Marco*. Damit lägen drei Orte auf einer Nadel, und die Festung
  wäre von einer ihrer eigenen Bastionen nicht zu unterscheiden. Genommen wurde
  stattdessen der Flächenschwerpunkt der Anlage (45.438627, 10.694105). Für
  einen Ring von 3,5 km ist jeder Einzelpunkt eine Wahl; der Schwerpunkt ist die
  ehrlichste.
- **Anleger und Linienschiff** (`imbarcadero`, `linienschiff-hund`) — tragen
  bewusst **denselben** Punkt. Peschiera hat nur einen Linienschiff-Anleger;
  die beiden Einträge beschreiben dieselbe Stelle aus zwei Blickwinkeln. Damit
  das nicht wie ein geerbter Gemeindepunkt aussieht, tragen jetzt auch beide
  dieselbe Adresse (*Piazzale Betteloni*). Die Regel „Orte auf einem Punkt
  nennen dieselbe Straße" ist damit erfüllt, statt umgangen.
- **Uferweg Desenzano – Rivoltella** — siehe oben, abgelehnt.

### Zwei Befunde aus dem Nachtrag

**Der Bezugspunkt in `meta.base_geo` war falsch — seit 19.09. korrigiert.**
Er lag 27 m vom Linienschiff-Anleger, also im Hafen statt am Zeltplatz.
Aufgefallen ist es am *Lido ai Pioppi*: der liegt laut Notiz auf dem Gelände,
150 m Straße — die Luftlinie betrug 412 m, ein Umwegfaktor von 0,4 und damit
unmöglich. Jetzt steht dort der vor Ort abgelesene Stellplatz
(45°26'53.5"N 10°41'51.7"E = 45.448194, 10.697694). Der Median des
Umwegfaktors über alle 91 verorteten Orte mit Straßenentfernung fällt damit
von **1,69 auf 1,25** — den Wert, den Straße gegen Luftlinie real hat — und
die Zahl der Orte mit Faktor über 3 von **29 auf 3**. Alle drei sind erklärt:
die beiden Radrunden unten und Forte Ardietti, das man über den Mincio
herum anfahren muss.

Sechs Orte haben jetzt einen Faktor unter 1, die Luftlinie ist dort also
länger als die eingetragene Straßenentfernung: `lido-ai-pioppi` (0,26),
`sette-ponti` (0,70), `saligusta` (0,81), `momus` (0,84), `fortezza` (0,91),
`desenzano` (0,95). Fünf davon liegen im Rundungsbereich — `distance_km` ist
auf 0,1 km genau. Der Lido ist der echte Fall: 570 m Luftlinie bei
eingetragenen 150 m. Der Platz ist groß, und die Gehzeiten dürften von der
Einfahrt aus gemessen sein, nicht vom Stellplatz. Wer die Werte nachmisst,
fängt dort an.

Der Prüfstand meldet beides seit 19.09. in der Zahlenübersicht (Median des
Umwegfaktors, Liste der Orte unter 1) — als **Meldung**, nicht als Prüfung:
bei einem Ort in Sichtweite kippt die Rundung den Faktor schon ohne jeden
Fehler. Was auffallen soll, ist die Verschiebung des Medians.

**`distance_km` trägt bei zwei Orten etwas anderes.** Bei
`ciclabile-lugana` (22) und `ciclabile-ostufer` (20) steht dort die **Länge der
Runde**, nicht die Entfernung zum Ausgangspunkt. Für alle anderen Orte
bedeutet das Feld „Straßenentfernung ab dem Zeltplatz". Die
Plausibilitätsregel greift bei beiden deshalb nicht — was nicht heißt, dass
ihre Koordinaten falsch wären, sondern dass die Regel dort die falsche Frage
stellt.

## Mehrere Orte auf demselben Punkt (9)

Alle neun nennen dieselbe Straße oder denselben Flurnamen, die Orte liegen also
tatsächlich nebeneinander. Auf der Karte überlappen die Marker, sie zeigen aber
nicht woandershin.

- Osteria sugli Scavi + Dom San Martino — *Piazza Ferdinando di Savoia*
- Pavillon + Parco Catullo — *Parco Catullo*
- Porta Brescia + Velolake Bike Rental — *Porta Brescia*
- Bastione San Marco + Museo della Pesca — *Bastione San Marco*
- Punta San Vigilio + Taverna San Vigilio — *Punta San Vigilio*
- Braccobaldo Beach + Lapescheria — *Località Fornaci*
- Supermercato Orvea + Penny Market — *Via Venezia*
- Imbarcadero Peschiera + Linienschiff als Bootstour — *Piazzale Betteloni*
- Lido 3.9 Lounge Bar + Wochenmarkt Desenzano — *Lungolago Cesare Battisti*
