/* Service worker DUT-OIC.
   - Coquille applicative pré-cachée (liste et version dans precache.json).
   - Fichiers de l'application : cache d'abord, mise à jour en arrière-plan.
   - Bibliothèques CDN et polices : cache d'abord (disponibles hors ligne après la première visite).
   - Fond de carte OpenStreetMap : réseau d'abord, repli cache, taille bornée.
   - Pas de données métier ici : elles vivent dans LocalStorage. */
const PRECACHE_LIST = 'precache.json';
let CACHE = 'dut-oic-shell';
const LIB_CACHE = 'dut-oic-libs-v1';
const TILE_CACHE = 'dut-oic-tiles-v1';
const TILE_MAX = 400;

async function shellCacheName() {
  try {
    const res = await fetch(PRECACHE_LIST, { cache: 'no-store' });
    const { version } = await res.json();
    return `dut-oic-shell-${version}`;
  } catch { return CACHE; }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const res = await fetch(PRECACHE_LIST, { cache: 'no-store' });
    const { version, files } = await res.json();
    CACHE = `dut-oic-shell-${version}`;
    const cache = await caches.open(CACHE);
    // Chaque fichier est demandé sans cache HTTP pour obtenir la version réellement publiée.
    await Promise.all(files.map(async (f) => {
      try { await cache.put(f, await fetch(f, { cache: 'no-store' })); } catch { /* un fichier manquant n'empêche pas l'installation */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    CACHE = await shellCacheName();
    const keep = new Set([CACHE, LIB_CACHE, TILE_CACHE]);
    for (const name of await caches.keys()) if (name.startsWith('dut-oic-') && !keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isLibrary(url) {
  return ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'unpkg.com'].includes(url.hostname);
}
function isTile(url) { return url.hostname.endsWith('tile.openstreetmap.org'); }

async function cacheFirst(request, cacheName, { ignoreSearch = false, revalidate = true } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreSearch });
  const refresh = fetch(request).then((res) => { if (res && res.ok) cache.put(request, res.clone()); return res; }).catch(() => null);
  if (hit) { if (revalidate) refresh.catch(() => {}); return hit; }
  const res = await refresh;
  return res || Response.error();
}

async function trimCache(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - max))) await cache.delete(k);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.endsWith('/sw.js') || url.pathname.endsWith('/' + PRECACHE_LIST)) return;
    // Navigation : la coquille, même hors ligne.
    if (request.mode === 'navigate') {
      event.respondWith((async () => {
        try { return await fetch(request); } catch {
          const cache = await caches.open(await shellCacheName());
          return (await cache.match('index.html')) || Response.error();
        }
      })());
      return;
    }
    // Fichiers de l'application : réseau d'abord (toujours la version publiée), cache en secours hors ligne.
    // Les `?v=` de contournement de cache sont ignorés pour la correspondance.
    event.respondWith((async () => {
      const cache = await caches.open(await shellCacheName());
      try {
        const res = await fetch(request);
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        return (await cache.match(request, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }
  if (isLibrary(url)) { event.respondWith(cacheFirst(request, LIB_CACHE, { revalidate: false })); return; }
  if (isTile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(TILE_CACHE);
      try {
        const res = await fetch(request);
        if (res.ok) { cache.put(request, res.clone()); trimCache(TILE_CACHE, TILE_MAX); }
        return res;
      } catch { return (await cache.match(request)) || Response.error(); }
    })());
  }
});
