/* ==========================================================================
   Peschiera kompakt v2 - app.js
   Vanilla ES2020+, keine Abhängigkeiten, kein Build.
   Alle Inhalte kommen aus data/places.json - hier stehen keine Ortsdaten,
   außer den bewusst nachträglich gepatchten Korrekturen (DATA_CORRECTIONS).
   ========================================================================== */
'use strict';

/* --------------------------------------------------------------------------
   Konstanten
   -------------------------------------------------------------------------- */

const DATA_URL = './data/places.json';
const LS_JUM = 'pk2.jum';

/* Timings exakt wie in style.css - hier nur für die JS-Choreografie */
const T_FADE = 150;   /* Tabwechsel */
const T_SHEET = 300;  /* Bottom Sheet */
const T_PULSE = 200;  /* Jum-Toggle */

const SWIPE_CLOSE_PX = 80;

/* Kategorien: Reihenfolge = Tab-Reihenfolge.
   Die Farben sind aus den v1-Tokens abgeleitet (nur für Akzentleiste/Label)
   und werden in Phase 2 für die Marker-Farben der Karte wiederverwendet. */
const CATEGORIES = [
  { key: 'essen',     label: 'Essen',     color: '#C0562F' },
  { key: 'cafe',      label: 'Café',  color: '#A8761F' },
  { key: 'sehen',     label: 'Sehen',     color: '#2C6E49' },
  { key: 'ausflug',   label: 'Ausflug',   color: '#2A6F97' },
  { key: 'praktisch', label: 'Praktisch', color: '#5B5F6B' }
];

const CAT_BY_KEY = new Map(CATEGORIES.map(c => [c.key, c]));

const VIEW_ALL = 'alle';
const VIEW_MERKEN = 'merken';

/* --------------------------------------------------------------------------
   Datenkorrekturen
   Werden nach dem Laden auf die Kopie im Speicher angewendet - data/places.json
   bleibt unberührt (so vorgegeben). Beim Uebernehmen in die Quelldatei hier
   austragen.
   -------------------------------------------------------------------------- */

const DATA_CORRECTIONS = {
  /* 1) Grotte di Catullo, Sirmione - Quelle: Direzione regionale Musei Lombardia */
  'sehen-07': {
    patch: {
      dog_friendly: true,
      dog_note: 'Hunde an der Leine sind im Außengelände erlaubt. Kleine Hunde, die getragen ' +
                'werden können, dürfen auch ins archäologische Museum. Jum passt also für beides.',
      price: '10 €',
      hours: 'Mo 9:00–13:00\nDi–Sa 8:30–19:30\nSo 10:00–19:30',
      last_entry: '40 Minuten vor Schließung',
      payment: 'Kartenzahlung möglich',
      verified: true,
      source: 'Direzione regionale Musei Lombardia'
    }
  },

  /* 2) Fähre Peschiera -> Sirmione
     Keine Platzhalterzeiten anzeigen - stattdessen Hinweis mit Telefonnummer. */
  'ausflug-05': {
    patch: {
      duration: 'ca. 25 Minuten',
      price: 'ca. 6,50 €',
      season: 'Sommerfahrplan bis 04.10.',
      hours: null,
      hours_note: 'Abfahrtszeiten nicht gesichert – am Imbarcadero erfragen oder 800 551 801 anrufen.',
      phone: '800 551 801',
      verified: true
    },
    notice: {
      title: 'Abfahrtszeiten offen',
      text: 'Die genauen Abfahrtszeiten sind nicht gesichert und werden hier deshalb nicht ' +
            'angezeigt. Bitte am Imbarcadero erfragen oder 800 551 801 anrufen. ' +
            'Fahrzeit ca. 25 Minuten, ca. 6,50 €, Sommerfahrplan bis 04.10.'
    }
  }
};

/* TODO (Phase 2): geo bleibt bis auf Weiteres null. Kein Geocoding zur Laufzeit -
   scripts/add-coords.js füllt die Koordinaten einmalig in data/places.json. */

/* --------------------------------------------------------------------------
   State
   -------------------------------------------------------------------------- */

const state = {
  places: [],
  merken: [],
  byId: new Map(),
  view: VIEW_ALL,
  query: '',
  jumOnly: loadJum(),
  activeId: null,
  activeCacheKey: null
};

function loadJum() {
  try { return localStorage.getItem(LS_JUM) === '1'; }
  catch (_) { return false; }   /* Private Mode / blockierter Storage */
}

