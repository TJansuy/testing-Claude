// Caches the app shell so LocalChatter opens with no internet connection.
// Chat traffic goes over a WebSocket to the local server and is never cached.
// Bump the version whenever cached files change so clients pick up the update.
var CACHE = 'localchatter-v12';
var ASSETS = [
  './',
  'index.html',
  'Display/',
  'Display/index.html',
  'styles.css',
  'effects.js',
  'sounds.js',
  'languages.js',
  'app.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/jsQR.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf('localchatter-') === 0 && k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Cache-first for the app's own files; anything else goes straight to the network.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).catch(function () {
        if (req.mode === 'navigate') return caches.match('index.html');
      });
    })
  );
});

// Tapping a message notification brings LocalChatter back (or opens it).
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]) return list[i].focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null;
    })
  );
});
