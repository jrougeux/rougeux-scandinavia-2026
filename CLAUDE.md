# Rougeux Family — Sweden & Norway 2026 Itinerary App

A static, offline-first PWA showing the full 16-day trip logistics itinerary
(Jul 22 – Aug 6, 2026: Stockholm → Mora → Karlstad → Oslo → Voss → Bergen).

No build step, no backend. Plain HTML/CSS/JS, deployable by dragging the folder
onto any static host (Netlify Drop, GitHub Pages, Cloudflare Pages, Vercel,
etc.). One runtime dependency: Leaflet.js, self-hosted under `assets/leaflet/`
(no CDN, no npm/build step) for the trip-wide map view — everything else is
still dependency-free vanilla JS.

## Files

- `index.html` — entry point, loads data.js, poi_data.js, then app.js
- `data.js` — the entire trip dataset as `window.TRIP_DATA`, generated from
  `Rougeux_Scandinavia_Master.json` (see "Regenerating data" below)
- `poi_data.js` — a companion dataset, `window.POI_DATA`: 51 points-of-interest
  entries powering the "Wiki" bottom-nav view (directory + detail pages) and
  the map's yellow "Point of Interest" pins. Generated the same way as
  `data.js` — mechanically wrapped from a source JSON
  (`points_of_interest.json`, also in the repo root) via
  `'window.POI_DATA = ' + JSON.stringify(data, null, 0)` (with
  `ensure_ascii=False` if regenerating from Python, so diacritics stay as
  literal UTF-8 rather than escape sequences). Each entry has: `id` (a
  lowercase/underscore slug, used as the Wiki detail-view key and the
  `"poi:" + id` map-pin key), `name`, `category`, `country`,
  `coordinates.{lat,lng}`, `tier`, `related_days[]`, `summary`, `content`
  (long-form essay, may contain literal `**bold**`/`*italic*` markdown
  syntax — see `mdLiteToHtml()` in `app.js`), `fun_fact`, `sources[]`.
  **POI content is deliberately Wiki/Map-only — it must never appear in the
  Day view** (Logistics list, Dining options, story/reminders); it's an
  independent, separately-sourced dataset, not part of the day-by-day
  logistics plan
- `app.js` — all rendering/routing logic, vanilla JS, no framework
- `styles.css` — design system (CSS custom properties at the top of the file)
- `manifest.json` + `sw.js` — PWA manifest and service worker for offline/
  "Add to Home Screen" support. `sw.js` caches assets cache-first, split
  across two cache stores: `CACHE_NAME` holds the precached `ASSETS` app
  shell (index.html/app.js/styles.css/data.js/poi_data.js/icons/fonts/
  Leaflet), while `RUNTIME_CACHE_NAME` (`"rougeux-trip-runtime"`, never
  version-bumped) holds everything the fetch handler opportunistically
  caches at runtime — map tiles and ticket PDFs/JPGs. **Bump `CACHE_NAME`
  (e.g. v7 → v8) any time app.js/styles.css/data.js/poi_data.js/
  index.html change** — otherwise the browser won't detect `sw.js` as
  changed, won't install a new service worker, and silently keeps serving
  the old cached files even after a normal reload (a hard refresh / cache
  clear is needed to recover without a version bump). `RUNTIME_CACHE_NAME`
  is deliberately a separate, un-bumped store: `activate` only deletes
  caches that match *neither* name, so a map tile or ticket the user
  already has offline survives every future `CACHE_NAME` bump instead of
  being wiped and needing a fresh download on the next deploy. The fetch
  handler treats a cross-origin "opaque" response (`type === "opaque"`,
  `status` forced to `0` — what every OpenStreetMap tile request gets,
  since it's an uncredentialed cross-origin image load) as cacheable too,
  not just a real same-origin `200` — otherwise map tiles are silently
  never cached at all and the map goes blank offline even after being
  viewed online. The actual `cache.put()` call in the `fetch` handler is
  wrapped in `event.waitUntil()`, not left as a bare, un-awaited promise
  — this is load-bearing, not decorative. `respondWith()`'s own promise
  resolving is *all* the lifetime guarantee a fetch event gets by
  default; the browser is free to suspend/terminate the service worker
  immediately after the response is delivered, with no obligation to let
  a separate, un-awaited `cache.put()` actually finish writing to disk.
  Without `waitUntil()` here, a `fetch()` on the page side correctly
  resolves successfully (the response was real and already delivered),
  so `app.js`'s bulk downloaders (see "Offline data" below) correctly
  report "done" — while the write that was supposed to make the file
  available offline could get silently cut short mid-write, especially
  under those downloaders' several-requests-at-once concurrency. This is
  exactly what "the download says complete but the file still isn't
  there offline" looks like: a real service-worker bug, not a reporting
  bug in `app.js`. The `install` handler caches each `ASSETS` entry
  individually (`cache.add()` per URL, each wrapped in its own `.catch()`)
  rather than `cache.addAll(ASSETS)` — `addAll` is all-or-nothing, so one
  asset failing to fetch (a flaky edge/CDN blip during deploy) rejects the
  *entire* install silently, with no error surfaced anywhere, permanently
  stranding the app on the old service worker with no future retry (a
  failed install never reaches `activate`). On the `app.js` side,
  `reg.update()` is called explicitly after every `register()` (don't
  rely solely on the browser's own update-check schedule — iOS Safari,
  especially for an installed/home-screen PWA, can be slow/inconsistent
  about noticing a new `sw.js`), and a `controllerchange` listener
  reloads the page exactly once when a new service worker actually takes
  over, since activating a new worker doesn't retroactively change
  already-loaded `app.js`/`styles.css` in memory — without the reload, an
  update could sit fully installed and active but not actually change
  anything the user sees until some later, unrelated reload happened to
  occur. If a device is already stuck on a stale version from *before*
  this reload logic existed, this fix can't retroactively save it (the
  old, stuck code doesn't know to check more aggressively or reload on
  its own) — that one time needs a manual reset: delete and re-add the
  home-screen icon, or clear the site's data in Safari settings.
- `icons/` — app icons (`icon-192.png`, `icon-512.png`, `favicon-32.png`),
  plus `favicon.ico` (multi-resolution, 16/32/48/64px) in the repo root.
  All four share one design: the Swedish flag (blue `#006AA7` field, yellow
  `#FECC02` Nordic cross) on one half and the Norwegian flag (red
  `#EF2B2D` field, white-fimbriated blue `#002868` Nordic cross) on the
  other, split by a black diagonal line through the exact center of the
  square (any line through a square's center divides it into two
  equal-area halves, so this guarantees a true 50/50 split while still
  reading as angled rather than a plain vertical seam). Generated with
  Pillow — see the one-off script pattern in git history if regenerating
  after a redesign; there's no ongoing build step, these are just static
  PNGs/ICO checked into the repo
- `favicon.ico` — see `icons/` above; referenced via `<link rel="icon">`
  in `index.html` alongside `icons/favicon-32.png` for browsers that
  prefer a PNG favicon
- `index.html`'s Open Graph tags (`og:title`/`og:description`/`og:image`/
  `og:url`) make a link to this app shared via iMessage/text show the
  same split Sweden/Norway flag icon as the home-screen icon
  (`icons/icon-192.png`, via `apple-touch-icon`), rather than some
  inconsistent per-platform fallback — without them, a link preview has
  no explicit instruction on what image to show at all. `og:image`
  deliberately points at `icons/icon-512.png`, not `icon-192.png` — same
  icon design, just the higher-resolution source, which preview crawlers
  generally prefer to scale down from rather than a smaller source
  image. `og:image` (and `og:url`) are hardcoded as **full, absolute**
  URLs to the deployed GitHub Pages site
  (`https://jrougeux.github.io/rougeux-scandinavia-2026/...`) — Open
  Graph images specifically aren't reliably resolved from a relative
  path by every messaging app's link-preview crawler, unlike most of
  this app's other same-origin-relative asset references. If this app
  is ever redeployed to a different domain, these two tags need updating
  to match, or link previews will silently point at a dead/wrong URL.
- `manifest.json`'s `background_color`/`theme_color` must match the
  app's actual palette (`--bg` `#f6f4ee` / accent `#35576b`, same as
  `index.html`'s `<meta name="theme-color">`) — `background_color`
  specifically is what paints the blank splash screen the OS shows for
  an instant while an installed/home-screen PWA is launching, before the
  page itself has rendered anything, so a mismatched value shows up as a
  visible flash of the wrong color on every launch, not just an unused
  config field
- `assets/fonts/` — self-hosted DM Sans woff2 files (normal + italic, latin +
  latin-ext), loaded via `@font-face` in `styles.css` so the app works fully
  offline with no Google Fonts dependency
