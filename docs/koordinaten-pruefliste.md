# Koordinaten — Stand und Prüfregeln

101 Orte · 101 mit Koordinaten · 0 offen

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

## Kein offener Punkt mehr

Seit 19.09.2026 tragen **alle 101 Orte** eine Koordinate. Der letzte,
`rivoltella`, hat den Porto Vecchio in Desenzano bekommen (45.470991,
10.540389) — den Hafen selbst, nicht die 20 m entfernte Nadel des *MoS
Bistrot*, die der erste Lauf geliefert hatte.

## Gehzeiten neu gerechnet (19.09.2026)

Mit dem korrigierten Bezugspunkt fiel auf, dass `distance_km` und `walk_min`
systematisch zu niedrig standen: **47 von 48** Orten mit Gehzeit lagen unter
dem echten Fußweg, im Median um **0,38 km**. Das ist genau der Abstand des
Stellplatzes zur Campingplatz-Einfahrt — die alten Werte waren von der
Einfahrt gemessen, nicht vom Zelt.

Neu gerechnet über Fußwegrouting ab `meta.base_geo` (OSRM `routed-foot`,
eine Tabellenabfrage für alle Orte auf einmal). Geändert wurden **nur die 48
Orte, die eine `walk_min` tragen** — dort ist Gehen der dokumentierte Weg.
Wo `walk_min` fehlt, steht in `distance_km` die Reiseentfernung mit Bahn,
Bus oder Schiff; ein Fußweg wäre dort die falsche Zahl.

Wirkung auf den Umwegfaktor: **sechs unmögliche Werte sind auf einen
gefallen.**

Der eine ist `desenzano`: 12 km eingetragen bei 12,6 km Luftlinie. Das ist
kein Fehler, sondern dieselbe Feldbedeutung wie oben — 12 km ist die
Bahnstrecke, die Straße misst 22 km um den See herum. Die Daten bleiben, der
Prüfstand meldet es, und hier steht warum. Eine Zahl zu ändern, damit ein
Bericht schweigt, wäre die falsche Richtung.

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
