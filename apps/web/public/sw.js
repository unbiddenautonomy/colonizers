/* Colonizers service worker: keeps the app working offline and shows "your turn" pushes. */
const CACHE = 'colonizers-v3';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icon-192.png',
  '/favicon.svg',
  '/logo.svg',
];

/**
 * Every built file, from the manifest the build writes. The app is split into
 * chunks that are fetched when a screen is opened, so saving only the page
 * left the app working offline on the second visit at best, and unable to
 * open a game at worst.
 */
async function builtFiles() {
  const res = await fetch('/asset-manifest.json', { cache: 'reload' });
  if (!res.ok) throw new Error('no manifest');
  const manifest = await res.json();
  const files = new Set();
  for (const entry of Object.values(manifest)) {
    if (entry.file) files.add(`/${entry.file}`);
    for (const css of entry.css || []) files.add(`/${css}`);
    for (const asset of entry.assets || []) files.add(`/${asset}`);
  }
  return [...files];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      try {
        await cache.addAll(await builtFiles());
      } catch {
        // Offline while installing, or an older build: the fetch handler
        // saves each file as it is used instead.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only our own GETs; the API and rooms always go to the network.
  if (
    req.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (req.mode === 'navigate') {
    // Pages: fresh when online, the saved app when not.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }
  // Built files have a hash in their name, so a saved copy is always right.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Colonizers', {
      body: data.body || 'Your turn',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'turn',
      renotify: true,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname === url && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
