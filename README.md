# Peschiera kompakt

Nachschlagewerk für Peschiera del Garda — Essen, Café, Sehen, Ausflüge,
Praktisches. Mobil-first, offline lauffähig, Hund (Jum) durchgängig als
Filterkriterium.

Vanilla HTML/CSS/JS. Kein Framework, kein Bundler, kein Build-Schritt —
GitHub Pages liefert das Repo unverändert aus.

## Zielgerät — vor jeder Änderung lesen

**Ein iPhone auf iOS 27, Safari, 402×754. Die App läuft als Seite im Browser,
nicht als installierte App.**

Daraus folgt eine harte Regel: **nichts bauen, was eine Installation
voraussetzt.** Manifest-`shortcuts` und -`screenshots` sind genau das — sie
wirken frühestens, wenn ein Symbol auf dem Homescreen liegt, und auf iOS nicht
einmal dann. Beide standen am 19.09.2026 kurz im Manifest und sind wieder
heraus; die 162 kB Bilder dazu ebenso.

Was stattdessen geht: alles, was eine Adresse kann. `?v=heute` und
`?v=gemerkt` öffnen die App direkt in einer Ansicht — als Lesezeichen, als
geteilter Link, und falls doch jemand ein Symbol anlegt, auch als zweites
Symbol. Kein Manifest nötig.

Die iOS-Eigenheiten, die die Oberfläche betreffen, stehen unten unter
„Was für iOS Safari angepasst ist" und ausführlich in
`docs/UEBERGABE-ios-und-tests.md`. Wer dort etwas über Safari behauptet,
schreibt die Fassung dazu, für die es gilt.

## Was drin ist

