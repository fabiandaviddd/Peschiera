# Peschiera kompakt

Mobil-first Web-App mit kuratierten Tipps für Peschiera del Garda und Umgebung.
Vanilla HTML/CSS/JS, kein Build, keine Abhängigkeiten, keine Laufzeit-Requests
außer der eigenen `data/places.json`. Läuft direkt von GitHub Pages.

Hund (Jum) ist durchgängig Filterkriterium.

## Stand

**Phase 1 (Core-App) ist fertig.** Phase 2 (Karte + `scripts/add-coords.js`)
folgt danach — alle `geo`-Felder sind bewusst noch `null`, es wird zur Laufzeit
nicht geocodiert.

## Dateien

```
index.html          Shell: Header, Suche, Jum-Toggle, Tabs, Sheet, Fehler-Screen
style.css           Design-Tokens (v1), Mobile-first, 2 Spalten ab 768px
app.js              Laden, State, Filter, localStorage, Detail-Sheet, Korrekturen
data/places.json    54 places + merken + open_questions + faktencheck
README.md
```

## Lokal starten

`fetch()` funktioniert nicht über `file://` — es braucht einen kleinen Server:

```bash
cd ~/Sites/peschiera-kompakt
python3 -m http.server 8000
# http://localhost:8000
```

Die App zeigt diesen Hinweis auch selbst an, wenn sie über `file://` geöffnet wird.

## Funktionen (Phase 1)

| Feature | Umsetzung |
|---|---|
| Kategorie-Tabs | Alle / Essen / Café / Sehen / Ausflug / Praktisch / ★ Merken, mit Anzahl |
| Karten | Name, Kurztext, Tags, Zeiten und Preis nur wenn hinterlegt |
| Jum-Filter | Toggle auf `dog_friendly` truthy, Zustand in `localStorage` (`pk2.jum`) |
| Merken | Eigene Ansicht für die 9 Einträge aus `merken[]`, mit Notiz auf der Karte |
| Suche | Live über Name, Kurztext, Notizen, Adresse und Tags; mehrere Begriffe = UND |
| Detail-Sheet | Bottom Sheet mit allen Feldern, Website-, Telefon- und Kartenlink |
| Responsive | 1 Spalte mobil, 2 ab 768 px, 3 ab 1140 px |

Diakritika werden bei der Suche normalisiert — „cafe" findet „Café", „straße"
findet „Straße".

### Animationen

Exakt nach Vorgabe, Timings in `style.css` als Custom Properties:

- **Tabwechsel:** 150 ms Fade (`--t-fade`)
- **Sheet:** 300 ms `ease-out` von unten, Backdrop blendet parallel ein;
  Schließen per Backdrop-Tap, ✕, `Esc` oder Wischen nach unten (> 80 px)
- **Jum-Toggle:** einmaliger Puls `scale(1 → 1.08 → 1)` in 200 ms, nur beim Aktivieren
- **Suche:** Karten-Nodes werden wiederverwendet und nur umsortiert, statt das DOM
  neu zu bauen — deshalb kein Flackern und kein `display`-Toggle

`prefers-reduced-motion: reduce` schaltet alle Animationen ab.

### Kein Layout-Shift beim Sheet

Beim Öffnen wird `body` gesperrt (`overflow: hidden`) und die Breite der
verschwindenden Scrollbar als `padding-right` kompensiert. Das Sheet liegt
`position: fixed` über dem Layout und verschiebt nichts.

## Datenschema

`data/places.json`:

```json
{
  "_meta":  { "…": "Version, Datenstatus, Schema, Soll-Anzahlen" },
  "places": [ { "id": "essen-01", "…": "…" } ],
  "merken": [ { "id": "merken-01", "ref": "sehen-07", "note": "…" } ],
  "open_questions": [ { "id": "oq-01", "ref": "sehen-10", "question": "…" } ],
  "faktencheck":    [ { "id": "fc-01", "claim": "…", "status": "…", "source": "…" } ]
}
```

Ein `place`:

| Feld | Typ | Bedeutung |
|---|---|---|
| `id` | string | eindeutig, stabil (Referenzziel für `merken[]`) |
| `name` | string | Anzeigename |
| `category` | enum | `essen` \| `cafe` \| `sehen` \| `ausflug` \| `praktisch` |
| `short` | string | ein Satz, steht auf der Karte |
| `notes` | string | Langtext im Sheet |
| `tags` | string[] | Stichworte, fließen in die Suche ein |
| `hours`, `price`, `address`, `website`, `phone` | string \| null | nur wenn belegt, sonst Fallbacktext |
| `dog_friendly` | true \| false \| null | Basis des Jum-Filters (`null` = unklar, fällt heraus) |
| `dog_note` | string \| null | Details zur Hunderegelung |
| `geo` | null \| `{lat, lon}` | Phase 2, aktuell überall `null` |
| `verified` | bool | `false` → Badge „ungeprüft" in der UI |
| `status` | `ok` \| `open` | `open` → Platzhalterkarte für offene Punkte |
| `source` | string \| null | Quelle, falls geprüft |

