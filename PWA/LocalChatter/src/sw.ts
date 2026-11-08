// Service worker: caches the app so it opens with no internet connection.
// Chat traffic goes over a WebSocket to the local server and is never cached.
// The cache is named after the build time, so every build is a new version:
// browsers notice this file changed, install the new one, and it takes over.
export {};
declare const self: ServiceWorkerGlobalScope;
declare const __BUILD_TIME__: string;

const CACHE = 'localchatter-' + __BUILD_TIME__;
const ASSETS = [
  './',
  'index.html',
  'Display/',
  'Display/index.html',
  'dist/app.js',
  'styles/base.css',
  'styles/chat.css',
  'styles/composer.css',
  'styles/dashboard.css',
  'styles/panels.css',
  'styles/effects.css',
  'styles/effects-more.css', 'styles/polls.css', 'styles/games.css',
  'styles/display.css',
  'styles/voice.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'vendor/jsQR.js',
];

self.addEventListener('install', (event) => {
  // Fetch every file fresh (not from the browser's HTTP cache), so the new
  // version really is new.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.indexOf('localchatter-') === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Cache-first for the app's own files; anything else goes straight to the network.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) =>
      hit || fetch(req).catch(async () => {
        if (req.mode === 'navigate') {
          const shell = await caches.match('index.html');
          if (shell) return shell;
        }
        return Response.error();
      })),
  );
});

// The app asks which version this is, to tell whether it's behind.
self.addEventListener('message', (event) => {
  if (event.data === 'version' && event.ports[0]) event.ports[0].postMessage(__BUILD_TIME__);
});

// Tapping a message notification brings LocalChatter back (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data as { url?: string } | null;
  const url = (data && data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) return (c as WindowClient).focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(url) : null;
    }),
  );
});
