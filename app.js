/* ==========================================================================
   Peschiera kompakt — app.js

   Vanilla, kein Modul (damit file:// eine Chance hat), kein Build.
   Alle Inhalte kommen aus data/places.json — hier stehen keine Ortsdaten.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = 'v22 · 2026-09-19';   /* muss zu CACHE in sw.js passen */
  var DATA_URL = './data/places.json';
  var LS_SAVED = 'pk.saved';
  var LS_SEEN  = 'pk.seen';
  var LS_NOTES = 'pk.notes';
  var LS_THEME = 'pk.theme';
  var LS_JUM   = 'pk.jum';
  var SS_WET   = 'pk.wet';    // Wetter gilt fuer diesen Besuch, nicht fuer immer
  var WALK_MAX = 25;          // Schwelle für den Filter "Zu Fuß"
  var SHORT_MAX = 60;         // Schwelle für den Filter "Unter 1 h"

  /* ---------------------------------------------------------------- Zustand */

  var D = null;               // geladene Daten
  var catById = {};

  var S = {
    view: 'heute',
    q: '',
    cats: [],
    jum: false,          // Dauereinstellung, kein Filter: ueberlebt den Neustart
    walk: false,
    tags: [],
    unseen: false,
    short: false,
    sort: 'distance',
    filterOpen: false,
    wet: false,             // vom Benutzer gesagt, nicht abgerufen
    pick: 0,                // welcher Vorschlag gerade dran ist
    mid: null,              // gewaehlter Tagesabschnitt; null = aus der Uhr
    moreOpen: false,        // "Sonst noch" ausgeklappt
    seenOk: false,          // Gesehene in "Heute" ausnahmsweise doch zeigen
    /* Was man vor Ort erfaehrt, passt in keines der zwei Bits (gemerkt,
       gesehen): "Tisch Donnerstag 20 Uhr bestellt", "Jum durfte doch mit
       rein", "Parkplatz war voll, mit dem Rad besser". Bei 58 Orten mit
       ungeklaerter Hundregel sagt die App zu Recht "vorher fragen" -- wer
       gefragt hat, konnte die Antwort bis v21 nirgends hinschreiben und las
       am naechsten Tag wieder "nicht geklaert".
       Notizen sind persoenlich und gehoeren NICHT in places.json. Wird aus
       einer Notiz eine Tatsache, fuehrt der Weg ueber die offenen Punkte. */
    notes: {},              // { id: text }, nur im Geraet
    map: false,             // Liste oder Karte in der Ortsansicht
    /* Der Geraetestandort. Bewusst nirgends gespeichert: eine Position ist
       nach dem naechsten Spaziergang falsch, und eine falsche Entfernung ist
       schlechter als gar keine. Wer ihn wieder will, tippt wieder. */
    here: null,             // {lat, lon, at} oder null
    hereState: 'off',       // off | wait | on | denied | failed
    saved: [],
    seen: [],
    theme: 'auto',
    openId: null
  };

  /* --------------------------------------------------------------- Speicher */

  /* Der Speicher wird über seinen Namen angesprochen, nicht über eine
     Referenz: schon window.localStorage selbst wirft in manchen
     Privatsphäre-Einstellungen, und dann muss der try das mitfangen. */
  function stGet(store, key, fallback) {
    try {
      var raw = window[store].getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function stSet(store, key, value) {
    try { window[store].setItem(key, JSON.stringify(value)); }
    catch (e) { /* Private Mode o.ä. — gilt dann nur für diese Sitzung */ }
  }

  function lsGet(key, fallback) { return stGet('localStorage', key, fallback); }
  function lsSet(key, value) { stSet('localStorage', key, value); }
  function ssGet(key, fallback) { return stGet('sessionStorage', key, fallback); }
  function ssSet(key, value) { stSet('sessionStorage', key, value); }

  /* ---------------------------------------------------------------- Helfer */

  function $(id) { return document.getElementById(id); }

  /* Manche Engines liefern nach einer Beruehrung keinen Klick mehr, wenn eine
     Geste dazwischenkommt. Dieser Helfer hoert deshalb auf beides und entprellt
     selbst: touchend zuerst, ein danach folgender Klick wird verworfen. Der
     Finger muss innerhalb des Elements loslassen. */
  function onTap(node, fn) {
    var last = 0;
    var fire = function (e) {
      if (Date.now() - last < 700) return;
      last = Date.now();
      fn(e);
    };
    node.addEventListener('click', fire);
    node.addEventListener('touchend', function (e) {
      if (!e.changedTouches || e.changedTouches.length !== 1) return;
      var t = e.changedTouches[0];
      var r = node.getBoundingClientRect();
      if (t.clientX < r.left || t.clientX > r.right ||
          t.clientY < r.top  || t.clientY > r.bottom) return;
      fire(e);
    }, { passive: true });
  }

  /* norm() bildet nicht 1:1 ab -- "Straße" wird "strasse", ein Zeichen mehr.
     Wer im normalisierten Text eine Fundstelle sucht und ihren Index auf das
     Original anwendet, markiert ab dort daneben. Deshalb zeichenweise
     normalisieren und zu jedem Zeichen merken, woher es kam. */
  function normStellen(s) {
    var src = String(s == null ? '' : s), out = '', map = [];
    for (var i = 0; i < src.length; i++) {
      var t = norm(src[i]);
      for (var k = 0; k < t.length; k++) { out += t[k]; map.push(i); }
    }
    return { text: out, map: map };
  }

  /* Escapen kommt VOR dem Einsetzen von <mark>: andersherum baut man eine
     Luecke, durch die eine Notiz eigenes HTML in die Seite bekaeme.
     Hervorgehoben wird jeder Suchbegriff -- sie sind UND-verknuepft, also
     steht jeder irgendwo, und nur einen zu zeigen erklaert den Treffer halb. */
  function markiere(text) {
    var roh = String(text == null ? '' : text);
    var terms = norm(S.q).split(/\s+/).filter(Boolean);
    if (!terms.length || !roh) return esc(roh);

    var n = normStellen(roh), treffer = [];
    terms.forEach(function (t) {
      var von = 0, i;
      while ((i = n.text.indexOf(t, von)) >= 0) {
        treffer.push([n.map[i], n.map[i + t.length - 1] + 1]);
        von = i + t.length;
      }
    });
    if (!treffer.length) return esc(roh);

    treffer.sort(function (a, b) { return a[0] - b[0]; });
    var eng = [treffer[0]];
    for (var j = 1; j < treffer.length; j++) {
      var letzte = eng[eng.length - 1];
      if (treffer[j][0] <= letzte[1]) letzte[1] = Math.max(letzte[1], treffer[j][1]);
      else eng.push(treffer[j]);
    }

    var h = '', pos = 0;
    eng.forEach(function (r) {
      h += esc(roh.slice(pos, r[0])) + '<mark>' + esc(roh.slice(r[0], r[1])) + '</mark>';
      pos = r[1];
    });
    return h + esc(roh.slice(pos));
  }

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

  /* 45 -> "45 Min", 90 -> "1,5 h", 120 -> "2 h" */
  function dur(min) {
    if (!has(min) || typeof min !== 'number') return '';
    if (min < 60) return min + ' Min';
    var h = min / 60;
    return (h % 1 === 0 ? String(h) : nf1.format(h)) + ' h';
  }

  function norm(s) {
    return String(s == null ? '' : s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss');
  }

  /* Der Badge-Kanon. Bis v11 sahen 43 Freitexte identisch aus und mischten
     sechs Bedeutungsklassen: ein Termin, der heute laeuft, trug dieselbe
     Auszeichnung wie eine Geschmacksnotiz. Nach dem Aufraeumen der Daten
     sind es 27 Texte auf 31 Orten, verteilt auf fuenf Klassen.

     Die Klasse steckt nicht im Text, sondern hier — Datumsmuster und zwei
     Namenslisten reichen, der Rest ist Kuratierung. */
  var BADGE_UNVERIFIED = ['Zeiten prüfen', 'Erst anrufen'];
  var BADGE_LIMIT      = ['Ohne Auto nicht machbar', 'Buchen', 'Ohne Termin'];
  var BADGE_DOG        = ['Burg ohne Hund', 'Hund an der Leine ok', 'Hund gratis'];
  /* Tag.Monat — deckt "18.–20.09.", "26./27.09." und "Di 22.09." gleichermassen,
     ohne auf die Trennzeichen dazwischen angewiesen zu sein. */
  var BADGE_DATE       = /\d{1,2}\.\d{2}\./;

  var BADGE_MARK = {
    termin: 'dot', unverified: 'warn', moment: 'clock',
    limit: 'limit', curated: 'diamond'
  };

  /* Gibt die Klasse zurueck, oder null wenn der Ort keinen Badge hat.
     "dog" erscheint nicht in der Zeile — die Hundregel hat dort schon ihren
     Platz, und der Zusatz ("nur die Burg", "an der Leine") steht im Sheet,
     wo er hingehoert. */
  function badgeKind(p) {
    if (!has(p.badge)) return null;
    var b = String(p.badge);
    if (BADGE_DOG.indexOf(b) >= 0) return 'dog';
    if (BADGE_DATE.test(b)) return 'termin';
    if (BADGE_UNVERIFIED.indexOf(b) >= 0) return 'unverified';
    if (BADGE_LIMIT.indexOf(b) >= 0) return 'limit';
    if (BADGE_MOMENT[b]) return 'moment';
    return 'curated';
  }

  /* Der Text bleibt stehen. Das Problem war nie seine Laenge — 43 Texte, die
     alle gleich aussahen, waren das Problem. Nach dem Aufraeumen tragen nur
     noch 31 Orte einen Badge, und "Rohfisch" oder "Fine Dining" sagen mehr
     als jedes Zeichen allein. Das Zeichen sagt jetzt die Klasse dazu. */
  function badgeHtml(p) {
    var k = badgeKind(p);
    if (!k || k === 'dog') return '';
    return '<span class="card__badge card__badge--' + k + '">'
      + ICON[BADGE_MARK[k]] + esc(p.badge) + '</span>';
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
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.8 12.6l4.6 4.6 9.8-10"/></svg>',
    checkRound: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.4V3.8M8.4 7.4L12 3.8l3.6 3.6"/><path d="M6 11.4H4.6v8.8h14.8v-8.8H18"/></svg>',
    rating: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.6l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.9l6-.8z"/></svg>',
    walk: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="13" cy="4.2" r="1.8"/><path d="M11 21l1.4-5.4-2.6-2.2.9-4.6 3.1-1.1 2.1 3.4 2.6 1"/><path d="M12.4 15.6L9 21"/><path d="M7.6 11.4L5 12.6"/></svg>',
    bike: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.6" cy="17" r="3.2"/><circle cx="18.4" cy="17" r="3.2"/><path d="M8.8 17h5l2.6-7.4h2.2M8 9.6h5.6l2.4 7.4"/><circle cx="14.6" cy="4.6" r="1.4"/></svg>',
    hourglass: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.4h10M7 20.6h10"/><path d="M8 3.4v3.2c0 2 4 3.6 4 5.4s-4 3.4-4 5.4v3.2"/><path d="M16 3.4v3.2c0 2-4 3.6-4 5.4s4 3.4 4 5.4v3.2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/></svg>',
    dog: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.6 8.2V4.6l3 1.8h4.6l3-1.8v3.6"/><path d="M4.6 8.2c0 4 2.2 5.4 2.2 8.2 0 1.6 1.2 2.6 3 2.6h5c1.8 0 3-1 3-2.6 0-2.8 2.2-4.2 2.2-8.2"/><path d="M9.4 12.4h.01M14.6 12.4h.01"/></svg>',
    pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s6.4-6 6.4-10.4A6.4 6.4 0 0 0 5.6 10.6C5.6 15 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 3.6h3l1.6 4-2 1.4a11 11 0 0 0 5.2 5.2l1.4-2 4 1.6v3a1.8 1.8 0 0 1-2 1.8C10.6 19.8 4.2 13.4 4.4 5.6a1.8 1.8 0 0 1 1.8-2z"/></svg>',
    list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.4h16M4 12h16M4 17.6h16"/></svg>',
    info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6"/><path d="M12 10.8V17M12 7.6h.01"/></svg>',
    sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6"/></svg>',
    moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.4A8.4 8.4 0 1 1 9.6 4a6.8 6.8 0 0 0 10.4 10.4z"/></svg>',
    auto: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4"/><path d="M12 3.6v16.8" /><path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 8.4h11.2l-2.6-2.7M20.4 15.6H9.2l2.6 2.7"/></svg>',
    tags: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.6 11.2V4.8a1.2 1.2 0 0 1 1.2-1.2h6.4l8.4 8.4a1.4 1.4 0 0 1 0 2l-5.6 5.6a1.4 1.4 0 0 1-2 0z"/><path d="M7.6 7.6h.01"/></svg>',
    /* Schieberegler fuer den Filterknopf, Pfeilpaar fuer die Sortierung. */
    filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
    note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/></svg>',
    map: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5 3.5 6.8v12.7L9 17.2l6 2.3 5.5-2.3V4.5L15 6.8z"/><path d="M9 4.5v12.7M15 6.8v12.7"/></svg>',
    sort: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>',
    /* Die vier Marken des Badge-Kanons. Termin und Kuratiert sind gefuellt,
       weil sie etwas behaupten; Ungeprueft und Einschraenkung sind offen. */
    dot:     '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="currentColor" stroke="none"/></svg>',
    diamond: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 8-8 8-8-8z" fill="currentColor" stroke="none"/></svg>',
    warn:    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5l8.5 15h-17z"/><path d="M12 10v4M12 17h.01"/></svg>',
    limit:   '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M6.4 6.4l11.2 11.2"/></svg>'
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
    S.seen  = (lsGet(LS_SEEN,  []) || []).filter(function (id) { return ids[id]; });
    var rohNotes = lsGet(LS_NOTES, {}) || {};
    S.notes = {};
    Object.keys(rohNotes).forEach(function (id) {
      if (ids[id] && String(rohNotes[id] || '').trim()) S.notes[id] = String(rohNotes[id]);
    });

    S.theme = lsGet(LS_THEME, 'auto');
    if (['auto', 'light', 'dark'].indexOf(S.theme) < 0) S.theme = 'auto';
    applyTheme();

    S.jum = lsGet(LS_JUM, false) === true;

    /* Das Wetter haelt einen Besuch lang: an einem Regentag sonst jedes
       Oeffnen der App neu anzutippen. Dauerhaft waere falsch — morgen ist
       anderes Wetter, und sessionStorage vergisst von selbst. */
    S.wet = ssGet(SS_WET, false) === true;

    /* Der Reisezeitraum stand bisher als zweite Zeile im Kopf. Dort steht
       jetzt der Jum-Schalter; die Angabe wandert in den Fuss, wo schon der
       Datenstand steht. */
    $('foot-sub').textContent = has(D.meta.subtitle) ? D.meta.subtitle : '';
    $('foot-note').textContent = has(D.meta.note) ? D.meta.note : '';

    buildTabs();
    applyJum();
    bind();

    /* Homescreen-Kurzbefehle springen ueber ?v= direkt in eine Ansicht.
       Geprueft gegen TABS, damit ein getippter Unsinn nicht eine leere
       Ansicht erzeugt. Ein Teilen-Link ueberstimmt das weiter unten:
       showInbox() setzt auf "Orte", und eine geschickte Liste ist
       dringender als ein Kurzbefehl. */
    var wunsch = (/[?&]v=([a-z]+)/.exec(location.search || '') || [])[1];
    if (wunsch && TABS.some(function (t) { return t.id === wunsch; })) {
      /* S.view direkt zu setzen reicht NICHT: die Reiterleiste bekommt ihr
         aria-current aus syncTabs(), und ohne den Aufruf stand die App in der
         gewuenschten Ansicht, waehrend die Leiste weiter "Heute" anzeigte.
         Aufgefallen ist das erst, als eine falsch-gruene Pruefung in
         kleinigkeiten.mjs repariert wurde -- sie prueft jetzt den Wert und
         nicht nur, dass ueberhaupt etwas zurueckkommt. */
      S.view = wunsch;
      syncTabs();
    }

    render();

    $('boot').hidden = true;
    $('app').hidden = false;

    registerSW();
    updateOfflineNote();
    checkCacheVersion();
    showInbox();
  }

  /* ----------------------------------------------------------------- Theme */

  function applyTheme() {
    var root = document.documentElement;
    if (S.theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', S.theme);

    /* Das Symbol zeigt den Zustand — was ein Tipp bewirkt, sagte es nicht.
       Bei drei Stufen ist das zu wenig, also steht das Ziel dabei. */
    var label = { auto: 'Farbschema: automatisch', light: 'Farbschema: hell', dark: 'Farbschema: dunkel' }[S.theme];
    var next = { auto: 'hell', light: 'dunkel', dark: 'automatisch' }[S.theme];
    var icon = { auto: ICON.auto, light: ICON.sun, dark: ICON.moon }[S.theme];
    var btn = $('theme-btn');
    if (btn) {
      var full = label + ' — umschalten auf ' + next;
      btn.innerHTML = '<span class="sr-only">' + esc(full) + '</span>' + icon;
      btn.setAttribute('title', full);
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

  /* ------------------------------------------------------------- Jum-Schalter */

  /* Der Hund ist vierzehn Tage lang bei jeder Entscheidung dabei. Das ist
     keine Filterfrage, die man dreimal am Tag neu beantwortet, sondern eine
     Einstellung — wie das Farbschema, und genauso dauerhaft. */
  function applyJum() {
    var btn = $('jum-btn');
    btn.setAttribute('aria-checked', S.jum ? 'true' : 'false');
    /* Der Hinweis stand bis v9 neben dem Schalter. Titel, Schalter und
       Farbschema teilen sich jetzt eine Zeile, dafuer nennt ihn die
       Zaehlzeile — dort, wo ohnehin steht, was ein Filter kostet. */
  }

  function dogCount() {
    return D.places.filter(function (p) { return p.dog === true; }).length;
  }

  function toggleJum() {
    S.jum = !S.jum;
    S.pick = 0;
    lsSet(LS_JUM, S.jum);
    applyJum();
    render();
  }

  /* ------------------------------------------------------------------ Tabs */

  var TABS = [
    { id: 'heute', label: 'Heute', icon: ICON.sun },
    { id: 'orte', label: 'Orte', icon: ICON.list },
    /* Die Kennung bleibt "gemerkt": daran haengen der Teilen-Link und der
       Speicher. Sichtbar ist es ein Plan. */
    { id: 'gemerkt', label: 'Plan', icon: ICON.star },
    { id: 'info', label: 'Info', icon: ICON.info }
  ];

  /* Kein role="tab": dazu gehoerten tabpanel und aria-controls, und Panels
     gibt es hier nicht — die Leiste wechselt die ganze Ansicht. Ein
     Screenreader bekaeme sonst eine Struktur angekuendigt, die es nicht gibt.
     Es ist eine Navigation, also sagt aria-current, wo man steht. */
  function buildTabs() {
    $('tabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" class="tab" data-tab="' + t.id + '"'
        + (S.view === t.id ? ' aria-current="page"' : '') + '>'
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
      if (btns[i].getAttribute('data-tab') === S.view) btns[i].setAttribute('aria-current', 'page');
      else btns[i].removeAttribute('aria-current');
    }
    var n = $('tab-n');
    if (n) {
      n.textContent = String(S.saved.length);
      n.hidden = S.saved.length === 0;
      /* Die Zahl allein ist ohne den Reiter darunter nicht zu deuten. */
      n.setAttribute('aria-label', S.saved.length + ' im Plan');
    }
  }

  function setView(v) {
    if (v === S.view) return;
    if (v === 'heute') {
      /* Zurueck auf "Heute" heisst zurueck auf jetzt: eine Abschnittswahl
         von vorhin waere sonst eine stille Voreinstellung. */
      S.pick = 0; S.mid = null; S.moreOpen = false; S.seenOk = false;
      /* "Heute" sucht nicht. Das Feld bleibt dort sichtbar, damit man den
         Bestand ueberhaupt bemerkt — dann darf darin aber kein Text stehen,
         der gar nicht wirkt. */
      S.q = '';
      $('q').value = '';
    }
    S.view = v;
    syncTabs();
    render();
    window.scrollTo(0, 0);
  }

  /* ----------------------------------------------------------------- Chips */

  /* Die Filter selbst stehen im Sheet. Im Kopf bleibt ein Knopf dafuer, die
     Filter die gerade an sind, und die Sortierung. Bis v9 waren es zwei
     seitlich scrollende Chipreihen mit neun Chips, von denen einer wiederum
     ein Sheet oeffnete — drei Bedienmuster fuer eine Aufgabe. */
  var FLAGS = [
    { key: 'walk',   label: 'Zu Fuß',             icon: 'walk' },
    { key: 'short',  label: 'Unter 1 h',          icon: 'hourglass' },
    { key: 'unseen', label: 'Noch nicht gesehen', icon: 'checkRound' }
  ];

  /* Die Menge, aus der die aktuelle Ansicht schoepft: im Plan die Merkliste,
     sonst alle Orte. Eine Quelle fuer selected() und fuer die Zaehler an den
     Chips -- die rechneten bis v18 gegen D.places, also gegen alle 101.

     Vorschlag 8.1 beschreibt daraus einen sichtbaren Fehler: bei acht
     gemerkten Orten stehe am Chip "Noch nicht gesehen" trotzdem 94. Das
     stimmt seit v14 nicht mehr. Nachgeprueft: render() setzt
     $('filters').hidden = bare || isPlan, der Filterknopf ist im Plan also
     gar nicht da, und die Zaehler werden dort nie gezeichnet. Der Fehler ist
     nicht mehr erreichbar.

     Die Zusammenfuehrung bleibt trotzdem: sie nimmt die doppelte
     Pool-Logik aus selected() heraus, und wenn die Filter je in den Plan
     zurueckkehren, stimmen die Zahlen von selbst. Insurance, keine Korrektur
     -- deshalb steht sie hier und nicht im Verzeichnis der behobenen Fehler.

     Bewusst NICHT gegen die schon gesetzten Filter gerechnet: dann spraengen
     die Zahlen bei jedem Tipp im Sheet durcheinander. Was ein Filter kostet,
     sagt die Zeile darueber (#filter-count) und der Abschlussknopf. */
  function grundmenge() {
    return S.view === 'gemerkt'
      ? D.places.filter(function (p) { return S.saved.indexOf(p.id) >= 0; })
      : D.places;
  }

  function catCount(id) {
    return grundmenge().filter(function (p) { return p.category === id; }).length;
  }

  function flagCount(key) {
    var pool = grundmenge();
    if (key === 'walk')   return pool.filter(function (p) { return has(p.walk_min) && p.walk_min <= WALK_MAX; }).length;
    if (key === 'short')  return pool.filter(function (p) { return has(p.time_min) && p.time_min <= SHORT_MAX; }).length;
    return pool.filter(function (p) { return S.seen.indexOf(p.id) < 0; }).length;
  }

  function flagOn(key) { return key === 'walk' ? S.walk : key === 'short' ? S.short : S.unseen; }

  function activeCount() {
    return S.cats.length + S.tags.length + (S.walk ? 1 : 0) + (S.short ? 1 : 0) + (S.unseen ? 1 : 0);
  }

  /* Der Kopf zeigt nur, was an ist — jeder Chip traegt sein eigenes Kreuz. */
  function activeChipsHtml() {
    var out = [];
    /* Der Standort zaehlt nicht als Filter — er blendet nichts aus. Sichtbar
       muss er trotzdem sein, sonst wundert man sich ueber die Reihenfolge. */
    if (S.here) out.push(offChip('here', 'von hier', 'wieder ab dem Zeltplatz messen'));
    S.cats.forEach(function (c) {
      out.push(offChip('cat:' + c, catLabel(c)));
    });
    FLAGS.forEach(function (f) { if (flagOn(f.key)) out.push(offChip(f.key, f.label)); });
    S.tags.forEach(function (t) { out.push(offChip('tag:' + t, t)); });
    return out.join('');
  }

  /* Der Zusatz ist vorgegeben "Filter entfernen" — der Standort ist aber
     keiner, und vorgelesen waere das schlicht falsch. */
  function offChip(token, label, sr) {
    return '<button type="button" class="chip chip--off" data-off="' + esc(token) + '">'
      + esc(label) + '<span class="chip__x" aria-hidden="true">&times;</span>'
      + '<span class="sr-only">— ' + esc(sr || 'Filter entfernen') + '</span></button>';
  }

  function syncFilterBar() {
    var n = activeCount();
    $('chip-filter').innerHTML = ICON.filter + 'Filter'
      + (n ? '<span class="chip__n">' + n + '</span>' : '');
    $('chip-filter').setAttribute('aria-pressed', n ? 'true' : 'false');
    $('chip-filter').setAttribute('aria-label', n
      ? 'Filter — ' + n + (n === 1 ? ' aktiv' : ' aktive') : 'Filter');
    $('active-filters').innerHTML = activeChipsHtml();

    var byRating = S.sort === 'rating';
    /* Mit Standort heisst "Entfernung" etwas anderes als sonst — dann sagt
       der Knopf das auch. */
    var distLbl = S.here ? 'Von hier' : 'Entfernung';
    $('sort-btn').innerHTML = ICON.sort + (byRating ? 'Bewertung' : distLbl);
    $('sort-btn').setAttribute('aria-label', 'Sortiert nach '
      + (byRating ? 'Bewertung' : (S.here ? 'Entfernung von hier' : 'Entfernung ab dem Zeltplatz'))
      + ' — umschalten auf ' + (byRating ? distLbl : 'Bewertung'));
  }

  function offFilter(token) {
    if (token.indexOf('cat:') === 0) toggleIn(S.cats, token.slice(4));
    else if (token.indexOf('tag:') === 0) toggleIn(S.tags, token.slice(4));
    else if (token === 'walk') S.walk = false;
    else if (token === 'short') S.short = false;
    else if (token === 'unseen') S.unseen = false;
    else if (token === 'here') { S.here = null; S.hereState = 'off'; }
  }

  function allTags() {
    var count = {};
    grundmenge().forEach(function (p) {
      p.tags.forEach(function (t) { count[t] = (count[t] || 0) + 1; });
    });
    return Object.keys(count).sort(function (a, b) {
      return count[b] - count[a] || a.localeCompare(b, 'de');
    }).map(function (t) { return { tag: t, n: count[t] }; });
  }

  /* Alle Filter an einer Stelle: Kategorie, Weg und Zeit, Zustand, Tags.
     Bis v9 lagen die ersten drei als Chips im Kopf und nur die Tags hier. */
  function filterSheetHtml() {
    var noWalk = D.places.filter(function (p) { return !has(p.walk_min); }).length;

    var h = '<p class="sheet__cat">Filter</p>'
      + '<h2 class="sheet__name" id="sheet-name">Eingrenzen</h2>'
      /* role+aria-live wie bei #count in der Liste: die Zahl aendert sich bei
         jedem Tipp im Sheet, und ohne das hoert sie niemand. Der Container
         wird genau einmal gebaut und danach nur ueber textContent beschrieben
         -- wuerde er je Aktualisierung neu entstehen, bliebe aria-live wirkungslos. */
      + '<p class="sheet__count" id="filter-count" role="status" aria-live="polite"></p>';

    h += '<p class="fgroup__h">Kategorie</p><div class="tagpick">'
      + D.categories.map(function (c) {
          return '<button type="button" class="chip ' + accentClass(c.id) + '" data-cat="' + esc(c.id) + '"'
            + ' aria-pressed="' + (S.cats.indexOf(c.id) >= 0 ? 'true' : 'false') + '">'
            + esc(c.label) + '<span class="chip__n">' + catCount(c.id) + '</span></button>';
        }).join('') + '</div>';

    /* "Hund erlaubt" fehlt hier mit Absicht: der Hund ist keine Filterfrage,
       die man taeglich neu beantwortet, sondern ein Dauerschalter im Kopf. */
    h += '<p class="fgroup__h">Weg und Zeit</p><div class="tagpick">'
      + FLAGS.filter(function (f) { return f.key !== 'unseen'; }).map(flagChipHtml).join('')
      + '</div>'
      /* Der Chip "Zu Fuss" verlangt walk_min <= 25. Orte ohne den Wert fallen
         heraus, ohne dass es jemand sieht — bei jedem zweiten Ort. Also steht
         es hier, wie die Zaehlzeile es beim Jum-Schalter auch tut. */
      + '<p class="fgroup__x">' + noWalk + ' von ' + D.places.length
      + ' Orten haben keine Gehzeit hinterlegt und fallen aus „Zu Fuß“ heraus.</p>';

    /* Der Standort filtert nichts, er verschiebt den Bezugspunkt. Er steht
       trotzdem hier: das Sheet ist die eine Stelle, an der alles liegt, was
       die Liste aendert. */
    h += '<p class="fgroup__h">Standort</p><div class="tagpick">'
      + hereChipHtml()
      + '</div><p class="fgroup__x" id="here-note">' + esc(hereNote()) + '</p>';

    h += '<p class="fgroup__h">Zustand</p><div class="tagpick">'
      + FLAGS.filter(function (f) { return f.key === 'unseen'; }).map(flagChipHtml).join('')
      + '</div>';

    var tags = allTags();
    h += '<p class="fgroup__h">Tags <span class="fgroup__n">' + tags.length + '</span></p>'
      + '<p class="fgroup__x">Mehrere Tags sind ODER-verknüpft: ein Ort muss nur einem davon entsprechen.</p>'
      + '<div class="search search--in"><svg class="search__icon" viewBox="0 0 24 24" aria-hidden="true">'
      + '<circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>'
      + '<input type="search" id="tag-q" class="search__input" autocomplete="off"'
      + ' autocorrect="off" spellcheck="false" placeholder="Tag suchen" aria-label="Tags durchsuchen"></div>'
      + '<div class="tagpick" id="tagpick">' + tagChipsHtml('') + '</div>';

    return h
      + '<div class="sheet__acts">'
      + '<button type="button" class="btn btn--wide" id="filter-clear">Zurücksetzen</button>'
      + '<button type="button" class="btn btn--wide btn--primary" id="filter-done"></button>'
      + '</div>';
  }

  function hereChipHtml() {
    var wait = S.hereState === 'wait';
    return '<button type="button" class="chip chip--here" id="here-btn"'
      + ' aria-pressed="' + (S.here ? 'true' : 'false') + '"'
      + (wait ? ' disabled' : '') + '>'
      + ICON.pin + (wait ? 'Standort…' : S.here ? 'Von hier aus' : 'Von hier aus messen')
      + '</button>';
  }

  function flagChipHtml(f) {
    return '<button type="button" class="chip chip--' + f.key + '" data-flag="' + f.key + '"'
      + ' aria-pressed="' + (flagOn(f.key) ? 'true' : 'false') + '">'
      + ICON[f.icon] + esc(f.label) + '<span class="chip__n">' + flagCount(f.key) + '</span></button>';
  }

  /* 85 Tags, 30 davon einmal vergeben — ohne Suchfeld findet man darin nichts. */
  function tagChipsHtml(q) {
    var term = norm(q || '');
    var list = allTags().filter(function (t) {
      return !term || norm(t.tag).indexOf(term) >= 0 || S.tags.indexOf(t.tag) >= 0;
    });
    if (!list.length) return '<p class="fgroup__x">Kein Tag passt zu „' + esc(q) + '“.</p>';
    return list.map(function (t) {
      return '<button type="button" class="chip chip--tag" data-tag="' + esc(t.tag) + '"'
        + ' aria-pressed="' + (S.tags.indexOf(t.tag) >= 0 ? 'true' : 'false') + '">'
        + esc(t.tag) + '<span class="chip__n">' + t.n + '</span></button>';
    }).join('');
  }

  /* Der Kopf liegt fix und belegt keinen Platz im Fluss — .main haelt den
     Abstand ueber --bar-full. Gemessen wird immer im aufgeklappten Zustand,
     sonst waere der Abstand nach dem ersten Einklappen zu klein. */
  function measureBar() {
    var bar = document.querySelector('.bar');
    var top = $('bar-top');
    if (!bar) return;
    var was = document.body.classList.contains('is-compact');
    if (was) document.body.classList.remove('is-compact');
    var topH = top ? top.offsetHeight : 0;
    var full = bar.offsetHeight;
    if (was) document.body.classList.add('is-compact');
    var root = document.documentElement.style;
    root.setProperty('--bar-top-h', topH + 'px');
    root.setProperty('--bar-full', full + 'px');
  }

  /* Beim Scrollen nach unten fahren Titel, Schalter und Suche weg; die
     Filterzeile bleibt. Der Kopf kostet beim Lesen damit eine Zeile statt
     dreier. Oben angekommen klappt er immer wieder auf. */
  var lastY = 0;

  function setCompact(on) {
    if (on === document.body.classList.contains('is-compact')) return;
    document.body.classList.toggle('is-compact', on);
  }

  function onScroll() {
    /* Bei offenem Sheet ist body fixiert, waehrend des Tippens steht die
       Suche im Weg — in beiden Faellen nicht anfassen. */
    if (document.body.classList.contains('is-locked')) return;
    if (document.body.classList.contains('is-typing')) { setCompact(false); return; }
    if (S.view === 'info' || S.view === 'heute') { setCompact(false); lastY = 0; return; }

    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    var top = parseInt(document.documentElement.style.getPropertyValue('--bar-top-h'), 10) || 0;
    if (y <= top) setCompact(false);
    else if (y > lastY + 6) setCompact(true);
    else if (y < lastY - 6) setCompact(false);
    lastY = y;
  }

  function syncChips() {
    syncFilterBar();
    /* Kategorie-, Flag- und Tag-Chips liegen im Sheet und existieren nur,
       solange es offen ist — die Liste dahinter zieht trotzdem sofort nach. */
    var body = $('sheet-body');
    var cats = body.querySelectorAll('[data-cat]');
    for (var i = 0; i < cats.length; i++) {
      cats[i].setAttribute('aria-pressed', S.cats.indexOf(cats[i].getAttribute('data-cat')) >= 0 ? 'true' : 'false');
    }
    var flags = body.querySelectorAll('[data-flag]');
    for (var j = 0; j < flags.length; j++) {
      var k = flags[j].getAttribute('data-flag');
      flags[j].setAttribute('aria-pressed', flagOn(k) ? 'true' : 'false');
      var n = flags[j].querySelector('.chip__n');
      if (n) n.textContent = String(flagCount(k));
    }
    var tags = body.querySelectorAll('[data-tag]');
    for (var t = 0; t < tags.length; t++) {
      tags[t].setAttribute('aria-pressed', S.tags.indexOf(tags[t].getAttribute('data-tag')) >= 0 ? 'true' : 'false');
    }
    /* Der Standortknopf und sein Hinweis wechseln ihren Text mit dem Zustand
       — und der kommt aus einer Rueckmeldung, die Sekunden spaeter eintrifft. */
    var hb = $('here-btn');
    if (hb) hb.outerHTML = hereChipHtml();
    var hn = $('here-note');
    if (hn) hn.textContent = hereNote();
    $('q-clear').hidden = !S.q;
  }

  function toggleIn(arr, v) {
    var i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
  }

  function anyFilter() {
    /* S.jum fehlt hier bewusst: eine Dauereinstellung wird nicht
       mitzurueckgesetzt, sonst waere Jum nach jedem Reset wieder weg.
       S.here fehlt aus dem zweiten Grund: er blendet keinen Ort aus, und
       "101 von 101 Orten" waere eine Zeile ohne Aussage. */
    return !!S.q || S.cats.length > 0 || S.walk || S.unseen || S.short || S.tags.length > 0;
  }

  function resetFilters() {
    S.q = ''; S.cats = []; S.walk = false; S.unseen = false; S.short = false; S.tags = [];
    $('q').value = '';
    render();
  }

  /* --------------------------------------------------------------- Auswahl */

  var jumHidden = 0;          // wie viele Orte der Jum-Schalter zuletzt ausblendete

  function selected() {
    var pool = grundmenge();

    var terms = norm(S.q).split(/\s+/).filter(Boolean);

    var out = pool.filter(function (p) {
      if (S.cats.length && S.cats.indexOf(p.category) < 0) return false;
      if (S.walk && !(has(p.walk_min) && p.walk_min <= WALK_MAX)) return false;
      if (S.unseen && S.seen.indexOf(p.id) >= 0) return false;
      if (S.short && !(has(p.time_min) && p.time_min <= SHORT_MAX)) return false;
      if (S.tags.length) {
        var hit = false;
        for (var i = 0; i < S.tags.length; i++) if (p.tags.indexOf(S.tags[i]) >= 0) { hit = true; break; }
        if (!hit) return false;
      }
      for (var t = 0; t < terms.length; t++) if (p._h.indexOf(terms[t]) < 0) return false;
      return true;
    });

    /* Jum greift zuletzt, damit die Zaehlzeile sagen kann, wie viele Orte
       der Dauerschalter gerade kostet — und nicht nur, wie viele bleiben. */
    if (S.jum) {
      var withJum = out.filter(function (p) { return p.dog === true; });
      jumHidden = out.length - withJum.length;
      out = withJum;
    } else {
      jumHidden = 0;
    }

    return out.sort(S.sort === 'rating' ? byRating : byDistance);
  }

  /* Ohne Wert einsortiert ans Ende — nicht als 0 behandeln. */
  function byDistance(a, b) {
    /* Mit Standort misst "Entfernung" ab hier statt ab dem Zeltplatz. Orte
       ohne geo fallen dabei ans Ende — nicht als 0 nach vorn, wie ueberall. */
    if (S.here) {
      var ha = hereKm(a), hb = hereKm(b);
      var ua = ha === null ? Infinity : ha, ub = hb === null ? Infinity : hb;
      if (ua !== ub) return ua - ub;
    }
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
    var isPlan = S.view === 'gemerkt';
    var bare = S.view === 'info' || S.view === 'heute';
    /* Der Plan ist eine Liste, die man selbst gebaut hat — Suchen, Filtern
       und Sortieren haetten dort nichts zu suchen und wuerden die
       Reihenfolge zerschiessen, um die es gerade geht. */
    $('filters').hidden = bare || isPlan;
    /* Auf "Heute" bleibt das Suchfeld stehen. Ohne es ist von der Startansicht
       aus nicht zu sehen, dass hinter dem einen Vorschlag ein ganzer Bestand
       liegt — der Weg dorthin stand bisher nur unten am Ende der Seite. */
    $('search-wrap').hidden = S.view === 'info' || isPlan;
    $('meta-row').hidden = bare || isPlan;
    renderShareBar();
    measureBar();

    /* Die Karte gehoert zur Ortsansicht: dieselben Filter, dieselbe Auswahl,
       nur eine andere Darstellung. In Heute, Info und Plan hat sie nichts zu
       suchen und wird weggeraeumt. */
    var kartenAnsicht = !bare && !isPlan && S.map;
    $('map').hidden = !kartenAnsicht;
    if (!kartenAnsicht) mapNote('');
    $('map-btn').hidden = bare || isPlan;
    $('map-btn').innerHTML = ICON.map + (S.map ? 'Liste' : 'Karte');
    $('map-btn').setAttribute('aria-label',
      S.map ? 'Zur Liste wechseln' : 'Die Treffer auf der Karte zeigen');

    if (bare) {
      $('list').innerHTML = '';
      $('list').hidden = true;
      $('empty').hidden = true;
      if (S.view === 'info') {
        $('today').hidden = true; $('today').innerHTML = '';
        $('info').hidden = false; $('info').innerHTML = infoHtml();
      } else {
        $('info').hidden = true; $('info').innerHTML = '';
        $('today').hidden = false; $('today').innerHTML = todayHtml();
      }
      return;
    }

    $('info').hidden = true;
    $('info').innerHTML = '';
    $('today').hidden = true;
    $('today').innerHTML = '';

    /* Der Plan hat seine eigene Darstellung: Reihenfolge statt Sortierung,
       Zeitbudget statt Trefferzahl. */
    if (isPlan) {
      var plan = planList();
      if (!plan.length) {
        $('list').hidden = true;
        $('list').innerHTML = '';
        $('empty').hidden = false;
        $('empty-h').textContent = 'Noch nichts im Plan';
        $('empty-p').textContent = 'Auf einer Zeile den Stern antippen — der Plan bleibt auch offline erhalten '
          + 'und lässt sich in der Reihenfolge umstellen.';
        $('empty-reset').hidden = true;
        return;
      }
      $('empty').hidden = true;
      $('list').hidden = false;
      $('list').innerHTML = planHtml();
      return;
    }

    var items = selected();
    var total = D.places.length;

    renderCount(items.length, total);

    if (!items.length) {
      $('list').hidden = true;
      $('list').innerHTML = '';
      $('map').hidden = true;
      mapNote('');
      $('empty').hidden = false;
      {
        $('empty-h').textContent = 'Nichts gefunden';
        /* "Filter zurücksetzen" räumt den Jum-Schalter absichtlich nicht mit
           ab. Wenn er der Grund ist, muss das hier stehen — sonst drückt man
           auf Zurücksetzen und es bleibt leer. */
        $('empty-p').textContent = 'Kein Ort passt zu dieser Kombination aus Suche und Filtern.'
          + (S.jum ? ' Der Schalter „Mit Jum“ oben blendet zusätzlich alle Orte ohne geklärte Hundregel aus.' : '');
        $('empty-reset').hidden = false;
      }
      return;
    }

    $('empty').hidden = true;
    if (kartenAnsicht) {
      $('list').hidden = true;
      $('list').innerHTML = '';
      zeigeKarte(items);
      return;
    }
    $('list').hidden = false;
    $('list').innerHTML = items.map(cardHtml).join('');
  }

  var lastCount = { shown: 0, total: 0 };

  function renderCount(shown, total) {
    if (shown === undefined) { shown = lastCount.shown; total = lastCount.total; }
    lastCount = { shown: shown, total: total };
    var seenHere = S.seen.length;
    /* Der Jum-Schalter blendet still aus. Damit das nie unbemerkt passiert,
       steht hier, wie viele Orte er gerade kostet. Bei 58 von 101 Orten ist
       die Hundregel ungeklärt — das ist viel, und man muss es sehen. */
    var unclear = S.jum ? jumHidden : 0;
    $('count').textContent = (anyFilter() || S.jum
      ? shown + ' von ' + total + (total === 1 ? ' Ort' : ' Orten')
      : total + (total === 1 ? ' Ort' : ' Orte'))
      + (S.jum ? ' · mit Jum' : ' · ' + dogCount() + ' mit Hund')
      + (unclear ? ' · ' + unclear + ' ohne Jum ausgeblendet' : '')
      /* Der Standort verschiebt den Bezugspunkt still. Also steht hier, dass
         ab hier gemessen wird und wie viele Orte dabei nicht mitkoennen. */
      + (S.here ? ' · ab hier gemessen' : '')
      + (S.here && noGeoCount() ? ' · ' + noGeoCount() + ' ohne Koordinaten hinten' : '')
      + (seenHere ? ' · ' + seenHere + ' gesehen' : '');

    var live = $('filter-count');
    if (live) {
      /* Nur schreiben, wenn sich etwas geaendert hat. Ein erneutes Setzen
         desselben Textes ist fuer das Auge folgenlos, kann aber vorgelesen
         werden -- und renderCount() laeuft bei jedem Tipp im Sheet. */
      var txt = shown === 1 ? '1 Ort passt' : shown + ' Orte passen';
      if (live.textContent !== txt) live.textContent = txt;
    }
    /* Man tippt nie "Fertig" ins Ungewisse — der Knopf nennt das Ergebnis. */
    var done = $('filter-done');
    if (done) {
      var dtxt = shown === 1 ? '1 Ort zeigen' : shown + ' Orte zeigen';
      if (done.textContent !== dtxt) done.textContent = dtxt;
    }
  }

  /* Feste Reihenfolge, feste Slots: Weg, Dauer, Hund, Oeffnung. Was fehlt,
     laesst seinen Slot aus, statt die naechsten nachruecken zu lassen — so
     stehen die Zahlen ueber die Liste hinweg untereinander. Die Bewertung
     ist raus, sie steht rechts auf der Namenszeile. */
  function factsHtml(p) {
    var f = [];
    /* Mit Standort steht im Weg-Slot die Luftlinie ab hier. "18 Min zu Fuss"
       gilt ab dem Zeltplatz und waere in Sirmione schlicht falsch. Derselbe
       Slot, dieselbe Zeilenhoehe. Orte ohne geo behalten ihre Angabe ab dem
       Zeltplatz — die Zaehlzeile sagt, wie viele das sind. */
    var hk = hereKm(p);
    if (hk !== null) {
      f.push('<span class="fact fact--here">' + ICON.pin + esc(km(hk)) + ' von hier</span>');
    } else if (has(p.walk_min)) {
      f.push('<span class="fact">' + ICON.walk + p.walk_min + ' Min</span>');
    } else if (has(p.bike_min)) {
      f.push('<span class="fact">' + ICON.bike + p.bike_min + ' Min</span>');
    } else if (has(p.distance_km)) {
      f.push('<span class="fact">' + ICON.pin + km(p.distance_km) + '</span>');
    }
    if (has(p.time_min)) {
      f.push('<span class="fact fact--time">' + ICON.hourglass + esc(dur(p.time_min)) + '</span>');
    }
    /* Steht der Dauerschalter auf "Mit Jum", ist jeder gezeigte Ort hundeok —
       die Marke an jeder Zeile sagt dann nichts mehr und kostet nur Platz. */
    if (p.dog === true && !S.jum) f.push('<span class="fact fact--dog">' + ICON.dog + 'Jum ok</span>');
    else if (p.dog === false) f.push('<span class="fact fact--nodog">' + ICON.dog + 'ohne Jum</span>');
    /* Der Ruhetag belegt denselben Slot, statt einen fuenften aufzumachen —
       die Zeilenhoehe von 97 px bleibt damit unangetastet. "taeglich 18–23,
       Ruhetag Mittwoch" hilft am Mittwoch niemandem, "heute zu" schon; der
       volle Wortlaut steht weiter im Sheet. */
    if (closedToday(p)) {
      f.push('<span class="fact fact--closed">' + ICON.clock + 'heute zu</span>');
    } else if (has(p.hours)) {
      f.push('<span class="fact fact--hours">' + ICON.clock + '<span>'
        + esc(String(p.hours).replace(/^ge\u00f6ffnet\s+/i, '')) + '</span></span>');
    }
    return f.length ? '<div class="facts">' + f.join('') + '</div>' : '';
  }

  /* Die Zahl der Bewertungen steht in einer eigenen, fest breiten Spalte —
     sonst schoebe "(1.478)" die Wertung weiter nach links als "(806)" und
     die Spalte, die man scannen koennen soll, waere krumm. Sie wird auch
     ohne Inhalt gesetzt, damit die Wertung bei allen gleich steht. */
  function ratingHtml(p) {
    if (!has(p.rating)) return '';
    return '<span class="card__rating">'
      + '<span class="card__stars">' + ICON.rating + nf1.format(p.rating) + '</span>'
      + '<span class="fact__n">' + (has(p.reviews) ? '(' + nf0.format(p.reviews) + ')' : '') + '</span>'
      + '</span>';
  }

  function cardHtml(p) {
    var on = S.saved.indexOf(p.id) >= 0;
    var wasSeen = S.seen.indexOf(p.id) >= 0;
    /* Der Name ist eine echte Überschrift (nicht im Knopf verschachtelt, das
       wäre ungültig). Geöffnet wird über einen Knopf, der die Karte überdeckt. */
    return '<article class="card ' + accentClass(p.category) + (wasSeen ? ' card--seen' : '') + '">'
      + '<div class="card__head">'
      + '<h3 class="card__name">' + esc(p.name) + '</h3>'
      + ratingHtml(p)
      + '</div>'
      + '<p class="card__meta">'
      + '<span class="card__cat">' + esc(catLabel(p.category)) + '</span>'
      + badgeHtml(p)
      + (wasSeen ? '<span class="card__seen">' + ICON.check + 'Gesehen</span>' : '')
      + '</p>'
      /* Die Notiz ist einzeilig gekuerzt: liegt die Fundstelle hinter dem
         Schnitt, sieht man die Markierung erst im Detail. Besser als gar
         kein Hinweis, warum der Ort dasteht. */
      /* Die eigene Notiz steht VOR der Beschreibung: sie ist das, was man
         selbst herausgefunden hat, und schlaegt damit den Katalogtext. */
      + (S.notes[p.id] ? '<p class="card__mine">' + ICON.note + esc(S.notes[p.id]) + '</p>' : '')
      + (has(p.note) ? '<p class="card__note">' + markiere(p.note) + '</p>' : '')
      + factsHtml(p)
      + '<button type="button" class="card__open" data-open="' + esc(p.id) + '"'
      + ' aria-label="' + esc(p.name) + ' — Details"></button>'
      + '<span class="card__marks">'
      + '<button type="button" class="star" data-save="' + esc(p.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
      + '<span class="sr-only">' + (on ? 'Aus der Merkliste entfernen' : 'Merken') + '</span>'
      + ICON.star + '</button>'
      + '<button type="button" class="seen" data-seen="' + esc(p.id) + '" aria-pressed="' + (wasSeen ? 'true' : 'false') + '">'
      + '<span class="sr-only">' + (wasSeen ? 'Als noch nicht gesehen markieren' : 'Als gesehen markieren') + '</span>'
      + ICON.checkRound + '</button>'
      + '</span>'
      + '</article>';
  }


  /* ------------------------------------------------------------- Heute */

  /* Tagesabschnitte. "until" ist das Ende in Minuten seit Mitternacht und
     dient zugleich als Frage "geht sich das heute noch aus?". */
  var MOMENTS = [
    { id: 'frueh',      label: 'Morgen',     until: 11 * 60,      kicker: 'Für den Morgen' },
    { id: 'mittag',     label: 'Mittag',     until: 14 * 60 + 30, kicker: 'Für den Mittag' },
    { id: 'nachmittag', label: 'Nachmittag', until: 18 * 60,      kicker: 'Für den Nachmittag' },
    { id: 'abend',      label: 'Abend',      until: 23 * 60,      kicker: 'Für heute Abend' }
  ];

  var BADGE_MOMENT = {
    'Früh morgens': ['frueh'],
    'Mittags': ['mittag'],
    'Nur mittags': ['mittag'],
    'Nur Sa/So mittags': ['mittag'],
    'Nachmittags': ['nachmittag'],
    'Der Abend': ['abend'],
    'Der zweite grosse Abend': ['abend'],
    'Sonnenuntergang': ['abend'],
    'Abendlicht': ['abend'],
    'Livemusik': ['abend'],
    'Cocktails': ['abend'],
    'Ganzer Tag': ['frueh']
  };

  var INDOOR_YES = ['museum', 'kirche', 'supermarkt', 'notfall', 'regen'];
  var INDOOR_NO  = ['strand', 'natur', 'wandern', 'rad', 'park', 'festung', 'seeblick',
                    'schiff', 'wasser', 'markt'];

  /* Öffnungszeiten stehen als Freitext da ("geöffnet bis 22:30", "täglich
     18–23, Ruhetag Mittwoch"). Was sich sicher lesen lässt, wird gelesen;
     alles andere bleibt null. Daraus wird nie "hat offen" abgeleitet —
     nur "schließt gleich", und das auch nur, wenn eine Zeit dasteht. */
  function hoursWindow(h) {
    if (!has(h)) return { open: null, close: null };
    var t = String(h), open = null, close = null, m;
    m = t.match(/(?:^|[\s·,])(?:ab|öffnet)\s*(\d{1,2})[:.](\d{2})/i);
    if (m) open = (+m[1]) * 60 + (+m[2]);
    m = t.match(/bis\s*(?:ca\.\s*)?(\d{1,2})[:.](\d{2})/i);
    if (m) close = (+m[1]) * 60 + (+m[2]);
    if (open === null && close === null) {
      m = t.match(/(\d{1,2})(?:[:.](\d{2}))?\s*[–-]\s*(\d{1,2})(?:[:.](\d{2}))?/);
      if (m) {
        open = (+m[1]) * 60 + (+(m[2] || 0));
        close = (+m[3]) * 60 + (+(m[4] || 0));
        if (close <= open) close = null;
      }
    }
    return { open: open, close: close };
  }

  /* Der Ruhetag steht bei 14 Orten woertlich in hours — elfmal als
     "Ruhetag Mittwoch", dreimal als "Mi geschlossen" oder "Mo zu". Gelesen hat
     ihn bisher niemand, und "Heute" stellte die Palazzina Storica mittwochs auf
     Platz 2 von 41, mit "Mittwochs geschlossen" in der eigenen Notiz.

     Das ist kein Widerspruch zum Grundsatz, nie zu behaupten, etwas habe
     gerade offen: der umgekehrte Schluss ist der sichere. Wo woertlich
     "Ruhetag Mittwoch" steht, ist mittwochs zu — dieselbe Beweislast, die
     hoursWindow() schon traegt.

     Gelesen wird nur hours, nie note. Dort steht bei lapescheria "italienische
     Pescherie ... haben montags zu" — eine Faustregel ueber eine Branche, keine
     Angabe ueber diesen Laden. */
  var WD_LONG  = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
  var WD_SHORT = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa'];
  var CLOSED_LONG  = /ruhetag\s*:?\s*(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)/i;
  /* Die Kurzform braucht das Wort dahinter: "Mi–Sa 19:00–23:00" ist eine
     Oeffnungszeit, "Mi geschlossen" ein Ruhetag. */
  var CLOSED_SHORT = /\b(so|mo|di|mi|do|fr|sa)\s*(?:geschlossen|zu)\b/i;

  /* Wochentag wie Date#getDay(): 0 ist Sonntag. null heisst "steht nicht da"
     — und wird nie zu "hat offen" umgedeutet. Mehrere Ruhetage in einer
     Angabe kommen in den Daten nicht vor; kaeme einer dazu, faengt ihn der
     Pruefstand. */
  function closedOn(h) {
    if (!has(h)) return null;
    var t = String(h), m;
    m = CLOSED_LONG.exec(t);
    if (m) return WD_LONG.indexOf(m[1].toLowerCase());
    m = CLOSED_SHORT.exec(t);
    if (m) return WD_SHORT.indexOf(m[1].toLowerCase());
    return null;
  }

  /* Ohne Datum gilt der heutige Tag. "Heute" schaut nach 23 Uhr auf morgen
     und reicht deshalb sein eigenes Bezugsdatum herein.

     Genommen wird nur ein echtes Date. Array#map reicht als zweites Argument
     den Index durch, und `.map(smallHtml)` ist im Haus die uebliche
     Schreibweise — ein durchgereichtes `1` wuerde hier sonst abstuerzen und
     die ganze Ansicht mitnehmen. Ein Argument, das kein Datum ist, ist
     immer ein Versehen und nie eine Absicht. */
  function closedToday(p, when) {
    var d = closedOn(p.hours);
    if (d === null) return false;
    var ref = (when instanceof Date && !isNaN(when.getTime())) ? when : new Date();
    return d === ref.getDay();
  }

  /* Reihenfolge: was im JSON steht, gilt. Erst wenn dort nichts steht, wird
     hergeleitet — aus badge, Öffnungszeit, Kategorie und Aufenthaltsdauer.

     Die leere Liste gilt mit: sie sagt „kein Tagesvorschlag". Vorher fiel sie
     durch die Längenprüfung in die Herleitung zurück, und die Apotheke stand
     wegen „ab 8:30" morgens im Vorschlag. Damit schlägt moment die Herleitung
     jetzt wirklich immer — bisher nur, wenn etwas drinstand. */
  function momentsOf(p) {
    if (Array.isArray(p.moment)) return p.moment;
    if (p._m) return p._m;

    var m = {};
    var b = has(p.badge) && BADGE_MOMENT[p.badge];
    if (b) b.forEach(function (x) { m[x] = true; });

    var w = hoursWindow(p.hours);
    if (w.close !== null && w.close >= 21 * 60) m.abend = true;
    if (w.open !== null && w.open <= 8 * 60 + 30) m.frueh = true;
    if (w.open !== null && w.open >= 17 * 60) m.abend = true;
    if (w.open !== null && w.close !== null && w.open <= 12 * 60 + 30 && w.close >= 14 * 60) m.mittag = true;

    if (p.category === 'cafe') { m.frueh = true; m.nachmittag = true; }
    if (has(p.time_min) && p.time_min >= 240) m.frueh = true;   // Tagesausflug beginnt morgens

    var out = Object.keys(m);
    if (!out.length) {
      /* Nichts abzuleiten: Sehenswertes und Ausflüge passen grundsätzlich
         in jeden hellen Abschnitt, Essen mittags und abends. Praktisches
         (Apotheke, Supermarkt, Werkstatt) ist kein Tagesvorschlag. */
      if (p.category === 'praktisch') out = [];
      else if (p.category === 'essen') out = ['mittag', 'abend'];
      else out = ['frueh', 'mittag', 'nachmittag'];
    }
    p._m = out;
    return out;
  }

  function indoorOf(p) {
    if (p.indoor === true || p.indoor === false) return p.indoor;
    if (p.badge === 'Regentag') return true;
    for (var i = 0; i < INDOOR_YES.length; i++) if (p.tags.indexOf(INDOOR_YES[i]) >= 0) return true;
    /* Vor den Außen-Tags: "wasser" heißt bei einem Restaurant am See, dass
       es am Wasser liegt, nicht dass man im Regen sitzt. */
    if (p.category === 'essen' || p.category === 'cafe') return true;
    for (var j = 0; j < INDOOR_NO.length; j++) if (p.tags.indexOf(INDOOR_NO[j]) >= 0) return false;
    return null;                 // ungeklärt — und wird auch nicht behauptet
  }

  /* Badges wie "18.–20.09.", "26./27.09." oder "Di 22.09." sind Termine.
     Fällt heute hinein, gehört der Ort nach oben. */
  /* Zerlegt einen Datumsbadge in seine Spanne. Eine Stelle statt zweier:
     runsToday und daysUntil lasen bis v21 denselben Ausdruck getrennt, und
     ein Ausdruck, der an zwei Stellen steht, wandert irgendwann auseinander. */
  function badgeSpanne(p, now) {
    if (!has(p.badge)) return null;
    var m = String(p.badge).match(/(\d{1,2})\.(?:\s*[–\/-]\s*(\d{1,2})\.)?\s*(\d{1,2})\./);
    if (!m) return null;
    var jahr = now.getFullYear(), mon = +m[3] - 1;
    var von = new Date(jahr, mon, +m[1]);
    var bis = new Date(jahr, mon, m[2] ? +m[2] : +m[1]);
    return { von: von, bis: bis };
  }

  function runsToday(p, now) {
    var sp = badgeSpanne(p, now);
    if (!sp) return false;
    var heute = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return heute >= sp.von && heute <= sp.bis;
  }

  /* Wie viele Tage bis der Termin anfaengt. 0 = laeuft heute, null = kein
     Termin oder schon vorbei.

     Der Anlass: "laeuft heute" ist beim Wochenmarkt am Dienstag zu spaet --
     wer morgens davon liest, packt keine Kuehltasche mehr. Und die
     Rievocazione beschreibt sich selbst als das ergiebigste Fotomotiv der
     Woche; die braucht einen Vormittag Vorlauf. */
  function daysUntil(p, now) {
    var sp = badgeSpanne(p, now);
    if (!sp) return null;
    var heute = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (heute > sp.bis) return null;                 // vorbei
    if (heute >= sp.von) return 0;                   // laeuft
    return Math.round((sp.von - heute) / 86400000);
  }

  var LOOK_AHEAD = 45;        // Minuten Restzeit, ab denen der nächste Abschnitt dran ist

  function momentNow(mins) {
    if (mins >= 23 * 60 || mins < 5 * 60) return { m: MOMENTS[0], tomorrow: true, soon: false };
    for (var i = 0; i < MOMENTS.length; i++) {
      if (mins < MOMENTS[i].until) {
        /* Kurz vor Schluss bringt der laufende Abschnitt nichts mehr: um
           17:40 sucht man den Abend, nicht die letzten zwanzig Minuten
           Nachmittag. */
        if (MOMENTS[i].until - mins < LOOK_AHEAD && i < MOMENTS.length - 1) {
          return { m: MOMENTS[i + 1], tomorrow: false, soon: true };
        }
        return { m: MOMENTS[i], tomorrow: false, soon: false };
      }
    }
    return { m: MOMENTS[3], tomorrow: false, soon: false };
  }

  /* Reicht die Zeit noch? Nur dort gefragt, wo eine Dauer gemeint ist —
     beim Essen entscheidet nicht die Restzeit des Abschnitts. */
  function fitsLeft(p, mins, until) {
    if (p.category === 'essen' || p.category === 'cafe') return true;
    if (!has(p.time_min)) return true;
    return mins + (has(p.walk_min) ? p.walk_min : 0) + p.time_min <= until;
  }

  function unverified(p) {
    if (has(p.hours) && /ungeprüft|unbestätigt|prüfen/i.test(p.hours)) return true;
    return p.badge === 'Zeiten prüfen' || p.badge === 'Erst anrufen';
  }

  function closingSoon(p, mins) {
    var w = hoursWindow(p.hours);
    return w.close !== null && w.close - mins < 30 && w.close > mins - 60;
  }

  /* Wie viele Orte der Abschnitt kennt, bevor "schon gesehen" greift.
     Braucht der Leerzustand, um sagen zu koennen, woran es liegt. */
  var todayGesehen = 0;

  function todayList(mid, mins, until, now, mitGesehenen) {
    var out = D.places.filter(function (p) {
      if (momentsOf(p).indexOf(mid) < 0) return false;
      if (S.jum && p.dog !== true) return false;
      if (S.wet && indoorOf(p) !== true) return false;
      if (closingSoon(p, mins)) return false;
      return true;
    });

    /* Gesehenes verschwindet aus "Heute". Bis v19 stand es nur hinten in der
       Reihenfolge -- bei fuenfzehn Reisetagen heisst das, dass der Stapel sich
       mit Orten fuellt, an denen man schon war, und der Zaehler "1 / 37" eine
       Auswahl verspricht, die es so nicht mehr gibt. In der Liste bleiben sie
       sichtbar und gedaempft; dort sucht man, hier bekommt man vorgeschlagen.
       Der Leerzustand faengt den Fall ab, dass ein Abschnitt dadurch leer
       wird -- still schrumpfen tut hier nichts. */
    var ohne = out.filter(function (p) { return S.seen.indexOf(p.id) < 0; });
    todayGesehen = out.length - ohne.length;
    if (!mitGesehenen) out = ohne;

    return out.sort(function (a, b) {
      /* Vor allem anderen: wer heute Ruhetag hat, steht ganz hinten. Eine
         gute Bewertung hilft an einem geschlossenen Mittwoch nicht.
         Herausgefiltert wird nicht — sonst schruempfte die Liste still, und
         genau das tut diese App nirgends. */
      var ca = closedToday(a, now) ? 1 : 0, cb = closedToday(b, now) ? 1 : 0;
      if (ca !== cb) return ca - cb;
      var fa = fitsLeft(a, mins, until) ? 0 : 1, fb = fitsLeft(b, mins, until) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      var ua = unverified(a) ? 1 : 0, ub = unverified(b) ? 1 : 0;
      if (ua !== ub) return ua - ub;
      var ea = runsToday(a, now) ? 1 : 0, eb = runsToday(b, now) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      /* Greift nur noch im Rueckfall (mitGesehenen), wenn der Abschnitt sonst
         leer waere -- im Normalfall sind Gesehene oben schon heraus. */
      var sa = S.seen.indexOf(a.id) >= 0 ? 1 : 0, sb = S.seen.indexOf(b.id) >= 0 ? 1 : 0;
      if (sa !== sb) return sa - sb;
      /* Ohne diese Stufe gewinnt die beste Bewertung, auch wenn sie 51
         Minuten entfernt liegt. Erst das Erreichbare, dann das Beste darin —
         dieselbe Schwelle wie der Chip "Zu Fuß". */
      var na = has(a.walk_min) && a.walk_min <= WALK_MAX ? 0 : 1;
      var nb = has(b.walk_min) && b.walk_min <= WALK_MAX ? 0 : 1;
      if (na !== nb) return na - nb;
      if ((b.rating || 0) !== (a.rating || 0)) return (b.rating || 0) - (a.rating || 0);
      return byDistance(a, b);
    });
  }

  /* "Tag 5 von 15" steht nirgends in den Daten, lässt sich aber aus dem
     Untertitel lesen. Passt das Muster nicht, entfällt die Zeile. */
  var MONTHS = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli',
                'august', 'september', 'oktober', 'november', 'dezember'];

  function tripDay(now) {
    var t = has(D.meta.subtitle) ? String(D.meta.subtitle) : '';
    var m = t.match(/(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})/);
    if (!m) return null;
    var mon = MONTHS.indexOf(m[3].toLowerCase());
    if (mon < 0) return null;
    var from = new Date(+m[4], mon, +m[1]), to = new Date(+m[4], mon, +m[2]);
    var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (day0 < from || day0 > to) return null;
    var oneDay = 86400000;
    return { n: Math.round((day0 - from) / oneDay) + 1, of: Math.round((to - from) / oneDay) + 1 };
  }


  /* --------------------------------------------------------- Heute-Ansicht */

  var WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS_LONG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                     'August', 'September', 'Oktober', 'November', 'Dezember'];

  function hhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }

  /* Der Satz unter dem Namen wird aus Daten gebaut, nicht erfunden: Weg,
     Dauer, Hund, Termin. Was nicht dasteht, steht auch nicht da. */
  function whyLine(p, mins, until, ref, tomorrow) {
    var bits = [];
    if (runsToday(p, ref)) bits.push((tomorrow ? 'läuft morgen' : 'läuft heute') + ' (' + esc(p.badge) + ')');
    if (has(p.rating)) bits.push('★ ' + nf1.format(p.rating));
    if (has(p.walk_min)) bits.push(p.walk_min + ' Min zu Fuß');
    else if (has(p.bike_min)) bits.push(p.bike_min + ' Min mit dem Rad');
    else if (has(p.distance_km)) bits.push(km(p.distance_km));
    if (has(p.time_label)) bits.push(esc(p.time_label));
    else if (has(p.time_min)) bits.push(esc(dur(p.time_min)));
    if (p.dog === true) bits.push('Jum darf mit');
    if (unverified(p)) bits.push('Zeiten ungeprüft, vorher anrufen');
    var out = bits.join(' · ');
    /* Steht er trotzdem da — weil sonst nichts uebrig ist oder weil jemand
       weiterblaettert —, dann mit dem Grund. */
    if (closedToday(p, ref)) {
      out += '<span class="today__shut"> — ' + (tomorrow ? 'morgen' : 'heute') + ' Ruhetag</span>';
    }
    if (!fitsLeft(p, mins, until)) {
      out += '<span class="today__late"> — dafür ist es heute zu spät</span>';
    }
    return out;
  }

  function pickHtml(p, mins, until, ref, tomorrow, atStart) {
    var on = S.saved.indexOf(p.id) >= 0;
    return '<p class="today__cat ' + accentClass(p.category) + '">' + esc(catLabel(p.category))
      + (has(p.hours) ? '<span class="today__hours">' + esc(String(p.hours).replace(/^geöffnet\s+/i, '')) + '</span>' : '')
      + '</p>'
      + '<h3 class="today__name">' + esc(p.name) + '</h3>'
      + (has(p.note) ? '<p class="today__note">' + esc(p.note) + '</p>' : '')
      + '<p class="today__why">' + whyLine(p, mins, until, ref, tomorrow) + '</p>'
      + '<div class="today__acts">'
      + '<button type="button" class="btn btn--primary" data-open="' + esc(p.id) + '">Ansehen</button>'
      + '<button type="button" class="btn" data-save="' + esc(p.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">'
      + ICON.star + (on ? 'Gemerkt' : 'Merken') + '</button>'
      + '</div>'
      /* Zwei Knoepfe statt eines: der Stapel hat jetzt Anfang, Ende und
         Rueckweg. Der Zaehler steht oben im Kicker. */
      + '<div class="today__nav">'
      + '<button type="button" class="btn" id="today-prev" aria-label="Voriger Vorschlag"'
      + (atStart ? ' disabled' : '') + '>'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg></button>'
      + '<button type="button" class="btn" id="today-next">' + ICON.shuffle + 'Anderer Vorschlag</button>'
      + '</div>';
  }

  function smallHtml(p, ref) {
    return '<button type="button" class="today__small" data-open="' + esc(p.id) + '">'
      + '<span class="today__small-n">' + esc(p.name) + '</span>'
      + '<span class="today__small-m">' + esc(catLabel(p.category))
      + (has(p.walk_min) ? ' · ' + p.walk_min + ' Min' : '')
      + (p.dog === true ? ' · Jum ok' : '')
      + (closedToday(p, ref) ? '<span class="today__shut"> · heute zu</span>' : '')
      + '</span>'
      + '</button>';
  }

  function setWet(v) {
    if (S.wet === v) return;
    S.wet = v;
    S.pick = 0; S.moreOpen = false; S.seenOk = false;
    ssSet(SS_WET, v);
    render();
  }

  function momentIndex(id) {
    for (var i = 0; i < MOMENTS.length; i++) if (MOMENTS[i].id === id) return i;
    return 0;
  }

  /* Die Vier-Abschnitte-Leiste. Bis v13 zeigte "Heute" nur, was die Uhr
     sagte — man sah weder den ganzen Tag noch konnte man vorausblaettern.
     Vergangene Abschnitte sind gedaempft, aber erreichbar. */
  function segbarHtml(nowId, shownId, tomorrow) {
    var ni = momentIndex(nowId);
    return '<div class="segbar" role="group" aria-label="Tagesabschnitt">'
      + MOMENTS.map(function (m, i) {
          var state = tomorrow ? 'ahead' : i < ni ? 'past' : i === ni ? 'now' : 'ahead';
          return '<button type="button" class="seg seg--' + state + '" data-mid="' + m.id + '"'
            + ' aria-pressed="' + (m.id === shownId ? 'true' : 'false') + '">'
            + esc(m.label) + '</button>';
        }).join('')
      + '</div>';
  }

  /* Bei Regen ist "nichts da" oft die richtige Antwort — aber sie muss
     sagen, was stattdessen geht. Die Zahlen kommen aus den Daten. */
  function wetNoneHtml(mid, ref) {
    var trocken = D.places.filter(function (p) {
      return momentsOf(p).indexOf(mid) >= 0 && indoorOf(p) === true;
    });
    var offen = D.places.filter(function (p) { return indoorOf(p) === null; }).length;
    var h = '<div class="today__none"><h3>Bei Regen steht hier nichts</h3>';
    if (S.jum && trocken.length) {
      h += '<p>Im Trockenen wäre in diesem Abschnitt etwas dabei — aber nicht'
        + ' mit Jum. Ohne den Schalter sind es ' + trocken.length
        + (trocken.length === 1 ? ' Ort:' : ' Orte:') + '</p>'
        + '<div class="today__smalls">'
        + trocken.slice(0, 3).map(function (o) { return smallHtml(o, ref); }).join('')
        + '</div>';
    } else {
      h += '<p>Bei ' + offen + ' von ' + D.places.length + ' Orten ist nicht hinterlegt, '
        + 'ob man dort im Trockenen sitzt. Ungeprüft wird hier nichts vorgeschlagen.</p>';
    }
    return h + '</div>';
  }

  function todayHtml() {
    var now = new Date();
    var mins = now.getHours() * 60 + now.getMinutes();
    var mn = momentNow(mins);
    var trip = tripDay(now);

    /* Der gewaehlte Abschnitt schlaegt die Uhr. Ohne Wahl gilt, was die Uhr
       sagt — und beim Wechseln zurueck auf "jetzt" verschwindet die Wahl. */
    var chosen = S.mid && S.mid !== mn.m.id;
    var m = chosen ? MOMENTS[momentIndex(S.mid)] : mn.m;
    var tomorrow = !chosen && mn.tomorrow;
    var until = m.until;
    var ref = tomorrow
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
      : now;

    /* Beim Vorausschauen rechnet die Restzeit ab dem Beginn des nächsten
       Abschnitts — sonst fällt alles durch, was "jetzt" nicht mehr passt. */
    var from = tomorrow ? 0 : chosen ? Math.min(mins, until - 180)
             : (mn.soon ? until - 180 : mins);
    var list = todayList(m.id, from, until, ref, S.seenOk);
    var pick = list.length ? list[S.pick % list.length] : null;
    var others = list.filter(function (p) { return !pick || p.id !== pick.id; });
    var shown = S.moreOpen ? others : others.slice(0, 3);

    var head = '<p class="today__date">' + WEEKDAYS[now.getDay()] + ', ' + now.getDate() + '. '
      + MONTHS_LONG[now.getMonth()]
      + (trip ? ' · Tag ' + trip.n + ' von ' + trip.of : '') + '</p>'
      + '<h2 class="today__now">' + (tomorrow ? 'Morgen früh' : (!chosen && mn.soon ? 'Gleich: ' : '') + m.label)
      + '<span class="today__clock">' + hhmm(mins) + '</span></h2>'
      + segbarHtml(mn.m.id, m.id, mn.tomorrow)
      + terminHtml(now);

    /* Was in den naechsten Tagen anfaengt. Ein Satz ueber dem Vorschlag, keine
     neue Ansicht: die vier Termine im Bestand laufen ein bis drei Tage, und
     wer erst am Morgen davon liest, hat die Planung schon verpasst.

     Drei Tage Vorlauf. Verworfen: sieben -- dann steht die Zeile fast jeden
     Tag da und wird zur Tapete; bei fuenfzehn Reisetagen und vier Terminen
     waere sie an neun Tagen sichtbar. Mit drei sind es fuenf. */
  var VORLAUF_TAGE = 3;

  function terminHtml(now) {
    var bald = D.places.map(function (p) { return { p: p, d: daysUntil(p, now) }; })
      .filter(function (t) { return t.d !== null && t.d > 0 && t.d <= VORLAUF_TAGE; })
      .sort(function (a, b) { return a.d - b.d; });
    if (!bald.length) return '';
    return '<div class="today__soon">' + bald.map(function (t) {
      var wann = t.d === 1 ? 'Morgen' : 'In ' + t.d + ' Tagen';
      return '<button type="button" class="today__soon-row" data-open="' + esc(t.p.id) + '">'
        + '<span class="today__soon-when">' + wann + '</span>'
        + '<span class="today__soon-what">' + esc(t.p.name) + '</span>'
        + '<span class="today__soon-badge">' + esc(t.p.badge) + '</span>'
        + '</button>';
    }).join('') + '</div>';
  }

  /* Das Wetter weiß die App nicht und holt es auch nicht — sie fragt. */
    var weather = '<div class="today__weather">'
      + '<span>Draußen ist es</span>'
      + '<button type="button" class="chip" id="wx-dry" aria-pressed="' + (S.wet ? 'false' : 'true') + '">schön</button>'
      + '<button type="button" class="chip" id="wx-wet" aria-pressed="' + (S.wet ? 'true' : 'false') + '">nass</button>'
      + '</div>';

    var body;
    if (pick) {
      body = '<div class="today__pick">'
        + '<p class="today__kicker">' + (tomorrow ? 'Für morgen früh' : m.kicker)
        + (S.jum ? ' · mit Jum' : '')
        /* "Anderer" lief bis v13 blind durch die Liste: kein Zaehler, kein
           Zurueck. Wer einmal zu weit tippte, fand den Vorschlag nicht wieder. */
        + '<span class="today__pos">' + ((S.pick % list.length) + 1) + ' / ' + list.length + '</span>'
        + '</p>'
        + pickHtml(pick, from, until, ref, tomorrow, S.pick % list.length === 0)
        + '</div>'
        + (shown.length
            ? '<p class="today__lead">Sonst noch'
              + '<span class="today__n">' + others.length + '</span></p>'
              + '<div class="today__smalls">'
              + shown.map(function (o) { return smallHtml(o, ref); }).join('') + '</div>'
              + (others.length > shown.length
                  ? '<button type="button" class="today__more" id="today-more">alle '
                    + others.length + ' zeigen</button>' : '')
            : '');
    } else if (S.wet) {
      body = wetNoneHtml(m.id, ref);
    } else {
      /* Lieber zugeben, dass nichts Passendes dasteht, als etwas Schwaches
         vorschlagen. Der Weg in die Liste steht direkt darunter. */
      body = todayGesehen
        ? '<div class="today__none"><h3>Alles schon gesehen</h3><p>'
          + 'Für diesen Tagesabschnitt ' + (todayGesehen === 1
              ? 'ist der eine hinterlegte Ort'
              : 'sind alle ' + todayGesehen + ' hinterlegten Orte')
          + ' als gesehen markiert.'
          + (S.jum ? ' Der Schalter „Mit Jum“ schränkt zusätzlich ein.' : '')
          + '</p><button type="button" class="btn" id="today-seen">'
          + 'Trotzdem zeigen</button></div>'
        : '<div class="today__none"><h3>Hier steht nichts</h3><p>'
          + 'Für diesen Tagesabschnitt ist nichts hinterlegt.'
          + (S.jum ? ' Der Schalter „Mit Jum“ schränkt zusätzlich ein.' : '') + '</p></div>';
    }

    return head + weather + body + aheadHtml(m.id, ref)
      + '<button type="button" class="today__all" id="today-all">'
      + 'Alle ' + D.places.length + ' Orte durchsuchen'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg></button>';
  }

  /* Ein Blick nach vorn. Wer um 15:16 auf "Heute" geht, plant oft schon das
     Abendessen — bis v13 musste man dafuer erst den Abschnitt erraten. */
  function aheadHtml(mid, ref) {
    var i = momentIndex(mid);
    if (i >= MOMENTS.length - 1) return '';
    var nx = MOMENTS[i + 1];
    var list = todayList(nx.id, 0, nx.until, ref);
    if (!list.length) return '';
    return '<p class="today__lead">' + esc(nx.label === 'Abend' ? 'Abends dann' : nx.label + ' dann')
      + '</p><div class="today__smalls">' + smallHtml(list[0], ref) + '</div>';
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
            /* Die Liste enthält Objekte {title,text} und blanken Text
               nebeneinander — beides muss sauber rauskommen. */
            if (typeof m === 'string') {
              return '<div class="panel"><p class="panel__x">' + esc(m) + '</p></div>';
            }
            if (!m) return '';
            var title = has(m.title) ? String(m.title) : '';
            var text = has(m.text) ? String(m.text) : '';
            if (!title && !text) return '';
            return '<div class="panel">'
              + (title ? '<h3 class="panel__t">' + esc(title) + '</h3>' : '')
              + (text ? '<p class="panel__x">' + esc(text) + '</p>' : '')
              + '</div>';
          }).join('')
        + '</section>';
    }

    if (D.open_questions.length) {
      h += '<section class="section"><h2 class="section__h">Offene Punkte</h2>'
        + '<p class="section__lead">' + D.open_questions.length
        + ' ungeklärte Fakten — bewusst sichtbar statt versteckt.</p>'
        + D.open_questions.map(function (q) {
            /* Auch hier stehen Objekte und blanker Text nebeneinander. Bei
               reinem Text wird eine enthaltene Telefonnummer anklickbar. */
            if (typeof q === 'string') {
              var mt = /(\+?\d[\d\s/()-]{7,}\d)/.exec(q);
              var body = esc(q);
              if (mt) {
                var num = telHref(mt[1]);
                if (num) {
                  body = esc(q.slice(0, mt.index))
                    + '<a href="tel:' + esc(num) + '">' + esc(mt[1].trim()) + '</a>'
                    + esc(q.slice(mt.index + mt[1].length));
                }
              }
              return '<div class="panel panel--open"><p class="panel__x">' + body + '</p></div>';
            }
            if (!q) return '';
            var tel = has(q.contact) ? telHref(q.contact) : null;
            return '<div class="panel panel--open">'
              + (has(q.topic) ? '<h3 class="panel__t">' + esc(q.topic) + '</h3>' : '')
              + (has(q.status) ? '<p class="panel__x">' + esc(q.status) + '</p>' : '')
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
        + D.faktencheck.map(function (f) {
            var txt = typeof f === 'string' ? f
                    : (f && has(f.text) ? String(f.text)
                    : (f && has(f.claim) ? String(f.claim) : ''));
            return txt ? '<li><span>' + esc(txt) + '</span></li>' : '';
          }).join('')
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


  /* aria-modal="true" allein sagt es nur, es macht es nicht: ohne das Folgende
     wandert der Tabulator hinter dem Sheet weiter durch die Liste, und ein
     Screenreader liest sie mit. Sheet und Scrim liegen als Geschwister neben
     #app, also genuegt es, alles davor stillzulegen. inert kann Safari erst ab
     15.5, deshalb steht aria-hidden daneben und der Tab-Ring unten noch dazu —
     eine der drei Ebenen greift in jedem Fall. */
  var inertParts = null;

  function setInert(on) {
    if (!inertParts) {
      inertParts = [$('app'), document.querySelector('.skip')].filter(Boolean);
    }
    inertParts.forEach(function (el) {
      if (on) { el.setAttribute('inert', ''); el.setAttribute('aria-hidden', 'true'); }
      else { el.removeAttribute('inert'); el.removeAttribute('aria-hidden'); }
    });
  }

  var FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]),'
                + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /* Rueckfallebene fuer Engines ohne inert: am Ende des Sheets wieder vorn
     anfangen, statt in die Seite dahinter zu springen. */
  function trapTab(e) {
    if (e.key !== 'Tab') return;
    var sheet = $('sheet');
    /* hidden faellt erst nach dem 260-ms-Nachlauf. Wer das Sheet schliesst
       und sofort Tab drueckt, bekaeme den Fokus sonst in das gerade
       verschwindende Sheet zurueckgezogen — und danach steht er auf <body>,
       also nicht mehr an der Stelle in der Liste, von der er kam. Sobald
       geschlossen wird, hat die Falle nichts mehr zu halten. */
    if (sheet.hidden || sheetClosing) return;
    var list = Array.prototype.filter.call(sheet.querySelectorAll(FOCUSABLE), function (el) {
      return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
    });
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    var inside = sheet.contains(document.activeElement);
    if (e.shiftKey && (!inside || document.activeElement === first)) {
      e.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!e.shiftKey && (!inside || document.activeElement === last)) {
      e.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  /* Gemeinsamer Unterbau fuer Ort und Filter: Body-Fixierung, Scrim, Fokus,
     Wischen nach unten und die iOS-Eigenheiten stecken hier — und nur hier.
     Ein zweites Sheet daneben wuerde die Haertung ein zweites Mal brauchen. */
  /* Ohne Verlaufseintrag verlaesst die Zurueck-Geste die App, statt das
     Sheet zu schliessen — auf Android und in der iOS-PWA ein echter
     Ausstiegspunkt. popstate schliesst, closeSheet() raeumt den Eintrag ab. */
  var sheetPushed = false;
  /* Das Ausblenden laeuft 260 ms nach. Ohne diese beiden bleibt ein alter
     Timer stehen und blendet ein inzwischen neu geoeffnetes Sheet wieder aus. */
  var sheetTimer = null;
  var sheetClosing = false;

  function pushSheetState() {
    if (sheetPushed) return;
    try { history.pushState({ pkSheet: true }, ''); sheetPushed = true; }
    catch (e) { sheetPushed = false; }
  }

  function popSheetState() {
    if (!sheetPushed) return;
    sheetPushed = false;
    try { history.back(); } catch (e) { /* egal */ }
  }

  function showSheet(html, cls) {
    /* setInert() legt #app still, und #inbox liegt darin. Ein offenes
       Rueckgaengig-Angebot waere hinter dem Sheet sichtbar, aber nicht mehr
       antippbar -- ein toter Knopf ist schlimmer als keiner. */
    if (rueck) { endeRueckgaengig(); $('inbox').hidden = true; }

    var sheet = $('sheet');
    /* Schliesst gerade eins und wird sofort das naechste geoeffnet, darf der
       noch laufende Timer das neue nicht mitnehmen. */
    if (sheetTimer !== null) { window.clearTimeout(sheetTimer); sheetTimer = null; }
    sheetClosing = false;

    lastFocus = document.activeElement;
    pushSheetState();

    sheet.className = 'sheet' + (cls ? ' ' + cls : '');
    $('sheet-body').innerHTML = html;

    lockBody();

    $('scrim').hidden = false;
    sheet.hidden = false;
    sheet.style.transform = '';
    $('sheet-body').scrollTop = 0;

    requestAnimationFrame(function () {
      $('scrim').classList.add('is-on');
      sheet.classList.add('is-on');
    });

    /* Erst stilllegen, dann den Fokus setzen: inert nimmt dem alten Element
       den Fokus von selbst, und er darf nicht im Nichts landen. */
    setInert(true);
    $('sheet-close').focus({ preventScroll: true });
  }

  function openSheet(id) {
    var p = null;
    for (var i = 0; i < D.places.length; i++) if (D.places[i].id === id) { p = D.places[i]; break; }
    if (!p) return;

    S.openId = id;
    S.filterOpen = false;
    showSheet(sheetHtml(p), accentClass(p.category));
  }

  function openFilterSheet() {
    S.openId = null;
    S.filterOpen = true;
    showSheet(filterSheetHtml(), 'sheet--filter');
    renderCount();          // die Trefferzahl steht sonst erst nach dem ersten Tipp da
  }

  function closeSheet(fromPop) {
    var sheet = $('sheet');
    /* Wer ueber den Hintergrund oder die Zurueck-Geste schliesst, hat das
       Notizfeld nie verlassen -- change waere nie gefeuert. */
    var feld = sheet.querySelector('[data-notiz]');
    if (feld) setzeNotiz(feld.getAttribute('data-notiz'), feld.value);
    /* popSheetState() ruft history.back(), das popstate ausloest — und zwar
       waehrend das Sheet noch sichtbar ist. Ohne diese Sperre laeuft der
       ganze Schliessvorgang ein zweites Mal. */
    if (sheet.hidden || sheetClosing) {
      if (fromPop === true) sheetPushed = false;
      return;
    }
    sheetClosing = true;
    /* Kam der Aufruf aus popstate, ist der Eintrag schon weg. Auf === true
       pruefen: onTap reicht sein Event als erstes Argument durch, und das
       waere truthy — der Eintrag bliebe stehen und die Zurueck-Geste tot. */
    if (fromPop === true) sheetPushed = false; else popSheetState();

    sheet.classList.remove('is-on', 'is-drag');
    sheet.style.transform = '';
    $('scrim').classList.remove('is-on');

    sheetTimer = window.setTimeout(function () {
      sheetTimer = null;
      sheetClosing = false;
      sheet.hidden = true;
      $('scrim').hidden = true;
      unlockBody();
    }, 260);

    var id = S.openId;
    var wasFilter = S.filterOpen;
    S.openId = null;
    S.filterOpen = false;

    /* Vor dem Zurückgeben des Fokus: in ein inertes Element hinein kann er
       nicht, der Aufruf würde still ins Leere laufen. */
    setInert(false);

    var back = id ? document.querySelector('[data-open="' + id.replace(/"/g, '\\"') + '"]') : null;
    if (wasFilter) back = $('chip-filter');
    if (back) back.focus({ preventScroll: true });
    else if (lastFocus && lastFocus.isConnected) lastFocus.focus({ preventScroll: true });
  }

  function row(label, value, soft) {
    if (!has(value)) return '';
    return '<dt>' + esc(label) + '</dt><dd' + (soft ? ' class="soft"' : '') + '>' + value + '</dd>';
  }

  /* Kachel Wert/Label. Weg, Dauer und Oeffnung sind die drei Fragen, die man
     vor Ort stellt — sie standen bis v10 als Zeilen in einer Definitionsliste
     mit 6,2rem breiter Label-Spalte, also mit dem Gewicht auf dem Label statt
     auf dem Wert. */
  function tile(value, label, cls) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '">'
      + '<span class="tile__v">' + value + '</span>'
      + '<span class="tile__l">' + esc(label) + '</span></div>';
  }

  /* Kurzform fuer die Kachel — bewusst strenger als hoursWindow(). Der liest
     zur Not auch ein Zeitfenster ("12:30–14 und 19:30–22") und nimmt davon
     das erste; als Kachel stuende dann "bis 14:00" ueber einem Restaurant,
     das abends bis 22 Uhr offen hat. Die Kachel zeigt deshalb nur ein
     ausgeschriebenes "bis" oder "ab"; alles andere steht im vollen Wortlaut
     darunter. */
  function hoursShort(h) {
    if (!has(h)) return null;
    var t = String(h), m;
    m = t.match(/bis\s*(?:ca\.\s*)?(\d{1,2})[:.](\d{2})/i);
    if (m) return 'bis ' + hhmm((+m[1]) * 60 + (+m[2]));
    m = t.match(/(?:^|[\s·,])(?:ab|\u00f6ffnet)\s*(\d{1,2})[:.](\d{2})/i);
    if (m) return 'ab ' + hhmm((+m[1]) * 60 + (+m[2]));
    return null;
  }

  /* Sagt der volle Wortlaut mehr als die Kachel? "oeffnet 9:30" sagt nichts,
     was "ab 9:30" nicht schon zeigt — "taeglich 18–23, Ruhetag Mittwoch"
     dagegen schon. Geprueft wird, ob ausser der einen Zeitangabe noch etwas
     uebrig bleibt. */
  function hoursAddsMore(h) {
    if (!has(h)) return false;
    if (!hoursShort(h)) return true;          // nichts lesbar -> voller Text zaehlt
    var rest = String(h)
      .replace(/^ge\u00f6ffnet\s+/i, '')
      .replace(/(?:^|[\s·,])(?:ab|\u00f6ffnet|bis)\s*(?:ca\.\s*)?\d{1,2}[:.]\d{2}/gi, '')
      .replace(/[\s.,;·–-]+/g, '');
    return rest.length > 0;
  }

  function tilesHtml(p) {
    var t = [];
    var hk = hereKm(p);
    if (hk !== null)          t.push(tile(esc(km(hk)), 'von hier'));
    else if (has(p.walk_min)) t.push(tile(p.walk_min + ' Min', 'zu Fuß'));
    else if (has(p.bike_min)) t.push(tile(p.bike_min + ' Min', 'mit dem Rad'));
    else if (has(p.distance_km)) t.push(tile(esc(km(p.distance_km)), 'entfernt'));

    if (has(p.time_min) || has(p.time_label)) {
      t.push(tile(esc(has(p.time_min) ? dur(p.time_min) : p.time_label), 'Aufenthalt'));
    }
    if (closedToday(p)) {
      /* "bis 22:30" ueber einem Lokal, das heute Ruhetag hat, waere die
         falscheste Kachel von allen. */
      t.push(tile('heute zu', 'Öffnung', 'tile--closed'));
    } else if (has(p.hours)) {
      /* Auf der Kachel steht nur, was sich sicher lesen laesst; der volle
         Wortlaut steht darunter, sofern er mehr sagt. Nie wird daraus
         "hat offen" abgeleitet. */
      var kurz = hoursShort(p.hours);
      if (kurz) t.push(tile(esc(kurz), 'Öffnung'));
    }
    return t.length ? '<div class="tiles">' + t.join('') + '</div>' : '';
  }

  /* Bei 58 von 101 Orten ist die Hundregel ungeklaert — das ist die haeufigste
     Antwort und darf kein kleingedrucktes "nicht geklaert" in einer Liste
     sein. Drei Zustaende, jeder mit eigener Farbe und eigenem Satz. */
  function dogHtml(p) {
    var state = p.dog === true ? 'yes' : p.dog === false ? 'no' : 'unknown';
    var text = { yes: 'Jum darf mit', no: 'Ohne Jum',
                 unknown: 'Nicht geklärt — vorher fragen' }[state];
    /* Drei Orte tragen eine Einschraenkung, die dog nicht ausdrueckt: in
       Sirmione ist nur die Burg tabu, auf der Isola gilt Leinenpflicht, auf
       dem Linienschiff faehrt er gratis. Der Badge bleibt dafuer in den
       Daten und steht hier — in der Zeile waere er neben "Jum ok" nur Laerm. */
    var zusatz = badgeKind(p) === 'dog' ? p.badge : null;
    return '<p class="dogrow dogrow--' + state + '">' + ICON.dog
      + '<span>' + esc(text)
      + (zusatz ? '<span class="dogrow__x">' + esc(zusatz) + '</span>' : '')
      + '</span></p>';
  }

  /* Direkt unter der Hundzeile, weil das die haeufigste offene Frage ist.
     Ein einzeiliges Feld, kein Speichernknopf: es sichert beim Verlassen und
     beim Schliessen des Sheets. Ein Knopf waere ein zweiter Schritt fuer
     etwas, das man im Vorbeigehen tippt. */
  function notizHtml(p) {
    var wert = S.notes[p.id] || '';
    return '<div class="notiz">'
      + '<label class="notiz__l" for="notiz-feld">Eigene Notiz</label>'
      + '<input type="text" class="notiz__f" id="notiz-feld" data-notiz="' + esc(p.id) + '"'
      + ' maxlength="140" autocomplete="off" enterkeyhint="done"'
      + ' placeholder="Was du hier erfahren hast"'
      + ' value="' + esc(wert) + '">'
      + '</div>';
  }

  function setzeNotiz(id, text) {
    var t = String(text == null ? '' : text).trim().slice(0, 140);
    if (t) S.notes[id] = t; else delete S.notes[id];
    lsSet(LS_NOTES, S.notes);
  }

  function sheetHtml(p) {
    var on = S.saved.indexOf(p.id) >= 0;
    var wasSeen = S.seen.indexOf(p.id) >= 0;
    var tel = has(p.phone) ? telHref(p.phone) : null;

    var dist = [];
    if (has(p.walk_min)) dist.push(p.walk_min + ' Min zu Fuß');
    if (has(p.bike_min)) dist.push(p.bike_min + ' Min mit dem Rad');
    if (has(p.distance_km)) dist.push(km(p.distance_km));

    var bk = badgeKind(p);
    var h = '<p class="sheet__cat">' + esc(catLabel(p.category))
      + (bk && bk !== 'dog' ? ' · ' + esc(p.badge) : '') + '</p>'
      + '<h2 class="sheet__name" id="sheet-name">' + esc(p.name) + '</h2>'
      + (has(p.rating)
          ? '<p class="sheet__rate">' + ICON.rating + nf1.format(p.rating)
            + (has(p.reviews) ? '<span class="sheet__rate-n">· ' + nf0.format(p.reviews)
                + ' Bewertungen</span>' : '') + '</p>'
          : '')
      + tilesHtml(p)
      + dogHtml(p)
      + notizHtml(p)
      + (has(p.note) ? '<p class="sheet__note">' + markiere(p.note) + '</p>' : '');

    /* Ein Primaer statt vierer gleich breiter Pillen; der Rest als Icon-Reihe
       darunter. Die Frage "wie weit, in welche Richtung" ist die einzige, die
       aus der App hinausfuehrt. */
    h += '<div class="sheet__acts">'
      + '<a class="btn btn--wide btn--primary" href="' + esc(mapsHref(p))
      + '" target="_blank" rel="noopener noreferrer">' + ICON.pin + 'Route in Karten</a>'
      + '<div class="actrow">'
      + '<button type="button" class="act" data-save="' + esc(p.id) + '" aria-pressed="'
      + (on ? 'true' : 'false') + '">' + ICON.star
      + '<span>' + (on ? 'Gemerkt' : 'Merken') + '</span></button>'
      + '<button type="button" class="act" data-seen="' + esc(p.id) + '" aria-pressed="'
      + (wasSeen ? 'true' : 'false') + '">' + ICON.checkRound
      + '<span>' + 'Gesehen' + '</span></button>'
      + (tel ? '<a class="act" href="tel:' + esc(tel) + '">' + ICON.phone
          + '<span>Anrufen</span></a>' : '')
      + '</div></div>';

    /* Adresse, Anfahrt und Tags werden gelesen, nachdem entschieden ist. */
    h += '<dl class="dl">'
      + (hoursAddsMore(p.hours) ? row('Öffnung', esc(p.hours)) : '')
      + (hereKm(p) !== null && dist.length
          ? row('Ab dem Zeltplatz', esc(dist.join(' · ')))
          : dist.length > 1 ? row('Entfernung', esc(dist.join(' · '))) : '')
      + (has(p.address) ? row('Adresse', esc(p.address)) : '')
      + (tel ? row('Telefon', '<a href="tel:' + esc(tel) + '">' + esc(p.phone) + '</a>') : '')
      + '</dl>';

    if (has(p.connection)) {
      h += '<p class="sheet__conn"><b>Anfahrt</b>' + esc(p.connection) + '</p>';
    }

    /* Tippbare Tags: bis v10 toter Text. Das ist der natuerlichste Weg von
       "das gefaellt mir" zu "mehr davon". */
    if (p.tags.length) {
      h += '<p class="fgroup__h">Mehr dieser Art</p><div class="tagpick">'
        + p.tags.map(function (t) {
            return '<button type="button" class="chip chip--tag" data-tagjump="' + esc(t) + '">'
              + esc(t) + '</button>';
          }).join('') + '</div>';
    }

    return h;
  }

  /* ------------------------------------------------------------- Merkliste */

  function toggleSeen(id) {
    toggleIn(S.seen, id);
    lsSet(LS_SEEN, S.seen);

    var now = S.seen.indexOf(id) >= 0;
    var btns = document.querySelectorAll('[data-seen="' + id.replace(/"/g, '\\"') + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', now ? 'true' : 'false');
      var sr = btns[i].querySelector('.sr-only');
      if (sr) sr.textContent = now ? 'Als noch nicht gesehen markieren' : 'Als gesehen markieren';
      if (btns[i].classList.contains('btn')) {
        btns[i].innerHTML = ICON.checkRound + (now ? 'Gesehen — zurücknehmen' : 'Als gesehen markieren');
      } else if (btns[i].classList.contains('act')) {
        /* Der Text bleibt, den Zustand traegt aria-pressed samt Farbe. */
        btns[i].innerHTML = ICON.checkRound + '<span>Gesehen</span>';
      }
    }

    /* Karte direkt nachziehen statt die ganze Liste neu zu bauen — sonst
       springt die Ansicht und der Fokus geht verloren. */
    var mark = document.querySelector('.card [data-seen="' + id.replace(/"/g, '\\"') + '"]');
    var art = mark ? mark.closest('.card') : null;
    if (art) {
      art.classList.toggle('card--seen', now);
      var meta = art.querySelector('.card__meta');
      var badge = art.querySelector('.card__seen');
      if (now && meta && !badge) {
        badge = document.createElement('span');
        badge.className = 'card__seen';
        badge.innerHTML = ICON.check + 'Gesehen';
        meta.appendChild(badge);
      } else if (!now && badge) {
        badge.remove();
      }
    }

    /* Im Filter "Noch nicht gesehen" verschwindet der Eintrag sofort */
    if (S.unseen && now) { closeSheet(); render(); }
    else { syncChips(); renderCount(); renderShareBar(); }
  }

  function toggleSave(id) {
    toggleIn(S.saved, id);
    lsSet(LS_SAVED, S.saved);
    syncTabs();
    renderShareBar();

    /* Sichtbare Schalter aktualisieren, ohne die Liste neu zu bauen */
    var on = S.saved.indexOf(id) >= 0;
    var btns = document.querySelectorAll('[data-save="' + id.replace(/"/g, '\\"') + '"]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      var sr = btns[i].querySelector('.sr-only');
      if (sr) sr.textContent = on ? 'Aus der Merkliste entfernen' : 'Merken';
      if (btns[i].classList.contains('btn')) {
        btns[i].innerHTML = ICON.star + (on ? 'Gemerkt — entfernen' : 'Merken');
      } else if (btns[i].classList.contains('act')) {
        btns[i].innerHTML = ICON.star + '<span>' + (on ? 'Gemerkt' : 'Merken') + '</span>';
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

  /* ------------------------------------------------------------ Teilen */

  /* Die Listen stecken nur im Browser — ein Server existiert nicht. Zum
     Abgleich zwischen zwei Geräten wandern sie deshalb durch die Adresse
     selbst: {v,m,g} als base64url hinter #liste=. Keine Konten, nichts
     verlässt das Gerät außer über den Link, den man selbst verschickt. */

  function b64url(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function unb64url(str) {
    var s2 = str.replace(/-/g, '+').replace(/_/g, '/');
    while (s2.length % 4) s2 += '=';
    return decodeURIComponent(escape(atob(s2)));
  }

  function shareLink() {
    /* Nur Orte mit Notiz, sonst waechst der Link um 101 leere Eintraege.
       v bleibt 1: ein Empfaenger mit aelterer Fassung ignoriert n einfach,
       statt den ganzen Link zu verwerfen. */
    var payload = { v: 1, m: S.saved.slice(), g: S.seen.slice() };
    if (Object.keys(S.notes).length) payload.n = S.notes;
    var base = location.origin + location.pathname;
    return base + '#liste=' + b64url(JSON.stringify(payload));
  }

  function readIncoming() {
    var m = /[#&]liste=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    if (!m) return null;
    try {
      var data = JSON.parse(unb64url(m[1]));
      if (!data || data.v !== 1) return null;
      var known = {};
      D.places.forEach(function (p) { known[p.id] = true; });
      var keep = function (arr) {
        return (Array.isArray(arr) ? arr : []).filter(function (id) { return known[id]; });
      };
      var notizen = {};
      Object.keys(data.n || {}).forEach(function (id) {
        if (known[id] && String(data.n[id] || '').trim()) {
          notizen[id] = String(data.n[id]).slice(0, 140);
        }
      });
      return { m: keep(data.m), g: keep(data.g), n: notizen,
               dropped: ((data.m || []).length + (data.g || []).length)
                        - (keep(data.m).length + keep(data.g).length) };
    } catch (e) { return null; }
  }

  function clearHash() {
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch (e) { location.hash = ''; }
  }

  var incoming = null;
  /* "Meine ersetzen" ueberschrieb S.saved und S.seen sofort und ohne Rueckweg.
     Wer vierzehn Tage markiert hat und eine Reihe zu tief tippt, verlor alles.
     Eine Kopie plus ein Angebot auf Zeit genuegt -- kein neuer Zustand im
     Speicher, denn nach dem Neuladen ist das Angebot ohnehin vorbei.
     10 Sekunden: 2 wie bei flash() sind zu kurz, um in den Plan zu sehen, den
     Verlust zu bemerken und zurueckzukommen; nach 30 liest man den Kasten als
     neue Frage statt als Rueckweg. */
  var rueck = null;
  var rueckTimer = null;
  var RUECK_MS = 10000;

  function endeRueckgaengig() {
    if (rueckTimer) { clearTimeout(rueckTimer); rueckTimer = null; }
    rueck = null;
    var k = $('inbox-undo');
    if (k) k.hidden = true;
  }

  function showInbox() {
    incoming = readIncoming();
    if (!incoming) return;
    if (!incoming.m.length && !incoming.g.length) { clearHash(); return; }

    var parts = [];
    if (incoming.m.length) parts.push(incoming.m.length + ' gemerkte');
    if (incoming.g.length) parts.push(incoming.g.length + ' gesehene');
    $('inbox-x').textContent = 'Jemand hat dir ' + parts.join(' und ') + ' '
      + (incoming.m.length + incoming.g.length === 1 ? 'Ort' : 'Orte') + ' geschickt.'
      + (incoming.dropped ? ' ' + incoming.dropped + ' Einträge sind hier unbekannt und bleiben außen vor.' : '')
      + ' Zusammenführen behält deine eigenen Markierungen.';
    /* Ein neuer Link raeumt ein offenes Angebot ab -- sonst stuende
       "Rueckgaengig" neben einer Liste, auf die es sich nicht mehr bezieht. */
    endeRueckgaengig();
    $('inbox').hidden = false;
    $('inbox-merge').hidden = false;
    $('inbox-cancel').hidden = false;
    $('inbox-replace').hidden = false;
    /* Der destruktive Knopf nennt, was er kostet. */
    var eigene = S.saved.length + S.seen.length + Object.keys(S.notes).length;
    $('inbox-replace').textContent = eigene ? 'Meine ' + eigene + ' ersetzen' : 'Meine ersetzen';
    setView('orte');
    window.scrollTo(0, 0);
  }

  function applyIncoming(mode) {
    if (!incoming) return;
    var fremd = incoming.n || {};
    if (mode === 'replace') {
      rueck = { saved: S.saved.slice(), seen: S.seen.slice(),
                notes: JSON.parse(JSON.stringify(S.notes)) };
      S.saved = incoming.m.slice();
      S.seen = incoming.g.slice();
      S.notes = JSON.parse(JSON.stringify(fremd));
    } else {
      incoming.m.forEach(function (id) { if (S.saved.indexOf(id) < 0) S.saved.push(id); });
      incoming.g.forEach(function (id) { if (S.seen.indexOf(id) < 0) S.seen.push(id); });
      /* Beim Zusammenfuehren gewinnt die eigene Notiz: sie steht fuer etwas,
         das man selbst vor Ort erfahren hat. */
      Object.keys(fremd).forEach(function (id) { if (!S.notes[id]) S.notes[id] = fremd[id]; });
    }
    lsSet(LS_SAVED, S.saved);
    lsSet(LS_SEEN, S.seen);
    lsSet(LS_NOTES, S.notes);
    var zumRuecknehmen = rueck;
    dismissInbox();
    if (zumRuecknehmen) zeigeRueckgaengig(zumRuecknehmen);
    syncTabs();
    render();
  }

  /* Der Kasten bleibt stehen, aber nur noch mit diesem einen Knopf. Ein
     eigener Streifen waere ein zweites Bedienmuster fuer dieselbe Sache. */
  function zeigeRueckgaengig(stand) {
    rueck = stand;
    var weg = (stand.saved.length + stand.seen.length);
    $('inbox-x').textContent = 'Deine ' + weg + ' eigenen Markierungen sind ersetzt.';
    $('inbox-merge').hidden = true;
    $('inbox-cancel').hidden = true;
    $('inbox-replace').hidden = true;
    $('inbox-undo').hidden = false;
    $('inbox').hidden = false;
    window.scrollTo(0, 0);
    rueckTimer = setTimeout(function () {
      rueckTimer = null;
      rueck = null;
      $('inbox-undo').hidden = true;
      $('inbox').hidden = true;
    }, RUECK_MS);
  }

  function nimmZurueck() {
    if (!rueck) return;
    S.saved = rueck.saved.slice();
    S.seen = rueck.seen.slice();
    S.notes = JSON.parse(JSON.stringify(rueck.notes || {}));
    lsSet(LS_SAVED, S.saved);
    lsSet(LS_SEEN, S.seen);
    lsSet(LS_NOTES, S.notes);
    endeRueckgaengig();
    $('inbox').hidden = true;
    syncTabs();
    render();
  }

  function dismissInbox() {
    incoming = null;
    endeRueckgaengig();
    $('inbox').hidden = true;
    clearHash();
  }

  /* Aus "Gemerkt" wird ein Plan. Die Reihenfolge steckt schon in S.saved —
     das Feld ist ein Array und wird beim Merken hinten angehaengt; bis v13
     wurde sie nur nie benutzt, weil die Ansicht nach Entfernung sortierte.
     Der Teilen-Link traegt sie damit automatisch mit. */
  function planList() {
    return S.saved.map(function (id) {
      for (var i = 0; i < D.places.length; i++) if (D.places[i].id === id) return D.places[i];
      return null;
    }).filter(Boolean);
  }

  function movePlan(id, delta) {
    var i = S.saved.indexOf(id);
    var j = i + delta;
    if (i < 0 || j < 0 || j >= S.saved.length) return;
    S.saved.splice(j, 0, S.saved.splice(i, 1)[0]);
    lsSet(LS_SAVED, S.saved);
    render();
  }

  /* Luftlinie in km zwischen zwei Punkten {lat, lon}. Fehlt einer, kommt
     null zurueck — geraten wird nicht. */
  function airKmPoint(a, b) {
    if (!a || !b) return null;
    if (typeof a.lat !== 'number' || typeof a.lon !== 'number') return null;
    if (typeof b.lat !== 'number' || typeof b.lon !== 'number') return null;
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLon = (b.lon - a.lon) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad)
      * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  /* Zwischen zwei Orten — die Warnung im Plan. Wo geo fehlt (29 von 101),
     bleibt die Zeile weg statt zu raten. */
  function airKm(a, b) {
    return airKmPoint(a && a.geo, b && b.geo);
  }

  /* Vom Geraetestandort zu einem Ort. Ohne Standort oder ohne geo: null.
     Aus der Luftlinie wird nie eine Gehzeit — der Weg ums Becken herum ist
     nicht die Strecke darueber, und diese App raet nicht. */
  function hereKm(p) {
    return S.here ? airKmPoint(S.here, p && p.geo) : null;
  }

  /* Der Standort kommt vom Geraet, nicht von einem Dienst: er funktioniert
     im Flugmodus, verlaesst das Geraet nicht und braucht kein Konto — derselbe
     Grundsatz, mit dem das Wetter gefragt statt abgerufen wird. Gefragt wird
     erst auf Tippen, nie beim Start. */
  function toggleHere() {
    if (S.here || S.hereState === 'wait') {
      S.here = null;
      S.hereState = 'off';
      render();
      return;
    }
    if (!navigator.geolocation) { S.hereState = 'failed'; render(); return; }
    S.hereState = 'wait';
    render();
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.here = { lat: pos.coords.latitude, lon: pos.coords.longitude, at: Date.now() };
      S.hereState = 'on';
      render();
    }, function (err) {
      S.here = null;
      /* 1 ist PERMISSION_DENIED. Der Unterschied zaehlt: das eine laesst sich
         in den Einstellungen aendern, das andere nicht. */
      S.hereState = (err && err.code === 1) ? 'denied' : 'failed';
      render();
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  function hereAt() {
    if (!S.here) return '';
    var d = new Date(S.here.at);
    return hhmm(d.getHours() * 60 + d.getMinutes());
  }

  function noGeoCount() {
    return D.places.filter(function (p) { return !p.geo; }).length;
  }

  /* Was der Standort kostet und bringt, steht unter dem Knopf — dieselbe
     Auskunft, die "Zu Fuss" ueber seine 53 fehlenden Gehzeiten gibt. */
  function hereNote() {
    var ohne = noGeoCount() + ' der ' + D.places.length
      + ' Orte haben keine Koordinaten und stehen dann hinten.';
    if (S.hereState === 'wait') return 'Der Standort wird bestimmt…';
    if (S.hereState === 'denied') {
      return 'Der Browser hat den Standort verweigert. Das lässt sich in den '
        + 'Einstellungen für diese Seite wieder erlauben.';
    }
    if (S.hereState === 'failed') {
      return 'Der Standort war nicht zu bestimmen. Noch einmal versuchen.';
    }
    if (S.here) {
      return 'Gemessen ab dem Standort von ' + hereAt() + ', Luftlinie statt Gehzeit. '
        + 'Nochmal tippen misst wieder ab dem Zeltplatz. ' + ohne;
    }
    return 'Alle Entfernungen gelten ab dem Zeltplatz. Mit dem Standort misst '
      + 'die Liste ab hier — Luftlinie, keine Gehzeit. Er kommt vom Gerät, wird '
      + 'nicht gespeichert und verlässt es nicht. ' + ohne;
  }

  var PLAN_FAR = 1.2;   // ab hier ist der Weg zwischen zwei Stationen erwaehnenswert

  function planHtml() {
    var list = planList();
    if (!list.length) return '';

    var stay = 0, walk = 0, stayN = 0, walkN = 0;
    list.forEach(function (p) {
      if (has(p.time_min)) { stay += p.time_min; stayN++; }
      if (has(p.walk_min)) { walk += p.walk_min; walkN++; }
    });

    /* Die Summe sagt dazu, worauf sie sich stuetzt — sonst liest sie sich
       als Gesamtzeit, obwohl Orte ohne Wert fehlen. */
    var sum = '<p class="plan__sum">' + list.length + (list.length === 1 ? ' Ort' : ' Orte')
      + (stayN ? ' · ' + esc(dur(stay)) + ' Aufenthalt'
          + (stayN < list.length ? ' (' + stayN + ' von ' + list.length + ')' : '') : '')
      + (walkN ? ' · ' + esc(dur(walk)) + ' Weg'
          + (walkN < list.length ? ' (' + walkN + ' von ' + list.length + ')' : '') : '')
      + '</p>';

    var rows = list.map(function (p, i) {
      var seen = S.seen.indexOf(p.id) >= 0;
      var h = '<div class="planrow' + (seen ? ' planrow--seen' : '') + ' ' + accentClass(p.category) + '">'
        + '<span class="planrow__n">' + (i + 1) + '</span>'
        + '<button type="button" class="planrow__open" data-open="' + esc(p.id) + '">'
        + '<span class="planrow__name">' + esc(p.name) + '</span>'
        + '<span class="planrow__m">' + esc(catLabel(p.category))
        + (has(p.walk_min) ? ' · ' + p.walk_min + ' Min Weg' : '')
        + (has(p.time_min) ? ' · ' + esc(dur(p.time_min)) : '')
        + (seen ? ' · gesehen' : '') + '</span></button>'
        + '<span class="planrow__move">'
        + '<button type="button" class="pmove" data-up="' + esc(p.id) + '"'
        + (i === 0 ? ' disabled' : '') + ' aria-label="' + esc(p.name) + ' nach oben">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14l6-6 6 6"/></svg></button>'
        + '<button type="button" class="pmove" data-down="' + esc(p.id) + '"'
        + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="' + esc(p.name) + ' nach unten">'
        + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 10l6 6 6-6"/></svg></button>'
        + '</span></div>';

      var d = airKm(p, list[i + 1]);
      if (d !== null && d >= PLAN_FAR) {
        h += '<p class="plan__far">' + ICON.warn + 'Zwischen ' + (i + 1) + ' und ' + (i + 2)
          + ' liegen ' + esc(km(d)) + ' Luftlinie.</p>';
      }
      return h;
    }).join('');

    return sum + '<div class="plan">' + rows + '</div>';
  }

  function renderShareBar() {
    var bar = $('sharebar');
    if (S.view !== 'gemerkt') { bar.hidden = true; return; }
    bar.hidden = false;
    var n = S.saved.length, g = S.seen.length;
    $('sharebar-t').textContent = n || g
      ? n + ' im Plan · ' + g + ' gesehen'
      : 'Noch nichts markiert';
    var btn = $('share-btn');
    btn.hidden = !(n || g);
    btn.innerHTML = ICON.share + 'Teilen';
  }

  function doShare() {
    var url = shareLink();
    var txt = 'Meine Liste aus Peschiera kompakt';
    var fallback = function () {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { flash('Link kopiert'); },
                                               function () { prompt('Link kopieren:', url); });
      } else {
        window.prompt('Link kopieren:', url);
      }
    };
    if (navigator.share) {
      navigator.share({ title: 'Peschiera kompakt', text: txt, url: url })
        .catch(function (err) { if (!err || err.name !== 'AbortError') fallback(); });
    } else {
      fallback();
    }
  }

  function flash(msg) {
    var b = $('share-btn');
    var keep = b.innerHTML;
    b.textContent = msg;
    window.setTimeout(function () { b.innerHTML = keep; }, 2000);
  }

  /* --------------------------------------------------------- Offline / SW */

  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    try {
      /* Uebernimmt eine neue Fassung die Steuerung, laedt die Seite einmal neu.
         Ohne das sah man nach einem Deploy noch den alten Stand und musste von
         Hand zweimal neu laden. Bei der Erstinstallation waere ein Reload
         unnoetig, deshalb die Abfrage auf hadController. */
      var hadController = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController) return;
        try {
          if (sessionStorage.getItem('pk.reloaded')) return;
          sessionStorage.setItem('pk.reloaded', '1');
        } catch (e) { /* ohne sessionStorage einmal mehr neu laden ist ok */ }
        location.reload();
      });

      navigator.serviceWorker.register('./sw.js').then(function (reg) {
        var check = function () {
          try { reg.update(); } catch (e) {}
          checkCacheVersion();
        };
        check();
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) check();
        });
      }).catch(function () { /* nicht kritisch */ });
    } catch (e) { /* nicht kritisch */ }
  }

  /* Nicht null, sobald der Worker einen anderen Stand meldet als diese Datei. */
  var swMismatch = null;

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
    el.innerHTML = esc(standTxt + (off
      ? 'Offline — angezeigt werden die gespeicherten Daten.'
      : cached ? 'Offline verfügbar.' : '')
      + '  ·  App ' + VERSION)
      + (swMismatch
          ? '<span class="foot__warn">Offline-Speicher steht auf ' + esc(swMismatch.sw)
            + ', die App auf ' + esc(swMismatch.app)
            + '. Beim Bauen wurde ein Sprung vergessen — einmal neu laden, dann stimmt es wieder.</span>'
          : '');
  }

  /* Fragt den Worker nach seinem Cache-Namen und vergleicht nur die Marke
     davor: 'peschiera-v16' gegen 'v16 · 2026-09-18' ist gleich, das Datum
     dahinter zaehlt nicht mit. */
  function checkCacheVersion() {
    if (!('serviceWorker' in navigator) || !window.MessageChannel) return;
    var ctrl = navigator.serviceWorker.controller;
    if (!ctrl) return;
    try {
      var ch = new MessageChannel();
      ch.port1.onmessage = function (ev) {
        var cache = ev.data && ev.data.cache;
        if (!cache) return;
        var sw = String(cache).replace(/^peschiera-/, '');
        var app = String(VERSION).split(/[\s·]/)[0];
        swMismatch = sw === app ? null : { sw: sw, app: app };
        updateOfflineNote();
      };
      ctrl.postMessage({ q: 'version' }, [ch.port2]);
    } catch (e) { /* ohne Antwort bleibt es beim bisherigen Text */ }
  }

  /* ---------------------------------------------------------------- Events */

  function bind() {
    $('theme-btn').addEventListener('click', cycleTheme);
    $('jum-btn').addEventListener('click', toggleJum);

    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onMq = function () { if (S.theme === 'auto') applyTheme(); };
      if (mq.addEventListener) mq.addEventListener('change', onMq);
      else if (mq.addListener) mq.addListener(onMq);
    }

    $('q').addEventListener('input', function () {
      S.q = $('q').value.trim();
      if (S.view === 'heute' && S.q) { setView('orte'); return; }   // setView rendert selbst
      render();
    });
    $('q').addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('q').value) { e.stopPropagation(); $('q').value = ''; S.q = ''; render(); }
    });
    /* Tastatur offen -> Tableiste weg (siehe style.css). */
    $('q').addEventListener('focus', function () {
      document.body.classList.add('is-typing');
      /* Wer auf "Heute" ins Suchfeld greift, will in den Bestand. */
      if (S.view === 'heute') setView('orte');
    });
    $('q').addEventListener('blur', function () { document.body.classList.remove('is-typing'); });

    $('q-clear').addEventListener('click', function () {
      $('q').value = ''; S.q = ''; render(); $('q').focus();
    });

    $('filters').addEventListener('click', function (e) {
      if (e.target.closest('#chip-filter')) { openFilterSheet(); return; }
      /* Zwei Sortierungen brauchen keine dauerhafte Segmentleiste — ein Knopf,
         der seinen aktuellen Stand nennt und beim Tippen umschaltet. */
      if (e.target.closest('#map-btn')) {
        S.map = !S.map;
        render();
        return;
      }
      if (e.target.closest('#sort-btn')) {
        S.sort = S.sort === 'rating' ? 'distance' : 'rating';
        render();
        return;
      }
      var off = e.target.closest('[data-off]');
      if (off) { offFilter(off.getAttribute('data-off')); render(); }
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
      var up = e.target.closest('[data-up]');
      if (up) { e.preventDefault(); movePlan(up.getAttribute('data-up'), -1); return; }
      var down = e.target.closest('[data-down]');
      if (down) { e.preventDefault(); movePlan(down.getAttribute('data-down'), 1); return; }
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); return; }
      var seen = e.target.closest('[data-seen]');
      if (seen) { e.preventDefault(); toggleSeen(seen.getAttribute('data-seen')); return; }
      var card = e.target.closest('.card');
      if (!card) return;
      var open = card.querySelector('[data-open]');
      if (open) openSheet(open.getAttribute('data-open'));
    });

    $('sheet-body').addEventListener('click', function (e) {
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); return; }
      var seen = e.target.closest('[data-seen]');
      if (seen) { e.preventDefault(); toggleSeen(seen.getAttribute('data-seen')); return; }

      /* Filter-Sheet: die Liste dahinter zieht sofort nach, das Sheet bleibt
         offen. Die Zahl am Tag-Knopf zeigt, wie viele Tags aktiv sind. */
      /* Tag aus dem Detail-Sheet: setzt den Filter, schliesst und zeigt die
         Liste. Ersetzt die bisherige Auswahl, statt sie zu erweitern — wer
         auf "fisch" tippt, will Fisch sehen, nicht Fisch dazu. Der Suchbegriff
         geht mit weg: sonst steht ueber dem Ergebnis "1 von 101", weil die
         alte Suche noch mitfiltert, und niemand sieht warum. */
      var jump = e.target.closest('[data-tagjump]');
      if (jump) {
        e.preventDefault();
        S.tags = [jump.getAttribute('data-tagjump')];
        S.cats = [];
        S.q = '';
        $('q').value = '';
        closeSheet();
        /* setView kehrt sofort um, wenn die Liste schon offen ist — dann
           scrollt niemand nach oben, und der Treffer steht irgendwo. */
        if (S.view === 'orte') { render(); window.scrollTo(0, 0); }
        else setView('orte');
        return;
      }
      var cat = e.target.closest('[data-cat]');
      if (cat) {
        e.preventDefault();
        toggleIn(S.cats, cat.getAttribute('data-cat'));
        render();
        return;
      }
      var flag = e.target.closest('[data-flag]');
      if (flag) {
        e.preventDefault();
        var k = flag.getAttribute('data-flag');
        if (k === 'walk') S.walk = !S.walk;
        else if (k === 'short') S.short = !S.short;
        else if (k === 'unseen') S.unseen = !S.unseen;
        render();
        return;
      }
      var tag = e.target.closest('[data-tag]');
      if (tag) {
        e.preventDefault();
        toggleIn(S.tags, tag.getAttribute('data-tag'));
        render();
        return;
      }
      if (e.target.closest('#here-btn')) { e.preventDefault(); toggleHere(); return; }
      if (e.target.closest('#filter-clear')) { resetFilters(); return; }
      if (e.target.closest('#filter-done')) { closeSheet(); }
    });

    /* Das Feld steht im Sheet und lebt nur, solange es offen ist. */
    $('sheet-body').addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'tag-q') return;
      var pick = $('tagpick');
      if (pick) pick.innerHTML = tagChipsHtml(e.target.value);
    });

    $('empty-reset').addEventListener('click', resetFilters);

    window.addEventListener('scroll', onScroll, { passive: true });

    $('today').addEventListener('click', function (e) {
      if (e.target.closest('#today-all')) { setView('orte'); return; }
      var seg = e.target.closest('[data-mid]');
      if (seg) {
        S.mid = seg.getAttribute('data-mid');
        S.pick = 0; S.moreOpen = false; S.seenOk = false;
        render(); window.scrollTo(0, 0);
        return;
      }
      if (e.target.closest('#today-more')) { S.moreOpen = true; render(); return; }
      /* Nur fuer diesen Abschnitt und nur bis zum naechsten Wechsel --
         eine dauerhafte Ausnahme waere eine stille Voreinstellung. */
      if (e.target.closest('#today-seen')) { S.seenOk = true; render(); return; }
      if (e.target.closest('#today-next')) { S.pick += 1; render(); return; }
      if (e.target.closest('#today-prev')) { S.pick = S.pick > 0 ? S.pick - 1 : 0; render(); return; }
      if (e.target.closest('#wx-dry')) { setWet(false); return; }
      if (e.target.closest('#wx-wet')) { setWet(true); return; }
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); render(); return; }
      var open = e.target.closest('[data-open]');
      if (open) openSheet(open.getAttribute('data-open'));
    });

    onTap($('scrim'), function () { closeSheet(); });
    onTap($('sheet-close'), function () { closeSheet(); });

    /* change feuert beim Verlassen des Feldes, auch wenn iOS die Tastatur
       ueber "Fertig" schliesst. Zusaetzlich beim Schliessen des Sheets --
       wer ueber den Hintergrund schliesst, hat das Feld nie verlassen. */
    $('sheet-body').addEventListener('change', function (e) {
      var f = e.target.closest && e.target.closest('[data-notiz]');
      if (f) { setzeNotiz(f.getAttribute('data-notiz'), f.value); render(); }
    });

    window.addEventListener('popstate', function () {
      if (!$('sheet').hidden) closeSheet(true);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('sheet').hidden) { closeSheet(); return; }
      trapTab(e);
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

    $('share-btn').addEventListener('click', doShare);

    /* Ein Link auf dieselbe Adresse ändert nur den Anker — die Seite lädt
       dann nicht neu, und start() läuft nicht noch einmal. Ohne das hier
       passiert nichts, wenn die App beim Antippen des Links schon offen ist. */
    window.addEventListener('hashchange', showInbox);

    $('inbox-merge').addEventListener('click', function () { applyIncoming('merge'); });
    $('inbox-replace').addEventListener('click', function () { applyIncoming('replace'); });
    $('inbox-cancel').addEventListener('click', dismissInbox);
    $('inbox-undo').addEventListener('click', nimmZurueck);

    window.addEventListener('online', updateOfflineNote);
    window.addEventListener('offline', updateOfflineNote);

    if (window.ResizeObserver) {
      try { new ResizeObserver(measureBar).observe(document.querySelector('.bar')); }
      catch (e) { window.addEventListener('resize', measureBar); }
    } else {
      window.addEventListener('resize', measureBar);
    }
  }

  /* ------------------------------------------------------------- Pruefstand */

  /* Die Helfer in "Heute" lesen Freitext: Öffnungszeiten, Termine im Badge,
     den Reisezeitraum im Untertitel. Genau diese Sorte Code liegt bei einem
     neuen Datensatz still falsch, ohne Fehlermeldung. scripts/test-logic.mjs
     laedt diese Datei mit node und prueft sie — dafuer muss es sie erreichen.
     Im Browser gibt es kein `module`, dort passiert hier also nichts. */
  /* ------------------------------------------------------------- Karte */

  /* Leaflet liegt unter vendor/ im Repo -- kein Laufzeit-Request an einen
     fremden Server, wie ueberall hier. Geladen wird es trotzdem erst beim
     ersten Oeffnen der Karte: 162 kB beim Start zu zahlen fuer eine Ansicht,
     die man vielleicht nie aufmacht, waere die falsche Reihenfolge. */
  var karte = null, marker = [], leafletLaedt = null;

  function ladeLeaflet() {
    if (window.L) return Promise.resolve(true);
    if (leafletLaedt) return leafletLaedt;
    leafletLaedt = new Promise(function (fertig) {
      var css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = './vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = './vendor/leaflet/leaflet.js';
      js.onload = function () { fertig(!!window.L); };
      js.onerror = function () { fertig(false); };
      document.head.appendChild(js);
    });
    return leafletLaedt;
  }

  function mapNote(txt) {
    var el = $('map-note');
    if (!el) return;
    el.textContent = txt || '';
    el.hidden = !txt;
  }

  function zeigeKarte(orte) {
    ladeLeaflet().then(function (da) {
      if (!da) {
        $('map').hidden = true;
        mapNote('Die Karte lässt sich nicht laden. Die Liste zeigt dieselben Orte.');
        return;
      }
      var base = D.meta && D.meta.base_geo;
      if (!karte) {
        karte = window.L.map('map', { zoomControl: true, attributionControl: true });
        window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(karte);
        karte.setView(base ? [base.lat, base.lon] : [45.44, 10.69], 13);
        /* Der Zeltplatz als fester Bezugspunkt -- ohne ihn weiss man nicht,
           von wo die Entfernungen in der Liste gelten. */
        if (base) {
          window.L.marker([base.lat, base.lon], {
            icon: window.L.divIcon({ className: 'mk mk--base', html: '<span></span>',
                                     iconSize: [18, 18] })
          }).addTo(karte).bindTooltip('Zeltplatz');
        }
      }

      marker.forEach(function (m) { karte.removeLayer(m); });
      marker = [];
      var mitGeo = orte.filter(function (p) { return p.geo; });
      mitGeo.forEach(function (p) {
        var m = window.L.marker([p.geo.lat, p.geo.lon], {
          icon: window.L.divIcon({
            className: 'mk ' + accentClass(p.category)
              + (S.seen.indexOf(p.id) >= 0 ? ' mk--seen' : ''),
            html: '<span></span>', iconSize: [16, 16]
          }),
          title: p.name
        });
        m.on('click', function () { openSheet(p.id); });
        m.addTo(karte);
        marker.push(m);
      });

      if (mitGeo.length) {
        karte.fitBounds(window.L.latLngBounds(mitGeo.map(function (p) {
          return [p.geo.lat, p.geo.lon];
        })).pad(0.15), { maxZoom: 16 });
      }
      karte.invalidateSize();

      var ohne = orte.length - mitGeo.length;
      mapNote(!orte.length
        ? 'Kein Ort passt zu den Filtern.'
        : (ohne ? ohne + (ohne === 1 ? ' Ort hat keine Koordinate und fehlt hier.'
                                     : ' Orte haben keine Koordinate und fehlen hier.') : ''));
    });
  }

  if (typeof module === 'object' && module && module.exports) {
    module.exports = {
      hoursWindow: hoursWindow, closedOn: closedOn, closedToday: closedToday,
      airKmPoint: airKmPoint,
      momentsOf: momentsOf, momentNow: momentNow,
      runsToday: runsToday, daysUntil: daysUntil, tripDay: tripDay, unverified: unverified,
      closingSoon: closingSoon, fitsLeft: fitsLeft, indoorOf: indoorOf,
      dur: dur, km: km, norm: norm, haystack: haystack,
      byDistance: byDistance, byRating: byRating,
      grundmenge: grundmenge, markiere: markiere, normStellen: normStellen,
      /* Zustand von aussen setzbar, damit die Pruefungen ohne Browser laufen. */
      useState: function (teil) { for (var k in teil) S[k] = teil[k]; },
      useData: function (roh) { D = roh; },
      MOMENTS: MOMENTS, WALK_MAX: WALK_MAX, SHORT_MAX: SHORT_MAX,
      /* tripDay liest den Untertitel aus den geladenen Daten. */
      useMeta: function (meta) { D = { meta: meta || {} }; }
    };
    return;                     // im Pruefstand nicht booten
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
