/* Service worker de ezyDC: caché del "cascarón" de la app + notificaciones push.
 * Sin dependencias (sin Workbox) para que pese ~3 KB. */
const VERSION = 'ezydc-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // CDN, API externa: el navegador decide
  // Nunca cachear la API, el socket ni los módulos del servidor de desarrollo de Vite.
  if (/^\/(api|socket\.io|@vite|@fs|@id|@react-refresh|src|node_modules)\b/.test(url.pathname)) return;

  // Navegación (SPA): red primero; sin red, el index.html guardado (la app arranca con su caché de IndexedDB).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    );
    return;
  }

  // /assets/* lleva hash en el nombre (inmutable): caché primero.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Iconos, manifest…: sirve la copia y actualiza en segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit || Response.error());
      return hit || net;
    }),
  );
});

// ───────── Push ─────────

self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {
    data = { title: 'ezyDC', body: e.data ? e.data.text() : '' };
  }
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      // Si la app está delante y enfocada, el socket ya avisó: no duplicar.
      if (wins.some((w) => w.focused && w.visibilityState === 'visible')) return;
      return self.registration.showNotification(data.title || 'ezyDC', {
        body: data.body || '',
        icon: data.icon || '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: data.tag,
        renotify: !!data.tag,
        data: { url: data.url || '/channels' },
      });
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/channels', self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) {
        win.postMessage({ type: 'navigate', url: target });
        return win.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
