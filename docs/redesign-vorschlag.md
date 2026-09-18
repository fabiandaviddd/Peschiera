# Redesign-Vorschlag — Peschiera kompakt

Stand 18.09.2026 · Grundlage: `v7`, 101 Orte, gemessen auf 402×754 in
Chromium, hell und dunkel.

Dieses Dokument ist ein Vorschlag, keine Änderung. Es fasst nichts an,
was die App richtig macht — Datenehrlichkeit, Offline-First, kein
Framework, die iOS-Safari-Behandlung. Alles hier ist in Vanilla
umsetzbar.

---

## 1. Audit

### 1.1 Gemessen

| | Wert |
|---|---|
| Höhe des Sticky-Kopfes in „Orte" | **220 px** |
| Erste Listenzeile beginnt bei | y = 276 von 760 |
| Nutzbare Listenfläche | 427 px |
| Sichtbare Zeilen | **4** von 101 |
| Vorkommende Zeilenhöhen | **100 / 102 / 123 px** |
| Verschiedene Schriftgrößen in `style.css` | **30** |
| Gleichzeitig sichtbare Versalien-Stile | **7** |
| Verschiedene `badge`-Texte | **43** auf 54 Orten, 33 davon einmalig |
| Kategorien, die sich eine Farbe teilen | `ausflug` + `praktisch` (beide `lake`) |
| Bedeutungen der Farbe Gold | **4** (Stern, Dauer, „Unter 1 h", Tab-Zähler) |
| `moment` gesetzt | **0** von 101 |
| `indoor` gesetzt | **0** von 101 |
| Orte ohne `walk_min` | **53** von 101 |
| Orte ohne `rating` | **65** von 101 |
| Verschiedene Tags | **85**, davon 30 genau einmal vergeben |

### 1.2 Visuelle Hierarchie und Konsistenz

> **Korrektur 18.09.2026:** In der ersten Fassung standen hier 16
> Schriftgrößen. Ausgezählt sind es **30** — von `.62rem` bis `1.9rem`. Der
> Befund wird dadurch nicht kleiner.

**Der Kopf kostet mehr als ein Drittel des Schirms.** Titel, Jum-Schalter,
Suchfeld und zwei Chipreihen stehen sticky über allem: 220 px, bevor der
erste Ort anfängt. Übrig bleiben vier Zeilen. 101 Orte sind damit 25
Bildschirme.

**Drei Zeilenhöhen.** Die `facts`-Reihe bricht je nach Datenlage um
(100 / 102 / 123 px). Es gibt kein Raster, an dem das Auge beim Scrollen
einrastet.

**Zwei Versalien-Etiketten direkt nebeneinander.** `card__cat` (farbig,
.72rem) und `card__badge` (gerahmt, .68rem) sind typografisch fast
identisch, bedeuten aber Gegensätzliches: Taxonomie gegen Kuratierung.
Der Name darüber ist mit 1.02rem nur dreißig Prozent größer — die Zeile
hat keine klare Spitze.

**Das Badge-System ist keines.** 43 verschiedene Texte, 33 davon genau
einmal vergeben, und sie mischen mindestens sechs Bedeutungsklassen in
einer einzigen Darstellungsform:

| Klasse | Beispiele |
|---|---|
| Tageszeit | „Der Abend", „Früh morgens", „Nachmittags" |
| Termin | „18.–20.09.", „Di 22.09.", „25.–27.09." |
| Warnung | „Zeiten prüfen", „Erst anrufen" |
| Inhalt | „Rohfisch", „Wein", „Frutti di mare" |
| Einschränkung | „Ohne Auto nicht machbar", „Buchen" |
| Hundregel | „Hund ok", „Ohne Hund", „Für Jum", „Hund gratis" |
| Redaktionsartefakt | **„Default für Sonne"** |

Ein Termin, der heute läuft, und eine Geschmacksnotiz tragen dieselbe
Auszeichnung. „Default für Sonne" ist ein interner Vermerk, der in der
Oberfläche gelandet ist — im ersten Listeneintrag, groß, gerahmt.

**Elf Badges wiederholen das `dog`-Feld**, das bereits einen
Dauerschalter, einen impliziten Filter und ein eigenes Icon in der
Faktenzeile hat. Auf der Karte steht dann „HUND OK" oben und „Jum ok"
unten. Bei „Sirmione" steht „Burg ohne Hund" bei `dog: true` — der
Freitext widerspricht dem Feld, das die App auswertet.

**Zwei Kategorien teilen sich eine Farbe.** `ausflug` und `praktisch`
sind beide `lake`. Der Code nennt die farbige Kante „das einzige
Merkmal, das man ohne Lesen erkennt" — bei 44 von 101 Orten erkennt man
damit nichts.

**Stern und Haken sind zwei graue Kreise übereinander**, 44 × 44 px,
gleiche Farbe, gleiche Strichstärke. Zwei verschiedene Gedächtnisse
(„will ich hin" / „war ich schon") mit identischer visueller Stimme. Sie
reservieren 3.1rem rechts auf jeder einzelnen Zeile.

**Der Kopf steht auch dort, wo er nichts tut.** In „Info" ist der
Jum-Schalter wirkungslos und kostet trotzdem 150 px.

**Der Scroll-Hinweis gilt nur nach rechts.** `.chipwrap::after` deckt die
rechte Kante ab; ist die Reihe gescrollt, ist links unmarkiert
abgeschnitten.

### 1.3 Friktion und Usability

**„Noch offen" heißt „noch nicht gesehen", liest sich aber als „hat
gerade geöffnet"** — direkt neben Fakten wie „öffnet 9:30" und „bis
22:00". Das ist die riskanteste Beschriftung der App, weil die
Fehldeutung plausibel ist und in die falsche Richtung führt.

**Filter blenden stumm aus.** „Zu Fuß" verlangt `walk_min ≤ 25`; 53 von
101 Orten haben kein `walk_min` und fallen heraus, obwohl ein Teil davon
zu Fuß erreichbar ist. Die Zählzeile benennt nur bei Jum, was
verschwindet — dort vorbildlich, hier gar nicht.

**Sortierung nach Bewertung sortiert ein Drittel.** 65 von 101 Orten
haben kein `rating` und liegen als undifferenzierter Block hinten.

**Das Tag-Sheet ist eine Wortwolke.** 85 Tags, flach nach Häufigkeit,
ohne Suche, ohne Gruppen. „weg", „zug", „handwerk", „ganztag" und „hund"
stehen gleichberechtigt nebeneinander: Verkehrsmittel, Dauer, Stimmung
und Ausstattung in einem Topf. 30 Tags sind genau einmal vergeben und
kosten trotzdem eine Zeile.

**„Heute" läuft ohne die Daten, für die es gebaut ist.** `moment` ist bei
0 von 101 Orten gesetzt, `indoor` ebenfalls bei 0. Alles läuft über die
Herleitung. Beim Wetterschalter „nass" ergeben die Tag-Heuristiken
`indoor = true` für **10 Orte** — verteilt auf vier Tagesabschnitte. Wer
bei Regen tippt, landet mit hoher Wahrscheinlichkeit auf „Heute steht
hier nichts". Dass die App dann ehrlich ist, ist richtig. Dass sie es so
oft sein muss, ist das Problem.

**„Anderer" ist blind.** `S.pick += 1` läuft durch die Liste, ohne zu
sagen, wo man steht. Kein „3 von 12", kein Zurück. Wer einmal zu weit
tippt, findet den Vorschlag nicht wieder.

**Vom Vorschlag führt kein Weg in seine Nachbarschaft.** Von „Pasticceria
Pavòn" kommt man nicht mit einem Tipp zu „alle Cafés, die jetzt passen",
sondern nur zu „Alle 101 Orte durchsuchen".

**Die Notiz wird auf eine Zeile gekürzt** (`white-space: nowrap`) bei
durchschnittlich 147 Zeichen Länge. Sichtbar ist der halbe erste Satz.

**Vier gleich breite Pillen im Sheet.** Anrufen / Maps / Merken /
Gesehen, rund 200 px, drei davon in identischer Optik. Die eigentliche
Frage vor Ort — „wie weit, in welche Richtung" — steht als Textzeile in
einer Definitionsliste.

**Die Systemzurück-Geste schließt das Sheet nicht.** Es gibt keinen
`history.pushState`; „zurück" verlässt die App statt das Sheet zu
schließen.

**Kein Weg von „Gemerkt" zu einer Reihenfolge.** Die Merkliste ist eine
gefilterte Liste, kein Tagesplan — obwohl `time_min` bei 101 von 101 und
`geo` bei 78 von 101 Orten vorliegt und der README genau das als „später
angedacht" führt.

### 1.4 Stärken — bleiben unangetastet

- **Datenehrlichkeit.** `null` wird nie als 0 einsortiert, „hat offen"
  wird nie behauptet, ungeprüfte Zeiten werden nach hinten sortiert und
  beschriftet, der Leerzustand sagt warum. Das ist selten. Das gesamte
  Redesign erbt diese Regel.
- **Der Jum-Dauerschalter statt eines Chips.** Die Unterscheidung
  Einstellung/Filter ist richtig und wird konsequent durchgehalten, auch
  beim Zurücksetzen.
- **Die Zählzeile, die sagt, was ein Filter kostet** — nicht nur, was
  übrig bleibt. Dieses Muster wird ausgeweitet, nicht abgeschafft.
- **Offline-First ohne Framework**, PWA, kein Tracking, keine
  Laufzeit-Requests. Der Wechsel von Karten auf Zeilen war richtig.
- **Die typografische Anlage.** Fraunces als Display-Serif gegen Karla
  als Fließschrift, warmes Papier statt Grau. Das hat Charakter und muss
  geordnet, nicht ersetzt werden.
- **Die Sorgfalt für iOS Safari.** Safe Areas, 16-px-Feld, fixierter
  Body, wegfahrende Tableiste. Substanz, die man nicht wegwirft.

---

## 2. Design-Richtung

### 2.1 Philosophie: ruhiges Nachschlagewerk

Drei Sätze, an denen sich jede Entscheidung misst:

1. **Die App ist ein Buch, kein Feed.** Sie wird im Stehen bedient, bei
   Sonne, mit einer Hand und einem Hund an der anderen.
2. **Jedes Pixel Chrom, das nicht gebraucht wird, ist ein Ort weniger auf
   dem Schirm.**
3. **Was nicht belegt ist, wird nicht behauptet — aber auch nicht
   verschwiegen.**

### 2.2 Inspirationen

**Gedruckte Reiseführer (Michelin, Monocle Travel Guides).**
Auszeichnung dort läuft über Typografie und eine Handvoll fester
Piktogramme, die man einmal lernt und danach überall wiedererkennt — nicht
über Farbflächen und nicht über Freitext. Genau das fehlt hier: 43
Textbadges statt sechs gelernter Zeichen. **Übernommen:** Symbolkanon
statt Freitext-Badges, der Name als unangefochtene Spitze der Zeile, der
Rest in einer ruhigen Grauleiste darunter.

**Apple Karten „Guides" und die iOS-Kontaktkarte.**
Die Trennung von Identität oben (Name, eine Zeile Einordnung, eine
Handlungsleiste mit klarem Primär) und Details in Blöcken darunter. Und
vor allem: **eine** große Primäraktion statt vier gleicher Pillen.
**Übernommen:** Faktenkacheln statt Definitionsliste, ein Primär plus
eine Icon-Zeile.

**Things 3 und Apple Wetter — der Tag als Blatt, nicht als Empfehlung.**
Things zeigt einen Tag, keinen Vorschlag; Wetter zeigt eine Lage und
darunter eine Zeitachse, auf der man vorausblättert. **Übernommen:**
„Heute" wird eine Leiste über die vier Tagesabschnitte. Man sieht den
ganzen Tag, nicht nur das, was der Sortierer gerade oben hat.

---

## 3. Der Vorschlag

### 3.1 Informationsarchitektur

Vier Tabs bleiben vier Tabs, aber neu geschnitten:

```
  Heute          Orte           Plan           Mehr
  Tagesblatt     Liste          Merkliste      Info + Teilen
  mit 4          mit einer      mit Reihen-    + Einstellungen
  Abschnitten    Filterquelle   folge + Zeit   + Datenstand
```

- **Heute** wird Tagesblatt statt Einzelvorschlag.
- **Orte** bleibt die Liste, bekommt aber genau *einen* Weg zum Filtern.
- **Plan** ersetzt „Gemerkt": Merkliste plus Reihenfolge plus
  Zeitbudget. Der Stern bleibt der Eintrittspunkt, die Daten liegen
  bereit (`time_min` 101/101, `geo` 78/101).
- **Mehr** nimmt Info, Teilen, Farbschema und Datenstand auf. Damit
  verschwindet der Theme-Knopf aus dem Kopf.

Der **Jum-Schalter bleibt im Kopf** — aber nur in den drei Ansichten, in
denen er wirkt. In „Mehr" ist er Teil der Einstellungen.

### 3.2 Der Kopf: 220 px → 132 px, beim Scrollen 40 px

```
┌──────────────────────────────────────────────┐
│  Peschiera kompakt        ( ● ) Mit Jum      │  44   ← Titel und Schalter
├──────────────────────────────────────────────┤        teilen sich die Zeile
│  ⌕  Name, Adresse, Notiz, Tag                │  48
├──────────────────────────────────────────────┤
│  [⚙ Filter ②] [Essen ×] [Zu Fuß ×]      [⇅] │  40   ← nur AKTIVE Filter,
└──────────────────────────────────────────────┘        plus Sortierknopf
   101 Orte · mit Jum · 58 ohne Jum ausgeblendet       ← Zählzeile, wie bisher
```

- Die beiden horizontal scrollenden Chipreihen entfallen. Im Kopf stehen
  nur noch die Filter, die **an** sind, jeder mit einem ×.
- Der Knopf „Filter" trägt die Anzahl aktiver Filter.
- Die Sortierung wird ein Icon-Knopf mit Sheet (zwei Optionen brauchen
  keine permanente Segmentleiste).
- **Beim Scrollen nach unten fahren Titel- und Suchzeile weg**, die
  Filterzeile bleibt sticky. Beim Scrollen nach oben kommen sie zurück.
  Chrom beim Lesen: 40 px statt 220.

### 3.3 Die Listenzeile: ein Raster statt drei Höhen

```
┌─┬────────────────────────────────────────┬────┐
│▌│ La Barcaccia                    ◆ ★4,5 │ ☆  │  22 px
│▌│ Auf einem Schiff mit Holzdeck an der   │    │  36 px  (2 Zeilen,
│▌│ Stadtmauer, abends mit Licht über…     │    │          geklemmt)
│▌│ Essen · 13′ · 2 h · bis 22:00 · 🐾     │    │  20 px
└─┴────────────────────────────────────────┴────┘  = 96 px, immer
 ▲                                           ▲
 Akzentkante 3 px                            Stern, 44×44
```

Regeln:

- **Feste Höhe 96 px.** Kein Umbruch, keine Varianz. Was nicht passt,
  fällt weg — nach fester Priorität, nicht nach Datenlage.
- **Der Name bleibt einzeilig** und ist das Größte in der Zeile.
- **Rating rechtsbündig auf der Namenszeile**, `tabular-nums`. Damit
  entsteht eine scanbare Spalte statt eines Werts, der irgendwo in der
  Faktenreihe steht.
- **Die Notiz bekommt zwei Zeilen** (`-webkit-line-clamp: 2`) statt
  einer abgeschnittenen. Bei 147 Zeichen Durchschnitt ist das der
  Unterschied zwischen halbem Satz und ganzem Gedanken.
- **Die Faktenzeile hat feste Slots** in fester Reihenfolge: Kategorie,
  Gehzeit, Dauer, Öffnung, Hund. Fehlt einer, bleibt er leer statt
  nachzurücken — Zahlen stehen untereinander, man scannt Spalten.
- **Versalien verschwinden aus der Zeile.** Die Kategorie steht in
  Akzentfarbe, aber gemischt geschrieben.
- **Der Gesehen-Haken verlässt die Zeile** (siehe 3.8) und gibt 44 px
  Breite frei.

### 3.4 Aus 43 Badges werden 6 Zeichen

Der Freitext bleibt als Datenfeld und steht im Sheet ausgeschrieben. In
der Liste trägt er nur noch sein Zeichen.

| Klasse | Zeichen | Quelle | Wo sichtbar |
|---|---|---|---|
| Termin läuft | ● + Datum | Badges mit Datum (4 Orte) | Zeile, oben in „Heute" |
| Ungeprüft | ⚠ hohl | „Zeiten prüfen", „Erst anrufen", `hours` mit „ungeprüft" | Zeile, gedämpft |
| Hundregel | 🐾 / 🐾̸ | **nur `dog`** — die 11 Hund-Badges entfallen | Faktenzeile |
| Tageszeit | ◗ | `moment`, sonst hergeleitet | nur in „Heute" |
| Kuratiert | ◆ | „Der Abend", „Fine Dining", „Livemusik" … | Zeile |
| Einschränkung | ⊘ | „Ohne Auto nicht machbar", „Buchen", „Ohne Termin" | Zeile |

Das verlangt eine einmalige Zuordnungstabelle für die 43 Texte — dieselbe
Bauart wie das vorhandene `BADGE_MOMENT`. Ohne diese Tabelle ist das
Redesign an dieser Stelle eine Verschlechterung, weil Information
verschwindet. Mit ihr sind es sechs Zeichen, die man einmal lernt, statt
43 Wörter, die man jedes Mal liest. Und „Default für Sonne" ist weg.

### 3.5 Farbe

Die Palette bleibt — warmes Papier `#F4F0E6`, Tinte `#20201C`, See
`#1E5F73`, Gold `#B8912A`, Ziegel `#A3462F`, Verde `#2F6B5C`. Drei
Korrekturen:

**1. Eine fünfte Kategoriefarbe.** `praktisch` bekommt ein entsättigtes
Stein-Ton:

```css
--stein:     #6B6152;   /* hell: 5,34:1 auf --bg, 5,97:1 auf --card → AA */
--stein-ink: #A79C86;   /* dunkel: 6,19:1 auf --card → AA */
```

Begründung: Apotheke und Supermarkt sind Infrastruktur, keine Attraktion.
Sie sollen im Kantenraster als neutral lesbar sein und nicht mit
Ausflügen verwechselt werden. Damit hat jede der fünf Kategorien eine
eigene Kante.

**2. Gold bedeutet ab jetzt genau eine Sache: gemerkt.** Heute trägt Gold
vier Bedeutungen (Merken-Stern, Aufenthaltsdauer, „Unter 1 h"-Chip,
Tab-Zähler). Neu: Stern, Plan-Tab und Zähler sind Gold. Die Dauer wird
`--soft`, der Dauer-Filter wird `--lake` wie die übrigen Filter.

**3. Verde bedeutet Jum.** Der Gesehen-Haken wird `--soft` statt Verde —
„gesehen" ist eine Archivierung, keine Bestätigung. Die Kategorie `sehen`
behält Verde als Kantenfarbe; Kantenfarben und Zustandsfarben stehen nie
am selben Ort.

### 3.6 Typografie

`style.css` verwendet heute dreißig Schriftgrößen. Vorschlag: **sechs
Tokens**, und Versalien nur noch auf einem davon.

| Token | Größe / Zeilenhöhe | Schnitt | Verwendung |
|---|---|---|---|
| `--t-display` | 1.625rem | Fraunces 600 | „Nachmittag", Ortsname in „Heute", Sheet-Name |
| `--t-title` | 1.25rem | Fraunces 600 | Kopf, Sektionsköpfe |
| `--t-name` | 1.0625rem | Fraunces 600 | Ortsname in der Zeile |
| `--t-body` | 0.9375rem | Karla 400 | Notiz, Fließtext |
| `--t-meta` | 0.8125rem | Karla 500 | Fakten, Chips, Zählzeile |
| `--t-micro` | 0.6875rem | Karla 700 | Marken, Zähler, Tableiste, Versalien |

Dazu die `1rem`-Basis für Body und Suchfeld — nicht verhandelbar, darunter
zoomt iOS beim Tippen. Die Zeile bekommt damit drei klare Stufen:
**Name 1.0625 › Fakten 0.8125 › Marken 0.6875.**

Regeln:

- **Versalien nur auf `--t-micro`, und höchstens einmal pro
  Bildschirmabschnitt.** Heute sind sieben Versalien-Stile gleichzeitig
  sichtbar (Kategorie, Badge, „gesehen", `dl`-Label, Kicker, Datum,
  Lead).
- **`font-variant-numeric: tabular-nums` überall**, wo Zahlen
  untereinander stehen: Rating-Spalte, Gehzeit, Dauer, Zähler.
- Fraunces bleibt für Namen und Überschriften, Karla für alles, was man
  scannt statt liest.

### 3.7 „Heute" als Tagesblatt

```
┌────────────────────────────────────────────────┐
│ FREITAG, 18. SEPTEMBER · TAG 5 VON 15          │
│                                                │
│ Nachmittag                              15:16  │
│ ┌──────┬──────┬════════════┬──────┐            │
│ │ Früh │Mittag│ Nachmittag │ Abend│            │  ← tippbar
│ └──────┴──────┴════════════┴──────┘            │
│   vorbei  vorbei    jetzt     ▸                │
│                                                │
│ Draußen ist es   [ schön ]   [ nass ]          │
├────────────────────────────────────────────────┤
│ FÜR DEN NACHMITTAG · MIT JUM            3 / 12 │  ← Position im Stapel
│                                                │
│ Café & Bar                            ab 7:00  │
│ Pasticceria Pavòn                              │
│ Frühstück ab 7:00.                             │
│ ★ 4,6 · 21′ zu Fuß · 30–45 Min · 🐾            │
│                                                │
│ [      Ansehen      ]  [ ☆ ]  [ ↺ ]  [ → ]    │
├────────────────────────────────────────────────┤
│ SONST FÜR DEN NACHMITTAG                   (9) │
│ Lenoteca — Food Wine & Spirit         25′  🐾  │
│ Palazzina Storica                     17′      │
│ Vecchia Peschiera                     12′      │
│ ▸ alle 9 zeigen                                │
├────────────────────────────────────────────────┤
│ ABENDS DANN                                    │  ← Vorausblick
│ La Barcaccia · Essen · ab 18:00       13′      │
└────────────────────────────────────────────────┘
```

Was sich ändert:

- **Die Segmentleiste ersetzt die stumme Ableitung.** Man sieht den
  ganzen Tag und kann den Abschnitt wechseln — heute zeigt die App nur,
  was die Uhr sagt. „Gleich: Abend" wird ein halb gefülltes Segment statt
  eines Textpräfixes.
- **„3 / 12" statt blindem „Anderer".** Zwei Knöpfe, vor und zurück. Der
  Zähler beantwortet „habe ich schon alles gesehen?".
- **„Sonst noch (9)" statt fix zwei Alternativen**, mit Ausklappen. Die
  Zahl ist die Antwort auf „gibt es noch was?".
- **„Abends dann"** — ein Blick nach vorn. Wer um 15:16 auf Heute geht,
  plant oft schon das Abendessen. Kostet einen weiteren
  `todayList()`-Aufruf.
- **Der Regen-Leerzustand liefert trotzdem.** Statt nur „nichts
  hinterlegt": *„Von 101 Orten ist bei 91 nicht hinterlegt, ob man im
  Trockenen sitzt. Diese 10 sind es sicher:"* — und dann die zehn. Ein
  ehrlicher Leerzustand, der nicht leer ist.
- **Jeder Vorschlag nennt die Einschränkungen, unter denen er entstand**
  („· MIT JUM" im Kicker). Das Muster gibt es schon und wird Regel.

### 3.8 Filter: drei Modelle werden eines

Heute gibt es für eine Aufgabe drei Interaktionsmodelle: Kategorie-Chips,
Flag-Chips und ein Sheet hinter einem Chip. Neu: **ein Knopf, ein
Sheet.**

```
┌ Sheet „Filter" ────────────────────────────────┐
│ ─────                                       ✕  │
│ Filter                              47 Orte    │  ← live
│                                                │
│ KATEGORIE                                      │
│ [Essen 25] [Café & Bar 10] [Sehen 22]          │
│ [Ausflüge 28] [Praktisch 16]                   │
│                                                │
│ WEG UND ZEIT                                   │
│ Höchstens    [15′] [25′] [45′] [egal]          │  ← Stufen statt Ja/Nein
│ Aufenthalt   [<1 h] [<3 h] [egal]              │
│ ⓘ 53 Orte haben keine Gehzeit hinterlegt und   │  ← die stumme
│   fallen aus jeder Weg-Auswahl heraus.         │     Ausblendung, laut
│                                                │
│ ZUSTAND                                        │
│ [ ] Schon gesehene ausblenden            (0)   │  ← eindeutiger Text
│ [ ] Nur Gemerkte                         (4)   │
│                                                │
│ TAGS                              ⌕ [________] │  ← Suche über 85 Tags
│ ▸ Essen & Trinken    fisch 20 · wein 13 · …    │  ← vier Facetten
│ ▸ Draußen            natur 18 · rad 12 · …     │
│ ▸ Stimmung           gehoben 9 · ruhig 4 · …   │
│ ▸ Praktisch          zug 5 · verleih 3 · …     │
│   ▸ 30 seltene Tags zeigen                     │
│                                                │
│ [ Zurücksetzen ]        [ 47 Orte zeigen ]     │
└────────────────────────────────────────────────┘
```

- **„Noch offen" → „Schon gesehene ausblenden".** Die Fehldeutung als
  Öffnungszeit ist damit tot.
- **„Zu Fuß" wird eine Stufenwahl** (15 / 25 / 45 Min) statt Ja/Nein
  bei 25. Und der Hinweis nennt die 53 Orte ohne Wert — genau das, was
  die Jum-Zählzeile heute vorbildlich tut.
- **Tags bekommen Suche und vier Facetten.** Die 85 Tags lassen sich
  über eine Zuordnungstabelle gruppieren; die 30 Einmal-Tags stehen
  hinter „mehr zeigen".
- **Der Abschlussknopf trägt die Trefferzahl.** Man tippt nie „Fertig"
  ins Ungewisse.

### 3.9 Das Detail-Sheet

```
┌────────────────────────────────────────────────┐
│ ─────                                       ✕  │
│ Essen · Sonnenuntergang                        │
│ La Barcaccia                                   │  ← Display
│ ★ 4,5 · 312 Bewertungen                        │
│                                                │
│ ┌──────────┬──────────┬──────────┐             │
│ │   13′    │   2 h    │  bis 22  │             │  ← Faktenkacheln
│ │  zu Fuß  │ Aufenth. │  Öffnung │             │
│ └──────────┴──────────┴──────────┘             │
│ ┌──────────────────────────────────┐           │
│ │ 🐾  Jum darf mit                 │           │  ← eigene Fläche,
│ └──────────────────────────────────┘           │     drei Zustände
│                                                │
│ Auf einem Schiff mit Holzdeck an der           │  ← Notiz vollständig
│ Stadtmauer, abends mit Licht über dem See.     │
│                                                │
│ [        ⚲  Route in Karten        ]           │  ← EIN Primär
│ [ ☆ Merken ] [ ✓ Gesehen ] [ ☎ ] [ ⇪ ]        │  ← Sekundäre, eine Zeile
│                                                │
│ Adresse    Via …, Peschiera del Garda          │
│ Anfahrt    Bus 164 ab Piazzale Betteloni       │
│ Tags       [fisch] [seeblick] [terrasse]       │  ← tippbar → filtert
└────────────────────────────────────────────────┘
```

- **Drei Faktenkacheln oben.** Weg, Dauer, Öffnung sind die drei Fragen
  vor Ort; sie gehören nicht in eine Definitionsliste mit 6.2rem
  Label-Spalte.
- **Die Hundzeile bekommt eine eigene Fläche**, dreizustandig: grün „Jum
  darf mit", grau-durchgestrichen „ohne Jum", ocker-hohl „nicht geklärt
  — vorher fragen". Bei 58 von 101 Orten ist das der Fall; es ist die
  häufigste Antwort und muss so gestaltet sein, nicht als kleingedrucktes
  „nicht geklärt".
- **Vier Pillen werden ein Primär plus eine Icon-Zeile.** Gewinn: rund
  110 px und eine klare Spitze.
- **Die Tags werden tippbar** und setzen den Filter. Heute sind sie toter
  Text; das ist der natürlichste Weg von „das gefällt mir" zu „mehr
  davon".
- **Adresse, Anfahrt und Tags rutschen unter die Aktionen.** Sie werden
  gelesen, nachdem entschieden ist.

### 3.10 „Plan" statt „Gemerkt"

```
┌────────────────────────────────────────────────┐
│ Plan                              Freitag  ▾   │
│ 4 Orte · 5 h 45 gesamt · davon 52′ Weg         │  ← aus time_min + walk_min
│                                                │
│ ⠿ 1   Pasticceria Pavòn         21′     45 Min │
│ ⠿ 2   Palazzina Storica         17′      1 h   │
│ ⠿ 3   Uferweg am Mincio          5′      1,5 h │
│ ⠿ 4   La Barcaccia              13′      2 h   │
│                                                │
│ ⚠ Zwischen 3 und 4 liegen 1,8 km Luftlinie.    │  ← aus geo (78 Orte)
│                                                │
│ [ + Ort hinzufügen ]       [ ⇪ Plan teilen ]   │
└────────────────────────────────────────────────┘
```

- Die Merkliste bekommt eine **Reihenfolge** (Drag-Griff) und ein
  **Zeitbudget**. `time_min` liegt bei 101 von 101 Orten vor und wird
  bisher nur für einen Filter benutzt.
- Die Wegwarnung nutzt `geo` (78 von 101). Fehlt `geo`, bleibt die Zeile
  weg — kein Raten, wie überall sonst.
- Der bestehende Teilen-Link trägt die Reihenfolge einfach mit: ein
  weiteres Feld im base64url.
- Die Tagesauswahl kommt aus `meta.subtitle`; `tripDay()` rechnet das
  bereits.

### 3.11 Interaktion und Navigation

- **Kopf fährt beim Scrollen weg** (Titel + Suche), Filterzeile bleibt.
- **Wischen zwischen den Tabs.** Die Gestenbehandlung des Sheets ist
  bereits sauber gebaut, inklusive der iOS-Eigenheiten — das macht es
  billig.
- **Stern und Haken trennen sich.** Der Stern bleibt auf der Zeile
  (Gold, gefüllt = gemerkt). „Gesehen" wandert auf eine **Wischgeste nach
  links**; gesetzte Orte tragen einen kleinen Haken in der Faktenzeile.
  *Der Knopf im Sheet bleibt als Rückfallebene* — das ist wichtig, weil
  eine Geste allein die Entdeckbarkeit kostet.
- **`history.pushState` beim Öffnen des Sheets**, damit die
  Systemzurück-Geste es schließt statt die App zu verlassen. Auf Android
  und in der iOS-PWA ist das heute ein echter Ausstiegspunkt.
- **Kurze Haptik** bei Merken und Gesehen, wo `navigator.vibrate`
  vorhanden ist.
- **Links am Chip-/Facettenrand derselbe Verlauf wie rechts**, sobald
  gescrollt wurde.

### 3.12 Neue Komponenten

| Komponente | Zweck |
|---|---|
| `SegmentedDay` | Vier-Abschnitte-Leiste in „Heute", tippbar |
| `FactTile` | Kachel Wert/Label, `tabular-nums` |
| `DogRow` | dreizustandige Hundzeile im Sheet |
| `FilterSheet` | ein Sheet für alles, Trefferzahl im Abschlussknopf |
| `ActiveFilterBar` | Kopfzeile mit entfernbaren Chips |
| `MarkSymbol` | der Sechser-Zeichenkanon aus 3.4 |
| `PlanRow` | Zeile mit Griff, Position, Weg, Dauer |
| `HonestEmpty` | Leerzustand, der sagt warum — und was stattdessen geht |

---

## 4. Wirkung

### 4.1 Messbar

| | heute | nachher |
|---|---|---|
| Chrom über der Liste | 220 px | 132 px, beim Scrollen 40 |
| Sichtbare Zeilen (402×754) | 4 | 6, beim Scrollen 7 |
| Zeilenhöhen | 100 / 102 / 123 | eine, 96 |
| Schriftgrößen | 30 | 6 (+ die 1rem-Basis) |
| Gleichzeitige Versalien-Stile | 7 | 1 |
| Badge-Varianten in der Liste | 43 Texte | 6 Zeichen |
| Kategorien ohne eigene Farbe | 2 | 0 |
| Bedeutungen der Farbe Gold | 4 | 1 |
| Interaktionsmodelle fürs Filtern | 3 | 1 |
| Pillen im Detail-Sheet | 4 gleiche | 1 + 4 Icons |
| Position im „Anderer"-Stapel | unsichtbar | „3 / 12", vor und zurück |
| Systemzurück schließt das Sheet | nein | ja |

Die Zeilen pro Bildschirm sind die wichtigste Zahl: von vier auf sechs
sind 50 Prozent, und über 101 Orte gerechnet sinkt der Weg von 25
Bildschirmen auf 17.

### 4.2 Gelöste Probleme

1. **„Noch offen" kann nicht mehr als Öffnungszeit gelesen werden.**
2. **Die stummen Ausblendungen werden benannt** — 53 Orte ohne Gehzeit,
   65 ohne Bewertung. Genau das Muster, das die App bei Jum schon richtig
   macht, gilt jetzt überall.
3. **Der Regentag liefert etwas statt nichts.**
4. **Der Vorschlagsstapel in „Heute" hat Anfang, Ende und Rückweg.**
5. **`time_min` (101/101) und `geo` (78/101) werden zum ersten Mal
   genutzt.**
6. **Der Weg von „gefällt mir" zu „mehr davon" existiert** — über
   tippbare Tags im Sheet.
7. **Das Badge-Chaos wird ein Zeichensystem**, und ein Redaktionsvermerk
   verschwindet aus der Oberfläche.

### 4.3 Was bewusst in Kauf genommen wird

- **Die Notiz auf zwei Zeilen zu klemmen kostet Höhe.** Wenn die
  Zeilenzahl wichtiger ist als die redaktionelle Stimme, fällt sie ganz
  weg und die Zeile schrumpft auf 76 px — dann sind acht Zeilen
  sichtbar. Das ist eine Abwägung, keine Rechenaufgabe.
- **„Gesehen" hinter eine Geste zu legen kostet Entdeckbarkeit.** Der
  Knopf im Sheet bleibt deshalb, und gesetzte Orte tragen weiterhin eine
  sichtbare Marke.
- **Der Zeichenkanon verlangt die einmalige Zuordnung der 43 Badges.**
  Ohne sie verliert die Liste Information statt Lärm.
- **Die Suche bleibt sichtbar statt hinter einem Icon.** Das kostet 48 px
  gegenüber der aggressiveren Variante, aber ein Nachschlagewerk ohne
  sichtbares Suchfeld ist keines.

### 4.4 Reihenfolge der Umsetzung

Nach Verhältnis von Wirkung zu Aufwand:

1. **Beschriftung und Farbe** — „Noch offen" umbenennen, fünfte
   Kategoriefarbe, Gold entkoppeln, Versalien reduzieren, Typo-Tokens.
   Reines CSS und ein paar Strings, keine Logikänderung.
2. **Kopf und Zeile** — Filterzeile zusammenfassen, feste Zeilenhöhe,
   Kopf beim Scrollen wegfahren. Der größte sichtbare Gewinn.
3. **Sheet und Badges** — Faktenkacheln, Hundzeile, ein Primär,
   Zuordnungstabelle für die Badges, tippbare Tags, `history.pushState`.
4. **Heute und Plan** — Segmentleiste, Positionszähler, Vorausblick,
   danach der Plan-Tab mit Reihenfolge und Zeitbudget.

Die Schritte 1 bis 3 sind unabhängig voneinander und einzeln
auslieferbar. Schritt 4 ist der größte und lohnt erst, wenn `moment` und
`indoor` in `places.json` gepflegt sind — sonst wird eine bessere
Oberfläche auf dieselbe dünne Datenlage gesetzt.

---

## 5. Umsetzungsstand

### Schritt 1 — umgesetzt in `v8`

| | v7 | v8 |
|---|---|---|
| Schriftgrößen im Stylesheet | 30 | 6 Tokens + die 1rem-Basis |
| Gleichzeitige Versalien-Stile | 7 | 1 (drei Sektionsmarken in „Heute") |
| Kategorien ohne eigene Farbe | 2 | 0 |
| Farben für „dieser Filter ist an" | 3 (Seeblau, Verde, Gold) | 1 (Seeblau) |
| Gold als Zustandsfarbe | 4 Bedeutungen | 1 (Merkliste) |
| Verde als Zustandsfarbe | 4 Bedeutungen | 1 (Jum) |
| Name zu Kategorie in der Zeile | 1,42 | 1,55 |
| Zeilenhöhen | 100 / 102 / 123 px | 97 / 100 / 122 px |

Im Einzelnen:

- **`--t-display` … `--t-micro`** ersetzen 30 gefühlte Größen. 47
  Fundstellen umgestellt; übrig bleiben zwei harte `1rem` (Body-Basis und
  Suchfeld, beide durch die iOS-Zoom-Grenze gesetzt).
- **Versalien** nur noch in einer Regel, für `.today__date`,
  `.today__kicker` und `.today__lead` — je eine pro Abschnitt. Kategorie,
  Badge, „Gesehen", `dl`-Labels, `sheet__cat` und `today__cat` sind
  gemischt geschrieben.
- **`--stein` `#6B6152` / `#A79C86`** als fünfte Kategoriefarbe für
  `praktisch`. Im gerenderten DOM gemessen: 5,97:1 hell, 6,19:1 dunkel.
  Alle Textfarben beider Schemata liegen über 4,5:1.
- **Gold heißt Merkliste** (Stern, Tab-Zähler, Rahmen der empfangenen
  Liste). Die Aufenthaltsdauer ist neutral, „Unter 1 h" ist seeblau.
- **Verde heißt Jum** (Schalter, „Jum ok"). Der Gesehen-Haken ist
  tintenfarben, die Marke „Gesehen" grau, „Noch nicht gesehen" seeblau,
  die Faktencheck-Haken grau.
- **Ziegel heißt Achtung** — „Offene Punkte" tragen jetzt dieselbe Farbe
  wie „dafür ist es heute zu spät" statt Gold.
- **„Noch offen" heißt „Noch nicht gesehen".**
- **Die Zeilenhöhe blieb neutral.** Die größeren Stufen hatten jede Zeile
  um 7 px wachsen lassen; zurückgeholt über die Innenabstände, engeren
  Durchschuss der einzeiligen Notiz und die Markenstufe für Kategorie und
  Badge. Netto 1–3 px weniger als v7.
- **Zwei tote Regeln entfernt** (`.tag`, `.chip--dog`) und die zweite
  Titelgröße ab 33 rem.

Nicht angefasst, wie angekündigt: Layout, Informationsarchitektur,
Filterlogik, Datenehrlichkeit, Jum-Dauerschalter, Offline-First und die
iOS-Safari-Behandlung.

### Schritt 2 — umgesetzt in `v10`

| | v9 | v10 |
|---|---|---|
| Kopf über der Liste | 219 px | **147 px**, beim Scrollen **43 px** |
| Kopf in „Heute" | 219 px | 105 px |
| Kopf in „Info" | 219 px | 54 px |
| Sichtbare Zeilen (402×754) | 4 | **6**, beim Scrollen **8** |
| Zeilenhöhen | 97 / 100 / 122 px | **eine**, 97 px |
| Chips im Kopf | 9, in zwei scrollenden Reihen | nur die aktiven |
| Bedienmuster fürs Filtern | 3 | 1 |

Im Einzelnen:

- **Der Kopf liegt `fixed`, nicht `sticky`.** Ein Sticky-Kopf belegt Platz
  im Fluss; klappt er beim Scrollen ein, schrumpft das Dokument und die
  Liste springt unter dem Finger nach oben. `.main` hält den Abstand über
  `--bar-full`, das `measureBar()` nach jedem Rendern misst — immer im
  aufgeklappten Zustand, sonst wäre er nach dem ersten Einklappen zu klein.
- **Titel, Dauerschalter und Farbschema teilen sich eine Zeile.** Der
  Jum-Hinweis („39 Orte mit Hund") zieht in die Zählzeile, wo ohnehin
  steht, was ein Filter kostet.
- **Beim Scrollen nach unten** fahren Titel und Suche weg, die Filterzeile
  bleibt. Beim Scrollen nach oben kommen sie zurück. Während des Tippens
  und bei offenem Sheet passiert nichts.
- **Eine Filterzeile statt zweier Chipreihen.** Ein Knopf mit der Zahl der
  aktiven Filter, daneben nur die, die an sind — jeder mit eigenem Kreuz —,
  rechts die Sortierung als Knopf, der seinen Stand nennt.
- **Das Filter-Sheet nimmt alles auf**, nach Gruppen: Kategorie, Weg und
  Zeit, Zustand, Tags. Die 85 Tags bekommen ein Suchfeld. Der
  Abschlussknopf trägt die Trefferzahl. Unter „Weg und Zeit" steht, dass
  53 von 101 Orten keine Gehzeit haben und aus „Zu Fuß" herausfallen — die
  stumme Ausblendung aus Abschnitt 1.3, jetzt laut.
- **Eine Zeilenhöhe für alle 101 Zeilen.** Jede der vier Textzeilen ist
  einzeilig gedeckelt; die Faktenreihe hat feste Slots in fester
  Reihenfolge (Weg, Dauer, Hund, Öffnung), und nur die Öffnung darf
  kürzen, weil sie als einzige Freitext ist — 27 der 54 Angaben sind
  länger als 18 Zeichen. So fällt die Hundregel nie weg, nur weil ein
  Restaurant seine Ruhetage ausschreibt.
- **Die Bewertung steht rechtsbündig auf der Namenszeile** und wird zur
  scanbaren Spalte. Die Zahl der Bewertungen sitzt in einer eigenen, fest
  breiten Spalte — sonst schöbe „(1.478)" die Note weiter nach links als
  „(806)" und die Spalte wäre krumm.

Abweichungen vom Vorschlag oben, bewusst:

- **Die Notiz bleibt einzeilig** statt auf zwei Zeilen geklemmt. Abschnitt
  4.3 nennt beides; bei einer festen Zeilenhöhe von 97 px sind es 6
  sichtbare Zeilen statt 5, und das wiegt hier schwerer.
- **Der Gesehen-Haken bleibt auf der Zeile.** Ihn auf eine Wischgeste zu
  legen (3.11) spart 44 px Breite, aber die Geste ist von dieser Umgebung
  aus nicht auf echtem iOS prüfbar — und genau dort ist schon einmal eine
  Geste durchgefallen, die in Chromium lief. Das gehört auf ein Gerät,
  nicht in diesen Schritt.
- **„Zu Fuß" bleibt Ja/Nein** bei 25 Minuten statt der Stufenwahl aus 3.8.
  Die Stufen sind eine Logikänderung; hier ging es um den Ort der Filter,
  nicht um ihre Semantik. Der Hinweis auf die 53 Orte ist schon da.

### Schritt 3 — teilweise umgesetzt in `v11`

Umgesetzt ist alles außer der Badge-Umstellung; die wartet auf die
Einteilung der 43 Texte.

- **Drei Faktenkacheln** oben im Sheet: Weg, Aufenthalt, Öffnung. Sie
  ersetzen die Definitionsliste mit ihrer 6,2rem breiten Label-Spalte, die
  das Gewicht auf das Label statt auf den Wert legte.
- **Die Öffnungs-Kachel ist bewusst streng.** `hoursWindow()` liest zur Not
  auch ein Zeitfenster und nimmt davon das erste — als Kachel stünde dann
  „bis 14:00" über einem Restaurant, das abends bis 22 Uhr offen hat. Die
  Kachel zeigt deshalb nur ein ausgeschriebenes „bis" oder „ab" (22 der 54
  Angaben); alles andere steht im vollen Wortlaut darunter. Die Zeile
  darunter entfällt, wenn sie nichts sagt, was die Kachel nicht schon zeigt.
- **Die Hundzeile** mit drei Zuständen und eigener Fläche. „Nicht geklärt"
  trägt Ziegel, dieselbe Achtungsfarbe wie „Zeiten ungeprüft", und eine
  gestrichelte Kante.
- **Ein Primär plus Icon-Reihe** statt vierer gleich breiter Pillen.
- **Tippbare Tags** unter „Mehr dieser Art". Sie ersetzen die bisherige
  Auswahl, statt sie zu erweitern, und räumen den Suchbegriff mit ab —
  sonst stünde über dem Ergebnis „1 von 101", weil die alte Suche noch
  mitfiltert, und niemand sähe warum.
- **`history.pushState`**: die Systemzurück-Geste schließt das Sheet,
  statt die App zu verlassen. `closeSheet(fromPop)` prüft auf `=== true`,
  weil `onTap` sein Event als erstes Argument durchreicht — als truthy
  wäre der Verlaufseintrag stehengeblieben und die Geste tot.

**Die Badges** sind seit `v12` mit umgestellt. Die Einteilung aus
Abschnitt 3.4 war an drei Stellen zu grob und wurde vor der Umsetzung
korrigiert:

- **Sieben Badges verdoppelten einen Tag**, der bei allen betroffenen Orten
  ohnehin gesetzt war (`aussicht`, `foto`, `schatten`, `wein`, `livemusik`,
  `cocktails`, `regen`) — geprüft, ausnahmslos. Ersatzlos entfernt.
- **Drei der elf Hund-Badges tragen Information, die `dog` nicht hat:** in
  Sirmione ist nur die Burg tabu (`dog: true`), auf der Isola gilt
  Leinenpflicht, auf dem Linienschiff fährt er gratis. Sie bleiben in den
  Daten und stehen als Zusatz in der Hundzeile des Sheets — in der Liste
  wären sie neben „Jum ok" nur Lärm. Die übrigen acht sind entfernt.
- **Fünf weitere waren gar keine Badges:** „Montags", „Auch sonntags" und
  „Immer offen" standen bereits wortgleich in `hours`, „Ganzer Tag" ist
  über `time_min: 270` ohnehin abgedeckt, und „Schiff hin, Bus zurück"
  gehört in `connection`, wo es jetzt steht.

Zwei Orte hätten durch das Löschen ihre Tageszeit verloren, weil
`BADGE_MOMENT` sie über den Badge herleitete (7 Ponti über „Livemusik",
Lido 3.9 über „Cocktails", beide → Abend). Sie haben jetzt ein explizites
`moment` — die ersten beiden von 101.

**Abweichung vom Vorschlag:** Abschnitt 3.4 sagte „in der Liste trägt der
Badge nur noch sein Zeichen". Der Text bleibt stehen. Das Problem war nie
seine Länge, sondern dass 43 Texte identisch aussahen; nach dem Aufräumen
tragen nur noch 31 Orte einen Badge, und „Rohfisch" oder „Fine Dining"
sagen mehr als jedes Zeichen für sich. Das Zeichen sagt jetzt die Klasse
dazu — ein Termin, der heute läuft, sieht nicht mehr aus wie eine
Geschmacksnotiz.

Statt der im Audit geschätzten 20 Texte auf 30 Orten sind es **27 auf 31**
— die Schätzung war zu niedrig.

### Schritt 4 — offen
