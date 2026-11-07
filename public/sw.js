// Connectify service worker.
//
// Caches only the app itself (HTML shell, built JS/CSS, fonts, icons) so it
// opens fast and works offline. Posts, messages and other data come from
// Supabase on another domain and are never cached here.

const CACHE = 'connectify-v1';
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return; // Supabase, etc.: always live.

    // Pages: try the network first so updates show straight away; fall back
    // to the cached app shell when offline.
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put('/', copy));
                    return response;
                })
                .catch(() => caches.match('/'))
        );
        return;
    }

    // Built files have content hashes in their names, so a cached copy is
    // always correct. Serve from cache, fetching and storing on first use.
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
        event.respondWith(
            caches.match(request).then(
                (cached) =>
                    cached ||
                    fetch(request).then((response) => {
                        if (response.ok) {
                            const copy = response.clone();
                            caches.open(CACHE).then((cache) => cache.put(request, copy));
                        }
                        return response;
                    })
            )
        );
    }
});
