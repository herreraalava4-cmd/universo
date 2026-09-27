// Guarda la app en el teléfono para que abra sin internet.
// Al cambiar cualquier archivo, sube el número de CACHE para que los teléfonos bajen la versión nueva.
const CACHE = 'universo-v2';
const SCENES = ['hiper', 'solar', 'sol', 'nebfuego', 'nebrosa', 'nebazul', 'nebverde', 'alien', 'galaxia'];
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable.png',
  './js/nucleo.js', './js/escenas.js', './js/planetas.js', './js/app.js'].concat(SCENES.map(s => `./thumbs/${s}.jpg`));

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  const keep = r => { if (r && r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return r; };
  // la página y el código: primero la red (para recibir mejoras); sin internet, la copia guardada
  if (req.mode === 'navigate' || url.pathname.endsWith('.js') || url.pathname.endsWith('.html')) {
    e.respondWith(fetch(req).then(keep).catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // imágenes (planetas, miniaturas, íconos): la copia guardada; si no está, se baja una vez y se guarda
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(keep)));
});
