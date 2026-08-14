const CACHE = 'beatify-v2';
const SHELL  = ['/', '/index.html', '/manifest.json', '/favicon.svg'];

// ── Install: cache app shell ──────────────────────────────────────────────────
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

// ── Activate: remove old caches ───────────────────────────────────────────────
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ── Fetch strategy ────────────────────────────────────────────────────────────
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept audio streams — let them flow directly
  if (url.pathname.includes('/stream')) return;
  // Never intercept SignalR / WebSocket upgrades
  if (url.pathname.includes('/hubs/')) return;
  // Cross-origin requests (CDN fonts, external thumbnails) — pass-through
  if (url.origin !== self.location.origin) return;

  // API calls — network-first, no caching
  // Add ngrok bypass header so the warning page never intercepts JSON/audio responses
  if (url.pathname.startsWith('/api/')) {
    const req = url.hostname.includes('ngrok')
      ? new Request(request, { headers: { ...Object.fromEntries(request.headers), 'ngrok-skip-browser-warning': 'true' } })
      : request;
    e.respondWith(fetch(req).catch(() => new Response('', { status: 503 })));
    return;
  }

  // Static assets — stale-while-revalidate
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/uploads/')) {
    e.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const networkFetch = fetch(request).then(res => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        }).catch(() => null);
        return cached ?? networkFetch;
      })
    );
    return;
  }

  // App shell — cache-first, fallback to network, fallback to cached index.html
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request)
        .then(res => {
          if (res.ok) {
            caches.open(CACHE).then(c => c.put(request, res.clone()));
          }
          return res;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});

// ── Background sync placeholder (for future offline queue) ───────────────────
self.addEventListener('sync', () => {});
