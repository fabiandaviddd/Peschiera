/* ==========================================================================
   Peschiera kompakt — Service Worker

   App-Shell, Schriften und places.json werden vorgehalten, damit nach
   einmaligem Laden alles offline funktioniert.

   Beim Ändern von Dateien CACHE hochzählen — dann räumt activate() die alte
   Version ab und der neue Stand übernimmt beim nächsten Start.
   ========================================================================== */
'use strict';

var CACHE = 'peschiera-v43';
var TIMEOUT = 2500;   // ms, danach greift der Cache

/* Leaflet liegt im Repo, nicht auf einem fremden Server -- sonst waere die
   Karte offline nicht einmal als leere Flaeche da. Die Kacheln sind eine
   andere Sache: die kommen zur Laufzeit und lassen sich nicht sinnvoll
   vorhalten. Ohne Netz zeigt die Karte die Nadeln ohne Untergrund und sagt
   das auch. Kommentare gehoeren hierher und nicht INS Array -- der Pruefstand
   liest es mit einem regulaeren Ausdruck. */
var SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './data/places.json',
  './data/wissen.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './vendor/leaflet/leaflet.js',
  './vendor/leaflet/leaflet.css',
  './fonts/fraunces-latin.woff2',
  './fonts/fraunces-latin-ext.woff2',
  './fonts/karla-latin.woff2',
  './fonts/karla-latin-ext.woff2'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      /* Einzeln, damit eine fehlende Datei nicht die ganze Installation kippt */
      return Promise.all(SHELL.map(function (url) {
        return c.add(new Request(url, { cache: 'reload' })).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        /* Ohne Ausnahme -- das raeumt auch den alten peschiera-fonts-*
           Cache ab, den Bestandsgeraete von der Google-Fassung noch haben. */
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* CACHE hier und VERSION in app.js muessen zusammenpassen — bisher stand das
   nur in der README, und ein vergessener Sprung fiel niemandem auf: die App
   lief still auf altem Stand weiter. Auf Nachfrage nennt der Worker deshalb
   seinen Cache, und die App vergleicht ihn mit ihrer eigenen Fassung. */
self.addEventListener('message', function (e) {
  if (!e.data || e.data.q !== 'version') return;
  var reply = { cache: CACHE };
  if (e.ports && e.ports[0]) e.ports[0].postMessage(reply);
  else if (e.source && e.source.postMessage) e.source.postMessage(reply);
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  if (url.origin !== self.location.origin) return;

  /* Bilder, Icons und Schriften ändern sich praktisch nie: erst Cache.
     Für die Schriften ist das der Ersatz des alten Google-Zweiges. Sie dürfen
     nicht in den Netz-zuerst-Zweig unten fallen — sonst wartete jeder Start
     bis zu TIMEOUT auf 163 kB, die sich nie ändern. */
  if (req.destination === 'image' || req.destination === 'font') {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match(req, { ignoreSearch: true }).then(function (hit) {
          return hit || fetch(req).then(function (res) {
            if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
            return res;
          });
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  /* Seite, Skript, Stil und Daten: erst Netz, nach TIMEOUT der Cache.
     Zuvor galt hier "erst Cache" — dann sah man nach einem Deploy noch den
     alten Stand. Ohne Netz schlägt fetch sofort fehl, offline bleibt also
     schnell; nur ein zähes Netz wartet bis TIMEOUT. */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        var settled = false;

        var net = fetch(req).then(function (res) {
          settled = true;
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        }).catch(function () {
          settled = true;
          return null;
        });

        var raced = hit
          ? Promise.race([
              net,
              new Promise(function (resolve) {
                setTimeout(function () { if (!settled) resolve(null); }, TIMEOUT);
              })
            ])
          : net;

        return raced.then(function (res) {
          if (res) return res;
          if (hit) { e.waitUntil(net); return hit; }
          if (req.mode === 'navigate') {
            return c.match('./index.html').then(function (shell) {
              return shell || c.match('./');
            });
          }
          return new Response('', { status: 504, statusText: 'offline' });
        });
      });
    })
  );
});
