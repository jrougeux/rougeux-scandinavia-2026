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
  viewed online
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
  `ASSETS` list (that would bloat the initial install by several MB); they
  rely on the service worker's fetch handler opportunistically caching
  whatever's actually been fetched, so a ticket is only available offline
  after it's been viewed at least once with a connection.

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
  `--accent`-colored band, centered, white text — not plain text on the
  page background. Its own `padding-top` absorbs
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
- On first load (once the service worker actually controls the page --
  see `navigator.serviceWorker.ready` in the bootstrap at the bottom of
  `app.js`), `prefetchMapTiles()` proactively downloads map tiles for the
  region actually being visited, so offline map viewing works without
  requiring the user to have manually browsed every area first: each
  unique lodging city at the per-day map's default zoom (`MAP_DEFAULT_ZOOM`,
  sized to a generous viewport so it also covers the trip map's "fly into
  this city" view, not just the per-day map card), plus the whole trip's
  bounding box at its minimum zoom for the overview. ~310 tiles / a few MB
  total as of the current lodging list — deliberately bounded to actual
  default views, not "every zoom level of all of Scandinavia." Runs once
  (a `localStorage` flag under `MAP_PREFETCH_VERSION`, bump that constant
  to force a re-run e.g. after lodging locations change), skips entirely
  if `navigator.onLine === false`, and only marks itself done after every
  queued tile settles (success or failure) so an interrupted first run
  retries in full next time rather than silently staying incomplete.
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
