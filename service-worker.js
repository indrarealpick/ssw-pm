const CACHE_NAME = 'otaff-v1.0';
const DATA_FILES = [
  'cleaning.json','emergency.json','factory.json','food-processing.json',
  'haccp.json','hygiene.json','ingredients.json','machinery.json',
  'packaging.json','ppe.json','procedure.json','production.json',
  'quality-control.json','regulations.json','safety.json','storage.json',
  'temperature-control.json','tools.json','warning.json','work-actions.json'
];

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  ...DATA_FILES.map(f => `./data/${f}`)
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type === 'opaque') return res;
        const clone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
