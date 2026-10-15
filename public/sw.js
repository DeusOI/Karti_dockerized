// Bump this when you change the app files, so phones pick up the new version
const VERSION = 'karti-v2';
const SHELL = [
    './',
    'index.html',
    'style.css',
    'app.js',
    'manifest.webmanifest',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'images/eli.jpg',
    'images/pance.jpg',
    'images/goci.jpg',
    'images/vase.jpg'
];

self.addEventListener('install', event => {
    event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const req = event.request;
    const url = new URL(req.url);
    // Scores always come from the server; the app keeps its own offline copy
    if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

    // App files: answer from the cache right away, refresh it in the background
    event.respondWith(
        caches.open(VERSION).then(async cache => {
            const cached = await cache.match(req, { ignoreSearch: true });
            const fresh = fetch(req)
                .then(res => {
                    if (res.ok) cache.put(req, res.clone());
                    return res;
                })
                .catch(() => cached);
            return cached || fresh;
        })
    );
});
