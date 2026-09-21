# Übergabe — iOS-Verhalten und Browser-Prüfstand

Verfasst von der Sitzung, die das iPhone-Verhalten und die Koordinaten betreut
hat. Adressat: der zusammenführende Coder.

---

## 1. Was diese Spur besitzt

**Die App muss auf einem echten iPhone funktionieren.** Nicht das Aussehen —
das gehört den Design-Sitzungen. Sondern: reagiert ein Tipp, schließt das ✕,
bleibt der Hintergrund stehen, kommt der neue Stand beim Benutzer an.

Konkret gehören dazu:

- `scripts/browser/` — der Browser-Prüfstand, eine Datei je Thema, gestartet
  von `scripts/browser/run.mjs` (neu, war vorher nur in einem Temporärordner
  dieser Sitzung und wäre mit ihr verloren gegangen). Die aktuelle Zahl der
  Prüfungen steht in der README und wird vom Läufer selbst gezählt —
  abgeschrieben veraltet sie, gezählt nicht.
- `koordinaten.html` und `scripts/add-coords.mjs` — die einmalige Koordinatensuche
- `selbsttest.html` — Diagnoseseite für echte Geräte
- `docs/koordinaten-pruefliste.md` — Stand und Regeln der Koordinaten

---

## 2. Das Wichtigste: die Fehlerklasse, die hier nicht sichtbar ist

Getestet wird in Chromium auf Linux. **iOS Safari verhält sich an mehreren
Stellen anders, und diese Unterschiede sind zweimal als Fehler beim Benutzer
gelandet**, während hier alles grün war.

Wer an den folgenden Stellen etwas ändert, ändert an einer Narbe:

| Vorkehrung | Wogegen | Was passiert ohne sie |
|---|---|---|
| `onTap()` statt `click`-Zuhörer am ✕ und am Hintergrund | Safari liefert nach einer abgefangenen Geste **keinen** Klick mehr | Das ✕ wirkt tot, nur Wischen schließt |
| Kein `-webkit-overflow-scrolling: touch` | Hebt den Container auf eine eigene Grafikebene, darüberliegende Knöpfe werden untippbar | Das ✕ ragte zu 36 von 44 px in diese Ebene und war tot |
| `z-index: 3` auf `.sheet__close`, `z-index: 1` auf `.sheet__body` | Dasselbe, zweite Absicherung | s. o. |
| Wischschwelle 12 px, Gesten starten nie auf einem Bedienelement | Ein Finger wackelt beim Tippen; ab der Schwelle rief der Code `preventDefault()` und der Klick entfiel | Merken, Anrufen und Maps-Link im Sheet reagieren nicht |
| `body` wird bei offenem Sheet `position: fixed`, Scrollposition gemerkt | `overflow: hidden` hält iOS nicht auf | Hintergrund scrollt mit, nach dem Schließen ist man woanders |
| `[hidden] { display: none !important }` | Klassenregeln mit `display` überstimmen sonst das Verstecken | Das Löschen-✕ im Suchfeld stand immer da |
| `touch-action: manipulation` auf Bedienelementen | Safari wartet sonst auf einen möglichen Doppeltipp | Jeder Tipp fühlt sich träge an |
| Tableiste fährt bei offener Tastatur weg | iOS hängt fixierte Elemente an den sichtbaren Ausschnitt | Die Leiste klebt über der Tastatur und verdeckt das erste Ergebnis |
| `dvh` mit `vh` als Rückfall, `viewport-fit=cover` + `env(safe-area-inset-*)` | Adressleiste und Randbereiche | Abgeschnittene Inhalte |
| Fokusring hängt nicht an `color-mix()` | Erst ab Safari 16.4 | Kein sichtbarer Fokus auf älteren Geräten |
| `showSheet()` bricht einen laufenden Schließvorgang ab | Das Ausblenden läuft 260 ms nach | Sheet schließen und sofort ein anderes öffnen → das neue schließt sich selbst |

