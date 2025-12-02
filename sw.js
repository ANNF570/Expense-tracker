self.addEventListener("install", e => {
    e.waitUntil(
        caches.open("spendora-v2").then(cache => {
            return cache.addAll([
                "/",
                "/style.css",
                "/app.js",
                "/theme.js",
                "/manifest.json",
                "/assets/icon-192.png",
                "/assets/icon-512.png",
            ]);
        })
    );
});

self.addEventListener("fetch", e => {
    e.respondWith(
        caches.match(e.request).then(response => response || fetch(e.request))
    );
});