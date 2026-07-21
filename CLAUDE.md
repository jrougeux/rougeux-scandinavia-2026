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
- `downloadUrls()`'s `settle()` only fires after calling `res.blob()` on
  the fetch response and letting *that* resolve, not right after the
  `fetch()` promise itself resolves. This matters because `fetch()`
  resolves as soon as response **headers** arrive, not once the full
  body has actually finished transferring -- checking `res.ok` and
  calling a request "done" at that point meant a multi-megabyte ticket
  PDF could be reported complete in a fraction of a second, long before
  it had actually finished downloading (the real giveaway that surfaced
  this: a progress bar finishing near-instantly for files that should
  take several seconds). The `.blob()` result itself is discarded here —
  the service worker's own `cache.put()`, operating on its own separate
  `.clone()` of the response, is what actually persists the file — this
  call exists purely to force waiting for the real, complete transfer
  before reporting success. A body that fails partway through (the
  connection drops after headers arrived but before the file finished)
  is correctly treated as a failure regardless of what the headers said.
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
  has not reliably produced a usable offline copy of a ticket **PDF** on
  iOS Safari in practice — while manually opening a PDF once while online
  (going through the real `<embed type="application/pdf">` viewer) does
  reliably make it work offline afterward, every time. Rather than
  continue guessing at the exact iOS-specific mechanism behind that gap,
  `downloadTicketFiles()` (used by both of those call sites instead of
  `downloadUrls()` directly) sidesteps it by driving the *same real path*
  the manual workaround uses, programmatically: `warmPdfFiles()` walks
  every ticket PDF one at a time (not concurrently — several simultaneous
  native PDF plugin instances is heavier and less predictable on mobile
  than `fetch()` concurrency) via `warmPdfViaEmbed()`, which creates a
  real `<embed type="application/pdf">`, positions it fully outside the
  viewport (`position: fixed; left: -9999px` — not `display: none`, which
  some browsers never actually load a resource for), appends it to the
  document, sets its `src`, and waits for `load`/`error`/a 20s fallback
  timeout before removing it and moving to the next. Ticket JPGs are
  unaffected by any of this — they keep going through the existing
  `downloadUrls()` `fetch()` path, which already reliably caches them.
  Success is judged afterward by real Cache Storage contents
  (`countCachedUrls()`), not the `<embed>`'s own `load` event firing —
  same "trust actual cache state, not a completion signal" principle as
  the rest of this feature, since a `load` event is not itself proof the
  full file ended up cached. `TICKET_PREFETCH_VERSION` was bumped to
  `"v2"` so everyone's existing "done" flag (set by the old,
  PDF-unreliable `fetch()`-only prefetch) doesn't suppress a real retry
  under this new mechanism.

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