**Keine dieser Vorkehrungen lässt sich in Chromium als nötig nachweisen.**
Sie sind alle aus echten Fehlern auf dem Gerät des Benutzers entstanden.

---

## 3. Der Prüfstand

```bash
node scripts/browser/run.mjs            # alle, startet den Server selbst
node scripts/browser/run.mjs close ios  # einzelne
node scripts/test-logic.mjs             # Logik ohne Browser (andere Spur)
```

| Suite | Prüft |
|---|---|
| `close` | Das ✕ in allen Versagenswegen — Maus, Tap, Tap mit 6/12/20/30 px Wackler, Berührung ganz ohne Klick-Ereignis, weggerutschter Finger, Doppelauslösung, sofortiges Neuöffnen, Zurück-Geste |
| `geo` | Trefferfläche und Ebenen des ✕ auf 402×754, auch nach dem Scrollen im Sheet |
| `audit` | Tap gegen Wischen auf jedem Bedienelement, Scroll-Sperre, Fokusrückgabe, kein hängender Sperrzustand |
| `ios` | `touch-action`, Tastaturverhalten, Textauswahl beim Langdrücken |
| `seen` | Gesehen-Markierung auf Karte und im Sheet, Filter, Persistenz |
| `share` | Listen teilen über zwei getrennte Browser-Kontexte: zusammenführen, ersetzen, verwerfen, kaputter Link |
| `koord`, `koord2`, `orts`, `stale` | Koordinatensuche gegen nachgestellte Dienste |
| `selftest` | Die Diagnoseseite selbst |

**Der Prüfstand testet Verhalten, nicht Aussehen.** Layoutänderungen dürfen
ihn brechen; dann die Selektoren nachziehen, aber **keine Zusicherung
streichen, die eine der Zeilen aus Abschnitt 2 absichert**.

### Fallen beim Schreiben solcher Tests

- **Nie `isMobile: true` in Playwright.** Dieses Chromium ignoriert dann die
  gesetzte Fenstergröße und nimmt 498×933. Richtig:
  `{ viewport: {width:402, height:754}, deviceScaleFactor:3, hasTouch:true }`.
  402×754 ist das Gerät des Benutzers (iPhone, **iOS 27**, Safari 27).
  Hier stand bis 19.09.2026 „iOS 18.7, Safari 27" — das widersprach sich
  selbst, Safari trägt seit der Jahresnummerierung dieselbe Zahl wie iOS.
  Der Besitzer hat iOS 27 bestätigt. Wer hier etwas über das Verhalten von
  Safari behauptet, muss dazuschreiben, für welche Fassung es galt.
- **Sichtbarkeit prüfen, nicht Attribute.** `el.hidden === true` hat monatelang
  bestanden, während das Element sichtbar war.
- Die Startansicht ist „Heute"; Suiten wechseln zuerst auf „Orte".
- Aktive Reiter tragen `aria-current="page"`, nicht `aria-selected`.

---

## 3a. Die Regel, die am 19.09.2026 dazukam

**Die App laeuft als Seite in Safari, nicht als installierte App. Nichts
bauen, was eine Installation voraussetzt.**

An dem Tag sind `shortcuts` und `screenshots` ins Manifest gewandert und noch
am selben Tag wieder heraus. Beide wirken frueheste ab einem Symbol auf dem
Homescreen; auf iOS nach allem, was die Release Notes von Safari 26.0 bis 27.0
hergeben, nicht einmal dann — dort taucht das Web-App-Manifest in einem ganzen
Jahr nur im Zusammenhang mit Browser-Erweiterungen auf. Nachgeprueft am
19.09.2026 gegen developer.apple.com; Schweigen in Release Notes ist ein
Hinweis, kein Beweis. Der Beweis ist das Geraet.

Was stattdessen traegt: alles, was eine Adresse kann. `?v=heute` und
`?v=gemerkt` oeffnen eine Ansicht direkt, als Lesezeichen oder geteilter Link.