Optionale Zusatzfelder werden im Sheet automatisch angezeigt, wenn vorhanden:
`last_entry`, `payment`, `duration`, `season`, `hours_note`.

`open_questions[]` und `faktencheck[]` sind laut Spezifikation rein informativ
und erscheinen **nicht** in der UI — sie werden beim Start in die Konsole
geloggt, damit offene Punkte beim Entwickeln sichtbar bleiben.

### Fehlerfälle

- `fetch` schlägt fehl → Vollbild-Fehlermeldung mit Retry-Button, kein stilles Scheitern
- Felder fehlen → `hydrate()` normalisiert, die Karte rendert mit Fallbacktext
- Karten-Render wirft → wird pro Karte abgefangen, die Liste bleibt intakt
- `localStorage` blockiert (Private Mode) → Filter gilt nur für die Sitzung

## Datenkorrekturen

Die Korrekturen stehen in `app.js` als `DATA_CORRECTIONS` und werden nach dem
Laden auf die Kopie im Speicher angewendet — `data/places.json` bleibt
unberührt, wie vorgegeben.

1. **Grotte di Catullo, Sirmione** (`sehen-07`) — Quelle: Direzione regionale
   Musei Lombardia
   Eintritt 10 €; Mo 9:00–13:00, Di–Sa 8:30–19:30, So 10:00–19:30; letzter
   Einlass 40 Minuten vor Schließung; Kartenzahlung möglich. Hunde an der Leine
   im Außengelände erlaubt, kleine tragbare Hunde auch im archäologischen
   Museum → für Jum in beiden Bereichen passend.

2. **Fähre Peschiera → Sirmione** (`ausflug-05`)
   ca. 25 Minuten, ca. 6,50 €, Sommerfahrplan bis 04.10. Die genauen
   Abfahrtszeiten sind nicht gesichert und werden **nicht** angezeigt —
   stattdessen ein Hinweis mit der Nummer **800 551 801** bzw. Verweis auf das
   Imbarcadero.

## Offene Punkte

Erscheinen als gestrichelte Platzhalterkarten mit Badge „offener Punkt" und als
`TODO` in `notes` — bewusst ohne erfundene Daten:

- **Esplanade** (`sehen-10`) — unklar, was gemeint war
- **Santuario** (`sehen-03`) — vermutlich Madonna del Frassino, unbestätigt
- **Isola del Garda** (`ausflug-07`) — Anbieter und Abfahrt ungeklärt
- **Le Morette** (`essen-11`) — Verkostung, Hofverkauf oder Lokal?
- **Fähre Peschiera–Sirmione** (`ausflug-05`) — exakter Fahrplan, siehe oben

Dazu drei weitere in `open_questions[]`: Hundebetreuung bei Gardaland, Tierarzt
mit Notdienst, Parken in der Hochsaison.

## ⚠️ Datenbestand ist ein Gerüst

`data/places.json` in diesem Repo ist **nicht** die v1-Datei — die lag bei
Projektstart nicht im Repository vor. Die Datei hat die vollständige Struktur
und die vorgegebenen Anzahlen (54 / 13-6-11-11-13, `merken` 9,
`open_questions` 8, `faktencheck` 13), aber:

- **Geprüft** (`verified: true`) sind Sehenswürdigkeiten, Ausflüge und
  praktische Hinweise, bei denen die Angabe belastbar ist.
- **Ungeprüft** (`verified: false`) sind insbesondere alle Restaurant- und
  Café-Einträge. Sie sind bewusst als Platzhalter formuliert, damit keine
  Lokalnamen erfunden werden, und tragen in der App sichtbar das Badge
  „ungeprüft".

Zum Übernehmen der echten Daten einfach `data/places.json` ersetzen. Die App
liest jede Datei, die dem Schema oben entspricht; `_meta.data_status` von
`"scaffold"` auf etwas anderes setzen, dann verschwindet der Hinweis im Footer.

## Deployment (GitHub Pages)

Kein Build — der Repo-Root wird direkt ausgeliefert.

```bash
git add -A && git commit -m "…" && git push
```

Pages einmalig aktivieren: **Settings → Pages → Source: Deploy from branch →
`main` / `root`**.

## Phase 2 (geplant)

1. `scripts/add-coords.js` — einmaliges Node-Skript, füllt `geo` über Nominatim
   (1 Request/Sekunde), idempotent, überspringt bereits gesetzte Einträge.
2. Tab „Karte" mit Leaflet aus einem lokalen `vendor/`-Ordner (kein CDN),
   OSM-Tiles, Marker in den Kategoriefarben, Jum-Filter live auf den Markern,
   Marker-Tap öffnet das Sheet aus Phase 1.

Die Kategoriefarben liegen dafür schon in `CATEGORIES` in `app.js`.
