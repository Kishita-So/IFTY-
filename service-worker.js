// ★★★ IFTY Service Worker Q3 STEP7 2026-09-08：PWA / オフライン起動 ★★★
const CACHE_NAME = 'ifty-static-q3-step7-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './script.js',
  './manifest.webmanifest',
  './ifty-icon.png',
  './ifty-icon-192.png',
  './ifty-icon-512.png',
  './apple-touch-icon.png'
];

async function cacheAsset(cache, asset) {
  try {
    const response = await fetch(asset, { cache: 'reload' });
    if (response && response.ok) {
      await cache.put(asset, response.clone());
      return response;
    }
  } catch (_) {}
  return null;
}

async function cacheAssetsReferencedByIndex(cache) {
  try {
    const response = await fetch('./index.html', { cache: 'reload' });
    if (!response || !response.ok) return;
    await cache.put('./index.html', response.clone());
    const html = await response.text();
    const matches = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)];
    const urls = [...new Set(matches.map(match => match[1]).filter(Boolean))];

    await Promise.allSettled(urls.map(async value => {
      if (/^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return;
      const absolute = new URL(value, self.location.href);
      if (absolute.origin !== self.location.origin) return;
      await cacheAsset(cache, absolute.href);
    }));
  } catch (_) {}
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE_ASSETS.map(asset => cacheAsset(cache, asset)));
    await cacheAssetsReferencedByIndex(cache);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', networkResponse.clone()).catch(() => {});
        }
        return networkResponse;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match(request)) ||
          (await cache.match('./index.html')) ||
          (await cache.match('./')) ||
          Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) {
      fetch(request).then(response => {
        if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      }).catch(() => {});
      return cached;
    }

    try {
      const response = await fetch(request);
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
