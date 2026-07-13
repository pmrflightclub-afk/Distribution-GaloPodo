/* Service worker — réseau d'abord pour l'app (voir les mises à jour tout de suite),
 * repli sur le cache hors-ligne. Les API cartographie ne sont jamais mises en cache. */
const CACHE = 'galopodo-v1-2-90';
const SHELL = ['./', './index.html', './styles.css', './app.js', './manifest.webmanifest', './icons/icon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (/geoapify\.com|nominatim\.openstreetmap\.org|project-osrm\.org/.test(url.host)) return; // réseau direct
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Réseau d'abord, cache en repli (hors-ligne)
  e.respondWith(
    fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request))
  );
});
