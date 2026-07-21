const CACHE_NAME = "rougeux-trip-v61";
// Holds everything fetched at runtime and not part of the precached shell
// below: map tiles (per-day canvas renderer and the trip-wide Leaflet
// map, including the proactive prefetch in app.js) and ticket PDFs/JPGs.
// Deliberately NOT versioned/bumped like CACHE_NAME -- activate below
// only deletes caches that don't match either name, so a tile or ticket
// the user already has offline survives every future app update instead
// of being wiped and needing a fresh download each time CACHE_NAME bumps.
const RUNTIME_CACHE_NAME = "rougeux-trip-runtime";
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
    caches.open(CACHE_NAME).then((cache) =>
      // Deliberately NOT cache.addAll(ASSETS) -- addAll is all-or-nothing,
      // so a single asset failing to fetch (a flaky edge/CDN blip during
      // deploy, a transient network hiccup) rejects the whole install and
      // silently strands the app on the OLD service worker forever, with
      // no visible error and no future retry, since a failed install
      // never reaches activate/skipWaiting. Caching each asset
      // individually means one bad fetch can't block everything else --
      // a missed asset just falls back to the runtime fetch handler's
      // opportunistic caching the first time it's actually requested.
      Promise.all(
        ASSETS.map((url) => cache.add(url).catch((err) => {
          console.warn("[sw] precache failed, continuing anyway:", url, err);
        }))
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        // Cross-origin requests without CORS (e.g. the OpenStreetMap tile
        // <img>/Image() fetches both map renderers use) always come back
        // "opaque" -- status is forced to 0 and type to "opaque" so the
        // page can't introspect a cross-origin response, even on success.
        // The original `status === 200` check only ever matched same-
        // origin app assets, so map tiles were silently never cached and
        // the map went blank offline even after being viewed online.
        // Opaque responses are cached on faith (a failed/blocked request
        // also looks opaque, so an errored tile could get cached too) --
        // an acceptable trade-off for map tiles specifically.
        const cacheable = response && event.request.method === "GET" &&
          (response.status === 200 || response.type === "opaque");
        if (cacheable) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
