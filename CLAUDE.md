# Rougeux Family — Sweden & Norway 2026 Itinerary App

A static, offline-first PWA showing the full 16-day trip logistics itinerary
(Jul 22 – Aug 6, 2026: Stockholm → Mora → Karlstad → Oslo → Voss → Bergen).

No build step, no backend. Plain HTML/CSS/JS, deployable by dragging the folder
onto any static host (Netlify Drop, GitHub Pages, Cloudflare Pages, Vercel,
etc.). One runtime dependency: Leaflet.js, self-hosted under `assets/leaflet/`
(no CDN, no npm/build step) for the trip-wide map view — everything else is
still dependency-free vanilla JS.

## Files

- `index.html` — entry point, loads data.js then app.js
- `data.js` — the entire trip dataset as `window.TRIP_DATA`, generated from
  `Rougeux_Scandinavia_Master.json` (see "Regenerating data" below)
- `app.js` — all rendering/routing logic, vanilla JS, no framework
- `styles.css` — design system (CSS custom properties at the top of the file)
- `manifest.json` + `sw.js` — PWA manifest and service worker for offline/
  "Add to Home Screen" support. `sw.js` caches assets cache-first under
  `CACHE_NAME`. **Bump `CACHE_NAME` (e.g. v7 → v8) any time app.js/styles.css/
  data.js/index.html change** — otherwise the browser won't detect `sw.js`
  as changed, won't install a new service worker, and silently keeps
  serving the old cached files even after a normal reload (a hard
  refresh / cache clear is needed to recover without a version bump)
- `icons/` — app icons (192px, 512px)
- `assets/fonts/` — self-hosted DM Sans woff2 files (normal + italic, latin +
  latin-ext), loaded via `@font-face` in `styles.css` so the app works fully
  offline with no Google Fonts dependency
- `assets/leaflet/` — vendored Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`,
  `images/`), loaded in `index.html` before `app.js`. Powers only the
  trip-wide "Map" bottom-nav view; the per-day Map sections still use the
  hand-rolled canvas renderer and don't need it

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
  or a visit row in an "Also passes through here" list) jumps to that
  *specific* leg within the day view, not just the top of the day --
  `goToDay(dayIndex, legNum)` takes an optional second argument that
  scrolls the matching `.leg[data-leg-num]` into view and flashes it
  (`.leg-highlight` in `styles.css`). Prev/next-day and jump-sheet
  navigation don't pass a `legNum` and keep the old top-of-day behavior.

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