| | |
|---|---|
| **PWA** | `manifest.webmanifest` + `sw.js`. App-Shell und `places.json` liegen im Cache, nach einmaligem Laden läuft alles offline — Merkliste inklusive. Auf dem iPhone-Homescreen installierbar, mit Icon und Startbild. |
| **Suche** | Ein Feld, Volltext über Name, Adresse, Notiz und Tags. Filtert bei jedem Tastendruck, kein Enter nötig. Diakritika werden normalisiert: „cafe" findet „Caffè", „strasse" findet „Straße". Mehrere Begriffe sind UND-verknüpft. **Seit v35 steht das Feld nur noch in „Entdecken"** — bis dahin auch auf der Startansicht, weil der Reiter „Orte" hieß und nicht sagte, dass 101 Orte dahinterliegen. Der Reiter sagt es jetzt selbst, und am Ende von „Jetzt" steht weiterhin „Alle 101 Orte durchsuchen". Oben sind damit rund 60 px frei, und dort steht der Tagesplan. |
| **Jetzt** | Hieß bis v34 „Heute". Der Tagesplan ist seit v35 der **Hauptinhalt**, nicht mehr ein Block über einem Vorschlag: „Heute · 1 von 4 · noch 3,8 h" mit Fortschrittsbalken, darunter die Stationen zum Abhaken, jede mit ihrer Hundmarke. Ist für heute nichts geplant, steht der Block trotzdem da und sagt es, mit einem Knopf ins Tages-Sheet — bis v34 fehlte er ganz, und wer nie einen Tagesplan anlegte, erfuhr nicht, dass er könnte. Datum und Reisetag stehen in der Kopfleiste. Darunter eine Leiste über alle vier Abschnitte: vergangene sind gestrichelt umrandet, der laufende trägt eine Unterkante, jeder ist antippbar. Der Vorschlag nennt seine Position im Stapel („3 / 35") und hat Knöpfe vor und zurück; am Anfang ist der Zurück-Knopf deaktiviert. „Sonst noch" zeigt drei Alternativen mit der Gesamtzahl daneben und lässt sich ausklappen. Darunter ein Blick auf den nächsten Abschnitt („Abends dann"). Das Wetter wird **gefragt**, nicht abgerufen — kein externer Dienst, offline unverändert. Bei Regen ohne Treffer nennt der Leerzustand die Orte, die sicher im Trockenen sind; schränkt der Jum-Schalter ein, sagt er das und zeigt, was ohne ihn ginge. |
| **Reise** | Hieß bis v13 „Gemerkt", bis v34 „Plan". Seit v28 gehört jede Station **einem Reisetag**, seit v37 zählen auch die **Wege** dazwischen mit — gerechnet, nicht geroutet, und als „≈" gekennzeichnet (siehe „Wege"). **Seit v36 ist es eine Ansicht statt zweier Hälften hinter einem Umschalter**: Kopf („Fünfzehn Tage · 4 verplant · 8 Orte"), Raster über alle fünfzehn Tage, eine Karte je verplantem Tag, eine Karte für den nächsten freien Tag, darunter der Vorrat. Bis v35 kostete der Umschalter einen Tipp für etwas, das man beim Planen ständig zusammen braucht — man zieht aus dem Vorrat in einen Tag. Nummerierte Stationen und die Pfeile zum Umstellen innerhalb des Tages stehen jetzt im Tages-Sheet (keine Wischgeste — zwei Knöpfe sind bei einer Handvoll Stationen treffsicherer und lassen sich ohne echtes iOS prüfen); die Übersicht zeigt, das Sheet ändert. Die Tageskarte nennt die Zeitsumme aus `time_min` und sagt dazu, auf wie viele Orte sie sich stützt, wenn Werte fehlen. Zwischen zwei Stationen mit `geo` steht ab 1,2 km die Luftlinie als Warnung; fehlt `geo` bei einer der beiden, bleibt die Zeile weg. Suche, Filter und Sortierung sind dort ausgeblendet — sie würden die Reihenfolge zerschießen, um die es gerade geht. Der Teilen-Link trägt Reihenfolge und Tage automatisch mit. Ausführlich im Abschnitt „Reise: Tage und Vorrat" weiter unten. |
| **Ruhetage** | Steht der Ruhetag wörtlich in `hours` („Ruhetag Mittwoch", „Mi geschlossen", „Mo zu"), wird er gelesen: 14 der 101 Orte tragen einen, verteilt auf Mo 4, Di 4, Mi 6. In „Heute" sinken sie an ihrem Ruhetag ans Ende der Liste — vor jedem anderen Kriterium, eine gute Bewertung hilft an einem geschlossenen Mittwoch nicht. Herausgefiltert werden sie nicht, sonst schrumpfte die Liste still; wer weiterblättert, bekommt den Grund dazugeschrieben („heute Ruhetag"). In der Liste und im Detail ersetzt „heute zu" die Öffnungsangabe — derselbe Slot, dieselbe Zeilenhöhe. Gelesen wird nur `hours`, nie `note`: dort steht bei einem Ort eine Faustregel über italienische Fischläden allgemein, keine Angabe über diesen Laden. |
| **Von hier** | Alle Entfernungen gelten ab dem Zeltplatz — richtig für „gehen wir heute Abend hin?", falsch, wenn man gerade in Sirmione steht. Im Filter-Sheet unter „Standort" misst ein Knopf ab dem Gerätestandort: Luftlinie, keine Gehzeit. Der Standort kommt vom Gerät, nicht von einem Dienst — er funktioniert im Flugmodus, verlässt das Gerät nicht und wird nirgends gespeichert; gefragt wird erst auf Tippen. Ist er an, misst die Sortierung „Entfernung" ab hier, die Faktenzeile zeigt im selben Slot „286 m von hier", und im Kopf steht ein Chip mit Kreuz. Orte ohne `geo` stünden hinten — seit 19.09. gibt es keine mehr. Im Detail bleibt die Angabe ab dem Zeltplatz als eigene Zeile stehen. |
| **Mit Jum** | Dauerschalter im Kopf, kein Chip: der Hund ist vierzehn Tage lang bei jeder Entscheidung dabei, also bleibt die Einstellung an. Persistenz über `localStorage` (`pk.jum`), unabhängig von „Filter zurücksetzen". **Seit v34 blendet er nichts mehr aus** — er zählt, beschriftet und sortiert. Ausführlich unter „Die Hundregel" weiter unten. |
| **Filter** | Ein Knopf, ein Sheet: Kategorie, „Zu Fuß" (`walk_min ≤ 25`), „Unter 1 h" (`time_min ≤ 60`), „Noch nicht gesehen" und die 85 Tags mit eigenem Suchfeld. Innerhalb einer Gruppe ODER, zwischen den Gruppen UND. Im Kopf steht nur, was gerade an ist — jeder Chip trägt sein Kreuz, ein Tipp nimmt ihn weg. Der Abschlussknopf nennt die Trefferzahl, man tippt nie „Fertig" ins Ungewisse. Unter „Weg und Zeit" steht, dass 53 der 101 Orte keine Gehzeit hinterlegt haben und aus „Zu Fuß" herausfallen — dieselbe Auskunft, die die Zählzeile beim Jum-Schalter gibt. |
| **Kopf** | **Seit v35 trägt die Kopfzeile die Ansicht, nicht den App-Namen**: „So 20.09. · Tag 7 von 15", „Entdecken · 101 Orte", „Reise · 14.–28. September 2026", „Wissen". Der Name stand auf allen vier Ansichten gleich da — eine Zeile, die man einmal liest und danach nie wieder braucht. Ansichtszeile, Dauerschalter und Farbschema teilen sich eine Zeile, darunter Suche und Filterzeile: 147 px statt 219. Beim Scrollen nach unten fahren Titel und Suche weg und nur die Filterzeile bleibt — 43 px. Oben angekommen klappt er wieder auf. Er liegt `fixed`, nicht `sticky`: ein Sticky-Kopf belegt Platz im Fluss, und beim Einklappen würde die Liste unter dem Finger wegspringen. |
| **Tags** | Über achtzig Stück — zu viele für eine Chip-Reihe. Sie liegen hinter dem Knopf „Tags" im selben Sheet, das auch den Ort zeigt, nach Häufigkeit sortiert und mit laufender Trefferzahl. |
| **Aufenthaltsdauer** | Auf jeder Karte kompakt (`3 h`, `45 Min`), im Detail die volle Textfassung („1–1,5 h, mit Museum 2 h"). |
| **Sortierung** | Ein Knopf rechts in der Filterzeile, der seinen Stand nennt und beim Tippen umschaltet: Entfernung (Standard) oder Bewertung. Zwei Möglichkeiten brauchen keine dauerhafte Segmentleiste. Orte ohne Wert stehen hinten, nicht vorne. |
| **Merkliste** | Stern auf jeder Karte, eigener Reiter „Reise" mit Zähler. Persistenz über `localStorage` (`pk.saved`), jeder Zugriff in try/catch. Die Reihenfolge steckt im Array und wird beim Merken hinten angehängt; innerhalb eines Tages ist sie die Reihenfolge der Stationen. Gemerktes ohne Tag heißt in der Ansicht **Vorrat**. |
| **Eigene Notiz** | Ein einzeiliges Feld im Detail, direkt unter der Hundzeile — dort, wo die häufigste offene Frage steht: bei 58 von 101 Orten ist die Hunderegel ungeklärt, und wer vor Ort gefragt hat, konnte die Antwort bis v22 nirgends hinschreiben. Speichert beim Verlassen des Feldes **und** beim Schließen des Sheets, auch über die Zurück-Geste; ein Speichern-Knopf wäre ein zweiter Schritt für etwas, das man im Vorbeigehen tippt. In der Listenzeile steht die Notiz **vor** der Beschreibung — sie ist das, was man selbst herausgefunden hat. Liegt nur im Gerät (`pk.notes`), nie in `places.json`: Notizen sind persönlich. Wird aus einer Notiz eine Tatsache, führt der Weg über die offenen Punkte. Der Teilen-Link trägt sie mit, aber nur die vorhandenen; beim Zusammenführen gewinnt die eigene. |
| **Termine mit Vorlauf** | Vier Orte tragen ein Datum im Badge. „Läuft heute" ist beim Wochenmarkt am Dienstag zu spät — wer morgens davon liest, packt keine Kühltasche mehr. Seit v22 steht über dem Tagesvorschlag eine Zeile je Termin, der in den nächsten **drei** Tagen anfängt: „Morgen · Wochenmarkt Desenzano · Di 22.09.", antippbar. Drei Tage, nicht sieben: bei fünfzehn Reisetagen und vier Terminen stünde die Zeile sonst an neun Tagen da und würde zur Tapete. |
| **Schon gesehen** | Haken auf jeder Karte und im Detail. Gesehene Orte werden gedämpft dargestellt und tragen eine Marke; der Chip „Noch nicht gesehen" blendet sie aus. **In „Heute" verschwinden sie seit v20 ganz** — bis dahin standen sie nur hinten, was bei fünfzehn Reisetagen heißt, dass der Stapel sich mit Orten füllt, an denen man schon war, und „1 / 37" eine Auswahl verspricht, die es nicht mehr gibt. In der Liste bleiben sie sichtbar: dort sucht man, in „Heute" bekommt man vorgeschlagen. Wird ein Abschnitt dadurch leer, sagt der Leerzustand das und bietet „Trotzdem zeigen" — für diesen Abschnitt, bis zum nächsten Wechsel. Der Chip hieß bis v7 „Noch offen" und wurde neben Fakten wie „öffnet 9:30" als Öffnungszeit gelesen. Eigener Speicher, unabhängig vom Merken. |
| **Teilen** | Im Reiter „Reise": ein Link, der Merkliste und Gesehenes enthält. Empfänger kann zusammenführen, ersetzen oder verwerfen. **„Meine ersetzen" ist seit v19 umkehrbar**: der Knopf nennt vorher, was er kostet („Meine 12 ersetzen"), ist als einziger ziegelrot abgesetzt und steht zuletzt; danach steht zehn Sekunden lang „Rückgängig" im selben Kasten. Die Kopie liegt in einer Variablen, nicht im Speicher — nach dem Neuladen ist das Angebot ohnehin vorbei. Öffnet man in der Zeit einen Ort, endet es: hinter einem Sheet wäre der Knopf sichtbar, aber nicht antippbar. |
| **Suchtreffer** | Ein Treffer über die Notiz zeigt seit v19, *warum* der Ort dasteht: die Fundstelle ist im Notiztext hervorgehoben, in Liste und Detail, jeder Begriff einzeln. Die Markierung trägt nur einen Untergrund und erbt die Textfarbe — die Browservorgabe schwarz auf gelb fiele im dunklen Schema auf 2,1:1. In der Liste ist die Notiz einzeilig gekürzt; liegt die Fundstelle dahinter, sieht man sie erst im Detail. |
| **Ansicht in der Adresse** | `?v=heute` und `?v=gemerkt` öffnen die App direkt in einer Ansicht (die Kennungen sind älter als die Reiternamen „Jetzt" und „Reise" und bleiben, damit Lesezeichen weiter gelten) — als Lesezeichen oder geteilter Link, ohne Installation. Geprüft gegen die Reiterkennungen, damit ein Tippfehler keine leere App erzeugt. Ein Teilen-Link mit Merkliste überstimmt den Parameter: eine geschickte Liste ist dringender. |
| **Die Reiter heißen nach ihrer Frage** | Seit v35: **Jetzt** (was ist gerade dran?), **Entdecken** (was gibt es überhaupt?), **Reise** (was steht in fünfzehn Tagen an?), **Wissen** (was muss ich wissen?). „Heute" und „Plan" beantworteten beide die erste Frage und stritten sich darum; „Orte" beschrieb die Datei, nicht die Handlung. Die **Kennungen bleiben** `heute`, `orte`, `gemerkt`, `info` — an ihnen hängen `?v=`-Lesezeichen und der Speicher. Bis v26 hieß der vierte „Info" mit i-Kringel — das versprach ein Impressum. Er trägt Hunderegeln, Notruf, Trinkgeld, Bus-Zeiten und die offenen Punkte; ein Reitername muss sagen, was man bekommt. Die Kennung bleibt `info`, `?v=info` funktioniert als Lesezeichen weiter. Der Fuß zeigt seit v27 `meta.hinweis` (einen Satz für den Nutzer) statt `meta.note` (die Provenienz-Doku der Daten mit Feldnamen — die stand wörtlich in der App). |
| **Liste** | Eine Zeile je Ort statt einer Karte: Haarlinie statt Kasten, kein Schatten, Notiz einzeilig gekürzt, Tags nur im Detail, Luftlinie nur im Detail. **Alle Zeilen sind 97 px hoch** — vorher waren es je nach Datenlage 97, 100 oder 123, und das Auge fand beim Scrollen kein Raster. Die Bewertung steht rechtsbündig auf der Namenszeile und wird damit zu einer Spalte, die man scannen kann; die Zahl der Bewertungen sitzt in einer eigenen, fest breiten Spalte, damit „(1.478)" die Note nicht weiter nach links schiebt als „(806)". Sie bleibt dabei — „4,9" aus 71 Stimmen ist nicht dasselbe wie „4,9" aus 1087. Die Faktenreihe hat feste Slots in fester Reihenfolge (Weg, Dauer, Hund, Öffnung); nur die Öffnung darf kürzen, weil sie als einzige Freitext ist. Die farbige Kante links bleibt das Kategoriesignal. Auf 402×754 sind 6 Zeilen sichtbar statt 4, beim Scrollen 8. Steht „Mit Jum" an, trägt seit v34 **jede** Zeile ihre Hundmarke — „Jum ok", „Hund offen" oder „ohne Jum". Bis dahin entfiel sie, weil sie für alle galt; seit der Schalter nichts mehr ausblendet, gilt sie das nicht mehr. Ist ein Ort einem Reisetag zugeordnet, steht sein Tag im Öffnungs-Slot. |
| **Detailansicht (neu)** | Bottom Sheet, oben drei Kacheln — Weg, Aufenthalt, Öffnung: die drei Fragen, die man vor Ort stellt. Die Öffnungs-Kachel zeigt nur ein ausgeschriebenes „bis 22:30" oder „ab 9:30" (22 der 54 Angaben); wo die Zeiten mehrdeutig sind („Mi–Sa 12:30–14 und 19:30–22"), bleibt sie leer und der volle Wortlaut steht darunter — eine Kachel „bis 14:00" über einem Restaurant, das abends bis 22 Uhr offen hat, wäre falsch. Darunter die Hundregel als eigene Fläche, seit v34 mit **vier** Zuständen und einer Frage darunter: grün „Jum darf mit", grau-durchgestrichen „Ohne Jum", ockerfarben-gestrichelt „Nicht geklärt — vorher fragen" (58 Orte, die häufigste Antwort) und grün mit zweitem Ring „von euch bestätigt". Bei offener Regel steht darunter „Wart ihr da?" mit zwei Knöpfen und, wo eine Nummer hinterlegt ist, „Anrufen" — siehe „Die Hundregel". Ebenfalls seit v34: ein **Tag-Wähler** für jeden Ort, nicht mehr nur für gemerkte. Eine Primäraktion („Route in Karten") statt vierer gleich breiter Pillen, darunter Merken, Gesehen und Anrufen als Icon-Reihe. Die Tags am Ende sind antippbar und setzen den Filter — der Weg von „das gefällt mir" zu „mehr davon". Die Systemzurück-Geste schließt das Sheet, statt die App zu verlassen. |
| **Detailansicht (Rest)** | Bottom Sheet: Bewertung, Öffnungsinfo, Entfernung zu Fuß und mit dem Rad, Adresse, Telefon als `tel:`-Link, Hundregelung, Anfahrt, Notiz, Google-Maps-Link. Schließt per Backdrop, ✕, `Esc` oder Wischen nach unten. Solange es offen ist, liegt der Rest der Seite still: `inert` plus `aria-hidden`, dazu ein Tab-Ring im Sheet als Rückfallebene für Engines ohne `inert`. Ohne das führt `aria-modal` nur in die Irre — der Tabulator lief vorher hinter dem Sheet weiter durch die Liste. |
| **Info** | „Gut zu wissen" (die 17 Hinweise aus `merken`), „Offene Punkte" (die 18 aus `open_questions`, mit Telefonnummer als Link) und der Faktencheck (13 Korrekturen). |
| **Dark Mode** | Über `prefers-color-scheme`, mit manuellem Override. Der Knopf oben rechts schaltet automatisch → hell → dunkel. |
| **Farbe und Schrift** | Fünf Kategoriefarben, je eine pro Kategorie (`praktisch` hat seit v8 ein eigenes, entsättigtes Stein statt des Seeblaus der Ausflüge). Gold heißt Merkliste, Verde heißt Jum, Ziegel heißt Achtung, Seeblau heißt „hier ist etwas an". Sechs Schriftgrößen als Tokens (`--t-display` bis `--t-micro`, unterste Stufe
seit v23 12px statt 11px, die Tableiste eine Stufe darüber); Versalien gibt es nur noch an drei Stellen, alle in „Heute". Alle Textfarben ≥ 4,5:1 in hell und dunkel, im gerenderten DOM gemessen. |

Keine Cookies, kein Tracking, **keine externen Requests.** Seit v23 gilt das
ohne Einschränkung: die Schriften lagen bis dahin bei Google und sind jetzt
unter `fonts/` im Repo. Das Stylesheet von `fonts.googleapis.com` blockierte
das erste Rendern und meldete bei jedem Start die IP des Geräts an einen
Dritten.

Gemessen am 19.09.2026, gleicher Server, gleicher Browser, einmal mit und
einmal ohne die Änderung:

| | v22 (Google) | v23 (lokal) |
|---|---|---|
| First Contentful Paint | 284 ms | **56 ms** |
| Requests | 5, davon 1 fremd | 7, davon 0 fremd |

Die 228 ms sind fast genau die Zeit, die das fremde Stylesheet allein brauchte
(229 ms). Dass es jetzt zwei Requests mehr sind, kostet nichts: die
Schriftdateien liegen auf demselben Server und sind in 8 bis 9 ms da,
vorgeladen parallel zum CSS. Vier Dateien statt sechs, weil Fraunces und Karla
variable Schriften sind — Google liefert für 500 und 600 dieselbe Datei.

## Bedienung in zehn Sekunden

Den Schalter **Mit Jum** einmal anstellen — er bleibt an, auch nach dem
Schließen der App. Er nimmt nichts weg: die Liste bleibt vollständig, jede
Zeile trägt ihre Hundmarke, und die Zählzeile sagt, wie sich die Treffer auf
sicher, ungeklärt und „ohne Jum" verteilen. Die Frage „wo essen wir heute, das nah ist, gut ist und wo
Jum mit darf?" kostet danach vier Tipps: **Filter** → **Essen** → **Zu Fuß** →
**Fertig**, und der Knopf sagt vorher, wie viele Orte übrig bleiben. Den Knopf
rechts daneben auf **Bewertung** stellen, wenn die Entfernung nicht das
Kriterium ist.

Stand 18.09.2026 ist `dog: true` bei 39 der 101 Orte gesetzt, `false` bei 4,
und bei 58 ist die Regelung ungeklärt (`null`). Was daraus folgt, steht unter
„Die Hundregel".

## Orte ergänzen oder ändern

Nur `data/places.json` anfassen, nichts im HTML oder JS. Ein Eintrag:

```json
{
  "id": "kurz-und-eindeutig",
  "name": "Name des Ortes",
  "category": "essen",
  "badge": "Der Abend",
  "note": "Ein oder zwei Sätze, die auf der Karte stehen.",
  "address": "Via Sebino 29, Peschiera del Garda",
  "phone": "+390457553227",
  "rating": 4.6,
  "reviews": 1015,
  "hours": "geöffnet bis 22:30",
  "walk_min": 18,
  "distance_km": 1.2,
  "bike_min": null,
  "dog": null,
  "tags": ["fisch", "gehoben"],
  "geo": null,
  "time_min": 150,
  "moment": ["abend"]
}
```

| Feld | Bedeutung |
|---|---|
| `id` | eindeutig, wird für die Merkliste gespeichert — nicht nachträglich ändern |
| `category` | eine der `id`s aus `categories` am Dateianfang |
| `badge` | optionale Notiz, eine pro Ort. Die Klasse steckt nicht im Text, sondern in `badgeKind()` in `app.js`, und sie bestimmt Marke und Farbe in der Liste: **Termin** (Datumsmuster `Tag.Monat.`, gefüllter Punkt, Ziegel), **Ungeprüft** („Zeiten prüfen", „Erst anrufen", Warndreieck, gestrichelt), **Tageszeit** (alles aus `BADGE_MOMENT`, Uhr, grau — Zusammenhang, keine Empfehlung), **Einschränkung** („Ohne Auto nicht machbar", „Buchen", „Ohne Termin", durchgestrichener Kreis), **Kuratiert** (alles übrige, Raute, Kategoriefarbe). Dazu die drei **Hundregeln** („Burg ohne Hund", „Hund an der Leine ok", „Hund gratis"): sie erscheinen nicht in der Liste, sondern als Zusatz in der Hundzeile des Sheets. Stand 18.09.2026 sind es 27 Texte auf 31 Orten. |
| | **Was kein Badge sein sollte:** was schon als Tag gesetzt ist (`aussicht`, `foto`, `schatten`, `wein`, `livemusik`, `cocktails`, `regen`), was `dog` schon sagt, was in `hours` gehört („Montags", „Immer offen"), was in `connection` gehört, und was `time_min` schon trägt. 23 solcher Badges sind am 18.09. entfernt worden. |
| `hours` | Freitext, fehlt bei 47 Orten. Gelesen wird daraus nur, was eindeutig ist: „ab 9:30" und „bis 22:30" für die Kachel, und ein Ruhetag in der Form `Ruhetag <Wochentag>` oder `<Mo|Di|…> geschlossen` / `<Mo|Di|…> zu`. Ein Wochentagsbereich wie „Mi–Sa 19–23" ist eine Öffnungszeit und kein Ruhetag — der Prüfstand prüft beide Richtungen. Mehrere Ruhetage in einer Angabe kommen nicht vor; käme einer dazu, schlägt der Prüfstand an. |
| `dog` | `true` = erlaubt, `false` = verboten, `null` = ungeklärt. Seit v34 blendet der Schalter nichts mehr aus — `null` heißt „offen", nicht „nein". Was ihr vor Ort erfahrt, liegt in `pk.dog` im Gerät und überschreibt dieses Feld; in `places.json` gehört es nicht (siehe „Die Hundregel"). |
| `walk_min` / `bike_min` / `distance_km` | ab dem Zeltplatz. `null`, wenn nicht sinnvoll messbar. |
| `time_min` | empfohlene Aufenthaltsdauer in Minuten, **ohne** An- und Abreise. Basis für den Filter „Unter 1 h" und für die Frage in „Heute", ob sich etwas vor dem Abend noch ausgeht. |
| `moment` | Liste aus `frueh`, `mittag`, `nachmittag`, `abend`, in Tagesreihenfolge. Steuert „Heute" und **schlägt die Herleitung immer** — auch als leere Liste: `[]` heißt „kein Tagesvorschlag" und ist die Angabe für Apotheke, Supermarkt, Radverleih, Bahnhof und Anleger. Fehlt das Feld ganz, wird hergeleitet (siehe unten); bei allen 101 Orten steht es, die Herleitung ist die Rückfallebene für neue Einträge. |
| `indoor` | `true` = man sitzt im Trockenen, `false` = fällt bei Regen aus, fehlend = ungeklärt. Bei „nass" schlägt „Heute" nur `true` vor und rät nie. Für `essen` und `cafe` gilt `true` als Regel (ein Lokal hat einen Innenraum) — reine Terrasse, Schiff oder Bastion brauchen deshalb ein ausdrückliches `"indoor": false`. |
| `time_label` | Textfassung, oft mit kurzer und langer Variante. Steht im Detail; die Karte zeigt die aus `time_min` abgeleitete Kurzform. |
| `rating` / `reviews` | Google-Stand, Datum steht in `meta.stand` und im Footer |
| `connection` | optional, erscheint im Sheet als „Anfahrt" |
| `geo` | `null` oder `{ "lat": …, "lon": … }`. Getragen von allen 101 Orten. Benutzt für die Luftlinie zwischen zwei Plan-Stationen und für „Von hier"; die Karte braucht es ebenfalls (siehe unten). Der Prüfstand rechnet jeden Ort gegen `meta.base_geo` und schlägt an, wenn einer weiter als 120 km Luftlinie entfernt liegt — ein umgefallenes Komma stellt einen Ort sonst unbemerkt nach Afrika. |

Fehlende Felder sind unkritisch: leere Werte werden weggelassen statt mit
Platzhaltern gefüllt, `null` wird nie als 0 einsortiert.

### Woher „Heute" den Tagesabschnitt nimmt

Steht `moment` im JSON, gilt es. Sonst wird in dieser Reihenfolge hergeleitet:

1. `badge`, sofern er in `BADGE_MOMENT` steht — „Der Abend", „Früh morgens", „Nur mittags", „Sonnenuntergang",
   „Livemusik" und Verwandte sind eindeutig.
2. `hours`, soweit lesbar: Schluss ab 21:00 heißt Abend, Öffnung bis 8:30
   heißt Morgen, Öffnung ab 17:00 heißt ebenfalls Abend, ein Fenster über
   die Mittagszeit heißt Mittag.
3. Kategorie `cafe` → Morgen und Nachmittag.
4. `time_min ≥ 240` → Morgen, weil ein Tagesausflug früh beginnt.
5. Bleibt nichts übrig: `essen` gilt mittags und abends, `sehen` und
   `ausflug` in jedem hellen Abschnitt, `praktisch` gar nicht — eine
   Apotheke ist kein Tagesvorschlag.

Stand 18.09.2026 ist das nur noch die Rückfallebene für neue Einträge: alle
101 Orte tragen ein eingetragenes `moment`. Vorher liefen 38 über den
Rückfall — der einem Fischrestaurant mit Abendkarte den Mittag gab und einer
Cocktailbar den Morgen.

Eingeordnet wurde nach diesen Grundsätzen, nicht nach Kategorie:

- **Belegte Zeiten schlagen die Kategorie.** Steht nur „geöffnet bis 22:30",
  ist der Abend belegt und der Mittag nicht — dann steht auch nur `abend`.
  `mittag` steht nur dort, wo ein Mittagsfenster wirklich in `hours` steht.
- **`moment` kennt keine Wochentage.** Ein Abschnitt kommt nur hinein, wenn er
  an jedem Öffnungstag gilt. „Il Giardino delle Esperidi" hat werktags nur
  abends geöffnet und Sa/So auch mittags — es steht deshalb nur unter `abend`.
- **Draußen-Ziele bekommen kein `abend`.** Ein Uferweg um 22 Uhr ist kein
  Vorschlag. Ausnahme, wo es ausdrücklich dasteht — die Badges „Abendlicht"
  und „Sonnenuntergang", oder ein Tag wie `livemusik` und `cocktails`. („Livemusik"
  war bis v11 selbst ein Badge; der Badge-Kanon hat ihn zum Tag gemacht, die
  Einordnung bleibt dieselbe.)
- **Wandern und Rad meiden die Mittagshitze**, also `frueh` und `nachmittag`.
- **Tagesausflüge ab etwa 4,5 h nur `frueh`.** Ob sich etwas heute noch
  ausgeht, entscheidet danach `fitsLeft`, nicht diese Liste.

Damit sind die Abschnitte so besetzt: `frueh` 49 Orte, `mittag` 41,
`nachmittag` 48, `abend` 35. 13 Orte tragen `[]` — Tierarzt, Apotheke,
Supermarkt, Radverleih, Bahnhof, Anleger, Fischladen. Strand, Hundestrand
und Wochenmarkt sind dagegen echte Vorschläge, obwohl sie unter `praktisch`
stehen; die Kategorie allein entscheidet das nicht.

Mit `dog: true` allein blieben `frueh` 27, `mittag` 20, `nachmittag` 21 und
`abend` nur 7 Orte — und bei Regen am Vormittag null, obwohl sieben Orte im
Trockenen liegen. **Bis v33 war das der Zustand der App**; seit v34 blendet
der Schalter nichts mehr aus, und in „Heute" fällt nur noch das ausdrückliche
`dog: false` heraus (vier Orte). Siehe „Die Hundregel".

Die schnellste Verbesserung bleibt dieselbe: eine geklärte Hundregel bei den
vier Frühstückscafés (Dallazia, Pavòn, BASƎ, Ammazza), bei denen sie bisher
`null` ist. Seit v34 lässt sie sich in der App selbst eintragen.

`indoor` läuft in derselben Reihenfolge: ausdrücklicher Wert, Badge
„Regentag", die Tags `museum`, `kirche`, `supermarkt`, `notfall`, `regen`,
dann die Kategorieregel für `essen` und `cafe`, erst danach die Außen-Tags
(`strand`, `natur`, `rad`, `markt` und Verwandte). Die Reihenfolge ist
wichtig: `wasser` an einem Restaurant heißt „liegt am See", nicht „man
sitzt im Regen". Damit gelten 44 Orte als drinnen und 40 als draußen; offen
bleiben 17, fast alle Ausflüge.

Die Kategorieregel ist eine Regel, keine Wahrheit: ein Lokal ohne Innenraum
braucht ein ausdrückliches `"indoor": false`. Bisher ist das genau ein Fall,
**7 Ponti** — die Bar liegt draußen an den Bastionen.

Diese Zahlen stehen nicht von Hand hier, sie kommen aus
`node scripts/test-logic.mjs` (siehe „Prüfen").

Ein Ort mit „ungeprüft" oder „unbestätigt" in `hours` und die Badges
„Zeiten prüfen" und „Erst anrufen" werden nie als erster Vorschlag gezeigt,
sondern nach hinten sortiert und mit dem Hinweis „Zeiten ungeprüft, vorher
anrufen" versehen. Badges mit Datum („18.–20.09.") gelten als Termin: fällt
heute hinein, steht der Ort oben und trägt „läuft heute".

Was „Heute" **nicht** tut: behaupten, etwas habe gerade offen. `hours` ist
Freitext und fehlt bei knapp der Hälfte. Abgeleitet wird daraus nur
„schließt in weniger als 30 Minuten" — und das nur, wenn eine Uhrzeit
dasteht.

Der umgekehrte Schluss ist dagegen sicher und wird seit v15 gezogen: wo
wörtlich „Ruhetag Mittwoch" steht, ist mittwochs zu. Das ist dieselbe
Beweislast, die `hoursWindow` schon trägt — gelesen wird, was eindeutig
dasteht, und sonst nichts. Bis v13 stand die Palazzina Storica mittwochs auf
Platz 2 von 41 im Mittagsvorschlag, mit „Mittwochs geschlossen" in der
eigenen Notiz.

`merken[]` und `open_questions[]` dürfen Objekte (`{title, text}` bzw.
`{topic, status, contact}`) und blanken Text gemischt enthalten. Bei blankem
Text in `open_questions[]` wird eine enthaltene Telefonnummer automatisch
anklickbar.

Nach einer Änderung an einer Datei **`CACHE` in `sw.js` hochzählen** und
`VERSION` in `app.js` mitziehen — beide müssen zusammenpassen. Vergisst man
das, fällt es nicht mehr still durch: `node scripts/test-logic.mjs` vergleicht
beide Stellen, und die App fragt den Service Worker beim Start nach seinem
Cache-Namen. Weichen sie ab, steht das als Warnung im Footer statt in keiner
Konsole.

Die App aktualisiert sich danach selbst: übernimmt eine neue Fassung die
Steuerung, lädt die Seite einmal neu. Beim Zurückholen in den Vordergrund wird
zusätzlich nach Updates gesehen. Zweimal von Hand neu laden ist nicht mehr
nötig.

Welche Fassung tatsächlich läuft, steht im Footer der App und im Bericht von
`selbsttest.html`. Das beantwortet die Frage „alter Stand im Offline-Speicher
oder echter Fehler?" eindeutig.

## Prüfen

Was Freitext liest, liegt bei neuen Daten still falsch: Öffnungszeiten,
Termine im Badge, der Reisezeitraum im Untertitel. Kein Fehler in der Konsole,
nur schlechtere Vorschläge. Dafür gibt es einen Prüfstand ohne Browser und
ohne Build:

```bash
node scripts/test-logic.mjs
```

Er prüft `hoursWindow`, `closedOn`, `closedToday`, `airKmPoint`, `momentsOf`,
`momentNow`,
`runsToday`, `tripDay`, `unverified`, `closingSoon`, `fitsLeft`, `indoorOf`,
die Wegerechnung (`wegKm`, `wegMin`, `tagWege`, `tagModusVorschlag`,
`rundenVorschlag` samt Eichung gegen die 48 gemessenen Fußwege)
und die Formatierer gegen die Schreibweisen, die in den Daten wirklich
vorkommen — und dazu `places.json` selbst: eindeutige `id`s, bekannte
Kategorien, `dog` nur `true`/`false`/`null`, `moment` nur aus den vier
Abschnitten, jeder Ruhetag in `hours` lesbar, kein `geo` weiter als 120 km vom
Zeltplatz, Zahlenfelder als Zahlen, jeder
Kategorie-Akzent mit passender `.acc-`Regel in `style.css`,
jede Datei aus `SHELL` vorhanden und `CACHE` wie `FONTS` gleich `VERSION`. Am
Ende stehen die Zahlen, die auch in dieser README vorkommen — abgeschrieben
veralten sie, gerechnet nicht.

`app.js` bleibt dafür eine Datei ohne Build: am Ende reicht sie ihre reinen
Helfer an `module.exports` weiter, was es im Browser nicht gibt. Dort passiert
an der Stelle nichts.

## Lokal testen

Im Projektordner:

```bash
python3 -m http.server 8000     # http://localhost:8000
```

Ein Server ist nötig, weil Browser das Lesen lokaler Dateien über `file://`
einschränken: **Safari** liest `data/places.json` per XHR meistens auch
direkt vom Dateisystem, **Chrome** blockiert es grundsätzlich. Die App fängt
das ab und zeigt statt eines Konsolenfehlers einen Hinweis mit genau diesem
Befehl. Der Service Worker registriert sich nur über `http`/`https`, offline
testen geht also nur über den Server.

## Deployment

GitHub Pages, Branch `main`, Ordner `/`. Kein Build.

```bash
git add -A && git commit -m "…" && git push
```

## Was für iOS Safari angepasst ist

Safari verhält sich an mehreren Stellen anders als die Engine, in der hier
getestet wird. Diese Punkte sind gezielt behandelt:

| Eigenheit | Behandlung |
|---|---|
| Nach `preventDefault()` auf `touchmove` liefert Safari keinen Klick mehr | Berührungen, die auf einem Bedienelement beginnen, starten keine Wischgeste; Schwelle 12 px statt 6 px |
| `overflow: hidden` hält den Hintergrund nicht fest | `body` wird bei offenem Sheet fixiert, Scrollposition gemerkt und wiederhergestellt |
| Wartezeit auf einen möglichen Doppeltipp, graues Aufblitzen | `touch-action: manipulation` und `-webkit-tap-highlight-color: transparent` auf allen Bedienelementen |
| Bei offener Tastatur kleben fixierte Elemente am sichtbaren Ausschnitt | Die Tableiste fährt weg, solange im Suchfeld getippt wird |
| `100vh` rechnet die Adressleiste mit | `dvh` mit `vh` als Rückfallebene |
| Langes Drücken öffnet die Textauswahl | `-webkit-touch-callout: none` auf der Kartenfläche |
| Eingabefelder unter 16 px lösen Zoom aus | Suchfeld auf `1rem` |
| Randbereiche bei randlosem Bildschirm | `viewport-fit=cover` plus `env(safe-area-inset-*)` in Kopf, Tableiste und Sheet |
| `color-mix()` erst ab Safari 16.4 | Fokusring hängt nicht mehr daran |
| `-webkit-overflow-scrolling: touch` hebt den Container auf eine eigene Ebene und macht darüberliegende Knöpfe untippbar | Entfernt (seit iOS 13 ohnehin wirkungslos); das ✕ liegt zusätzlich mit eigenem `z-index` darüber |
| Runde Knöpfe verschenken die Ecken ihrer Trefferfläche | Das ✕ ist ein abgerundetes Quadrat, alle 44×44 px treffen |

Nicht behandelbar von hier aus: Safari räumt bei Websites, die längere Zeit
nicht benutzt werden, den Offline-Speicher und `localStorage` weg. Bei
täglicher Nutzung im Urlaub kein Thema; nach Wochen Pause kann die Merkliste
weg sein.

## Listen zwischen zwei Geräten abgleichen

Es gibt keinen Server — die Markierungen liegen nur im jeweiligen Browser.
Der Abgleich läuft deshalb über den Link selbst: im Reiter „Reise" auf
**Teilen**, dann per iMessage, AirDrop oder sonstwie verschicken. Wo die
Teilen-Funktion des Systems fehlt, landet der Link in der Zwischenablage.

Der Link trägt Merkliste, Gesehenes, Notizen, Tageszuordnung und seit v34 die
vor Ort geklärten Hundregeln als `#liste=<base64url>` mit, rund 120 Zeichen bei
einer Handvoll Orte. Nichts verlässt das Gerät, außer über diesen Link.

Beim Öffnen fragt die Gegenseite nach:

- **Zusammenführen** — eigene Markierungen bleiben, fremde kommen dazu; bei
  den Hundregeln gewinnt dagegen die **jüngere** Angabe (siehe „Die Hundregel")
- **Meine ersetzen** — übernimmt die fremde Liste vollständig
- **Verwerfen** — ändert nichts

Danach wird der Anker aus der Adresse entfernt, ein Neuladen fragt also nicht
erneut. Orte, die es in `places.json` nicht (mehr) gibt, werden übersprungen
und im Hinweis mitgezählt. Ein beschädigter Link wird ignoriert.

Das ist ein Abgleich auf Zuruf, keine laufende Synchronisierung: wer später
etwas markiert, muss neu teilen. Für echte Synchronisierung bräuchte es einen
Dienst dazwischen — siehe unten.

## Prüfstand

```bash
node scripts/browser/run.mjs     # 536 Prüfungen im Browser, startet den Server selbst
node scripts/test-logic.mjs      # Logik ohne Browser
```

Die Browser-Suiten prüfen Verhalten, nicht Aussehen — vor allem die
Eigenheiten von iOS Safari, die sich in Chromium nicht zeigen. Was dort
abgesichert ist und warum, steht in `docs/UEBERGABE-ios-und-tests.md`.
Layoutänderungen dürfen die Suiten brechen; dann die Selektoren nachziehen,
aber keine Zusicherung streichen, die eine iOS-Eigenheit absichert.

## Auf dem iPhone prüfen

Die Entwicklungsumgebung hat kein iOS und kein Safari — getestet wird in
Chromium. Genau dort fällt eine Fehlerklasse durch: Chromium unterdrückt
kleine `touchmove`-Ereignisse, iOS Safari liefert sie aus. So ist der Fehler
entstanden, bei dem sich das Detailfenster nur durch Wischen schließen ließ.

Deshalb liegt `selbsttest.html` daneben. Auf dem iPhone öffnen:

```
https://<deine-pages-url>/selbsttest.html
```

Zweimal tippen, einmal wischen, „Ergebnis kopieren" — der Bericht enthält den
gemessenen Fingerwackler, ob der Klick nach einem `preventDefault()` noch
ankommt, die tatsächlichen Safe-Area-Werte, `100dvh`, den Zustand von Service
Worker und `localStorage` sowie die geladenen Schriften. Das sind die Zahlen,
die sich hier nicht ermitteln lassen.

Die Seite gehört nicht zur App, ist aus ihr nicht verlinkt und stört nichts.

## Später angedacht

- **Laufende Synchronisierung** statt Teilen auf Zuruf. Bräuchte einen Dienst
  dazwischen (etwa Supabase) und damit ein Backend — entgegen dem bisherigen
  Grundsatz, und es muss bei schlechtem Netz trotzdem offline funktionieren.

## Die Hundregel

**Der Schalter blendete bis `v33` 62 von 101 Orten aus — und nur 4 davon sind
wirklich hundefrei.** `selected()` filterte auf `dog === true`; alles andere
verschwand, auch die 58 Orte, bei denen die Regel schlicht ungeklärt ist. Am
Regenvormittag traf es sogar 7 von 7: alle Orte, die dann im Trockenen liegen,
haben eine offene Hundregel. Die Ansicht sagte „Bei Regen steht hier nichts",
obwohl sieben Möglichkeiten dastanden, zeigte drei davon an und ließ keine
einzige verplanen.

Seit `v34` gilt: **ungeklärt ist nicht nein.**

### Der Schalter tut drei Dinge statt einem

| | |
|---|---|
| **zählen** | Die Zählzeile nennt alle Zustände: „101 Orte · mit Jum · 39 sicher · 58 ungeklärt · 4 ohne Jum". Eine einzige Zahl verschwieg, dass die Mehrheit nicht verboten, sondern unbekannt ist. |
| **beschriften** | Jede Listenzeile trägt ihre Hundmarke im vorhandenen Slot: „Jum ok", „Hund offen" (ocker, gestrichelt) oder „ohne Jum". Bis `v33` entfiel die Marke bei angeschaltetem Jum — sie galt ja für alle. Das stimmt nicht mehr, also steht sie da. |
| **sortieren** | Ein ausdrückliches `dog: false` sinkt ans Ende. Ungeklärtes bleibt, wo es steht: **in der Liste sucht man**, und 58 Orte nach hinten zu schieben hieße, eine Datenlücke wie eine Absage zu behandeln. |

In **„Heute"** gilt das Gegenteil, und zwar aus demselben Grund, aus dem
Gesehenes dort verschwindet und in der Liste bleibt: dort bekommt man
**vorgeschlagen**. Mit angeschaltetem Jum steht Belegtes vor Ungeklärtem, und
nur das ausdrückliche `dog: false` fällt ganz heraus — vier Orte.

### Vier Zustände statt drei

Der vierte ist der wichtigste:

| Zustand | Herkunft | im Sheet |
|---|---|---|
| **ja** | Katalog | „Jum darf mit" |
| **nein** | Katalog | „Ohne Jum" |
| **offen** | Katalog, 58 Orte | „Nicht geklärt — vorher fragen", darunter die Frage |
| **von euch** | ihr, vor Ort | „Jum darf mit — von euch bestätigt", mit Datum |

Bis `v33` stand im Sheet gleichzeitig „Nicht geklärt — vorher fragen" und, eine
Zeile darunter in der eigenen Notiz, „Jum durfte mit rein". Zwei Wahrheiten auf
einem Bildschirm, und am nächsten Tag gewann wieder der Katalog.

Jetzt steht unter dem Hundblock die Frage **„Wart ihr da?"** mit zwei Knöpfen
(„Jum durfte mit" / „Ging nicht") und, wo eine Nummer hinterlegt ist,
„Anrufen". Ein Tipp setzt den Zustand, mit Datum und umkehrbar. Er gilt ab dann
überall — in der Liste, in „Heute", auf der Karte, im Plan.

- **Wo der Katalog eine Antwort hat, steht keine Frage.** Eine belegte Angabe
  mit einem Tipp umzuwerfen wäre zu billig; wer sie doch ändern will, nimmt den
  Umweg über eine eigene Angabe an einem Ort, der schon eine trägt.
- **Gespeichert unter `pk.dog`** als `{ ortId: { v: true|false, at: '…' } }`.
  **Nicht in `places.json`** — dieselbe Trennung wie bei den Notizen: der
  Katalog ist die Recherche, das hier ist eure eigene Beobachtung. Wird aus
  einer Beobachtung eine gesicherte Tatsache, führt der Weg über die offenen
  Punkte.
- **Der Teilen-Link trägt sie mit** (`h` im Payload, `v` bleibt `1`). Und zwar
  **alle**, nicht nur die zu gemerkten Orten: „Jum durfte rein" ist eine
  Tatsache über den Ort, keine Markierung an einer Liste.
- **Beim Zusammenführen gewinnt die jüngere Angabe**, nicht die eigene. Das ist
  die Ausnahme von der Hausregel — bei Notizen und Tagen gewinnt die eigene.
  Begründung: es sind keine Markierungen an einer Liste, sondern Beobachtungen
  über einen Ort, und wer zuletzt davorstand, weiß es besser.
- **Der Reiter „Wissen" zählt mit.** Ganz oben steht, wie viele Orte sicher
  sind, wie viele ihr selbst geklärt habt und wie viele offen bleiben. Aus
  58 blinden Flecken wird damit eine Liste, die über fünfzehn Reisetage kürzer
  wird.

### Was das kostet

Die Liste wird länger — mit angeschaltetem Jum stehen jetzt 101 statt 39 Orte
darin. Aufgefangen wird das durch die Marke an jeder Zeile und die dreiteilige
Zählzeile: man sieht auf einen Blick, woran man ist, statt sich auf eine
Auswahl zu verlassen, die im Hintergrund Orte wegnimmt.

---

## Reise: Tage und Vorrat

**Es sind zwei Dinge mit zwei Aufgaben:**

| | |
|---|---|
| **Die Tage** | Der Fahrplan. Was an welchem Tag ansteht. |
| **Der Vorrat** | Was gemerkt ist und noch keinen Tag hat. |

Bis `v32` teilten sie sich einen Bildschirm: unten am Plan hing die Merkliste
als vierte „Tagesgruppe" namens *Gemerkt, noch ohne Tag*. Das las sich wie ein
Tag, war aber keiner. `v33` trennte sie in zwei Hälften hinter einer
**Umschaltleiste**. Die Trennung war richtig gedacht — nur kostete sie einen
Umschalter für etwas, das man beim Planen ständig zusammen braucht: man zieht
aus dem Vorrat in einen Tag. Wer den Vorrat sehen wollte, verlor den Plan aus
dem Bild.

Seit `v36` ist „Reise" **eine Ansicht**, untereinander:

1. **Der Kopf** — „Fünfzehn Tage", darunter „4 verplant · 8 Orte".
2. **Das Raster** über alle Reisetage (siehe unten). Es steht jetzt *immer*
   da, auch ohne eine einzige Zuordnung.
3. **Eine Karte je verplantem Tag**, in Datumsreihenfolge, plus **eine Karte
   für den nächsten freien Tag**.
4. **Der Vorrat** als eigener Abschnitt, mit eigener Zahl und eigener Zeit.

- **Kein fünfter Reiter.** Die Leiste unten trägt vier; bei fünf blieben je
  80 px. Tage und Vorrat gehören ohnehin zusammen.
- **Die Mengen sind überschneidungsfrei**: ein Ort ist entweder verplant oder
  im Vorrat, und ihn zu verplanen ist genau der Übergang — er verschwindet
  unten und taucht oben als Station auf.
- **Vorratszeilen haben keine Nummer und keine Pfeile.** Dort gibt es keine
  Reihenfolge, die etwas bedeutet; Pfeile wären ein Bedienelement ohne
  Aussage. Den Tag-Wähler haben sie, das ist der Weg hinaus.
- **Die Übersicht zeigt, das Sheet ändert.** Nummern und Umstell-Pfeile
  stehen seit `v36` im Tages-Sheet — dort, wo man ohnehin ist, wenn man einen
  Tag umstellt. In der Übersicht waren sie vier Knöpfe je Zeile für etwas,
  das man selten tut.
- **Die Gesamtzeit steht nur am Vorrat.** Dort ist sie eine sinnvolle Aussage
  („so lange bräuchtest du für alles, was noch keinen Tag hat"); über die
  ganze Ansicht addierte dieselbe Zahl Tage und Vorrat zu einer Stunde, die
  nirgends vorkommt. Die Zeit je Tag steht auf der Tageskarte.
- **Die Teilen-Leiste nennt beide Zahlen** („8 verplant · 12 im Vorrat · 0
  gesehen"). „20 gemerkt" allein sagte nicht, wie viel davon schon einen Tag
  hat — und genau das ist die Frage, die diese Ansicht beantwortet.
- **Kein eigener Leerzustand mehr.** Bis `v35` bekam, wer nichts gemerkt
  hatte, einen Absatz Text und sonst nichts — und erfuhr nie, dass diese
  Ansicht fünfzehn Reisetage kennt. Jetzt steht das Raster da, der Vorrat
  sagt in seiner eigenen Zeile, dass er leer ist, und ein Knopf führt nach
  „Entdecken". Das Raster **ist** die Aufforderung.

### Wege: gerechnet, nicht geroutet

**Bis `v36` hieß „4,5 h" auf einer Tageskarte in Wahrheit „4,5 h Aufenthalt
und null Wege".** Bei vier Stationen quer um den See fehlten darin zwei
Stunden, und der Tag sah machbar aus, der es nicht war. Zwischen zwei
Stationen stand nur dann etwas, wenn mehr als 1,2 km Luftlinie dazwischen
lagen — und dann eine Warnung ohne Zeitangabe.

Der Grund: in den Daten stehen nur Wege **ab dem Zeltplatz** (`walk_min`,
`distance_km`), und auch die nur bei 48 der 101 Orte. Zwischen zwei
beliebigen Orten stand nichts.

Geroutet wird trotzdem nicht: ein Routing-Dienst braucht Netz, und diese App
funktioniert im Flugmodus. Seit `v37` wird gerechnet — aus der Luftlinie, die
bei allen 101 Orten vorliegt:

```
weg_km   = luftlinie_km × 1,50        Umwegfaktor Straße/Luftlinie
zu Fuß   = weg_km / 4,5 km/h          mit Hund, mit Pausen
mit Rad  = weg_km / 15 km/h
mit Auto = weg_km / 45 km/h + 10 Min Parken
```

**Beide Zahlen stammen aus den eigenen Daten, nicht aus einer Faustregel.**
`scripts/make-matrix.mjs` rechnet sie aus: der Median Straße/Luftlinie über
alle 101 Orte ist **1,50**, die Geschwindigkeit `distance_km / walk_min` ist
im Median **4,50 km/h**. Beide stehen als Konstanten in `app.js`, und
`scripts/test-logic.mjs` hält sie gegen genau diese Rechnung — ändern sich die
Daten, fällt die Prüfung um, nicht die App.

Gegenprobe gegen die 48 gemessenen Fußwege: **7,8 % Abweichung im Median**,
5 von 48 liegen über 20 % daneben. Das Kriterium (Median ≤ 20 %) ist erfüllt.

Dazu drei Regeln:

- **Geschätztes trägt ein `≈`, Gemessenes nicht.** Dieselbe Beweislast, die
  `hoursWindow()` schon trägt: `walk_min` ab dem Zeltplatz steht ohne Zeichen
  da, jeder gerechnete Weg mit.
- **Über 8 km rechnet die App keinen Fußweg.** Ein Tag mit Verona ist ein
  Autotag; vier Stunden Fußweg zu behaupten wäre keine Auskunft, sondern eine
  Zumutung. Genannt, nicht verboten — wer trotzdem „zu Fuß" wählt, bekommt
  den Hinweis und behält die Wahl.
- **Ohne `geo` wird nicht geraten.** Fehlt es bei einer der beiden Stationen,
  bleibt die Wegzeile weg. Gezählt wird die Lücke trotzdem: „2 Wege ohne
  Koordinate" steht in der Budgetzeile, damit die Summe sagt, worauf sie sich
  stützt.

**Womit ein Tag zurückgelegt wird, wählt man selbst** — zu Fuß, mit dem Rad
oder mit dem Auto, als Segmentleiste im Tages-Sheet. Drei Möglichkeiten
bekommen hier eine Leiste statt eines Knopfes, der seinen Stand nennt (wie bei
den zwei Sortierungen): die Wahl verändert die Zeiten direkt darunter, also
will man alle drei sehen. Der **Vorschlag** kommt aus dem größten Sprung der
Kette — eine Kette mit einem Sprung von 30 km ist kein Fußweg, auch wenn die
anderen drei je 500 m lang sind. Gewählt wird trotzdem von Hand: die App weiß
nicht, ob das Auto heute dasteht. Gespeichert wird nur die **Abweichung** vom
Vorschlag (`pk.mode`).

Die Wege stehen an drei Stellen, und überall mit derselben Zahl — zwei
Wahrheiten für denselben Weg wären schlimmer als gar keine:

| Wo | Was |
|---|---|
| **Tageskarte** | zwischen den Stationen „≈ 1,2 km · 16 Min", im Kopf die Summe **mit** Wegen, darunter die Aufteilung („4,5 h vor Ort · ≈ 50 Min Wege zu Fuß") |
| **Tages-Sheet** | dieselbe Zeile ausführlich, mit Modus; darüber die Modus-Leiste und die Budgetzeile |
| **Jetzt** | zwischen den Stationen des heutigen Tages; die Restzeit zählt die Wege mit, die **noch bevorstehen** |

Die 10-Stunden-Marke misst seit `v37` an der Summe **mit** Wegen — das ist die
Zahl, die der Tag wirklich kostet.

### Die kürzeste Runde

„Sortierung nach kürzester Runde" stand seit `v28` unter *Später angedacht*.
Sie war nicht machbar, solange die App keine Wege zwischen zwei beliebigen
Orten kannte. Seit `v37` kennt sie welche, und der Punkt ist erledigt.

- **Gerechnet wird eine Runde, kein Pfad.** Abends schläft man wieder auf dem
  Zeltplatz, also gehören Hin- und Rückweg dazu. Ein Pfad hätte die letzte
  Station ans andere Ende des Sees gelegt und den Rückweg verschwiegen.
- **Bis acht Stationen exakt**, darüber Nächster-Nachbar plus 2-opt. 7! = 5040
  Reihenfolgen ab festem Start brauchen unter fünf Millisekunden; darüber ist
  die Heuristik bei dieser Größe praktisch immer optimal. **Kein Fremdpaket** —
  dieselbe Begründung wie beim Bündeln der Kartennadeln in `v25`.
- **Vorgeschlagen, nicht durchgesetzt.** Die App kennt die Entfernungen, nicht
  die Öffnungszeiten im Kopf des Planers („erst der Markt, der macht um eins
  zu"). Im Tages-Sheet steht deshalb ein Angebot mit beiden Zahlen („≈ 8,2 km
  statt ≈ 12,6 km — ≈ 50 Min weniger unterwegs") und ein Knopf, kein stiller
  Umbau.
- **Ist die Reihenfolge schon die kürzeste**, steht dort eine Zeile, die das
  sagt — und kein Knopf ohne Wirkung.
- **Unter drei Stationen gibt es keinen Vorschlag.** A–B und B–A sind dieselbe
  Runde.
- **Orte ohne `geo` lassen sich nicht einsortieren.** Sie bleiben in ihrer
  Reihenfolge und hängen hinten an; der Vorschlag sagt das dazu.

Übernommen wird, indem die **globalen Positionen der Tagesgruppe** in
`pk.saved` neu belegt werden — alles außerhalb der Gruppe bleibt unberührt,
dieselbe Regel wie beim Verschieben mit den Pfeilen.

### Die Tageskarte

Eine Karte je verplantem Tag. Sie ist **ein Knopf** und öffnet dasselbe Sheet
wie eine Rasterzelle — ein Einstieg statt zweier.

- **Kopf**: Wochentag und Datum, davor „Heute ·" am heutigen Tag, rechts die
  Summe der eingeplanten Zeit. Mehr als 10 h wird **genannt, nicht bewertet**
  („· mehr als 10 h"): die Summe ist ohne An- und Abfahrt gerechnet, die
  Grenze ist eine Annahme und steht deshalb wörtlich da. Stehen an dem Tag
  Orte ohne `time_min`, sagt die Summe „(3 von 5)" statt zu raten.
- **Stationen**: eine Zeile je Ort, mit Kategoriefarbe links. Rechts steht,
  was an dem Tag zählt — „erledigt", „an dem Tag zu" oder die Aufenthaltsdauer.
  Erledigte sind gedämpft und durchgestrichen und bleiben stehen: sie
  verschwinden zu lassen hieße, den Fortschritt zu verstecken.
- **Fuß**: „2 von 4 erledigt", sobald etwas abgehakt ist. An vergangenen Tagen
  nicht — dort ist der Fortschritt keine Frage mehr.
- **Eine Karte für den nächsten freien Tag**, nicht für alle: bei fünfzehn
  Reisetagen und vier verplanten wären das elf leere Karten, und die Ansicht
  bestünde aus Lücken. Das Raster darüber zeigt ohnehin alle. Was fehlt, ist
  der Anstoß — und der gilt dem nächsten.

### Der Tageswähler

Seit `v28` gehört jeder gemerkte Ort **einem Reisetag**. Bis `v27` war der Plan
eine Liste, die man nur umsortieren konnte — für vierzehn Tage Reise ist das
kein Plan, sondern ein Stapel.

- **Ein natives `<select>`**, kein eigenes Menü: auf dem Zielgerät öffnet iOS
  sein Wählrad — vertraut, treffsicher, und ohne eine Zeile eigenen
  Menü-Codes, den `close.mjs` dann absichern müsste. Die Auswahl sind die
  Reisetage aus `meta.subtitle`, plus „Tag offen". Der heutige Tag ist als
  solcher markiert, vergangene als „vorbei" und nicht mehr wählbar.
- **Er steht an jeder Vorratszeile und in jedem Ort-Sheet.** Seit `v34` legt
  der Wähler im Ort-Sheet den Ort zugleich in die Merkliste — bis dahin war
  `setDay` nur über den Stern erreichbar, und wer im Ort einen Tag wählte,
  ohne vorher zu merken, bekam nichts.
- **Die Warnung „x km Luftlinie" gilt Nachbarn desselben Tages.** Zwischen dem
  letzten Ort von Dienstag und dem ersten von Mittwoch liegt eine Nacht, keine
  Wanderung. Sie steht im Tages-Sheet, zwischen den beiden Stationen.
- **Die Zuordnung ist eine Zutat der Merkliste, kein eigener Zustand.** Fliegt
  ein Ort aus der Merkliste, bleibt sein Tag gespeichert und gilt wieder, wenn
  man ihn erneut merkt — ein Fehltipp auf den Stern kostet keine Planung.
- **Der Teilen-Link trägt die Tage mit** (`d` im Payload). `v` bleibt `1`: eine
  ältere Fassung ignoriert das Feld einfach, statt den ganzen Link zu
  verwerfen. Beim Zusammenführen gewinnt die **eigene** Planung; ein fremder
  Tag füllt nur Lücken — dieselbe Regel wie bei den Notizen.

Womit ein Tag zurückgelegt wird, steht in `pk.mode` als
`{ 'JJJJ-MM-TT': 'fuss'|'rad'|'auto' }` — und dort steht **nur die Abweichung**
vom Vorschlag, den die App aus dem größten Sprung der Kette ableitet.

Gespeichert unter `pk.days` als `{ ortId: 'JJJJ-MM-TT' }`. Eine Zuordnung
außerhalb des Reisezeitraums zählt als „offen" statt als Tag.

### Die Reiseübersicht

An einem realistischen Stand gemessen — 20 gemerkte Orte, sieben auf drei Tage
verteilt — war die Planansicht **3402 px hoch**, also viereinhalb Bildschirme.
Sichtbar waren die drei verplanten Tage. Unsichtbar blieb, was man beim Planen
eigentlich wissen will: **welche der fünfzehn Tage noch frei sind.** Sonntag,
Montag und Donnerstag standen da; Dienstag und Mittwoch kamen in der ganzen
Ansicht nicht vor.

Seit `v30` steht oben im Plan ein Raster über alle Reisetage:

- **Fünf Spalten, drei Reihen** — fünfzehn Tage passen damit bei 402 px ohne
  Schieben ins Bild. Ein waagerechter Streifen hätte die Hälfte versteckt, und
  ein Tag, den man erst hervorschieben muss, beantwortet die Frage nicht.
- **Verplante Tage** tragen eine Marke mit der Zahl der Orte, **freie Tage**
  sind gestrichelt und tragen ein `+` — im Haus heißt gestrichelt „da, aber
  nichts los", wie die vergangenen Abschnitte in „Heute".
- **Vergangene Reisetage tragen seit v34 kein `+` mehr** und sind gedämpft.
  Sie bleiben sichtbar und antippbar — man will nachsehen, was war —, aber am
  20.09. luden sechs von fünfzehn Zellen dazu ein, einen Tag zu verplanen, der
  vorbei ist; am letzten Reisetag wären es vierzehn. Auch die Tag-Wähler zeigen
  sie als „vorbei" und lassen sie nicht mehr auswählen.
- **Alle fünfzehn Zellen sind Knöpfe** und öffnen dasselbe Sheet (siehe unten).
  Bis `v30` sprangen volle Zellen nur zu ihrer Gruppe und leere taten gar
  nichts — fünfzehn gleich aussehende Knöpfe, zwei Verhalten, und ausgerechnet
  der freie Tag, den die Übersicht gerade zur Frage gemacht hatte, war der tote.
- **Das Raster steht seit `v36` immer da**, auch ohne eine einzige Zuordnung.
  Bis `v35` erschien es erst mit der ersten — mit der Begründung, es wäre
  sonst ein leeres Raster über einer Merkliste. Die Merkliste darunter gibt es
  nicht mehr, und wenn nichts geplant ist, **ist** das Raster die
  Aufforderung: fünfzehn leere Tage mit einem `+` sagen deutlicher, dass hier
  etwas hingehört, als jede Zeile Text.

### Ein Reisetag als Sheet

Bis `v30` zeigte die Übersicht, dass Mittwoch frei ist — und von dort aus ließ
sich nichts damit anfangen. Man sah die Lücke, musste sie unten in der
Merkliste suchen, den richtigen Ort finden und dessen Wähler auf den richtigen
Tag stellen. **Drei Schritte für etwas, das die Übersicht gerade erst zur Frage
gemacht hatte.**

Seit `v31` öffnet jede Tageszelle ein Sheet für diesen Tag — seit `v36` auch
jede Tageskarte, mit demselben Ziel:

- **„An diesem Tag"** — was dort steht, mit Zeitsumme, jedes mit einem `−` zum
  Herunternehmen. Herunternehmen **löscht nicht**: der Ort wandert zurück in
  den Vorrat, er verlässt die Merkliste nicht.
- **Nummer und Umstell-Pfeile stehen seit `v36` hier**, nicht mehr in der
  Übersicht: die Übersicht zeigt, das Sheet ändert. Die Pfeile verschieben
  **innerhalb des Tages** — zwischen dem letzten Ort von Dienstag und dem
  ersten von Mittwoch liegt eine Nacht, keine Wanderung. Nach dem Verschieben
  wird nur der Sheet-Inhalt neu gebaut und der Fokus auf denselben Pfeil
  zurückgesetzt; ein `render()` ließe die Seite unter dem Finger springen.
- **„Aus deinem Vorrat"** — alles ohne Tag, jedes mit einem `+`. Steht an
  dem Tag ein Ruhetag an, sagt die Zeile das schon hier: der richtige Zeitpunkt
  für diese Auskunft ist der, an dem man den Tag wählt.
- **Sortiert nach Nähe** (seit `v32`). Bis dahin stand die Merkliste in der
  Reihenfolge, in der man gemerkt hat — bei zwanzig Einträgen sucht man darin.
  Gemessen wird gegen den **nächsten** schon verplanten Ort des Tages, nicht
  gegen deren Mittelpunkt: liegen Verona und Peschiera an einem Tag, fällt der
  Mittelpunkt auf ein Feld dazwischen, und die Reihenfolge wäre nach niemandem
  sortiert. Die Frage lautet „was kann ich mitnehmen, wenn ich schon dort
  bin" — und das misst sich am nächsten Nachbarn. Ist der Tag leer, gilt der
  Bezugspunkt der ganzen App: der Gerätestandort, sonst der Zeltplatz.
  Die **Entfernung steht an jeder Zeile**, der **Grund der Sortierung im
  Kopf** („Nach Nähe zu Porta Verona"). Eine Reihenfolge, die man nicht
  erklären kann, ist schlechter als gar keine — dann rät man, warum
  ausgerechnet das oben steht. Luftlinie, keine Gehzeit.
- **Ein Suchfeld über alle 101 Orte** (seit `v37`), nicht nur über den
  Vorrat. Wer am Mittwoch etwas sucht, hat es in der Regel noch nicht
  gemerkt — „erst merken, dann Tag wählen" waren zwei Schritte für einen
  Gedanken. Das Feld steht über der Liste und **ersetzt** sie, sobald etwas
  darin steht: kein zweites Ergebnisfenster daneben. Treffer, die noch nicht
  gemerkt sind, sagen das („noch nicht gemerkt"); der `+` daneben legt sie in
  einem Schritt auf den Tag **und** in die Merkliste. Was an dem Tag schon
  steht, taucht nicht als Treffer auf. Beim Tippen wird **nur die
  Trefferliste** neu gebaut, nicht das Sheet — sonst verlöre das Feld den
  Fokus und die Schreibmarke mitten im Wort. Der Begriff gilt diesem Besuch,
  nicht dem nächsten.
- **Das Sheet bleibt beim Hinzufügen offen.** Einen Tag füllt man selten mit
  einem einzigen Ort, und jedes Mal neu zu öffnen wäre eine Strafe fürs Planen
  — dieselbe Entscheidung wie beim Filter-Sheet.
- **„Im Plan anzeigen"** schließt das Sheet und springt zur Tagesgruppe. Erst
  nach dem Schließen: während das Sheet offen ist, liegt `body` auf `fixed`,
  und ein `scrollIntoView` liefe ins Leere.
- Ist der Vorrat leer, sagt das Sheet das und bietet den Weg zu „Entdecken".

Dazu zwei Zeilen, die vorher nicht stimmten:

- **Die Summenzeile** sagte „20 Orte · 30,8 h Aufenthalt · 8 h Weg" — sie
  addierte drei verplante Tage und dreizehn unverplante Orte zu einer Stunde,
  die nirgends vorkommt. Seit `v36` gibt es sie nicht mehr: der Kopf der
  Ansicht zählt „4 verplant · 8 Orte", der Vorrat zählt sich selbst, und die
  Zeit je Tag steht auf der Tageskarte. Keine Zahl vermischt noch beides.
- **Die Teilen-Leiste** sagte „20 im Plan", während die Summenzeile darunter
  „7 Orte an 3 Tagen" sagte — zwei Zahlen für dieselbe Ansicht, die sich
  widersprechen. Sie zählt jetzt beide Hälften: „8 verplant · 12 im Vorrat ·
  0 gesehen".

Und der Rest heißt nicht mehr „Noch keinem Tag zugeordnet", sondern schlicht
**„Vorrat"** — das ist kein Restehaufen, sondern das, woraus man Tage füllt.

### Die Brücke zu „Heute"

Bis `v28` wussten die beiden Hälften der App **nichts voneinander**: `S.days`
kam in der gesamten Heute-Ansicht kein einziges Mal vor. Man ordnete abends
Orte dem Samstag zu, öffnete morgens den Bildschirm, der „Heute" heißt — und
der schlug aus allen 101 Orten irgendetwas anderes vor. Wer plant, will beim
Aufwachen nicht vorgeschlagen bekommen, sondern erinnert werden.

Seit `v29` steht **„Dein Plan für heute"** ganz oben in „Heute":

- **Vor der Abschnittsleiste.** Der Plan gilt dem ganzen Tag, die Leiste engt
  auf einen Abschnitt ein. Und vor dem Wetter, weil er keine Empfehlung ist,
  die sich nach dem Wetter richtet, sondern eine Verabredung mit sich selbst.
- **Abhaken an Ort und Stelle**, mit derselben Gesehen-Markierung wie überall
  — kein zweiter Zustand für dieselbe Sache. Bis `v28` kannte „Heute" kein
  `data-seen`; man musste einen Ort erst öffnen, um ihn abzuhaken.
- **Erledigte bleiben stehen**, gedämpft und durchgestrichen. Sie verschwinden
  zu lassen hieße, den Fortschritt zu verstecken — und genau der ist der
  Grund, morgens hierherzuschauen.
- **Die Restzeit zählt nur die offenen Stationen.** Die erledigten sind vorbei;
  sie in der Restzeit zu führen wäre schlicht falsch.
- **Was ein Vorschlag kostet, steht seit `v37` dabei** („≈ 12 Min Umweg —
  käme nach Rocca Scaligera"). Gerechnet wird die **günstigste
  Einfügestelle** in die Kette des Tages, Zeltplatz am Anfang und am Ende:
  `d(vorher, neu) + d(neu, nachher) − d(vorher, nachher)`. Das ist der
  ehrliche Preis — was der Tag länger wird, nicht die Entfernung vom
  Zeltplatz. Bis `v36` sagte der Vorschlag nur, *was* er vorschlägt: ein Ort
  auf dem Weg und einer am anderen Ende des Sees sahen gleich einladend aus.
- **„In den Tag" statt „Merken"**, sobald für heute etwas geplant ist: ein
  Tipp legt den Ort an genau die errechnete Stelle, in die Merkliste und auf
  den heutigen Tag. Vorher waren das drei Schritte (Stern, Reiterwechsel,
  Tagwähler). Steht der Ort schon im Tag, sagt die Zeile das — statt einen
  Knopf ohne Wirkung anzubieten. Für „morgen früh" gibt es keinen Umweg:
  morgen hat eine andere Kette, und eine Zahl für eine Kette, die es noch
  nicht gibt, wäre geraten.
- **Die Marke am Reise-Reiter zählt die heute offenen Stationen**, sobald für
  heute etwas geplant ist — sonst die ganze Merkliste. Wer vierzehn Tage
  plant, hat dort schnell dreißig Einträge, und „30" sagt am Dienstag nichts
  darüber, was heute noch zu tun ist. Ist heute alles abgehakt, verschwindet
  die Marke; für Vorleser steht es als `aria-description` am Reiter.

Beim Abhaken wird **nur dieser Block** neu gebaut, nicht die ganze Ansicht —
ein `render()` ließe die Seite springen, und der Fokus käme abhanden. Er wird
danach auf dasselbe Kästchen zurückgesetzt.

## Karte

Seit `v21` gebaut. **Kein eigener Reiter**, sondern ein Umschalter in der
Filterzeile der Ortsansicht: *Karte* ⇄ *Liste*. Damit gelten Suche, Filter,
der Jum-Schalter und die Sortierung unverändert weiter — die Karte zeigt
genau die Treffer, die die Zählzeile darüber nennt, statt eine zweite
Wahrheit aufzumachen.

- **Nadeln in den Kategoriefarben**, dieselben fünf wie die Kante an der
  Listenzeile. Weißer Ring, sonst verschwindet Verde im Grün der Parks.
  Gesehene Orte sind gedämpft.
- **Der Zeltplatz ist als eigene, dunkle Nadel dabei** — ohne ihn weiß man
  nicht, von wo die Entfernungen in der Liste gelten. Sein Name steht seit
  v26 **fest daneben**, nicht mehr in einem Tooltip: ein Tooltip braucht ein
  Überfahren mit der Maus, und das gibt es auf dem Zielgerät nicht — die
  Beschriftung war dort nie zu sehen.
- **Ist ein Standort gesetzt** („Von hier aus messen"), steht er als
  seeblaue Nadel mit Hof auf der Karte, beschriftet mit *Du bist hier* und
  der Uhrzeit. Vorher verschob der Standort still den Bezugspunkt aller
  Entfernungen, und die Karte zeigte davon nichts. Der Ausschnitt schließt
  den Startpunkt mit ein — „von wo starte ich" lässt sich nicht beantworten,
  wenn er außerhalb liegt.
- **Beide Bezugspunkte sind keine Bedienelemente:** sie liegen unter den
  Orten und lassen jeden Tipp durch. Ihr Schild steht 27 px versetzt (Zelt
  nach unten, Standort nach oben) und verdeckt damit keine Bündelzahl.
- **Nadel antippen öffnet dasselbe Sheet** wie eine Listenzeile. Die
  Trefferfläche misst 30 px, der sichtbare Punkt bleibt 16 px.
- **Nadeln, die näher als 34 px beieinander lägen, werden gebündelt** — ein
  Kreis mit der Zahl darin. Antippen zoomt so weit hinein, dass sich das
  Bündel mindestens halbiert.
- **Leaflet 1.9.4 liegt unter `vendor/leaflet/`** im Repo, BSD-2-Clause.
- **Fraunces und Karla liegen unter `fonts/`** im Repo, SIL Open Font
  License 1.1. Lizenztext und Herkunft stehen in `fonts/LICENSE.md`; die
  OFL erlaubt das Mitliefern ausdrücklich.
  Kein CDN zur Laufzeit. Geladen wird es trotzdem erst beim ersten Öffnen der
  Karte: 162 kB beim Start zu zahlen für eine Ansicht, die man vielleicht nie
  aufmacht, wäre die falsche Reihenfolge.
- **Offline** liegt Leaflet im Cache (`SHELL`), die Kacheln nicht — die kommen
  zur Laufzeit und lassen sich nicht sinnvoll vorhalten. Ohne Netz zeigt die
  Karte die Nadeln ohne Untergrund.

**Erledigt in v25: die Nadeln überlappten im Ortskern.** Gemessen bei 402 px
Breite im Übersichtszustand: **96 von 102 Nadeln** lagen so dicht, dass sich
ihre Punkte berührten, 100 von 102 näher als 34 px. Die Karte zeigte einen
Fleck, und die verdeckten Nadeln waren gar nicht zu treffen.

Gebündelt wird **ohne Fremdpaket** — der übliche Cluster-Aufsatz für Leaflet
wäre die zweite externe Abhängigkeit gewesen, und bei 101 Punkten rechnet die
naive Schleife in unter einer Millisekunde. Nach Pixelabstand im aktuellen
Zoom, nicht nach einem Gitter über die Koordinaten: ein Gitter trennt zwei
Nadeln, die 2 px auseinanderliegen, wenn zufällig eine Zellgrenze dazwischen
läuft.

| | vorher | nachher |
|---|---|---|
| Nadeln im Übersichtszustand | 102 | 9 |
| davon überlappend | 96 | 0 |
| vertretene Orte | 101 | 101 |

Drei Details, die aus Messungen kamen und nicht aus dem Entwurf:

1. **Der Schwerpunkt wandert beim Einsammeln.** Dadurch konnten zwei fertige
   Bündel doch wieder näher als 34 px beieinander liegen. Ein Nachlauf legt
   solche Paare zusammen. Gefunden, weil die Zusicherung fehlschlug.
2. **„Bricht in mindestens zwei auf" war zu wenig.** Damit ging die Altstadt
   72 → 61 → 50 → 43: drei Tipps für nicht einmal die Hälfte. Jetzt springt
   ein Tipp auf den Zoom, bei dem sich das größte Bündel halbiert — 72 → 33 →
   9 → 4.
3. **Neun Punkte in den Daten tragen mehr als einen Ort** (gleiche Adresse,
   gleiche Koordinate — etwa *Osteria sugli Scavi* und *Dom San Martino*).
   Dort hilft kein Zoom. Das Bündel zeigt dann die Namen zum Antippen, statt
   den Benutzer ins Leere tippen zu lassen.

**Behoben in v26: das Detail-Sheet lag hinter der Karte.** Wer in der
Kartenansicht eine Nadel antippte, bekam das Sheet — aber Nadeln, Zoomknöpfe
und Kacheln stanzten mitten hindurch. Ursache: `.map` bildete keinen eigenen
Stapelkontext, dadurch lagen Leaflets interne `z-index`-Werte (bis 700) im
selben Stapel wie der Rest der App, und das Sheet mit `z-index: 50` verlor
gegen jeden davon. Zwei Zeilen auf `.map` (`position: relative; z-index: 0`)
kapseln das.

> **Merkwürdigkeit, die dabei aufgefallen ist:** `elementFromPoint` meldete
> in genau dem Zustand, in dem der Bildschirmabzug die Nadeln über dem Sheet
> zeigte, brav das Sheet als oberstes Element. Leaflet schiebt seine Nadeln
> mit `translate3d`, sie liegen also auf eigenen Grafikebenen — deren
> Zeichenreihenfolge muss nicht der Trefferreihenfolge entsprechen. **Eine
> Trefferprobe taugt hier nicht als Nachweis.** `scripts/browser/karte.mjs`
> prüft deshalb die Bedingung selbst: eigener Stapelkontext, und darin
> unterhalb des Sheets. Beide Fehlerarten sind gegengeprüft — kein Kontext,
> und Kontext mit zu hohem `z-index`.

**Hinweis für Tests in dieser Umgebung:** das hier verwendete Chromium traut
dem MITM-Zertifikat des Agent-Proxys nicht, alle fremden Anfragen enden in
`ERR_ABORTED` — deshalb laden die Kartenkacheln nicht. (Die Schriften waren
bis v23 derselbe Fall; sie liegen jetzt im Repo und laden hier normal.) Mit
`ignoreHTTPSErrors: true` laden sie (am 19.09.2026 nachgestellt, 200er von
`tile.openstreetmap.org`). Das ist eine Eigenheit der Umgebung, kein Fehler
der App. `scripts/browser/karte.mjs` prüft deshalb alles außer den Kacheln.

## Icons neu erzeugen

Motiv ist das Fünfeck der venezianischen Festung mit einer Wellenlinie.
Die PNGs liegen fest im Repo, das Skript ist nur zum Reproduzieren:

```bash
pip install Pillow
python3 scripts/make-icons.py
```

## Dateien

```
index.html              Shell
selbsttest.html         Diagnoseseite für echte Geräte (nicht Teil der App)
koordinaten.html        Einmalige Koordinatensuche im Browser (nicht Teil der App)
style.css               Tokens, Light und Dark, Layout, @font-face
app.js                  Laden, Zustand, Filter, Sortierung, Sheet, Merkliste
sw.js                   Service Worker: App-Shell, Schriften, places.json
manifest.webmanifest
data/places.json        Alle Inhalte
fonts/                  Fraunces und Karla als woff2 (latin, latin-ext)
icons/                  App-Icons und iOS-Startbilder
scripts/test-logic.mjs  Prüfstand für die Freitext-Logik und die Daten (node)
scripts/browser/run.mjs Sammelläufer: startet den Server und alle Suiten daneben
scripts/browser/*.mjs   eine Datei je Thema (plan, hund, karte, close, ios …)
scripts/browser-abnahme.mjs  ältere Gesamtabnahme samt Bildschirmabzügen
scripts/add-coords.mjs  einmaliges Geocoding für die Karte
scripts/make-icons.py   Icon-Generator
scripts/make-matrix.mjs Eichung der Wegerechnung (Umwegfaktor, Gegenprobe)
scripts/make-mockups.mjs     rendert die Entwürfe zum Relaunch-Konzept
docs/uebergabe.md       Übergabe: Regeln des Hauses, Fallen, offene Punkte
docs/app-relaunch-konzept.md Analyse, Produktkonzept und Umbauplan ab v34
docs/bilder/            Bildschirmabzüge (ist/) und Entwürfe (konzept/)
docs/redesign-vorschlag.md   Audit, Design-Richtung, die vier Schritte
docs/koordinaten-pruefliste.md   Regeln der Geocodierung
```

Wer hier neu anfängt, liest **`docs/uebergabe.md`** zuerst. Dort stehen die
Konventionen, die Fallen (parallele Zweige, doppelte JSON-Schlüssel,
Kontrast richtig messen, was iOS anders macht) und was offen ist.

## Getestet

536 Browser-Prüfungen in Chromium auf iPhone-Viewport (402×754): Suche, Filter und
Sortierung kombiniert, Merkliste über einen Reload, Detail-Sheet ohne
Layout-Shift, Dark Mode samt Override und Systempräferenz, Touch-Ziele,
Flugmodus-Test (offline laden, suchen, Merkliste), Fehlerzustand mit Retry und
der `file://`-Fall. Seit v23 prüft die Abnahme auch die Schriften selbst: dass
keine von einem fremden Server kommt, dass keine doppelt geladen wird und dass
die variable Gewichtsachse wirkt (500 und 600 kommen aus **einer** Datei und
müssen verschieden breit setzen). Bis v22 ging nur der Fallback-Stack, weil
Google aus der Build-Umgebung nie antwortete.

Alle Angaben ohne Gewähr. Bewertungen und Öffnungsstatus sind Google-Stände vom
17.09.2026, Fahrpläne und Preise von Trenitalia, Navigazione Laghi, ATV und den
offiziellen Seiten.
