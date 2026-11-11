export const dynamic = "force-dynamic";

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA || "dev";

  const sw = `const NAV_CACHE = 'rh-nav-${version}';
const STATIC_CACHE = 'rh-static';
const STATIC_LIMIT = 300;
const SHELL_PATH = '/today';
// Local dev serves unhashed assets that change under the same URL, so anything
// cache-first would pin stale code. Dev stays network-first throughout.
const CACHE_FIRST = ${version !== "dev"};

function openNav() {
  return caches.open(NAV_CACHE);
}

function matchShell() {
  return openNav().then(cache => cache.match(SHELL_PATH, { ignoreVary: true }));
}

function shellRedirect() {
  return Response.redirect(new URL(SHELL_PATH, self.location.origin).href, 302);
}

// Re-fetch the signed-in home page for the next launch. The proxy redirects a
// request with no session cookie to the sign-in page, so a redirect here means
// the cached pages belong to a signed-out user. (A cookie whose session has
// died still gets the page; the page's first API call catches that.)
async function refreshShell() {
  let response;
  try {
    response = await fetch(SHELL_PATH, { credentials: 'same-origin', cache: 'no-store' });
  } catch {
    return 'error';
  }
  if (!response.ok) return 'error';
  if (response.redirected) {
    await caches.delete(NAV_CACHE);
    return 'signed-out';
  }
  const cache = await openNav();
  await cache.put(SHELL_PATH, response);
  return 'app';
}

async function notifySignedOut() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => client.postMessage({ type: 'rh-signed-out' }));
}

async function networkFirst(event) {
  const request = event.request;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(openNav().then(cache => cache.put(request, copy)).catch(() => {}));
    }
    return response;
  } catch (err) {
    const cache = await openNav();
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    const isShell = new URL(request.url).pathname === SHELL_PATH;
    if (!isShell && (await cache.match(SHELL_PATH, { ignoreVary: true }))) return shellRedirect();
    throw err;
  }
}

// Cold launch: paint the last signed-in home page straight from the cache, then
// refresh it in the background. The page's own queries refetch the data.
function shellFirst(event) {
  const cached = matchShell();
  event.waitUntil(
    cached.then(hit => {
      if (!hit) return;
      return refreshShell().then(state => (state === 'signed-out' ? notifySignedOut() : undefined));
    })
  );
  event.respondWith(cached.then(hit => hit || networkFirst(event)));
}

// The server sends a signed-in user from / to /today. With a cached shell, do
// that hop locally so launch never waits on the network.
function homeNavigation(event) {
  event.respondWith(matchShell().then(hit => (hit ? shellRedirect() : networkFirst(event))));
}

// Build assets are content-hashed, so a cached copy never goes stale. Keeping
// them also lets a cached shell from the previous deploy still find its scripts.
async function staticFirst(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(event.request);
  if (response.status === 200) {
    const copy = response.clone();
    event.waitUntil(cache.put(event.request, copy).catch(() => {}));
  }
  return response;
}

async function trimStatic() {
  const cache = await caches.open(STATIC_CACHE);
  const keys = await cache.keys();
  const excess = keys.slice(0, Math.max(0, keys.length - STATIC_LIMIT));
  await Promise.all(excess.map(key => cache.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (CACHE_FIRST ? refreshShell() : Promise.resolve())
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('rh-nav-') && key !== NAV_CACHE).map(key => caches.delete(key))
      ))
      .then(() => trimStatic())
      .catch(() => {})
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'rh-clear-shell') {
    event.waitUntil(caches.delete(NAV_CACHE));
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (CACHE_FIRST && url.pathname.startsWith('/_next/static/')) {
    event.respondWith(staticFirst(event));
    return;
  }
  if (request.mode !== 'navigate') return;

  if (CACHE_FIRST && url.search === '') {
    if (url.pathname === SHELL_PATH) return shellFirst(event);
    if (url.pathname === '/') return homeNavigation(event);
  }
  event.respondWith(networkFirst(event));
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
