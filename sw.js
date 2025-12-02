self.addEventListener("install", e => {
    e.waitUntil(
        caches.open("spendora-v1").then(cache => {
            return cache.addAll([
                "/",
                "/index.html",
                "/dashboard.html",
                "/style.css",
                "/app.js",
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