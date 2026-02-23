const CACHE_NAME = "proice-pwa-v7";

const FILES_TO_CACHE = [
    "./index.html?v=7",
    "./app.js?v=7",
    "./styles.css?v=7",
    "./service-worker.js",
    "./manifest.json",
    "./manifest.json?v=7",
    "./icon-192.png",
    "./icon-512.png"
];

// INSTALAÃ‡ÃƒO
self.addEventListener("install", function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// ATIVAÃ‡ÃƒO
self.addEventListener("activate", function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.map(function (key) {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Permite ativacao imediata quando a pagina pedir update.
self.addEventListener("message", function (event) {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

// FETCH
self.addEventListener("fetch", function (event) {
    if (event.request.method !== "GET") return;
    const req = event.request;
    const reqUrl = new URL(req.url);
    const isSameOrigin = reqUrl.origin === self.location.origin;

    // App shell local (HTML/CSS/JS): rede primeiro sem cache HTTP para atualizar rapido no mobile.
    const isAppShellLocal = isSameOrigin && (
        req.mode === "navigate" ||
        req.destination === "document" ||
        req.destination === "style" ||
        req.destination === "script"
    );

    if (isAppShellLocal) {
        event.respondWith(
            fetch(req, { cache: "no-store" })
                .then(function (response) {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(req, copy);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    return caches.match(req);
                })
                .then(function (fallback) {
                    return fallback || caches.match("./index.html");
                })
        );
        return;
    }

    // Navegacao de paginas externas: rede primeiro.
    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req, { cache: "no-store" }).catch(function () {
                return caches.match(req).then(function (cachedPage) {
                    return cachedPage || caches.match("./index.html");
                });
            })
        );
        return;
    }

    // Assets estaticos: cache-first com atualizacao em background.
    event.respondWith(
        caches.match(req).then(function (cached) {
            const networkFetch = fetch(req)
                .then(function (response) {
                    if (response && response.status === 200) {
                        const copy = response.clone();
                        caches.open(CACHE_NAME).then(function (cache) {
                            cache.put(req, copy);
                        });
                    }
                    return response;
                })
                .catch(function () {
                    return cached;
                });

            return cached || networkFetch;
        })
    );
});

