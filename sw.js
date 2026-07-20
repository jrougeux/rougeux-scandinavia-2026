const CACHE_NAME = "rougeux-trip-v39";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./data.js",
  "./poi_data.js",
  "./manifest.json",
  "./favicon.ico",
  "./icons/favicon-32.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/fonts/dm-sans-normal-latin.woff2",
  "./assets/fonts/dm-sans-normal-latin-ext.woff2",
  "./assets/fonts/dm-sans-italic-latin.woff2",
  "./assets/fonts/dm-sans-italic-latin-ext.woff2",
  "./assets/leaflet/leaflet.js",
  "./assets/leaflet/leaflet.css",
  "./assets/leaflet/images/layers.png",
  "./assets/leaflet/images/layers-2x.png",
  "./assets/leaflet/images/marker-icon.png",
  "./assets/leaflet/images/marker-icon-2x.png",
  "./assets/leaflet/images/marker-shadow.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response && response.status === 200 && event.request.method === "GET") {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
