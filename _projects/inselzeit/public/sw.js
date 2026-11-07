// The build replaces these markers with a content-derived version and every emitted asset.
const CACHE_PREFIX = 'inselzeit-wgv1-';
const CACHE = CACHE_PREFIX + '__WGV1_VERSION__';
const SCOPE_PATH = '/wgv1/';
const PRECACHE = /*__WGV1_PRECACHE__*/ [];
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  await cache.addAll(PRECACHE);
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE).map(name => caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never intercept or cache the main website, other paths, or other origins.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      if (event.request.mode === 'navigate') return (await cache.match(SCOPE_PATH)) || Response.error();
      return Response.error();
    }
  })());
});
