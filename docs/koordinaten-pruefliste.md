# Koordinaten — Stand und Prüfregeln

101 Orte · 72 mit Koordinaten · 29 offen

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

## Offene Punkte

### Sollten eine Koordinate bekommen (10)

- **Famila** (`famila`) — Via Campanello 1/a, Peschiera del Garda
- **S'Aligusta** (`saligusta`) — Via Bell'Italia 12, Peschiera del Garda
- **La Taverna da Oreste** (`oreste`) — Via F. Fontana 32, Lazise
- **Jamaica Beach & Schwefelquelle** (`jamaica-beach`) — Spitze der Halbinsel, Sirmione
- **Forte Ardietti & Monte della Guardia** (`ponti-sul-mincio`) — Ponti sul Mincio
- **Azienda Agricola Ottella** (`ottella`) — Località Boschetti 1, San Benedetto di Lugana, Peschiera del Garda
- **Podere Selva Capuzza** (`selva-capuzza`) — Via Selva Capuzza, San Martino della Battaglia
- **Parco Termale Villa dei Cedri** (`villa-dei-cedri`) — Piazza di Sopra 4, Colà di Lazise
- **Riserva Rocca e Sasso di Manerba** (`rocca-manerba`) — Via della Rocca 16, Manerba del Garda
- **Pescheria Cavallaro** (`pescheria-cavallaro`) — Località Stretta Castello 19, Desenzano del Garda

### Geleert, weil der Punkt ein Ortsmittelpunkt war (6)

Diese Orte trugen eine Koordinate, die der Dienst für eine ganze Gemeinde
geliefert hatte. Auf `null` gesetzt — eine falsche Nadel schickt jemanden hin,
eine fehlende nicht.

Vier davon brauchen **zuerst eine genauere Adresse**, sonst liefert der nächste
Lauf denselben Ortspunkt und beide Regeln nicken ihn durch:

- **Festung Peschiera** (`fortezza`) — Adresse ist nur „Peschiera del Garda"; die
  Festung liegt bei 10,69 Ost, der geliefert Punkt bei 10,68
- **Bahnhof Peschiera del Garda** (`bahnhof`) — dito, braucht die Via Venezia
- **Imbarcadero Peschiera** (`imbarcadero`) — dito, braucht das Lungolago
- **Ammazza Caffè** (`ammazza-verona`) — Adresse ist nur „Verona", das Café bekam
  den Stadtpunkt. Zum Vergleich: *BASƎ* hat mit *Vicolo San Silvestro 29* eine
  eigene Koordinate

Zwei haben eine brauchbare Adresse und sollten beim nächsten Lauf durchgehen:

- **Trattoria al Combattente** (`combattente`) — Strada Bergamini 60
- **Lago del Frassino** (`lago-frassino`) — Strada Santa Cristina

Beide trugen denselben Punkt; welcher von beiden ihn zu Recht trug, ließ sich
nicht entscheiden, also sind beide leer.

Nicht geleert wurde **Verona** (`verona`): für einen Städteausflug ist der
Stadtpunkt die richtige Nadel. Er teilte ihn nur mit dem Café.

### Ohne sinnvollen Einzelpunkt (13)

Wege, Radrunden, Bootstouren und Termine. Bleiben leer; die Karte muss das aushalten.

- Uferweg am Mincio (`lungomincio`)
- Wochenmarkt (`mercato`)
- Isola del Garda (`isola-del-garda`)
- Uferweg Cappuccini – Bergamini – Le Fornaci (`bergamini`)
- Lungolago di Lugana (`lungolago-lugana`)
- Uferweg Desenzano – Rivoltella (`rivoltella`)
- Uferweg Pacengo – Lazise (`pacengo-lazise`)
- Sentiero delle incisioni rupestri (`monte-luppia`)
- Giro delle Mura — Bootsfahrt (`giro-delle-mura`)
- Linienschiff als Bootstour (`linienschiff-hund`)
- Radrunde durch die Lugana-Weinberge (`ciclabile-lugana`)
- Radweg Peschiera – Lazise – Bardolino – Garda (`ciclabile-ostufer`)
- Rievocazione Storica Peschiera (`rievocazione`)

## Mehrere Orte auf demselben Punkt (8)

Die verbleibenden acht sind harmlos: alle nennen dieselbe Straße oder denselben
Flurnamen, die Orte liegen also tatsächlich nebeneinander. Auf der Karte
überlappen die Marker, sie zeigen aber nicht woandershin.

- Osteria sugli Scavi  +  Dom San Martino — *Piazza Ferdinando di Savoia*
- Pavillon  +  Parco Catullo — *Parco Catullo*
- Porta Brescia  +  Velolake Bike Rental — *Porta Brescia*
- Bastione San Marco  +  Museo della Pesca — *Bastione San Marco*
- Punta San Vigilio  +  Taverna San Vigilio — *Punta San Vigilio*
- Braccobaldo Beach  +  Lapescheria — *Località Fornaci*
- Supermercato Orvea  +  Penny Market — *Via Venezia*
- Lido 3.9 Lounge Bar  +  Wochenmarkt Desenzano — *Lungolago Cesare Battisti*

Die drei groben Gruppen sind oben geleert.
