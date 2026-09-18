/* ==========================================================================
   Peschiera kompakt — Service Worker

   App-Shell und places.json werden vorgehalten, damit nach einmaligem Laden
   alles offline funktioniert. Google Fonts werden beim ersten Abruf
   mitgespeichert.

   Beim Ändern von Dateien CACHE hochzählen — dann räumt activate() die alte
   Version ab und der neue Stand übernimmt beim nächsten Start.
   ========================================================================== */
'use strict';

var CACHE = 'peschiera-v1';
var FONTS = 'peschiera-fonts-v1';

var SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './data/places.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
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
        if (k !== CACHE && k !== FONTS) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function isFont(url) {
  return url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com';
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url;
  try { url = new URL(req.url); } catch (err) { return; }

  /* Google Fonts: erst Cache, dann Netz — Schriften ändern sich nicht. */
  if (isFont(url)) {
    e.respondWith(
      caches.open(FONTS).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) {
            if (res && res.ok) c.put(req, res.clone());
            return res;
          });
        });
      }).catch(function () { return fetch(req); })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  /* Eigene Dateien: Cache sofort ausliefern, im Hintergrund erneuern.
     Die App startet damit auch offline, und ein neuer Datenstand landet
     beim nächsten Aufruf. */
  e.respondWith(
    caches.open(CACHE).then(function (c) {
      return c.match(req, { ignoreSearch: true }).then(function (hit) {
        var fresh = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
          return res;
        }).catch(function () { return null; });

        if (hit) { e.waitUntil(fresh); return hit; }

        return fresh.then(function (res) {
          if (res) return res;
          /* Navigation ohne Netz und ohne Treffer: App-Shell ausliefern */
          if (req.mode === 'navigate') {
            return c.match('./index.html') || c.match('./');
          }
          return new Response('', { status: 504, statusText: 'offline' });
        });
      });
    })
  );
});