function saveJum(on) {
  try { localStorage.setItem(LS_JUM, on ? '1' : '0'); }
  catch (_) { /* nicht kritisch - Filter gilt dann nur für diese Sitzung */ }
}

/* --------------------------------------------------------------------------
   DOM
   -------------------------------------------------------------------------- */

const $ = (id) => document.getElementById(id);

const dom = {
  app: $('app'),
  loading: $('loading'),
  error: $('error'),
  errorText: $('error-text'),
  errorRetry: $('error-retry'),
  tabs: $('tabs'),
  search: $('search'),
  searchClear: $('search-clear'),
  jum: $('jum-toggle'),
  views: $('views'),
  grid: $('grid'),
  empty: $('empty'),
  emptyText: $('empty-text'),
  emptyReset: $('empty-reset'),
  count: $('result-count'),
  hint: $('filter-hint'),
  footer: $('footer-note'),
  brandSub: $('brand-sub'),
  backdrop: $('backdrop'),
  sheet: $('sheet'),
  sheetGrip: $('sheet-grip'),
  sheetClose: $('sheet-close'),
  sheetScroll: $('sheet-scroll'),
  sheetTitle: $('sheet-title'),
  sheetBody: $('sheet-body')
};

/* Card-Cache: Nodes werden wiederverwendet statt neu gebaut. Dadurch
   aktualisiert die Suche ohne sichtbares Flackern (kein Teardown des DOM). */
const cardCache = new Map();
let fadeTimer = null;

/* --------------------------------------------------------------------------
   Helfer
   -------------------------------------------------------------------------- */

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text != null && text !== '') n.textContent = text;
  return n;
}

