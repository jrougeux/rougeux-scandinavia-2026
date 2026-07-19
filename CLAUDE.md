# Rougeux Family — Sweden & Norway 2026 Itinerary App

A static, offline-first PWA showing the full 16-day trip logistics itinerary
(Jul 22 – Aug 6, 2026: Stockholm → Mora → Karlstad → Oslo → Voss → Bergen).

No build step, no backend, no dependencies. Plain HTML/CSS/JS, deployable by
dragging the folder onto any static host (Netlify Drop, GitHub Pages, Cloudflare
Pages, Vercel, etc.).

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
- Add lat/long to individual legs (not just lodging) for finer-grained map pins
- Export/print view for a specific day
- Sync checklist state across devices (currently per-device localStorage only)