## 4. Koordinaten

**Stand: 100 von 101.** Der eine offene steht mit Begründung in
`docs/koordinaten-pruefliste.md`.

Die Suche prüft ihre Treffer, statt sie zu übernehmen — beim ersten Durchlauf
waren drei Orte falsch verortet:

1. **Ortsname.** Steht ein Ort in der Adresse, muss ein aussagekräftiges Wort
   davon im Ergebnis vorkommen. Auf Wortebene, weil der Dienst bei Ortsteilen
   die Gemeinde nennt („Colà di Lazise" → „Colà, Lazise, Verona").
2. **Entfernung.** Die Luftlinie kann nie länger sein als die gemessene
   Straßenentfernung. Grenze `distance_km × 1,15 + 0,5 km`.

**Nicht gebaut und bewusst nicht:** eine Untergrenze für die Entfernung. An den
Daten gemessen verwirft jeder Schwellenwert, der die falschen Treffer fängt,
zugleich 17 bis 25 korrekte Orte.

13 der offenen Orte sind Uferwege, Radrunden, Bootstouren und Termine. Die
haben keinen sinnvollen Einzelpunkt und sollen leer bleiben — **eine Karte muss
das aushalten und darf sie nicht aus der App verlieren.**

Sieben sind echte Orte mit Adresse und fehlen einfach. Ein Durchlauf von
`koordinaten.html` sollte sie finden.

---

## 5. Was blockiert ist

Die Egress-Policy dieser Umgebung sperrt:

- `nominatim.openstreetmap.org` → Geocoding nur im Browser des Benutzers
- `cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com` → **Leaflet lässt
  sich nicht vendoren**
- `tile.openstreetmap.org` → Kartenkacheln nicht prüfbar
- Playwrights WebKit-Download → echtes Safari nicht testbar

**Die Kartenansicht ist deshalb nicht baubar**, bevor jemand auf dem Mac des
Benutzers drei `curl`-Befehle ausführt (stehen im README). Nicht anfangen,
bevor die Dateien im Repo liegen.

Google Fonts ist erreichbar.

> **Nachtrag 19.09.2026, v23:** irrelevant geworden — die Schriften liegen
> jetzt unter `fonts/` im Repo, genau wie Leaflet. Nichts lädt mehr von
> einem fremden Server.

---

## 6. Offen, mit Zuständigkeit

| Was | Wer |
|---|---|
| 1 Ort ohne Koordinate | Benutzer: `koordinaten.html` öffnen, **Starten** |
| Leaflet vendoren | Benutzer: drei `curl`-Befehle auf dem Mac |
| `dog` bei 58 von 101 Orten ungeklärt | Recherche. Größte inhaltliche Lücke — betrifft jede Entscheidung mit dem Hund |
| Schriften laden auf dem iPhone? | Seit v23 aus dem Repo statt von Google. `selbsttest.html` zeigt es weiterhin an |
| Kartenansicht | Gebaut (v21), Nadeln gebündelt seit v25 |

---

## 7. Zwei Bitten

**`data/places.json` gehört nicht dieser Spur.** Zwei Sitzungen pflegen darin
`indoor`, `moment` und die Badge-Klassen; eine hat bereits einen stillen
Datenverlust beim Zusammenführen abgefangen. Ich habe die Datei zuletzt nur
angefasst, um drei nachweislich falsche Koordinaten auf `null` zu setzen.

**`VERSION` in `app.js` und `CACHE` in `sw.js` müssen zusammen hochgezählt
werden.** Sonst bekommen Bestandsgeräte den neuen Stand nicht. Die Versions-
nummer steht im Footer der App — das ist die einzige Möglichkeit, aus der
Ferne zu klären, ob ein gemeldeter Fehler noch besteht oder nur ein alter
Stand im Offline-Speicher liegt. Das hat hier einmal zwei Reparaturrunden am
falschen Ende gekostet.
