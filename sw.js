/* ==========================================================================
   Peschiera kompakt — Service Worker

   App-Shell und places.json werden vorgehalten, damit nach einmaligem Laden
   alles offline funktioniert. Google Fonts werden beim ersten Abruf
   mitgespeichert.

   Beim Ändern von Dateien CACHE hochzählen — dann räumt activate() die alte
   Version ab und der neue Stand übernimmt beim nächsten Start.
   ========================================================================== */
'use strict';

var CACHE = 'peschiera-v19';
var FONTS = 'peschiera-fonts-v19';
var TIMEOUT = 2500;   // ms, danach greift der Cache

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

  /* Bilder und Icons ändern sich praktisch nie: erst Cache. */
  if (req.destination === 'image') {
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
