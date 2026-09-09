// ★★★ IFTY Service Worker Q3 STEP13 2026-09-10：STEP10更新方式維持・STEP13配信キャッシュ更新 ★★★
const CACHE_PREFIX = 'ifty-static-';
const CACHE_NAME = 'ifty-static-q3-step13-v1';
const SCOPE_URL = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE_URL).href;

const CORE_ASSETS = [
  SCOPE_URL,
  INDEX_URL,
  new URL('script.js', SCOPE_URL).href,
  new URL('style.css', SCOPE_URL).href,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('ifty-icon.png', SCOPE_URL).href,
  new URL('ifty-icon-192.png', SCOPE_URL).href,
  new URL('ifty-icon-512.png', SCOPE_URL).href,
  new URL('apple-touch-icon.png', SCOPE_URL).href
];

async function fetchFresh(request) {
  return fetch(new Request(request, { cache: 'reload' }));
}

async function cacheAsset(cache, asset) {
  try {
    const request = new Request(asset, { cache: 'reload' });
    const response = await fetch(request);
    if (response && response.ok) {
      await cache.put(request, response.clone());
      return true;
    }
  } catch (_) {}
  return false;
}

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.allSettled(CORE_ASSETS.map(asset => cacheAsset(cache, asset)));

  try {
    const indexResponse = await fetchFresh(INDEX_URL);
    if (!indexResponse || !indexResponse.ok) return;

    await cache.put(INDEX_URL, indexResponse.clone());
    const html = await indexResponse.text();
    const matches = [...html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)];
    const urls = [...new Set(matches.map(match => match[1]).filter(Boolean))];

    await Promise.allSettled(urls.map(async value => {
      if (/^(?:data:|blob:|javascript:|mailto:|tel:|#)/i.test(value)) return;
      const absolute = new URL(value, INDEX_URL);
      if (absolute.origin !== self.location.origin) return;
      if (!absolute.href.startsWith(SCOPE_URL)) return;
      await cacheAsset(cache, absolute.href);
    }));
  } catch (_) {}
}

function isUpdateSensitiveRequest(request, url) {
  if (request.mode === 'navigate') return true;
  const pathname = url.pathname.toLowerCase();
  return /\.(?:html?|js|css|webmanifest|json)$/.test(pathname);
}

async function networkFirst(request, options = {}) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetchFresh(request);
    if (response && response.ok) {
      cache.put(request, response.clone()).catch(() => {});
      if (options.navigation) {
        cache.put(INDEX_URL, response.clone()).catch(() => {});
      }
    }
    return response;
  } catch (_) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    if (options.navigation) {
      const cachedIndex = await cache.match(INDEX_URL, { ignoreSearch: true });
      if (cachedIndex) return cachedIndex;

      const cachedRoot = await cache.match(SCOPE_URL, { ignoreSearch: true });
      if (cachedRoot) return cachedRoot;

      return new Response(
        '<!DOCTYPE html><html lang="ja"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>IFTY Offline</title><body style="font-family:sans-serif;background:#0f172a;color:white;padding:24px"><h1>IFTY</h1><p>オフライン用データの準備がまだ完了していません。オンラインでIFTYを一度開いてから、もう一度お試しください。</p></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
      );
    }

    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });

  if (cached) {
    fetchFresh(request).then(response => {
      if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    }).catch(() => {});
    return cached;
  }

  try {
    const response = await fetchFresh(request);
    if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (_) {
    return new Response('', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await cacheCoreAssets();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );
    await cacheCoreAssets();
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'IFTY_CACHE_CORE') {
    event.waitUntil(cacheCoreAssets());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE_URL)) return;

  if (isUpdateSensitiveRequest(request, url)) {
    event.respondWith(networkFirst(request, { navigation: request.mode === 'navigate' }));
    return;
  }

  event.respondWith(cacheFirst(request));
});
