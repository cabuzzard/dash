const CACHE = 'mm-v1';
const ASSETS = [
  '/dash/mobility-mentor.html',
  '/dash/manifest.json',
  '/dash/icon-192.png',
  '/dash/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always fetch worker API calls fresh
  if (e.request.url.includes('workers.dev')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
