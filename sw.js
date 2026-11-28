const CACHE_NAME = 'kochtresor-v46';
const ASSETS = [
  './',
  './index.html',
  './styles.css?v=46',
  './app.js?v=46',
  './manifest.json',
  './icon.svg'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(ASSETS.map((url) => cache.add(url)))
    ).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Anti-Error-1033 Shield & Offline-First Fallback:
// Wenn ein Tunnel (z.B. Cloudflare HTTP 530 Error 1033, 502, 503, 504) einen Fehlercode >= 400 liefert
// oder offline ist, wird sofort die gecachte KochTresor-App ausgeliefert statt einer Fehlerseite!
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = new URL(event.request.url);

  // Externe API-Aufrufe (z.B. getpantry.cloud, Groq, KaufDA) & /api/ niemals über den Service Worker abfangen
  if (reqUrl.origin !== self.location.origin || reqUrl.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(async (networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.url.startsWith(self.location.origin)) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
          return networkResponse;
        }
        // Schutz gegen Cloudflare Error 1033 (HTTP 530) / 502 / 503 / 504 / 404 bei App-Navigation & Assets:
        if (!networkResponse || networkResponse.status >= 400) {
          const cachedExact = await caches.match(event.request, { ignoreSearch: true });
          if (cachedExact) return cachedExact;
          if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
            const cachedIndex = (await caches.match('./index.html')) || (await caches.match('./'));
            if (cachedIndex) return cachedIndex;
          }
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedExact = await caches.match(event.request, { ignoreSearch: true });
        if (cachedExact) return cachedExact;
        if (event.request.mode === 'navigate' || (event.request.headers.get('accept') || '').includes('text/html')) {
          return (await caches.match('./index.html')) || (await caches.match('./'));
        }
        return new Response('', { status: 504, statusText: 'Offline' });
      })
  );
});