/* Leere Strings, null und undefined gelten als "nicht vorhanden". */
function has(v) {
  if (v == null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function str(v, fallback) {
  return has(v) ? String(v).trim() : (fallback || '');
}

function catOf(place) {
  return CAT_BY_KEY.get(place && place.category) ||
         { key: 'sonstige', label: 'Sonstiges', color: '#6B7280' };
}

function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    /* Diakritika entfernen, damit "cafe" auch "Café" findet */
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss');
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/* --------------------------------------------------------------------------
   Laden
   -------------------------------------------------------------------------- */

async function init() {
  dom.error.hidden = true;
  dom.loading.hidden = false;
  dom.app.hidden = true;

  try {
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + res.statusText);

    const raw = await res.json();
    if (!raw || !Array.isArray(raw.places)) {
      throw new Error('places.json enthält kein places-Array.');
    }

    state.places = raw.places.map(hydrate).filter(Boolean);
    state.byId = new Map(state.places.map(p => [p.id, p]));
    state.merken = Array.isArray(raw.merken) ? raw.merken : [];
    state.meta = raw.meta || raw._meta || {};

    applyCorrections();

    /* open_questions[] und faktencheck[] sind laut Spezifikation rein
       informativ und werden nicht in der UI angezeigt - nur hier für die
       Konsole, damit offene Punkte beim Entwickeln sichtbar bleiben. */
    logInfoOnly(raw);

    cardCache.clear();
    renderTabs();
    syncJumButton(false);
    renderFooter();
    render({ animate: false });

    dom.loading.hidden = true;
    dom.app.hidden = false;
  } catch (err) {
    showError(err);
  }
}

/* Suchindex eines Eintrags. Das Kategorie-Label ist bewusst enthalten, damit
   "cafe" auch die Café-Einträge findet, deren Name das Wort nicht enthält. */
function buildHaystack(p) {
  return normalize([
    p.name, catOf(p).label, p.category, p.short, p.notes, p.address,
    p.dog_note, p.hours_note, (p.tags || []).join(' ')
  ].join(' · '));
}

/* Fehlende Felder werden hier einmal auf ein bekanntes Schema gebracht,
   damit kein Renderpfad auf undefined läuft. */
function hydrate(p, i) {
  if (!p || typeof p !== 'object') return null;
  const out = Object.assign({}, p);
  out.id = str(out.id, 'place-' + i);
  out.name = str(out.name, 'Ohne Namen');
  out.category = CAT_BY_KEY.has(out.category) ? out.category : 'praktisch';
  out.tags = Array.isArray(out.tags) ? out.tags.filter(has).map(t => String(t)) : [];
  out.status = out.status === 'open' ? 'open' : 'ok';
  out.verified = out.verified === true;
  out.geo = out.geo || null;   /* Phase 2 */
  out._haystack = buildHaystack(out);
  return out;
}

function applyCorrections() {
  for (const [id, corr] of Object.entries(DATA_CORRECTIONS)) {
    const place = state.byId.get(id);
    if (!place) {
      console.warn('[Korrektur] Eintrag "%s" nicht in places.json gefunden - übersprungen.', id);
      continue;
    }
    Object.assign(place, corr.patch || {});
    if (corr.notice) place._notice = corr.notice;
    place._corrected = true;
    /* Haystack neu aufbauen, damit korrigierte Texte auch durchsuchbar sind */
    place._haystack = buildHaystack(place);
  }
}

function logInfoOnly(raw) {
  const oq = Array.isArray(raw.open_questions) ? raw.open_questions : [];
  const fc = Array.isArray(raw.faktencheck) ? raw.faktencheck : [];
  if (oq.length) {
    console.info('[Peschiera kompakt] %d offene Fragen (nicht in der UI):', oq.length);
    oq.forEach(q => console.info('  • ' + str(q.question, str(q.id, '?'))));
  }
  if (fc.length) {
    const open = fc.filter(f => f.status !== 'bestätigt').length;
    console.info('[Peschiera kompakt] Faktencheck: %d Einträge, davon %d offen/zu prüfen.',
      fc.length, open);
  }
}

function showError(err) {
  const msg = (err && err.message) ? err.message : String(err);
  const fileHint = location.protocol === 'file:'
    ? ' Die Seite läuft über file:// - dort blockiert der Browser fetch(). ' +
      'Lokal mit einem kleinen Server starten, z.B. "python3 -m http.server".'
    : '';
  dom.errorText.textContent = 'data/places.json konnte nicht geladen werden: ' + msg + '.' + fileHint;
  dom.loading.hidden = true;
  dom.app.hidden = true;
  dom.error.hidden = false;
  console.error('[Peschiera kompakt] Laden fehlgeschlagen:', err);
}

/* --------------------------------------------------------------------------
   Tabs
   -------------------------------------------------------------------------- */

function viewDefs() {
  const defs = [{ key: VIEW_ALL, label: 'Alle', count: state.places.length }];
  for (const c of CATEGORIES) {
    defs.push({
      key: c.key,
      label: c.label,
      count: state.places.filter(p => p.category === c.key).length
    });
  }
  defs.push({ key: VIEW_MERKEN, label: '★ Merken', count: state.merken.length });
  return defs;
}

function renderTabs() {
  const frag = document.createDocumentFragment();
  for (const def of viewDefs()) {
    const btn = el('button', 'tab');
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(def.key === state.view));
    btn.dataset.view = def.key;
    btn.appendChild(el('span', null, def.label));
    btn.appendChild(el('span', 'tab__count', String(def.count)));
    frag.appendChild(btn);
  }
  dom.tabs.replaceChildren(frag);
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  renderTabs();

  /* 150ms Fade zwischen den Kategorie-Ansichten */
  dom.views.classList.add('is-fading');
  clearTimeout(fadeTimer);
  fadeTimer = setTimeout(() => {
    render({ animate: false });
    dom.views.classList.remove('is-fading');
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, T_FADE);
}

/* --------------------------------------------------------------------------
   Jum-Filter
   -------------------------------------------------------------------------- */

function syncJumButton(pulse) {
  dom.jum.setAttribute('aria-pressed', String(state.jumOnly));
  if (pulse && state.jumOnly) {
    /* Puls einmal: scale 1 -> 1.08 -> 1 in 200ms */
    dom.jum.classList.remove('is-pulsing');
    void dom.jum.offsetWidth;   /* Reflow erzwingen, damit die Animation neu startet */
    dom.jum.classList.add('is-pulsing');
    setTimeout(() => dom.jum.classList.remove('is-pulsing'), T_PULSE + 40);
  }
}

function toggleJum() {
  state.jumOnly = !state.jumOnly;
  saveJum(state.jumOnly);
  syncJumButton(true);
  render({ animate: false });
}

/* --------------------------------------------------------------------------
   Auswahl der Einträge
   -------------------------------------------------------------------------- */

function matchesQuery(place) {
  if (!state.query) return true;
  const q = normalize(state.query);
  /* alle Suchbegriffe müssen vorkommen (UND-Verknüpfung) */
  return q.split(/\s+/).filter(Boolean).every(term => place._haystack.includes(term));
}

function matchesJum(place) {
  return !state.jumOnly || !!place.dog_friendly;
}

/* Liefert eine Liste von Render-Items: { place, cacheKey, merkNote } */
function currentItems() {
  if (state.view === VIEW_MERKEN) {
    const items = [];
    state.merken.forEach((m, i) => {
      const place = m && m.ref ? state.byId.get(m.ref) : null;
      /* Merken-Eintrag ohne auflösbaren Verweis: eigenständig rendern */
      const base = place || hydrate({
        id: str(m && m.id, 'merken-' + i),
        name: str(m && (m.name || m.title), 'Gemerkter Punkt'),
        category: str(m && m.category, 'praktisch'),
        short: str(m && m.note, 'Kein Verweis auf einen Eintrag vorhanden.'),
        status: 'open'
      }, i);
      if (!matchesQuery(base) || !matchesJum(base)) return;
      items.push({
        place: base,
        cacheKey: 'merken:' + base.id,
        merkNote: str(m && m.note, '')
      });
    });
    return items;
  }

  return state.places
    .filter(p => state.view === VIEW_ALL || p.category === state.view)
    .filter(matchesQuery)
    .filter(matchesJum)
    .map(p => ({ place: p, cacheKey: state.view + ':' + p.id, merkNote: '' }));
}

/* --------------------------------------------------------------------------
   Rendern
   -------------------------------------------------------------------------- */

function render() {
  const items = currentItems();
  paintGrid(items);
  renderMeta(items.length);
}

function paintGrid(items) {
  /* Bereits gebaute Nodes werden hierher verschoben (nicht neu erzeugt) -
     dadurch bleibt der Inhalt beim Tippen stabil. */
  const frag = document.createDocumentFragment();
  for (const item of items) {
    let node = cardCache.get(item.cacheKey);
    if (!node) {
      node = buildCard(item);
      cardCache.set(item.cacheKey, node);
    }
    frag.appendChild(node);
  }
  /* Was jetzt noch im Grid steht, gehört nicht zur Auswahl. */
  dom.grid.replaceChildren();
  dom.grid.appendChild(frag);

  dom.empty.hidden = items.length > 0;
  dom.grid.hidden = items.length === 0;
  if (items.length === 0) dom.emptyText.textContent = emptyMessage();
}

function emptyMessage() {
  const parts = [];
  if (state.query) parts.push('Suche „' + state.query + '“');
  if (state.jumOnly) parts.push('Jum-Filter');
  if (!parts.length) return 'In dieser Ansicht gibt es keine Einträge.';
  return 'Keine Treffer für ' + parts.join(' + ') + '.';
}

function renderMeta(n) {
  const total = state.view === VIEW_MERKEN
    ? state.merken.length
    : state.places.filter(p => state.view === VIEW_ALL || p.category === state.view).length;

  const filtered = state.query || state.jumOnly;
  dom.count.textContent = filtered
    ? n + ' von ' + total + ' ' + plural(total, 'Eintrag', 'Einträgen')
    : total + ' ' + plural(total, 'Eintrag', 'Einträge');

  dom.hint.hidden = !state.jumOnly;
  dom.hint.textContent = '\u{1F415} nur mit Jum';
  dom.searchClear.hidden = !state.query;
}

function renderFooter() {
  const scaffold = state.meta && state.meta.data_status === 'scaffold';
  const n = state.places.length;
  dom.brandSub.textContent = 'Lago di Garda · ' + n + ' Tipps';
  dom.footer.textContent = scaffold
    ? 'Datenbestand: Gerüst. Einträge mit dem Hinweis „ungeprüft“ sind ' +
      'noch nicht bestätigt – data/places.json ersetzen, sobald die v1-Daten vorliegen.'
    : 'Alle Angaben ohne Gewähr – Öffnungszeiten und Preise vor Ort prüfen.';
}

/* --------------------------------------------------------------------------
   Card
   -------------------------------------------------------------------------- */

function buildCard(item) {
  const p = item.place;
  const cat = catOf(p);

  const card = el('button', 'card');
  card.type = 'button';
  card.dataset.key = item.cacheKey;
  card.dataset.id = p.id;
  card.style.setProperty('--cat-color', cat.color);
  card.setAttribute('aria-haspopup', 'dialog');

  try {
    if (p.status === 'open') card.classList.add('card--open');

    const head = el('div', 'card__head');
    head.appendChild(el('h3', 'card__name', p.name));
    head.appendChild(el('span', 'card__cat', cat.label));
    card.appendChild(head);

    card.appendChild(el('p', 'card__short',
      str(p.short, str(p.notes, 'Keine Beschreibung hinterlegt.')).slice(0, 180)));

    /* Fakten: Zeiten / Preis - nur wenn vorhanden, sonst nichts erfinden */
    const facts = el('div', 'card__facts');
    const hoursLine = has(p.hours)
      ? String(p.hours).split('\n')[0] + (String(p.hours).includes('\n') ? ' …' : '')
      : (has(p.hours_note) ? p.hours_note : '');
    if (hoursLine) facts.appendChild(fact('\u{1F552}', hoursLine, !has(p.hours)));
    if (has(p.price)) facts.appendChild(fact('\u{1F4B0}', String(p.price)));
    if (has(p.duration)) facts.appendChild(fact('⏱', String(p.duration)));
    if (facts.childElementCount) card.appendChild(facts);

    /* Badges */
    const badges = el('div', 'badges');
    if (p.dog_friendly === true) badges.appendChild(badge('badge--jum', '\u{1F415} Jum ok'));
    else if (p.dog_friendly === false) badges.appendChild(badge('badge--nojum', 'ohne Jum'));
    else badges.appendChild(badge('badge--maybe', 'Jum: unklar'));
    if (p.status === 'open') badges.appendChild(badge('badge--todo', 'offener Punkt'));
    else if (!p.verified) badges.appendChild(badge('badge--unverified', 'ungeprüft'));
    card.appendChild(badges);

    if (p.tags.length) {
      const tags = el('div', 'tags');
      p.tags.slice(0, 4).forEach(t => tags.appendChild(el('span', 'tag', t)));
      card.appendChild(tags);
    }

    if (item.merkNote) {
      const box = el('div', 'card__merk');
      box.appendChild(el('b', null, 'Gemerkt'));
      box.appendChild(el('span', null, item.merkNote));
      card.appendChild(box);
    }
  } catch (err) {
    /* Nie den ganzen Render abbrechen lassen */
    console.error('[Card] Fehler bei "%s":', p && p.id, err);
    card.replaceChildren(el('h3', 'card__name', str(p && p.name, 'Eintrag')),
                         el('p', 'card__short', 'Dieser Eintrag konnte nur teilweise angezeigt werden.'));
  }

  card.addEventListener('click', () => openSheet(p.id, item.cacheKey));
  return card;
}

function fact(icon, text, muted) {
  const n = el('span', 'card__fact' + (muted ? ' card__fact--muted' : ''));
  n.appendChild(el('span', null, icon));
  n.appendChild(el('span', null, text));
  return n;
}

function badge(cls, text) {
  return el('span', 'badge ' + cls, text);
}

/* --------------------------------------------------------------------------
   Detail-Sheet
   -------------------------------------------------------------------------- */

let lastFocused = null;

function openSheet(id, cacheKey) {
  const p = state.byId.get(id) || findLooseById(id);
  if (!p) return;

  state.activeId = id;
  state.activeCacheKey = cacheKey || null;
  lastFocused = document.activeElement;

  buildSheet(p);

  /* Kein Layout-Shift: Breite der verschwindenden Scrollbar kompensieren */
  const sbw = window.innerWidth - document.documentElement.clientWidth;
  if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
  document.body.classList.add('is-sheet-open');

  dom.backdrop.hidden = false;
  dom.sheet.hidden = false;
  dom.sheet.style.transform = '';
  dom.sheetScroll.scrollTop = 0;

  /* Ein Frame warten, damit die Transition greift (300ms, ease-out) */
  requestAnimationFrame(() => {
    dom.backdrop.classList.add('is-open');
    dom.sheet.classList.add('is-open');
  });

  dom.sheetClose.focus({ preventScroll: true });
}

function findLooseById(id) {
  const item = currentItems().find(i => i.place.id === id);
  return item ? item.place : null;
}

function closeSheet() {
  if (dom.sheet.hidden) return;

  dom.sheet.classList.remove('is-open', 'is-dragging');
  dom.sheet.style.transform = '';
  dom.backdrop.classList.remove('is-open');

  setTimeout(() => {
    dom.sheet.hidden = true;
    dom.backdrop.hidden = true;
    document.body.classList.remove('is-sheet-open');
    document.body.style.paddingRight = '';
  }, T_SHEET);

  const key = state.activeCacheKey;
  state.activeId = null;
  state.activeCacheKey = null;

  const node = key ? cardCache.get(key) : null;
  if (node && node.isConnected) node.focus({ preventScroll: true });
  else if (lastFocused && lastFocused.isConnected) lastFocused.focus({ preventScroll: true });
}

function buildSheet(p) {
  const cat = catOf(p);
  dom.sheet.style.setProperty('--cat-color', cat.color);
  dom.sheetTitle.textContent = p.name;

  const body = document.createDocumentFragment();
  body.appendChild(el('p', 'sheet__cat', cat.label));

  if (has(p.short)) body.appendChild(el('p', 'sheet__short', p.short));

  /* Hinweisbox: Korrekturhinweis, offener Punkt oder ungeprüft */
  const notice = noticeFor(p);
  if (notice) {
    const box = el('div', 'sheet__notice');
    box.appendChild(el('strong', null, notice.title));
    box.appendChild(el('span', null, notice.text));
    body.appendChild(box);
  }

  /* Detailfelder - jedes nur, wenn belegt; sonst Fallbacktext */
  const dl = el('dl', 'dl');
  addRow(dl, 'Öffnungszeiten', p.hours, p.hours_note || 'Nicht hinterlegt – vor Ort prüfen.');
  if (has(p.last_entry)) addRow(dl, 'Letzter Einlass', p.last_entry);
  if (has(p.duration)) addRow(dl, 'Dauer', p.duration);
  if (has(p.season)) addRow(dl, 'Saison', p.season);
  addRow(dl, 'Preis', p.price, 'Nicht hinterlegt.');
  if (has(p.payment)) addRow(dl, 'Bezahlung', p.payment);
  addRow(dl, 'Adresse', p.address, 'Nicht hinterlegt.');
  if (has(p.phone)) addRow(dl, 'Telefon', p.phone);
  addRow(dl, 'Mit Jum', dogText(p));
  if (p.tags.length) addRow(dl, 'Stichworte', p.tags.join(' · '));
  body.appendChild(dl);

  if (has(p.notes)) {
    body.appendChild(el('p', 'sheet__notes', p.notes));
  }

  /* Aktionen */
  const actions = el('div', 'sheet__actions');
  if (has(p.website)) {
    const a = el('a', 'btn btn--primary btn--block', 'Website öffnen');
    a.href = p.website;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    actions.appendChild(a);
  }
  if (has(p.phone)) {
    const a = el('a', 'btn btn--ghost btn--block', 'Anrufen: ' + p.phone);
    a.href = 'tel:' + String(p.phone).replace(/[^\d+]/g, '');
    actions.appendChild(a);
  }
  if (has(p.address)) {
    /* Kein Geocoding zur Laufzeit - nur ein Suchlink auf OSM (wie Phase 2) */
    const a = el('a', 'btn btn--ghost btn--block', 'Auf der Karte suchen');
    a.href = 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(p.address);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    actions.appendChild(a);
  }
  if (actions.childElementCount) body.appendChild(actions);

  if (has(p.source)) {
    body.appendChild(el('p', 'sheet__source', 'Quelle: ' + p.source));
  }

  dom.sheetBody.replaceChildren(body);
}

function noticeFor(p) {
  if (p._notice) return p._notice;
  if (p.status === 'open') {
    return {
      title: 'Offener Punkt',
      text: 'Hier fehlen belastbare Angaben. Bewusst nichts erfunden – ' +
            'vor Ort oder telefonisch klären und dann in data/places.json ergänzen.'
    };
  }
  if (p._corrected) {
    return { title: 'Korrigierte Angaben', text: 'Diese Angaben wurden gegen eine Quelle geprüft und korrigiert.' };
  }
  if (!p.verified) {
    return {
      title: 'Ungeprüft',
      text: 'Dieser Eintrag stammt aus dem Datengerüst und ist nicht bestätigt. ' +
            'Name, Adresse und Zeiten vor dem Besuch prüfen.'
    };
  }
  return null;
}

function addRow(dl, label, value, fallback) {
  if (!has(value) && !has(fallback)) return;
  dl.appendChild(el('dt', null, label));
  const dd = el('dd', has(value) ? null : 'is-fallback', has(value) ? String(value) : fallback);
  dl.appendChild(dd);
}

function dogText(p) {
  const head = p.dog_friendly === true ? 'Ja'
             : p.dog_friendly === false ? 'Nein'
             : 'Unklar';
  return has(p.dog_note) ? head + ' – ' + p.dog_note : head;
}

/* --- Swipe-to-dismiss --- */

let drag = null;

function dragStart(y, fromGrip) {
  if (!fromGrip && dom.sheetScroll.scrollTop > 0) return;
  drag = { y0: y, dy: 0, active: false, fromGrip: fromGrip };
}

function dragMove(y, ev) {
  if (!drag) return;
  const dy = y - drag.y0;
  if (dy <= 0) {
    if (drag.active) { drag.dy = 0; dom.sheet.style.transform = ''; }
    return;
  }
  if (!drag.active) {
    if (dy < 6) return;                                  /* Schwelle gegen Verwackeln */
    if (!drag.fromGrip && dom.sheetScroll.scrollTop > 0) { drag = null; return; }
    drag.active = true;
    dom.sheet.classList.add('is-dragging');
  }
  drag.dy = dy;
  if (ev && ev.cancelable) ev.preventDefault();
  dom.sheet.style.transform = translateForDrag(dy);
}

function dragEnd() {
  if (!drag) return;
  const dy = drag.dy;
  const wasActive = drag.active;
  drag = null;
  dom.sheet.classList.remove('is-dragging');
  if (!wasActive) return;
  if (dy > SWIPE_CLOSE_PX) closeSheet();
  else dom.sheet.style.transform = '';   /* zurückschnappen */
}

/* Auf Desktop ist das Sheet zentriert (translateX(-50%)) - das muss beim
   Ziehen erhalten bleiben. */
function translateForDrag(dy) {
  return window.matchMedia('(min-width: 768px)').matches
    ? 'translate(-50%, ' + dy + 'px)'
    : 'translateY(' + dy + 'px)';
}

/* --------------------------------------------------------------------------
   Events
   -------------------------------------------------------------------------- */

dom.tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (btn) setView(btn.dataset.view);
});

