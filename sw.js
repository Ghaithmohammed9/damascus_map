/* Service Worker — تحميل مسبق للتطبيق + تخزين بلاطات الخريطة للاستخدام دون إنترنت */

const VERSION = 'v2.0.2';
const SHELL = `sham-shell-${VERSION}`;
const TILES = 'sham-tiles-v1';
const TILE_LIMIT = 600;

const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'vendor/fonts/plex-400-ar.woff2',
  'vendor/fonts/plex-600-ar.woff2',
  'js/app.js',
  'js/config.js',
  'js/geo.js',
  'js/store.js',
  'js/mapview.js',
  'js/search.js',
  'vendor/leaflet.js',
  'vendor/leaflet.css',
  'data/roads.json',
  'data/pois.json',
  'data/districts.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon.svg',
];

const TILE_HOSTS = ['arcgisonline.com', 'tile.openstreetmap.org', 'tiles.maps.eox.at'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // تحميل مسبق متسامح: إذا فشل ملف واحد لا يفشل التثبيت كله
    await Promise.all(ASSETS.map(async (u) => {
      try {
        const res = await fetch(new Request(u, { cache: 'reload' }));
        if (res && res.ok) await cache.put(u, res.clone());
      } catch (err) {
        /* تجاهل */
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== SHELL && k !== TILES).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function trimTiles(cache) {
  const keys = await cache.keys();
  if (keys.length <= TILE_LIMIT) return;
  for (const k of keys.slice(0, keys.length - TILE_LIMIT)) await cache.delete(k);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (TILE_HOSTS.some((h) => url.hostname.endsWith(h))) {
    event.respondWith(
      caches.open(TILES).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          // لا نفرض mode:'cors' — بعض مزوّدي الصور الجوية ما بيرسلوا CORS headers
          const res = await fetch(req);
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone()).then(() => trimTiles(cache)).catch(() => {});
          }
          return res;
        } catch (e) {
          return new Response('', { status: 504 });
        }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return;

  const isCode = req.mode === 'navigate' || /\.(html|js|css|json|webmanifest|geojson)$/.test(url.pathname);

  event.respondWith(
    caches.open(SHELL).then(async (cache) => {
      // الأكواد والبيانات: الشبكة أولاً (حتى ما تعلق نسخة قديمة) والكاش احتياط
      if (isCode) {
        try {
          const res = await fetch(req);
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        } catch (e) {
          const hit = await cache.match(req, { ignoreSearch: true });
          if (hit) return hit;
          return new Response('offline', { status: 503 });
        }
      }
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return new Response('offline', { status: 503 });
      }
    })
  );
});
