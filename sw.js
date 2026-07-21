const CACHE_NAME = "rougeux-trip-v74";
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
  "./assets/idb-keyval/idb-keyval.js",
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

// iOS Safari's native PDF viewer (what backs <embed type="application/pdf">
// in the ticket file viewer -- see app.js's renderTicketFileView()) loads a
// PDF progressively via byte-range GETs (a `Range: bytes=...` request
// header) rather than one plain full GET, unlike the plain <img> fetch a
// JPG ticket uses -- this is why ticket JPGs work offline while PDFs
// didn't, even though both are cached by the exact same mechanism below.
// A cached *full* (200) response can't satisfy a Range request as-is: the
// browser expects a 206 Partial Content reply with Content-Range/
// Content-Length headers describing the slice, and Cache Storage's own
// match() does not reliably manufacture that from a stored 200 across
// browsers -- so without this, every Range request against an
// already-cached ticket PDF got back a full 200 body when a 206 was
// expected, which WebKit's PDF viewer treats as a failed/unusable load.
// This slices the cached blob manually and returns a real 206.
function buildRangeResponse(cachedResponse, rangeHeader) {
  return cachedResponse.blob().then((blob) => {
    const total = blob.size;
    const m = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader || "");
    let start = 0;
    let end = total - 1;
    if (m) {
      const hasStart = m[1] !== "";
      const hasEnd = m[2] !== "";
      if (hasStart && hasEnd) {
        start = parseInt(m[1], 10);
        end = parseInt(m[2], 10);
      } else if (hasStart && !hasEnd) {
        start = parseInt(m[1], 10);
        end = total - 1;
      } else if (!hasStart && hasEnd) {
        // Suffix form ("bytes=-500" -- last 500 bytes)
        start = Math.max(0, total - parseInt(m[2], 10));
        end = total - 1;
      }
    }
    end = Math.min(end, total - 1);
    if (!(start >= 0) || start > end || start >= total) {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: new Headers({ "Content-Range": `bytes */${total}` })
      });
    }
    const headers = new Headers(cachedResponse.headers);
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    headers.set("Accept-Ranges", "bytes");
    return new Response(blob.slice(start, end + 1), {
      status: 206,
      statusText: "Partial Content",
      headers
    });
  });
}

self.addEventListener("fetch", (event) => {
  // A request explicitly marked "reload" -- app.js's bulk "Download"
  // buttons/prefetch paths pass { cache: "reload" } specifically for
  // this -- skips straight to the network instead of serving whatever's
  // already in Cache Storage. Without this, those "download" actions,
  // whose entire purpose is guaranteeing a correct/complete file, were
  // getting silently short-circuited by an *existing* cache entry (e.g.
  // one left over incomplete from before the event.waitUntil() fix
  // above, back when a write could get cut short) -- a plain fetch()
  // from the page has no other way to bypass this handler's own
  // cache-first Cache Storage check.
  const forceFresh = event.request.cache === "reload";
  const rangeHeader = event.request.headers.get("range");
  event.respondWith(
    (forceFresh ? Promise.resolve(null) : caches.match(event.request)).then((cached) => {
      if (cached) {
        // See buildRangeResponse() above -- a Range request against an
        // already-cached full response needs a manually-sliced 206, not
        // the cached 200 as-is.
        if (rangeHeader && cached.status === 200) return buildRangeResponse(cached, rangeHeader);
        return cached;
      }
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
        //
        // A response to a Range request (real status 206, or fetched
        // while online before ever being fully downloaded) is deliberately
        // never cached here -- caching it under this URL's key would
        // permanently poison that key with a partial body, since
        // everything above (and buildRangeResponse()) assumes a cached
        // entry is the complete file. app.js's bulk downloader/prefetch
        // paths always request the full resource with no Range header,
        // so the cache is normally already fully primed before a viewer's
        // own Range request ever reaches the network.
        // A forceFresh (cache: "reload") request is exclusively how
        // app.js's downloadUrls() marks its own bulk-download requests --
        // no other code path in this app sets that. downloadUrls() now
        // does its own cache.put() directly from the page (see its doc
        // comment) so it can directly await the write actually
        // completing, rather than trusting this handler's fire-and-forget
        // event.waitUntil() to have finished by the time it reports
        // "done". Also having this handler clone() and cache.put() the
        // *same* response the page is independently about to read and
        // cache.put() itself is an unnecessary redundancy -- two
        // independent consumers racing to read/cache the same underlying
        // body is exactly the kind of thing that behaves unpredictably
        // across browsers, and is a plausible explanation for downloads
        // that report success far too fast with nothing actually
        // persisted. Excluding forceFresh requests here means there's
        // only ever one writer for a downloader-initiated request: the
        // page itself.
        const cacheable = response && event.request.method === "GET" && !rangeHeader && !forceFresh &&
          (response.status === 200 || response.type === "opaque");
        if (cacheable) {
          const copy = response.clone();
          // event.waitUntil() here (not a bare, un-awaited promise) is
          // load-bearing, not decorative: respondWith()'s own promise
          // resolving (the `return response` below) is *all* the
          // lifetime guarantee a fetch event gets by default -- the
          // browser is free to suspend/terminate this service worker
          // immediately afterward, with no obligation to let a separate,
          // un-awaited cache.put() promise actually finish writing to
          // disk. Without this, the page-side fetch() correctly
          // resolves successfully (the response was real and already
          // delivered), so app.js's bulk downloader reports "done" --
          // while the cache.put() that was supposed to make the file
          // available offline could get silently cut off mid-write,
          // especially under the bulk downloader's several-requests-at-
          // once concurrency. This is exactly what "the download says
          // complete but the file still isn't there offline" looks like:
          // a real bug in this handler, not a reporting bug in app.js.
          event.waitUntil(
            caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(event.request, copy))
          );
        }
        return response;
      }).catch(() => cached);
    })
  );
});
