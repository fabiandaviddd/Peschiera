/* ==========================================================================
   Peschiera kompakt — app.js

   Vanilla, kein Modul (damit file:// eine Chance hat), kein Build.
   Alle Inhalte kommen aus data/places.json — hier stehen keine Ortsdaten.
   ========================================================================== */
(function () {
  'use strict';

  var DATA_URL = './data/places.json';
  var LS_SAVED = 'pk.saved';
  var LS_THEME = 'pk.theme';
  var WALK_MAX = 25;          // Schwelle für den Filter "Zu Fuß"
  var TAGS_SHOWN = 12;        // sichtbare Tag-Chips, Rest hinter "mehr"

  /* ---------------------------------------------------------------- Zustand */

  var D = null;               // geladene Daten
  var catById = {};

  var S = {
    view: 'orte',
    q: '',
    cats: [],
    dog: false,
    walk: false,
    tags: [],
    sort: 'distance',
    tagsOpen: false,
    saved: [],
    theme: 'auto',
    openId: null
  };

  /* --------------------------------------------------------------- Speicher */

  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { /* Private Mode o.ä. — gilt dann nur für diese Sitzung */ }
  }

  /* ---------------------------------------------------------------- Helfer */

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function has(v) {
    if (v == null) return false;
    if (typeof v === 'string') return v.trim() !== '';
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }

  var nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var nf0 = new Intl.NumberFormat('de-DE');

  function km(v) {
    if (!has(v)) return '';
    return v < 1 ? nf0.format(Math.round(v * 1000)) + ' m' : nf1.format(v) + ' km';
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss');
  }

  function accentClass(catId) {
    var c = catById[catId];
    return 'acc-' + (c && c.accent ? c.accent : 'lake');
  }

  function catLabel(catId) {
    var c = catById[catId];
    return c && c.label ? c.label : catId;
  }

  /* Volltext laut Brief: Name, Adresse, Notiz und Tags. */
  function haystack(p) {
    return norm([p.name, p.address, p.note, (p.tags || []).join(' ')].join(' · '));
  }

  /* --------------------------------------------------------------- Symbole */

  var ICON = {
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/></svg>',
    rating: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/></svg>',
    walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.2" r="1.8"/><path d="M11 21l1.4-5.4-2.6-2.2.9-4.6 3.1-1.1 2.1 3.4 2.6 1"/><path d="M12.4 15.6L9 21"/><path d="M7.6 11.4L5 12.6"/></svg>',
    bike: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.6" cy="17" r="3.2"/><circle cx="18.4" cy="17" r="3.2"/><path d="M8.8 17h5l2.6-7.4h2.2M8 9.6h5.6l2.4 7.4"/><circle cx="14.6" cy="4.6" r="1.4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/></svg>',
    dog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 8.2V4.6l3 1.8h4.6l3-1.8v3.6"/><path d="M4.6 8.2c0 4 2.2 5.4 2.2 8.2 0 1.6 1.2 2.6 3 2.6h5c1.8 0 3-1 3-2.6 0-2.8 2.2-4.2 2.2-8.2"/><path d="M9.4 12.4h.01M14.6 12.4h.01"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6.4-6 6.4-10.4A6.4 6.4 0 0 0 5.6 10.6C5.6 15 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 3.6h3l1.6 4-2 1.4a11 11 0 0 0 5.2 5.2l1.4-2 4 1.6v3a1.8 1.8 0 0 1-2 1.8C10.6 19.8 4.2 13.4 4.4 5.6a1.8 1.8 0 0 1 1.8-2z"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.4h16M4 12h16M4 17.6h16"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 10.8V17M12 7.6h.01"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.4A8.4 8.4 0 1 1 9.6 4a6.8 6.8 0 0 0 10.4 10.4z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v16.8" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/></svg>'
  };

  /* ----------------------------------------------------------------- Laden */

  function loadData(done, fail) {
    /* 1. Versuch: fetch. Auf file:// blockieren Chrome und Safari das,
       deshalb 2. Versuch über XHR — das erlaubt Safari für lokale Dateien. */
    if (typeof fetch === 'function') {
      fetch(DATA_URL, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(done, function () { xhr(done, fail); });
    } else {
      xhr(done, fail);
    }
  }

  function xhr(done, fail) {
    try {
      var r = new XMLHttpRequest();
      r.open('GET', DATA_URL, true);
      r.onload = function () {
        /* file:// liefert status 0 bei Erfolg */
        if (r.status === 0 || (r.status >= 200 && r.status < 300)) {
          try { done(JSON.parse(r.responseText)); }
          catch (e) { fail('Die Datei data/places.json ist kein gültiges JSON.'); }
        } else {
          fail('data/places.json antwortete mit HTTP ' + r.status + '.');
        }
      };
      r.onerror = function () { fail(null); };
      r.send();
    } catch (e) { fail(null); }
  }

  function bootError(msg) {
    var local = location.protocol === 'file:';
    $('boot-spin').hidden = true;
    $('boot-title').textContent = 'Daten nicht geladen';
    $('boot-text').innerHTML = msg ? esc(msg) : (local
      ? 'Der Browser blockiert das Lesen lokaler Dateien über <code>file://</code>. '
        + 'In Safari funktioniert es meistens, in Chrome nicht. Für einen lokalen Test '
        + 'genügt ein kleiner Server im Projektordner:<br><code>python3 -m http.server 8000</code>'
      : 'data/places.json war nicht erreichbar. Verbindung prüfen und erneut versuchen.');
    $('boot-retry').hidden = false;
    $('boot').hidden = false;
    $('app').hidden = true;
  }

  function start(raw) {
    if (!raw || !Array.isArray(raw.places)) { bootError('data/places.json enthält kein places-Array.'); return; }

    D = raw;
    D.meta = D.meta || {};
    D.categories = Array.isArray(D.categories) ? D.categories : [];
    D.merken = Array.isArray(D.merken) ? D.merken : [];
    D.open_questions = Array.isArray(D.open_questions) ? D.open_questions : [];
    D.faktencheck = Array.isArray(D.faktencheck) ? D.faktencheck : [];

    catById = {};
    D.categories.forEach(function (c) { catById[c.id] = c; });

    D.places = D.places.filter(Boolean).map(function (p, i) {
      var o = {};
      for (var k in p) if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k];
      o.id = has(o.id) ? String(o.id) : 'p' + i;
      o.name = has(o.name) ? String(o.name) : 'Ohne Namen';
      o.tags = Array.isArray(o.tags) ? o.tags.filter(has) : [];
      o.geo = o.geo || null;        // Karte: Stufe 2, wird nicht zur Laufzeit geocodiert
      o._h = haystack(o);
      return o;
    });

    /* Gemerktes auf noch existierende IDs eingrenzen */
    var ids = {};
    D.places.forEach(function (p) { ids[p.id] = true; });
    S.saved = (lsGet(LS_SAVED, []) || []).filter(function (id) { return ids[id]; });

    S.theme = lsGet(LS_THEME, 'auto');
    if (['auto', 'light', 'dark'].indexOf(S.theme) < 0) S.theme = 'auto';
    applyTheme();

    $('sub').textContent = has(D.meta.subtitle) ? D.meta.subtitle : '';
    $('foot-note').textContent = has(D.meta.note) ? D.meta.note : '';

    buildTabs();
    buildCatChips();
    buildFlagChips();
    buildTagChips();
    bind();
    render();

    $('boot').hidden = true;
    $('app').hidden = false;

    registerSW();
    updateOfflineNote();
  }

  /* ----------------------------------------------------------------- Theme */

  function applyTheme() {
    var root = document.documentElement;
    if (S.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', S.theme);

    var label = { auto: 'Farbschema: automatisch', light: 'Farbschema: hell', dark: 'Farbschema: dunkel' }[S.theme];
    var icon = { auto: ICON.auto, light: ICON.sun, dark: ICON.moon }[S.theme];
    var btn = $('theme-btn');
    if (btn) {
      btn.innerHTML = '<span class="sr-only">' + esc(label) + ' — umschalten</span>' + icon;
      btn.setAttribute('title', label);
    }

    /* theme-color an das wirksame Schema anpassen */
    var dark = S.theme === 'dark' ||
      (S.theme === 'auto' && window.matchMedia &&
       window.matchMedia('(prefers-color-scheme: dark)').matches);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', dark ? '#14150F' : '#F4F0E6');
  }

  function cycleTheme() {
    S.theme = S.theme === 'auto' ? 'light' : S.theme === 'light' ? 'dark' : 'auto';
    lsSet(LS_THEME, S.theme);
    applyTheme();
  }

  /* ------------------------------------------------------------------ Tabs */

  var TABS = [
    { id: 'orte', label: 'Orte', icon: ICON.list },
    { id: 'gemerkt', label: 'Gemerkt', icon: ICON.star },
    { id: 'info', label: 'Info', icon: ICON.info }
  ];

  function buildTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" class="tab" role="tab" data-tab="' + t.id + '"'
        + ' aria-selected="' + (S.view === t.id ? 'true' : 'false') + '">'
        + t.icon
        + '<span>' + esc(t.label) + '</span>'
        + (t.id === 'gemerkt' ? '<span class="tab__n" id="tab-n" hidden></span>' : '')
        + '</button>';
    }).join('');
    syncTabs();
  }

  function syncTabs() {
    var btns = $('tabs').querySelectorAll('.tab');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-selected', btns[i].getAttribute('data-tab') === S.view ? 'true' : 'false');
    }
    var n = $('tab-n');
    if (n) { n.textContent = String(S.saved.length); n.hidden = S.saved.length === 0; }
  }

  function setView(v) {
    if (v === S.view) return;
    S.view = v;
    syncTabs();
    render();
    window.scrollTo(0, 0);
  }

  /* ----------------------------------------------------------------- Chips */

  function buildCatChips() {
    $('cat-row').innerHTML = D.categories.map(function (c) {
      var n = D.places.filter(function (p) { return p.category === c.id; }).length;
      return '<button type="button" class="chip ' + accentClass(c.id) + '" data-cat="' + esc(c.id) + '"'
        + ' aria-pressed="false">' + esc(c.label)
        + '<span class="chip__n">' + n + '</span></button>';
    }).join('');
  }

  function buildFlagChips() {
    var dogs = D.places.filter(function (p) { return p.dog === true; }).length;
    var walks = D.places.filter(function (p) { return has(p.walk_min) && p.walk_min <= WALK_MAX; }).length;
    $('flag-row').innerHTML =
      '<button type="button" class="chip chip--dog" id="chip-dog" aria-pressed="false">'
      + ICON.dog + 'Hund erlaubt<span class="chip__n">' + dogs + '</span></button>'
      + '<button type="button" class="chip chip--walk" id="chip-walk" aria-pressed="false">'
      + ICON.walk + 'Zu Fuß<span class="chip__n">' + walks + '</span></button>';
  }

  function allTags() {
    var count = {};
    D.places.forEach(function (p) {
      p.tags.forEach(function (t) { count[t] = (count[t] || 0) + 1; });
    });
    return Object.keys(count).sort(function (a, b) {
      return count[b] - count[a] || a.localeCompare(b, 'de');
    }).map(function (t) { return { tag: t, n: count[t] }; });
  }

  function buildTagChips() {
    var tags = allTags();
    var shown = S.tagsOpen ? tags : tags.slice(0, TAGS_SHOWN);
    var html = shown.map(function (t) {
      return '<button type="button" class="chip chip--tag" data-tag="' + esc(t.tag) + '"'
        + ' aria-pressed="' + (S.tags.indexOf(t.tag) >= 0 ? 'true' : 'false') + '">'
        + esc(t.tag) + '<span class="chip__n">' + t.n + '</span></button>';
    }).join('');
    if (tags.length > TAGS_SHOWN) {
      html += '<button type="button" class="chip chip--ghost" id="tags-more">'
        + (S.tagsOpen ? 'weniger' : 'alle ' + tags.length + ' Tags') + '</button>';
    }
    $('tag-row').innerHTML = html;
    /* Eingeklappt einzeilig und horizontal scrollbar, aufgeklappt umbrechend —
       so bleibt der Header in der Standardansicht flach. */
    $('tag-row').classList.toggle('chiprow--wrap', S.tagsOpen);
    measureBar();
  }

  /* Höhe des Sticky-Headers für scroll-padding-top bereitstellen. */
  function measureBar() {
    var bar = document.querySelector('.bar');
    if (!bar) return;
    document.documentElement.style.setProperty('--bar-h', bar.offsetHeight + 'px');
  }

  function syncChips() {
    var cats = $('cat-row').querySelectorAll('[data-cat]');
    for (var i = 0; i < cats.length; i++) {
      cats[i].setAttribute('aria-pressed', S.cats.indexOf(cats[i].getAttribute('data-cat')) >= 0 ? 'true' : 'false');
    }
    $('chip-dog').setAttribute('aria-pressed', S.dog ? 'true' : 'false');
    $('chip-walk').setAttribute('aria-pressed', S.walk ? 'true' : 'false');
    var tags = $('tag-row').querySelectorAll('[data-tag]');
    for (var j = 0; j < tags.length; j++) {
      tags[j].setAttribute('aria-pressed', S.tags.indexOf(tags[j].getAttribute('data-tag')) >= 0 ? 'true' : 'false');
    }
    var sorts = $('sort').querySelectorAll('[data-sort]');
    for (var k = 0; k < sorts.length; k++) {
      sorts[k].setAttribute('aria-pressed', sorts[k].getAttribute('data-sort') === S.sort ? 'true' : 'false');
    }
    $('q-clear').hidden = !S.q;
  }

  function toggleIn(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
  }

  function anyFilter() {
    return !!S.q || S.cats.length > 0 || S.dog || S.walk || S.tags.length > 0;
  }

  function resetFilters() {
    S.q = ''; S.cats = []; S.dog = false; S.walk = false; S.tags = [];
    $('q').value = '';
    render();
  }

  /* --------------------------------------------------------------- Auswahl */

  function selected() {
    var pool = S.view === 'gemerkt'
      ? D.places.filter(function (p) { return S.saved.indexOf(p.id) >= 0; })
      : D.places;

    var terms = norm(S.q).split(/\s+/).filter(Boolean);

    var out = pool.filter(function (p) {
      if (S.cats.length && S.cats.indexOf(p.category) < 0) return false;
      if (S.dog && p.dog !== true) return false;
      if (S.walk && !(has(p.walk_min) && p.walk_min <= WALK_MAX)) return false;
      if (S.tags.length) {
        var hit = false;
        for (var i = 0; i < S.tags.length; i++) if (p.tags.indexOf(S.tags[i]) >= 0) { hit = true; break; }
        if (!hit) return false;
      }
      for (var t = 0; t < terms.length; t++) if (p._h.indexOf(terms[t]) < 0) return false;
      return true;
    });

    return out.sort(S.sort === 'rating' ? byRating : byDistance);
  }

  /* Ohne Wert einsortiert ans Ende — nicht als 0 behandeln. */
  function byDistance(a, b) {
    var x = has(a.distance_km) ? a.distance_km : Infinity;
    var y = has(b.distance_km) ? b.distance_km : Infinity;
    if (x !== y) return x - y;
    var wa = has(a.walk_min) ? a.walk_min : Infinity;
    var wb = has(b.walk_min) ? b.walk_min : Infinity;
    if (wa !== wb) return wa - wb;
    return (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name, 'de');
  }

  function byRating(a, b) {
    var x = has(a.rating) ? a.rating : -Infinity;
    var y = has(b.rating) ? b.rating : -Infinity;
    if (x !== y) return y - x;
    var ra = has(a.reviews) ? a.reviews : -1;
    var rb = has(b.reviews) ? b.reviews : -1;
    if (ra !== rb) return rb - ra;
    return byDistance(a, b);
  }

  /* -------------------------------------------------------------- Rendern */

  function render() {
    syncChips();
    $('filters').hidden = S.view === 'info';
    $('search-wrap').hidden = S.view === 'info';
    $('meta-row').hidden = S.view === 'info';
    measureBar();

    if (S.view === 'info') {
      $('list').innerHTML = '';
      $('list').hidden = true;
      $('empty').hidden = true;
      $('info').hidden = false;
      $('info').innerHTML = infoHtml();
      return;
    }

    $('info').hidden = true;
    $('info').innerHTML = '';

    var items = selected();
    var total = S.view === 'gemerkt' ? S.saved.length : D.places.length;

    $('count').textContent = anyFilter()
      ? items.length + ' von ' + total + (total === 1 ? ' Ort' : ' Orten')
      : total + (total === 1 ? ' Ort' : ' Orte');

    if (!items.length) {
      $('list').hidden = true;
      $('list').innerHTML = '';
      $('empty').hidden = false;
      if (S.view === 'gemerkt' && !anyFilter()) {
        $('empty-h').textContent = 'Noch nichts gemerkt';
        $('empty-p').textContent = 'Auf einer Karte den Stern antippen — die Merkliste bleibt auch offline erhalten.';
        $('empty-reset').hidden = true;
      } else {
        $('empty-h').textContent = 'Nichts gefunden';
        $('empty-p').textContent = 'Kein Ort passt zu dieser Kombination aus Suche und Filtern.';
        $('empty-reset').hidden = false;
      }
      return;
    }

    $('empty').hidden = true;
    $('list').hidden = false;
    $('list').innerHTML = items.map(cardHtml).join('');
  }

  function factsHtml(p) {
    var f = [];
    if (has(p.rating)) {
      f.push('<span class="fact fact--rating">' + ICON.rating + nf1.format(p.rating)
        + (has(p.reviews) ? ' <span style="font-weight:400;opacity:.8">(' + nf0.format(p.reviews) + ')</span>' : '')
        + '</span>');
    }
    if (has(p.walk_min)) {
      f.push('<span class="fact">' + ICON.walk + p.walk_min + ' Min'
        + (has(p.distance_km) ? ' · ' + km(p.distance_km) : '') + '</span>');
    } else if (has(p.bike_min)) {
      f.push('<span class="fact">' + ICON.bike + p.bike_min + ' Min'
        + (has(p.distance_km) ? ' · ' + km(p.distance_km) : '') + '</span>');
    } else if (has(p.distance_km)) {
      f.push('<span class="fact">' + ICON.pin + km(p.distance_km) + '</span>');
    }
    if (has(p.hours)) f.push('<span class="fact">' + ICON.clock + esc(p.hours) + '</span>');
    if (p.dog === true) f.push('<span class="fact fact--dog">' + ICON.dog + 'Jum ok</span>');
    else if (p.dog === false) f.push('<span class="fact fact--nodog">' + ICON.dog + 'ohne Jum</span>');
    return f.length ? '<div class="facts">' + f.join('') + '</div>' : '';
  }

  function cardHtml(p) {
    var on = S.saved.indexOf(p.id) >= 0;
    /* Der Name ist eine echte Überschrift (nicht im Knopf verschachtelt, das
       wäre ungültig). Geöffnet wird über einen Knopf, der die Karte überdeckt. */
    return '<article class="card ' + accentClass(p.category) + '">'
      + '<h3 class="card__name">' + esc(p.name) + '</h3>'
      + '<p class="card__meta">'
      + '<span class="card__cat">' + esc(catLabel(p.category)) + '</span>'
      + (has(p.badge) ? '<span class="card__badge">' + esc(p.badge) + '</span>' : '')
      + '</p>'
      + (has(p.note) ? '<p class="card__note">' + esc(p.note) + '</p>' : '')
      + factsHtml(p)
      + (p.tags.length ? '<p class="card__tags">' + p.tags.slice(0, 4).map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>'; }).join('') + '</p>' : '')
      + '<button type="button" class="card__open" data-open="' + esc(p.id) + '"'
      + ' aria-label="' + esc(p.name) + ' — Details"></button>'
      + '<button type="button" class="star" data-save="' + esc(p.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
      + '<span class="sr-only">' + (on ? 'Aus der Merkliste entfernen' : 'Merken') + '</span>'
      + ICON.star + '</button>'
      + '</article>';
  }

  /* ----------------------------------------------------------- Info-Ansicht */

  function telHref(s) {
    var digits = String(s).replace(/[^\d+]/g, '');
    return digits.length >= 6 ? digits : null;
  }

  function infoHtml() {
    var h = '';

    if (D.merken.length) {
      h += '<section class="section"><h2 class="section__h">Gut zu wissen</h2>'
        + '<p class="section__lead">Regeln und Faustregeln für unterwegs.</p>'
        + D.merken.map(function (m) {
            return '<div class="panel"><h3 class="panel__t">' + esc(m.title) + '</h3>'
              + '<p class="panel__x">' + esc(m.text) + '</p></div>';
          }).join('')
        + '</section>';
    }

    if (D.open_questions.length) {
      h += '<section class="section"><h2 class="section__h">Offene Punkte</h2>'
        + '<p class="section__lead">' + D.open_questions.length
        + ' ungeklärte Fakten — bewusst sichtbar statt versteckt.</p>'
        + D.open_questions.map(function (q) {
            var tel = has(q.contact) ? telHref(q.contact) : null;
            return '<div class="panel panel--open"><h3 class="panel__t">' + esc(q.topic) + '</h3>'
              + '<p class="panel__x">' + esc(q.status) + '</p>'
              + (has(q.contact)
                  ? '<p class="panel__c">' + (tel
                      ? '<a href="tel:' + esc(tel) + '">' + esc(q.contact) + '</a>'
                      : esc(q.contact)) + '</p>'
                  : '')
              + '</div>';
          }).join('')
        + '</section>';
    }

    if (D.faktencheck.length) {
      h += '<section class="section"><h2 class="section__h">Faktencheck</h2>'
        + '<p class="section__lead">Korrigiert gegenüber der ersten Recherche.</p>'
        + '<ul class="checks">'
        + D.faktencheck.map(function (f) { return '<li><span>' + esc(f) + '</span></li>'; }).join('')
        + '</ul></section>';
    }

    if (has(D.meta.base)) {
      h += '<section class="section"><h2 class="section__h">Basis</h2>'
        + '<div class="panel"><p class="panel__x">' + esc(D.meta.base) + '</p>'
        + '<p class="panel__c"><a href="' + esc(mapsHref({ name: D.meta.base, address: '' }))
        + '" target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a></p></div></section>';
    }

    return h;
  }

  /* ----------------------------------------------------------------- Sheet */

  function mapsHref(p) {
    var q = [p.name, p.address].filter(has).join(', ');
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
  }

  var lastFocus = null;
  var lockedAt = 0;

  /* overflow:hidden allein hält iOS Safari nicht auf — der Hintergrund scrollt
     trotzdem mit. Deshalb body fixieren und die Scrollposition merken.
     Das paddingRight gleicht die wegfallende Scrollbar aus (kein Layout-Shift). */
  function lockBody() {
    lockedAt = window.pageYOffset || document.documentElement.scrollTop || 0;
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    if (sbw > 0) document.body.style.paddingRight = sbw + 'px';
    document.body.style.top = (-lockedAt) + 'px';
    document.body.classList.add('is-locked');
  }

  function unlockBody() {
    document.body.classList.remove('is-locked');
    document.body.style.top = '';
    document.body.style.paddingRight = '';
    window.scrollTo(0, lockedAt);
  }


  function openSheet(id) {
    var p = null;
    for (var i = 0; i < D.places.length; i++) if (D.places[i].id === id) { p = D.places[i]; break; }
    if (!p) return;

    S.openId = id;
    lastFocus = document.activeElement;

    var sheet = $('sheet');
    sheet.className = 'sheet ' + accentClass(p.category);
    $('sheet-body').innerHTML = sheetHtml(p);

    lockBody();

    $('scrim').hidden = false;
    sheet.hidden = false;
    sheet.style.transform = '';
    $('sheet-body').scrollTop = 0;

    requestAnimationFrame(function () {
      $('scrim').classList.add('is-on');
      sheet.classList.add('is-on');
    });

    $('sheet-close').focus({ preventScroll: true });
  }

  function closeSheet() {
    var sheet = $('sheet');
    if (sheet.hidden) return;

    sheet.classList.remove('is-on', 'is-drag');
    sheet.style.transform = '';
    $('scrim').classList.remove('is-on');

    window.setTimeout(function () {
      sheet.hidden = true;
      $('scrim').hidden = true;
      unlockBody();
    }, 260);

    var id = S.openId;
    S.openId = null;

    var back = id ? document.querySelector('[data-open="' + id.replace(/"/g, '\\"') + '"]') : null;
    if (back) back.focus({ preventScroll: true });
    else if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  function row(label, value, soft) {
    if (!has(value)) return '';
    return '<dt>' + esc(label) + '</dt><dd' + (soft ? ' class="soft"' : '') + '>' + value + '</dd>';
  }

  function sheetHtml(p) {
    var on = S.saved.indexOf(p.id) >= 0;
    var dog = p.dog === true ? 'erlaubt' : p.dog === false ? 'nicht erlaubt' : 'nicht geklärt';
    var tel = has(p.phone) ? telHref(p.phone) : null;

    var dist = [];
    if (has(p.walk_min)) dist.push(p.walk_min + ' Min zu Fuß');
    if (has(p.bike_min)) dist.push(p.bike_min + ' Min mit dem Rad');
    if (has(p.distance_km)) dist.push(km(p.distance_km));

    var h = '<p class="sheet__cat">' + esc(catLabel(p.category))
      + (has(p.badge) ? ' · ' + esc(p.badge) : '') + '</p>'
      + '<h2 class="sheet__name" id="sheet-name">' + esc(p.name) + '</h2>'
      + (has(p.note) ? '<p class="sheet__note">' + esc(p.note) + '</p>' : '')
      + '<dl class="dl">'
      + (has(p.rating)
          ? row('Bewertung', nf1.format(p.rating) + ' ★'
              + (has(p.reviews) ? ' · ' + nf0.format(p.reviews) + ' Bewertungen' : ''))
          : '')
      + (has(p.hours) ? row('Öffnung', esc(p.hours)) : '')
      + (dist.length ? row('Entfernung', esc(dist.join(' · '))) : '')
      + (has(p.address) ? row('Adresse', esc(p.address)) : '')
      + (tel ? row('Telefon', '<a href="tel:' + esc(tel) + '">' + esc(p.phone) + '</a>') : '')
      + row('Hund', esc(dog), p.dog == null)
      + (p.tags.length ? row('Tags', esc(p.tags.join(' · '))) : '')
      + '</dl>';

    if (has(p.connection)) {
      h += '<p class="sheet__conn"><b>Anfahrt</b>' + esc(p.connection) + '</p>';
    }

    h += '<div class="sheet__acts">';
    if (tel) {
      h += '<a class="btn btn--wide" href="tel:' + esc(tel) + '">' + ICON.phone + 'Anrufen</a>';
    }
    h += '<a class="btn btn--wide btn--primary" href="' + esc(mapsHref(p))
      + '" target="_blank" rel="noopener noreferrer">' + ICON.pin + 'In Google Maps öffnen</a>'
      + '<button type="button" class="btn btn--wide" data-save="' + esc(p.id) + '" aria-pressed="'
      + (on ? 'true' : 'false') + '">' + ICON.star
      + (on ? 'Gemerkt — entfernen' : 'Merken') + '</button>'
      + '</div>';

    return h;
  }

  /* ------------------------------------------------------------- Merkliste */

  function toggleSave(id) {
    toggleIn(S.saved, id);
    lsSet(LS_SAVED, S.saved);
    syncTabs();

    /* Sichtbare Schalter aktualisieren, ohne die Liste neu zu bauen */
    var on = S.saved.indexOf(id) >= 0;
    var btns = document.querySelectorAll('[data-save="' + id.replace(/"/g, '\\"') + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      var sr = btns[i].querySelector('.sr-only');
      if (sr) sr.textContent = on ? 'Aus der Merkliste entfernen' : 'Merken';
      if (btns[i].classList.contains('btn')) {
        btns[i].innerHTML = ICON.star + (on ? 'Gemerkt — entfernen' : 'Merken');
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    /* In der Merkliste verschwindet die Karte sofort */
    if (S.view === 'gemerkt' && !on) { closeSheet(); render(); }
  }

  /* ---------------------------------------------------------- Swipe / Drag */

  var drag = null;
  var DRAG_SLOP = 12;      // px, bevor aus einem Tap ein Wischen wird

  var CONTROLS = 'button, a, input, select, textarea, label, [role="button"]';

  function dragStart(y, fromGrip, target) {
    /* Beginnt die Berührung auf einem Bedienelement, wird nicht gewischt.
       Sonst würde das preventDefault() in dragMove() den Klick unterdrücken —
       iOS Safari liefert danach gar keinen Klick mehr, und das ✕ wirkte tot. */
    if (!fromGrip && target && target.closest && target.closest(CONTROLS)) return;
    if (!fromGrip && $('sheet-body').scrollTop > 0) return;
    drag = { y0: y, dy: 0, live: false, grip: fromGrip };
  }

  function dragMove(y, ev) {
    if (!drag) return;
    var dy = y - drag.y0;
    if (dy <= 0) { if (drag.live) { drag.dy = 0; $('sheet').style.transform = ''; } return; }
    if (!drag.live) {
      if (dy < DRAG_SLOP) return;
      if (!drag.grip && $('sheet-body').scrollTop > 0) { drag = null; return; }
      drag.live = true;
      $('sheet').classList.add('is-drag');
    }
    drag.dy = dy;
    if (ev && ev.cancelable) ev.preventDefault();
    $('sheet').style.transform = wide()
      ? 'translate(-50%, ' + dy + 'px)'
      : 'translateY(' + dy + 'px)';
  }

  function dragEnd() {
    if (!drag) return;
    var dy = drag.dy, live = drag.live;
    drag = null;
    $('sheet').classList.remove('is-drag');
    if (!live) return;
    if (dy > 80) closeSheet();
    else $('sheet').style.transform = '';
  }

  function wide() {
    return window.matchMedia && window.matchMedia('(min-width: 33rem)').matches;
  }

  /* --------------------------------------------------------- Offline / SW */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    try {
      navigator.serviceWorker.register('./sw.js').catch(function () { /* nicht kritisch */ });
    } catch (e) { /* nicht kritisch */ }
  }

  function updateOfflineNote() {
    var el = $('foot-offline');
    if (!el) return;
    var stand = has(D.meta.stand) ? D.meta.stand : null;
    var standTxt = '';
    if (stand) {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(stand);
      standTxt = 'Stand ' + (m ? m[3] + '.' + m[2] + '.' + m[1] : stand) + '. ';
    }
    var off = !navigator.onLine;
    var cached = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
    el.textContent = standTxt + (off
      ? 'Offline — angezeigt werden die gespeicherten Daten.'
      : cached ? 'Offline verfügbar.' : '');
  }

  /* ---------------------------------------------------------------- Events */

  function bind() {
    $('theme-btn').addEventListener('click', cycleTheme);

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if (S.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    $('q').addEventListener('input', function () {
      S.q = $('q').value.trim();
      render();
    });
    $('q').addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('q').value) { e.stopPropagation(); $('q').value = ''; S.q = ''; render(); }
    });
    /* Tastatur offen -> Tableiste weg (siehe style.css). */
    $('q').addEventListener('focus', function () { document.body.classList.add('is-typing'); });
    $('q').addEventListener('blur', function () { document.body.classList.remove('is-typing'); });

    $('q-clear').addEventListener('click', function () {
      $('q').value = ''; S.q = ''; render(); $('q').focus();
    });

    $('cat-row').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]');
      if (!b) return;
      toggleIn(S.cats, b.getAttribute('data-cat'));
      render();
    });

    $('flag-row').addEventListener('click', function (e) {
      var b = e.target.closest('.chip');
      if (!b) return;
      if (b.id === 'chip-dog') S.dog = !S.dog;
      if (b.id === 'chip-walk') S.walk = !S.walk;
      render();
    });

    $('tag-row').addEventListener('click', function (e) {
      var more = e.target.closest('#tags-more');
      if (more) { S.tagsOpen = !S.tagsOpen; buildTagChips(); syncChips(); return; }
      var b = e.target.closest('[data-tag]');
      if (!b) return;
      toggleIn(S.tags, b.getAttribute('data-tag'));
      render();
    });

    $('sort').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sort]');
      if (!b) return;
      S.sort = b.getAttribute('data-sort');
      render();
    });

    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (b) setView(b.getAttribute('data-tab'));
    });

    $('tabs').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      var btns = Array.prototype.slice.call($('tabs').querySelectorAll('.tab'));
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var next = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
      next.focus();
      setView(next.getAttribute('data-tab'));
    });

    $('list').addEventListener('click', function (e) {
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); return; }
      var card = e.target.closest('.card');
      if (!card) return;
      var open = card.querySelector('[data-open]');
      if (open) openSheet(open.getAttribute('data-open'));
    });

    $('sheet-body').addEventListener('click', function (e) {
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); }
    });

    $('empty-reset').addEventListener('click', resetFilters);

    $('scrim').addEventListener('click', closeSheet);
    $('sheet-close').addEventListener('click', closeSheet);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) closeSheet();
    });

    var sheet = $('sheet');
    sheet.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      dragStart(e.touches[0].clientY, $('grip').contains(e.target), e.target);
    }, { passive: true });
    sheet.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 1) return;
      dragMove(e.touches[0].clientY, e);
    }, { passive: false });
    sheet.addEventListener('touchend', dragEnd, { passive: true });
    sheet.addEventListener('touchcancel', dragEnd, { passive: true });

    $('grip').addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch') return;
      dragStart(e.clientY, true, e.target);
      try { $('grip').setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    });
    $('grip').addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      dragMove(e.clientY, e);
    });
    $('grip').addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') return;
      dragEnd();
    });

    window.addEventListener('resize', function () {
      if (!drag && $('sheet').style.transform) $('sheet').style.transform = '';
    });

    window.addEventListener('online', updateOfflineNote);
    window.addEventListener('offline', updateOfflineNote);

    if (window.ResizeObserver) {
      try { new ResizeObserver(measureBar).observe(document.querySelector('.bar')); }
      catch (e) { window.addEventListener('resize', measureBar); }
    } else {
      window.addEventListener('resize', measureBar);
    }
  }

  /* ------------------------------------------------------------------ Boot */

  $('boot-retry').addEventListener('click', function () {
    $('boot-spin').hidden = false;
    $('boot-retry').hidden = true;
    $('boot-title').textContent = 'Peschiera kompakt';
    $('boot-text').textContent = 'Daten werden geladen…';
    loadData(start, bootError);
  });

  loadData(start, bootError);
})();