- `assets/leaflet/` — vendored Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`,
  `images/`), loaded in `index.html` before `app.js`. Powers only the
  trip-wide "Map" bottom-nav view; the per-day Map sections still use the
  hand-rolled canvas renderer and don't need it
- `assets/idb-keyval/idb-keyval.js` — vendored `idb-keyval` 6.3.0 (Apache-2.0,
  by Jake Archibald), a small IndexedDB key-value wrapper, loaded in
  `index.html` before `data.js`/`app.js`, exposing `window.idbKeyval`.
  Used exclusively for ticket file storage (`downloadTicketsToIdb()`/
  `countCachedTicketsIdb()`/`renderTicketFileView()` in `app.js`) — see
  the "Offline ticket downloads" notes below for why tickets moved off
  Cache Storage entirely. Precached in `sw.js`'s `ASSETS` list like every
  other vendored dependency, since the app can't load it at all offline
  otherwise
- `assets/tickets/` — PDF/JPG train tickets, taxi receipts, tour vouchers,
  etc. Static site with no server, so there's no way to list this folder's
  contents at runtime — `TICKET_FILES` in `app.js` is a hand-maintained
  array of every filename in it, and **must be updated any time a file is
  added, renamed, or removed here**. Each filename encodes its own date/
  time: `DD-MM-YYYY[ H(H)-MM] Description.ext` (the time part is optional;
  hour may be 1 or 2 digits, e.g. `8-34` or `14-23`) — see
  `parseTicketFilename()`. Ticket PDFs are *not* in `sw.js`'s precached
  `ASSETS` list (that would bloat the initial install by several MB and
  block the service worker's install step on every one of them
  succeeding). Instead, `prefetchTicketFiles()` in `app.js` fetches every
  file in `TICKET_FILES` in the background on first load, so tickets are
  available offline without the user needing to have opened each one
  first. ~9MB total across all current tickets, small enough to fetch in
  full rather than needing `prefetchMapTiles()`'s zoom-range-style
  scoping.
- `downloadUrls(urls, concurrency, opts, onProgress, onDone)` is the one
  shared bounded-concurrency download loop (with a per-request timeout
  fallback) behind *every* prefetch/download path in the app: the silent
  background `prefetchMapTiles()`/`prefetchTicketFiles()`, and the two
  "Download" buttons in the Checklist tab's "Offline data" section (see
  below). `fetch()` is what the service worker's fetch handler actually
  intercepts and caches — same mechanism as opening a ticket or panning
  the map normally opportunistically caches things, just triggered
  proactively instead of waiting for the user to do that. `opts.crossOrigin`
  (map tiles only) requests the response in `"no-cors"` mode, required
  for a cross-origin request to `tile.openstreetmap.org` that sends no
  CORS headers — `fetch()` in its default `"cors"` mode would otherwise
  reject outright. The resulting "opaque" response can't be introspected
  by the page even on success (`status`/`ok` are meaningless), so for
  those, resolving *at all* (vs. rejecting) is the only success signal
  available; same-origin ticket requests get a real, readable `res.ok`.
- The Checklist tab has an "Offline data" section (`renderOfflineDataRow()`)
  with one row each for tickets and map tiles: a progress bar, a status
  line, and a "Download" button. This exists because the silent
  background prefetch is unobservable and unretriable from the UI — if it
  silently stalls (a flaky connection, or iOS evicting Cache Storage
  under storage pressure, which a plain website has less protection
  against than an installed app) there's no way to tell or retry. Each
  row's progress bar reflects **actual** current cache contents on
  mount (`countCachedUrls()`, via `caches.match()` — with no cache name
  given, that searches every cache bucket for the origin, same as the
  service worker's own fetch handler, so it doesn't need to know/import
  `RUNTIME_CACHE_NAME` from `sw.js`), not just a `localStorage` "done"
  flag that this whole feature exists because it can't be fully trusted.
  Tapping "Download" always re-runs the full download regardless of that
  flag (the point of a manual "force" trigger), shows live progress, and
  updates the flag on completion so the silent prefetch doesn't
  redundantly re-run next load. `navigator.storage.persist()` is also
  requested once on load (best-effort, silently ignored if unsupported or
  denied) to reduce the odds of exactly that kind of silent eviction in
  the first place.
- `downloadUrls()` checks `navigator.onLine === false` and bails out
  immediately (`onDone(0, urls.length)`) rather than attempting any
  fetches — this matters specifically for the manual "Download" buttons,
  which (unlike the silent background prefetches, which already checked
  this before ever calling in) had no such guard: tapping Download while
  genuinely offline used to still attempt every request. Since
  `onProgress`/the progress bar advance on *every settled* request
  regardless of success or failure, a batch of failures — however fast or
  slow they resolve — still visually read as real download progress
  happening even though nothing was actually being cached. The button's
  own click handler also checks this directly (not just relying on
  `downloadUrls()`'s internal guard) so it can show a specific "you're
  offline" message immediately, instead of a generic post-hoc failure
  count.
- `downloadUrls()`'s `settle()` only fires after the full response body
  has actually been consumed, not right after the `fetch()` promise
  itself resolves. This matters because `fetch()` resolves as soon as
  response **headers** arrive, not once the full body has actually
  finished transferring -- checking `res.ok` and calling a request "done"
  at that point meant a multi-megabyte ticket PDF could be reported
  complete in a fraction of a second, long before it had actually
  finished downloading (the real giveaway that surfaced this: a progress
  bar finishing near-instantly for files that should take several
  seconds). This originally called `res.blob()` purely to force waiting
  for the real, complete transfer, discarding the result. It now instead
  waits on `cache.put(url, res)` itself (see the direct-page-write note
  below) -- `cache.put()` needs an unconsumed body to store, and its own
  resolution doesn't happen until the full body has been read either, so
  it serves as the same completion signal for free, with the added
  benefit of also confirming the actual disk write succeeded (`res.blob()`
  alone said nothing about whether a *separate* service-worker-side
  `cache.put()` had also completed). A body that fails partway through
  (the connection drops after headers arrived but before the file
  finished) is correctly treated as a failure regardless of what the
  headers said.
- Map tile concurrency (`prefetchMapTiles()` and the Checklist tab's
  "Download" button) is 3, not a more aggressive number, because
  `tile.openstreetmap.org`'s usage policy actively rate-limits/blocks
  request patterns that look like bulk scraping, and firing a burst of
  ~2,400 tile requests at high concurrency risks exactly that. A
  rate-limited or blocked response still *resolves* (it doesn't reject),
  so under the "opaque cross-origin response = treat any resolution as
  success" rule described above, it would get miscounted as a
  successfully-cached tile when it's actually an error response —
  plausibly part of why some zoom levels came back incomplete even
  though the download reported itself complete.
- `downloadUrls()` passes `{ cache: "reload" }` on every request it makes
  (in addition to `{ mode: "no-cors" }` for cross-origin tile requests),
  and `sw.js`'s fetch handler explicitly checks
  `event.request.cache === "reload"` to skip its own `caches.match()`
  cache-first check and go straight to the network when set. Without
  this, a "Download" button tap was just being served back whatever was
  *already* in Cache Storage — including a stale/incomplete entry left
  over from before the `event.waitUntil()` fix above (back when a write
  could get silently cut short) — and would never actually re-fetch
  anything from the network at all. That's a plausible root cause for a
  download reporting "complete" almost instantly while the cached file
  stays broken/unusable, since the fetch handler had no other way to
  bypass its own cache-first check; a plain page-side `fetch()` can't
  reach past a service worker on its own. Because `fetchOpts` now always
  contains `{ cache: "reload" }`, it's always a truthy object regardless
  of cross-origin status, so the success check can no longer use
  `fetchOpts`'s truthiness to tell same-origin ticket requests (where
  `res.ok` is meaningful) apart from cross-origin opaque tile requests
  (where it isn't) — `downloadUrls()` computes `crossOrigin` as its own
  variable up front and uses *that* instead.
- Ticket **JPGs** worked offline after the fixes above, but ticket **PDFs**
  still didn't, even once fully cached — the actual root cause was in how
  the two are *viewed*, not downloaded. `renderTicketFileView()` (see
  below) shows JPGs via a plain `<img>` (one full GET) but PDFs via
  `<embed type="application/pdf">`, which iOS Safari's native PDF viewer
  loads progressively via byte-range GETs (`Range: bytes=...` request
  headers) rather than one full GET. A cached *full* (200) response can't
  satisfy a Range request as-is — the browser expects a real 206 Partial
  Content reply with matching `Content-Range`/`Content-Length` headers,
  and Cache Storage's own `match()` does not reliably manufacture that
  from a stored 200 across browsers — so every Range request against an
  already-cached ticket PDF was getting back a full 200 body when a 206
  was expected, which WebKit's PDF viewer treats as a failed/unusable
  load. This is why every PDF failed regardless of size while both JPGs
  worked, and why the download itself could genuinely "complete" (the
  full file really was cached) while the file still wouldn't open
  offline. `sw.js`'s fetch handler now checks for a `Range` header on a
  cache hit and, if present, hands the cached response to
  `buildRangeResponse()`, which reads the cached blob, parses the
  `bytes=start-end` / `bytes=start-` / `bytes=-suffixLength` header forms,
  slices the blob to the requested range, and returns a real `Response`
  with `status: 206` and `Content-Range`/`Content-Length`/`Accept-Ranges`
  headers describing the slice (or `416 Range Not Satisfiable` if the
  requested range is out of bounds). A response to a Range request is
  deliberately never written to the cache itself (`cacheable` also checks
  `!rangeHeader`) — caching a partial body under the same URL key would
  permanently poison that key for every future request, same-Range or
  not, since everything here assumes a cached entry is the complete file;
  `downloadUrls()`'s bulk downloads and the silent prefetches always
  request the full resource with no Range header, so the cache is
  normally already fully primed by the time a viewer's own Range request
  ever reaches this handler.
- Even with the 206 fix above, a plain `fetch()`-based download (the
  Checklist "Download" button, and the silent `prefetchTicketFiles()`)
  did not reliably produce a usable offline copy of a ticket **PDF** on
  iOS Safari in practice — while manually opening a PDF once while online
  (going through the real `<embed type="application/pdf">` viewer)
  reliably made it work offline afterward. An earlier attempt at fixing
  this (`downloadTicketFiles()`/`warmPdfFiles()`/`warmPdfViaEmbed()`,
  since removed) tried to mimic that manual workaround by driving a
  hidden, off-screen `<embed>` for each PDF instead of a plain `fetch()`
  — this helped but still wasn't fully reliable, and risked iOS memory
  pressure from creating many native PDF plugin instances back-to-back.
  The actual root cause was more fundamental: the service worker's own
  `cache.put()` (wrapped in `event.waitUntil()`, per the fix earlier in
  this list) is spec-correct, but iOS Safari's service worker
  implementation has not proven reliable at actually honoring that
  extended lifetime under the back-to-back request volume a bulk
  download produces — so a "download complete" signal based on the
  fetch succeeding, alone, was never fully trustworthy for *any* file
  type, PDFs just hit it hardest since they're the largest files here.
  `downloadUrls()` now writes the fetched response into Cache Storage
  **directly from the page** after a successful fetch —
  `caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.put(url, res))`
  — instead of depending solely on the service worker's own fetch handler
  to do it. `RUNTIME_CACHE_NAME` is duplicated as a plain constant in
  `app.js` (no shared module between the two files, so it must be kept in
  sync with `sw.js`'s constant of the same name by hand). A page-side
  promise chain can be waited on directly, so `cache.put()`'s own
  resolution is a definite, checkable guarantee the write completed,
  rather than an assumption about a separate execution context's
  extended-lifetime behavior — this also means the earlier `res.blob()`
  call (added purely to force full-body consumption before declaring
  success) is no longer needed: `cache.put()` needs an *unconsumed*
  response body to store it, and its own resolution doesn't happen until
  the full body has been read either, so it serves as that same
  completion signal for free. This lands in the exact same
  `RUNTIME_CACHE_NAME` bucket the service worker's own opportunistic
  caching uses — but (see the next bullet) `sw.js`'s fetch handler
  deliberately skips its *own* `cache.put()` for these same requests now,
  rather than both writing the same response independently. Ticket PDFs
  go through the exact same `downloadUrls()` path as JPGs and map tiles —
  no more PDF/JPG split.
- The very first version of the direct-page-write fix above still
  regressed to the *original* symptom this whole saga started from —
  every file "downloading" almost instantly with nothing actually
  persisted — because `sw.js`'s fetch handler was *also* still doing its
  own independent `response.clone()` + `cache.put()` for the same
  request (the original opportunistic-caching logic, still unconditional
  at the time). Two independent consumers both cloning and reading the
  same underlying response body is exactly the kind of redundancy that
  can behave unpredictably across browsers, and is a plausible
  explanation for a write that reports success without anything actually
  landing on disk. `sw.js`'s `cacheable` check now also excludes a
  `forceFresh` (`cache: "reload"`) request — a signal exclusively sent by
  `downloadUrls()`, never by ordinary browsing — so there is exactly one
  writer for any downloader-initiated request: the page itself.
  `downloadUrls()` also no longer trusts `cache.put()`'s own resolution
  as proof of success by itself; it re-reads the same URL back via a
  fresh, independent `caches.match()` call afterward and only reports
  success if that read actually finds the entry — catching the same
  "write reported success, nothing there" failure mode again in the
  future regardless of what causes it next time. `TICKET_PREFETCH_VERSION`
  was bumped to `"v4"` so everyone's existing "done" flag — quite
  possibly set by a false success under the previous mechanism — doesn't
  suppress a real retry here.
- The silent background prefetch (`prefetchTicketFiles()`/
  `prefetchMapTiles()`, on every app load) and the Checklist "Download"
  button can each independently decide to download the exact same set of
  files -- e.g. the silent prefetch is still running when the user finds
  and taps "Download" a few seconds later, or the Checklist view gets
  rebuilt from scratch mid-download (ticking *any* unrelated checklist
  item elsewhere on the same page re-renders the whole view, including
  this row, per this app's "full content replacement on every `render()`"
  model -- see above) and the user taps the freshly-mounted, once-again-
  enabled button while the original run is still going in the
  background. Two independent runs racing against the same URLs looked
  exactly like "the download restarts partway through, ending lower than
  where it already was" -- each run's `onProgress`/`onDone` reports its
  own independently-tracked counts to the same progress bar/button, so
  whichever run's callback fired most recently won, and a still-in-
  progress second run's low counts could visually stomp a first run's
  higher, later progress. `startDedupedDownload()`/
  `subscribeToActiveDownload()` (keyed by the same string already used
  for that resource's localStorage "done" flag -- `TICKET_PREFETCH_KEY`/
  `MAP_PREFETCH_KEY`, already a unique, stable per-resource-type
  identity) track at most one real download per key at a time in a
  module-scope `activeDownloads` map; every caller other than the one
  that actually started it just attaches its `onProgress`/`onDone` to the
  run already in flight. `renderOfflineDataRow()` checks this on mount
  too (before falling back to a `countCachedUrls()` snapshot) so a row
  that gets rebuilt while a download is running immediately shows that
  it's in progress (button disabled, live progress) instead of looking
  like a fresh, clickable "Download" button that doesn't know a run is
  already happening.
- Even the single-writer + independent-`caches.match()`-verification fix
  above wasn't the end of this saga: the exact same "reports success,
  nothing real happens" symptom recurred again after it shipped. Existence
  alone (`caches.match()` returning *something*) isn't proof of a *good*
  entry — a stale, empty, or truncated response left over from any of
  this saga's earlier broken-write mechanisms (there have been a few)
  would still pass an existence-only check, since `RUNTIME_CACHE_NAME` is
  deliberately never wiped across `CACHE_NAME` bumps. `downloadUrls()` now
  also compares the cached entry's real byte size (read via `.blob().size`
  on the re-fetched cache entry) against the original response's
  `Content-Length` header (captured before `cache.put()` ever touches it),
  requiring at least 90% of the expected size before counting a download
  as genuinely successful — allowing minor slack for legitimate transfer-
  encoding differences, but catching a wildly undersized or empty result.
  Cross-origin opaque tile responses can't have their headers read at all
  (same reason they can't use `res.ok`), so this size check is skipped for
  them and existence remains the only available signal there.
- Repeated rounds of testing this exact feature — several with genuinely
  broken write mechanisms at different points — mean `RUNTIME_CACHE_NAME`
  on a device that's been used to test this app across this whole saga
  may already contain a fair amount of stale/bad cruft from *before* any
  of the checks above existed, and/or be at risk of the origin's storage
  quota entirely (a real possibility after this many rounds of re-
  downloading ~9MB of tickets and ~25-45MB of map tiles) — either of which
  can cause silent, hard-to-diagnose failures with no way to inspect them
  without plugging into a Mac and using Safari's Web Inspector. The
  Checklist tab's Offline Data card now surfaces both of these directly,
  no Web Inspector needed: `renderStorageEstimateRow()` shows real,
  current `navigator.storage.estimate()` usage/quota for this origin
  (best-effort — support isn't universal, and the row simply omits itself
  if the call fails or is unavailable; note the function returns `null`
  rather than building a DOM node and calling `.remove()` on it
  synchronously in the unsupported case, since an element has no parent
  to remove itself from until *after* the caller appends it — calling
  `.remove()` before that append would silently do nothing and leave a
  stuck "Checking storage…" placeholder visible forever), and a "Clear
  cached data & start fresh" button (behind a native `confirm()`) that
  calls `caches.delete(RUNTIME_CACHE_NAME)` and clears both
  `TICKET_PREFETCH_KEY`/`MAP_PREFETCH_KEY` "done" flags, then
  re-`render()`s -- wiping every possible stale/bad entry from this app's
  entire testing history in one action, cheap to recover from since
  everything here is just re-downloaded from this same static site.
  `TICKET_PREFETCH_VERSION` was bumped to `"v5"` alongside this.
- None of the above fully solved it either — the exact same "reports
  success, nothing real happens" symptom for ticket PDFs kept recurring
  across several genuinely different, carefully-verified fix attempts
  (event.waitUntil() wrapping, an `<embed>`-driven warmup, a single
  direct page-side write, size-validated verification, a storage-quota
  display, a full cache wipe). At that point the pattern itself was the
  signal: not a bug in any one of those specific mechanisms, but Cache
  Storage + the service worker's fetch-interception path being
  fundamentally unreliable for this on iOS Safari. Ticket files (PDFs and
  JPGs both, for consistency) now skip that path entirely and are stored
  as raw `Blob`s in **IndexedDB** via `idb-keyval` (see `assets/idb-keyval/`
  above) — `downloadTicketsToIdb()` fetches each file, verifies the
  response (`res.ok`, byte size against `Content-Length`, same checks
  `downloadUrls()` uses), and calls `idbKeyval.set(url, blob)`, itself
  verified afterward with an independent `idbKeyval.get()` re-read
  checked against the same size — not because IndexedDB is known to have
  the same failure mode, but because "verify, don't trust a completion
  signal" is a good practice regardless. `renderTicketFileView()` now
  checks `idbKeyval.get(url)` first and, if a blob is there, creates a
  local `URL.createObjectURL(blob)` for the `<img>`/`<embed>` `src`
  instead of the plain network URL — offline viewing no longer involves
  a network request or the service worker intercepting anything for
  tickets at all, sidestepping the entire Range-request/206 problem
  above along with it. Falls back to the plain network URL (works fine
  online) if a ticket hasn't been downloaded yet.
  `currentTicketObjectUrl`/`revokeCurrentTicketObjectUrl()` track and
  release the one most-recently-created object URL so they don't
  accumulate across a session (object URLs don't survive a reload anyway,
  so this is a within-session hygiene concern, not a correctness one).
  `renderOfflineDataRow()` was generalized to take `downloadFn`/`checkFn`
  parameters instead of hardcoding Cache Storage calls, so it doesn't
  need to know which backend a given resource actually uses (at the time,
  map tiles still passed `downloadUrls()`/`countCachedUrls()` against
  Cache Storage — see the next bullet for why that changed too). The
  Checklist tab's "Clear cached data & start fresh" button now also calls
  `idbKeyval.clear()` alongside its existing `caches.delete(...)`.
  `TICKET_PREFETCH_VERSION` was bumped again (`"v6"`) so this new
  mechanism gets a real first run rather than being suppressed by a
  "done" flag set under any earlier one.
- Map tiles had the same "some zoom levels missing" symptom tickets had,
  and moved to IndexedDB right after tickets did, for the same reason —
  both bulk downloads now go through one shared `downloadToIdb(urls,
  concurrency, opts, onProgress, onDone)` (`downloadTicketsToIdb()` was
  renamed/generalized into this), with `opts.crossOrigin` selecting
  `{ mode: "no-cors" }` for tile requests same as the old `downloadUrls()`
  did. A cross-origin opaque response's body can still be read via
  `.blob()` and stored even though its status/headers can't be
  introspected — that's the whole point of caching an opaque response at
  all — so the verification here checks a non-zero blob size (the only
  signal available) instead of the byte-size-vs-`Content-Length`
  comparison same-origin ticket requests get (`Content-Length` isn't
  readable on an opaque response either). This directly catches a
  rate-limited/blocked tile response that still *resolves* (rather than
  rejecting) with an empty body — plausibly why some zoom levels came
  back incomplete under the old Cache-Storage approach, which had no way
  to detect that and cached the empty response "on faith." `countCachedIdb()`
  (renamed/generalized from `countCachedTicketsIdb()`) is identical for
  both resource types. `MAP_PREFETCH_VERSION` was bumped to `"v3"` for
  the same "don't let an old done flag suppress a real retry" reason.
  `RUNTIME_CACHE_NAME` is kept in `app.js` even though nothing writes
  through `downloadToIdb()` into it anymore — the service worker's own
  opportunistic caching of tiles fetched by ordinary map-panning (outside
  any bulk download) still uses it, and the Checklist tab's "Clear cached
  data" button still needs to know its name to wipe it.
  Serving downloaded tiles offline needed two separate changes, since
  tiles are drawn two different ways in this app: `drawStaticMap()` (the
  per-day canvas map) now batch-checks IndexedDB for every tile its
  current viewport needs in one `idbKeyval.getMany()` call (cheaper than
  one `idbKeyval.get()` per tile) before building each tile's `Image()`,
  using a `URL.createObjectURL()` blob: URL for tiles that were found and
  falling back to the plain network URL otherwise — revoking each object
  URL right after `Promise.all(loads)` resolves, since by then every
  `<img>` has already loaded (or failed) and doesn't need the blob: URL
  to stay alive for `drawImage()`. The trip-wide Leaflet map doesn't give
  this app that same direct control over tile loading — Leaflet's own
  `L.TileLayer` sets each tile `<img>`'s `src` internally — so
  `OfflineTileLayer` (`L.TileLayer.extend({...})`, used in place of the
  plain `L.tileLayer(...)` call) overrides `createTile(coords, done)`,
  Leaflet's documented extension point for exactly this, checking
  IndexedDB before setting `tile.src` and otherwise mirroring
  `leaflet.js`'s own default `createTile` (down to reusing its private
  `_tileOnLoad()`/`_tileOnError()` via `L.Util.bind()`, so fade-in/error
  handling behaves exactly as it would for a normal tile) — deciding the
  source asynchronously instead of synchronously is the only real
  difference. Its object URL is revoked once the tile's `load`/`error`
  event fires, since Leaflet never reassigns a new `src` onto the same
  `<img>` element afterward.
- `downloadToIdb()` did not originally check whether a URL was already
  successfully stored before re-fetching it -- for ~28 ticket files this
  was barely noticeable (a full re-run finishes in a few seconds either
  way), but map tiles are ~2,400 URLs taking several minutes, and
  anything that interrupts a run partway through that (the tab
  backgrounding, the phone locking, a service worker update reloading the
  page) meant the *entire* batch re-fetched from scratch on the next
  attempt -- not just slow and wasteful of bandwidth, but visually
  indistinguishable from "the download reverts back to 0%", since this
  function's own progress counters had no memory of what a previous,
  interrupted call had already finished. It now calls
  `idbKeyval.getMany(urls)` once upfront, splits `urls` into
  already-good (existing entry with a non-zero size) vs. still-`pending`,
  folds the already-good count into `onProgress`/`onDone` immediately
  (so a resumed run's very first progress callback reflects real prior
  progress, not zero), and only actually fetches the `pending` subset --
  making a long download properly resumable across an interruption
  instead of restarting from scratch every time. Verified with a
  scripted test covering a partial resume (6 of 10 already stored, only
  the remaining 4 fetched), a fresh start (all 10 fetched), and an
  already-fully-downloaded set (0 fetched).
- Resumability alone still wasn't enough: a full map tile run could
  visually complete (the progress bar reaching 100%, since it counts
  every *attempt* settling, not just successes) and then report back
  down near 0 succeeded, with nothing actually retrievable afterward --
  at ~2,400 tiles, not the ~28 ticket files this same code handles fine.
  The per-tile `idbKeyval.set()` immediately followed by an
  `idbKeyval.get()` re-read (added specifically to catch a write that
  reports success without anything real happening -- see above) was
  itself insufficiently trustworthy at this scale: an immediate read-back
  can succeed off an in-memory/write-behind state that hasn't necessarily
  been durably flushed to disk yet, the same underlying class of problem
  this saga hit with Cache Storage's `event.waitUntil()`, just surfacing
  differently here. `downloadToIdb()`'s real, trusted success count no
  longer comes from tallying each tile's in-loop verification result --
  `finalizeWithRealCheck()` does one further, separate
  `idbKeyval.getMany()` pass over the *entire* original url list only
  after every fetch/write attempt has already settled, and *that* final
  state (not the optimistic per-tile flags accumulated during the run) is
  what gets reported to `onDone`. Verified with a scripted test where 4 of
  10 writes are "phantom" (the in-loop `set()`/`get()` pair reports
  success, but the data was never truly, durably persisted) -- `onDone`
  now correctly reports `6/10`, not the `10/10` the in-loop checks alone
  would have claimed. Map tile concurrency was also dropped to `1` (fully
  sequential, down from `3`) in both `prefetchMapTiles()` and the
  Checklist row -- several concurrent IndexedDB writes in flight at once
  is a second plausible contributor to the same unreliability at this
  scale, on top of already being politer to `tile.openstreetmap.org`'s
  rate limits.
- Even concurrency 1 wasn't enough -- a full map tile run still visually
  completed and then reported back down near zero real bytes stored
  (confirmed via the Checklist tab's storage-usage display), and
  critically, **this reproduced identically in both Chrome and Safari**,
  installed or not. That single fact ruled out every theory up to this
  point in the saga (Cache Storage reliability, IndexedDB write-
  durability timing, storage quota -- quota specifically was ruled out
  directly, since both browsers reported well under 1% of their
  available quota in use) -- those are all engine/OS-specific, and would
  not be expected to reproduce identically across two completely
  different browser storage implementations. The actual likely cause:
  `tile.openstreetmap.org`'s usage policy explicitly asks for no more
  than ~2 requests/second and discourages bulk downloading outright --
  and this app had, by this point in its history, hit that server with a
  ~2,400-tile bulk-download attempt many times over. A rate-limited or
  blocked response can still *resolve* (rather than reject) as a non-
  empty opaque cross-origin response -- passing the non-zero-blob-size
  check `downloadToIdb()` already had, since that check can only catch a
  truly *empty* body, not a small block/error page's worth of bytes,
  which is all an opaque response's introspection-proof design leaves
  available to check. That would explain a run visually reaching 100%
  (every attempt still "settles," blocked or not) while almost nothing
  real ends up persisted -- identically on any browser, since this is a
  server-side policy response, not a storage bug at all. `downloadToIdb()`
  now enforces a minimum delay between requests for cross-origin (tile)
  URLs specifically (`minDelayMs`, `600`ms -- comfortably under the
  stated ~2/second ceiling) -- same-origin ticket requests have no such
  delay, since there's no third-party rate limit to respect there. This
  makes a full tile download noticeably slower (once concurrency-1
  serial fetches are also each spaced ~600ms apart, ~2,400 tiles is
  comfortably tens of minutes), but reliability matters more than speed
  for a background prefetch. Verified the delay is actually being
  applied (a scripted test confirming `setTimeout(loadNext, 600)` fires
  between cross-origin requests, with no such delay for same-origin
  ones) -- note this only proves the throttle is wired correctly, not
  that it resolves real-world rate-limiting, which can't be verified
  without hitting the real tile server. It's also possible this app's
  IP/session has already accumulated enough of a poor reputation with
  the tile server from this saga's many earlier bulk-download attempts
  that throttling correctly going forward doesn't immediately clear
  whatever cooldown/block period, if any, is already in effect.
- That reputation concern turned out to be exactly right, and worse than
  expected: an attempt to sidestep all of this by vendoring ~1,900 tiles
  as static files checked into the repo (fetched once, respectfully,
  from outside the app) was tried and **reverted** -- do not repeat this
  without first confirming tile.openstreetmap.org access is genuinely
  unblocked from wherever the download runs. Every single one of the
  ~1,900 downloaded files turned out to be byte-for-byte identical (same
  MD5 across a random sample and confirmed across the full set) --
  `tile.openstreetmap.org` was returning its "Access Blocked" warning
  image (see `osm.wiki/Blocked`) for literally every request in that
  run, not real map data. This was invisible to every check available at
  download time: the response was a real, valid, non-empty 256×256 PNG
  with a normal `200 OK` -- indistinguishable by content-type, size, or
  status from an actual tile, so nothing short of visually inspecting
  the image (or comparing hashes across supposedly-different tiles, the
  method that actually caught it) could have caught it programmatically.
  One manual single-tile test *before* starting the bulk run succeeded
  (real tile content) -- the block evidently activated within the first
  few requests of the run itself, meaning throttling to ~1 request/
  600ms did not prevent it. Both vendoring commits were reverted with
  `git revert` (not a history rewrite) once the user reported the map
  showing OSM's actual blocked-warning image instead of real tiles;
  `app.js`/`sw.js` are back to the pre-vendoring, throttled-live-download
  state, and `CACHE_NAME` was bumped forward (not reset backward) to
  make sure the reverted `sw.js` is still detected as a real update.
  **Before ever attempting a re-vendor**: verify tile access is actually
  unblocked first (e.g. a single manual `curl` request, *and* actually
  open the resulting image to confirm it looks like a map, not a warning
  graphic -- a `200 OK` alone proved nothing here), consider whether
  enough time has passed for any block/cooldown to lift, and strongly
  consider a tile source *other* than `tile.openstreetmap.org` for any
  future bulk fetch (a provider whose terms explicitly support offline/
  cached bulk use, e.g. via a free-tier API key) rather than repeating
  the same request pattern against the same server that's already shown
  it will silently substitute fake content rather than reject outright.
- Acted on that advice: the tile source is now **Stadia Maps**
  (`stadiaTileUrl(z, x, y)`, near `MAP_TILE_SIZE` at the top of the
  "Map (static tile rendering)" section), not `tile.openstreetmap.org`,
  used by every tile consumer in the app (`drawStaticMap()`,
  `OfflineTileLayer.createTile()`, `tileUrlsForRange()`/
  `buildMapPrefetchUrls()`). Chosen after actually reading (not assuming)
  both candidate providers' terms of service: MapTiler's free tier
  explicitly *prohibits* bulk downloading/export for offline use (same
  restriction that broke the OSM approach), while Stadia Maps' terms
  explicitly permit personal/non-commercial use (exactly what this app
  is) with offline caching up to 100MB/device as a general term, not
  gated behind a paid plan -- comfortably above this app's actual tile
  set. `STADIA_API_KEY` is a free-tier key (no credit card required to
  obtain one), meant to be embedded in client-side code exactly this way
  per Stadia's own docs -- it's a rate-limited/quota-tracked identifier,
  not a secret, the same pattern as a client-side Google Maps key.
  Critically, Stadia's tile responses include CORS headers
  (`Access-Control-Allow-Origin: *`, confirmed directly via `curl`) --
  unlike a raw `tile.openstreetmap.org` request, `downloadToIdb()` no
  longer needs `opts.crossOrigin`/`"no-cors"` mode for tiles at all, so
  `res.ok`/`Content-Length` are fully readable the same as a same-origin
  request, closing off the entire "opaque response, can't verify content"
  blindness that let OSM's blocked-warning image slip through undetected
  in the first place. Both Checklist-row/`prefetchMapTiles()` call sites
  dropped `{ crossOrigin: true }` in favor of `null` (matching how ticket
  downloads are called) and concurrency went back up to `3`, with no
  artificial throttle. Verified this thoroughly before trusting it with a
  full run, learning directly from the OSM incident: fetched tiles across
  a range of zoom levels/coordinates and confirmed every single one had a
  **distinct** MD5 hash (not a repeat), confirmed two tiles that
  *did* legitimately share a hash were both genuinely solid-color/blank
  areas (verified via actual pixel inspection, not assumed), and ran a
  30-tile concurrency-3 burst (matching the app's real download pattern)
  with zero errors and full content variety before considering the
  source trustworthy. `MAP_PREFETCH_VERSION` bumped to `"v5"`.
- The full ~2,385-tile download worked end to end (all downloaded,
  available offline) on the first real try with Stadia Maps, confirming
  the switch actually fixed the reliability saga -- but the user reported
  two follow-up problems with the *content*, not the download mechanism:
  the top three zoom levels appeared blank when panning around while
  offline, and there was no business/POI-level detail (shops, cafés,
  landmarks) the way the original OpenStreetMap style showed. Both traced
  back to the same original choice: `STADIA_TILE_STYLE` was
  `"alidade_smooth"`, a deliberately minimalist style with **no POI
  labels at all** and much smaller average tile sizes (both directly
  explain the "no business detail" report and a suspiciously small
  reported storage usage) -- switched to `"osm_bright"`, Stadia's
  classic-OSM-style, detail-rich option, explicitly documented by them as
  the right choice "where your users need lots of POIs." The "blank at
  high zoom" report turned out to be unrelated to the style and
  completely unrelated to Stadia's data (verified directly: `curl`-fetched
  real tiles at zoom 15-17 for every lodging location, both dense-urban
  Stockholm and small-town/rural ones, and every single one had
  substantial, varied real content -- ruling out "Stadia has no data
  there" before looking anywhere else). The actual cause: the prefetch
  only ever covered a radius around the 6 **lodging** points
  (`MAP_PREFETCH_CITY_VIEWPORT`, 900px). Real-world geographic coverage
  for a *fixed pixel* radius shrinks sharply as zoom increases, so by
  zoom 15-17 that 900px radius covers only a small area immediately
  around each hotel -- a user zoomed in that far is far more likely to be
  looking at something *specific* nearby (a restaurant, a landmark, a
  station) than idly panning the block around their lodging, and every
  point other than the 6 lodging ones had zero coverage at those zoom
  levels. `uniqueSecondaryPoints()` (right after `uniqueLodgingPoints()`)
  gathers every other real coordinate this trip already has --
  `TRIP_MAP_POINTS.detailPoints`/`.hubPoints`/`.poiPoints` (already
  computed once at module load for the trip-wide map's own pins) --
  excluding POIs with a `"Country"`/`"Region"` category (their
  coordinate is a country/region centroid, not a real place to zoom in
  on). `buildMapPrefetchUrls()` now also prefetches a smaller,
  `MAP_PREFETCH_SECONDARY_VIEWPORT` (400px) radius around every one of
  those points, at `MAP_PREFETCH_SECONDARY_ZOOMS` (15-17 specifically --
  exactly the zoom range the gap was reported at; lower zoom levels
  already have reasonable coverage from the overview + lodging viewports
  and weren't reported as a problem). Folded into the same `Set` as the
  lodging prefetch, so any tile already covered near a lodging point
  costs nothing extra. Computed and compared several candidate radii/zoom
  combinations against the app's real coordinate data before picking this
  one (~115 deduplicated secondary points, adding ~2,450 tiles -- roughly
  doubling the total to ~4,800, comfortably inside Stadia's 100MB/device
  allowance even accounting for `osm_bright`'s larger average tile size).
  `MAP_PREFETCH_VERSION` bumped to `"v6"`.
- The "1.6MB used" figure reported above doesn't hold up under scrutiny
  on its own -- ticket files alone are documented at ~9MB total, so even
  if map tiles contributed nothing, real usage should be at least 9MB,
  not 1.6MB. Given this entire saga has repeatedly been about "looks
  successful but isn't really there," that gap was worth taking
  seriously rather than waving off as "the browser's estimate is a bit
  off." `navigator.storage.estimate()`'s reported usage is a browser-
  computed estimate, not verified ground truth -- disk accounting,
  compression, and rounding can all cause it to diverge from real bytes
  stored, and apparently can diverge by a lot in practice. The Checklist
  tab's storage row now shows a **second, independent number** alongside
  it: `computeRealIdbUsage()` calls `idbKeyval.entries()` and sums the
  real `.size` of every `Blob` actually sitting in IndexedDB directly --
  a completely different code path from whatever produces the browser's
  own estimate, so it can't share whatever's causing that one to be
  wrong. Verified with a scripted test simulating exactly this
  discrepancy (a mocked browser estimate of 1.6MB against 9MB of
  actually-stored blob data) -- the row correctly displays both numbers
  together (`"Browser reports 1.6 MB... — 9.0 MB actually stored across N
  files"`), making a real gap between them a visible, actionable signal
  in the app itself rather than something only discoverable via Safari's
  Web Inspector. This doesn't yet explain *why* a gap exists if one
  really does (that needs the user to actually look at the new row's
  output) -- only makes it possible to tell the difference between "the
  browser's estimate is just imprecise" (both numbers roughly agree) and
  "something is actually missing" (they don't) without guessing.
- The wider zoom 15-18 coverage above still left the *very* highest zoom
  blank -- `MAP_PREFETCH_CITY_VIEWPORT_ZOOMS`/`MAP_PREFETCH_SECONDARY_ZOOMS`
  topped out at 17, but the trip-wide Leaflet map's own `maxZoom` (see
  `renderTripMapView()`) is 18 -- so pinch-zooming or tapping "+" all the
  way in on that map reached a zoom level nothing had ever prefetched.
  Verified Stadia's `osm_bright` genuinely has real, distinct tile
  content all the way to its documented native max of zoom 20 (`curl`-
  fetched real, varied tiles at 18/19/20 for multiple lodging locations)
  before deciding how far to extend -- going all the way to 20 for every
  point (not just the 6 lodging ones) was considered and rejected: it
  would triple the total tile count to ~11,000 (uncomfortably close to
  Stadia's 100MB/device allowance), and covering only 17 and 20 while
  skipping 18-19 would mean Leaflet's own step-by-step zoom controls
  (`zoomDelta`/`zoomSnap`, both default `1`) hit a visible blank flash at
  the skipped intermediate levels before real content reappeared at 20.
  Both `MAP_PREFETCH_CITY_VIEWPORT_ZOOMS` and `MAP_PREFETCH_SECONDARY_ZOOMS`
  were instead extended by exactly one level, to 18 -- matching the
  Leaflet map's actual ceiling exactly, so every step of a normal zoom
  gesture is covered with no gap, for a modest, safe increase (~6,600
  tiles total, up from ~4,800). `MAP_MAX_ZOOM` (the separate constant the
  per-day canvas map's own +/- buttons and pinch-zoom clamp to) was
  bumped from 17 to 18 too, kept in sync for the same reason.
  `MAP_PREFETCH_VERSION` bumped to `"v7"`.

## Data shape

`window.TRIP_DATA` top-level keys:
- `meta` — trip name, dates, traveler info
- `flights` — outbound/return flight legs
- `lodging` — array of stays with host/confirmation/check-in-out info, plus
  `lat`/`lon` (decimal degrees, geocoded from each stay's address) used to
  render the per-day map
- `days[]` — 16 entries, each with:
  - `legs[]` — logistics legs, each with `num` (continuous 1–166), `activity`,
    `mode`, `depart`, `arrive`, `detail`, `flag` (bool — still open/unconfirmed)
  - `glance`, `reminders[]` — day summary and "don't forget" notes
  - `story[]` — background/history sections ({heading, text})
  - `dining[]` — restaurant candidates ({name, meal, status, leading, address,
    phone, website, description})
  - `contacts[]` — phone numbers relevant to that day
- `global_open_items[]` — trip-wide open decisions
- `key_learnings[]` — planning notes/gotchas

## Design system

Defined as CSS custom properties in `styles.css` (`:root`):
- Colors: light Nordic linen palette — `--bg`/`--surface` warm off-white/white,
  `--text` warm charcoal, `--amber` reserved for flags/warnings/focus rings only
  (the "Don't Forget" boxes use a neutral light gray, not yellow)
- Country is indicated with 🇸🇪/🇳🇴 flag emoji (days 1–8 Sweden incl. Karlstad,
  days 9–16 Norway — the crossing happens on Day 9), not color
- Type: `DM Sans` — the sole typeface app-wide (display/headers, body, and
  mono-style labels like times/confirmation codes all use it), self-hosted
  from `assets/fonts/` via `@font-face` (no network dependency)
- Day navigation: large ‹/› arrows + a tappable label that opens a full
  "jump to day" sheet (grouped by city, flag per day) — same pattern on
  mobile and desktop, no separate dot-strip nav
- The top masthead (`.app-banner` in `renderHeader()`) is a solid
  `--accent-light`-colored band, centered, white text — not plain text on
  the page background. Its own `padding-top` absorbs
  `env(safe-area-inset-top)` (the iPhone status bar's time/cell/wifi
  icons, relevant only when installed to the home screen as a standalone
  app — a regular browser tab gets `env() = 0`, a no-op) so the total
  header height doesn't change between the two. The dark background is
  why `apple-mobile-web-app-status-bar-style` is `black-translucent` in
  `index.html`: light status bar icons need a dark background under them
  to read correctly, and this app is iPhone-only (no Android-specific
  handling needed/present). The day-nav (arrows, "Day N of 16", progress
  bar) stays outside `.app-banner`, on the header's normal light
  background, unaffected by this — it's a separate functional element
  that only appears on the Day view, not part of the masthead itself.
  The banner has two lines: `"{family_name} Family Itinerary 🇸🇪🇳🇴"`
  (`.app-title`), then a subtitle (`.app-subtitle`) with the trip's date
  range formatted via `fmtFullDate()` (full month name + year, e.g.
  `"July 22, 2026 - August 6, 2026"`, derived from
  `DATA.meta.start_date`/`end_date` rather than hand-typed, same
  data-driven approach as the rest of the app). The two flag emoji have a
  deliberate 2px gap between them (`.app-title-flag-gap`, a `<span>`
  wrapping just the second flag with `margin-left: 2px` — plain emoji
  characters in the text have no room to add spacing between otherwise).
  `--accent-light` (`#569090`, defined right next to `--accent` `#35576b`
  in `:root`) is a color explicitly chosen apart from `--accent` — more
  teal/lighter — specifically so the 🇸🇪 flag emoji's own vivid,
  saturated blue reads as visually distinct against the banner instead of
  blending into it. `index.html`'s `<meta name="theme-color">` and
  `manifest.json`'s `theme_color` are kept in sync with this value (not
  `--accent`) for the same reason `background_color` has to match `--bg`
  — a mismatch between the banner and the OS-level chrome tint (status
  bar / task switcher) reads as a visible inconsistency, not a subtlety.
  `.app-header` also carries `transform: translateZ(0)` (same technique
  as `.bottom-nav`/`.trip-map-legend` elsewhere) to force it onto its own
  compositing layer — without it, a `position: sticky` element can
  visibly flicker or briefly disappear during rubber-band overscroll past
  the bottom of the page, since the browser is compositing content
  outside the normal document bounds during that bounce and sticky's
  continuous position recalculation doesn't handle that gracefully
  otherwise.
- `.day-nav-outer` (the day-nav arrows + progress bar, both wrapped in
  it) has `padding: 0 16px` so the `‹`/`›` arrows aren't flush against
  the screen edges — matches the ~16px side padding every other view's
  container already uses (`.search-view`, `.wiki-view`, etc.).
- `render()` does **not** tear down and rebuild the whole page on every
  navigation anymore (an earlier version did `root.innerHTML = ""` then
  rebuilt everything from scratch). `ensureShell()` creates three
  persistent containers the *first* time `render()` ever runs —
  `headerEl`, `viewEl`, `bottomNavEl` — and appends them to `#app` once;
  every subsequent `render()` reuses those exact same DOM nodes,
  updating their *contents* in place (`updateHeader()`/`updateBottomNav()`
  for the two shell pieces, `viewEl.innerHTML = ""` + a fresh append for
  the actual Day/Map/Wiki/etc. content, which has no persistent state
  worth preserving so full replacement there is fine and simpler). This
  matters specifically for the header: `position: sticky` needs the
  browser to continuously track an element's position relative to its
  scrolling ancestor, and destroying + recreating a brand-new sticky
  element on every navigation meant that tracking had to be
  reestablished from scratch each time — visible as the header flashing
  into its normal (static, in-document-flow) position for a frame before
  snapping back to sticky, reproducing in both Safari and Chrome since
  it's standard sticky-positioning behavior, not a WebKit quirk. The
  ticket-file full-screen takeover (see below) hides `headerEl`/
  `bottomNavEl` via `style.display = "none"` rather than removing them,
  for the same reason.
- Nearly every navigation action in `app.js` (any place that changes
  `state.view`/`state.dayIndex`/etc., calls `render()`, and then wants
  the page at the top) calls `window.scrollTo(0, 0)` **before** `render()`
  now, not after — e.g. `goToDay()` (when it has no specific leg/dining
  target), `goToMapPin()`, the bottom nav, the day-jump prev/next
  buttons, Wiki/Tickets navigation. `viewEl`'s content still gets fully
  replaced on every render (see above), and the new content is very
  often a different height than the old (e.g. a shorter day, or
  switching from Day to a shorter view) — scrolling *after* that swap
  meant there was a moment where the new (often shorter) content existed
  at the *old* scroll offset, an out-of-bounds position the browser has
  to clamp, which was visible as a brief flash on real devices before the
  app's own `scrollTo(0, 0)` corrected it a moment later. Scrolling
  first, while the old (still full-height) content is still on screen,
  avoids that mismatch entirely. The one case that still scrolls *after*
  render() is restoring `dayViewScrollY` when returning to Day view from
  elsewhere (bottom nav) — that needs Day view's real, often-taller
  content to exist first to land at the right offset; same story for
  `goToDay(dayIndex, legNum, ...)` with an actual leg/dining target, which
  needs the new DOM to exist before it can even find that element.
- `dayViewScrollY`'s capture is now explicit, not automatic:
  `captureDayScrollIfLeaving()` (right next to `dayViewScrollY` itself)
  is called directly by every call site that can leave Day view (the
  bottom nav, `goToMapPin()`), immediately *before* that call site's own
  `window.scrollTo(0, 0)`. This used to be handled generically inside
  `render()` instead, comparing `state.view` against a `lastRenderedView`
  tracked across calls — but that broke the moment those call sites
  started scrolling to `(0, 0)` *before* calling `render()` (see the
  flash fix above): by the time `render()` ran, `window.scrollY` already
  read `0` from that earlier scroll, so the old generic capture was
  recording `0` instead of the real prior position, silently breaking
  scroll restoration. Capturing explicitly, strictly before any scroll
  manipulation at each call site, is what makes it correct again — this
  is why the ordering at each such call site matters: capture, *then*
  scroll to top, *then* change `state.view` and render.
- `invalidateTripMapSize()` (registered once at module scope, listening
  on `visualViewport`'s `resize` event where available, falling back to
  plain `window` `resize`) calls `tripMapInstance.invalidateSize()`
  whenever it fires. Leaflet measures its container once at init and
  caches that size — it has no way to know the container was resized
  later unless told explicitly. `.trip-map-canvas`'s height is in
  vh/dvh units tied to the *visible* viewport, and iOS Safari's dynamic
  toolbar (address bar) showing/hiding as the user scrolls or interacts
  changes that real visible height without necessarily firing a plain
  `resize` event — without this, the map's internal panes/controls
  (including the zoom control) stay positioned for whatever size the
  container was when the map was created, gradually drifting out of
  alignment with where the container is actually rendered now (e.g. the
  zoom control ending up partly behind the header after some
  interaction, not on first load). `visualViewport`'s own resize event
  is the more precise, iOS-specific signal for exactly this.
- Nearly every clickable element gets `opacity: 0.6` on `:active` via a
  broad, low-specificity baseline rule (`button:active, a[href]:active`
  near the top of `styles.css`, right after the base `button` rule) —
  deliberately low specificity so any more specific existing `:active`
  rule elsewhere (e.g. a `background-color` swap) still applies *in
  addition to* this, not instead of it; the two compose rather than
  conflict since they touch different properties. `.checklist-item`
  (a `<label>`, not a `button`/`a`, so the broad rule doesn't reach it)
  has its own explicit `:active` rule for the same reason.
- Logistics legs are color-coded by category (lodging, transport, walking,
  dining, activity, note) via a left border stripe + tinted chip + emoji;
  see `categorizeLeg()` in `app.js` — every leg gets exactly one category,
  with "activity" as the fallback bucket
- Each day view has an expandable "Map" section (above "Background & story")
  showing that day's lodging location: a static map rendered on `<canvas>`
  from OpenStreetMap tiles (`tile.openstreetmap.org`, no API key/dependency),
  with +/- buttons that re-render at a different zoom level, plus a link that
  opens the location in Google Maps. See `renderMapSection()` in `app.js`.
  Tiles are only fetched the first time a day's Map section is opened (lazy,
  via `renderCollapsible()`'s `onFirstOpen` hook), not on every render.
  Pinch-to-zoom on this canvas is hand-rolled (`touchmove`/`endPinch()`
  in `renderMapSection()`), and clamps the *visual* CSS `scale()` preview
  to `2^(MAP_MAX_ZOOM - pinchStartZoom)` / `2^(MAP_MIN_ZOOM -
  pinchStartZoom)` — the exact scale at which `endPinch()`'s `scale =
  2^deltaZoom` math would land precisely on the limit — rather than just
  checking whether the gesture *starts* at the limit (an earlier,
  insufficient version of this fix: that caught a fresh gesture starting
  already at max/min zoom, but not one that pinches *past* the limit in
  a single continuous motion, e.g. zoom 15 through to past 17, which
  still showed the canvas visually scaling beyond what's achievable
  before snapping back once the gesture ended). This freezes the preview
  exactly at the boundary in both directions regardless of where the
  gesture started. The +/- buttons were never affected (they already
  check/disable at the limits directly).
- On first load (once the service worker actually controls the page --
  see `navigator.serviceWorker.ready` in the bootstrap at the bottom of
  `app.js`), `prefetchMapTiles()` proactively downloads map tiles for the
  region actually being visited, so offline map viewing works without
  requiring the user to have manually browsed every area first. Covers
  two stitched-together zoom ranges (no gap a normal zoom gesture could
  land in and hit blank tiles) -- see the comment above
  `MAP_PREFETCH_OVERVIEW_ZOOMS`/`MAP_PREFETCH_CITY_VIEWPORT_ZOOMS` for the
  full reasoning: `MAP_PREFETCH_OVERVIEW_ZOOMS` (4-9) fetches the whole
  trip's bounding box at zooms cheap enough to cover every city in one
  fetch, and `MAP_PREFETCH_CITY_VIEWPORT_ZOOMS` (9-17) fetches each
  lodging city individually at a *fixed pixel viewport* per zoom level
  (not a growing geographic bounds), so tile count stays roughly constant
  per level regardless of zoom, all the way from where the overview
  leaves off up through past the per-day map's own default zoom. ~2,400
  tiles / ~25-45MB total as of the current lodging list — wider than an
  earlier version that covered only a handful of isolated zoom levels (a
  real bug: zooming to any *other* level while offline hit blank tiles
  even in the correct region, worst on the trip-wide Leaflet map since
  its "fly into this city" flow passes through many intermediate zooms a
  user wouldn't hit on the simpler per-day canvas map) — but still
  deliberately bounded to the actual trip region across its practical
  zoom range, not "all of Scandinavia at every zoom level." Runs once (a
  `localStorage` flag under `MAP_PREFETCH_VERSION`, bump that constant to
  force a re-run e.g. after lodging locations change or this coverage is
  widened further), skips entirely if `navigator.onLine === false`, and
  only marks itself done after every queued tile settles (success,
  failure, or a 20s per-tile fallback timeout in case one request hangs
  rather than cleanly failing) so an interrupted first run retries in
  full next time rather than silently staying incomplete.
- Individual logistics legs (Logistics list) and dining candidates (Dining
  options) each get a "📍 View on map" or "🚶 Walking directions" link where a
  real location is known — see `mapLinkForLeg()`. These use Google Maps
  search/directions URLs (query text only, e.g. `"Royal Palace, Stockholm,
  Sweden"`), not the real lat/lon used for pins — see `MAP_SEARCH_QUERY`,
  `MAP_DINING`, `MAP_WALK` in `app.js`. Deliberately hand-curated per leg
  rather than parsed from `activity` text, since the text is too
  inconsistent (many legs have no separator between the action and the
  place name at all) for a reliable regex.
- Bottom nav has a trip-wide "Map" view (`renderTripMapView()` in `app.js`,
  between Day and Search) built on Leaflet: 6 city/lodging pins are always
  visible; tapping one flies in and reveals that city's individual
  activity/dining pins once zoomed past `TRIP_MAP_DETAIL_MIN_ZOOM`. Tapping
  a detail pin's popup jumps into that day's full itinerary. Pin
  coordinates (`MAP_POINT_COORDS_ACTIVITY`, `MAP_POINT_COORDS_DINING` in
  `app.js`) are geocoded from the exact same query text as
  `MAP_SEARCH_QUERY`/`MAP_DINING` above, so a pin's position always matches
  where its leg-level "view on map" link points.
- The trip map also plots "transport" legs (train/bus/ferry/funicular/taxi/
  flight/drive) as named-hub pins — stations, airports, ferry/bus stops —
  so e.g. the whole Voss → Myrdal → Flåm → Gudvangen Norway-in-a-Nutshell
  day is visible, not just its activity/dining stops. Since the same hub
  (e.g. Voss Station) is touched by several legs, these are aggregated one
  pin per hub (`HUB_COORDS`, `MAP_TRANSPORT` in `app.js`) with a popup
  listing every leg/day that passes through it, each jumping to that day.
  If a hub sits at the exact coordinates of an existing city/activity/
  dining pin (e.g. the "Flåm" hub and the "Free time in Flåm" activity leg
  are the same real-world point), no second marker is created there --
  instead the hub's visits are merged onto the existing pin's popup as an
  "Also passes through here" list, so the info isn't lost, it just isn't a
  separate stacked marker.
- The map remembers its pan/zoom and which popup (if any) was open across
  navigating away and back to the Map tab (in-memory only, via
  `tripMapPersisted`/`tripMapOpenPopupKey` in `app.js` -- resets on a full
  page reload). Every marker is tracked by a stable key (`"city:<location>"`,
  `"detail:<leg.num>"`, `"hub:<hub name>"`) so the same popup can be
  reopened after the map is torn down and rebuilt, since `render()` fully
  wipes and recreates the DOM (and the Leaflet instance) on every
  navigation -- see `trackMarker()` / `teardownTripMap()`.
- Every marker gets an explicit `zIndexOffset` (`tripMapZIndexOffset(kind)`
  in `renderTripMapView()`), overriding Leaflet's own default marker
  z-index, which is based purely on each marker's *current on-screen
  pixel Y position* (`leaflet.js`'s `Marker._setPos`:
  `this._zIndex = t.y + this.options.zIndexOffset`, with `zIndexOffset`
  defaulting to `0`). For two markers representing nearly the same real-
  world spot -- e.g. a POI pin and an activity/dining pin both at/near
  the same landmark, since POI pins are deliberately never deduped
  against other pins (see above) -- their pixel Y positions are nearly
  identical, so tiny sub-pixel rounding differences as the map zooms/pans
  can flip which one computes a fractionally larger Y, visibly
  "fluttering" which pin renders on top from one frame to the next.
  `tripMapZIndexOffset()` assigns each marker a large, fixed tier value
  (`TRIP_MAP_Z_TIER`, spaced `1000000` apart -- far more than any
  realistic pixel-Y difference could ever overturn) plus a per-call
  counter that breaks ties *within* a tier (e.g. two overlapping POIs)
  the same deterministic way every time, so the relative stacking order
  between any two markers is permanently decided the moment they're
  created rather than by their transient screen position. Points of
  interest sit in the lowest tier (supplementary background reading),
  below the actual logistics pins (transport/activity/dining), with
  lodging -- the biggest, most prominent icon -- always on top.
- The z-index fix above makes stacking order *deterministic* but doesn't
  stop pins from visually overlapping in the first place -- a user report
  (a purple activity pin and a red/pink dining-suggested pin both sitting
  on the exact same Gamla Stan square, after a hub pin was deliberately
  relocated there) showed that two pins close enough together are only
  *one* of them clickable at all, regardless of which renders on top.
  `spreadOverlaps(points, thresholdMeters, nudgeMeters)` in
  `buildTripMapPoints()` (right before its final `return`) runs once over
  every final pin from every source table combined -- lodging, activity/
  dining legs, transport/walking hubs, and POIs together, since the
  overlap that prompted this was a hub pin vs. a dining pin, and a POI-vs-
  POI duplicate turned up in the same pass (e.g. "Gudvangen" and
  "Njardarheimr Viking Village" geocoded to the identical coordinate).
  Groups every pair of pins within `thresholdMeters` (25m -- chosen to
  catch everything from exact 0m duplicates up through the closest
  legitimately-separate pairs already in this trip's data, e.g. the
  Storkyrkan Cathedral POI vs. its nearby activity-leg pin at ~19m) into a
  cluster via union-find (so a chain of 3+ mutually-close pins, e.g. the
  Flåm hub / the "Flåm" POI / the Flåmsbana POI, all end up in one
  cluster rather than pairwise-nudged into each other), then spreads every
  pin in a cluster outward from the cluster's shared centroid by
  `nudgeMeters` (7m -- an earlier pass used 12m, but that read as too far
  off the real location once seen on a device; 7m is enough separation to
  click each pin independently without straying noticeably from the
  actual spot) at evenly-spaced angles -- two pins land 14m apart, three
  land ~12m apart from each other, etc. -- enough separation to be
  independently clickable at any normal zoom level while each pin stays
  visually anchored to the same real spot. Cluster members are sorted by
  their own stable `key` before assigning angles, not left in whatever
  order they were built in, so which pin lands at which angle doesn't
  shuffle across re-renders. This intentionally does not touch or replace
  the *intentional* same-spot merges earlier in `buildTripMapPoints()`
  (e.g. a transport hub reusing a lodging's exact coordinates becomes one
  merged point, not two pins) -- those still collapse to a single point
  before this pass ever runs, so there's nothing left for it to spread
  apart. Because `legPinIndex`/`diningPinByAddress`/`poiPinById` were
  already populated earlier in the function with each referenced point's
  *pre-nudge* coordinates (copied by value, not by reference), all three
  are resynced immediately after `spreadOverlaps()` runs -- via a
  `pointsByKey` lookup keyed by each point's own stable `key` -- so a
  "Map view" link still flies to a pin's actual, possibly-nudged position
  rather than a stale pre-nudge one.
- The trip map has a Google-Maps-style "Current Location" control
  (`LocationControl` in `renderTripMapView()`, a custom `L.Control`
  stacked in the same top-left corner as Leaflet's own zoom control) that
  toggles a live "blue dot": tapping it once starts a
  `navigator.geolocation.watchPosition()` watch, centers the map on the
  first fix, and draws a dot + accuracy circle (`renderUserLocationOnMap()`)
  that keeps moving live as new fixes arrive; tapping it again deselects
  and stops tracking entirely (`toggleLocationTracking()` /
  `activateLocationTracking()` / `deactivateLocationTracking()`). A
  heading cone on the dot shows facing direction, sourced from
  `coords.heading` (GPS-derived, only present while actually moving) or
  falling back to the device compass via `deviceorientation`'s
  `event.webkitCompassHeading` (iOS Safari-specific — this app is
  iPhone-only, see below — requested via
  `DeviceOrientationEvent.requestPermission()` inside the button's own
  click handler, since iOS requires that call happen synchronously within
  a user gesture). Needs no network at all (GPS keeps working in airplane
  mode; nothing here is gated on `navigator.onLine`), so it works fully
  offline. Tracking state (`locationTrackingActive`/`userLocation`/the
  active `watchPosition` id) lives at module scope, independent of
  whether the Map view is even mounted — the watch keeps running while
  browsing other tabs so flipping back to Map shows an already-current
  dot; only the Leaflet layers that draw it are tied to the map's
  mount/unmount cycle (nulled out in `teardownTripMap()` alongside every
  other per-mount layer, redrawn on the next mount if tracking is still
  active). A `visibilitychange` listener pauses the underlying
  `watchPosition`/compass listener whenever the tab isn't active (battery
  saving) and silently resumes it when it's foregrounded again, without
  touching `locationTrackingActive` itself or re-prompting for
  permission — backgrounding is "not tracking right now," not "the user
  turned it off." None of this is persisted to localStorage; like the
  map's pan/zoom state below, it's in-memory only and starts fresh (off)
  on a full reload, so the app never silently starts requesting location
  on launch.
- `onLocationError()` only treats `PERMISSION_DENIED` (`err.code === 1`)
  as fatal (deactivates tracking + an explicit permissions message).
  `POSITION_UNAVAILABLE`/`TIMEOUT` are left alone entirely -- no
  deactivation, no touching `locationTrackingActive` or the watch -- with
  at most one non-fatal "still waiting" alert per activation
  (`locationErrorAlertShown`), since `watchPosition` keeps retrying
  automatically after either and could otherwise re-fire the same error
  repeatedly. This matters a lot in airplane mode specifically: GPS
  itself doesn't need a network connection, but the fast "assisted GPS"
  first-fix path normally does (it uses cell/WiFi data to shortcut the
  satellite search), so a cold GPS-only fix with airplane mode on can
  legitimately take 30-90+ seconds outdoors, or fail indoors entirely.
  Treating that as a fatal permissions error (the original behavior) was
  a bug, not a real permissions problem -- it killed tracking after one
  slow attempt and blamed Location Services settings for what was really
  just "still waiting for a satellite lock." `GEO_WATCH_OPTIONS.timeout`
  is 45s (up from an original 20s) to reduce how often that retry/error
  cycle happens, though the real fix is not tearing tracking down on it.
- The map legend (`.trip-map-legend`) is `position: fixed` to the bottom
  of the screen, just above the bottom nav (with a deliberate +2px gap,
  `bottom: calc(58px + safe-area)`, so it doesn't sit perfectly flush
  against it), rather than a normal-flow strip below the map — always
  visible without scrolling, overlaying the map/page rather than pushing
  content up. There's no "Tap a city to zoom in..." hint above it
  anymore (removed) — both `.trip-map-view` and `.trip-map-canvas` use
  `min-height`/`height: calc(100vh - 40px)` respectively (see the
  comment on `.trip-map-view`) so the *actual interactive map*, not just
  a placeholder background, extends all the way down to the legend. That
  40px deliberately undershoots the real header+nav overhead (comfortably
  more than 40px on any device) so the map always ends up at least as
  tall as the visible area above the fixed nav — worst case it extends a
  little further than needed, invisible underneath the fixed legend/nav,
  never a gap of exposed `--bg` tan showing through above them. It's a
  3-column CSS grid sized to content (`grid-template-columns: repeat(3,
  auto)`, not `1fr` or `flex-wrap`): `1fr`/flex-wrap either stretch each
  column full-width (left-aligning a short label like "POI" with a big
  gap after it) or can spill to a 3rd line on a narrow phone with longer
  label text; `auto` columns plus `justify-content` + `justify-items:
  center` guarantee exactly 2 rows *and* keep the block centered with
  even spacing between every item, regardless of viewport width.
- `.trip-map-canvas` has `isolation: isolate`, which is the actual fix
  for the map permanently painting over the legend/bottom nav once the
  canvas was made tall enough to extend underneath them (see above).
  Leaflet sets `position: relative` on this element via inline style at
  init, but `position: relative` alone does **not** establish a new CSS
  stacking context (that also needs an explicit `z-index`) — so without
  this, Leaflet's own internal panes/controls (`assets/leaflet/
  leaflet.css` gives them z-index values up to 1000, e.g. its popup pane
  and controls) weren't contained within the map: they escaped and
  stacked directly against page-level siblings like `.bottom-nav`
  (z-index 30) and `.trip-map-legend` (z-index 15), and *won*, since
  1000 > 30, covering both permanently rather than just during a pan.
  `isolation: isolate` forces proper containment without having to
  out-number Leaflet's own z-index scheme. `.trip-map-legend` and
  `.bottom-nav` also both carry `transform: translateZ(0)` as a separate,
  smaller defensive measure against a *different*, WebKit-specific bug
  where a `position: fixed` element can still lose to hardware-
  accelerated sibling content (Leaflet's `translate3d()` pan animations)
  unless it's also promoted to its own compositing layer — this one is
  Safari/iOS-only and wasn't the actual cause of the reported bug (which
  reproduced in Chrome/Firefox too, ruling out a WebKit-only
  explanation), but is cheap, harmless, and worth keeping regardless.
- `.trip-map-view`/`.trip-map-canvas` declare their `min-height`/`height`
  twice: once as `calc(100vh - 40px)`, then again as `calc(100dvh -
  40px)` (a browser without `dvh` support just ignores the second,
  invalid-to-it declaration and keeps the first). Plain `100vh` in Safari
  measures against the *largest* possible viewport, as if the address
  bar were always hidden, so the actually-visible area can be shorter
  than `100vh` by the address bar's height — this was enough to tuck the
  Leaflet zoom control's top edge under the sticky header by a few
  pixels, Safari-only (Chrome doesn't have this quirk). `100dvh`
  ("dynamic viewport height") tracks the address bar's real shown/hidden
  state instead.
- Leaflet's own zoom animation (`.leaflet-zoom-anim .leaflet-zoom-
  animated`, a `transform` transition) and tile loading (`.leaflet-tile`,
  toggled via `visibility` — an on/off switch, not something a CSS
  transition can animate) are both overridden in `styles.css`, loaded
  after `leaflet.css` in `index.html` so these same-specificity selectors
  win without `!important`: the zoom transform transition is slowed from
  Leaflet's default 0.25s to 0.4s, and tiles get an `opacity` fade-in
  layered on top of (not replacing) Leaflet's own `visibility` toggle.
  Together these soften what was a hard, instant pop on every zoom/tile
  load -- which also made `.trip-map-canvas`'s own placeholder background
  (`--surface-2`) flash starkly in the gap before new tiles appeared.
- Walking legs can also introduce a pin, not just activity/dining/transport
  ones -- e.g. day 14 leg 151 ("Bryggen") is a plain walking destination
  with no activity/dining leg of its own, so without this it wouldn't
  appear anywhere on the map. `MAP_WALK_HUBS` (leg.num -> named place in
  `HUB_COORDS`, same table transport hubs use) covers only the walking
  legs whose endpoint isn't already another pin; most walking legs need no
  entry since both ends already coincide with a lodging/activity/dining/
  transport-hub pin. These render with the "activity" pin color (they're
  places visited, not stations passed through) via `collectHubRoutes()`'s
  `kind` parameter in `buildTripMapPoints()`.
- Dining pins are split red vs. pink by `MAP_DINING_CONFIRMED` (leg.num
  set) in `app.js`: a leg in that set (an actually booked/paid tour, or
  dining[].status === "scheduled") gets the normal "dining" red; anything
  else with a resolved address (status suggested/tentative/along-the-route,
  or a hand-supplied venue with no formal dining[] entry) gets pin kind
  "dining-suggested" (pink) instead. This only changes the map pin color --
  the Logistics list's dining chip color is unaffected.
- Dining map pins show the actual venue name (e.g. "Den Gyldene Freden"),
  not the leg's often-generic activity text ("Dinner"/"Lunch") --
  `MAP_DINING_LABEL` (leg.num -> name) in `app.js`.
- Every `dining[]` entry with an address gets a pin and a "Map view" link
  in Dining options, not just the "leading" pick that's actually tied to a
  Logistics leg -- secondary/alternative candidates (e.g. "Restaurant
  Tradition" as an alternative to "Den Gyldene Freden") are geocoded
  directly in `MAP_DINING_EXTRA_COORDS` (keyed by address text, since they
  have no leg.num of their own) and shown as "dining-suggested" pins.
  `buildTripMapPoints()` returns `diningPinByAddress` (address ->
  key/lat/lon) covering both leg-tied and address-only dining pins, which
  `renderDiningItem()` uses directly for its "Map view" button.
- Every dining "View on Google Maps" link leads with the venue name, not
  just the address (e.g. "Godt Brød, Thorvald Meyers gate 49, ..." rather
  than just the address) -- an address alone can drop the Google Maps pin
  on the wrong tenant in a shared building. `MAP_DINING` itself must stay
  pure address text (it's also the join key for `diningPinByAddress`
  against `dining[].address`); the name is prepended only at the point the
  URL is built, in `mapLinkForLeg()` via `MAP_DINING_LABEL`, skipping a
  small set (`MAP_DINING_QUERY_SKIP_LABEL`) where the address already
  names the venue or the "label" isn't really a business name Google can
  look up (a tour meeting point, a "near X" description). Dining options
  entries do the same inline in `renderDiningItem()` using `d.name`.
- Every leg/dining-item with a resolvable location gets a "🗺️ Map view"
  link/button (separate from the "📍 View on Google Maps" external link)
  that jumps into the Map tab centered on that exact pin with its popup
  already open, via `goToMapPin()` -- it just sets `tripMapPersisted` and
  switches views, reusing the same restore mechanism described above.
  `buildTripMapPoints()` also returns `legPinIndex` (leg.num -> pin
  key/coords) covering lodging/activity/dining/transport legs and the
  walking legs listed in `MAP_WALK_HUBS`; it's computed once at module load
  as `TRIP_MAP_POINTS`, not per-render, since the underlying trip data
  never changes. Dining options section entries don't carry a leg.num of
  their own, so `legNumForDiningAddress()` finds it by matching
  `d.address` against `MAP_DINING`. Most walking legs (35 of 41) aren't in
  `legPinIndex` and so get no "Map view" link -- only those in
  `MAP_WALK_HUBS` are covered; the rest would need the same text-matching
  generalization `mapLinkForLeg()` does for its Google Maps links.
- Clicking a leg/day inside a map popup (the pin's own "Go to Day" button,
  or a visit row in an "Also passes through here" list), or clicking a
  Search result, jumps to that *specific* leg or dining item within the
  day view, not just the top of the day -- `goToDay(dayIndex, legNum,
  diningIndex)` takes optional 2nd/3rd arguments (at most one set per
  call) that scroll the matching `.leg[data-leg-num]` or
  `.dining-item[data-dining-index]` into view and flash it
  (`scrollToAndHighlight()` / `.leg-highlight` in `styles.css` -- applies
  to both element types). A dining match force-opens the "Dining options"
  `<details>` first if it was collapsed, since scrollIntoView can't reach
  into hidden content. Prev/next-day and jump-sheet navigation don't pass
  either and keep the old top-of-day behavior.
- The Day view's scroll position is preserved across navigating away (to
  Map or elsewhere) and back via the bottom nav, in-memory only, via
  `dayViewScrollY`/`lastRenderedView` in `app.js` -- captured generically
  inside `render()` itself (whenever the view *was* "day" and is changing
  to something else) rather than in each individual nav click handler,
  since there's more than one way to leave Day view (bottom nav, a leg's
  "Map view" button) and this way none of them can forget to capture it.
  Only restored when actually *returning* to Day from elsewhere -- a
  redundant click on the already-active Day tab, or jumping to a specific
  day/leg (prev/next, jump sheet, search, a map popup's "Go to Day"), both
  intentionally keep their existing behavior instead.
- Search is diacritic-insensitive both ways: typing "ostermalm" matches
  "Östermalm" and typing "östermalm" still works too, since the query and
  the search index both go through the same `normalizeForSearch()`.
  `DIACRITIC_MAP` in `app.js` is an explicit table of every diacritic
  actually present in the trip data (Swedish å/ä/ö, Norwegian ø/æ, plus
  loanwords like "Café"/"Nærøyfjord"), not a generic Unicode-normalize
  call -- re-check this table (e.g. `grep -P "[^\x00-\x7F]" data.js`) if
  new non-ASCII characters get added to the trip data later, since ø/æ
  don't decompose the way å/ä/ö/é do.
- Search also ignores spaces/punctuation, so "GamlaStan" matches "Gamla
  Stan" and "T-bana" matches "Tbana" -- each index entry carries a second
  `haystackCollapsed` field (`collapseForSearch()`, built on top of
  `normalizeForSearch()`) with everything but letters/digits stripped, and
  a query matches if it hits *either* the plain or the collapsed haystack.
  Deliberately doesn't do word-order-independent or typo-tolerant
  matching -- there's no relevance ranking yet (results are just filtered
  and capped at 40 in day order), so a looser match could surface more
  loosely-related results with no way to sort the better ones first.
  `collapseForSearch()` guards against an empty result (e.g. a query of
  just "-" collapses to "") since `"x".includes("")` is always true and
  would otherwise match every entry.
- Bottom nav has a "Tickets" view: a list of all 16 days (with a ticket
  count badge, `state.ticketsDayIndex = null`), and tapping one shows that
  day's tickets as one-per-row thumbnails (`state.ticketsDayIndex = <day
  index>`) — `"Description - H:MM AM/PM"`, or just `"Description"` when
  the filename has no time, sorted with no-time tickets first, then
  chronologically. See `assets/tickets/` above for the file-naming
  contract this all depends on.
- Tapping a ticket thumbnail opens the PDF/JPG *inline*, not via a real
  navigation (`state.ticketFile = <ticket>`, `renderTicketFileView()`) --
  a plain `<a href="...pdf">` was tried first but a same-tab navigation to
  a PDF doesn't reliably get bfcached, so hitting the phone's back button
  to return reset the whole app to its default state (Day view, styling
  broken) instead of restoring the ticket list. There's an explicit
  in-app "‹ Back" button instead of relying on the browser back button.
- The file viewer is a full-screen takeover handled directly in `render()`
  (no header, no bottom-nav, `document.body.style.overflow = "hidden"` --
  same pattern as the day-jump sheet's overlay), not a card embedded in
  the normal scrolling page. This isn't just visual: on mobile, a
  single-finger touch drag defaults to scrolling the *outer* page rather
  than a nested `<iframe>`'s own content when both are on screen and
  scrollable, which made the PDF feel clipped and unscrollable when it
  was rendered inside the normal `.tickets-view` card. Making the file the
  only scrollable thing on screen removes that ambiguity. PDFs render via
  `<embed type="application/pdf">`, not `<iframe>` -- in an installed/
  standalone PWA on iOS, WKWebView often gives an `<iframe>`-embedded PDF
  only a stripped-down single-page preview instead of the full multi-page
  viewer a real top-level navigation gets; `<embed>` fares better. The two
  `.jpg` tickets get a scrollable `.ticket-file-image-wrap` plus the
  page's own native pinch-zoom (the viewport meta tag doesn't restrict
  scaling) for both. A small "↗" link in the header (the one place in
  this view that *does* use `target="_blank"`) is kept as an escape hatch
  for saving/sharing a file, or as a fallback if a browser's embedded PDF
  rendering still isn't behaving -- multi-page PDFs reliably work when
  opened this way even where `<embed>` still falls short.
- `state.view` and `state.ticketsDayIndex` are persisted to localStorage
  (`loadLastView()`/`saveLastView()`, `loadTicketsDayIndex()`/
  `saveTicketsDayIndex()`, both saved from inside `render()` so every
  state change is covered without having to remember to call them at each
  call site), unlike the map/day-scroll persistence elsewhere in this app
  which is deliberately in-memory-only. This one needs to survive a full
  reload: in a standalone/home-screen PWA there's no browser chrome at
  all, so once a real navigation leaves the app's document (e.g. the "↗"
  link, or a browser/OS quirk sending the user somewhere they didn't
  expect), the *only* way back is an OS-level gesture with no in-app
  control over it -- if that reloads the app from scratch, it should land
  back on the same tab and day's ticket list, not reset to Day view with
  the bottom nav gone. `state.ticketFile` is deliberately NOT persisted --
  a fresh load should always land on the ticket *list*, never try to
  reopen a file automatically.
- Bottom nav's 5th and final section is "Wiki": an alphabetically-sorted
  (`localeCompare`) directory of all 51 `POI_DATA` entries with live search
  (`renderWikiView()`/`renderWikiDirectory()`/`renderWikiEntryView()` in
  `app.js`). Tapping an entry opens a detail view: eyebrow (category ·
  country), title, a "🗺️ View on map" button (via `goToMapPin()`, same
  mechanism leg/dining map links use), the `content` essay run through
  `mdLiteToHtml()`, a `fun_fact` callout box, and a sources line.
  `POI_LIST`/`POI_BY_ID` are defined near the *top* of `app.js` (immediately
  after `LODGING`), not down in the Wiki section itself, because
  `buildTripMapPoints()` needs them and runs early via
  `const TRIP_MAP_POINTS = buildTripMapPoints()` — as `const`s (unlike
  `function`s) they aren't hoisted, so they must be defined before that
  call site textually.
- Wiki search reuses the same `normalizeForSearch()`/`collapseForSearch()`
  diacritic/spacing-insensitive utilities as the main Search tab, but with
  a deliberately *wider* scope: it indexes name, category, summary,
  fun_fact, **and the full long-form `content` essay** (`POI_SEARCH_INDEX`
  in `app.js`), unlike Day/Dining search which only covers short
  metadata-length fields. This is intentional — a Wiki search for e.g.
  "viking" should surface entries that discuss Vikings in the essay body
  even if the word isn't in the entry's title or summary.
- Every POI also gets a pin on the trip-wide map, as a new "Point of
  Interest" category — always, regardless of `tier`/`category`, and with
  no dedup against existing lodging/activity/dining/hub pins even when a
  POI describes the same real-world place as one of them (POIs are an
  independently-sourced dataset, not a merge target; see `poiPoints` in
  `buildTripMapPoints()`). These pins are colored **yellow**
  (`categoryMapColor()`'s `poi: "#f3bf16"` entry in `app.js`) — a
  deliberate, explicitly-requested exception to the "`--amber` reserved
  for flags/warnings/focus rings only" rule below, scoped *only* to this
  map-pin color and never used in the Logistics list's leg-category
  system. POI pins are zoom-gated like other detail/hub pins (hidden until
  `TRIP_MAP_DETAIL_MIN_ZOOM`), and their popup shows the entry's name,
  category, and a "Learn more →" button that jumps into that Wiki entry's
  detail view (setting `state.view = "wiki"` and `state.wikiEntryId`).
- Wiki entries cross-reference each other: any other entry's name
  mentioned verbatim in an entry's long-form `content` essay becomes an
  in-place link to that entry (`linkifyPoiContent()`/`markPoiReferences()`
  in `app.js`), plus a "See also" list at the bottom of the page
  summarizing every entry referenced that way. One combined regex over
  all 51 names, longest-first so a compound name (e.g. "Bergen Railway
  (Bergensbanen)") wins over a shorter one that's also a substring match
  at the same spot (e.g. "Bergen"); case-sensitive since these are proper
  nouns. Every entry is eligible as a link target, including the broad
  country/city/region ones (Norway, Sweden, Bergen, Oslo, Stockholm,
  Voss, Karlstad, Mora, Dalarna, Värmland) — a deliberate choice (asked
  explicitly rather than assumed) even though it means e.g. most
  Bergen-area entries link back to the "Bergen" overview page. Only the
  *first* mention of each distinct other-entry name is turned into a link
  (later repeats of the same name stay plain text) so a page that says
  "Bergen" ten times doesn't turn ten of them blue, but "See also" still
  lists every distinct entry referenced. "See also" is *not* just the
  in-body links, though -- references are one-way in the source prose
  (an entry mentioning "Bergen" doesn't mean Bergen's own essay happens
  to mention it back), so `seeAlsoRefsFor()` unions an entry's outgoing
  references with its *incoming* ones (every other entry whose content
  references it — `POI_OUTGOING_REFS`/`POI_INCOMING_REFS`, the latter
  built by inverting the former, both precomputed once for the whole POI
  set at module load). This is why e.g. the "Bergen" entry's own "See
  also" lists Bergenhus Fortress, Fisketorget, Fløibanen, etc. even
  though Bergen's own essay never happens to name-check most of them —
  they reference *it*, and that's enough to surface the connection from
  either direction. Matching happens on the raw
  `content` text via a "@@POIREF:&lt;id&gt;@@" marker substitution *before*
  `mdLiteToHtml()`'s HTML-escaping/markdown pass, with the markers
  resolved into real `<a>` tags *after* -- not linkifying the final HTML
  directly -- so a POI name is never matched inside an HTML tag and never
  torn in half by a bold/italic/paragraph boundary landing mid-name. The
  inline links are built via `innerHTML` (not individual DOM node
  references), so clicks are handled through one delegated listener on
  `.wiki-entry-body` rather than per-link.
- Point-of-interest content is intentionally **Wiki- and Map-only** — it
  never appears in the Day view (Logistics list, Dining options, story/
  reminders). This was an explicit product decision, not an oversight: the
  POI dataset is independently sourced and not tied to specific logistics
  legs the way `dining[]`/`story[]` are.
- `state.wikiEntryId` (`null` = directory, else a POI id) persists across
  navigation via localStorage (`loadWikiEntryId()`/`saveWikiEntryId()`),
  same pattern as `state.ticketsDayIndex` — saved from inside `render()`
  so every state change is covered. The map's pan/zoom/open-popup state
  (`tripMapPersisted`) already covered POI pins for free once they were
  added to `buildTripMapPoints()`'s output, since that persistence is
  keyed generically by pin key, not by pin kind.

## Local development

No build tooling needed. From this folder:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`. (A plain `file://` open also mostly works,
but service-worker registration requires http(s), so use the server for
testing offline behavior.)

## Regenerating data.js after itinerary changes

If the underlying trip data changes, regenerate `data.js` from the master
JSON so `window.TRIP_DATA` stays in sync:

```js
// From a JSON file:
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('Rougeux_Scandinavia_Master.json', 'utf-8'));
fs.writeFileSync('data.js', 'window.TRIP_DATA = ' + JSON.stringify(data) + ';\n');
```

## Known open items in the data (as of last update)

- Day 11 morning: Vigeland Park vs. a low-key Tøyen/Grønland walk — undecided
- Day 14 Bergen: canoeing/Troll Forest/Aquarium vs. the simpler funicular+Bryggen
  plan — undecided
- Several dinners (Voss Aug 2, Bergen Aug 3/4/5) are open/tentative
- A couple of Voss taxi legs still need to be confirmed/booked

## Possible next steps

- Wire up a "current leg" auto-highlight based on device time/date during the
  actual trip window (Jul 22 – Aug 6, 2026)
- Export/print view for a specific day
- Sync checklist state across devices (currently per-device localStorage only)
- Trip map: marker clustering for cities with many close-together pins
  (Stockholm has ~15) so they don't overlap at street-level zoom
