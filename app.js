/* ==========================================================================
   Peschiera kompakt — app.js

   Vanilla, kein Modul (damit file:// eine Chance hat), kein Build.
   Alle Inhalte kommen aus data/places.json — hier stehen keine Ortsdaten.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = 'v38 · 2026-09-21';   /* muss zu CACHE in sw.js passen */
  var DATA_URL = './data/places.json';
  /* Das Wissen liegt seit v38 in einer eigenen Datei. Bis v37 standen die
     drei Listen ("Gut zu wissen", "Offene Punkte", Faktencheck) IN
     places.json -- einer Datei, die sonst nur Orte enthaelt. Die Suche fand
     sie deshalb nie: sie geht ueber Orte, und das Wissen war keiner.
     "Darf Jum in den Zug?" liess sich nicht suchen, obwohl die Antwort in
     der App steht. */
  var WISSEN_URL = './data/wissen.json';
  var LS_SAVED = 'pk.saved';
  var LS_SEEN  = 'pk.seen';
  var LS_NOTES = 'pk.notes';
  var LS_THEME = 'pk.theme';
  var LS_JUM   = 'pk.jum';
  var LS_DAYS  = 'pk.days';  // { ortId: 'JJJJ-MM-TT' } — die Tageszuordnung im Plan
  /* Was ihr vor Ort ueber die Hundregel erfahren habt. Liegt bewusst NICHT
     in places.json: der Katalog ist die Recherche, das hier ist eure eigene
     Beobachtung -- dieselbe Trennung, die schon fuer pk.notes gilt. Sie
     ueberschreibt den Katalog und faehrt beim Teilen mit.
       { ortId: { v: true|false, at: 'JJJJ-MM-TTTHH:MM' } }                */
  var LS_DOG   = 'pk.dog';
  /* Womit ein Tag zurueckgelegt wird: { 'JJJJ-MM-TT': 'fuss'|'rad'|'auto' }.
     Nur was ABWEICHT steht drin -- der Vorschlag kommt aus dem groessten
     Sprung der Kette und braucht keinen Eintrag. */
  var LS_MODE  = 'pk.mode';
  var SS_WET   = 'pk.wet';    // Wetter gilt fuer diesen Besuch, nicht fuer immer
  var WALK_MAX = 25;          // Schwelle für den Filter "Zu Fuß"
  var SHORT_MAX = 60;         // Schwelle für den Filter "Unter 1 h"

  /* ---------------------------------------------------------------- Zustand */

  var D = null;               // geladene Daten
  var catById = {};
  /* Das Wissen aus data/wissen.json. undefined = laedt noch, null = nicht
     erreichbar, sonst { meta, gruppen, eintraege }. Drei Zustaende, weil die
     Ansicht fuer jeden etwas anderes sagen muss. */
  var W;

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
    /* Welcher Reisetag gerade als Sheet offen ist. Nur fuer die Dauer des
       Sheets -- nichts, was den Neustart ueberlebt. */
    dayOpen: null,
    /* Die Suche im Tages-Sheet. Sie geht ueber ALLE 101 Orte, nicht nur ueber
       den Vorrat: wer am Mittwoch etwas sucht, hat es in der Regel noch nicht
       gemerkt, und "erst merken, dann Tag waehlen" waeren zwei Schritte fuer
       einen Gedanken. Auch nur fuer die Dauer des Sheets. */
    daySuche: '',
    /* Der Suchbegriff im Wissen. Eigener Zustand, nicht S.q: die Ortssuche
       filtert eine Liste, diese hier eine andere Menge -- ein gemeinsames
       Feld hiesse, dass ein Begriff aus "Entdecken" im Wissen weiterwirkt,
       ohne dass man es sieht. */
    wq: '',
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
    /* Welcher Ort an welchem Reisetag drankommt. Bis v27 konnte der Plan nur
       eine Reihenfolge — fuer vierzehn Tage Reise ist eine einzige lange
       Liste kein Plan, sondern ein Stapel. Die Zuordnung bleibt eine ZUTAT
       der Merkliste, kein eigener Zustand: fliegt ein Ort aus dem Plan,
       bleibt sein Tag gespeichert und gilt wieder, wenn man ihn erneut
       merkt — ein Fehltipp auf den Stern kostet so keine Planung. */
    days: {},               // { id: 'JJJJ-MM-TT' }
    /* Die vor Ort geklaerten Hundregeln. Siehe LS_DOG. */
    dog: {},                // { id: { v: bool, at: iso } }
    /* Der gewaehlte Fortbewegungsmodus je Reisetag. Siehe LS_MODE. */
    mode: {},               // { 'JJJJ-MM-TT': 'fuss'|'rad'|'auto' }
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

  /* Der Ausschnitt um die Fundstelle.

     Die Beschreibung in der Liste ist eine Zeile hoch und wird hinten
     abgeschnitten -- das ist Absicht, jede Karte misst dadurch exakt 97 px
     und die Liste bleibt lesbar. Der Preis stand bis v24 als bekannter
     Kompromiss im Kommentar an cardHtml: liegt die Fundstelle hinter dem
     Schnitt, sieht man die Markierung erst im Detail.

     Nachgemessen ist der Preis hoch. Bei "hund" zeigten 12 von 16 Treffern
     nicht, warum sie Treffer sind, bei "see" 13 von 20, bei "wein" 9 von 15
     -- rund sechs von zehn. Man bekommt eine Liste und muss jede Karte
     einzeln oeffnen, um sie zu verstehen.

     Statt die Zeile zu verlaengern faengt sie jetzt vor dem Fund an. Gleiche
     Zeile, gleiche Hoehe, nur ein anderer Ausschnitt. VOR steht ein
     Auslassungszeichen, damit niemand den Anfang des Satzes fuer den ganzen
     haelt.

     Geschnitten wird an einer Wortgrenze: mitten im Wort zu beginnen liest
     sich wie ein Fehler. Ohne Grenze in Reichweite wird hart geschnitten --
     besser ein angeschnittenes Wort als der falsche Satzanfang. */
  var VORLAUF = 12;     // Zeichen Kontext vor dem Fund
  var AB_HIER = 24;     // erst ab dieser Fundstelle ueberhaupt verschieben

  function ausschnitt(text) {
    var roh = String(text == null ? '' : text);
    var terms = norm(S.q).split(/\s+/).filter(Boolean);
    if (!terms.length || !roh) return roh;

    var n = normStellen(roh), erste = -1;
    terms.forEach(function (t) {
      var i = n.text.indexOf(t);
      if (i >= 0 && (erste < 0 || n.map[i] < erste)) erste = n.map[i];
    });
    /* Steht der Fund ohnehin am Anfang, bleibt alles wie es war -- ein
       Auslassungszeichen vor dem zweiten Wort waere nur Rauschen. */
    if (erste < AB_HIER) return roh;

    var von = erste - VORLAUF;
    var luecke = roh.lastIndexOf(' ', von);
    if (luecke >= 0 && von - luecke <= 8) von = luecke + 1;
    return '…' + roh.slice(von);
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

  /* Der Suchtext eines Ortes -- Katalog PLUS eure eigene Notiz.

     Bis v37 ging die Suche nur ueber den Katalog. Wer "Tisch hinten links,
     Wassernapf kommt von selbst" notiert hatte, fand den Ort ueber
     "wassernapf" nicht -- obwohl genau das der Satz ist, an den man sich
     erinnert. Eine eigene Notiz ist das, was man SELBST herausgefunden hat;
     sie nicht zu durchsuchen war die schlechteste Stelle, sie wegzulassen.

     p._h liegt fertig aus dem Laden vor, die Notiz kommt aus _hn und wird
     nur beim Schreiben neu normalisiert -- nicht bei jedem Tastendruck. */
  var noteHay = {};
  function suchtext(p) {
    var n = noteHay[p.id];
    return n ? p._h + ' · ' + n : p._h;
  }
  function noteHayNeu() {
    noteHay = {};
    Object.keys(S.notes).forEach(function (id) { noteHay[id] = norm(S.notes[id]); });
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
    plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>',
    minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12h13"/></svg>',
    buch: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.6C10.5 5.2 8.2 4.6 5 4.6v13.2c3.2 0 5.5.6 7 2 1.5-1.4 3.8-2 7-2V4.6c-3.2 0-5.5.6-7 2z"/><path d="M12 6.6v13.2"/></svg>',
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

  function loadJson(url, done, fail) {
    /* 1. Versuch: fetch. Auf file:// blockieren Chrome und Safari das,
       deshalb 2. Versuch über XHR — das erlaubt Safari für lokale Dateien. */
    if (typeof fetch === 'function') {
      fetch(url, { cache: 'no-cache' }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(done, function () { xhr(url, done, fail); });
    } else {
      xhr(url, done, fail);
    }
  }

  function loadData(done, fail) { loadJson(DATA_URL, done, fail); }

  function xhr(url, done, fail) {
    try {
      var r = new XMLHttpRequest();
      r.open('GET', url, true);
      r.onload = function () {
        /* file:// liefert status 0 bei Erfolg */
        if (r.status === 0 || (r.status >= 200 && r.status < 300)) {
          try { done(JSON.parse(r.responseText)); }
          catch (e) { fail('Die Datei ' + url + ' ist kein gültiges JSON.'); }
        } else {
          fail(url + ' antwortete mit HTTP ' + r.status + '.');
        }
      };
      r.onerror = function () { fail(null); };
      r.send();
    } catch (e) { fail(null); }
  }

  function bootError(msg) {
    var local = location.protocol === 'file:';
    /* Das Geruest weg: es zeigt Karten, die es nicht geben wird. Der Kasten
       rueckt dabei in die Mitte, damit die Meldung nicht oben klebt. */
    $('boot').classList.add('boot--fehler');
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
    var rohTage = lsGet(LS_DAYS, {}) || {};
    S.days = {};
    Object.keys(rohTage).forEach(function (id) {
      if (ids[id] && /^\d{4}-\d{2}-\d{2}$/.test(String(rohTage[id] || ''))) {
        S.days[id] = String(rohTage[id]);
      }
    });

    var rohDog = lsGet(LS_DOG, {}) || {};
    S.dog = {};
    Object.keys(rohDog).forEach(function (id) {
      var e = rohDog[id];
      if (ids[id] && e && typeof e.v === 'boolean') {
        S.dog[id] = { v: e.v, at: typeof e.at === 'string' ? e.at : '' };
      }
    });

    var rohMode = lsGet(LS_MODE, {}) || {};
    S.mode = {};
    Object.keys(rohMode).forEach(function (iso) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)
          && ['fuss', 'rad', 'auto'].indexOf(rohMode[iso]) >= 0) {
        S.mode[iso] = rohMode[iso];
      }
    });

    var rohNotes = lsGet(LS_NOTES, {}) || {};
    S.notes = {};
    Object.keys(rohNotes).forEach(function (id) {
      if (ids[id] && String(rohNotes[id] || '').trim()) S.notes[id] = String(rohNotes[id]);
    });
    noteHayNeu();

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
    /* meta.hinweis, nicht meta.note. note ist die Provenienz-Doku der Daten
       -- Feldnamen, Messdaten, Rechenwege -- und stand bis v26 woertlich im
       Fuss der App. Auf dem Plan mit zwei Eintraegen dominierte ein Absatz
       ueber "distance_km" und "meta.base_geo" die halbe Ansicht. Der Fuss
       traegt jetzt den Satz, der den Nutzer betrifft; die Doku bleibt in den
       Daten und in der README. KEIN Rueckfall auf note: lieber eine leere
       Zeile als die Interna wieder beim Nutzer. */
    $('foot-note').textContent = has(D.meta.hinweis) ? D.meta.hinweis : '';

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
    ladeWissen();
  }

  /* Das Wissen kommt NACH den Orten und blockiert den Start nicht. Es ist
     wichtig, aber nicht so wichtig wie die Frage, was heute ansteht -- und
     eine App, die wegen einer zweiten Datei gar nicht startet, ist
     schlechter als eine, der eine Ansicht fehlt. Faellt sie aus, sagt die
     Ansicht das und bietet einen zweiten Versuch. */
  function ladeWissen() {
    W = undefined;                       /* laeuft noch */
    loadJson(WISSEN_URL, function (roh) {
      W = normWissen(roh);
      if (S.view === 'info') render();
    }, function () {
      W = null;                          /* nicht erreichbar */
      if (S.view === 'info') render();
    });
  }

  /* Was aus der Datei kommt, wird hier auf das zurechtgeschnitten, womit die
     Ansicht rechnet. Dieselbe Haltung wie bei places.json: lieber einen
     Eintrag weglassen als mit undefined weiterrechnen. */
  function normWissen(roh) {
    if (!roh || !Array.isArray(roh.eintraege) || !Array.isArray(roh.gruppen)) return null;
    var gruppen = roh.gruppen.filter(function (g) { return g && has(g.id) && has(g.titel); })
      .map(function (g) {
        return { id: String(g.id), titel: String(g.titel),
                 lead: has(g.lead) ? String(g.lead) : '',
                 pin: g.pin === true };
      });
    var kennt = {};
    gruppen.forEach(function (g) { kennt[g.id] = true; });
    var eintraege = roh.eintraege.filter(function (e) { return e && (has(e.text) || has(e.titel)); })
      .map(function (e, i) {
        return {
          id: has(e.id) ? String(e.id) : 'w' + i,
          /* Eine unbekannte Gruppe wuerde den Eintrag unsichtbar machen --
             also faellt er in die letzte statt aus der Ansicht. */
          gruppe: kennt[e.gruppe] ? String(e.gruppe)
                : (gruppen.length ? gruppen[gruppen.length - 1].id : ''),
          art: ['regel', 'offen', 'korrektur'].indexOf(e.art) >= 0 ? e.art : 'regel',
          titel: has(e.titel) ? String(e.titel) : '',
          text: has(e.text) ? String(e.text) : '',
          tel: has(e.tel) ? String(e.tel) : ''
        };
      });
    eintraege.forEach(function (e) {
      e.such = norm([e.titel, e.text, e.tel].join(' · '));
    });
    return { meta: roh.meta || {}, gruppen: gruppen, eintraege: eintraege };
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

  /* Die Hundregel eines Ortes, aus zwei Quellen zusammengelegt.

     Bis v33 gab es drei Werte (true, false, null) und einen Schalter, der
     alles ausser true ausblendete: 62 von 101 Orten verschwanden, obwohl nur
     4 davon ein ausdrueckliches "nein" tragen. Ungeklaert ist nicht nein.

     Jetzt sind es vier Zustaende, und der vierte ist der wichtigste:
       'ja'      im Katalog belegt
       'nein'    im Katalog belegt
       'offen'   im Katalog ungeklaert -- 58 Orte
       'ihr'     von euch vor Ort geklaert; schlaegt den Katalog

     Eure Angabe gewinnt immer. Sie ist juenger und ihr wart da.            */
  function dogOf(p) {
    var eigen = S.dog[p.id];
    if (eigen && typeof eigen.v === 'boolean') {
      return { v: eigen.v, q: 'ihr', at: eigen.at || '' };
    }
    if (p.dog === true)  return { v: true,  q: 'katalog', at: '' };
    if (p.dog === false) return { v: false, q: 'katalog', at: '' };
    return { v: null, q: 'offen', at: '' };
  }

  /* Die Hundregel in drei Zeichen, fuer Zeilen, die schon voll sind. */
  function dogKurz(p) {
    var z = dogState(p);
    if (z === 'ja' || z === 'ihr') {
      return ' · <span class="planheut__dog">Jum ok</span>';
    }
    if (z === 'nein' || z === 'ihrnein') {
      return ' · <span class="planheut__dog planheut__dog--nein">ohne Jum</span>';
    }
    return ' · <span class="planheut__dog planheut__dog--offen">Hund offen</span>';
  }

  /* Der Zustand als ein Wort -- fuer Klassennamen und Zaehlungen. */
  function dogState(p) {
    var d = dogOf(p);
    if (d.q === 'ihr') return d.v ? 'ihr' : 'ihrnein';
    if (d.v === true) return 'ja';
    if (d.v === false) return 'nein';
    return 'offen';
  }

  /* Wie sich die 101 Orte auf die vier Zustaende verteilen. Die Zaehlzeile
     nennt alle vier -- eine einzige Zahl ("39 mit Hund") verschwieg bis v33,
     dass die restlichen 62 nicht verboten, sondern ungeklaert sind. */
  function dogBilanz() {
    var b = { ja: 0, ihr: 0, offen: 0, nein: 0 };
    D.places.forEach(function (p) {
      var z = dogState(p);
      if (z === 'ihr') b.ihr++;
      else if (z === 'ihrnein' || z === 'nein') b.nein++;
      else if (z === 'ja') b.ja++;
      else b.offen++;
    });
    return b;
  }

  function dogCount() {
    var b = dogBilanz();
    return b.ja + b.ihr;
  }

  /* Setzt oder loescht, was ihr vor Ort erfahren habt. wert === null nimmt
     die eigene Angabe zurueck; dann gilt wieder der Katalog. */
  function setDogVorOrt(id, wert) {
    if (wert === null) delete S.dog[id];
    else S.dog[id] = { v: !!wert, at: new Date().toISOString().slice(0, 16) };
    lsSet(LS_DOG, S.dog);
  }

  function toggleJum() {
    S.jum = !S.jum;
    S.pick = 0;
    lsSet(LS_JUM, S.jum);
    applyJum();
    render();
  }

  /* ------------------------------------------------------------------ Tabs */

  /* Die Reiter heissen seit v35 nach ihrer Frage, nicht nach ihrem Inhalt:

       Jetzt      Was ist gerade dran?
       Entdecken  Was gibt es ueberhaupt?
       Reise      Was steht in fuenfzehn Tagen an?
       Wissen     Was muss ich wissen?

     "Heute" und "Plan" beantworteten beide die erste Frage und stritten sich
     darum (siehe planHeuteHtml und planHtml). "Orte" beschrieb die Datei,
     nicht die Handlung.

     Die KENNUNGEN bleiben, wie sie sind -- 'heute', 'orte', 'gemerkt',
     'info'. An ihnen haengen ?v=-Lesezeichen und der Speicher; sie
     umzubenennen braeche jeden gespeicherten Link, ohne etwas zu gewinnen.
     Dieselbe Entscheidung wie bei 'info' → "Wissen" in v26. */
  var TABS = [
    { id: 'heute', label: 'Jetzt', icon: ICON.sun },
    { id: 'orte', label: 'Entdecken', icon: ICON.list },
    /* Die Kennung bleibt "gemerkt": daran haengen der Teilen-Link und der
       Speicher. Sichtbar ist es ein Plan. */
    { id: 'gemerkt', label: 'Reise', icon: ICON.star },
    /* Die Ansicht heisst innen "Gut zu wissen" und traegt Hunderegeln,
       Notruf, Trinkgeld, Bus-Zeiten und die offenen Punkte -- eine der
       nuetzlichsten Ansichten der App. "Info" mit i-Kringel versprach ein
       Impressum; wer den Inhalt nicht kannte, hatte keinen Grund zu tippen.
       Ein Reitername muss sagen, was man bekommt. Die id bleibt 'info':
       ?v=info steht als Lesezeichen-Beispiel in der README, und ein
       umbenannter Parameter braeche jeden gespeicherten Link. */
    { id: 'info', label: 'Wissen', icon: ICON.buch }
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
      /* Steht heute etwas an, zaehlt die Marke die OFFENEN Stationen von
         heute -- nicht die ganze Merkliste. Wer vierzehn Tage plant, hat
         dort schnell dreissig Eintraege stehen, und "30" sagt am Dienstag
         nichts darueber, was heute noch zu tun ist. Ohne Tagesplan bleibt
         es bei der Gesamtzahl: dann IST die Merkliste der Plan.

         Die Marke traegt in beiden Faellen ein aria-label, das die Zahl
         benennt -- "2" allein ist ohne den Reiter darunter nicht zu deuten,
         und "2 offen heute" meint etwas anderes als "2 im Plan". */
      var heute = isoTag(new Date());
      var heuteOffen = S.saved.filter(function (id) {
        return S.days[id] === heute && S.seen.indexOf(id) < 0;
      }).length;
      var heuteGesamt = S.saved.filter(function (id) { return S.days[id] === heute; }).length;

      var zahl = heuteGesamt ? heuteOffen : S.saved.length;
      var text = heuteGesamt
        ? (heuteOffen === 0 ? 'heute alles erledigt' : heuteOffen + ' heute noch offen')
        : S.saved.length + ' im Plan';
      n.textContent = String(zahl);
      n.hidden = zahl === 0;
      n.setAttribute('aria-label', text);
      /* Alles erledigt: die Marke verschwindet, aber der Reiter sagt es dem
         Vorleser trotzdem. */
      var tab = $('tabs').querySelector('.tab[data-tab="gemerkt"]');
      if (tab) {
        if (heuteGesamt && heuteOffen === 0) tab.setAttribute('aria-description', 'heute alles erledigt');
        else tab.removeAttribute('aria-description');
      }
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

  /* Der Kopf aendert seine Hoehe nur, wenn sich SEIN Inhalt aendert -- die
     Liste dahinter beruehrt ihn nicht. Bis v23 mass render() ihn trotzdem bei
     jedem Durchgang, und jede Messung liest offsetHeight. Das zwingt den
     Browser, sofort das ganze Dokument zu setzen, samt aller Karten darunter.

     Im Profil war das beim Tippen mit 109 von 355 ms der groesste
     Einzelposten -- deutlich groesser als das Rendern der Karten selbst
     (37 ms). Genau die Art Kosten, die man nicht sieht, wenn man nur auf die
     Zeile schaut, die viel Text erzeugt.

     Jetzt wird gemessen, wenn der Kopf anders aussieht als zuletzt. Als
     Kennung dient sein eigenes Markup: darin schlaegt sich alles nieder, was
     ihn hoeher oder niedriger macht -- die Filterchips, das Loeschkreuz im
     Suchfeld, ausgeblendete Zeilen je Ansicht. Was sich NICHT im Markup
     zeigt, faengt der ResizeObserver auf .bar ab: geladene Schriften,
     Drehung des Geraets, Textvergroesserung im System. */
  var kopfStand = '';

  function measureBarWennNoetig() {
    var bar = document.querySelector('.bar');
    if (!bar) return;
    var jetzt = bar.innerHTML.length + '|' + bar.className + '|' + window.innerWidth;
    if (jetzt === kopfStand) return;
    kopfStand = jetzt;
    measureBar();
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

  /* Wie sich die zuletzt gezeigte Menge auf die Hundzustaende verteilt.
     Bis v33 stand hier eine einzige Zahl: wie viele Orte der Schalter
     ausblendet. Er blendet nichts mehr aus, also zaehlt er stattdessen. */
  var jumStat = { ja: 0, offen: 0, nein: 0 };

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
      var heu = suchtext(p);
      for (var t = 0; t < terms.length; t++) if (heu.indexOf(terms[t]) < 0) return false;
      return true;
    });

    /* Jum blendet seit v34 nichts mehr aus.

       Bis v33 stand hier ein Filter auf dog === true. Er kostete 62 von 101
       Orten -- aber nur 4 davon tragen ein ausdrueckliches "ohne Jum". Die
       anderen 58 sind ungeklaert, und eine Datenluecke ist keine Absage.
       Bei Regen am Vormittag traf es sogar 7 von 7: alle Orte, die dann im
       Trockenen liegen, haben eine offene Hundregel. Die Ansicht war leer,
       obwohl sieben Moeglichkeiten dastanden.

       Der Schalter tut jetzt drei Dinge statt einem:
         zaehlen      -- die Zaehlzeile nennt alle vier Zustaende
         beschriften  -- jede Zeile traegt ihre Hundmarke
         sortieren    -- ein belegtes "ohne Jum" sinkt ans Ende

       Ungeklaertes bleibt, wo es steht. In der Liste SUCHT man; 58 Orte nach
       hinten zu schieben hiesse, eine Luecke wie eine Absage zu behandeln.
       In "Heute" bekommt man VORGESCHLAGEN -- dort sinkt Ungeklaertes sehr
       wohl, siehe todayList(). */
    jumStat = { ja: 0, offen: 0, nein: 0 };
    out.forEach(function (p) {
      var d = dogOf(p);
      if (d.v === true) jumStat.ja++;
      else if (d.v === false) jumStat.nein++;
      else jumStat.offen++;
    });

    out.sort(S.sort === 'rating' ? byRating : byDistance);

    /* Zweiter, stabiler Durchgang: nur das belegte Nein sinkt. Die
       Reihenfolge innerhalb der Gruppen bleibt damit die gewaehlte. */
    if (S.jum && jumStat.nein) {
      out.sort(function (a, b) {
        return (dogOf(a).v === false ? 1 : 0) - (dogOf(b).v === false ? 1 : 0);
      });
    }
    return out;
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

  /* Was oben links steht. Bis v34 stand dort auf jeder der vier Ansichten
     derselbe App-Name -- eine Zeile, die man einmal liest und danach nie
     wieder braucht, und die auf 402 px rund ein Sechstel der Kopfhoehe
     kostete. Jetzt sagt sie, wo man ist und was gerade gilt. */
  function kopfzeileHtml() {
    var now = new Date();
    if (S.view === 'heute') {
      var trip = tripDay(now);
      return '<em>' + WTAGE[now.getDay()] + ' ' + pad2(now.getDate()) + '.'
        + pad2(now.getMonth() + 1) + '.</em>'
        + (trip ? '<span>Tag ' + trip.n + ' von ' + trip.of + '</span>' : '');
    }
    if (S.view === 'gemerkt') {
      /* Der Zeitraum, ohne den Ortsnamen dahinter: "14.–28. September 2026"
         aus "14.–28. September 2026 · Gardasee". Im Kopf ist Platz fuer die
         Zahl, nicht fuer die Herkunft. */
      var sub = has(D.meta.subtitle) ? String(D.meta.subtitle).split(' · ')[0] : '';
      return '<em>Reise</em>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
    }
    if (S.view === 'info') return '<em>Wissen</em>';
    return '<em>Entdecken</em><span>' + D.places.length + ' Orte</span>';
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function render() {
    syncChips();
    $('bar-title').innerHTML = kopfzeileHtml();
    var isPlan = S.view === 'gemerkt';
    var bare = S.view === 'info' || S.view === 'heute';
    /* Der Plan ist eine Liste, die man selbst gebaut hat — Suchen, Filtern
       und Sortieren haetten dort nichts zu suchen und wuerden die
       Reihenfolge zerschiessen, um die es gerade geht. */
    $('filters').hidden = bare || isPlan;
    /* Seit v35 steht die Suche nur noch dort, wo gesucht wird.

       Bis v34 stand sie auch auf der Startansicht, mit gutem Grund: der
       Reiter hiess "Orte", und von der Startansicht aus war nicht zu sehen,
       dass hinter dem einen Vorschlag ein ganzer Bestand liegt. Der Reiter
       heisst jetzt "Entdecken" und sagt das selbst; dazu steht am Ende der
       Ansicht weiterhin "Alle 101 Orte durchsuchen". Das Feld kostete oben
       rund 60 px, und dort steht jetzt der Tagesplan. */
    $('search-wrap').hidden = bare || isPlan;
    $('meta-row').hidden = bare || isPlan;
    /* Die Bruecke ins Wissen gehoert zur Ortssuche. In "Jetzt", "Reise" und
       "Wissen" wird hier nicht gesucht -- dort waere sie ein Verweis ohne
       Anlass. wissBruecke() fuellt sie unten, wenn es etwas zu sagen gibt. */
    if (bare || isPlan) { $('wissbr').hidden = true; $('wissbr').innerHTML = ''; }
    renderShareBar();
    measureBarWennNoetig();

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
      $('list').innerHTML = ''; $('list').setAttribute('data-voll', '1');
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
      /* Bis v35 stand hier ein eigener Leerzustand: wer nichts gemerkt
         hatte, bekam einen Absatz Text und sonst nichts -- und erfuhr nie,
         dass diese Ansicht fuenfzehn Reisetage kennt. Seit v36 zeichnet
         planHtml() auch den leeren Fall: das Raster mit fuenfzehn Tagen
         steht da, der Vorrat sagt in seiner eigenen Zeile, dass er leer ist,
         und ein Knopf fuehrt nach „Entdecken“. Das Raster IST die
         Aufforderung. */
      $('empty').hidden = true;
      $('list').hidden = false;
      /* Seit v36 eine Ansicht statt zweier Haelften hinter einem Umschalter:
         Raster, Tage, Vorrat untereinander. Man zieht beim Planen staendig
         aus dem Vorrat in einen Tag -- wer den Vorrat sehen wollte, verlor
         bis v35 den Plan aus dem Bild. */
      $('list').innerHTML = planHtml();
      $('list').setAttribute('data-voll', '1');
      return;
    }

    var items = selected();
    var total = D.places.length;

    renderCount(items.length, total);
    wissBruecke();

    if (!items.length) {
      $('list').hidden = true;
      $('list').innerHTML = ''; $('list').setAttribute('data-voll', '1');
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
      $('list').innerHTML = ''; $('list').setAttribute('data-voll', '1');
      zeigeKarte(items);
      return;
    }
    $('list').hidden = false;
    listeFuellen(items);
  }

  /* Die Bruecke von der Ortssuche ins Wissen.

     Seit v38 liegt das Wissen in einer eigenen Datei und ist durchsuchbar --
     aber in einer anderen Ansicht. Wer in "Entdecken" nach "zug" sucht,
     bekommt Orte und erfaehrt nichts davon, dass unter "Wissen" steht, wie
     Jum im Zug faehrt. Eine zweite Trefferliste daneben waere falsch: man
     sucht hier Orte. Ein Hinweis mit Zahl und einem Tipp dorthin ist das
     Richtige.

     Sie erscheint nur mit Suchbegriff UND Treffern im Wissen -- eine Leiste,
     die immer dasteht, ist Tapete. */
  function wissBruecke() {
    var leiste = $('wissbr');
    var q = S.q.trim();
    var teile = q ? norm(q).split(/\s+/).filter(Boolean) : [];
    if (!teile.length || !W || !W.eintraege) { leiste.hidden = true; leiste.innerHTML = ''; return; }

    var n = W.eintraege.filter(function (e) {
      return teile.every(function (x) { return e.such.indexOf(x) >= 0; });
    }).length;
    if (!n) { leiste.hidden = true; leiste.innerHTML = ''; return; }

    leiste.hidden = false;
    leiste.innerHTML = '<button type="button" id="wissbr-go">'
      + '<span class="wissbr__t">' + n + (n === 1 ? ' Eintrag' : ' Einträge')
      + ' im Wissen passen auch zu „' + esc(q) + '“</span>'
      + '<span class="wissbr__go">ansehen</span></button>';
  }

  /* ------------------------------------------------- Die Liste in Stuecken */
  /* Bis v23 stand hier items.map(cardHtml) in einem Zug: alle 101 Karten,
     synchron, bei jedem Tastendruck. Auf gedrosselter CPU (Faktor 4, grob ein
     Telefon) kostete der zweite Buchstabe gemessen 157 ms. Ab 100 ms wirkt
     eine Eingabe nicht mehr unmittelbar, der Cursor haengt sichtbar.

     Jetzt kommt die erste Fuhre sofort, der Rest ueber requestAnimationFrame
     hinterher. Es wird weiterhin ALLES gerendert, nur verteilt -- eine Liste,
     die nur das Sichtbare haelt, haette zwei Dinge gekostet: die Suche des
     Browsers in der Seite und die Zusicherung des Pruefstands, dass wirklich
     101 Karten dastehen. 101 Karten sind keine Last, nur nicht in einem
     Rutsch.

     lauf zaehlt bei jedem Durchgang hoch. Eine noch laufende Nachlieferung
     sieht die geaenderte Zahl und bricht ab -- ohne das haengte beim
     schnellen Tippen die Liste des vorigen Begriffs an die neue an.

     data-voll sagt, wann die Liste fertig ist. Das ist nicht Zierde: der
     Pruefstand kann sonst nicht unterscheiden, ob eine Karte fehlt oder nur
     noch nicht dran war. Die Zweige, die hier gar nicht durchkommen -- leere
     Trefferliste, Plan, Karte -- setzen es ebenfalls: "leer" ist auch ein
     fertiger Zustand, und ohne das bliebe dort die Meldung des vorigen
     Durchgangs stehen. */
  var ERSTE = 18;    // deckt 402x754 ueber den Falz hinaus ab
  var FUHRE = 24;
  var lauf = 0;

  function listeFuellen(items) {
    var el = $('list');
    lauf += 1;
    var meins = lauf;
    el.removeAttribute('data-voll');
    el.innerHTML = items.slice(0, ERSTE).map(function (p) { return cardHtml(p); }).join('');
    if (items.length <= ERSTE) { el.setAttribute('data-voll', '1'); return; }

    var i = ERSTE;

    function weiter() {
      if (meins !== lauf) return;              // ein neuer Durchgang hat uebernommen
      var teil = items.slice(i, i + FUHRE);
      if (!teil.length) { el.setAttribute('data-voll', '1'); return; }
      el.insertAdjacentHTML('beforeend',
        teil.map(function (p) { return cardHtml(p); }).join(''));
      i += FUHRE;
      if (i < items.length) requestAnimationFrame(weiter);
      else el.setAttribute('data-voll', '1');
    }

    /* Bewusst requestAnimationFrame und nicht der direkte Aufruf: als
       selbstaufrufende Funktion lief die erste Nachlieferung noch im selben
       Zug mit, und der Tastendruck trug 42 Karten statt 18 -- die Haelfte der
       Ersparnis war damit wieder weg. Gemessen an der fertigen Suite, nicht
       ueberlegt. */
    requestAnimationFrame(weiter);
  }

  var lastCount = { shown: 0, total: 0 };

  function renderCount(shown, total) {
    if (shown === undefined) { shown = lastCount.shown; total = lastCount.total; }
    lastCount = { shown: shown, total: total };
    var seenHere = S.seen.length;
    /* Seit v34 steht hier die ganze Aufteilung statt einer einzigen Zahl.
       "62 ohne Jum ausgeblendet" war ehrlich, stellte den Inhalt aber nicht
       wieder her; "39 sicher, 58 ungeklärt, 4 ohne Jum" sagt, was da ist. */
    var jumTxt = '';
    if (S.jum) {
      jumTxt = ' · mit Jum · ' + jumStat.ja + ' sicher'
        + (jumStat.offen ? ' · ' + jumStat.offen + ' ungeklärt' : '')
        + (jumStat.nein ? ' · ' + jumStat.nein + ' ohne Jum' : '');
    } else {
      jumTxt = ' · ' + dogCount() + ' mit Hund';
    }
    $('count').textContent = (anyFilter()
      ? shown + ' von ' + total + (total === 1 ? ' Ort' : ' Orten')
      : total + (total === 1 ? ' Ort' : ' Orte'))
      + jumTxt
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
    /* Der Hund-Slot, vier Zustaende.

       Bis v33 entfiel die Marke bei angeschaltetem Jum -- sie galt ja fuer
       alle. Seit der Schalter nichts mehr ausblendet, gilt sie nicht mehr
       fuer alle, und die Zeile muss sagen, woran sie ist.

       Steht der Schalter aus, bleibt "Hund offen" weg: dann ist die offene
       Regel keine Nachricht. Das belegte Nein steht immer, es ist eine
       Einschraenkung unabhaengig vom Schalter.

       Die Herkunft (Katalog oder ihr selbst) steht NICHT in der Zeile: sie
       hat vier feste Slots auf 97 px und ist eine Scanflaeche. Wer es genau
       wissen will, oeffnet den Ort -- dort steht Datum und Wortlaut. */
    var dz = dogState(p);
    if (dz === 'ja' || dz === 'ihr') {
      f.push('<span class="fact fact--dog' + (dz === 'ihr' ? ' fact--dogyou' : '') + '">'
        + ICON.dog + 'Jum ok</span>');
    } else if (dz === 'nein' || dz === 'ihrnein') {
      f.push('<span class="fact fact--nodog">' + ICON.dog + 'ohne Jum</span>');
    } else if (S.jum) {
      f.push('<span class="fact fact--dogopen">' + ICON.dog + 'Hund offen</span>');
    }
    /* Der Ruhetag belegt denselben Slot, statt einen fuenften aufzumachen —
       die Zeilenhoehe von 97 px bleibt damit unangetastet. "taeglich 18–23,
       Ruhetag Mittwoch" hilft am Mittwoch niemandem, "heute zu" schon; der
       volle Wortlaut steht weiter im Sheet. */
    /* Ist der Ort verplant, steht sein Tag im Oeffnungs-Slot -- "am Mittwoch"
       schlaegt "bis 22:30", wenn man die Zeile im Plan wiederfinden will.
       Der volle Wortlaut steht weiter im Sheet, und dort wird der Tag auch
       gewaehlt. */
    var tagVon = S.days[p.id] && S.saved.indexOf(p.id) >= 0
      ? planTagVon(p.id, tagKennungen()) : null;
    if (tagVon) {
      var tk = tripTage().filter(function (t) { return t.iso === tagVon; })[0];
      f.push('<span class="fact fact--day">' + ICON.star
        + esc(tagVon === isoTag(new Date()) ? 'heute' : (tk ? tk.kurz : tagVon)) + '</span>');
    } else if (closedToday(p)) {
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
      /* Die Notiz ist einzeilig gekuerzt. Damit die Markierung trotzdem im
         Bild steht, faengt der Text bei aktiver Suche vor der Fundstelle an
         -- siehe ausschnitt(). Im Sheet steht weiterhin der volle Satz. */
      /* Die eigene Notiz steht VOR der Beschreibung: sie ist das, was man
         selbst herausgefunden hat, und schlaegt damit den Katalogtext. */
      + (S.notes[p.id] ? '<p class="card__mine">' + ICON.note + esc(S.notes[p.id]) + '</p>' : '')
      + (has(p.note) ? '<p class="card__note">' + markiere(ausschnitt(p.note)) + '</p>' : '')
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
    /* "Vormittag", nicht "Morgen": dieselbe Ansicht traegt eine Zeile
       darueber "Morgen früh" fuer den Vorausblick auf den naechsten Tag.
       Zwei Bedeutungen desselben Wortes auf einem Bildschirm sind eine zu
       viel; die Kennung 'frueh' bleibt, an ihr haengen die Daten. */
    { id: 'frueh',      label: 'Vormittag',  until: 11 * 60,      kicker: 'Für den Vormittag' },
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
  /* Wie viele Orte des Abschnitts der Schalter gerade herausnimmt. Seit v34
     ist das nur noch das belegte "ohne Jum" -- vier Orte im ganzen Bestand. */
  var jumNeinHeute = 0;

  function todayList(mid, mins, until, now, mitGesehenen) {
    jumNeinHeute = 0;
    var out = D.places.filter(function (p) {
      if (momentsOf(p).indexOf(mid) < 0) return false;
      /* Nur das belegte Nein faellt heraus -- vier Orte. Ungeklaertes bleibt
         und sinkt weiter unten in der Sortierung; bis v33 flog es mit heraus
         und machte ganze Abschnitte leer. */
      if (S.jum && dogOf(p).v === false) { jumNeinHeute++; return false; }
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
      /* Hier wird vorgeschlagen, nicht gesucht: mit angeschaltetem Jum steht
         Belegtes vor Ungeklaertem. In der Ortsliste gilt das bewusst NICHT
         -- dort sucht man, und 58 Orte nach hinten waere eine Absage. */
      if (S.jum) {
        var ja = dogOf(a).v === true ? 0 : 1, jb = dogOf(b).v === true ? 0 : 1;
        if (ja !== jb) return ja - jb;
      }
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

  /* Der Reisezeitraum, aus dem Untertitel gelesen ("14.–28. September 2026").
     Eine zweite Quelle dafuer anzulegen hiesse, zwei Wahrheiten zu pflegen. */
  function tripSpan() {
    var t = has(D.meta.subtitle) ? String(D.meta.subtitle) : '';
    var m = t.match(/(\d{1,2})\.\s*[–-]\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöüß]+)\s*(\d{4})/);
    if (!m) return null;
    var mon = MONTHS.indexOf(m[3].toLowerCase());
    if (mon < 0) return null;
    return { from: new Date(+m[4], mon, +m[1]), to: new Date(+m[4], mon, +m[2]) };
  }

  var WTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var WTAGE_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

  function isoTag(d) {
    var mm = String(d.getMonth() + 1), dd = String(d.getDate());
    return d.getFullYear() + '-' + (mm.length < 2 ? '0' : '') + mm + '-' + (dd.length < 2 ? '0' : '') + dd;
  }

  /* Alle Reisetage: [{iso, kurz: "Sa 19.09.", lang: "Samstag, 19.09."}] */
  function tripTage() {
    var span = tripSpan();
    if (!span) return [];
    var aus = [], d = new Date(span.from);
    while (d <= span.to) {
      var t = String(d.getDate()); if (t.length < 2) t = '0' + t;
      var mo = String(d.getMonth() + 1); if (mo.length < 2) mo = '0' + mo;
      aus.push({ iso: isoTag(d), kurz: WTAGE[d.getDay()] + ' ' + t + '.' + mo + '.',
                 lang: WTAGE_LANG[d.getDay()] + ', ' + t + '.' + mo + '.' });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    return aus;
  }

  function tripDay(now) {
    var span = tripSpan();
    if (!span) return null;
    var day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (day0 < span.from || day0 > span.to) return null;
    var oneDay = 86400000;
    return { n: Math.round((day0 - span.from) / oneDay) + 1,
             of: Math.round((span.to - span.from) / oneDay) + 1 };
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
    /* Der Umweg. Er gilt nur fuer HEUTE: "morgen frueh" hat seine eigene
       Kette, und ein Ort, der heute drei Minuten kostet, kann morgen eine
       Stunde kosten. Steht fuer heute nichts, gibt es auch keine Kette, in
       die man einfuegen koennte -- dann steht hier nichts statt einer Null. */
    var heute = isoTag(new Date());
    var gueltig = tagKennungen();
    var tagesOrte = tomorrow ? [] : planList().filter(function (x) {
      return planTagVon(x.id, gueltig) === heute;
    });
    var schonDrin = S.days[p.id] === heute;
    var u = schonDrin ? null : umwegFuer(p, tagesOrte, tagModus(heute, tagesOrte));

    return '<p class="today__cat ' + accentClass(p.category) + '">' + esc(catLabel(p.category))
      + (has(p.hours) ? '<span class="today__hours">' + esc(String(p.hours).replace(/^geöffnet\s+/i, '')) + '</span>' : '')
      + '</p>'
      + '<h3 class="today__name">' + esc(p.name) + '</h3>'
      + (has(p.note) ? '<p class="today__note">' + esc(p.note) + '</p>' : '')
      + '<p class="today__why">' + whyLine(p, mins, until, ref, tomorrow) + '</p>'
      /* Was es kostet, ihn mitzunehmen -- und wo er hinkaeme. Ohne diese
         Zahl sahen ein Ort auf dem Weg und einer am anderen Ende des Sees
         gleich einladend aus. */
      + (u
          ? '<p class="today__umweg">≈ ' + esc(dur(u.min)) + ' Umweg'
            + (u.nach ? ' — käme nach ' + esc(u.nach) : ' — käme als Erstes')
            + '</p>'
          : schonDrin
            ? '<p class="today__umweg today__umweg--drin">Steht heute schon im Plan.</p>'
            : '')
      + '<div class="today__acts">'
      + '<button type="button" class="btn btn--primary" data-open="' + esc(p.id) + '">Ansehen</button>'
      + (u
          ? '<button type="button" class="btn" data-einfuegen="' + esc(p.id) + '">'
            + ICON.plus + 'In den Tag</button>'
          : '<button type="button" class="btn" data-save="' + esc(p.id) + '" aria-pressed="'
            + (on ? 'true' : 'false') + '">'
            + ICON.star + (on ? 'Gemerkt' : 'Merken') + '</button>')
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
  /* Bis v33 hatte dieser Kasten zwei Faelle, und der haeufigere war
     hausgemacht: mit angeschaltetem Jum stand hier "Bei Regen steht hier
     nichts", obwohl sieben Orte im Trockenen lagen -- sie hatten nur alle
     eine offene Hundregel. Drei davon zeigte der Kasten an, vier nicht, und
     verplanen liess sich keiner.

     Seit v34 kommt dieser Fall nicht mehr vor: der Schalter blendet nichts
     aus, die sieben stehen in der Liste. Was bleibt, ist der ehrliche Fall
     -- fuer diesen Abschnitt ist nichts als "drinnen" belegt. */
  function wetNoneHtml(mid, ref) {
    var offen = D.places.filter(function (p) { return indoorOf(p) === null; }).length;
    return '<div class="today__none"><h3>Bei Regen steht hier nichts</h3>'
      + '<p>Bei ' + offen + ' von ' + D.places.length + ' Orten ist nicht hinterlegt, '
      + 'ob man dort im Trockenen sitzt. Ungeprüft wird hier nichts vorgeschlagen.</p>'
      + '</div>';
  }

  /* Der Plan fuer heute, ganz oben in "Heute".

     Bis v28 wussten die beiden Haelften der App nichts voneinander: man
     ordnete abends Orte dem Samstag zu, oeffnete morgens den Bildschirm, der
     "Heute" heisst -- und der schlug aus allen 101 Orten irgendetwas anderes
     vor. S.days kam in der ganzen Heute-Ansicht kein einziges Mal vor. Wer
     plant, will beim Aufwachen nicht vorgeschlagen bekommen, sondern
     erinnert werden.

     Der Block steht VOR der Abschnittsleiste: er gilt dem ganzen Tag, die
     Leiste darunter engt auf einen Abschnitt ein. Und er steht vor dem
     Wetter, weil er keine Empfehlung ist, die sich nach dem Wetter richtet,
     sondern eine Verabredung mit sich selbst.

     Abhaken benutzt dieselbe Gesehen-Markierung wie ueberall -- kein zweiter
     Zustand fuer dieselbe Sache. Erledigte bleiben stehen, gedaempft: sie
     verschwinden zu lassen hiesse, den Fortschritt zu verstecken, und genau
     der ist der Grund, morgens hierherzuschauen. */
  function planHeuteHtml(now) {
    var heute = isoTag(now);
    var orte = planList().filter(function (p) { return S.days[p.id] === heute; });
    /* Bis v34 stand hier gar nichts, wenn fuer heute nichts geplant war --
       und die Ansicht fing mit einem Vorschlag an, ohne je zu erwaehnen,
       dass es einen Tagesplan gibt. Wer nie einen anlegt, erfaehrt nicht,
       dass er koennte. */
    if (!orte.length) {
      var vorrat = planList().filter(function (p) {
        return !planTagVon(p.id, tagKennungen());
      }).length;
      return '<section class="planheut planheut--leer">'
        + '<p class="planheut__h"><span class="planheut__t">Heute</span></p>'
        + '<p class="planheut__f">Für heute ist nichts geplant.'
        + (vorrat ? ' ' + vorrat + (vorrat === 1 ? ' Ort liegt' : ' Orte liegen')
            + ' im Vorrat.' : '')
        + '</p>'
        + '<button type="button" class="btn btn--wide" id="planheut-los">'
        + 'Tag planen</button></section>';
    }

    var fertig = orte.filter(function (p) { return S.seen.indexOf(p.id) >= 0; }).length;
    var alles = fertig === orte.length;
    var modus = tagModus(heute, orte);
    var w = tagWege(orte, modus);
    var rest = 0, restN = 0;
    orte.forEach(function (p) {
      if (S.seen.indexOf(p.id) < 0 && has(p.time_min)) { rest += p.time_min; restN++; }
    });
    /* Seit v37 zaehlen auch die Wege in die Restzeit -- aber nur die, die
       noch bevorstehen. Der Weg von Station 1 zu Station 2 ist vorbei, wenn
       2 schon abgehakt ist; ihn weiter mitzufuehren waere dieselbe Luege wie
       eine erledigte Aufenthaltsdauer. */
    var restWeg = 0;
    for (var wi = 1; wi < orte.length; wi++) {
      if (S.seen.indexOf(orte[wi].id) >= 0) continue;
      if (w.wege[wi - 1]) restWeg += w.wege[wi - 1].min;
    }

    /* "Heute", nicht "Dein Plan für heute": seit v35 ist der Tagesplan der
       Hauptinhalt dieser Ansicht und nicht mehr ein Block ueber einem
       Vorschlag. Rechts steht, was die Frage beantwortet, mit der man
       morgens draufschaut -- wie weit bin ich, und wie lange noch. */
    var kopf = '<p class="planheut__h">'
      + '<span class="planheut__t">' + (alles ? 'Heute erledigt' : 'Heute') + '</span>'
      + '<span class="planheut__n">' + fertig + ' von ' + orte.length
      + (restN && !alles
          ? ' · noch ' + (restWeg ? '≈ ' : '') + esc(dur(rest + restWeg)) : '')
      + '</span></p>'
      /* Ein Balken sagt in einem Blick, was "2 von 5" erst gelesen werden
         muss. aria-hidden, weil die Zahl daneben dasselbe schon sagt. */
      + '<div class="planheut__bar" aria-hidden="true"><i style="width:'
      + Math.round((fertig / orte.length) * 100) + '%"></i></div>';

    var zeilen = orte.map(function (p, i) {
      var ab = S.seen.indexOf(p.id) >= 0;
      return '<div class="planheut__row' + (ab ? ' planheut__row--ab' : '') + ' '
        + accentClass(p.category) + '">'
        + '<button type="button" class="planheut__tick" data-seen="' + esc(p.id) + '"'
        + ' aria-pressed="' + (ab ? 'true' : 'false') + '">'
        + '<span class="sr-only">' + esc(p.name)
        + (ab ? ' als noch nicht erledigt markieren' : ' als erledigt abhaken') + '</span>'
        + ICON.check + '</button>'
        + '<button type="button" class="planheut__open" data-open="' + esc(p.id) + '">'
        + '<span class="planheut__name">' + esc(p.name) + '</span>'
        + '<span class="planheut__m">' + esc(catLabel(p.category))
        + (has(p.walk_min) ? ' · ' + p.walk_min + ' Min Weg' : '')
        + (has(p.time_min) ? ' · ' + esc(dur(p.time_min)) : '')
        /* Die Hundregel steht an jeder Station. Was in der Ortsliste gilt,
           gilt hier erst recht: man liest diesen Block morgens und will
           nicht fuer jede Station einzeln nachschlagen, ob Jum mit darf. */
        + (S.jum ? dogKurz(p) : '')
        + (closedToday(p, now) ? ' · <span class="planheut__zu">heute zu</span>' : '')
        + '</span></button>'
        + '</div>'
        /* Der Weg zur naechsten Station -- dieselbe Rechnung wie in der
           Reise, damit an beiden Stellen dieselbe Zahl steht. */
        + (function () {
            var weg = w.wege[i];
            if (!weg) return '';
            return '<p class="planheut__w' + (weg.min >= WEG_LANG ? ' planheut__w--weit' : '')
              + '"><span>≈ ' + esc(km(weg.km)) + ' · ' + esc(dur(weg.min)) + ' '
              + esc(MODI[modus].name) + '</span></p>';
          }());
    }).join('');

    /* Der Fuss sagt, was noch vor einem liegt -- und wenn nichts mehr, dann
       das. Die Zeitangabe zaehlt nur die offenen Stationen: die erledigten
       sind schon vorbei, sie in der Restzeit zu fuehren waere schlicht
       falsch. */
    /* Die Restzeit steht seit v35 oben im Kopf. Hier unten bleibt nur, was
       sie nicht sagt: dass sie sich auf weniger Stationen stuetzt, als
       dastehen, oder dass alles erledigt ist. */
    var offen = orte.length - fertig;
    var fuss = alles
      ? '<p class="planheut__f planheut__f--fertig">' + ICON.check
        + 'Alle ' + orte.length + ' Stationen abgehakt.</p>'
      : (restN && restN < offen
          ? '<p class="planheut__f">Die Restzeit stützt sich auf ' + restN
            + ' von ' + offen + ' offenen Stationen'
            + (restWeg ? ' und ≈ ' + esc(dur(restWeg)) + ' Wege' : '') + '.</p>'
          : (restWeg
              ? '<p class="planheut__f">In der Restzeit stecken ≈ '
                + esc(dur(restWeg)) + ' Wege ' + esc(MODI[modus].name) + '.</p>'
              : ''));

    return '<section class="planheut' + (alles ? ' planheut--fertig' : '') + '">'
      + kopf + '<div class="planheut__l">' + zeilen + '</div>' + fuss + '</section>';
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

    /* Steht fuer heute schon ein Plan, heisst der Vorschlag anders -- er ist
       dann eine Ergaenzung, keine Antwort auf "was mache ich". */
    var heuteGeplant = planList().some(function (p) {
      return S.days[p.id] === isoTag(now);
    });

    /* Was oben schon steht, darf unten nicht noch einmal kommen.

       Bis v34 zeigte "Sonst noch" den Morgen und "Mittag dann" den Mittag,
       jeder fuer sich richtig -- nur stand derselbe Ort dann zweimal
       untereinander im selben Ausschnitt (Spiaggia Lido ai Pioppi am
       20.09.). Ein Vorschlag, der sich selbst wiederholt, wirkt wie ein
       Fehler, auch wenn er keiner ist. */
    var schonDa = {};
    if (pick) schonDa[pick.id] = true;
    shown.forEach(function (o) { schonDa[o.id] = true; });
    planList().forEach(function (o) {
      /* Was heute im Plan steht, ist oben abgehakt oder wartet dort. Es
         gehoert nicht zusaetzlich unter "Sonst noch". */
      if (S.days[o.id] === isoTag(now)) schonDa[o.id] = true;
    });

    /* Das Datum steht seit v35 in der Kopfleiste -- dort, wo vorher der
       App-Name stand. Hier faengt die Ansicht mit dem an, was gerade gilt. */
    var head = '<h2 class="today__now">' + (tomorrow ? 'Morgen früh' : (!chosen && mn.soon ? 'Gleich: ' : '') + m.label)
      + '<span class="today__clock">' + hhmm(mins) + '</span></h2>'
      /* Der eigene Plan vor dem Vorschlag: was man sich vorgenommen hat,
         schlaegt, was die App anbietet. */
      + planHeuteHtml(now)
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
        /* "Dazu passt jetzt" statt des Abschnittsnamens: der steht schon
           gross darueber, und was hier zaehlt, ist die Beziehung zum Tag --
           nicht noch einmal die Uhrzeit. */
        + '<p class="today__kicker">'
        + (tomorrow ? 'Für morgen früh' : heuteGeplant ? 'Dazu passt jetzt' : m.kicker)
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
          + (S.jum && jumNeinHeute ? ' Mit Jum fällt ' + (jumNeinHeute === 1
              ? 'ein Ort' : jumNeinHeute + ' Orte') + ' mit ausdrücklichem „ohne Jum“ heraus.' : '')
          + '</p><button type="button" class="btn" id="today-seen">'
          + 'Trotzdem zeigen</button></div>'
        : '<div class="today__none"><h3>Hier steht nichts</h3><p>'
          + 'Für diesen Tagesabschnitt ist nichts hinterlegt.'
          + (S.jum && jumNeinHeute ? ' Mit Jum fällt ' + (jumNeinHeute === 1
              ? 'ein Ort' : jumNeinHeute + ' Orte') + ' mit ausdrücklichem „ohne Jum“ heraus.' : '') + '</p></div>';
    }

    return head + weather + body + aheadHtml(m.id, ref, schonDa)
      + '<button type="button" class="today__all" id="today-all">'
      + 'Alle ' + D.places.length + ' Orte durchsuchen'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg></button>';
  }

  /* Ein Blick nach vorn. Wer um 15:16 auf "Heute" geht, plant oft schon das
     Abendessen — bis v13 musste man dafuer erst den Abschnitt erraten. */
  function aheadHtml(mid, ref, schonDa) {
    var i = momentIndex(mid);
    if (i >= MOMENTS.length - 1) return '';
    var nx = MOMENTS[i + 1];
    /* Ueberspringt, was in dieser Ansicht schon oben steht. Viele Orte
       tragen mehrere Abschnitte in moment[]; ohne diese Zeile schlaegt der
       Ausblick denselben Ort vor, den man zwei Zeilen darueber gerade
       gelesen hat. */
    var list = todayList(nx.id, 0, nx.until, ref).filter(function (p) {
      return !(schonDa && schonDa[p.id]);
    });
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

    /* Die Hundregeln als Arbeitsvorrat, nicht als Schicksal.

       Bei 58 der 101 Orte ist sie im Katalog offen. Das ist keine Zahl zum
       Hinnehmen, sondern eine Liste, die ueber fuenfzehn Reisetage kuerzer
       wird -- ein Anruf oder ein Besuch je Eintrag. Seit v34 steht sie hier
       oben und zaehlt mit. */
    var bil = dogBilanz();
    h += '<section class="section"><h2 class="section__h">Jum, in Zahlen</h2>'
      + '<div class="panel panel--dog">'
      /* bil.ja zaehlt den Katalog, bil.ihr eure eigenen Klaerungen -- die
         Summe ist die Zahl, die auch in der Zaehlzeile steht. Sie getrennt
         zu nennen ist der Punkt: die zweite waechst, wenn ihr unterwegs
         fragt, und die dritte schrumpft dadurch. */
      + '<p class="panel__x">Von ' + D.places.length + ' Orten dürfen '
      + '<b>' + (bil.ja + bil.ihr) + '</b> Jum sicher herein'
      + (bil.ihr ? ', <b>' + bil.ihr + '</b> davon habt ihr selbst geklärt' : '')
      + '. Bei <b>' + bil.offen + '</b> ist die Regel offen, '
      + '<b>' + bil.nein + '</b> sind ausdrücklich ohne Hund.</p>'
      + (bil.offen
          ? '<p class="panel__x panel__x--soft">Offen heißt offen, nicht nein — '
            + 'sie stehen überall mit. Wer davorsteht oder anruft, trägt es im '
            + 'Ort ein; ab dann gilt es und fährt beim Teilen mit.</p>'
          : '<p class="panel__x panel__x--soft">Keine offene Hundregel mehr. '
            + 'Das habt ihr unterwegs geklärt.</p>')
      + '</div></section>';

    h += wissenHtml();

    if (has(D.meta.base)) {
      h += '<section class="section"><h2 class="section__h">Basis</h2>'
        + '<div class="panel"><p class="panel__x">' + esc(D.meta.base) + '</p>'
        + '<p class="panel__c"><a href="' + esc(mapsHref({ name: D.meta.base, address: '' }))
        + '" target="_blank" rel="noopener noreferrer">In Google Maps öffnen</a></p></div></section>';
    }

    return h;
  }

  /* --- Das Wissen ------------------------------------------------------

     Bis v37 standen hier drei lange Listen untereinander: "Gut zu wissen"
     (17), "Offene Punkte" (18) und der Faktencheck (13). Achtundvierzig
     Eintraege ohne Gruppe und ohne Rangfolge -- der NOTRUF stand als
     neunter Eintrag zwischen "Badeschuhe" und "Coperto & Trinkgeld".
     Gesucht werden konnte darin gar nicht.

     Seit v38: eine Suche ueber alle Eintraege, Gruppen mit Kopf, und der
     Notfall gepinnt. Gepinnt heisst hier woertlich: er steht oben, immer,
     auch waehrend einer Suche -- man sucht ihn nicht, wenn man ihn
     braucht. */
  function wissenHtml() {
    if (W === undefined) {
      return '<section class="section"><p class="wissen__lade">Wissen wird geladen …</p></section>';
    }
    if (W === null) {
      return '<section class="section">'
        + '<div class="panel panel--open"><h3 class="panel__t">Wissen nicht geladen</h3>'
        + '<p class="panel__x">data/wissen.json war nicht erreichbar. Die Orte '
        + 'und dein Plan sind davon nicht betroffen.</p>'
        + '<p class="panel__c"><button type="button" class="btn" id="wissen-retry">'
        + 'Erneut versuchen</button></p></div></section>';
    }

    var q = S.wq.trim();
    var teile = q ? norm(q).split(/\s+/).filter(Boolean) : [];
    var treffer = teile.length
      ? W.eintraege.filter(function (e) {
          return teile.every(function (t) { return e.such.indexOf(t) >= 0; });
        })
      : W.eintraege;

    /* Der gepinnte Notfall. Er steht VOR dem Suchfeld: eine Nummer, die man
       im Ernstfall erst freisuchen muss, ist keine Notfallnummer. */
    var h = '';
    var pinIds = {};
    W.gruppen.filter(function (g) { return g.pin; }).forEach(function (g) {
      var drin = W.eintraege.filter(function (e) { return e.gruppe === g.id; });
      if (!drin.length) return;
      pinIds[g.id] = true;
      h += '<section class="section wissen__pin">'
        + '<h2 class="section__h">' + esc(g.titel) + '</h2>'
        + drin.map(eintragHtml).join('') + '</section>';
    });

    h += '<section class="section">'
      + '<label class="wissen__suche">'
      + '<span class="sr-only">Wissen durchsuchen</span>'
      + '<input type="search" id="wq" class="tagsuche__i"'
      + ' autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="search"'
      + ' placeholder="' + W.eintraege.length + ' Einträge durchsuchen"'
      + ' value="' + esc(S.wq) + '"></label>'
      + (teile.length
          ? '<p class="wissen__n">' + treffer.length
            + (treffer.length === 1 ? ' Treffer' : ' Treffer') + ' für „' + esc(q) + '“'
            + '<button type="button" class="wissen__x" id="wq-clear">zurücksetzen</button></p>'
          : '')
      + '</section>';

    if (teile.length && !treffer.length) {
      h += '<section class="section"><div class="panel"><p class="panel__x">'
        + 'Nichts gefunden. Gesucht wird über Titel, Text und Telefonnummer '
        + 'aller ' + W.eintraege.length + ' Einträge.</p></div></section>';
      return h;
    }

    W.gruppen.forEach(function (g) {
      /* Der gepinnte Teil steht schon oben -- waehrend einer Suche aber
         zusaetzlich hier, damit ein Treffer darin nicht doppelt zaehlt und
         nicht fehlt. */
      if (pinIds[g.id] && !teile.length) return;
      var drin = treffer.filter(function (e) { return e.gruppe === g.id; });
      if (!drin.length) return;
      h += '<section class="section"><h2 class="section__h">' + esc(g.titel)
        + '<span class="section__n">' + drin.length + '</span></h2>'
        + (g.lead && !teile.length
            ? '<p class="section__lead">' + esc(g.lead) + '</p>' : '')
        + drin.map(eintragHtml).join('')
        + '</section>';
    });
    return h;
  }

  /* Ein Eintrag. Die Art steckt nicht im Text, sondern im Feld: eine offene
     Frage traegt Ocker und das Wort, eine Korrektur den Haken. Bis v37
     unterschied nur die Sektion, in der der Eintrag stand -- wer ihn ueber
     eine Suche fand, sah die Sektion nicht. */
  function eintragHtml(e) {
    var tel = e.tel ? telHref(e.tel) : null;
    return '<div class="panel panel--w' + (e.art === 'offen' ? ' panel--open' : '')
      + (e.art === 'korrektur' ? ' panel--fix' : '') + '">'
      + (e.titel ? '<h3 class="panel__t">' + esc(e.titel) + '</h3>' : '')
      + (e.art !== 'regel'
          ? '<p class="wissen__art wissen__art--' + e.art + '">'
            + (e.art === 'offen' ? 'noch offen' : 'korrigiert') + '</p>' : '')
      + (e.text ? '<p class="panel__x">' + esc(e.text) + '</p>' : '')
      + (e.tel
          ? '<p class="panel__c">' + (tel
              ? '<a href="tel:' + esc(tel) + '">' + esc(e.tel) + '</a>'
              : esc(e.tel)) + '</p>'
          : '')
      + '</div>';
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
    var wasDay = S.dayOpen;
    S.openId = null;
    S.filterOpen = false;
    S.dayOpen = null;

    /* Vor dem Zurückgeben des Fokus: in ein inertes Element hinein kann er
       nicht, der Aufruf würde still ins Leere laufen. */
    setInert(false);

    /* Wurde im Sheet eine Hundregel gesetzt, traegt die Liste dahinter noch
       die alte Marke. Neu zeichnen, bevor der Fokus zurueckgeht -- sonst
       zeigte sie bis zum naechsten Tipp etwas Falsches. */
    if (listeNeuBeimSchliessen) { listeNeuBeimSchliessen = false; render(); }

    var back = id ? document.querySelector('[data-open="' + id.replace(/"/g, '\\"') + '"]') : null;
    if (wasFilter) back = $('chip-filter');
    if (wasDay) back = document.querySelector('[data-dayopen="' + wasDay + '"]');
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

  /* Datum einer eigenen Angabe, kurz: "20.09." */
  function kurzDatum(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? m[3] + '.' + m[2] + '.' : '';
  }

  /* Bei 58 von 101 Orten ist die Hundregel ungeklaert — das ist die haeufigste
     Antwort und darf kein kleingedrucktes "nicht geklaert" in einer Liste
     sein.

     Seit v34 ist der Block nicht mehr nur eine Auskunft, sondern die Stelle,
     an der man sie berichtigt. Bis dahin stand im Sheet gleichzeitig
     "Nicht geklaert — vorher fragen" und, eine Zeile darunter in der eigenen
     Notiz, "Jum durfte mit rein". Zwei Wahrheiten auf einem Bildschirm, und
     am naechsten Tag gewann wieder der Katalog.

     Jetzt gilt: was ihr vor Ort erfahren habt, ueberschreibt den Katalog --
     mit Datum, umkehrbar, und es faehrt beim Teilen mit. */
  function dogHtml(p) {
    var d = dogOf(p);
    var state = d.q === 'ihr' ? (d.v ? 'you' : 'youno')
              : d.v === true ? 'yes' : d.v === false ? 'no' : 'unknown';
    var text = {
      yes:    'Jum darf mit',
      no:     'Ohne Jum',
      unknown:'Nicht geklärt — vorher fragen',
      you:    'Jum darf mit — von euch bestätigt',
      youno:  'Ging nicht — von euch notiert'
    }[state];
    /* Drei Orte tragen eine Einschraenkung, die dog nicht ausdrueckt: in
       Sirmione ist nur die Burg tabu, auf der Isola gilt Leinenpflicht, auf
       dem Linienschiff faehrt er gratis. Der Badge bleibt dafuer in den
       Daten und steht hier — in der Zeile waere er neben "Jum ok" nur Laerm. */
    var zusatz = badgeKind(p) === 'dog' ? p.badge : null;
    var wann = d.q === 'ihr' ? kurzDatum(d.at) : '';

    var h = '<p class="dogrow dogrow--' + state + '">' + ICON.dog
      + '<span>' + esc(text)
      + (wann ? '<span class="dogrow__x">notiert am ' + esc(wann)
          + ' · überschreibt den Katalog</span>' : '')
      + (zusatz ? '<span class="dogrow__x">' + esc(zusatz) + '</span>' : '')
      + '</span></p>';

    /* Die Knopfreihe darunter. Sie steht nur, wo sie etwas aendern kann:
       bei offener Regel fragt sie, bei eigener Angabe nimmt sie zurueck.
       Wo der Katalog eine Antwort hat, steht keine -- eine belegte Angabe
       mit einem Tipp umzuwerfen waere zu billig. Anrufen steht dazu, weil
       das der naechste sinnvolle Schritt ist, wenn man nicht davorsteht. */
    var tel = has(p.phone) ? telHref(p.phone) : null;
    if (state === 'unknown') {
      h += '<div class="dogask">'
        + '<p class="dogask__q">Wart ihr da? Dann tragt es ein — ab dann gilt es überall.</p>'
        + '<div class="dogask__b">'
        + '<button type="button" class="btn btn--dogyes" data-dogset="' + esc(p.id) + '" data-dogval="1">'
        + 'Jum durfte mit</button>'
        + '<button type="button" class="btn" data-dogset="' + esc(p.id) + '" data-dogval="0">'
        + 'Ging nicht</button>'
        + (tel ? '<a class="btn" href="tel:' + esc(tel) + '">Anrufen</a>' : '')
        + '</div></div>';
    } else if (d.q === 'ihr') {
      h += '<div class="dogask">'
        + '<div class="dogask__b">'
        + '<button type="button" class="btn" data-dogset="' + esc(p.id) + '" data-dogval="">'
        + 'Zurücknehmen</button>'
        + '<button type="button" class="btn" data-dogset="' + esc(p.id) + '" data-dogval="'
        + (d.v ? '0' : '1') + '">' + (d.v ? 'Doch nicht' : 'Doch, ging') + '</button>'
        + '</div></div>';
    }
    return h;
  }

  /* Setzen und sofort nur den Block neu bauen -- ein render() liesse das
     Sheet springen und den Fokus verlieren. Dieselbe Entscheidung wie beim
     Abhaken in "Heute". */
  function dogSetzen(id, wert) {
    setDogVorOrt(id, wert);
    var p = D.places.filter(function (o) { return o.id === id; })[0];
    if (!p) return;
    var alt = $('sheet-body').querySelector('.dogrow');
    if (alt) {
      var huelle = document.createElement('div');
      huelle.innerHTML = dogHtml(p);
      var nachbar = alt.nextElementSibling;
      if (nachbar && nachbar.classList.contains('dogask')) nachbar.remove();
      alt.replaceWith.apply(alt, Array.prototype.slice.call(huelle.childNodes));
    }
    /* Die Liste dahinter traegt die Marke ebenfalls -- sie muss mitziehen,
       sobald das Sheet zugeht. Bis dahin liegt sie ohnehin unter dem Sheet. */
    listeNeuBeimSchliessen = true;
    flash(wert === null ? 'Eigene Angabe zurückgenommen'
      : wert ? 'Notiert: Jum darf mit' : 'Notiert: ging nicht');
  }
  var listeNeuBeimSchliessen = false;

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
    if (t) noteHay[id] = norm(t); else delete noteHay[id];
  }

  /* Der Weg in den Plan, an jedem Ort.

     Bis v33 fuehrte er ausschliesslich ueber die Merkliste: setDay() war nur
     ueber tagWaehler() erreichbar, und der stand nur an Zeilen, die S.saved
     schon enthielt. Der Stern war damit kein Merkmal, sondern ein Tor --
     sechs Tipps und ein Reiterwechsel, um einen gefundenen Ort auf den
     Mittwoch zu legen. Im Tages-Sheet fuer Mittwoch waren 6 von 101 Orten
     erreichbar.

     Jetzt steht der Waehler im Sheet jedes Ortes, also zwei Tipps entfernt:
     oeffnen, Tag waehlen. Wer einen Tag waehlt, merkt den Ort damit auch --
     "verplant" ohne "gemerkt" gaebe es sonst als dritten Zustand, und die
     Zahlen im Plan stimmten nicht mehr.

     Wieder ein natives select, aus demselben Grund wie im Plan: auf dem
     Zielgeraet oeffnet iOS sein Waehlrad. */
  function tagWaehlerHtml(p) {
    var tage = tripTage();
    if (!tage.length) return '';
    var heute = isoTag(new Date());
    var tag = planTagVon(p.id, tagKennungen());
    var o = '<option value=""' + (tag ? '' : ' selected') + '>Noch keinem Tag</option>';
    tage.forEach(function (t) {
      /* Vergangene Reisetage stehen als vergangen da und lassen sich nicht
         mehr waehlen -- bis v33 trugen sie im Reiseraster ein "+", und am
         letzten Reisetag waren 14 von 15 Zellen ein totes Angebot. */
      var vorbei = t.iso < heute;
      o += '<option value="' + t.iso + '"' + (tag === t.iso ? ' selected' : '')
        + (vorbei && tag !== t.iso ? ' disabled' : '') + '>'
        + t.kurz + (t.iso === heute ? ' · heute' : vorbei ? ' · vorbei' : '') + '</option>';
    });
    return '<div class="sheetday' + (tag ? ' sheetday--zu' : '') + '">'
      + '<label class="sheetday__l" for="sheet-day">Reisetag</label>'
      + '<span class="pday' + (tag ? ' pday--zu' : '') + '">'
      + '<select id="sheet-day" data-day="' + esc(p.id) + '"'
      + ' aria-label="' + esc(p.name) + ' einem Reisetag zuordnen">'
      + o + '</select></span></div>';
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
      + tagWaehlerHtml(p)
      + '<div class="actrow">'
      + '<button type="button" class="act" data-save="' + esc(p.id) + '" aria-pressed="'
      + (on ? 'true' : 'false') + '">' + ICON.star
      + '<span>' + (on ? 'Im Vorrat' : 'Für später') + '</span></button>'
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

    /* Der Tagesplan in "Heute" traegt Zaehler ("1 von 3") und Restzeit --
       beides muss mitwandern. Nur dieser Block wird neu gebaut, nicht die
       ganze Ansicht: ein render() liesse die Seite springen, und genau
       deshalb faehrt diese Funktion oben ueberall von Hand nach.
       Der Fokus kommt danach zurueck auf denselben Haken, sonst verliert
       ihn jeder, der mit der Tastatur abhakt. */
    var block = document.querySelector('.planheut');
    if (block && S.view === 'heute') {
      var frisch = planHeuteHtml(new Date());
      var hatteFokus = document.activeElement
        && document.activeElement.getAttribute
        && document.activeElement.getAttribute('data-seen') === id;
      if (frisch) {
        block.outerHTML = frisch;
        if (hatteFokus) {
          var wieder = document.querySelector('.planheut [data-seen="' + id.replace(/"/g, '\\"') + '"]');
          if (wieder) { try { wieder.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
        }
      } else {
        block.remove();
      }
      syncTabs();
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
    /* Die Tageszuordnung faehrt mit — nur fuer Orte, die im Link stehen.
       v bleibt 1: ein Empfaenger mit aelterer Fassung ignoriert d einfach. */
    var d = {};
    S.saved.forEach(function (id) { if (S.days[id]) d[id] = S.days[id]; });
    if (Object.keys(d).length) payload.d = d;
    /* Die vor Ort geklaerten Hundregeln fahren mit -- und zwar ALLE, nicht
       nur die zu gemerkten Orten: "Jum durfte rein" ist eine Tatsache ueber
       den Ort, keine Markierung an einer Liste. Sie ist das Wertvollste, was
       auf so einer Reise entsteht, und sie soll beide Telefone erreichen.
       v bleibt 1: eine aeltere Fassung ignoriert h einfach. */
    if (Object.keys(S.dog).length) {
      var hh = {};
      Object.keys(S.dog).forEach(function (id) {
        hh[id] = [S.dog[id].v ? 1 : 0, S.dog[id].at || ''];
      });
      payload.h = hh;
    }
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
      var tagOk = tagKennungen();
      var tage = {};
      Object.keys(data.d || {}).forEach(function (id) {
        if (known[id] && tagOk[String(data.d[id] || '')]) tage[id] = String(data.d[id]);
      });
      var hunde = {};
      Object.keys(data.h || {}).forEach(function (id) {
        var e = data.h[id];
        if (known[id] && Array.isArray(e) && (e[0] === 0 || e[0] === 1)) {
          hunde[id] = { v: e[0] === 1, at: typeof e[1] === 'string' ? e[1].slice(0, 16) : '' };
        }
      });
      return { m: keep(data.m), g: keep(data.g), n: notizen, d: tage, h: hunde,
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
    var fremdeTage = incoming.d || {};
    var fremdeHunde = incoming.h || {};
    if (mode === 'replace') {
      rueck = { saved: S.saved.slice(), seen: S.seen.slice(),
                notes: JSON.parse(JSON.stringify(S.notes)),
                days: JSON.parse(JSON.stringify(S.days)),
                dog: JSON.parse(JSON.stringify(S.dog)) };
      S.saved = incoming.m.slice();
      S.seen = incoming.g.slice();
      S.notes = JSON.parse(JSON.stringify(fremd));
      noteHayNeu();
      S.days = JSON.parse(JSON.stringify(fremdeTage));
      S.dog = JSON.parse(JSON.stringify(fremdeHunde));
    } else {
      incoming.m.forEach(function (id) { if (S.saved.indexOf(id) < 0) S.saved.push(id); });
      incoming.g.forEach(function (id) { if (S.seen.indexOf(id) < 0) S.seen.push(id); });
      /* Beim Zusammenfuehren gewinnt die eigene Notiz: sie steht fuer etwas,
         das man selbst vor Ort erfahren hat. */
      Object.keys(fremd).forEach(function (id) { if (!S.notes[id]) S.notes[id] = fremd[id]; });
      noteHayNeu();
      /* Auch hier gewinnt die eigene Planung: ein fremder Tag fuellt nur
         Luecken. */
      Object.keys(fremdeTage).forEach(function (id) { if (!S.days[id]) S.days[id] = fremdeTage[id]; });
      /* Hundregeln sind die Ausnahme von "die eigene gewinnt": hier gewinnt
         die JUENGERE. Es sind keine Markierungen an einer Liste, sondern
         Beobachtungen ueber einen Ort -- und wer zuletzt davorstand, weiss
         es besser. Ohne Datum verliert die fremde Angabe. */
      Object.keys(fremdeHunde).forEach(function (id) {
        var eigen = S.dog[id], fremdE = fremdeHunde[id];
        if (!eigen) { S.dog[id] = fremdE; return; }
        if ((fremdE.at || '') > (eigen.at || '')) S.dog[id] = fremdE;
      });
    }
    lsSet(LS_SAVED, S.saved);
    lsSet(LS_SEEN, S.seen);
    lsSet(LS_NOTES, S.notes);
    lsSet(LS_DAYS, S.days);
    lsSet(LS_DOG, S.dog);
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
    noteHayNeu();
    S.days = JSON.parse(JSON.stringify(rueck.days || {}));
    lsSet(LS_SAVED, S.saved);
    lsSet(LS_SEEN, S.seen);
    lsSet(LS_NOTES, S.notes);
    lsSet(LS_DAYS, S.days);
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

  /* Der Tag eines Orts, sofern er ein gueltiger Reisetag ist -- eine alte
     Zuordnung ausserhalb des Zeitraums zaehlt als "offen", nicht als Tag. */
  function planTagVon(id, gueltig) {
    var t = S.days[id] || '';
    return gueltig[t] ? t : '';
  }

  function tagKennungen() {
    var g = {};
    tripTage().forEach(function (t) { g[t.iso] = t; });
    return g;
  }

  function movePlan(id, delta) {
    /* Verschoben wird innerhalb der eigenen Gruppe (derselbe Tag oder
       "offen"), nicht in der globalen Liste: seit die Ansicht nach Tagen
       gruppiert, waere ein globaler Nachbar oft unsichtbar in einer anderen
       Gruppe -- man tippte und sah nichts passieren. Getauscht werden die
       globalen Positionen der beiden Gruppen-Nachbarn; alles dazwischen
       bleibt unberuehrt. */
    var gueltig = tagKennungen();
    var meine = planTagVon(id, gueltig);
    var gruppe = S.saved.filter(function (x) { return planTagVon(x, gueltig) === meine; });
    var k = gruppe.indexOf(id);
    var nachbar = gruppe[k + delta];
    if (k < 0 || nachbar === undefined) return;
    var i = S.saved.indexOf(id), j = S.saved.indexOf(nachbar);
    S.saved[i] = nachbar; S.saved[j] = id;
    lsSet(LS_SAVED, S.saved);
    /* Seit v36 wird im Tages-Sheet umsortiert, nicht mehr in der Uebersicht.
       Ein render() baute dort die Liste DAHINTER neu und liesse das Sheet
       stehen, wie es war -- die Reihenfolge haette sich nicht sichtbar
       geaendert. Also das Sheet neu bauen und den Fokus zurueckgeben. */
    if (!$('sheet').hidden && S.dayOpen) {
      var war = document.activeElement;
      var richtung = war && war.hasAttribute && war.hasAttribute('data-down') ? 'down' : 'up';
      $('sheet-body').innerHTML = daySheetHtml(S.dayOpen);
      listeNeuBeimSchliessen = true;
      var wieder = $('sheet-body').querySelector(
        '[data-' + richtung + '="' + id.replace(/"/g, '\\"') + '"]:not([disabled])')
        || $('sheet-body').querySelector(
          '[data-' + (richtung === 'up' ? 'down' : 'up') + '="' + id.replace(/"/g, '\\"') + '"]');
      if (wieder) { try { wieder.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
      return;
    }
    render();
  }

  function setDay(id, iso) {
    if (iso) S.days[id] = iso; else delete S.days[id];
    lsSet(LS_DAYS, S.days);
    /* Einen Tag zu waehlen heisst, den Ort einzuplanen -- und Verplantes ist
       im Haus eine Teilmenge des Gemerkten. Ohne diese Zeile gaebe es einen
       dritten Zustand ("verplant, aber nicht gemerkt"), und die Zahlen an der
       Umschaltleiste im Plan zaehlten aneinander vorbei. Das ist der Weg, den
       der Waehler im Ortssheet seit v34 aufmacht: wer plant, merkt. */
    if (iso && S.saved.indexOf(id) < 0) {
      S.saved.push(id);
      lsSet(LS_SAVED, S.saved);
      syncTabs();
    }
    /* Kommt der Ruf aus einem offenen Sheet, wuerde render() die Liste
       darunter neu bauen und den Fokus aus dem Sheet reissen. Dann reicht es,
       beim Schliessen neu zu zeichnen. */
    if (!$('sheet').hidden) {
      listeNeuBeimSchliessen = true;
      var tag = iso ? tripTage().filter(function (t) { return t.iso === iso; })[0] : null;
      flash(tag ? 'Eingeplant: ' + tag.kurz : 'Tag gelöst');
      var huelle = $('sheet-body').querySelector('.sheetday');
      if (huelle) huelle.classList.toggle('sheetday--zu', !!iso);
      var stern = $('sheet-body').querySelector('[data-save]');
      if (stern && iso) {
        stern.setAttribute('aria-pressed', 'true');
        var txt = stern.querySelector('span:not(.sr-only)');
        if (txt) txt.textContent = 'Im Vorrat';
      }
      return;
    }
    render();
    /* Der Neuaufbau wirft den Fokus weg; fuer Tastaturnutzer gehoert er
       zurueck auf den Waehler desselben Orts. */
    var wieder = $('list').querySelector('select[data-day="' + id.replace(/"/g, '\\"') + '"]');
    if (wieder) { try { wieder.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
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

  /* --- Wege zwischen zwei Orten ---------------------------------------

     Bis v36 kannte die App nur Entfernungen AB DEM ZELTPLATZ: walk_min und
     distance_km stehen je Ort, nicht je Paar. Damit liess sich kein Tag
     ehrlich summieren -- "4,5 h" hiess "4,5 h Aufenthalt und null Wege", und
     bei vier Stationen quer um den See fehlten darin zwei Stunden.

     Geroutet wird nicht: ein Routing-Dienst braucht Netz, und diese App
     funktioniert im Flugmodus. Gerechnet wird aus der Luftlinie, die bei
     allen 101 Orten vorliegt:

         weg_km  = luftlinie_km × 1,50        (Umwegfaktor Strasse/Luft)
         zu Fuss = weg_km / 4,5 km/h          (mit Hund, mit Pausen)
         mit Rad = weg_km / 15 km/h
         mit Auto= weg_km / 45 km/h + 10 Min Parken

     Beide Zahlen stammen aus den eigenen Daten, nicht aus einer Faustregel:
     scripts/make-matrix.mjs rechnet sie aus den 48 gemessenen Fusswegen aus
     und meldet die Abweichung. Der Median Strasse/Luftlinie ueber alle 101
     Orte ist 1,50, die Geschwindigkeit distance_km/walk_min ist im Median
     4,50 km/h -- beides auf zwei Stellen genau so, wie es hier steht.

     Zwei Ehrlichkeitsregeln gehoeren dazu:

     1. Geschaetztes traegt ein "≈". Gemessenes (walk_min ab dem Zeltplatz)
        nicht. Dieselbe Beweislast, die hoursWindow() schon traegt.
     2. Ueber 8 km wird nicht mehr zu Fuss gerechnet. Ein Tag mit Verona ist
        ein Autotag; die Rechnung sagt das, statt vier Stunden Fussweg zu
        behaupten. */
  var UMWEG       = 1.50;   /* Median Strasse/Luftlinie, alle 101 Orte */
  var V_FUSS      = 4.5;    /* km/h -- Median aus 48 gemessenen Fusswegen */
  var V_RAD       = 15;
  var V_AUTO      = 45;
  var PARKEN_MIN  = 10;
  var FUSS_MAX_KM = 8;
  var MODI = {
    fuss: { v: V_FUSS, fix: 0,          name: 'zu Fuß' },
    rad:  { v: V_RAD,  fix: 0,          name: 'mit dem Rad' },
    auto: { v: V_AUTO, fix: PARKEN_MIN, name: 'mit dem Auto' }
  };

  /* Wegstrecke zwischen zwei Orten in km, oder null. */
  function wegKm(a, b) {
    var luft = airKm(a, b);
    return luft === null ? null : luft * UMWEG;
  }

  /* Minuten fuer eine Strecke in einem Modus. Der feste Zuschlag faellt je
     Fahrt an, nicht je Kilometer -- Parken kostet einmal. */
  function wegMin(strecke, modus) {
    if (strecke === null || !isFinite(strecke)) return null;
    var m = MODI[modus] || MODI.fuss;
    return Math.round(strecke / m.v * 60 + (strecke > 0.05 ? m.fix : 0));
  }

  /* Der Modus, den ein Tag vertraegt. Entscheidend ist der GROESSTE Sprung:
     eine Kette mit einem Sprung von 30 km ist kein Fussweg, auch wenn die
     anderen drei je 500 m lang sind. Gewaehltes schlaegt Gerechnetes -- wer
     den Tag als Radtag markiert hat, bekommt Radzeiten. */
  function tagModus(iso, orte) {
    if (S.mode[iso] && MODI[S.mode[iso]]) return S.mode[iso];
    return tagModusVorschlag(orte);
  }

  function tagModusVorschlag(orte) {
    var max = 0;
    for (var i = 1; i < (orte || []).length; i++) {
      var d = wegKm(orte[i - 1], orte[i]);
      if (d !== null && d > max) max = d;
    }
    return max > FUSS_MAX_KM ? 'auto' : 'fuss';
  }

  function setTagModus(iso, modus) {
    if (!MODI[modus]) delete S.mode[iso];
    else S.mode[iso] = modus;
    lsSet(LS_MODE, S.mode);
  }

  /* Die Wege einer Tageskette: je Nachbarpaar km und Minuten, dazu die
     Summe. Paare ohne geo fehlen -- sie zaehlen nicht mit und werden
     gezaehlt, damit die Summe sagen kann, worauf sie sich stuetzt. */
  function tagWege(orte, modus) {
    var wege = [], min = 0, km = 0, luecken = 0, weit = 0;
    for (var i = 1; i < (orte || []).length; i++) {
      var d = wegKm(orte[i - 1], orte[i]);
      if (d === null) { wege.push(null); luecken++; continue; }
      var t = wegMin(d, modus);
      wege.push({ km: d, min: t });
      min += t; km += d;
      if (d > weit) weit = d;
    }
    return { wege: wege, min: min, km: km, luecken: luecken, weit: weit };
  }

  /* "≈ 12 Min" / "≈ 1,2 km · 16 Min". Alles hier ist gerechnet, also traegt
     jede Ausgabe das Zeichen. */
  function wegText(w, modus) {
    if (!w) return '';
    return '≈ ' + km(w.km) + ' · ' + dur(w.min) + ' ' + (MODI[modus] || MODI.fuss).name;
  }

  /* --- Die kuerzeste Runde --------------------------------------------

     Die README fuehrte "Sortierung nach kuerzester Runde" seit v28 unter
     "Spaeter angedacht". Sie war nicht machbar, solange die App keine Wege
     zwischen zwei Orten kannte -- seit v37 kennt sie welche.

     Gerechnet wird eine RUNDE, kein Pfad: abends schlaeft man wieder auf dem
     Zeltplatz, also gehoeren Hin- und Rueckweg dazu. Ein Pfad haette die
     letzte Station ans andere Ende des Sees gelegt und den Rueckweg
     verschwiegen.

     Bis acht Stationen wird exakt gerechnet: 7! = 5 040 Reihenfolgen ab
     festem Start, in unter fuenf Millisekunden. Darueber Naechster-Nachbar
     plus 2-opt -- das ist bei dieser Groesse praktisch immer optimal und
     braucht kein Fremdpaket. Dieselbe Begruendung wie beim Buendeln der
     Nadeln in v25: die naive Schleife war bei 101 Punkten schneller als der
     Aufwand, ein Paket einzubinden.

     Orte ohne geo koennen nicht einsortiert werden. Sie bleiben in ihrer
     Reihenfolge und haengen hinten an -- geraten wird nicht. */
  var RUNDE_EXAKT = 8;

  function rundenKm(folge, start) {
    var summe = 0, vorher = start;
    for (var i = 0; i < folge.length; i++) {
      var d = wegKm(vorher, folge[i]);
      if (d === null) return null;
      summe += d;
      vorher = folge[i];
    }
    var zurueck = wegKm(vorher, start);
    return zurueck === null ? null : summe + zurueck;
  }

  /* Alle Reihenfolgen durchgehen. Nur fuer kleine Mengen -- der Aufrufer
     entscheidet, ob er darf. */
  function exakteRunde(orte, start) {
    var beste = null, bestKm = Infinity;
    var idx = orte.map(function (_, i) { return i; });
    (function permutiere(rest, gebaut) {
      if (!rest.length) {
        var folge = gebaut.map(function (i) { return orte[i]; });
        var d = rundenKm(folge, start);
        if (d !== null && d < bestKm) { bestKm = d; beste = folge; }
        return;
      }
      for (var i = 0; i < rest.length; i++) {
        permutiere(rest.slice(0, i).concat(rest.slice(i + 1)), gebaut.concat([rest[i]]));
      }
    }(idx, []));
    return beste;
  }

  /* Naechster Nachbar ab dem Start, danach 2-opt: solange zwei Kanten
     tauschen, wie das die Runde verkuerzt. */
  function heuristischeRunde(orte, start) {
    var offen = orte.slice(), folge = [], hier = start;
    while (offen.length) {
      var k = 0, best = Infinity;
      for (var i = 0; i < offen.length; i++) {
        var d = wegKm(hier, offen[i]);
        if (d !== null && d < best) { best = d; k = i; }
      }
      hier = offen[k];
      folge.push(hier);
      offen.splice(k, 1);
    }
    var besser = true, runden = 0;
    while (besser && runden < 50) {
      besser = false; runden++;
      for (var a = 0; a < folge.length - 1; a++) {
        for (var b = a + 1; b < folge.length; b++) {
          var neu = folge.slice(0, a).concat(
            folge.slice(a, b + 1).reverse(), folge.slice(b + 1));
          var alt = rundenKm(folge, start), jetzt = rundenKm(neu, start);
          if (alt !== null && jetzt !== null && jetzt < alt - 0.0001) {
            folge = neu; besser = true;
          }
        }
      }
    }
    return folge;
  }

  /* Der Vorschlag fuer einen Tag. Gibt null, wenn nichts zu holen ist --
     zu wenige Stationen, kein Bezugspunkt oder keine Koordinaten. */
  function rundenVorschlag(orte, modus) {
    var start = D && D.meta && D.meta.base_geo ? { geo: D.meta.base_geo } : null;
    if (!start) return null;
    var mit = orte.filter(function (p) { return p.geo; });
    var ohne = orte.filter(function (p) { return !p.geo; });
    if (mit.length < 3) return null;     /* unter drei gibt es nichts zu drehen */

    var jetzt = rundenKm(mit, start);
    var beste = mit.length <= RUNDE_EXAKT
      ? exakteRunde(mit, start)
      : heuristischeRunde(mit, start);
    if (!beste) return null;
    var neuKm = rundenKm(beste, start);
    if (neuKm === null || jetzt === null) return null;

    return {
      orte: beste.concat(ohne),
      exakt: mit.length <= RUNDE_EXAKT,
      ohne: ohne.length,
      km: neuKm, altKm: jetzt,
      min: wegMin(neuKm, modus), altMin: wegMin(jetzt, modus),
      gleich: beste.every(function (p, i) { return mit[i] && mit[i].id === p.id; })
    };
  }

  /* --- Der Umweg: was ein Ort den heutigen Tag zusaetzlich kostet -------

     Bis v36 sagte der Vorschlag in "Jetzt", WAS er vorschlaegt, aber nie,
     was es kostet, ihn mitzunehmen. Bei einem Tag mit vier Stationen ist das
     die entscheidende Zahl: ein Ort auf dem Weg kostet fuenf Minuten, einer
     am anderen Ende des Sees zwei Stunden -- und beide sahen gleich
     einladend aus.

     Gerechnet wird die guenstigste EINFUEGESTELLE in die Kette des Tages,
     Zeltplatz am Anfang und am Ende:

         umweg = d(vorher, neu) + d(neu, nachher) - d(vorher, nachher)

     Das ist der ehrliche Preis: was der Tag laenger wird, nicht die
     Entfernung vom Zeltplatz. Ohne geo, ohne Tagesplan oder ohne
     Bezugspunkt gibt es keine Zahl -- und dann steht auch keine da. */
  function umwegFuer(p, orte, modus) {
    var start = D && D.meta && D.meta.base_geo ? { geo: D.meta.base_geo } : null;
    if (!start || !p || !p.geo || !orte || !orte.length) return null;
    var kette = [start].concat(orte.filter(function (o) { return o.geo; }), [start]);
    if (kette.length < 2) return null;

    var beste = null;
    for (var i = 0; i < kette.length - 1; i++) {
      var hin = wegKm(kette[i], p), weiter = wegKm(p, kette[i + 1]);
      var direkt = wegKm(kette[i], kette[i + 1]);
      if (hin === null || weiter === null || direkt === null) continue;
      var mehr = hin + weiter - direkt;
      if (beste === null || mehr < beste.km) {
        beste = { km: mehr, pos: i,
                  nach: i === 0 ? null : kette[i].name || null };
      }
    }
    if (!beste) return null;
    beste.min = wegMin(beste.km, modus || 'fuss');
    return beste;
  }

  /* Einfuegen an genau dieser Stelle: der Ort bekommt den heutigen Tag,
     landet in der Merkliste und steht in der Reihenfolge dort, wo er den
     kleinsten Umweg macht. */
  function einfuegenHeute(id) {
    var heute = isoTag(new Date());
    var gueltig = tagKennungen();
    var ort = D.places.filter(function (x) { return x.id === id; })[0];
    if (!ort) return false;
    var drin = planList().filter(function (x) { return planTagVon(x.id, gueltig) === heute; });
    var u = umwegFuer(ort, drin, tagModus(heute, drin));

    S.days[id] = heute;
    lsSet(LS_DAYS, S.days);
    if (S.saved.indexOf(id) < 0) S.saved.push(id);
    else S.saved.splice(S.saved.indexOf(id), 1), S.saved.push(id);

    /* Die Stelle in der Tagesgruppe auf die Position im globalen Array
       uebersetzen -- wie beim Verschieben mit den Pfeilen bleibt alles
       ausserhalb der Gruppe unberuehrt. */
    if (u) {
      var gruppe = S.saved.filter(function (x) { return planTagVon(x, gueltig) === heute; });
      var ohne = gruppe.filter(function (x) { return x !== id; });
      var neu = ohne.slice(0, u.pos).concat([id], ohne.slice(u.pos));
      var plaetze = [];
      S.saved.forEach(function (x, i) { if (planTagVon(x, gueltig) === heute) plaetze.push(i); });
      neu.forEach(function (x, i) { if (plaetze[i] !== undefined) S.saved[plaetze[i]] = x; });
    }
    lsSet(LS_SAVED, S.saved);
    return true;
  }

  /* Uebernehmen heisst: die globalen Positionen der Tagesgruppe in
     pk.saved neu belegen. Alles ausserhalb der Gruppe bleibt unberuehrt --
     dieselbe Regel wie beim Verschieben mit den Pfeilen. */
  function setzeRunde(iso) {
    var gueltig = tagKennungen();
    var drin = planList().filter(function (p) { return planTagVon(p.id, gueltig) === iso; });
    var v = rundenVorschlag(drin, tagModus(iso, drin));
    if (!v || v.gleich) return false;
    var plaetze = [];
    S.saved.forEach(function (id, i) {
      if (planTagVon(id, gueltig) === iso) plaetze.push(i);
    });
    v.orte.forEach(function (p, i) {
      if (plaetze[i] !== undefined) S.saved[plaetze[i]] = p.id;
    });
    lsSet(LS_SAVED, S.saved);
    return true;
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

  var PLAN_FAR = 1.2;   // ab hier ist die Luftlinie zwischen zwei Stationen erwaehnenswert
  /* Ab einer dreiviertel Stunde ist ein Weg kein Uebergang mehr, sondern ein
     Programmpunkt -- dann wird er hervorgehoben. Gemessen an der Zeit, nicht
     an der Strecke: fuenf Kilometer sind mit dem Rad zwanzig Minuten und zu
     Fuss mehr als eine Stunde. Die Grenze lag zuerst bei 30 Minuten -- an
     einem gewoehnlichen Fusstag um den Hafen stand dann JEDER Weg in Ziegel,
     und eine Warnung, die immer leuchtet, warnt vor nichts. */
  var WEG_LANG = 45;

  /* Die Reiseuebersicht: alle Reisetage auf einen Blick.

     Gemessen an einem realistischen Stand -- 20 gemerkte Orte, sieben davon
     auf drei Tage verteilt -- war die Planansicht 3402 px hoch, also viereinhalb
     Bildschirme. Sichtbar waren die drei verplanten Tage; unsichtbar blieb,
     was man beim Planen eigentlich wissen will: WELCHE der fuenfzehn Tage
     noch frei sind. Sonntag, Montag und Donnerstag standen da, Dienstag und
     Mittwoch kamen in der ganzen Ansicht nicht vor.

     Ein Raster, kein waagerechter Streifen: fuenfzehn Zellen nebeneinander
     muessten geschoben werden, und ein Tag, den man erst hervorschieben muss,
     beantwortet die Frage nicht. Fuenf Spalten passen bei 402 px ohne
     Schieben, drei Reihen zeigen die ganze Reise.

     Volle Tage sind Knoepfe und springen zu ihrer Gruppe -- bei viereinhalb
     Bildschirmen ist das der Unterschied zwischen Nachschlagen und Suchen.
     Leere Tage sind keine Knoepfe: es gibt nichts, wohin sie springen
     koennten, und ein Knopf, der nichts tut, ist schlimmer als keiner. */
  function uebersichtHtml(gueltig, heute) {
    var tage = tripTage();
    if (!tage.length) return '';

    var zahl = {};
    S.saved.forEach(function (id) {
      var t = planTagVon(id, gueltig);
      if (t) zahl[t] = (zahl[t] || 0) + 1;
    });
    /* Bis v35 erschien das Raster erst mit der ersten Zuordnung -- mit der
       Begruendung, es waere sonst ein leeres Raster ueber einer Merkliste.
       Die Merkliste darunter gibt es seit v36 nicht mehr, und wenn nichts
       geplant ist, IST das Raster die Aufforderung: fuenfzehn leere Tage mit
       einem Plus sagen deutlicher, dass hier etwas hingehoert, als jede
       Zeile Text. */
    var verplant = Object.keys(zahl).length;

    var zellen = tage.map(function (t) {
      var n = zahl[t.iso] || 0;
      var ist = t.iso === heute;
      /* Bis v33 trugen auch vergangene Tage ein "+" und luden zum Verplanen
         ein. Am 20.09. waren das sechs von fuenfzehn Zellen, am letzten
         Reisetag vierzehn -- ein Angebot, das nichts mehr bewirken kann.
         Sie bleiben sichtbar (die Reise hatte sie ja) und antippbar (man
         will nachsehen, was war), aber gedaempft und ohne Plus. */
      var vorbei = t.iso < heute;
      var kl = 'uebs__d' + (n ? ' uebs__d--voll' : ' uebs__d--leer')
        + (ist ? ' uebs__d--heute' : '') + (vorbei ? ' uebs__d--vorbei' : '');
      var innen = '<span class="uebs__w">' + t.kurz.slice(0, 2) + '</span>'
        + '<span class="uebs__n">' + t.kurz.slice(3).replace(/\.\d\d\.$/, '.') + '</span>'
        + '<span class="uebs__c">' + (n || '') + '</span>';
      /* Seit v31 sind ALLE Zellen Knoepfe und oeffnen dasselbe Sheet. Bis v30
         sprangen volle Zellen nur zu ihrer Gruppe und leere taten gar nichts
         -- fuenfzehn gleich aussehende Knoepfe, zwei Verhalten, und
         ausgerechnet der freie Tag, den die Uebersicht gerade zur Frage
         gemacht hatte, war der tote. */
      return '<button type="button" class="' + kl + '" data-dayopen="' + t.iso + '"'
        + ' aria-label="' + t.lang + ' — '
        + (n ? n + (n === 1 ? ' Ort' : ' Orte') + ' geplant' : 'noch nichts geplant')
        + (ist ? ', heute' : vorbei ? ', vorbei' : '') + ', öffnen">' + innen
        + (n || vorbei ? '' : '<span class="uebs__plus" aria-hidden="true">+</span>') + '</button>';
    }).join('');

    /* Die Zusammenfassung sagt, was das Raster zeigt. Seit v31 tragen die
       leeren Zellen kein aria-hidden mehr: sie sind Knoepfe geworden, und
       ein unsichtbarer Knopf waere schlimmer als eine Zeile mehr Vorlesetext
       -- ihr Label sagt ausserdem "noch nichts geplant", ist also keine
       leere Datumsangabe. */
    /* "Noch ohne Plan" zaehlt nur, was noch kommt -- ein freier Montag vom
       14. ist keine Luecke mehr, sondern Vergangenheit. */
    var frei = tage.filter(function (t) { return !zahl[t.iso] && t.iso >= heute; }).length;
    /* Kein eigener Kopf mehr: seit v36 steht direkt darueber "Fünfzehn Tage ·
       4 verplant", und "Reiseplan · 4 von 15 Tagen verplant" sagte dasselbe
       noch einmal. Fuer Vorleser bleibt die Auskunft als sr-only stehen. */
    return '<section class="uebs" aria-label="Reiseplan">'
      + '<p class="sr-only">' + verplant + ' von ' + tage.length + ' Tagen verplant.</p>'
      + '<div class="uebs__g">' + zellen + '</div>'
      + (frei ? '<p class="sr-only">' + frei + (frei === 1 ? ' Tag ist' : ' Tage sind')
          + ' noch ohne Plan.</p>' : '')
      + '</section>';
  }

  /* Ein Reisetag als Sheet: was an dem Tag steht, und was man aus der
     Merkliste dazulegen kann.

     Bis v30 zeigte die Reiseuebersicht, dass Mittwoch frei ist -- aber von
     dort aus liess sich nichts damit anfangen. Man sah die Luecke und musste
     sie unten in der Merkliste suchen, den richtigen Ort finden und dessen
     Waehler auf den richtigen Tag stellen. Drei Schritte fuer etwas, das die
     Uebersicht gerade erst zur Frage gemacht hatte.

     Alle fuenfzehn Zellen oeffnen dasselbe Sheet -- fuenfzehn gleich
     aussehende Knoepfe muessen dasselbe tun. Fuer den Weg in den Plan steht
     im Sheet ein eigener Verweis; so gibt es einen Einstieg statt zweier,
     die sich nach Fuellstand unterscheiden.

     Das Sheet bleibt beim Hinzufuegen offen: einen Tag fuellt man selten mit
     einem einzigen Ort, und jedes Mal neu zu oeffnen waere eine Strafe fuers
     Planen. Dieselbe Entscheidung wie beim Filter-Sheet. */
  /* Der Bezugspunkt eines Tages und der danach sortierte Vorrat.

     Bis v31 stand die Merkliste im Tages-Sheet in der Reihenfolge, in der
     man gemerkt hat -- bei zwanzig Eintraegen sucht man darin. Gemessen wird
     gegen den NAECHSTEN schon verplanten Ort des Tages, nicht gegen deren
     Mittelpunkt: liegen Verona und Peschiera an einem Tag, faellt der
     Mittelpunkt auf ein Feld dazwischen, und die Reihenfolge waere nach
     niemandem sortiert. Die Frage lautet "was kann ich mitnehmen, wenn ich
     schon dort bin" -- und das misst sich am naechsten Nachbarn.

     Ist der Tag leer, gibt es keinen Anker im Tag. Dann gilt der Bezugspunkt
     der ganzen App: der Geraetestandort, wenn gesetzt, sonst der Zeltplatz.

     Die Entfernung steht an jeder Zeile und der Grund der Sortierung im
     Kopf. Eine Reihenfolge, die man nicht erklaeren kann, ist schlechter als
     gar keine -- dann raet man, warum ausgerechnet das oben steht.

     Luftlinie, keine Wegzeit: hier geht es um "liegt das nah beieinander",
     nicht um eine Dauer. Seit v37 rechnet die App zwar Wege -- aber erst,
     wenn ein Ort WIRKLICH an dem Tag steht. Eine Wegzeit an jeder Zeile des
     Vorrats waere eine Zahl fuer eine Entscheidung, die noch niemand
     getroffen hat.

     Eigene Funktion, weil die Suche im Sheet denselben Bezugspunkt braucht
     und beim Tippen nur die Trefferliste neu gebaut wird. */
  function tagBezug(iso) {
    var gueltig = tagKennungen();
    var alle = planList();
    var drin = alle.filter(function (p) { return planTagVon(p.id, gueltig) === iso; });
    var frei = alle.filter(function (p) { return !planTagVon(p.id, gueltig); });

    var anker = drin.slice();
    var ankerText = '';
    if (drin.length) {
      ankerText = drin.length === 1
        ? 'Nach Nähe zu ' + esc(drin[0].name)
        : 'Nach Nähe zum nächsten Ort dieses Tages';
    } else if (S.here) {
      anker = [{ geo: { lat: S.here.lat, lon: S.here.lon } }];
      ankerText = 'Nach Entfernung von deinem Standort';
    } else if (D.meta && D.meta.base_geo) {
      anker = [{ geo: D.meta.base_geo }];
      ankerText = 'Nach Entfernung vom Zeltplatz';
    }

    /* Kleinste Luftlinie zu einem der Ankerpunkte; null, wenn nicht
       bestimmbar. Orte ohne Wert stehen hinten, nicht vorne -- dieselbe
       Regel wie bei der Sortierung in der Ortsliste. */
    function naehe(o) {
      var klein = null;
      for (var i = 0; i < anker.length; i++) {
        var d = airKm(o, anker[i]);
        if (d === null) continue;
        if (klein === null || d < klein) klein = d;
      }
      return klein;
    }

    var nachNaehe = function (a, b) {
      var da = naehe(a), db = naehe(b);
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    };
    if (anker.length) frei = frei.slice().sort(nachNaehe);

    return { drin: drin, frei: frei, alle: alle, gueltig: gueltig,
             ankerText: ankerText, naehe: anker.length ? naehe : function () { return null; },
             nachNaehe: nachNaehe };
  }

  function daySheetHtml(iso) {
    var tage = tripTage();
    var tag = null;
    for (var i = 0; i < tage.length; i++) if (tage[i].iso === iso) tag = tage[i];
    if (!tag) return '';

    var heute = isoTag(new Date());
    var bez = tagBezug(iso);
    var drin = bez.drin;

    var min = 0, minN = 0;
    drin.forEach(function (p) { if (has(p.time_min)) { min += p.time_min; minN++; } });
    var modus = tagModus(iso, drin);
    var vorschlag = tagModusVorschlag(drin);
    var w = tagWege(drin, modus);

    var h = '<p class="sheet__cat">Reisetag' + (iso === heute ? ' · heute' : '') + '</p>'
      + '<h2 class="sheet__name" id="sheet-name">' + esc(tag.lang) + '</h2>';

    if (drin.length) {
      h += '<p class="tagsheet__h">An diesem Tag'
        + '<span class="tagsheet__n">' + drin.length
        + (minN || w.min ? ' · ' + (w.min ? '≈ ' : '') + esc(dur(min + w.min)) : '')
        + '</span></p>'
        /* Womit der Tag zurueckgelegt wird. Der Vorschlag kommt aus dem
           groessten Sprung der Kette: eine Kette mit einem Sprung von 30 km
           ist kein Fussweg, auch wenn die anderen drei je 500 m lang sind.
           Gewaehlt wird trotzdem von Hand -- die App weiss nicht, ob das Auto
           heute dasteht. Nur die Abweichung wird gespeichert. */
        + '<div class="wmode" role="group" aria-label="Womit dieser Tag zurückgelegt wird">'
        + ['fuss', 'rad', 'auto'].map(function (k) {
            var an = k === modus;
            return '<button type="button" class="wmode__b' + (an ? ' wmode__b--an' : '') + '"'
              + ' data-wmode="' + k + '" aria-pressed="' + (an ? 'true' : 'false') + '">'
              + esc(MODI[k].name)
              + (k === vorschlag ? '<span class="sr-only"> (vorgeschlagen)</span>' : '')
              + '</button>';
          }).join('')
        + '</div>'
        + (w.min || w.luecken
            ? '<p class="tagsheet__budget">'
              + esc(dur(min)) + ' vor Ort'
              + (w.min ? ' · ≈ ' + esc(dur(w.min)) + ' Wege · ≈ ' + esc(km(w.km)) : '')
              + (w.luecken ? ' · ' + w.luecken
                  + (w.luecken === 1 ? ' Weg ohne Koordinate' : ' Wege ohne Koordinate') : '')
              + '</p>' : '')
        /* Ueber 8 km wird nicht mehr zu Fuss gerechnet: ein Tag mit Verona
           ist ein Autotag, und vier Stunden Fussweg zu behaupten waere keine
           Auskunft, sondern eine Zumutung. */
        + (modus === 'fuss' && w.weit > FUSS_MAX_KM
            ? '<p class="tagsheet__warn">' + ICON.warn + 'Der längste Sprung ist ≈ '
              + esc(km(w.weit)) + '. Über ' + FUSS_MAX_KM
              + ' km rechnet die App keinen Fußweg mehr — das ist ein Auto- oder Radtag.</p>'
            : '')
        /* Die kuerzeste Runde. Vorgeschlagen, nicht durchgesetzt: die App
           kennt die Entfernungen, nicht die Oeffnungszeiten im Kopf des
           Planers ("erst der Markt, der macht um eins zu"). Deshalb steht
           hier ein Angebot mit Zahlen und kein stiller Umbau. */
        + (function () {
            var v = rundenVorschlag(drin, modus);
            if (!v) return '';
            if (v.gleich) {
              return '<p class="runde runde--gut">' + ICON.check
                + '<span>Die Reihenfolge ist schon die kürzeste Runde ab dem '
                + 'Zeltplatz: ≈ ' + esc(km(v.km)) + '.</span></p>';
            }
            var spart = v.altMin - v.min;
            return '<div class="runde">'
              + '<p class="runde__t">Kürzere Runde möglich</p>'
              + '<p class="runde__s">≈ ' + esc(km(v.km)) + ' statt ≈ ' + esc(km(v.altKm))
              + (spart > 0 ? ' — ≈ ' + esc(dur(spart)) + ' weniger unterwegs' : '')
              + '. Gerechnet ab dem Zeltplatz und zurück.'
              + (v.ohne ? ' ' + v.ohne + (v.ohne === 1 ? ' Station ohne' : ' Stationen ohne')
                  + ' Koordinate bleibt hinten stehen.' : '')
              + '</p>'
              + '<button type="button" class="btn" data-runde="' + esc(iso) + '">'
              + 'Reihenfolge übernehmen</button></div>';
          }())
        + '<div class="tagsheet__l">'
        + drin.map(function (p, i) {
            return '<div class="tagsheet__row tagsheet__row--drin '
              + accentClass(p.category) + '">'
              /* Die Nummer sagt, in welcher Reihenfolge der Tag gedacht ist.
                 Sie stand bis v35 an der Planzeile; seit die Uebersicht nur
                 noch zeigt, gehoert sie dorthin, wo geaendert wird. */
              + '<span class="tagsheet__nr">' + (i + 1) + '</span>'
              + '<span class="tagsheet__txt">'
              + '<span class="tagsheet__name">' + esc(p.name) + '</span>'
              + '<span class="tagsheet__m">' + esc(catLabel(p.category))
              + (has(p.time_min) ? ' · ' + esc(dur(p.time_min)) : '')
              + (S.jum ? dogKurz(p) : '') + '</span></span>'
              /* Zwei Knoepfe statt einer Wischgeste: bei einer Handvoll
                 Stationen treffsicherer, und ohne echtes iOS pruefbar.
                 Verschoben wird innerhalb des Tages -- zwischen dem letzten
                 Ort von Dienstag und dem ersten von Mittwoch liegt eine
                 Nacht, keine Wanderung. */
              + '<span class="tagsheet__move">'
              + '<button type="button" class="pmove" data-up="' + esc(p.id) + '"'
              + (i === 0 ? ' disabled' : '')
              + ' aria-label="' + esc(p.name) + ' nach vorn">'
              + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 14.5l6-6 6 6"/></svg></button>'
              + '<button type="button" class="pmove" data-down="' + esc(p.id) + '"'
              + (i === drin.length - 1 ? ' disabled' : '')
              + ' aria-label="' + esc(p.name) + ' nach hinten">'
              + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6"/></svg></button>'
              + '</span>'
              /* Herausnehmen, nicht loeschen: der Ort wandert zurueck in den
                 Vorrat, er verlaesst die Reise nicht. */
              + '<button type="button" class="tagsheet__b tagsheet__b--weg"'
              + ' data-dayset="' + esc(p.id) + '" data-dayiso=""'
              + ' aria-label="' + esc(p.name) + ' von diesem Tag herunternehmen">'
              + ICON.minus + '</button>'
              + '</div>'
              /* Der Weg zur naechsten Station. Er gilt Nachbarn DESSELBEN
                 Tages -- zwischen dem letzten Ort von Dienstag und dem
                 ersten von Mittwoch liegt eine Nacht, keine Wanderung.
                 Fehlt geo bei einer der beiden, bleibt die Zeile weg statt
                 zu raten; bis v36 stand hier nur eine Warnung ab 1,2 km
                 Luftlinie, und zwischen den anderen Stationen gar nichts. */
              + (function () {
                  var weg = w.wege[i];
                  if (!weg) return '';
                  return '<p class="tagweg' + (weg.min >= WEG_LANG ? ' tagweg--weit' : '')
                    + '">' + (weg.min >= WEG_LANG ? ICON.warn : '')
                    + '<span>≈ ' + esc(km(weg.km)) + ' · ' + esc(dur(weg.min)) + ' '
                    + esc(MODI[modus].name) + '</span></p>';
                }());
          }).join('')
        + '</div>'
        + '<button type="button" class="btn btn--wide" data-daygoto="' + esc(iso) + '">'
        + 'In der Reise anzeigen</button>';
    } else {
      h += '<p class="tagsheet__leer">Für diesen Tag ist noch nichts geplant.</p>';
    }

    /* Das Suchfeld geht ueber ALLE 101 Orte, nicht nur ueber den Vorrat.
       Bis v37 brauchte "am Mittwoch die Rocca ansehen" sechs Schritte:
       Reiter wechseln, suchen, oeffnen, merken, Tag waehlen, zurueck. Jetzt
       einen. Das Feld steht ueber der Liste, weil es sie ersetzt, sobald
       etwas darin steht. */
    h += '<label class="tagsuche">'
      + '<span class="sr-only">Orte für ' + esc(tag.lang) + ' suchen</span>'
      + '<input type="search" id="tagsuche" class="tagsuche__i"'
      + ' autocorrect="off" autocomplete="off" spellcheck="false" enterkeyhint="search"'
      + ' placeholder="Alle ' + D.places.length + ' Orte durchsuchen"'
      + ' value="' + esc(S.daySuche) + '"></label>'
      + '<div id="tagtreffer">' + tagTrefferHtml(iso) + '</div>';
    return h;
  }

  /* Die Liste unter dem Suchfeld. Ohne Suchbegriff ist es der Vorrat, mit
     Begriff die Suche ueber alle Orte -- ohne die, die an diesem Tag schon
     stehen. Eigene Funktion, weil beim Tippen nur SIE neu gebaut wird: ein
     neu gezeichnetes Sheet verloere den Fokus und die Schreibmarke. */
  function tagTrefferHtml(iso) {
    var tage = tripTage(), tag = null;
    for (var t = 0; t < tage.length; t++) if (tage[t].iso === iso) tag = tage[t];
    if (!tag) return '';
    var bez = tagBezug(iso);
    var q = S.daySuche.trim();
    var liste = bez.frei, kopf = 'Aus deinem Vorrat', lead = bez.ankerText, suche = false;

    if (q) {
      suche = true;
      var teile = norm(q).split(/\s+/).filter(Boolean);
      liste = D.places.filter(function (p) {
        if (planTagVon(p.id, bez.gueltig) === iso) return false;   /* steht schon da */
        var heu = suchtext(p);
        return teile.every(function (x) { return heu.indexOf(x) >= 0; });
      });
      kopf = 'Gefunden';
      /* Auch die Treffer stehen nach Naehe: dieselbe Frage wie beim Vorrat --
         was kann ich mitnehmen, wenn ich schon dort bin. */
      liste = liste.slice().sort(bez.nachNaehe);
    }

    if (!liste.length) {
      return '<p class="tagsheet__leer">'
        + (suche
            ? 'Nichts gefunden für „' + esc(q) + '“.'
            : bez.alle.length
              ? 'Alle gemerkten Orte haben schon einen Tag. Das Feld darüber '
                + 'durchsucht alle ' + D.places.length + ' Orte.'
              : 'Dein Vorrat ist leer. Das Feld darüber durchsucht alle '
                + D.places.length + ' Orte.')
        + '</p>';
    }

    return '<p class="tagsheet__h">' + kopf
      + '<span class="tagsheet__n">' + liste.length + '</span></p>'
      + (lead ? '<p class="tagsheet__lead">' + lead + '</p>' : '')
      + '<div class="tagsheet__l">'
      + liste.map(function (p) {
          var w = bez.naehe(p);
          return '<div class="tagsheet__row ' + accentClass(p.category) + '">'
            + '<span class="tagsheet__txt">'
            + '<span class="tagsheet__name">' + esc(p.name) + '</span>'
            + '<span class="tagsheet__m">' + esc(catLabel(p.category))
            + (w !== null && w !== undefined
                ? ' · <span class="tagsheet__weit">' + esc(km(w)) + '</span>' : '')
            + (has(p.time_min) ? ' · ' + esc(dur(p.time_min)) : '')
            + (closedToday(p, new Date(iso + 'T12:00:00'))
                ? ' · <span class="tagsheet__zu">an dem Tag zu</span>' : '')
            /* Was die Suche neu hereinholt, ist noch nicht gemerkt. Das
               gehoert dazugesagt: der Knopf legt es in einem Schritt auf den
               Tag UND in die Merkliste. */
            + (S.saved.indexOf(p.id) < 0
                ? ' · <span class="tagsheet__neu">noch nicht gemerkt</span>' : '')
            + '</span></span>'
            + '<button type="button" class="tagsheet__b" data-dayset="' + esc(p.id) + '"'
            + ' data-dayiso="' + esc(iso) + '"'
            + ' aria-label="' + esc(p.name) + ' auf ' + esc(tag.lang) + ' legen">'
            + ICON.plus + '</button></div>';
        }).join('')
      + '</div>';
  }


  function openDaySheet(iso) {
    S.openId = null;
    S.filterOpen = false;
    S.dayOpen = iso;
    /* Die Suche gilt diesem Besuch, nicht dem naechsten: wer einen Tag
       schliesst und einen anderen oeffnet, faengt mit dem Vorrat an, nicht
       mit dem letzten Suchbegriff. */
    S.daySuche = '';
    showSheet(daySheetHtml(iso), 'sheet--tag');
  }

  /* Der Waehler je Zeile. Ein natives select, kein eigenes Menue: auf dem
     Zielgeraet oeffnet iOS sein Waehlrad — vertraut, treffsicher, ohne
     eine Zeile eigenen Menue-Codes, den close.mjs dann absichern muesste. */
  function tagWaehler(p, tag) {
    var heute = isoTag(new Date());
    var o = '<option value=""' + (tag ? '' : ' selected') + '>Tag offen</option>';
    tripTage().forEach(function (t) {
      /* Ein vergangener Tag laesst sich nicht mehr verplanen. Er bleibt
         waehlbar, solange er der aktuelle Wert ist -- sonst verloere ein
         Ort beim naechsten Neuzeichnen still seine Zuordnung. */
      var vorbei = t.iso < heute;
      o += '<option value="' + t.iso + '"' + (tag === t.iso ? ' selected' : '')
        + (vorbei && tag !== t.iso ? ' disabled' : '') + '>'
        + t.kurz + (t.iso === heute ? ' · heute' : vorbei ? ' · vorbei' : '') + '</option>';
    });
    return '<span class="pday' + (tag ? ' pday--zu' : '') + '">'
      + '<select data-day="' + esc(p.id) + '" aria-label="' + esc(p.name) + ' einem Tag zuordnen">'
      + o + '</select></span>';
  }

  /* Eine Zeile im Vorrat. Keine Nummer und keine Pfeile: dort gibt es keine
     Reihenfolge, die etwas bedeutet. Der Tag-Waehler ist der Weg hinaus --
     er ist das einzige Bedienelement, das die Zeile braucht. */
  function planZeile(p, gueltig) {
    var seen = S.seen.indexOf(p.id) >= 0;
    return '<div class="planrow planrow--merk' + (seen ? ' planrow--seen' : '')
      + ' ' + accentClass(p.category) + '">'
      + '<span class="planrow__mid">'
      + '<button type="button" class="planrow__open" data-open="' + esc(p.id) + '">'
      + '<span class="planrow__name">' + esc(p.name) + '</span>'
      + '<span class="planrow__m">' + esc(catLabel(p.category))
      + (has(p.walk_min) ? ' · ' + p.walk_min + ' Min Weg' : '')
      + (has(p.time_min) ? ' · ' + esc(dur(p.time_min)) : '')
      + (seen ? ' · gesehen' : '') + '</span></button>'
      + tagWaehler(p, planTagVon(p.id, gueltig))
      + '</span>'
      + '</div>';
  }

  /* --- Die Reise: fuenfzehn Tage auf einen Blick ------------------------

     Bis v35 waren das zwei Haelften hinter einer Umschaltleiste: "Plan" und
     "Merkliste". Die Trennung war richtig gedacht -- der Fahrplan und der
     Vorrat sind zwei Dinge -- aber sie kostete einen Umschalter fuer etwas,
     das man beim Planen staendig zusammen braucht: man zieht aus dem Vorrat
     in einen Tag. Wer den Vorrat sehen wollte, verlor den Plan aus dem Bild.

     Seit v36 steht beides untereinander: das Raster, die Tage, der Vorrat.
     Und die Tage sind KARTEN, keine Gruppen mit Zeilen -- sie zeigen, was an
     dem Tag ansteht, und oeffnen zum Aendern dasselbe Tages-Sheet, das auch
     das Raster oeffnet. Ein Einstieg statt zweier.

     Damit wandert auch das Umsortieren ins Sheet. Es stand vorher an jeder
     Planzeile; in einer Uebersicht, die nur zeigt, hat es nichts zu suchen. */

  /* Die Tageskarte. Ein Knopf: antippen oeffnet das Tages-Sheet. */
  function tagKarteHtml(t, orte, heute) {
    var min = 0, minN = 0;
    orte.forEach(function (p) { if (has(p.time_min)) { min += p.time_min; minN++; } });

    /* Seit v37 zaehlen die Wege mit. Bis v36 hiess "4,5 h" in Wahrheit "4,5 h
       Aufenthalt und null Wege" -- bei vier Stationen quer um den See fehlten
       darin zwei Stunden, und der Tag sah machbar aus, der es nicht war.
       Gerechnet, nicht geroutet: siehe wegKm(). Alles Gerechnete traegt "≈". */
    var modus = tagModus(t.iso, orte);
    var w = tagWege(orte, modus);
    var gesamt = min + w.min;

    /* Ab 10 h wird der Tag genannt, nicht bewertet: die Grenze ist eine
       Annahme. Sie steht deshalb woertlich da. Gemessen wird jetzt an der
       Summe MIT Wegen -- das ist die Zahl, die der Tag wirklich kostet. */
    var voll = gesamt > 600;
    var istHeute = t.iso === heute;
    var vorbei = t.iso < heute;
    var fertig = orte.filter(function (p) { return S.seen.indexOf(p.id) >= 0; }).length;

    var kopf = '<span class="tagk__t">'
      + (istHeute ? 'Heute · ' : '') + esc(t.lang) + '</span>'
      + (minN || w.min ? '<span class="tagk__sum' + (voll ? ' tagk__sum--voll' : '') + '">'
          + (w.min ? '≈ ' : '') + esc(dur(gesamt))
          + (minN < orte.length ? ' (' + minN + ' von ' + orte.length + ')' : '')
          + (voll ? ' · mehr als 10 h' : '') + '</span>' : '');

    /* Die Aufteilung darunter, damit die Summe nachvollziehbar bleibt: was
       davon vor Ort vergeht und was auf dem Weg. */
    var auf = w.min
      ? '<span class="tagk__auf">' + esc(dur(min)) + ' vor Ort · ≈ '
        + esc(dur(w.min)) + ' Wege ' + esc(MODI[modus].name)
        + (w.luecken ? ' · ' + w.luecken + ' ohne Koordinate' : '') + '</span>'
      : '';

    var zeilen = orte.map(function (p, i) {
      var ab = S.seen.indexOf(p.id) >= 0;
      var weg = w.wege[i];   /* der Weg VON dieser Station zur naechsten */
      return '<li class="tagk__st' + (ab ? ' tagk__st--ab' : '') + ' '
        + accentClass(p.category) + '">'
        + '<span class="tagk__n">' + esc(p.name) + '</span>'
        + '<span class="tagk__d">'
        + (ab ? 'erledigt'
             : closedToday(p, new Date(t.iso + 'T12:00:00')) ? 'an dem Tag zu'
             : has(p.time_min) ? esc(dur(p.time_min)) : '')
        + '</span></li>'
        + (weg ? '<li class="tagk__wg' + (weg.min >= WEG_LANG ? ' tagk__wg--weit' : '') + '">'
            + '<span>≈ ' + esc(km(weg.km)) + ' · ' + esc(dur(weg.min)) + '</span></li>' : '');
    }).join('');

    return '<button type="button" class="tagk'
      + (istHeute ? ' tagk--heute' : '') + (vorbei ? ' tagk--vorbei' : '')
      + '" id="tag-' + t.iso + '" data-dayopen="' + t.iso + '"'
      + ' aria-label="' + esc(t.lang) + ', ' + orte.length
      + (orte.length === 1 ? ' Ort' : ' Orte') + ' geplant, öffnen">'
      + '<span class="tagk__h">' + kopf + '</span>'
      + auf
      + '<ul class="tagk__l">' + zeilen + '</ul>'
      + (fertig && !vorbei
          ? '<span class="tagk__f">' + fertig + ' von ' + orte.length + ' erledigt</span>'
          : '')
      + '</button>';
  }

  /* Eine Karte fuer den naechsten Tag, an dem noch nichts steht.

     Nicht fuer alle freien Tage: bei fuenfzehn Reisetagen und vier verplanten
     waeren das elf leere Karten, und die Ansicht bestuende aus Luecken. Das
     Raster darueber zeigt ohnehin alle. Was fehlt, ist der Anstoss -- und
     der gilt dem naechsten. */
  function freierTagHtml(t, vorrat) {
    return '<button type="button" class="tagk tagk--frei" data-dayopen="' + t.iso + '"'
      + ' aria-label="' + esc(t.lang) + ', noch nichts geplant, öffnen">'
      + '<span class="tagk__h"><span class="tagk__t">' + esc(t.lang) + '</span>'
      + '<span class="tagk__sum">frei</span></span>'
      + '<span class="tagk__leer">'
      + (vorrat
          ? vorrat + (vorrat === 1 ? ' Ort liegt' : ' Orte liegen') + ' im Vorrat.'
          : 'Noch nichts im Vorrat.')
      + ' Antippen zum Füllen.</span></button>';
  }

  function planHtml() {
    var gueltig = tagKennungen();
    var tage = tripTage();
    var heute = isoTag(new Date());
    var alle = planList();
    var zu = alle.filter(function (p) { return planTagVon(p.id, gueltig); });
    var vorrat = alle.filter(function (p) { return !planTagVon(p.id, gueltig); });

    var proTag = {};
    zu.forEach(function (p) {
      var t = planTagVon(p.id, gueltig);
      (proTag[t] = proTag[t] || []).push(p);
    });
    var nTage = Object.keys(proTag).length;

    /* Die Kopfzeile der Ansicht. Sie sagt, worum es geht -- fuenfzehn Tage --
       und wie weit man ist. Bis v35 stand hier eine Summenzeile, die im Plan
       Tage und Vorrat zu einer Stunde addierte, die nirgends vorkam. */
    var h = '<div class="reise__h">'
      + '<h2 class="reise__t">' + ZAHLWORT(tage.length) + ' Tage</h2>'
      + '<p class="reise__s">' + (nTage
          ? nTage + ' verplant · ' + zu.length + (zu.length === 1 ? ' Ort' : ' Orte')
          : 'noch nichts verplant') + '</p></div>';

    /* Das Raster steht jetzt IMMER da, auch ohne eine einzige Zuordnung.
       Bis v35 erschien es erst mit der ersten -- mit der Begruendung, es
       waere sonst ein leeres Raster ueber einer Merkliste. Die Merkliste
       darunter gibt es nicht mehr, und wenn nichts geplant ist, IST das
       Raster die Aufforderung. */
    h += uebersichtHtml(gueltig, heute);

    var karten = [];
    tage.forEach(function (t) {
      if (proTag[t.iso]) karten.push(tagKarteHtml(t, proTag[t.iso], heute));
    });

    /* Der naechste freie Tag, der noch kommt. */
    var frei = null;
    for (var i = 0; i < tage.length; i++) {
      if (tage[i].iso >= heute && !proTag[tage[i].iso]) { frei = tage[i]; break; }
    }
    if (frei) karten.push(freierTagHtml(frei, vorrat.length));

    h += '<div class="reise__tage">' + karten.join('') + '</div>';

    /* --- Der Vorrat ---------------------------------------------------- */
    h += '<section class="vorrat"><p class="vorrat__h">Vorrat'
      + '<span class="vorrat__n">' + vorrat.length + '</span></p>';

    if (!vorrat.length) {
      h += '<p class="vorrat__leer">'
        + (alle.length
            ? 'Jeder gemerkte Ort hat einen Reisetag.'
            : 'Noch nichts gemerkt. In „Entdecken“ legt der Tag-Wähler im Ort einen Tag fest — oder der Stern legt ihn hier ab.')
        + '</p>'
        + '<button type="button" class="btn btn--wide" id="merk-orte">Orte durchsuchen</button>';
    } else {
      /* Hier ist die Gesamtzeit eine sinnvolle Aussage: so lange braeuchte
         man fuer alles, was noch keinen Tag hat. */
      var stay = 0, stayN = 0;
      vorrat.forEach(function (p) { if (has(p.time_min)) { stay += p.time_min; stayN++; } });
      h += '<p class="vorrat__s">' + (stayN ? esc(dur(stay)) + ' Aufenthalt'
            + (stayN < vorrat.length ? ' (' + stayN + ' von ' + vorrat.length + ')' : '')
            : 'ohne hinterlegte Dauer') + '</p>'
        + '<div class="plan">' + vorrat.map(function (p) {
            return planZeile(p, gueltig);
          }).join('') + '</div>';
    }
    return h + '</section>';
  }

  /* "Fuenfzehn" statt "15": im Kopf einer Ansicht liest sich das Wort besser
     als die Ziffer, und es sind immer wenige. Darueber hinaus die Ziffer. */
  var ZAHLWORTE = ['null', 'Ein', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben',
    'Acht', 'Neun', 'Zehn', 'Elf', 'Zwölf', 'Dreizehn', 'Vierzehn', 'Fünfzehn',
    'Sechzehn', 'Siebzehn', 'Achtzehn', 'Neunzehn', 'Zwanzig'];
  function ZAHLWORT(n) { return ZAHLWORTE[n] || String(n); }

  function renderShareBar() {
    var bar = $('sharebar');
    if (S.view !== 'gemerkt') { bar.hidden = true; return; }
    bar.hidden = false;
    var n = S.saved.length, g = S.seen.length;
    /* Seit v33 sind Plan und Merkliste zwei Dinge, also nennt die Leiste
       beide Zahlen. "20 gemerkt" allein sagte nicht, wie viel davon schon
       einen Tag hat -- und genau das ist die Frage, die diese Ansicht
       beantwortet. Die zwei Zahlen ergeben zusammen die Merkliste. */
    var gPlan = tagKennungen();
    var verplant = S.saved.filter(function (id) { return planTagVon(id, gPlan); }).length;
    $('sharebar-t').textContent = n || g
      ? verplant + ' verplant · ' + (n - verplant) + ' im Vorrat · ' + g + ' gesehen'
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
      var zelle = e.target.closest('[data-dayopen]');
      if (zelle) { openDaySheet(zelle.getAttribute('data-dayopen')); return; }

      if (e.target.closest('#merk-orte')) { setView('orte'); return; }
    });

    $('list').addEventListener('change', function (e) {
      var day = e.target.closest('select[data-day]');
      if (day) setDay(day.getAttribute('data-day'), day.value);
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
      /* Die Hundregel vor Ort klaeren. Steht vorn, weil der Knopf sonst als
         nichts erkannt und der Klick durchgereicht wuerde. */
      /* Umsortieren im Tages-Sheet. Steht vorn, damit der Klick nicht als
         Ortsoeffnen durchgereicht wird. */
      var sup = e.target.closest('[data-up]');
      if (sup) { e.preventDefault(); movePlan(sup.getAttribute('data-up'), -1); return; }
      var sdown = e.target.closest('[data-down]');
      if (sdown) { e.preventDefault(); movePlan(sdown.getAttribute('data-down'), 1); return; }

      /* Womit dieser Tag zurueckgelegt wird. Nur der Sheet-Inhalt wird neu
         gebaut und der Fokus auf denselben Knopf zurueckgesetzt -- ein
         render() liesse die Seite unter dem Finger springen. Die Uebersicht
         dahinter muss trotzdem mitziehen: die Tageskarte nennt dieselbe
         Summe. */
      var wm = e.target.closest('[data-wmode]');
      if (wm && S.dayOpen) {
        e.preventDefault();
        var neu = wm.getAttribute('data-wmode');
        setTagModus(S.dayOpen, neu);
        render();
        $('sheet-body').innerHTML = daySheetHtml(S.dayOpen);
        var zurueck = $('sheet-body').querySelector('[data-wmode="' + neu + '"]');
        if (zurueck) { try { zurueck.focus({ preventScroll: true }); } catch (err) { /* egal */ } }
        return;
      }

      /* Die kuerzeste Runde uebernehmen. Wie beim Verschieben mit den
         Pfeilen: nur der Sheet-Inhalt wird neu gebaut, die Uebersicht
         dahinter zieht beim Schliessen nach. */
      var rd = e.target.closest('[data-runde]');
      if (rd && S.dayOpen) {
        e.preventDefault();
        if (setzeRunde(rd.getAttribute('data-runde'))) {
          render();
          $('sheet-body').innerHTML = daySheetHtml(S.dayOpen);
          listeNeuBeimSchliessen = true;
          var ziel = $('sheet-body').querySelector('.runde--gut, [data-runde]');
          if (ziel) { try { ziel.focus({ preventScroll: true }); } catch (err) { /* egal */ } }
        }
        return;
      }

      var ds = e.target.closest('[data-dogset]');
      if (ds) {
        e.preventDefault();
        var dwert = ds.getAttribute('data-dogval');
        dogSetzen(ds.getAttribute('data-dogset'), dwert === '' ? null : dwert === '1');
        return;
      }
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); return; }
      var seen = e.target.closest('[data-seen]');
      if (seen) { e.preventDefault(); toggleSeen(seen.getAttribute('data-seen')); return; }

      /* Tages-Sheet: Ort auf den Tag legen oder herunternehmen. Das Sheet
         bleibt offen -- einen Tag fuellt man selten mit einem einzigen Ort.
         Die Liste dahinter zieht sofort nach, wie beim Filter-Sheet. */
      var setz = e.target.closest('[data-dayset]');
      if (setz && S.dayOpen) {
        e.preventDefault();
        var wohin = setz.getAttribute('data-dayiso') || '';
        var wen = setz.getAttribute('data-dayset');
        if (wohin) S.days[wen] = wohin; else delete S.days[wen];
        lsSet(LS_DAYS, S.days);
        /* Seit v37 holt die Suche im Sheet auch Orte herein, die noch gar
           nicht gemerkt sind. Einen Tag zu waehlen heisst, ihn einzuplanen --
           und was eingeplant ist, gehoert in die Merkliste. Sonst stuende
           der Ort an dem Tag und waere in der Reise nirgends zu finden. */
        if (wohin && S.saved.indexOf(wen) < 0) {
          S.saved.push(wen);
          lsSet(LS_SAVED, S.saved);
        }
        render();
        syncTabs();
        $('sheet-body').innerHTML = daySheetHtml(S.dayOpen);
        /* Der Ort wechselt beim Zuordnen die Sektion, seinen Knopf gibt es
           aber weiterhin -- der Fokus wandert mit, statt an den Anfang des
           Sheets zu fallen. */
        var wieder = $('sheet-body').querySelector('[data-dayset="' + wen.replace(/"/g, '\\"') + '"]');
        if (wieder) { try { wieder.focus({ preventScroll: true }); } catch (err) { /* egal */ } }
        return;
      }

      var hin = e.target.closest('[data-daygoto]');
      if (hin) {
        e.preventDefault();
        var iso = hin.getAttribute('data-daygoto');
        closeSheet();
        /* Erst nach dem Schliessen scrollen: waehrend des Sheets ist body
           fixiert, ein scrollIntoView liefe ins Leere. 300 ms, der
           Schliessvorgang laeuft 260 ms nach. */
        window.setTimeout(function () {
          var ziel = document.getElementById('tag-' + iso);
          if (!ziel) return;
          /* scroll-padding-top steht auf html und haelt den fixierten Kopf
             frei -- deshalb reicht scrollIntoView, ohne selbst zu rechnen. */
          try { ziel.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
          catch (err) { ziel.scrollIntoView(true); }
        }, 300);
        return;
      }


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
      if (!e.target) return;
      if (e.target.id === 'tag-q') {
        var pick = $('tagpick');
        if (pick) pick.innerHTML = tagChipsHtml(e.target.value);
        return;
      }
      /* Die Suche im Tages-Sheet. Nur die Trefferliste wird neu gebaut, nicht
         das Sheet: ein neu gezeichnetes Sheet verloere den Fokus und die
         Schreibmarke -- mitten im Wort. Dieselbe Entscheidung wie beim
         Tag-Suchfeld im Filter-Sheet darueber. */
      if (e.target.id === 'tagsuche' && S.dayOpen) {
        S.daySuche = e.target.value;
        var treffer = $('tagtreffer');
        if (treffer) treffer.innerHTML = tagTrefferHtml(S.dayOpen);
      }
    });

    /* Die Suche im Wissen. Sie baut die ganze Ansicht neu -- anders als im
       Tages-Sheet, wo der Fokus im Feld bleiben muss. Hier steht das Feld
       in der Liste, und ein render() wuerde es mitsamt Fokus ersetzen. Also
       nur den Teil darunter tauschen und den Fokus zuruecklegen. */
    $('info').addEventListener('input', function (e) {
      if (!e.target || e.target.id !== 'wq') return;
      S.wq = e.target.value;
      var pos = e.target.selectionStart;
      $('info').innerHTML = infoHtml();
      var wieder = $('wq');
      if (wieder) {
        try {
          wieder.focus({ preventScroll: true });
          wieder.setSelectionRange(pos, pos);
        } catch (err) { /* egal */ }
      }
    });

    $('info').addEventListener('click', function (e) {
      if (e.target.closest('#wq-clear')) {
        S.wq = '';
        $('info').innerHTML = infoHtml();
        var f = $('wq');
        if (f) { try { f.focus({ preventScroll: true }); } catch (err) { /* egal */ } }
        return;
      }
      if (e.target.closest('#wissen-retry')) {
        ladeWissen();
        $('info').innerHTML = infoHtml();
      }
    });

    /* Von der Ortssuche ins Wissen -- mit demselben Begriff. Ihn dort noch
       einmal eintippen zu muessen waere genau der Bruch, den die Bruecke
       schliessen soll. */
    $('wissbr').addEventListener('click', function (e) {
      if (!e.target.closest('#wissbr-go')) return;
      S.wq = S.q;
      setView('info');
      window.scrollTo(0, 0);
    });

    $('empty-reset').addEventListener('click', resetFilters);

    window.addEventListener('scroll', onScroll, { passive: true });

    $('today').addEventListener('click', function (e) {
      if (e.target.closest('#today-all')) { setView('orte'); return; }
      /* Der Weg vom leeren Tagesplan zum Fuellen: dasselbe Sheet, das auch
         das Reiseraster oeffnet. Kein zweites Bedienmuster fuer dieselbe
         Sache. */
      if (e.target.closest('#planheut-los')) { openDaySheet(isoTag(new Date())); return; }
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
      /* "In den Tag": ein Tipp statt Stern, Reiter wechseln, Tag waehlen.
         Er landet an der Stelle, an der er den kleinsten Umweg macht. */
      var ein = e.target.closest('[data-einfuegen]');
      if (ein) {
        e.preventDefault();
        if (einfuegenHeute(ein.getAttribute('data-einfuegen'))) { render(); syncTabs(); }
        return;
      }
      if (e.target.closest('#today-next')) { S.pick += 1; render(); return; }
      if (e.target.closest('#today-prev')) { S.pick = S.pick > 0 ? S.pick - 1 : 0; render(); return; }
      if (e.target.closest('#wx-dry')) { setWet(false); return; }
      if (e.target.closest('#wx-wet')) { setWet(true); return; }
      var save = e.target.closest('[data-save]');
      if (save) { e.preventDefault(); toggleSave(save.getAttribute('data-save')); render(); return; }
      /* Abhaken direkt im Tagesplan. Bis v28 kannte "Heute" kein data-seen --
         man musste den Ort erst oeffnen, um ihn als erledigt zu markieren. */
      var seen = e.target.closest('[data-seen]');
      if (seen) { e.preventDefault(); toggleSeen(seen.getAttribute('data-seen')); return; }
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
      if (f) { setzeNotiz(f.getAttribute('data-notiz'), f.value); render(); return; }
      /* Der Tag-Waehler im Ortssheet. Derselbe setDay() wie im Plan -- er
         merkt selbst, dass ein Sheet offen ist, und zeichnet die Liste erst
         beim Schliessen neu. */
      var tw = e.target.closest && e.target.closest('select[data-day]');
      if (tw) setDay(tw.getAttribute('data-day'), tw.value);
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

  /* ------------------------------------------------------ Nadeln buendeln */
  /* Im Uebersichtszustand lagen 96 von 102 Nadeln so dicht, dass sich ihre
     16-px-Punkte beruehrten, und 100 von 102 naeher als 34 px beieinander --
     gemessen bei 402 px Breite. Die Karte zeigte damit einen Fleck, keine
     Orte, und tippen konnte man die verdeckten gar nicht.

     Gebuendelt wird nach Pixelabstand im aktuellen Zoom, nicht nach einem
     Gitter ueber die Koordinaten. Ein Gitter trennt zwei Nadeln, die 2 px
     auseinanderliegen, wenn zufaellig eine Zellgrenze dazwischen laeuft --
     genau der Fall, den man sehen wuerde.

     Kein Fremdpaket: das uebliche Buendel-Plugin fuer Leaflet waere die
     zweite externe Abhaengigkeit im Projekt, und bei 101 Punkten rechnet die
     naive Schleife (101 x Gruppenzahl) in unter einer Millisekunde.

     34 px, weil eine Fingerkuppe mit 44 px angesetzt wird und zwei Nadeln,
     die naeher liegen, nicht mehr einzeln zu treffen sind. */
  var KACHEL = 34;
  var letzteOrte = [];
  var hierNadel = null;

  function buendel(orte, zoom) {
    var gruppen = [];
    orte.forEach(function (p) {
      var pt = karte.project([p.geo.lat, p.geo.lon], zoom);
      for (var i = 0; i < gruppen.length; i++) {
        var g = gruppen[i];
        if (Math.abs(g.x - pt.x) < KACHEL && Math.abs(g.y - pt.y) < KACHEL) {
          g.orte.push(p);
          /* Schwerpunkt nachziehen, sonst haengt das Buendel am ersten Ort
             und wandert bei drei Nachbarn sichtbar aus der Mitte. */
          g.x += (pt.x - g.x) / g.orte.length;
          g.y += (pt.y - g.y) / g.orte.length;
          return;
        }
      }
      gruppen.push({ x: pt.x, y: pt.y, orte: [p] });
    });

    /* Nachlauf. Der Schwerpunkt wandert beim Einsammeln, und dadurch koennen
       zwei fertige Gruppen naeher beieinander liegen als KACHEL, obwohl beim
       Einsortieren keine zu nah war. Ohne diesen Durchgang ueberlappten nach
       einem Tipp auf ein Buendel wieder zwei Nadeln -- gefunden nicht durch
       Nachdenken, sondern weil die Zusicherung "keine zwei naeher als 34 px"
       fehlschlug.

       Terminiert: jede Zusammenlegung verringert die Zahl der Gruppen. */
    var nochmal = true;
    while (nochmal) {
      nochmal = false;
      for (var i = 0; i < gruppen.length && !nochmal; i++) {
        for (var j = i + 1; j < gruppen.length; j++) {
          var a = gruppen[i], b = gruppen[j];
          if (Math.abs(a.x - b.x) < KACHEL && Math.abs(a.y - b.y) < KACHEL) {
            var n = a.orte.length + b.orte.length;
            a.x = (a.x * a.orte.length + b.x * b.orte.length) / n;
            a.y = (a.y * a.orte.length + b.y * b.orte.length) / n;
            a.orte = a.orte.concat(b.orte);
            gruppen.splice(j, 1);
            nochmal = true;
            break;
          }
        }
      }
    }
    return gruppen;
  }

  /* Groesster Pixelabstand innerhalb einer Gruppe bei gegebenem Zoom. Sagt,
     ob Hineinzoomen die Gruppe ueberhaupt noch aufteilen kann. */
  function spreizung(orte, zoom) {
    var pts = orte.map(function (p) { return karte.project([p.geo.lat, p.geo.lon], zoom); });
    var max = 0;
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        max = Math.max(max, Math.abs(pts[i].x - pts[j].x), Math.abs(pts[i].y - pts[j].y));
      }
    }
    return max;
  }

  /* Der naechste Zoom, bei dem das groesste Teilbuendel hoechstens halb so
     gross ist wie die Gruppe jetzt.

     "Zerfaellt in mindestens zwei" war zu wenig: gemessen ging die Altstadt
     damit 72 -> 61 -> 50 -> 43, drei Tipps fuer weniger als die Haelfte. Der
     Grund steckt in den Daten, nicht im Code -- 72 der 101 Orte liegen in
     einem Ortskern von wenigen hundert Metern.

     Hoechstens bis maxZ; mehr ist nicht zu holen. */
  function trennZoom(orte, vonZoom, maxZ) {
    var ziel = Math.max(2, Math.ceil(orte.length / 2));
    for (var z = vonZoom + 1; z <= maxZ; z++) {
      var groesste = 0;
      buendel(orte, z).forEach(function (g) {
        if (g.orte.length > groesste) groesste = g.orte.length;
      });
      if (groesste <= ziel) return z;
    }
    return maxZ;
  }

  /* Die Bezugspunkte: Zeltplatz und, wenn gesetzt, der Geraetestandort.

     Der Zeltplatz trug bis v25 einen Tooltip, und ein Tooltip erscheint beim
     Ueberfahren mit der Maus. Auf dem Geraet, fuer das diese App gebaut ist,
     gibt es kein Ueberfahren -- die Beschriftung war dort schlicht nie zu
     sehen, und ein dunkler Punkt unter hundert bunten sagt nichts.

     Deshalb steht der Text jetzt fest daneben, im selben Element wie der
     Punkt. interactive: false, damit der Bezugspunkt keinem Ort den Tipp
     wegnimmt -- er ist eine Auskunft, kein Bedienelement. zIndexOffset
     negativ, damit er nicht vor den Orten liegt, um die es geht. */
  function bezugNadel(lat, lon, art, text) {
    return window.L.marker([lat, lon], {
      icon: window.L.divIcon({
        className: 'mk mk--bezug mk--' + art,
        html: '<span class="mk__punkt"></span><span class="mk__text">' + esc(text) + '</span>',
        /* Feste 22x22 fuer den Punkt, damit er exakt auf der Koordinate
           sitzt. Das Schild haengt absolut darunter und darf herausragen --
           haenge es im Fluss daran, verschoebe seine Breite den Punkt. */
        iconSize: [22, 22], iconAnchor: [11, 11]
      }),
      interactive: false,
      /* Unter die Orte. Zuerst stand hier 1000, damit der Bezugspunkt nie
         verschwindet -- dann verdeckte er am Zeltplatz die Zahl auf dem
         groessten Buendel, und die ist das Bedienelement. Erkannt wird der
         Bezugspunkt ohnehin am Schild, und das steht 27 px versetzt, also
         neben jeder Bündelzahl.

         Getippt werden kann er nie (interactive: false plus pointer-events
         in der CSS) -- nachgeprueft: ein Tipp mitten auf den Zeltplatz-Punkt
         geht an das Buendel darunter durch und zoomt. */
      zIndexOffset: -500,
      keyboard: false
    });
  }

  function buendelListe(g) {
    return '<p class="bund__h">' + g.orte.length + ' Orte an dieser Stelle</p>'
      + '<div class="bund__l">'
      + g.orte.map(function (p) {
          return '<button type="button" class="bund__b" data-bopen="' + esc(p.id) + '">'
            + '<span class="bund__n">' + esc(p.name) + '</span>'
            + '<span class="bund__k">' + esc(catLabel(p.category)) + '</span>'
            + '</button>';
        }).join('')
      + '</div>';
  }

  function zeichneNadeln(orte) {
    marker.forEach(function (m) { karte.removeLayer(m); });
    marker = [];
    if (!orte.length) return;

    var zoom = karte.getZoom();
    var maxZ = karte.getMaxZoom();

    buendel(orte, zoom).forEach(function (g) {
      var m;
      if (g.orte.length === 1) {
        var p = g.orte[0];
        m = window.L.marker([p.geo.lat, p.geo.lon], {
          icon: window.L.divIcon({
            className: 'mk ' + accentClass(p.category)
              + (S.seen.indexOf(p.id) >= 0 ? ' mk--seen' : ''),
            /* 30 statt 16: der Punkt bleibt 16 px gross, die Trefferflaeche
               waechst. Erst durch die Buendelung ist dafuer ueberhaupt Platz
               -- vorher haetten sich die groesseren Flaechen gegenseitig
               verdeckt. */
            html: '<span></span>', iconSize: [30, 30], iconAnchor: [15, 15]
          }),
          title: p.name
        });
        m.on('click', function () { openSheet(p.id); });
      } else {
        var mitte = karte.unproject([g.x, g.y], zoom);
        var alleGesehen = g.orte.every(function (o) { return S.seen.indexOf(o.id) >= 0; });
        var gross = g.orte.length > 9;
        m = window.L.marker(mitte, {
          icon: window.L.divIcon({
            className: 'mk mk--bund' + (gross ? ' mk--bund-gross' : '')
              + (alleGesehen ? ' mk--seen' : ''),
            html: '<span>' + g.orte.length + '</span>',
            iconSize: gross ? [38, 38] : [32, 32],
            iconAnchor: gross ? [19, 19] : [16, 16]
          }),
          title: g.orte.length + ' Orte'
        });
        m.on('click', function () {
          /* Kann Hineinzoomen die Gruppe ueberhaupt trennen? Neun Punkte in
             den Daten tragen mehr als einen Ort -- dieselbe Adresse, dieselbe
             Koordinate. Dort hilft kein Zoom, dort muessen die Namen her.
             Ohne diese Frage tippte man erst zweimal ins Leere. */
          if (spreizung(g.orte, maxZ) < KACHEL) {
            m.bindPopup(buendelListe(g), { className: 'bundpop', maxWidth: 260 }).openPopup();
            return;
          }
          /* Nicht auf die Ausdehnung der Gruppe zoomen, sondern auf den
             Zoom, bei dem sie aufbricht. Gemessen mit fitBounds brauchte die
             Altstadt drei Tipps fuer 72 -> 61 -> 43 -> 33: die Gruppe passte
             danach immer noch in 34 px, man tippte und es tat sich fast
             nichts. So teilt jeder Tipp wirklich. */
          karte.setView(mitte, trennZoom(g.orte, zoom, maxZ));
        });
      }
      m.addTo(karte);
      marker.push(m);
    });
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
        /* Nur fuer den Pruefstand: ohne einen Griff auf die Karte laesst sich
           von aussen kein Zoom setzen, und der Fall "mehrere Orte auf einem
           Punkt" ist sonst nicht anzusteuern. Kostet nichts und verraet
           nichts. */
        window.__karte = karte;
        /* Der Zeltplatz als fester Bezugspunkt -- ohne ihn weiss man nicht,
           von wo die Entfernungen in der Liste gelten. */
        if (base) {
          bezugNadel(base.lat, base.lon, 'zelt', 'Zeltplatz').addTo(karte);
        }

        /* Nach jedem Zoom neu buendeln: was bei Zoom 13 ein Punkt ist, sind
           bei 17 acht. Nur zoomend, nicht moveend -- beim Verschieben bleiben
           die Abstaende gleich, ein Neuzeichnen waere reine Arbeit. */
        karte.on('zoomend', function () {
          if (letzteOrte.length) zeichneNadeln(letzteOrte);
        });

        /* Die Knoepfe im Buendel-Popup liegen ausserhalb der Liste, die
           Klicks sonst abfaengt -- hier eigens verdrahtet. */
        karte.on('popupopen', function (e) {
          var el = e.popup.getElement();
          if (!el) return;
          el.querySelectorAll('[data-bopen]').forEach(function (b) {
            b.addEventListener('click', function () {
              var id = b.getAttribute('data-bopen');
              karte.closePopup();
              openSheet(id);
            });
          });
        });
      }

      var mitGeo = orte.filter(function (p) { return p.geo; });
      letzteOrte = mitGeo;

      /* Der Geraetestandort wandert, der Zeltplatz nicht -- deshalb wird er
         bei jedem Zeichnen neu gesetzt statt einmal beim Anlegen der Karte.
         Ohne ihn verschob "Von hier aus messen" still den Bezugspunkt aller
         Entfernungen, und die Karte zeigte davon nichts. */
      if (hierNadel) { karte.removeLayer(hierNadel); hierNadel = null; }
      if (S.here) {
        hierNadel = bezugNadel(S.here.lat, S.here.lon, 'hier',
          'Du bist hier' + (hereAt() ? ' · ' + hereAt() : '')).addTo(karte);
      }

      if (mitGeo.length) {
        /* Der Bezugspunkt gehoert mit ins Bild. "Von wo starte ich" laesst
           sich nicht beantworten, wenn der Startpunkt ausserhalb des
           Ausschnitts liegt -- und bei einem Filter auf Verona oder Mantua
           waere genau das der Fall gewesen. Der Preis ist ein etwas weiterer
           Ausschnitt bei weit entfernten Zielen; dafuer sieht man, wie weit
           es wirklich ist. */
        var ecken = mitGeo.map(function (p) { return [p.geo.lat, p.geo.lon]; });
        if (S.here) ecken.push([S.here.lat, S.here.lon]);
        else if (base) ecken.push([base.lat, base.lon]);
        karte.fitBounds(window.L.latLngBounds(ecken).pad(0.15), { maxZoom: 16 });
      }
      /* Nach fitBounds, nicht davor: gebuendelt wird nach Pixelabstand, und
         der haengt am Zoom. Vorher gezeichnet waere die Buendelung die des
         alten Ausschnitts. Aendert fitBounds den Zoom, zeichnet zoomend
         ohnehin noch einmal -- zeichneNadeln raeumt zuerst ab, doppelt
         schadet also nicht. */
      zeichneNadeln(mitGeo);
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
      wegKm: wegKm, wegMin: wegMin, tagWege: tagWege,
      tagModusVorschlag: tagModusVorschlag, rundenVorschlag: rundenVorschlag,
      umwegFuer: umwegFuer,
      RUNDE_EXAKT: RUNDE_EXAKT,
      UMWEG: UMWEG, V_FUSS: V_FUSS, V_RAD: V_RAD, V_AUTO: V_AUTO,
      PARKEN_MIN: PARKEN_MIN, FUSS_MAX_KM: FUSS_MAX_KM, WEG_LANG: WEG_LANG,
      dogOf: dogOf, dogState: dogState, dogBilanz: dogBilanz, dogCount: dogCount,
      byDistance: byDistance, byRating: byRating,
      grundmenge: grundmenge, markiere: markiere, normStellen: normStellen,
      tripSpan: tripSpan, tripTage: tripTage, isoTag: isoTag,
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
    $('boot').classList.remove('boot--fehler');
    $('boot-retry').hidden = true;
    $('boot-title').textContent = 'Peschiera kompakt';
    $('boot-text').textContent = 'Daten werden geladen…';
    loadData(start, bootError);
  });

  loadData(start, bootError);
})();
