export const dynamic = "force-dynamic";

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || "dev";

  const sw = `const CACHE_NAME = 'rh-nav-${version}';

// iOS Safari rejects SW responses with redirected:true. Strip redirect metadata
// by wrapping in a plain Response so the browser accepts it.
function cleanNav(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers),
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/')
      .then(response => {
        if (!response.ok) return;
        return caches.open(CACHE_NAME).then(cache => cache.put('/', cleanNav(response)));
      })
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  // Network-first: a stale cached document can carry an active-tab/layout
  // state baked in at a different route, or reference CSS module class
  // hashes from an older build, so it must never win over a live response
  // while one is reachable. Cache is strictly the offline fallback.
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (!response.ok) return response;
        const clean = cleanNav(response);
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clean.clone()));
        return clean;
      })
      .catch(() =>
        caches.open(CACHE_NAME).then(cache =>
          cache.match(event.request).then(cached => cached || cache.match('/'))
        )
      )
  );
});
`;

  return new Response(sw, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Service-Worker-Allowed": "/",
    },
  });
}
