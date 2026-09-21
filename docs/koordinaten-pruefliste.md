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

3. **Der Name, nicht nur die Adresse** *(neu am 21.09.2026)*. Die beiden
   Regeln oben fangen den groben Fehler — Lazise statt Peschiera. Den
   häufigeren fangen sie nicht: Der Dienst liefert auf
   *Lungolago Giuseppe Garibaldi 17* die **Straße** statt der Hausnummer,
   und die Straße ist einen halben Kilometer lang. Der Punkt liegt dann im
   richtigen Ort, in der richtigen Straße — und trotzdem falsch.

   `node scripts/check-coords.mjs` fragt deshalb nach dem **Namen** des
   Ortes und lässt Straßen, Gemeinden, Verwaltungsgrenzen, Flächennutzung
   und Bahnanlagen als Bestätigung **nicht** gelten. Was übrig bleibt, ist
   ein benanntes Objekt; sein Abstand zur gespeicherten Koordinate ist die
   Antwort. Ab 250 m wird nachgesehen.

   Das Skript entscheidet nichts. Ein Uferweg oder ein Radweg *hat* keinen
   Punkt, und der Hafen als Anfang des Weges ist dort die richtige Wahl,
   auch wenn kein Treffer sie bestätigt.

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

## Fünf falsche Punkte, gefunden am 21.09.2026

Anlass war eine Meldung aus der Benutzung: *Spiaggia Lido ai Pioppi ist
komplett falsch in der Karte.* Sie stimmte. Die Gegenprüfung über den Namen
(Regel 3) fand vier weitere.

| Ort | lag auf | liegt jetzt auf | verschoben |
|---|---|---|---|
| `lido-ai-pioppi` | der Straße *Lungolago Giuseppe Garibaldi* | dem Strand selbst (OSM `natural=beach`, way 217332862) | 506 m |
| `torre-san-martino` | der *Piazza della Concordia* im Dorf | dem Turm selbst (OSM `tourism=viewpoint;attraction`) | 1 536 m |
| `saligusta` | der *Via Bell'Italia* ohne Hausnummer | dem Lokal selbst (OSM `amenity=restaurant`) | 457 m |
| `parco-sigurta` | der *Via Giosuè Carducci*, 1,1 km neben dem Park | der Kasse am Eingang (OSM `shop=ticket`) | 755 m |
| `lago-frassino` | dem Hotel *Le Ali Del Frassino* am Ufer | dem See selbst (OSM `natural=water`) | 343 m |

Alle fünf sind derselbe Fehler: **der Dienst hat die Straße oder den Ort
geliefert, und niemand hat den Namen dagegengehalten.** Keine der beiden
alten Regeln konnte das sehen — der Ortsname stimmte, und die Luftlinie
blieb unter der Straßenentfernung.

Bei `lido-ai-pioppi` sind `distance_km` und `walk_min` mitgewandert: 0,8 km
und 10 Minuten waren vom falschen Punkt geroutet, obwohl die Notiz sagt
„Auf dem Campingplatzgelände". Sie stehen jetzt auf 0,3 km und 4 Minuten —
gerechnet mit der Hausformel (Luftlinie × 1,50 bei 4,5 km/h), **nicht**
geroutet. Es sind die einzigen zwei Werte im Bestand, für die das gilt.

### Zwei Fälle, die offen bleiben

Nicht jede Auffälligkeit ist ein Fehler, und nichts davon wird geraten:

- **`garda-south-cycling`** — die Koordinate zeigt auf *Via Milano 50* in
  Peschiera, genau wie die Adresse. Dort steht laut OpenStreetMap aber ein
  Radverleih namens **Mincio in Bike**; ein *Garda-South Cycling* kennt die
  Karte nur in Salionze bei Valeggio, 4,1 km entfernt. Entweder stimmt bei
  uns der Name nicht oder die Karte kennt die Filiale nicht. **Vor Ort oder
  telefonisch klären**, nicht am Schreibtisch entscheiden.
- **`vet-san-benedetto`** — *Via Bell'Italia 49*. Die Straße ist lang, eine
  Hausnummer kennt der Dienst nicht, und einen Eintrag unter dem Namen der
  Praxis gibt es nicht. Der Punkt liegt 216 m vom nächsten Straßenpunkt und
  ist damit **unbestätigt**. Für eine Tierarztpraxis wäre eine geprüfte
  Koordinate die Mühe wert.

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
