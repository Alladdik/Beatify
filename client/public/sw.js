// Beatify service worker — makes the app shell instant and keeps it usable offline.
//  • Shell + hashed assets: cache-first (they never change under the same URL)
//  • Navigations: network-first, fall back to the cached shell (so /offline etc. open without a network)
//  • Covers: stale-while-revalidate
//  • Audio streams, API calls and SignalR are never touched.
const VERSION = 'beatify-v3';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const COVERS = `${VERSION}-covers`;
const PRECACHE = ['/', '/manifest.json', '/favicon.svg', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

const isApi = (u) => u.pathname.startsWith('/api') || u.pathname.startsWith('/hubs') || u.pathname.startsWith('/healthz');

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Cross-origin (YouTube thumbnails, Spotify art, …) and everything dynamic: hands off
  if (url.origin !== self.location.origin) return;
  if (isApi(url) || url.pathname.includes('/stream')) return;
  if (request.headers.has('range')) return; // media range requests

  // Covers and avatars: show what we have, refresh in the background
  if (url.pathname.startsWith('/uploads/covers') || url.pathname.startsWith('/uploads/avatars') || url.pathname.startsWith('/uploads/artists')) {
    e.respondWith(
      caches.open(COVERS).then(async (cache) => {
        const hit = await cache.match(request);
        const fresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => hit);
        return hit || fresh;
      }),
    );
    return;
  }

  // Uploaded audio is large and streamed — never cache it here (offline downloads live in IndexedDB)
  if (url.pathname.startsWith('/uploads')) return;

  // Fingerprinted build output
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: always try the network first so a deploy is picked up immediately
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => { const copy = res.clone(); caches.open(SHELL).then((c) => c.put('/', copy)); return res; })
        .catch(async () => (await caches.match('/')) || new Response('Beatify недоступний без мережі', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })),
    );
    return;
  }

  // Everything else on our origin (icons, manifest, fonts): cache-first with network fill
  e.respondWith(
    caches.match(request).then((hit) => hit || fetch(request).then((res) => {
      if (res.ok) caches.open(SHELL).then((c) => c.put(request, res.clone()));
      return res;
    })),
  );
});
