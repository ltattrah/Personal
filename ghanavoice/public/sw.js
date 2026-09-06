/* GhanaVoice service worker: app-shell caching for low connectivity.
 * - Static assets: cache-first (immutable Next.js chunks).
 * - Pages: network-first with cache fallback, then /offline.html.
 * - /api/packs/*: handled by the page via Cache Storage ("gv-packs-v1"); we
 *   never cache other API responses (they may contain a user's question).
 */
const SHELL = 'gv-shell-v1';
const PACKS = 'gv-packs-v1';
const PRECACHE = ['/', '/offline', '/history', '/settings', '/manifest.webmanifest', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== PACKS).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/packs/')) {
    event.respondWith(caches.open(PACKS).then((c) => c.match(req).then((hit) => hit || fetch(req))));
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // never cache

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(SHELL).then((c) =>
        c.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            }),
        ),
      ),
    );
    return;
  }

  // Navigations and other GETs: network first, fall back to cache.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && req.mode === 'navigate') caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
  );
});
