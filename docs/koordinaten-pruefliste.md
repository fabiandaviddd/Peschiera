# Koordinaten — Stand und Prüfregeln

101 Orte · 78 mit Koordinaten · 23 offen

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

## Mehrere Orte auf demselben Punkt (11)

Der Dienst hat einen Ortsmittelpunkt statt der Adresse geliefert. Teils harmlos,
weil die Orte tatsächlich nebeneinander liegen, teils grob. Auf der Karte
überlappen die Marker.

- Trattoria al Combattente  +  Lago del Frassino
- Osteria sugli Scavi  +  Dom San Martino
- Pavillon  +  Parco Catullo
- Ammazza Caffè  +  Verona
- Festung Peschiera  +  Bahnhof Peschiera del Garda  +  Imbarcadero Peschiera
- Porta Brescia  +  Velolake Bike Rental
- Bastione San Marco  +  Museo della Pesca
- Punta San Vigilio  +  Taverna San Vigilio
- Braccobaldo Beach  +  Lapescheria
- Supermercato Orvea  +  Penny Market
- Lido 3.9 Lounge Bar  +  Wochenmarkt Desenzano (Dienstag)
