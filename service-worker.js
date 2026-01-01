const CACHE_NAME = 'ar-game-v2026-v3'; // Version bump for Ultra Connect
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js'
];

self.addEventListener('install', (event) => {
    // Force immediate activation
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    // Clear ALL old caches to force fresh script.js
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network-First strategy to ensure latest script.js is used
    event.respondWith(
        fetch(event.request).catch(() => caches.match(event.request))
    );
});
