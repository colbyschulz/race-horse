const STATIC_CACHE = 'static-v1';
const NAV_CACHE = 'nav-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Cache-first for immutable Next.js static assets (content-hashed filenames)
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(e.request);
        if (hit) return hit;
        const res = await fetch(e.request);
        cache.put(e.request, res.clone());
        return res;
      })
    );
    return;
  }

  // Stale-while-revalidate for navigation — serves cached HTML instantly,
  // fetches fresh in the background so the next visit is up to date.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(NAV_CACHE).then(async (cache) => {
        const cached = await cache.match(e.request);
        const fresh = fetch(e.request).then((res) => {
          cache.put(e.request, res.clone());
          return res;
        });
        return cached ?? fresh;
      })
    );
  }
});
