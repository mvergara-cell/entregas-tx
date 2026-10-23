// Service worker simple: red primero, caché como respaldo (permite abrir la app con mala señal)
const C = 'entregas-tx-v1';
const BASE = ['./', 'index.html', 'styles.css', 'app.js', 'logistica.js', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(BASE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