dom.tabs.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const tabs = Array.from(dom.tabs.querySelectorAll('.tab'));
  const i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
  next.focus();
  setView(next.dataset.view);
});

/* Suche: reagiert auf jeden Tastendruck. Kein Debounce nötig - es werden
   nur vorhandene Nodes umsortiert, nicht neu gebaut. */
dom.search.addEventListener('input', () => {
  state.query = dom.search.value.trim();
  render();
});

dom.search.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.search.value) {
    e.stopPropagation();
    clearSearch();
  }
});

dom.searchClear.addEventListener('click', clearSearch);

function clearSearch() {
  dom.search.value = '';
  state.query = '';
  render();
  dom.search.focus();
}

dom.jum.addEventListener('click', toggleJum);

dom.emptyReset.addEventListener('click', () => {
  dom.search.value = '';
  state.query = '';
  if (state.jumOnly) { state.jumOnly = false; saveJum(false); syncJumButton(false); }
  render();
});

dom.errorRetry.addEventListener('click', init);

dom.backdrop.addEventListener('click', closeSheet);
dom.sheetClose.addEventListener('click', closeSheet);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !dom.sheet.hidden) closeSheet();
});

/* Touch (iOS/Android) */
dom.sheet.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  dragStart(e.touches[0].clientY, dom.sheetGrip.contains(e.target));
}, { passive: true });

dom.sheet.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 1) return;
  dragMove(e.touches[0].clientY, e);
}, { passive: false });

dom.sheet.addEventListener('touchend', dragEnd, { passive: true });
dom.sheet.addEventListener('touchcancel', dragEnd, { passive: true });

/* Maus/Pointer nur am Griff - sonst kollidiert es mit Textauswahl */
dom.sheetGrip.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;   /* Touch läuft über die Handler oben */
  dragStart(e.clientY, true);
  dom.sheetGrip.setPointerCapture(e.pointerId);
});
dom.sheetGrip.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  dragMove(e.clientY, e);
});
dom.sheetGrip.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') return;
  dragEnd();
});

/* Beim Wechsel mobil <-> Desktop das Drag-Transform nicht stehen lassen */
window.addEventListener('resize', () => {
  if (!drag && dom.sheet.style.transform) dom.sheet.style.transform = '';
});

init();
