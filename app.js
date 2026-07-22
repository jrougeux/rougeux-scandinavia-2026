(function () {
  const DATA = window.TRIP_DATA;
  const DAYS = DATA.days;
  const LODGING = DATA.lodging;

  // Wiki (points of interest) -- a companion dataset to TRIP_DATA, loaded
  // from poi_data.js as window.POI_DATA. Defined here (not down in the
  // "Wiki view" section below) because buildTripMapPoints() needs
  // POI_LIST for the map's "Point of Interest" pins, and that function
  // runs near the top of the file.
  const POI_LIST = (window.POI_DATA || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const POI_BY_ID = {};
  POI_LIST.forEach((p) => {
    POI_BY_ID[p.id] = p;
  });

  const state = {
    view: "day",       // "day" | "map" | "wiki" | "tickets" | "search" | "checklist"
    dayIndex: 0,
    checks: loadChecks(),
    ticketsDayIndex: null, // null = day list; a DAYS index = that day's ticket thumbnails
    ticketFile: null, // non-null = viewing this ticket's file inline; see renderTicketFileView()
    wikiEntryId: null // null = directory; a POI id = that entry's detail view
  };

  function loadChecks() {
    try {
      return JSON.parse(localStorage.getItem("rougeux_checks") || "{}");
    } catch (e) { return {}; }
  }
  function saveChecks() {
    try { localStorage.setItem("rougeux_checks", JSON.stringify(state.checks)); } catch (e) {}
  }
  function loadLastDay() {
    try {
      const saved = localStorage.getItem("rougeux_day_index");
      // Bounds-checked (not just "is it a number") so a stale/corrupted
      // value -- or one left over from a prior version of the trip data
      // with a different day count -- can't point state.dayIndex past
      // the end of DAYS, which would crash every DAYS[state.dayIndex]
      // access throughout the Day view.
      if (saved !== null && !isNaN(+saved) && +saved >= 0 && +saved < DAYS.length) return +saved;
    } catch (e) {}
    // default to today's matching day if within trip range
    const today = new Date();
    const idx = DAYS.findIndex((d) => sameDate(new Date(d.date + "T00:00:00"), today));
    return idx >= 0 ? idx : 0;
  }
  function sameDate(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function saveLastDay(i) {
    try { localStorage.setItem("rougeux_day_index", String(i)); } catch (e) {}
  }

  const VALID_VIEWS = ["day", "map", "wiki", "tickets", "search", "checklist"];
  function loadLastView() {
    try {
      const v = localStorage.getItem("rougeux_view");
      return VALID_VIEWS.includes(v) ? v : "day";
    } catch (e) { return "day"; }
  }
  function saveLastView(v) {
    try { localStorage.setItem("rougeux_view", v); } catch (e) {}
  }

  function loadTicketsDayIndex() {
    try {
      const v = localStorage.getItem("rougeux_tickets_day_index");
      if (v === null) return null;
      const n = Number(v);
      return Number.isInteger(n) && n >= 0 && n < DAYS.length ? n : null;
    } catch (e) { return null; }
  }
  function saveTicketsDayIndex(i) {
    try {
      if (i == null) localStorage.removeItem("rougeux_tickets_day_index");
      else localStorage.setItem("rougeux_tickets_day_index", String(i));
    } catch (e) {}
  }

  function loadWikiEntryId() {
    try {
      const v = localStorage.getItem("rougeux_wiki_entry_id");
      return v && POI_BY_ID[v] ? v : null;
    } catch (e) { return null; }
  }
  function saveWikiEntryId(id) {
    try {
      if (id == null) localStorage.removeItem("rougeux_wiki_entry_id");
      else localStorage.setItem("rougeux_wiki_entry_id", id);
    } catch (e) {}
  }

  state.dayIndex = loadLastDay();
  // Persisted (not just in-memory) so that if the platform ever fully
  // reloads the app -- e.g. returning via an OS-level back/swipe gesture
  // from a real navigation, rather than the in-app "Back" button -- it
  // lands back on the same tab and the same day's ticket list instead of
  // resetting to the Day view with the bottom nav and everything else
  // gone. state.ticketFile is deliberately NOT persisted: a fresh load
  // should always land on the ticket *list*, never try to reopen a file.
  state.view = loadLastView();
  state.ticketsDayIndex = loadTicketsDayIndex();
  state.wikiEntryId = loadWikiEntryId();

  const root = document.getElementById("app");

  function countryFlag(dayNumber) {
    // Days 1-8 Sweden (incl. Karlstad), Day 9 crossing, 9-16 Norway
    return dayNumber <= 8 ? "🇸🇪" : "🇳🇴";
  }

  function fmtDateLabel(day) {
    const d = new Date(day.date + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // "July 22, 2026" -- full month name + year, for the header banner's
  // trip date range (DATA.meta.start_date/end_date are plain ISO
  // strings like "2026-07-22").
  function fmtFullDate(isoDate) {
    const d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
  }

  // "Wed, Jul 29" -- used in trip-map popups instead of a bare "Day N",
  // since a day number means nothing without opening the day-jump sheet
  // to translate it, whereas a weekday+date is meaningful on its own.
  function mapPopupDayLabel(dayIndex) {
    const day = DAYS[dayIndex];
    return `${day.weekday.slice(0, 3)}, ${fmtDateLabel(day)}`;
  }

  // ---------------- Day nav (arrows + jump sheet, all screen sizes) ----------------
  function cityLabelFor(day) {
    const lodging = findLodgingFor(day);
    return lodging ? lodging.location : "Travel Day";
  }

  function scrollToAndHighlight(el) {
    // If this element lives inside a collapsed <details> (e.g. "Dining
    // options"), open it first -- scrollIntoView can't reach into hidden
    // content, and there'd be nothing visible to highlight anyway.
    const details = el.closest("details.collapsible");
    if (details && !details.open) details.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("leg-highlight");
    setTimeout(() => el.classList.remove("leg-highlight"), 2200);
  }

  function goToDay(i, legNum, diningIndex) {
    // When landing at the top (no specific leg/dining target), scroll
    // *before* rebuilding the DOM -- the old content is still on screen
    // and full-size at that point, so the jump is safe. When there IS a
    // target, we need the new Day view's real DOM to exist first in
    // order to find and scroll to that specific element, so render()
    // has to come first there instead.
    if (legNum == null && diningIndex == null) window.scrollTo(0, 0);
    state.dayIndex = i;
    state.view = "day";
    saveLastDay(i);
    render();
    if (legNum != null) {
      const el = document.querySelector('.leg[data-leg-num="' + legNum + '"]');
      if (el) {
        scrollToAndHighlight(el);
        return;
      }
    }
    if (diningIndex != null) {
      const el = document.querySelector('.dining-item[data-dining-index="' + diningIndex + '"]');
      if (el) {
        scrollToAndHighlight(el);
        return;
      }
    }
    window.scrollTo(0, 0);
  }

  function renderDayNav() {
    const day = DAYS[state.dayIndex];
    const outer = document.createElement("div");
    outer.className = "day-nav-outer";

    const row = document.createElement("div");
    row.className = "day-nav";

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "day-nav-arrow";
    prev.setAttribute("aria-label", "Previous day");
    prev.textContent = "‹";
    prev.disabled = state.dayIndex === 0;
    prev.addEventListener("click", () => goToDay(state.dayIndex - 1));

    const label = document.createElement("button");
    label.type = "button";
    label.className = "day-nav-label";
    label.innerHTML = `
      <span class="dnl-eyebrow">Day ${day.day_number} of ${DAYS.length}</span>
      <span class="dnl-current"><span class="dnl-flag" aria-hidden="true">${countryFlag(day.day_number)}</span> ${day.weekday}, ${fmtDateLabel(day)} — ${cityLabelFor(day)}</span>
    `;
    label.setAttribute("aria-label", "Choose a day to jump to");
    label.addEventListener("click", openDaySheet);

    const next = document.createElement("button");
    next.type = "button";
    next.className = "day-nav-arrow";
    next.setAttribute("aria-label", "Next day");
    next.textContent = "›";
    next.disabled = state.dayIndex === DAYS.length - 1;
    next.addEventListener("click", () => goToDay(state.dayIndex + 1));

    row.appendChild(prev);
    row.appendChild(label);
    row.appendChild(next);

    const progress = document.createElement("div");
    progress.className = "day-progress";
    const fill = document.createElement("div");
    fill.className = "day-progress-fill";
    fill.style.width = ((state.dayIndex + 1) / DAYS.length) * 100 + "%";
    progress.appendChild(fill);

    outer.appendChild(row);
    outer.appendChild(progress);
    return outer;
  }

  function closeDaySheet() {
    const overlay = document.querySelector(".day-sheet-overlay");
    if (overlay) overlay.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onDaySheetKeydown);
  }

  function onDaySheetKeydown(e) {
    if (e.key === "Escape") closeDaySheet();
  }

  function openDaySheet() {
    if (document.querySelector(".day-sheet-overlay")) return;

    const overlay = document.createElement("div");
    overlay.className = "day-sheet-overlay";

    const sheet = document.createElement("div");
    sheet.className = "day-sheet";

    const header = document.createElement("div");
    header.className = "day-sheet-header";
    header.innerHTML = `<span>Jump to day</span>`;
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "day-sheet-close";
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.textContent = "✕";
    closeBtn.addEventListener("click", closeDaySheet);
    header.appendChild(closeBtn);

    const list = document.createElement("div");
    list.className = "day-sheet-list";

    let lastLabel = null;
    DAYS.forEach((day, i) => {
      const cityLabel = cityLabelFor(day);
      if (cityLabel !== lastLabel) {
        const groupLabel = document.createElement("div");
        groupLabel.className = "day-sheet-group";
        groupLabel.textContent = cityLabel;
        list.appendChild(groupLabel);
        lastLabel = cityLabel;
      }

      const rowBtn = document.createElement("button");
      rowBtn.type = "button";
      rowBtn.className = "day-sheet-row" + (i === state.dayIndex ? " active" : "");
      const title = day.title.split("—").slice(1).join("—").trim() || day.title;
      rowBtn.innerHTML = `
        <span class="dsr-flag" aria-hidden="true">${countryFlag(day.day_number)}</span>
        <span class="dsr-num">${day.day_number}</span>
        <span class="dsr-body">
          <span class="dsr-date">${day.weekday}, ${fmtDateLabel(day)}</span>
          <span class="dsr-title">${title}</span>
        </span>
      `;
      rowBtn.addEventListener("click", () => {
        closeDaySheet();
        goToDay(i);
      });
      list.appendChild(rowBtn);
    });

    sheet.appendChild(header);
    sheet.appendChild(list);
    overlay.appendChild(sheet);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeDaySheet();
    });
    document.addEventListener("keydown", onDaySheetKeydown);

    document.body.appendChild(overlay);
    document.body.style.overflow = "hidden";

    const active = list.querySelector(".day-sheet-row.active");
    if (active) active.scrollIntoView({ block: "center" });
  }

  // ---------------- Day view ----------------
  function findLodgingFor(day) {
    // find lodging entry active on this date
    const d = day.date;
    return LODGING.find((l) => d >= l.check_in && d < l.check_out) ||
           LODGING.find((l) => d === l.check_out); // last day, still associated
  }

  // ---------------- Map (static tile rendering) ----------------
  const MAP_TILE_SIZE = 256;
  const MAP_MIN_ZOOM = 6;
  // Matches the trip-wide Leaflet map's own maxZoom (see
  // renderTripMapView()) and MAP_PREFETCH_CITY_VIEWPORT_ZOOMS/
  // MAP_PREFETCH_SECONDARY_ZOOMS' own ceiling -- kept in sync so the
  // per-day canvas map's own +/- buttons never let a user zoom in past
  // what's actually been prefetched for offline use.
  const MAP_MAX_ZOOM = 18;
  const MAP_DEFAULT_ZOOM = 14;
  const MAP_CANVAS_W = 640;
  const MAP_CANVAS_H = 320;

  // Tiles come from Stadia Maps, not tile.openstreetmap.org directly --
  // see CLAUDE.md's "Offline map tile downloads" notes for the full
  // history (repeated live bulk-download attempts against OSM's own
  // volunteer-run tile server were rate-limited/blocked outright, and a
  // subsequent attempt to vendor tiles as static files turned out to
  // have silently downloaded OSM's "Access Blocked" warning image
  // instead of real tiles for the entire run). Stadia Maps' terms
  // explicitly permit exactly this app's use case -- personal, non-
  // commercial use, with offline caching of up to 100MB per device
  // allowed as a general term, not restricted to paid plans -- and,
  // unlike a raw tile.openstreetmap.org request, responds with CORS
  // headers (`Access-Control-Allow-Origin: *`), so fetch() doesn't need
  // "no-cors" mode at all here: status/headers/Content-Length are all
  // normally readable, the same as a same-origin request, avoiding the
  // whole opaque-response-blindness problem that made a blocked/bad tile
  // response impossible to distinguish from a real one over at OSM.
  // STADIA_API_KEY is a free-tier key, meant to be used exactly this way
  // (embedded in client-side code) per Stadia's own docs -- it's not a
  // secret credential, just a rate-limited/quota-tracked identifier, the
  // same pattern as e.g. a client-side Google Maps API key.
  const STADIA_API_KEY = "dd92ab68-4a64-443f-8f18-995a3b55cbc6";
  // "osm_bright", not the initially-chosen "alidade_smooth" -- the latter
  // is a deliberately minimalist style with no POI icons/labels at all
  // (no restaurants, shops, cafes, landmarks), and, being lighter-weight,
  // produces much smaller average tile sizes -- both of which matched
  // what was actually reported after using it (no business-level detail,
  // and a suspiciously small total download size). "osm_bright" is
  // Stadia's classic-OSM-like, detail-rich style, explicitly documented
  // by them as the right choice "where your users need lots of POIs."
  const STADIA_TILE_STYLE = "osm_bright";
  function stadiaTileUrl(z, x, y) {
    return `https://tiles.stadiamaps.com/tiles/${STADIA_TILE_STYLE}/${z}/${x}/${y}.png?api_key=${STADIA_API_KEY}`;
  }

  function lonLatToTilePixel(lat, lon, zoom) {
    const n = Math.pow(2, zoom);
    const latRad = (lat * Math.PI) / 180;
    const x = ((lon + 180) / 360) * n * MAP_TILE_SIZE;
    const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * MAP_TILE_SIZE;
    return { x, y };
  }

  function drawMapPin(ctx, cx, cy) {
    ctx.save();
    // shadow
    ctx.beginPath();
    ctx.ellipse(cx, cy + 7, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(38,36,32,0.28)";
    ctx.fill();
    // stick
    ctx.strokeStyle = "#35576b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 2);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();
    // outer ring
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    // inner dot
    ctx.beginPath();
    ctx.arc(cx, cy - 10, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#35576b";
    ctx.fill();
    ctx.restore();
  }

  function drawStaticMap(canvas, lat, lon, zoom, token, getToken) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const n = Math.pow(2, zoom);

    ctx.fillStyle = "#efece2";
    ctx.fillRect(0, 0, W, H);

    const centerPx = lonLatToTilePixel(lat, lon, zoom);
    const originX = centerPx.x - W / 2;
    const originY = centerPx.y - H / 2;

    const txStart = Math.floor(originX / MAP_TILE_SIZE);
    const txEnd = Math.floor((originX + W) / MAP_TILE_SIZE);
    const tyStart = Math.floor(originY / MAP_TILE_SIZE);
    const tyEnd = Math.floor((originY + H) / MAP_TILE_SIZE);

    const tileSpecs = [];
    for (let tx = txStart; tx <= txEnd; tx++) {
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wrappedX = ((tx % n) + n) % n;
        tileSpecs.push({ url: stadiaTileUrl(zoom, wrappedX, ty), tx, ty });
      }
    }

    // Downloaded tiles (see downloadToIdb()) live in IndexedDB -- checked
    // here in one batched idbKeyval.getMany() call (far cheaper than one
    // idbKeyval.get() per tile) before falling back to a plain network
    // <img> load for whichever tiles aren't there. This is what makes a
    // prefetched offline map actually show downloaded tiles rather than
    // depending solely on the service worker's own opportunistic Cache
    // Storage caching, which only ever covers tiles a user has already
    // panned past.
    const urls = tileSpecs.map((t) => t.url);
    const blobsPromise = (window.idbKeyval && urls.length)
      ? idbKeyval.getMany(urls).catch(() => urls.map(() => undefined))
      : Promise.resolve(urls.map(() => undefined));

    blobsPromise.then((blobs) => {
      const objectUrls = [];
      const loads = tileSpecs.map((t, i) => {
        const blob = blobs[i];
        let src = t.url;
        if (blob) {
          src = URL.createObjectURL(blob);
          objectUrls.push(src);
        }
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ img, tx: t.tx, ty: t.ty });
          img.onerror = () => resolve(null);
          img.src = src;
        });
      });

      Promise.all(loads).then((tiles) => {
        // Safe to release right away -- the <img> elements have already
        // either loaded (decoded into memory) or failed by this point,
        // and drawImage() below doesn't need the blob: URL to still
        // resolve.
        objectUrls.forEach((u) => URL.revokeObjectURL(u));
        if (getToken() !== token) return; // a newer render superseded this one
        tiles.forEach((t) => {
          if (!t) return;
          const dx = t.tx * MAP_TILE_SIZE - originX;
          const dy = t.ty * MAP_TILE_SIZE - originY;
          ctx.drawImage(t.img, dx, dy, MAP_TILE_SIZE, MAP_TILE_SIZE);
        });
        drawMapPin(ctx, W / 2, H / 2);
      });
    });
  }

  function googleMapsUrl(lat, lon, label) {
    const q = label ? `${lat},${lon} (${label})` : `${lat},${lon}`;
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q);
  }

  function renderMapSection(day) {
    const lodging = findLodgingFor(day);
    if (!lodging || typeof lodging.lat !== "number" || typeof lodging.lon !== "number") return null;

    const { lat, lon, location, name } = lodging;
    let zoom = MAP_DEFAULT_ZOOM;
    let renderToken = 0;

    const wrap = document.createElement("div");
    wrap.className = "map-card";

    const canvasWrap = document.createElement("div");
    canvasWrap.className = "map-canvas-wrap";

    const canvas = document.createElement("canvas");
    canvas.className = "map-canvas";
    canvas.width = MAP_CANVAS_W;
    canvas.height = MAP_CANVAS_H;
    canvasWrap.appendChild(canvas);

    const zoomControls = document.createElement("div");
    zoomControls.className = "map-zoom-controls";
    const zoomIn = document.createElement("button");
    zoomIn.type = "button";
    zoomIn.className = "map-zoom-btn";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "Zoom in");
    const zoomOut = document.createElement("button");
    zoomOut.type = "button";
    zoomOut.className = "map-zoom-btn";
    zoomOut.textContent = "–";
    zoomOut.setAttribute("aria-label", "Zoom out");
    zoomControls.appendChild(zoomIn);
    zoomControls.appendChild(zoomOut);
    canvasWrap.appendChild(zoomControls);

    function redraw() {
      renderToken++;
      zoomIn.disabled = zoom >= MAP_MAX_ZOOM;
      zoomOut.disabled = zoom <= MAP_MIN_ZOOM;
      drawStaticMap(canvas, lat, lon, zoom, renderToken, () => renderToken);
    }

    zoomIn.addEventListener("click", () => {
      if (zoom >= MAP_MAX_ZOOM) return;
      zoom++;
      redraw();
    });
    zoomOut.addEventListener("click", () => {
      if (zoom <= MAP_MIN_ZOOM) return;
      zoom--;
      redraw();
    });

    // ---- Pinch to zoom (touch) ----
    let pinchStartDist = null;
    let pinchStartZoom = zoom;
    let pinchScale = 1;

    function touchDist(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    canvasWrap.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        pinchStartDist = touchDist(e.touches);
        pinchStartZoom = zoom;
      }
    }, { passive: true });

    canvasWrap.addEventListener("touchmove", (e) => {
      if (e.touches.length === 2 && pinchStartDist) {
        e.preventDefault();
        pinchScale = touchDist(e.touches) / pinchStartDist;
        let clamped = Math.min(Math.max(pinchScale, 0.4), 3);
        // Clamp the *visual* preview to whatever range still maps to a
        // real, in-range zoom level -- 2^(MAP_MAX_ZOOM - pinchStartZoom)
        // is exactly the scale at which endPinch() below would land on
        // MAP_MAX_ZOOM itself (scale = 2^deltaZoom, so deltaZoom =
        // MAP_MAX_ZOOM - pinchStartZoom exactly reaches the limit).
        // Checking only pinchStartZoom (an earlier, insufficient version
        // of this fix) caught a gesture that *starts* already at the
        // limit, but not one that pinches *past* it in a single
        // continuous motion (e.g. zoom 15 through to past 17) -- that
        // still showed the canvas visually scaling beyond what's
        // actually achievable, then snapping back once the gesture
        // ended. This freezes the preview exactly at the boundary
        // instead, in both directions, regardless of where the gesture
        // started.
        const maxScale = Math.pow(2, MAP_MAX_ZOOM - pinchStartZoom);
        const minScale = Math.pow(2, MAP_MIN_ZOOM - pinchStartZoom);
        clamped = Math.min(Math.max(clamped, minScale), maxScale);
        canvas.style.transform = `scale(${clamped})`;
      }
    }, { passive: false });

    function endPinch() {
      if (pinchStartDist === null) return;
      pinchStartDist = null;
      canvas.style.transform = "";
      const deltaZoom = Math.round(Math.log2(pinchScale));
      const newZoom = Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, pinchStartZoom + deltaZoom));
      pinchScale = 1;
      if (newZoom !== zoom) {
        zoom = newZoom;
        redraw();
      }
    }

    canvasWrap.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) endPinch();
    }, { passive: true });
    canvasWrap.addEventListener("touchcancel", endPinch, { passive: true });

    const attribution = document.createElement("div");
    attribution.className = "map-attribution";
    attribution.innerHTML = `Map tiles © <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>, © <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`;

    const footer = document.createElement("div");
    footer.className = "map-footer";
    const mapsLink = document.createElement("a");
    mapsLink.className = "map-gmaps-link";
    mapsLink.href = googleMapsUrl(lat, lon, name || location);
    mapsLink.target = "_blank";
    mapsLink.rel = "noopener";
    mapsLink.innerHTML = `📍 Open ${location} in Google Maps`;
    footer.appendChild(mapsLink);

    wrap.appendChild(canvasWrap);
    wrap.appendChild(attribution);
    wrap.appendChild(footer);

    let activated = false;
    function activate() {
      if (activated) return;
      activated = true;
      redraw();
    }

    return { el: wrap, activate };
  }

  function renderModeIcon(mode) {
    const icons = {
      Walk: "🚶", Train: "🚆", Taxi: "🚕", Flight: "✈️", Bus: "🚌", Ferry: "⛴️",
      Funicular: "🚡", Drive: "🚗", Transit: "🚋", "Flight (cont'd)": "✈️",
      "Walk/Taxi": "🚕", "Bus/Ferry": "🚌", "Taxi/Metro": "🚕"
    };
    return icons[mode] || "";
  }

  // ---------------- Leg category color-coding ----------------
  const TRANSPORT_MODES = new Set([
    "Train", "Taxi", "Flight", "Bus", "Ferry", "Funicular", "Drive", "Transit",
    "Flight (cont'd)", "Walk/Taxi", "Bus/Ferry", "Taxi/Metro"
  ]);
  const LODGING_NAMES = LODGING.map((l) => l.name.toLowerCase());
  const CATEGORY_META = {
    lodging: { emoji: "🛏️", label: "Lodging" },
    transport: { emoji: "🚗", label: "Transport" },
    walking: { emoji: "🚶", label: "Walk" },
    dining: { emoji: "🍽️", label: "Dining" },
    activity: { emoji: "🧭", label: "Activity" },
    note: { emoji: "📌", label: "Note" }
  };


  // ---------------- Per-leg "view on map" links ----------------
  // Individual logistics legs (not just the day-level lodging) can open a
  // precise Google Maps location. We never send the activity/description
  // text itself (e.g. "Changing of the Guard") -- only the resolved place.
  function findNamedLodging(text) {
    if (!text) return null;
    const lower = text.toLowerCase();
    // Strip any unit/apartment suffix (e.g. "Sydneskleiven 4 #201" -> "Sydneskleiven 4")
    // since leg text refers to the building, not the specific unit.
    return LODGING.find((l) => lower.includes(l.name.split("#")[0].trim().toLowerCase())) || null;
  }

  function lodgingCoordQuery(lodging) {
    return lodging.lat + "," + lodging.lon;
  }

  // A day's default lodging (findLodgingFor) is ambiguous on transition
  // days where checkout and check-in share a date -- override by leg so
  // e.g. "Checkout -- Kristinebergs B&B" still points at Mora, not the
  // next city's lodging.
  const LODGING_LEG_OVERRIDE = {
  "68": "Mora (Dalarna)",
  "115": "Oslo"
};

  function lodgingForLeg(leg, day) {
    const overrideLocation = LODGING_LEG_OVERRIDE[leg.num];
    if (overrideLocation) return LODGING.find((l) => l.location === overrideLocation);
    return findLodgingFor(day);
  }

  // Search-query text for "activity" legs that resolve to one mappable
  // place. Deliberately omits vague legs with no real venue to search for
  // (e.g. "Free time", "Rest / free time", "Call Voss Taxi to book ride
  // home") -- those get no map link at all rather than a misleading one.
  const MAP_SEARCH_QUERY = {
  "2": "Denver International Airport",
  "6": "Frankfurt Airport (FRA), Germany",
  "8": "Stockholm Arlanda Airport (ARN), Sweden",
  "18": "Storkyrkan Cathedral, Stockholm, Sweden",
  "20": "Royal Palace, Stockholm, Sweden",
  "29": "Vasa Museum, Stockholm, Sweden",
  "37": "Nybrokajen, Stockholm, Sweden",
  "39": "Sandhamn, Sweden",
  "54": "Kråkbergsbadet, Mora, Sweden",
  "59": "Edåkersvägen 17, Nusnäs, Sweden",
  "60": "Grannas A. Olsson Hemslöjd, Nusnäs, Sweden",
  "85": "Oslo Botanical Garden, Norway",
  "86": "Natural History Museum, Oslo, Norway",
  "93": "Stortinget, Oslo, Norway",
  "95": "Oslo Cathedral, Karl Johans gate 11, Oslo, Norway",
  "97": "Rådhusplassen 1, Oslo, Norway",
  "101": "Akershus Fortress, Oslo, Norway",
  "103": "Slottsplassen 1, Oslo, Norway",
  "106": "Kirsten Flagstads plass 1, Oslo, Norway",
  "113": "Vigeland Park, Oslo, Norway",
  "125": "Flåm, Norway",
  "127": "Njardarheimr Viking Village, Gudvangen, Norway",
  "148": "Fløyen, Bergen, Norway",
  "152": "Fisketorget, Bergen, Norway",
  "158": "Steinsdalsfossen, Norheimsund, Norway",
  "164": "Frankfurt Airport (FRA), Germany"
};

  // Search-query text for "dining" legs (e.g. plain "Dinner"/"Lunch" in the
  // Logistics list). Reuses the exact same address text as the matching
  // day.dining[] entry so the Logistics link and the Dining options link
  // for the same venue point at the same place. Legs with no chosen venue
  // yet (address is still TBD/null in dining[], or the leg is a vague
  // "free time" placeholder) intentionally get no link.
  // Pure address text (matches dining[].address exactly -- diningPinByAddress
  // below keys off this, so don't prepend the venue name here; that's added
  // at the point the Google Maps search URL is actually built, in
  // mapLinkForLeg(), via MAP_DINING_LABEL).
  const MAP_DINING = {
  "12": "Österlånggatan 51, 111 31 Stockholm",
  "16": "Stortorget 18, 111 29 Stockholm",
  "22": "Meets at Beirut Café / Östermalms Saluhall entrance, Nybrogatan 29/31, 114 39 Stockholm",
  "23": "Meets at Beirut Café / Östermalms Saluhall entrance, Nybrogatan 29/31, 114 39 Stockholm",
  "25": "Västerlånggatan 68B, 111 29 Stockholm",
  "31": "Skansen, Stockholm, Sweden",
  "33": "Restaurang Agaton, Stockholm, Sweden",
  "42": "The Hairy Pig, Stockholm, Sweden",
  "51": "Kyrkogatan 10, 792 30 Mora",
  "56": "Moragatan 9, 792 30 Mora",
  "65": "Vasagatan 32, 792 32 Mora",
  "75": "Östanvindsgatan 1, 652 21 Karlstad",
  "83": "Grønland 28, 0188 Oslo",
  "89": "Torggata 16, 0181 Oslo",
  "99": "Stranden 3, 0250 Oslo",
  "108": "Grünerløkka, Oslo, Norway",
  "109": "Thorvald Meyers gate 49, 0555 Oslo",
  "131": "Hestavangen 3, 5700 Voss",
  "138": "Strandgaten 3, 5013 Bergen",
  "150": "Fisketorget, Bergen, Norway",
  "155": "Bryggen 11, 5003 Bergen"
};

  // Geocoded coordinates for dining[] entries that have a real address but
  // aren't the "leading" pick tied to an actual Logistics leg (secondary/
  // alternative candidates, e.g. "Restaurant Tradition" as an alternative
  // to "Den Gyldene Freden"). Without this they'd have a "View on Google
  // Maps" link (driven purely by d.address) but no map pin and no "Map
  // view" link, since those normally come from the leg they're tied to --
  // and these have no leg at all.
  const MAP_DINING_EXTRA_COORDS = {
    "Österlånggatan 7, 111 31 Stockholm": [59.32566, 18.073952],
    "Österlånggatan 1, 111 31 Stockholm": [59.325917, 18.073727],
    "Stortorget 3, 111 29 Stockholm": [59.325006, 18.071325],
    "Nytorgsgatan 30, 116 40 Stockholm (Södermalm)": [59.314693, 18.081451],
    "Kindstugatan 1, 111 31 Stockholm (Brända Tomten square)": [59.324766, 18.07268],
    "Järnvägsgatan 8, 652 25 Karlstad": [59.379515, 13.499621],
    "Vangsgata 52, 5700 Voss": [60.629331, 6.423424]
  };

  // Dining legs whose venue is actually booked/scheduled (a paid tour, an
  // explicit "confirmed" note, or dining[].status === "scheduled") rather
  // than a candidate still under consideration ("suggested"/"tentative"/
  // "along-the-route"). Drives red vs. pink on the trip map only -- see
  // categoryMapColor()'s "dining-suggested" entry.
  const MAP_DINING_CONFIRMED = new Set([22, 23, 83, 89, 109]);

  // Display name for dining map pins -- leg.activity is often a generic
  // meal label ("Dinner", "Lunch", "Fika stop"), not the actual venue.
  // Legs not listed here already have a specific-enough activity label
  // (e.g. leg 31 "Skansen") and use it as-is.
  const MAP_DINING_LABEL = {
    12: "Den Gyldene Freden",
    16: "Café Chokladkoppen",
    22: "The Nordic Food Walk",
    23: "The Nordic Food Walk",
    25: "Aifur",
    33: "Restaurang Agaton",
    42: "The Hairy Pig",
    51: "Käk & Plock",
    56: "Korsnäsgården",
    65: "Restaurang Vasagatan 32",
    75: "Julins Backyard Barbecue",
    83: "Kafe Asylet",
    89: "Oslo Street Food",
    99: "Pastis Bistrobar",
    109: "Godt Brød",
    131: "Vangen Café",
    138: "Søstrene Hagelin",
    150: "Lunch near Fisketorget",
    155: "Bryggeloftet & Stuene"
  };

  // Legs where MAP_DINING_LABEL shouldn't be prepended to the Google Maps
  // query: 33/42 because the address text already names the venue (would
  // duplicate it); 22/23 because the "label" is the tour name, not the
  // physical venue's name (the meeting point is Östermalms Saluhall, a
  // Viator tour has no Maps listing of its own); 150 because the label is
  // a "near X" description, not a venue Google can look up.
  const MAP_DINING_QUERY_SKIP_LABEL = new Set([22, 23, 33, 42, 150]);

  // Real lat/lon for the trip-wide map view (Task: bottom-nav "Map" tab).
  // Geocoded from the exact same query text as MAP_SEARCH_QUERY / MAP_DINING
  // above, so a pin's position always matches where its "view on map" link
  // points. Keyed by leg.num, same as those tables.
  const MAP_POINT_COORDS_ACTIVITY = {
  "2": [39.860668, -104.685367],
  "6": [50.024413, 8.5552],
  "8": [59.646792, 17.937044],
  "18": [59.325774, 18.070374],
  "20": [59.326865, 18.070322],
  "29": [59.328059, 18.091366],
  "37": [59.33085, 18.077472],
  "39": [59.287847, 18.917834],
  "54": [61.03692, 14.528749],
  "59": [60.962355, 14.651077],
  "60": [60.962502, 14.64618],
  "85": [59.918728, 10.770504],
  "86": [59.919783, 10.771714],
  "93": [59.913459, 10.743206],
  "95": [59.912512, 10.747012],
  "97": [59.911216, 10.732949],
  "101": [59.907598, 10.737209],
  "103": [59.917063, 10.727725],
  "106": [59.908017, 10.751415],
  "113": [59.924678, 10.707739],
  "125": [60.862952, 7.113178],
  "127": [60.879109, 6.83963],
  "148": [60.394782, 5.342646],
  "152": [60.394698, 5.324164],
  "158": [60.370786, 6.10288],
  "164": [50.024413, 8.5552]
};

  const MAP_POINT_COORDS_DINING = {
  "12": [59.323127, 18.07374],
  "16": [59.324958, 18.070342],
  "22": [59.335909, 18.07769],
  "23": [59.335909, 18.07769],
  "25": [59.323078, 18.071967],
  "31": [59.326623, 18.105282],
  "33": [59.322947, 18.072253],
  "42": [59.323784, 18.068824],
  "51": [61.005818, 14.539194],
  "56": [61.004892, 14.540932],
  "65": [61.007435, 14.544742],
  "75": [59.37986, 13.557358],
  "83": [59.912875, 10.762432],
  "89": [59.915849, 10.750834],
  "99": [59.910171, 10.727808],
  "108": [59.925471, 10.777421],
  "109": [59.92401, 10.758884],
  "131": [60.628664, 6.421177],
  "138": [60.393879, 5.324153],
  "150": [60.394698, 5.324164],
  "155": [60.396467, 5.324751]
};

  // Named hubs (stations, airports, ferry/bus stops) referenced by
  // "transport" legs (train/bus/ferry/funicular/taxi/flight/drive). Many
  // reuse coordinates already geocoded above for a lodging/activity/dining
  // leg at the same real-world place; the rest are freshly geocoded here.
  const HUB_COORDS = {
  "Denver Airport": [
    39.860668,
    -104.685367
  ],
  "Frankfurt Airport": [
    50.024413,
    8.5552
  ],
  "Stockholm Arlanda Airport": [
    59.646792,
    17.937044
  ],
  "Munkbron 15 (Stockholm)": [
    59.3242496,
    18.0670955
  ],
  "Royal Palace (Stockholm)": [
    59.326865,
    18.070322
  ],
  "Östermalms Saluhall": [
    59.335909,
    18.07769
  ],
  "Gamla Stan": [
    59.324778,
    18.072667
  ],
  "Östermalm": [
    59.338275,
    18.071893
  ],
  "Vasa Museum": [
    59.328059,
    18.091366
  ],
  "Skansen": [
    59.326623,
    18.105282
  ],
  "Sandhamn": [
    59.287847,
    18.917834
  ],
  "Nybrokajen": [
    59.33085,
    18.077472
  ],
  "Stockholm Central Station": [
    59.33015,
    18.05821
  ],
  "Mora Station": [
    61.00886,
    14.558929
  ],
  "Kristinebergs B&B (Mora)": [
    61.0100949,
    14.5575303
  ],
  "Kråkbergsbadet": [
    61.03692,
    14.528749
  ],
  "Korsnäsgården": [
    61.004892,
    14.540932
  ],
  "Nusnäs": [
    60.962502,
    14.64618
  ],
  "Karlstad Central Station": [
    59.378003,
    13.499076
  ],
  "Scandic Karlstad City": [
    59.3793258,
    13.5056192
  ],
  "Julins Backyard Barbecue": [
    59.37986,
    13.557358
  ],
  "Oslo S": [
    59.910928,
    10.752844
  ],
  "Tøyengata 26A (Oslo)": [
    59.913928,
    10.766941
  ],
  "Vigeland Park": [
    59.924678,
    10.707739
  ],
  "Voss Station": [
    60.629105,
    6.410115
  ],
  "Tråstølsvegen 344 (Voss)": [
    60.659118,
    6.407986
  ],
  "Myrdal": [
    60.735171,
    7.122829
  ],
  "Flåm": [
    60.862952,
    7.113178
  ],
  "Gudvangen": [
    60.879109,
    6.83963
  ],
  "Bergen Station": [
    60.390279,
    5.333397
  ],
  "Fløibanen Base Station": [
    60.39641,
    5.328564
  ],
  "Fløyen": [
    60.394782,
    5.342646
  ],
  "Sydneskleiven 4 (Bergen)": [
    60.3906818,
    5.3167584
  ],
  "Bergen Airport (BGO)": [
    60.296533,
    5.219818
  ],
  "Stadsträdgården (Karlstad)": [
    59.375535,
    13.502073
  ],
  "Aker Brygge (Oslo)": [
    59.909928,
    10.725042
  ],
  "Karl Johans gate (Oslo)": [
    59.913445,
    10.740076
  ],
  "Bryggen (Bergen)": [
    60.397726,
    5.322933
  ]
};

  // Transport legs: named origin/destination hub (keys into HUB_COORDS).
  // Legs with only one meaningful endpoint (e.g. "Arrive Frankfurt") set
  // just one side. The trip's home departure/return (Denver <-> Colorado
  // Springs) is intentionally out of scope -- not a place being visited.
  const MAP_TRANSPORT = {
  "1": {
    "destination": "Denver Airport"
  },
  "3": {
    "origin": "Denver Airport",
    "destination": "Frankfurt Airport"
  },
  "5": {
    "destination": "Frankfurt Airport"
  },
  "7": {
    "origin": "Frankfurt Airport",
    "destination": "Stockholm Arlanda Airport"
  },
  "9": {
    "origin": "Stockholm Arlanda Airport",
    "destination": "Munkbron 15 (Stockholm)"
  },
  "21": {
    "origin": "Royal Palace (Stockholm)",
    "destination": "Östermalms Saluhall"
  },
  "24": {
    "origin": "Östermalm",
    "destination": "Gamla Stan"
  },
  "28": {
    "origin": "Munkbron 15 (Stockholm)",
    "destination": "Vasa Museum"
  },
  "32": {
    "origin": "Skansen",
    "destination": "Munkbron 15 (Stockholm)"
  },
  "38": {
    "origin": "Nybrokajen",
    "destination": "Sandhamn"
  },
  "40": {
    "origin": "Sandhamn",
    "destination": "Nybrokajen"
  },
  "45": {
    "origin": "Munkbron 15 (Stockholm)",
    "destination": "Stockholm Central Station"
  },
  "46": {
    "origin": "Stockholm Central Station",
    "destination": "Mora Station"
  },
  "53": {
    "origin": "Kristinebergs B&B (Mora)",
    "destination": "Kråkbergsbadet"
  },
  "55": {
    "origin": "Kråkbergsbadet",
    "destination": "Korsnäsgården"
  },
  "58": {
    "origin": "Mora Station",
    "destination": "Nusnäs"
  },
  "62": {
    "origin": "Nusnäs",
    "destination": "Mora Station"
  },
  "71": {
    "origin": "Mora Station",
    "destination": "Karlstad Central Station"
  },
  "76": {
    "origin": "Julins Backyard Barbecue",
    "destination": "Scandic Karlstad City"
  },
  "80": {
    "origin": "Karlstad Central Station",
    "destination": "Oslo S"
  },
  "112": {
    "origin": "Tøyengata 26A (Oslo)",
    "destination": "Vigeland Park"
  },
  "114": {
    "origin": "Vigeland Park",
    "destination": "Tøyengata 26A (Oslo)"
  },
  "119": {
    "origin": "Oslo S",
    "destination": "Voss Station"
  },
  "120": {
    "origin": "Voss Station",
    "destination": "Tråstølsvegen 344 (Voss)"
  },
  "122": {
    "origin": "Tråstølsvegen 344 (Voss)",
    "destination": "Voss Station"
  },
  "123": {
    "origin": "Voss Station",
    "destination": "Myrdal"
  },
  "124": {
    "origin": "Myrdal",
    "destination": "Flåm"
  },
  "126": {
    "origin": "Flåm",
    "destination": "Gudvangen"
  },
  "128": {
    "origin": "Gudvangen",
    "destination": "Flåm"
  },
  "129": {
    "origin": "Flåm",
    "destination": "Myrdal"
  },
  "130": {
    "origin": "Myrdal",
    "destination": "Voss Station"
  },
  "133": {
    "origin": "Voss Station",
    "destination": "Tråstølsvegen 344 (Voss)"
  },
  "135": {
    "origin": "Tråstølsvegen 344 (Voss)",
    "destination": "Voss Station"
  },
  "136": {
    "origin": "Voss Station",
    "destination": "Bergen Station"
  },
  "147": {
    "origin": "Fløibanen Base Station",
    "destination": "Fløyen"
  },
  "149": {
    "origin": "Fløyen",
    "destination": "Fløibanen Base Station"
  },
  "162": {
    "origin": "Sydneskleiven 4 (Bergen)",
    "destination": "Bergen Airport (BGO)"
  },
  "163": {
    "origin": "Bergen Airport (BGO)",
    "destination": "Frankfurt Airport"
  },
  "165": {
    "origin": "Frankfurt Airport",
    "destination": "Denver Airport"
  },
  "166": {
    "origin": "Denver Airport"
  }
};

  // Walking legs whose origin/destination is a genuine waypoint that isn't
  // already represented by a lodging/activity/dining/transport-hub pin
  // (e.g. "Bryggen" -- day 14 leg 151 -- has no pin of its own otherwise,
  // even though a nearby restaurant does). Unlike MAP_TRANSPORT these are
  // shown with the "activity" pin color, since they read as places
  // visited rather than stations passed through. Most walking legs need
  // no entry here at all because both ends already coincide with an
  // existing pin.
  const MAP_WALK_HUBS = {
    "74": { "destination": "Stadsträdgården (Karlstad)" },
    "98": { "destination": "Aker Brygge (Oslo)" },
    "100": { "origin": "Aker Brygge (Oslo)" },
    "104": { "destination": "Karl Johans gate (Oslo)" },
    "105": { "origin": "Karl Johans gate (Oslo)" },
    "151": { "destination": "Bryggen (Bergen)" }
  };

  // Walking legs: explicit origin/destination search text for Google Maps
  // walking directions. Either side left unset auto-resolves: an "A -> B"
  // half naming a known lodging by name uses its exact coordinates; a leg
  // with no arrow (a stroll near where we're staying) falls back to that
  // day's lodging. If neither resolves (e.g. the dinner venue is still
  // TBD), the leg gets no link.
  const MAP_WALK = {
  "11": {
    "destination": "Gamla Stan, Stockholm, Sweden"
  },
  "13": {
    "origin": "Den Gyldene Freden, Stockholm, Sweden"
  },
  "15": {
    "destination": "Gamla Stan, Stockholm, Sweden"
  },
  "17": {
    "origin": "Café Chokladkoppen, Stortorget 18, Stockholm, Sweden",
    "destination": "Storkyrkan Cathedral, Stockholm, Sweden"
  },
  "26": {
    "origin": "Aifur, Stockholm, Sweden"
  },
  "30": {
    "origin": "Vasa Museum, Stockholm, Sweden",
    "destination": "Skansen, Stockholm, Sweden"
  },
  "34": {
    "origin": "Restaurang Agaton, Stockholm, Sweden"
  },
  "36": {
    "destination": "Nybrokajen, Stockholm, Sweden"
  },
  "41": {
    "origin": "Nybrokajen, Stockholm, Sweden"
  },
  "43": {
    "origin": "The Hairy Pig, Stockholm, Sweden"
  },
  "47": {
    "origin": "Mora Station, Sweden"
  },
  "49": {
    "destination": "Kyrkogatan, Mora, Sweden"
  },
  "57": {
    "origin": "Korsnäsgården, Moragatan 9, Mora, Sweden",
    "destination": "Mora Station, Sweden"
  },
  "61": {
    "origin": "Grannas A. Olsson Hemslöjd, Nusnäs, Sweden",
    "destination": "Granasgatu bus stop, Nusnäs, Sweden"
  },
  "63": {
    "origin": "Mora Station, Sweden"
  },
  "66": {
    "origin": "Restaurang Vasagatan 32, Vasagatan 32, Mora, Sweden"
  },
  "70": {
    "origin": "61.0100949,14.5575303",
    "destination": "Mora Station, Sweden"
  },
  "72": {
    "origin": "Karlstad Central Station, Sweden"
  },
  "74": {
    "destination": "Stadsträdgården, Karlstad, Sweden"
  },
  "78": {
    "origin": "Scandic Karlstad City, Karlstad, Sweden",
    "destination": "Karlstad Central Station, Sweden"
  },
  "81": {
    "origin": "Oslo Central Station (Oslo S), Norway"
  },
  "84": {
    "origin": "Kafe Asylet, Grønland 28, Oslo, Norway",
    "destination": "Oslo Botanical Garden, Norway"
  },
  "90": {
    "origin": "Oslo Street Food, Torggata 16, Oslo, Norway"
  },
  "92": {
    "destination": "Stortinget, Oslo, Norway"
  },
  "94": {
    "origin": "Stortinget, Oslo, Norway",
    "destination": "Oslo Cathedral, Karl Johans gate 11, Oslo, Norway"
  },
  "96": {
    "origin": "Oslo Cathedral, Oslo, Norway",
    "destination": "Rådhusplassen 1, Oslo, Norway"
  },
  "98": {
    "origin": "Oslo City Hall, Oslo, Norway",
    "destination": "Bryggegata 3, Oslo, Norway"
  },
  "100": {
    "origin": "Aker Brygge, Oslo, Norway",
    "destination": "Akershus Fortress, Oslo, Norway"
  },
  "102": {
    "origin": "Akershus Fortress, Oslo, Norway",
    "destination": "Royal Palace, Oslo, Norway"
  },
  "104": {
    "origin": "Royal Palace, Oslo, Norway",
    "destination": "Karl Johans gate, Oslo, Norway"
  },
  "105": {
    "origin": "Karl Johans gate, Oslo, Norway",
    "destination": "Kirsten Flagstads plass 1, Oslo, Norway"
  },
  "107": {
    "origin": "Oslo Opera House, Oslo, Norway",
    "destination": "Grünerløkka, Oslo, Norway"
  },
  "110": {
    "origin": "Godt Brød, Thorvald Meyers gate 49, Oslo, Norway"
  },
  "118": {
    "destination": "Oslo Central Station (Oslo S), Norway"
  },
  "137": {
    "origin": "Bergen Station, Norway"
  },
  "139": {
    "origin": "Søstrene Hagelin, Strandgaten 3, Bergen, Norway"
  },
  "146": {
    "destination": "Fløibanen base station, Bergen, Norway"
  },
  "151": {
    "origin": "Fisketorget, Bergen, Norway",
    "destination": "Bryggen, Bergen, Norway"
  },
  "153": {
    "origin": "Fisketorget, Bergen, Norway"
  },
  "156": {
    "origin": "Bryggeloftet & Stuene, Bryggen 11, Bergen, Norway"
  }
};

  function resolveWalkSide(text) {
    const named = findNamedLodging(text);
    return named ? lodgingCoordQuery(named) : null;
  }

  function googleMapsSearchUrl(query) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
  }

  function googleMapsWalkUrl(origin, destination) {
    return "https://www.google.com/maps/dir/?api=1&origin=" + encodeURIComponent(origin) +
      "&destination=" + encodeURIComponent(destination) + "&travelmode=walking";
  }

  function mapLinkForLeg(leg, day, cat) {
    if (cat === "lodging") {
      const lodging = lodgingForLeg(leg, day);
      if (!lodging) return null;
      return { type: "search", url: googleMapsSearchUrl(lodgingCoordQuery(lodging)) };
    }

    if (cat === "activity") {
      const query = MAP_SEARCH_QUERY[leg.num];
      if (!query) return null;
      return { type: "search", url: googleMapsSearchUrl(query) };
    }

    if (cat === "dining") {
      const address = MAP_DINING[leg.num];
      if (!address) return null;
      const label = MAP_DINING_LABEL[leg.num];
      // Prepend the venue name so Google Maps resolves to that business's
      // own listing rather than just dropping a pin on the address (which
      // can land on the wrong tenant in a shared building). Skip when the
      // address text already names the venue (would just duplicate it) or
      // when the "label" is really a description, not a business name
      // Google can look up (a tour meeting point, an unconfirmed pick).
      const query =
        label && !MAP_DINING_QUERY_SKIP_LABEL.has(leg.num) ? label + ", " + address : address;
      return { type: "search", url: googleMapsSearchUrl(query) };
    }

    if (cat === "walking") {
      const override = MAP_WALK[leg.num] || {};
      const hasArrow = leg.activity.includes("→");
      let originText = override.origin || null;
      let destText = override.destination || null;

      if (hasArrow) {
        const parts = leg.activity.split("→").map((s) => s.trim());
        if (!originText) originText = resolveWalkSide(parts[0]);
        if (!destText) destText = resolveWalkSide(parts[1]);
      } else {
        const dayLodging = findLodgingFor(day);
        const dayLodgingQuery = dayLodging ? lodgingCoordQuery(dayLodging) : null;
        if (!originText) originText = dayLodgingQuery;
        if (!destText) destText = dayLodgingQuery;
      }

      if (!originText || !destText) return null;
      return { type: "walk", url: googleMapsWalkUrl(originText, destText) };
    }

    return null;
  }

  function categorizeLeg(leg) {
    if (leg.mode === "Walk") return "walking";
    if (leg.mode && TRANSPORT_MODES.has(leg.mode)) return "transport";

    const text = ((leg.activity || "") + " " + (leg.detail || "")).toLowerCase();
    if (/security|passport control|baggage claim|connection at/.test(text)) return "activity";
    if (/overnight/.test(text)) return "lodging";
    if (LODGING_NAMES.some((name) => text.includes(name))) return "lodging";
    if (/check-?in|check-?out|settle in|drop bags/.test(text)) return "lodging";
    if (/\b(dinner|lunch|breakfast|brunch|fika)\b|food walk|restaurant/.test(text)) return "dining";
    if (/pack(ing)?|\bconfirm|\bverify|reminder/.test(text)) return "note";
    return "activity";
  }

  function renderLeg(leg, day) {
    const el = document.createElement("div");
    const cat = categorizeLeg(leg);
    el.className = "leg cat-" + cat;
    el.setAttribute("data-leg-num", leg.num);
    const times = leg.depart || leg.arrive
      ? `${leg.depart || ""}${leg.depart && leg.arrive ? '<span class="arrow">→</span>' : ""}${leg.arrive || ""}`
      : "";
    const modeIcon = leg.mode ? renderModeIcon(leg.mode) : "";
    const chipEmoji = modeIcon || CATEGORY_META[cat].emoji;
    const chipLabel = leg.mode || CATEGORY_META[cat].label;
    const mapLink = mapLinkForLeg(leg, day, cat);
    const mapLinkHtml = mapLink
      ? `<a class="leg-map-link" href="${mapLink.url}" target="_blank" rel="noopener">${mapLink.type === "walk" ? "🚶 Walking directions" : "📍 View on Google Maps"}</a>`
      : "";
    el.innerHTML = `
      <span class="num">${leg.num}</span>
      <span class="times">${times}</span>
      <div class="body">
        <p class="activity">${leg.flag ? '<span class="flag-icon">⚠</span>' : ""}${leg.activity}</p>
        <span class="mode-chip cat-${cat}">${chipEmoji} ${chipLabel}</span>
        ${leg.detail ? `<p class="detail">${leg.detail}</p>` : ""}
        ${mapLinkHtml}
      </div>
    `;
    const pinRef = TRIP_MAP_POINTS.legPinIndex[leg.num];
    if (pinRef) {
      const mapViewBtn = document.createElement("button");
      mapViewBtn.type = "button";
      mapViewBtn.className = "leg-map-link";
      mapViewBtn.textContent = "🗺️ Map view";
      mapViewBtn.addEventListener("click", () => goToMapPin(pinRef.key, pinRef.lat, pinRef.lon));
      el.querySelector(".body").appendChild(mapViewBtn);
    }
    return el;
  }

  function telHref(phone) {
    return "tel:" + phone.replace(/[^\d+]/g, "");
  }

  function renderDiningItem(d, diningIndex) {
    const el = document.createElement("div");
    el.className = "dining-item" + (d.leading ? " leading" : "");
    el.setAttribute("data-dining-index", diningIndex);
    const phoneLink = d.phone ? `<a href="${telHref(d.phone)}">${d.phone}</a>` : "";
    const websiteHref = d.website ? (d.website.startsWith("http") ? d.website : "https://" + d.website) : "";
    const websiteLink = d.website ? `<a href="${websiteHref}" target="_blank" rel="noopener">${d.website}</a>` : "";
    // Only real candidates carry an address; placeholders like "Dinner —
    // not yet chosen" have none, so they get no map link. Lead with the
    // venue name (unless the address text already names it) so Google
    // Maps resolves to that business's own listing, not just a pin on
    // the building -- see the same logic in mapLinkForLeg().
    const diningQuery =
      d.address && !d.address.toLowerCase().includes(d.name.toLowerCase()) ? d.name + ", " + d.address : d.address;
    const mapLink = d.address
      ? `<a href="${googleMapsSearchUrl(diningQuery)}" target="_blank" rel="noopener">📍 View on Google Maps</a>`
      : "";
    const pinRef = d.address ? TRIP_MAP_POINTS.diningPinByAddress[d.address] : null;
    const mapViewHtml = pinRef ? `<button type="button" class="dining-map-view-btn">🗺️ Map view</button>` : "";
    const contactBits = [phoneLink, websiteLink, mapLink, mapViewHtml].filter(Boolean).join(" · ");
    el.innerHTML = `
      <div class="row">
        <span class="name">${d.name}</span>
        <span class="dining-badge">${d.status || ""}</span>
      </div>
      <div class="meta">${[d.meal, d.walk, d.address].filter(Boolean).join(" · ")}</div>
      ${d.description ? `<p class="desc">${d.description}</p>` : ""}
      ${contactBits ? `<div class="contact-line">${contactBits}</div>` : ""}
    `;
    if (pinRef) {
      el.querySelector(".dining-map-view-btn").addEventListener("click", () => goToMapPin(pinRef.key, pinRef.lat, pinRef.lon));
    }
    return el;
  }

  function renderContactItem(c) {
    const el = document.createElement("div");
    el.className = "contact-item";
    el.innerHTML = `
      <div>
        <div class="cname">${c.name}</div>
        <div class="cused">${c.used_for || ""}</div>
      </div>
      ${c.phone ? `<a class="cphone" href="${telHref(c.phone)}">${c.phone}</a>` : ""}
    `;
    return el;
  }

  function renderCollapsible(title, contentEl, openByDefault, onFirstOpen) {
    const details = document.createElement("details");
    details.className = "collapsible";
    if (openByDefault) details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);
    const content = document.createElement("div");
    content.className = "content";
    content.appendChild(contentEl);
    details.appendChild(content);
    if (onFirstOpen) {
      if (openByDefault) onFirstOpen();
      details.addEventListener("toggle", () => {
        if (details.open) onFirstOpen();
      });
    }
    return details;
  }

  function renderDayView() {
    const day = DAYS[state.dayIndex];
    const container = document.createElement("div");
    container.className = "day-view";

    const head = document.createElement("div");
    head.className = "day-head";
    head.innerHTML = `
      <p class="day-eyebrow">Day ${day.day_number} of ${DAYS.length} · ${day.weekday}, ${fmtDateLabel(day)}</p>
      <h1 class="day-title">${day.title.split("—").slice(1).join("—").trim() || day.title}</h1>
      <p class="day-subtitle">${day.subtitle}</p>
    `;
    container.appendChild(head);

    const lodging = findLodgingFor(day);
    if (lodging) {
      const band = document.createElement("div");
      band.className = "lodging-banner";
      band.innerHTML = `
        <span class="icon">🛏️</span>
        <div>
          <div class="label">Lodging</div>
          <div>${lodging.name}${lodging.host ? " · host " + lodging.host : ""}</div>
        </div>
      `;
      container.appendChild(band);
    }

    if (day.reminders && day.reminders.length) {
      const rem = document.createElement("div");
      rem.className = "reminders";
      rem.innerHTML = `<span class="label">Don't forget</span><ul>${day.reminders.map((r) => `<li>${r}</li>`).join("")}</ul>`;
      container.appendChild(rem);
    }

    const legsLabel = document.createElement("div");
    legsLabel.className = "section-label";
    legsLabel.textContent = "Logistics";
    container.appendChild(legsLabel);

    const legsWrap = document.createElement("div");
    legsWrap.className = "legs";
    day.legs.forEach((leg) => legsWrap.appendChild(renderLeg(leg, day)));
    container.appendChild(legsWrap);

    const mapSection = renderMapSection(day);
    if (mapSection) {
      container.appendChild(renderCollapsible("Map", mapSection.el, false, mapSection.activate));
    }

    if (day.story && day.story.length) {
      const storyContent = document.createElement("div");
      day.story.forEach((s) => {
        const block = document.createElement("div");
        block.className = "story-block";
        block.innerHTML = `<h4>${s.heading}</h4><p>${s.text}</p>`;
        storyContent.appendChild(block);
      });
      container.appendChild(renderCollapsible("Background & story", storyContent, false));
    }

    if (day.dining && day.dining.length) {
      const diningContent = document.createElement("div");
      day.dining.forEach((d, diningIndex) => diningContent.appendChild(renderDiningItem(d, diningIndex)));
      container.appendChild(renderCollapsible("Dining options", diningContent, false));
    }

    if (day.contacts && day.contacts.length) {
      const contactContent = document.createElement("div");
      day.contacts.forEach((c) => contactContent.appendChild(renderContactItem(c)));
      container.appendChild(renderCollapsible("Contacts", contactContent, false));
    }

    const jump = document.createElement("div");
    jump.className = "day-jump";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "← Previous day";
    prevBtn.disabled = state.dayIndex === 0;
    prevBtn.addEventListener("click", () => { window.scrollTo(0, 0); state.dayIndex--; saveLastDay(state.dayIndex); render(); });
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "Next day →";
    nextBtn.disabled = state.dayIndex === DAYS.length - 1;
    nextBtn.addEventListener("click", () => { window.scrollTo(0, 0); state.dayIndex++; saveLastDay(state.dayIndex); render(); });
    jump.appendChild(prevBtn);
    jump.appendChild(nextBtn);
    container.appendChild(jump);

    return container;
  }

  // ---------------- Search view ----------------
  // Every diacritic actually used across the trip data (Swedish å/ä/ö,
  // Norwegian ø/æ, plus loanwords like "Café"/"Nærøyfjord"), mapped to its
  // closest plain-English letter, so searching "ostermalm" matches
  // "Östermalm" and "cafe" matches "Café" -- and typing the accented form
  // still works too, since both sides of the match go through this.
  const DIACRITIC_MAP = {
    å: "a",
    ä: "a",
    à: "a",
    ö: "o",
    ø: "o",
    é: "e",
    ü: "u",
    æ: "ae"
  };
  function normalizeForSearch(str) {
    return str
      .toLowerCase()
      .split("")
      .map((ch) => DIACRITIC_MAP[ch] || ch)
      .join("");
  }

  // Strips everything but letters/digits, so word-boundary differences
  // don't matter -- e.g. a query of "GamlaStan" (no space) still matches
  // indexed text "Gamla Stan" (with one), and "T-bana" matches "Tbana".
  // Applied on top of (not instead of) the plain substring match, so exact
  // phrase search still works too.
  function collapseForSearch(str) {
    return normalizeForSearch(str).replace(/[^a-z0-9]+/g, "");
  }

  function buildSearchIndex() {
    const idx = [];
    DAYS.forEach((day) => {
      day.legs.forEach((leg) => {
        const raw = [leg.activity, leg.detail, leg.mode].filter(Boolean).join(" ");
        idx.push({
          dayIndex: DAYS.indexOf(day),
          dayLabel: `Day ${day.day_number} · ${mapPopupDayLabel(DAYS.indexOf(day))}`,
          title: leg.activity,
          detail: [leg.mode, leg.detail].filter(Boolean).join(" — "),
          haystack: normalizeForSearch(raw),
          haystackCollapsed: collapseForSearch(raw),
          legNum: leg.num
        });
      });
      (day.dining || []).forEach((d, diningIndex) => {
        const raw = [d.name, d.meal, d.address, d.description].filter(Boolean).join(" ");
        idx.push({
          dayIndex: DAYS.indexOf(day),
          dayLabel: `Day ${day.day_number} · ${mapPopupDayLabel(DAYS.indexOf(day))}`,
          title: d.name + (d.leading ? " ★" : ""),
          detail: [d.meal, d.address, d.description].filter(Boolean).join(" — "),
          haystack: normalizeForSearch(raw),
          haystackCollapsed: collapseForSearch(raw),
          diningIndex
        });
      });
    });
    return idx;
  }
  const SEARCH_INDEX = buildSearchIndex();

  // Survives navigating away from and back to the Search view (in-memory
  // only, resets on a full page reload -- same pattern as tripMapPersisted/
  // dayViewScrollY below) so tapping a result and returning via the bottom
  // nav doesn't reset the query and results back to empty.
  let searchQueryPersisted = "";

  function renderSearchView() {
    const container = document.createElement("div");
    container.className = "search-view";

    const input = document.createElement("input");
    input.className = "search-input";
    input.type = "search";
    input.placeholder = "Search the itinerary…";
    input.autofocus = true;
    input.value = searchQueryPersisted;

    const results = document.createElement("div");

    function runSearch(q) {
      searchQueryPersisted = q;
      results.innerHTML = "";
      const query = normalizeForSearch(q.trim());
      if (!query) {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = "Start typing to search across the whole trip.";
        results.appendChild(note);
        return;
      }
      // queryCollapsed can end up empty (e.g. a query of just "-"), and
      // "".includes("") is always true -- guard so that doesn't match
      // every entry.
      const queryCollapsed = collapseForSearch(q.trim());
      const matches = SEARCH_INDEX.filter(
        (item) => item.haystack.includes(query) || (queryCollapsed && item.haystackCollapsed.includes(queryCollapsed))
      ).slice(0, 40);
      if (!matches.length) {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = "No matches.";
        results.appendChild(note);
        return;
      }
      matches.forEach((m) => {
        const card = document.createElement("div");
        card.className = "search-result";
        card.innerHTML = `
          <div class="day-tag">${m.dayLabel}</div>
          <div class="match-title">${m.title}</div>
          <div class="match-detail">${m.detail}</div>
        `;
        card.addEventListener("click", () => goToDay(m.dayIndex, m.legNum, m.diningIndex));
        results.appendChild(card);
      });
    }

    input.addEventListener("input", () => runSearch(input.value));
    runSearch(searchQueryPersisted);

    container.appendChild(input);
    container.appendChild(results);
    return container;
  }

  // ---------------- Trip map (Leaflet) ----------------
  let tripMapInstance = null;
  // Survives across navigating away from and back to the Map view (in
  // memory only -- resets on a full page reload) so the map reopens at
  // the same pan/zoom, with the same popup open, rather than resetting to
  // the whole-trip overview every time.
  let tripMapPersisted = null;
  let tripMapOpenPopupKey = null;

  // Leaflet measures its container's size once at init and caches it --
  // it has no way to know the container was resized later unless told
  // explicitly via invalidateSize(). On iOS Safari specifically, the
  // dynamic toolbar (address bar) showing/hiding as the user scrolls or
  // interacts changes the *real* visible viewport height without firing
  // a plain "resize" event reliably, since .trip-map-canvas's height is
  // in vh/dvh units tied to that viewport. Without this, the map's
  // internal panes/controls (including the zoom control) stay positioned
  // for whatever size the container was when the map was created,
  // drifting out of alignment with where the container is actually
  // rendered now -- e.g. the zoom control ending up partly behind the
  // header. visualViewport's own resize event is the more precise,
  // iOS-specific signal for exactly this; plain window resize is kept as
  // a fallback for browsers without the Visual Viewport API. Registered
  // once at module scope (not per-mount) since tripMapInstance changes
  // across mount/unmount but this listener shouldn't be re-added every
  // time -- it just checks whichever instance is currently live.
  function invalidateTripMapSize() {
    if (tripMapInstance) tripMapInstance.invalidateSize();
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", invalidateTripMapSize);
  } else {
    window.addEventListener("resize", invalidateTripMapSize);
  }

  function teardownTripMap() {
    if (tripMapInstance) {
      try {
        tripMapPersisted = {
          center: tripMapInstance.getCenter(),
          zoom: tripMapInstance.getZoom(),
          openPopupKey: tripMapOpenPopupKey
        };
      } catch (e) {
        // Map never got an initial view set (e.g. left before the first
        // render finished) -- nothing meaningful to persist.
      }
      tripMapInstance.remove();
      tripMapInstance = null;
    }
    // These layers/control belong to the just-destroyed Leaflet instance
    // (removed along with it) -- null them out so the next mount creates
    // fresh ones rather than touching detached objects. The underlying
    // tracking state (locationTrackingActive/userLocation/watch) is NOT
    // reset here -- it deliberately outlives the map's own DOM lifecycle,
    // see the "Live user location" section below.
    userLocationLayer = null;
    userLocationAccuracyLayer = null;
    locationButtonEl = null;
  }

  // ---------------- Live user location ("blue dot") ----------------
  // Independent of whether the Map view is even mounted: toggling the
  // "Current Location" control starts a navigator.geolocation watch that
  // keeps running (and userLocation below stays current) while the user
  // browses other tabs, so flipping back to Map shows an already-current
  // dot rather than a stale or empty one -- this is the "persists while
  // using the app" behavior. Only the Leaflet layers that actually draw
  // the dot are tied to the map's mount/unmount cycle (guarded by
  // tripMapInstance throughout), since render() fully tears down and
  // rebuilds the Leaflet instance on every navigation (see teardownTripMap
  // above) the way every other trip-map layer already does.
  let locationTrackingActive = false; // user's toggle intent -- NOT the same as "a watch is running right now" (see visibilitychange below)
  let locationWatchId = null;
  let userLocation = null; // { lat, lon, accuracy, heading } -- heading in degrees (0 = north), null if unknown
  let userLocationLayer = null; // L.marker: dot + heading cone
  let userLocationAccuracyLayer = null; // L.circle: real-world accuracy radius
  let locationButtonEl = null; // the custom Leaflet control's <a>, for toggling its "active" look
  let pendingInitialCenter = false; // true from activation until the first fix arrives, so we center the map exactly once per activation, not on every update
  let locationErrorAlertShown = false; // one non-fatal error message per activation, not one per retry (see onLocationError)
  let orientationListenerAttached = false;

  // timeout is generous (45s, up from an original 20s) since a cold
  // GPS-only fix -- no cell/WiFi-assisted positioning to speed things up,
  // e.g. in airplane mode -- can take a while; watchPosition keeps
  // retrying on its own after each timeout regardless (see
  // onLocationError), so this mainly just cuts down on how often that
  // happens rather than being a hard cutoff.
  const GEO_WATCH_OPTIONS = { enableHighAccuracy: true, maximumAge: 5000, timeout: 45000 };

  // Standard "my location" crosshair glyph (ring + center dot + 4 tick
  // marks) -- currentColor so CSS can recolor it for the active state.
  const LOCATION_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="7"/>
    <circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>
    <line x1="12" y1="1" x2="12" y2="4" stroke-linecap="round"/>
    <line x1="12" y1="20" x2="12" y2="23" stroke-linecap="round"/>
    <line x1="1" y1="12" x2="4" y2="12" stroke-linecap="round"/>
    <line x1="20" y1="12" x2="23" y2="12" stroke-linecap="round"/>
  </svg>`;

  function updateLocationButtonUI() {
    if (!locationButtonEl) return;
    locationButtonEl.classList.toggle("active", locationTrackingActive);
  }

  function userLocationDivIcon(heading) {
    // Positioning (centering the cone's bottom point on the dot) is
    // already fully handled by .user-loc-cone's own left/top/margin in
    // CSS -- only the rotation belongs here. Applying translate(-50%,
    // -100%) again on top of that double-offsets the cone away from the
    // dot instead of pivoting around it.
    const cone = heading == null ? "" : `<div class="user-loc-cone" style="transform: rotate(${heading}deg);"></div>`;
    return L.divIcon({
      className: "user-loc-icon",
      html: `${cone}<div class="user-loc-dot"></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }

  function renderUserLocationOnMap() {
    if (!tripMapInstance || !userLocation) return;
    const { lat, lon, accuracy, heading } = userLocation;
    const latlng = [lat, lon];
    if (!userLocationAccuracyLayer) {
      userLocationAccuracyLayer = L.circle(latlng, {
        radius: accuracy || 0,
        color: "#1a73e8",
        weight: 1,
        fillColor: "#1a73e8",
        fillOpacity: 0.15,
        interactive: false
      }).addTo(tripMapInstance);
    } else {
      userLocationAccuracyLayer.setLatLng(latlng);
      userLocationAccuracyLayer.setRadius(accuracy || 0);
    }
    if (!userLocationLayer) {
      userLocationLayer = L.marker(latlng, {
        icon: userLocationDivIcon(heading),
        zIndexOffset: 1000,
        interactive: false
      }).addTo(tripMapInstance);
    } else {
      userLocationLayer.setLatLng(latlng);
      userLocationLayer.setIcon(userLocationDivIcon(heading));
    }
  }

  function clearUserLocationLayers() {
    if (userLocationLayer && tripMapInstance) {
      try { tripMapInstance.removeLayer(userLocationLayer); } catch (e) {}
    }
    if (userLocationAccuracyLayer && tripMapInstance) {
      try { tripMapInstance.removeLayer(userLocationAccuracyLayer); } catch (e) {}
    }
    userLocationLayer = null;
    userLocationAccuracyLayer = null;
  }

  // iOS Safari exposes true compass heading directly as
  // event.webkitCompassHeading (no correction needed); everywhere else
  // that supports it, event.alpha is counterclockwise from the device's
  // initial orientation, so 360-alpha approximates compass heading when
  // the event is "absolute". This app is documented as iPhone-only (see
  // CLAUDE.md), so webkitCompassHeading is the primary path -- the
  // fallback is best-effort, not a tested/supported path.
  function handleOrientationEvent(event) {
    let heading = null;
    if (typeof event.webkitCompassHeading === "number") {
      heading = event.webkitCompassHeading;
    } else if (event.absolute && typeof event.alpha === "number") {
      heading = (360 - event.alpha) % 360;
    }
    if (heading == null || !userLocation) return;
    userLocation = { ...userLocation, heading };
    renderUserLocationOnMap();
  }

  // iOS 13+ requires DeviceOrientationEvent.requestPermission(), which
  // must be called from within a user-gesture handler -- the location
  // button's own click (see toggleLocationTracking) qualifies. Heading is
  // a nice-to-have on top of GPS-based tracking (coords.heading from
  // watchPosition already covers "which way am I facing" while actually
  // moving), so a denied/unsupported compass just means the dot has no
  // direction cone while stationary -- not treated as an error.
  function attachOrientationListener() {
    if (orientationListenerAttached || typeof DeviceOrientationEvent === "undefined") return;
    function addListener() {
      window.addEventListener("deviceorientation", handleOrientationEvent);
      orientationListenerAttached = true;
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      DeviceOrientationEvent.requestPermission().then((result) => {
        if (result === "granted") addListener();
      }).catch(() => {});
    } else {
      addListener();
    }
  }

  function detachOrientationListener() {
    if (!orientationListenerAttached) return;
    window.removeEventListener("deviceorientation", handleOrientationEvent);
    orientationListenerAttached = false;
  }

  function onLocationUpdate(pos) {
    const heading = (typeof pos.coords.heading === "number" && !Number.isNaN(pos.coords.heading))
      ? pos.coords.heading
      : (userLocation ? userLocation.heading : null);
    userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, heading };
    renderUserLocationOnMap();
    if (pendingInitialCenter && tripMapInstance) {
      pendingInitialCenter = false;
      tripMapInstance.flyTo([userLocation.lat, userLocation.lon], Math.max(tripMapInstance.getZoom(), 15), { duration: 0.6 });
    }
  }

  // Only PERMISSION_DENIED is actually fatal. POSITION_UNAVAILABLE and
  // TIMEOUT are routine and expected the first time a fix is requested
  // with no cell/WiFi-assisted positioning to speed things up (airplane
  // mode, or just a device that hasn't gotten a GPS lock recently) -- a
  // cold GPS-only fix can legitimately take 30-90+ seconds outdoors and
  // may never arrive at all indoors. watchPosition keeps retrying
  // automatically after either of those, so treating them as fatal (the
  // original behavior) killed tracking and blamed "Location Services"
  // permissions for what was really just "still waiting for a satellite
  // lock." Only surface a message once per activation (watchPosition can
  // re-fire timeout errors repeatedly while it keeps trying), and don't
  // touch locationTrackingActive/the watch at all for these -- let it
  // keep trying silently in the background.
  function onLocationError(err) {
    const code = err && err.code;
    if (code === 1) { // PERMISSION_DENIED
      pendingInitialCenter = false;
      deactivateLocationTracking();
      alert("Location access was denied. Check that Location Services are allowed for this site in your device settings.");
      return;
    }
    if (pendingInitialCenter && !locationErrorAlertShown) {
      locationErrorAlertShown = true;
      alert("Still waiting for a GPS fix -- this can take longer than usual in airplane mode or indoors. Tracking will keep trying in the background, and the map will center as soon as it gets one.");
    }
  }

  function activateLocationTracking() {
    if (!("geolocation" in navigator)) {
      alert("Location isn't available on this device/browser.");
      return;
    }
    locationTrackingActive = true;
    pendingInitialCenter = true;
    locationErrorAlertShown = false;
    locationWatchId = navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, GEO_WATCH_OPTIONS);
    attachOrientationListener();
    updateLocationButtonUI();
  }

  function deactivateLocationTracking() {
    locationTrackingActive = false;
    pendingInitialCenter = false;
    if (locationWatchId != null) {
      navigator.geolocation.clearWatch(locationWatchId);
      locationWatchId = null;
    }
    detachOrientationListener();
    userLocation = null;
    clearUserLocationLayers();
    updateLocationButtonUI();
  }

  function toggleLocationTracking() {
    if (locationTrackingActive) deactivateLocationTracking();
    else activateLocationTracking();
  }

  // Battery-saving pause: stop the OS-level watch (and compass listener)
  // whenever the app isn't the foreground/active tab, but leave
  // locationTrackingActive (and the button's selected look) alone -- this
  // is "not actively tracking right now," not "the user turned tracking
  // off," so it resumes silently (no re-prompt, no re-center) as soon as
  // the app is active again.
  document.addEventListener("visibilitychange", () => {
    if (!locationTrackingActive) return;
    if (document.hidden) {
      if (locationWatchId != null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
      }
      detachOrientationListener();
    } else if (locationWatchId == null) {
      locationWatchId = navigator.geolocation.watchPosition(onLocationUpdate, onLocationError, GEO_WATCH_OPTIONS);
      attachOrientationListener();
    }
  });

  // Jump straight to a specific pin on the trip map (from a "Map view"
  // link in the day itinerary) -- centers on it, zooms in close enough
  // that its layer is visible, and opens its popup. Reuses the same
  // tripMapPersisted mechanism that restores state when navigating back
  // to the Map tab, since "go to this exact pin" is the same operation.
  function goToMapPin(key, lat, lon) {
    captureDayScrollIfLeaving();
    window.scrollTo(0, 0);
    tripMapPersisted = { center: [lat, lon], zoom: 15, openPopupKey: key };
    state.view = "map";
    render();
  }

  function categoryMapColor(kind) {
    // Mirrors --cat-* in styles.css exactly (for the categories that also
    // appear in the Logistics list), so a pin's color always matches that
    // leg's color there. "dining-suggested" is map-only -- it doesn't
    // change how a suggested-vs-confirmed dinner looks in the Logistics
    // list, only how its pin looks on the trip map.
    const colors = {
      activity: "#7f30a6",
      dining: "#b43622",
      "dining-suggested": "#e75586",
      lodging: "#2f57c6",
      transport: "#1d9a81",
      // Deliberate exception to --amber being "reserved for flags/warnings
      // only" elsewhere in the app -- explicitly requested as yellow, map
      // pins only, not used anywhere in the Logistics list's category
      // system.
      poi: "#f3bf16"
    };
    return colors[kind] || "#35576b";
  }

  function tripMapDotHtml(kind) {
    return `<span class="tmp-dot" style="background:${categoryMapColor(kind)}"></span>`;
  }

  function appendVisitRows(popupEl, visits, goToDayFn) {
    visits
      .slice()
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .forEach((v) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "tmp-goto tmp-visit";
        row.innerHTML = `<span class="tmp-visit-day">${mapPopupDayLabel(v.dayIndex)}${v.time ? " · " + v.time : ""}</span><span class="tmp-visit-label">${tripMapDotHtml(v.kind)}${v.label}</span>`;
        row.addEventListener("click", () => goToDayFn(v.dayIndex, v.num));
        popupEl.appendChild(row);
      });
  }

  function appendTransitVisitRows(popupEl, visits, goToDayFn) {
    if (!visits || !visits.length) return;
    const label = document.createElement("div");
    label.className = "tmp-transit-label";
    label.textContent = "Also passes through here:";
    popupEl.appendChild(label);
    appendVisitRows(popupEl, visits, goToDayFn);
  }

  function makeTripMapIcon(kind, dotSize) {
    // Tap target is always >= 30px even when the visible dot is smaller,
    // so detail pins stay comfortably tappable on a phone.
    const tapSize = Math.max(dotSize + 14, 30);
    return L.divIcon({
      className: "trip-map-pin",
      html: `<span style="background:${categoryMapColor(kind)};width:${dotSize}px;height:${dotSize}px;"></span>`,
      iconSize: [tapSize, tapSize],
      iconAnchor: [tapSize / 2, tapSize / 2],
      popupAnchor: [0, -tapSize / 2]
    });
  }

  function buildTripMapPoints() {
    const cityPoints = LODGING.map((l) => ({
      lat: l.lat,
      lon: l.lon,
      location: l.location,
      name: l.name,
      key: "city:" + l.location
    }));
    const cityPointByLocation = {};
    cityPoints.forEach((p) => {
      cityPointByLocation[p.location] = p;
    });

    // leg.num -> { key, lat, lon } for every leg that has *some* pin
    // representing it on the trip map, regardless of category. Powers the
    // "Map view" link in the Logistics list.
    const legPinIndex = {};
    // dining[].address -> { key, lat, lon }, covering both leg-tied dining
    // pins and the address-only "extra" ones below. Powers the "Map view"
    // link in Dining options, since those entries don't carry a leg.num.
    const diningPinByAddress = {};

    const detailPoints = [];
    DAYS.forEach((day, dayIndex) => {
      day.legs.forEach((leg) => {
        const cat = categorizeLeg(leg);
        if (cat === "lodging") {
          const lodging = lodgingForLeg(leg, day);
          const cityPoint = lodging && cityPointByLocation[lodging.location];
          if (cityPoint) legPinIndex[leg.num] = { key: cityPoint.key, lat: cityPoint.lat, lon: cityPoint.lon };
          return;
        }
        let coords = null;
        if (cat === "activity") coords = MAP_POINT_COORDS_ACTIVITY[leg.num];
        else if (cat === "dining") coords = MAP_POINT_COORDS_DINING[leg.num];
        if (!coords) return;
        const pinKind = cat === "dining" && !MAP_DINING_CONFIRMED.has(leg.num) ? "dining-suggested" : cat;
        const label = cat === "dining" && MAP_DINING_LABEL[leg.num] ? MAP_DINING_LABEL[leg.num] : leg.activity;
        const point = {
          lat: coords[0],
          lon: coords[1],
          kind: pinKind,
          dayIndex,
          dayNumber: day.day_number,
          num: leg.num,
          label,
          time: leg.depart || leg.arrive || "",
          key: "detail:" + leg.num
        };
        detailPoints.push(point);
        legPinIndex[leg.num] = { key: point.key, lat: point.lat, lon: point.lon };
        if (cat === "dining" && MAP_DINING[leg.num]) {
          diningPinByAddress[MAP_DINING[leg.num]] = { key: point.key, lat: point.lat, lon: point.lon };
        }
      });
    });

    // Dining candidates that have a real address but aren't the leading
    // pick tied to a Logistics leg (secondary/alternative restaurants) --
    // give them a pin too, so every dining option is visible on the map,
    // not just the one actually walked to in the itinerary.
    DAYS.forEach((day, dayIndex) => {
      (day.dining || []).forEach((d) => {
        if (!d.address || diningPinByAddress[d.address]) return;
        const coords = MAP_DINING_EXTRA_COORDS[d.address];
        if (!coords) return;
        const point = {
          lat: coords[0],
          lon: coords[1],
          kind: "dining-suggested",
          dayIndex,
          dayNumber: day.day_number,
          label: d.name,
          time: "",
          key: "dining-extra:" + day.day_number + ":" + d.name
        };
        detailPoints.push(point);
        diningPinByAddress[d.address] = { key: point.key, lat: point.lat, lon: point.lon };
      });
    });

    // Transport legs (train/bus/ferry/funicular/taxi/flight) and walking
    // legs both reference named hubs/waypoints rather than mapping one pin
    // per leg -- the same station is usually touched by several legs (e.g.
    // Voss Station appears in 4). Aggregate into one pin per named place,
    // each carrying the list of legs/days that pass through it. Transport
    // hubs (stations, airports) get the "transport" pin color; walking
    // waypoints (e.g. Bryggen, Aker Brygge) get "activity" since they read
    // as places visited, not stations passed through.
    const hubVisits = {};
    const hubKind = {};
    const legHubPreference = {}; // leg.num -> preferred hub name (destination-first)
    function collectHubRoutes(category, routeTable, kind) {
      DAYS.forEach((day, dayIndex) => {
        day.legs.forEach((leg) => {
          if (categorizeLeg(leg) !== category) return;
          const route = routeTable[leg.num];
          if (!route) return;
          [route.origin, route.destination].filter(Boolean).forEach((hubName) => {
            if (!HUB_COORDS[hubName]) return;
            hubKind[hubName] = kind;
            if (!hubVisits[hubName]) hubVisits[hubName] = [];
            hubVisits[hubName].push({
              dayIndex,
              dayNumber: day.day_number,
              num: leg.num,
              label: leg.activity,
              time: leg.depart || leg.arrive || "",
              kind
            });
          });
          const preferred =
            route.destination && HUB_COORDS[route.destination]
              ? route.destination
              : route.origin && HUB_COORDS[route.origin]
                ? route.origin
                : null;
          if (preferred) legHubPreference[leg.num] = preferred;
        });
      });
    }
    collectHubRoutes("transport", MAP_TRANSPORT, "transport");
    collectHubRoutes("walking", MAP_WALK_HUBS, "activity");
    // Several hubs intentionally reuse the exact coordinates of an existing
    // city/activity/dining pin (e.g. the "Flåm" hub and the "Free time in
    // Flåm" activity leg are the same real-world point). Rather than
    // stacking a second marker exactly on top of the first -- or worse,
    // silently dropping the transit info -- merge the hub's leg visits
    // into whichever point already occupies that spot, as a
    // `transitVisits` list on top of its own info. Only hubs at a
    // genuinely new location (stations, stops) get their own separate pin.
    const coordKey = (lat, lon) => lat.toFixed(5) + "," + lon.toFixed(5);
    const pointsByCoord = {};
    [...cityPoints, ...detailPoints].forEach((p) => {
      pointsByCoord[coordKey(p.lat, p.lon)] = p;
    });

    const hubPoints = [];
    const hubPointByName = {};
    Object.keys(hubVisits).forEach((hubName) => {
      const [lat, lon] = HUB_COORDS[hubName];
      const existing = pointsByCoord[coordKey(lat, lon)];
      if (existing) {
        existing.transitVisits = hubVisits[hubName];
      } else {
        const hubPoint = {
          lat,
          lon,
          name: hubName,
          kind: hubKind[hubName],
          visits: hubVisits[hubName],
          key: "hub:" + hubName
        };
        hubPoints.push(hubPoint);
        hubPointByName[hubName] = hubPoint;
      }
    });

    // Resolve each transport/walking leg's preferred hub into the pin that
    // *actually* represents it now -- which may be a merged-into
    // city/detail point rather than the hub itself.
    Object.keys(legHubPreference).forEach((num) => {
      const hubName = legHubPreference[num];
      const [lat, lon] = HUB_COORDS[hubName];
      const existing = pointsByCoord[coordKey(lat, lon)];
      if (existing) {
        legPinIndex[num] = { key: existing.key, lat: existing.lat, lon: existing.lon };
      } else if (hubPointByName[hubName]) {
        legPinIndex[num] = { key: hubPointByName[hubName].key, lat, lon };
      }
    });

    // Wiki points of interest -- independent of the legs/days/hub system
    // above (a POI isn't tied to a specific leg), so no merge/dedup with
    // existing pins: even where a POI and an existing activity/dining pin
    // represent the same real-world place, they're independently sourced
    // and get their own pin. One pin per POI, always.
    const poiPoints = POI_LIST.map((p) => ({
      lat: p.coordinates.lat,
      lon: p.coordinates.lng,
      kind: "poi",
      id: p.id,
      name: p.name,
      category: p.category,
      key: "poi:" + p.id
    }));
    const poiPinById = {};
    poiPoints.forEach((p) => {
      poiPinById[p.id] = { key: p.key, lat: p.lat, lon: p.lon };
    });

    return { cityPoints, detailPoints, hubPoints, poiPoints, legPinIndex, diningPinByAddress, poiPinById };
  }

  // Computed once -- the underlying trip data never changes at runtime, so
  // both the day view (for "Map view" links) and the map view itself share
  // this rather than rebuilding it on every render.
  const TRIP_MAP_POINTS = buildTripMapPoints();

  const TRIP_MAP_DETAIL_MIN_ZOOM = 6;

  // Straight-line distance in km (haversine) -- used to find which
  // activity/dining/hub pins "belong" to a city for the zoom-in bounds
  // below, since some day trips (Voss's Norway in a Nutshell loop through
  // Myrdal/Flåm/Gudvangen) range up to ~50km from the lodging itself.
  function kmBetween(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  // A custom L.TileLayer that checks IndexedDB (the same idb-keyval store
  // downloadToIdb() writes prefetched tiles into) before falling back to
  // a normal network tile load -- this is what makes the trip-wide
  // Leaflet map actually show prefetched tiles offline, the same way
  // drawStaticMap() does for the per-day canvas map. Overriding
  // createTile(coords, done) is Leaflet's standard extension point for
  // custom tile loading; this mirrors leaflet.js's own
  // L.TileLayer.prototype.createTile (down to reusing its private
  // _tileOnLoad()/_tileOnError() so fade-in/error handling behaves
  // exactly as it would for a normal tile), just deciding the tile's src
  // asynchronously instead of synchronously. Uses stadiaTileUrl(coords.z,
  // coords.x, coords.y) directly rather than this.getTileUrl(coords) --
  // Leaflet's own template-based URL builder has no way to prefer a
  // cached IndexedDB blob, so going through it here would bypass the
  // whole point of this override. crossOrigin/alt/role attributes are
  // omitted since this app's tile layer never sets options.crossOrigin
  // (Stadia Maps' CORS headers make that unnecessary -- see
  // stadiaTileUrl()'s doc comment) and this is a decorative background
  // map, not meaningful content a screen reader needs to announce.
  const OfflineTileLayer = L.TileLayer.extend({
    createTile: function (coords, done) {
      const tile = document.createElement("img");
      L.DomEvent.on(tile, "load", L.Util.bind(this._tileOnLoad, this, done, tile));
      L.DomEvent.on(tile, "error", L.Util.bind(this._tileOnError, this, done, tile));

      const url = stadiaTileUrl(coords.z, coords.x, coords.y);
      let objectUrl = null;
      // Released once the browser is done loading this tile (success or
      // error) -- Leaflet never reassigns a new src onto the same <img>,
      // so there's no risk of revoking a URL still in use.
      L.DomEvent.on(tile, "load error", () => {
        if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = null; }
      });
      if (window.idbKeyval) {
        idbKeyval.get(url).then((blob) => {
          if (blob) {
            objectUrl = URL.createObjectURL(blob);
            tile.src = objectUrl;
          } else {
            tile.src = url;
          }
        }).catch(() => { tile.src = url; });
      } else {
        tile.src = url;
      }

      return tile;
    }
  });

  function renderTripMapView() {
    const container = document.createElement("div");
    container.className = "trip-map-view";

    const mapEl = document.createElement("div");
    mapEl.className = "trip-map-canvas";
    container.appendChild(mapEl);

    const legend = document.createElement("div");
    legend.className = "trip-map-legend";
    legend.innerHTML = `
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("lodging")}"></span>Lodging</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("activity")}"></span>Activity</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("dining")}"></span>Dining</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("dining-suggested")}"></span>Tentative</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("transport")}"></span>Station</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("poi")}"></span>POI</span>
    `;
    container.appendChild(legend);

    // Leaflet needs the container attached to the live DOM (with real
    // layout dimensions) before init, so defer to the next frame -- by
    // then render() will have appended this view to #app.
    requestAnimationFrame(() => {
      if (state.view !== "map") return;

      teardownTripMap();
      const map = L.map(mapEl, { attributionControl: true, zoomControl: true, minZoom: 4, maxZoom: 18 });
      tripMapInstance = map;

      // The URL template argument here is never actually consulted --
      // createTile() above always builds the real URL via
      // stadiaTileUrl(), not this.getTileUrl() -- but Leaflet's
      // constructor still expects one, so it's kept as an accurate
      // (if unused) description of the real URL shape.
      new OfflineTileLayer("https://tiles.stadiamaps.com/tiles/" + STADIA_TILE_STYLE + "/{z}/{x}/{y}.png", {
        maxZoom: 18,
        // Required by Stadia Maps' terms -- see stadiaTileUrl()'s doc
        // comment.
        attribution: '&copy; <a href="https://stadiamaps.com/" target="_blank" rel="noopener">Stadia Maps</a>, &copy; <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);

      // "Current Location" control -- stacks in the same top-left corner
      // as (and directly below) Leaflet's own zoom control. A custom
      // L.Control rather than a plain HTML button positioned over the map
      // so Leaflet handles its placement/stacking and swallows its clicks
      // (L.DomEvent.disableClickPropagation) instead of them falling
      // through to a map pan/click.
      const LocationControl = L.Control.extend({
        options: { position: "topleft" },
        onAdd: function () {
          const el = L.DomUtil.create("div", "leaflet-bar trip-map-locate-control");
          const btn = L.DomUtil.create("a", "trip-map-locate-btn", el);
          btn.href = "#";
          btn.title = "Show my location";
          btn.setAttribute("aria-label", "Show my location");
          btn.innerHTML = LOCATION_ICON_SVG;
          L.DomEvent.disableClickPropagation(el);
          L.DomEvent.on(btn, "click", (e) => {
            L.DomEvent.preventDefault(e);
            toggleLocationTracking();
          });
          locationButtonEl = btn;
          return el;
        }
      });
      new LocationControl().addTo(map);
      updateLocationButtonUI();
      if (locationTrackingActive && userLocation) renderUserLocationOnMap();

      const { cityPoints, detailPoints, hubPoints, poiPoints } = TRIP_MAP_POINTS;

      // Leaflet's own default marker z-index is based purely on each
      // marker's *current on-screen pixel Y position* (leaflet.js's
      // Marker._setPos: `this._zIndex = t.y + this.options.zIndexOffset`,
      // zIndexOffset defaulting to 0 everywhere unless set) -- for two
      // markers representing nearly the same real-world spot (e.g. a POI
      // pin and an activity/dining pin both at/near the same cathedral),
      // their pixel Y positions are nearly identical, so tiny sub-pixel
      // rounding differences as the map zooms/pans can flip which one
      // computes a fractionally larger Y, visibly "fluttering" which pin
      // renders on top from one frame to the next. tripMapZIndexOffset()
      // assigns each marker a large, fixed, zoom/pan-independent
      // zIndexOffset instead, so the relative stacking order between any
      // two markers is permanently decided the moment they're created,
      // never by their transient screen position. Spacing tiers 1e6 apart
      // guarantees a tier difference can never be overturned by realistic
      // pixel-Y differences (at most a few thousand); the per-call
      // counter breaks ties *within* a tier (e.g. two overlapping POIs)
      // the same deterministic way. Priority order (low to high, so later
      // tiers render on top): points of interest are supplementary
      // background reading, so they sit below the actual logistics pins
      // (transport/activity/dining), with lodging -- the biggest, most
      // prominent icon -- always on top of everything.
      let tripMapZCounter = 0;
      const TRIP_MAP_Z_TIER = { poi: 0, transport: 1, activity: 2, dining: 2, "dining-suggested": 2, lodging: 3 };
      function tripMapZIndexOffset(kind) {
        const tier = TRIP_MAP_Z_TIER[kind];
        return (tier == null ? 2 : tier) * 1000000 + tripMapZCounter++;
      }

      // Track every marker by its stable key so a saved popup can be
      // reopened after a rebuild, and so we know which pin's popup is
      // currently open (for teardownTripMap() to save when leaving).
      const pinsByKey = {};
      function trackMarker(marker, key) {
        pinsByKey[key] = marker;
        marker.on("popupopen", () => {
          tripMapOpenPopupKey = key;
        });
        marker.on("popupclose", () => {
          if (tripMapOpenPopupKey === key) tripMapOpenPopupKey = null;
        });
      }

      const cityLayer = L.layerGroup();
      cityPoints.forEach((p) => {
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon("lodging", 30), zIndexOffset: tripMapZIndexOffset("lodging") });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        popupEl.innerHTML = `
          <div class="tmp-title">${tripMapDotHtml("lodging")}${p.location}</div>
          <div class="tmp-sub">${p.name}</div>
        `;
        const zoomBtn = document.createElement("button");
        zoomBtn.type = "button";
        zoomBtn.className = "tmp-goto";
        zoomBtn.textContent = "Zoom in →";
        zoomBtn.addEventListener("click", () => {
          // Fit to the city plus anything within ~60km of it, so a spread-out
          // day trip (e.g. Voss's Myrdal/Flåm/Gudvangen loop) lands at a zoom
          // that shows the whole route, not just the lodging's own block.
          const nearby = [...detailPoints, ...hubPoints].filter(
            (n) => kmBetween(p.lat, p.lon, n.lat, n.lon) <= 60
          );
          if (nearby.length) {
            const bounds = L.latLngBounds([[p.lat, p.lon], ...nearby.map((n) => [n.lat, n.lon])]);
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 15, duration: 0.6 });
          } else {
            map.flyTo([p.lat, p.lon], 14, { duration: 0.6 });
          }
        });
        popupEl.appendChild(zoomBtn);
        appendTransitVisitRows(popupEl, p.transitVisits, goToDay);
        marker.bindPopup(popupEl);
        trackMarker(marker, p.key);
        cityLayer.addLayer(marker);
      });
      cityLayer.addTo(map);

      const detailLayer = L.layerGroup();
      detailPoints.forEach((p) => {
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon(p.kind, 16), zIndexOffset: tripMapZIndexOffset(p.kind) });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        popupEl.innerHTML = `
          <div class="tmp-eyebrow">${mapPopupDayLabel(p.dayIndex)}${p.time ? " · " + p.time : ""}</div>
          <div class="tmp-title">${tripMapDotHtml(p.kind)}${p.label}</div>
        `;
        const gotoBtn = document.createElement("button");
        gotoBtn.type = "button";
        gotoBtn.className = "tmp-goto";
        gotoBtn.textContent = `Go to Day ${p.dayNumber} →`;
        gotoBtn.addEventListener("click", () => goToDay(p.dayIndex, p.num));
        popupEl.appendChild(gotoBtn);
        appendTransitVisitRows(popupEl, p.transitVisits, goToDay);
        marker.bindPopup(popupEl);
        trackMarker(marker, p.key);
        detailLayer.addLayer(marker);
      });

      const hubLayer = L.layerGroup();
      hubPoints.forEach((p) => {
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon(p.kind, p.kind === "activity" ? 16 : 14), zIndexOffset: tripMapZIndexOffset(p.kind) });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        const title = document.createElement("div");
        title.className = "tmp-title";
        title.innerHTML = tripMapDotHtml(p.kind) + p.name;
        popupEl.appendChild(title);
        appendVisitRows(popupEl, p.visits, goToDay);
        marker.bindPopup(popupEl);
        trackMarker(marker, p.key);
        hubLayer.addLayer(marker);
      });

      const poiLayer = L.layerGroup();
      poiPoints.forEach((p) => {
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon("poi", 16), zIndexOffset: tripMapZIndexOffset("poi") });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        const title = document.createElement("div");
        title.className = "tmp-title";
        title.innerHTML = tripMapDotHtml("poi") + p.name;
        popupEl.appendChild(title);
        const sub = document.createElement("div");
        sub.className = "tmp-sub";
        sub.textContent = p.category;
        popupEl.appendChild(sub);
        const learnBtn = document.createElement("button");
        learnBtn.type = "button";
        learnBtn.className = "tmp-goto";
        learnBtn.textContent = "Learn more →";
        learnBtn.addEventListener("click", () => {
          window.scrollTo(0, 0);
          state.view = "wiki";
          state.wikiEntryId = p.id;
          render();
        });
        popupEl.appendChild(learnBtn);
        marker.bindPopup(popupEl);
        trackMarker(marker, p.key);
        poiLayer.addLayer(marker);
      });

      function updateDetailVisibility() {
        const shouldShow = map.getZoom() >= TRIP_MAP_DETAIL_MIN_ZOOM;
        [detailLayer, hubLayer, poiLayer].forEach((layer) => {
          const isShown = map.hasLayer(layer);
          if (shouldShow && !isShown) layer.addTo(map);
          else if (!shouldShow && isShown) map.removeLayer(layer);
        });
      }
      map.on("zoomend", updateDetailVisibility);

      if (tripMapPersisted) {
        map.setView(tripMapPersisted.center, tripMapPersisted.zoom, { animate: false });
        updateDetailVisibility();
        const savedPin = tripMapPersisted.openPopupKey && pinsByKey[tripMapPersisted.openPopupKey];
        if (savedPin) savedPin.openPopup();
      } else {
        const bounds = L.latLngBounds(cityPoints.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds, { padding: [30, 30] });
        updateDetailVisibility();
      }
    });

    return container;
  }

  // ---------------- Tickets view ----------------
  // Static site, no server -- there's no way to list assets/tickets/ at
  // runtime, so the file list is hand-maintained here. Each filename
  // encodes its own date/time: "DD-MM-YYYY[ H(H)-MM] Description.ext"
  // (time is optional; hour may be 1 or 2 digits, e.g. "8-34" or "14-23").
  const TICKET_FILES = [
  "01-08-2026 14-23 Oslo S - Voss.pdf",
  "01-08-2026 Taxi VossTaxi Booking.pdf",
  "02-08-2026 07-50 Taxi VossTaxi Booking.pdf",
  "02-08-2026 08-25 Voss - Mydral.pdf",
  "02-08-2026 09-30 Mydral - Flam.pdf",
  "02-08-2026 12-00 Nærøyfjord cruise Flåm → Gudvangen Ticket.pdf",
  "02-08-2026 12-00 Nærøyfjord cruise Flåm → Gudvangen.pdf",
  "02-08-2026 15-15 Flam Gudvangen Shuttle single ticket.pdf",
  "02-08-2026 15-15 Flam Gudvangen Shuttle tickets.pdf",
  "02-08-2026 15-15 Gudvangen - Flam Shuttle.pdf",
  "02-08-2026 16-00 Flam - Mydral.pdf",
  "02-08-2026 17-04 Mydral - Voss.pdf",
  "03-08-2026 12-05 Voss - Bergen.pdf",
  "04-08-2026 Fløibanen funicular.pdf",
  "06-08-2026 04-30 Bergen Airport Taxi Receipt.pdf",
  "22-07-2026 12-30 Park 2 Jet Parking.pdf",
  "23-07-2026 15-35 Taxi Stockholm - Arlanda to Stockholm.pdf",
  "24-07-2026 14-00 The Nordic Food Walk.pdf",
  "25-07-2026 Skansen Voucher Feb 7 2026.pdf",
  "26-07-2026 09-45 Stromma Cruise details.pdf",
  "26-07-2026 09-45 Stromma Cruise.pdf",
  "27-07-2026 07-41 Stockholm C - Mora.pdf",
  "27-07-2026 11-00 Taxi Stockholm - Munkbron 15 Stockholm to Stockholm Centralstation v2.pdf",
  "28-07-2026 13-23 Mora resecentrum to Granasgatu Nusnäs.jpg",
  "28-07-2026 16-12 Granasgatu Nusnäs to Mora resecentrum.jpg",
  "28-07-2026 Nils Olsson.pdf",
  "29-07-2026 13-05 Mora - Karlstad Central.pdf",
  "30-07-2026 8-34 Karlstad Central – Oslo S.pdf"
];

  function parseTicketFilename(filename) {
    const m = filename.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2})-(\d{2}))?\s+(.+)\.(pdf|jpe?g)$/i);
    if (!m) return null;
    const [, dd, mm, yyyy, hh, min, description, ext] = m;
    return {
      filename,
      date: `${yyyy}-${mm}-${dd}`,
      time24: hh != null ? `${hh.padStart(2, "0")}:${min}` : null,
      description,
      ext: ext.toLowerCase()
    };
  }

  function formatTicketTime(time24) {
    const [hStr, min] = time24.split(":");
    const h = parseInt(hStr, 10);
    const period = h >= 12 ? "PM" : "AM";
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${min} ${period}`;
  }

  // Grouped by ISO date (matches day.date), each day's tickets sorted with
  // no-time tickets first, then chronologically by time.
  const TICKETS_BY_DATE = {};
  TICKET_FILES.forEach((filename) => {
    const t = parseTicketFilename(filename);
    if (!t) return; // a filename that doesn't match the naming convention
    if (!TICKETS_BY_DATE[t.date]) TICKETS_BY_DATE[t.date] = [];
    TICKETS_BY_DATE[t.date].push(t);
  });
  Object.values(TICKETS_BY_DATE).forEach((tickets) => {
    tickets.sort((a, b) => {
      if (!!a.time24 !== !!b.time24) return a.time24 ? 1 : -1;
      if (a.time24 && b.time24) return a.time24.localeCompare(b.time24);
      return 0;
    });
  });

  function ticketFileUrl(filename) {
    return "assets/tickets/" + encodeURIComponent(filename);
  }

  function renderTicketsView() {
    // state.ticketFile is handled directly in render() as a full-screen
    // takeover, so this only ever needs to pick between the two list
    // levels.
    return state.ticketsDayIndex == null ? renderTicketsDayList() : renderTicketsDayDetail(state.ticketsDayIndex);
  }

  function renderTicketsDayList() {
    const container = document.createElement("div");
    container.className = "tickets-view";

    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Tickets by day";
    container.appendChild(label);

    const list = document.createElement("div");
    list.className = "tickets-day-list";
    DAYS.forEach((day, i) => {
      const tickets = TICKETS_BY_DATE[day.date] || [];
      const row = document.createElement("button");
      row.type = "button";
      row.className = "tickets-day-row";
      const title = day.title.split("—").slice(1).join("—").trim() || day.title;
      row.innerHTML = `
        <span class="tdr-flag" aria-hidden="true">${countryFlag(day.day_number)}</span>
        <span class="tdr-num">${day.day_number}</span>
        <span class="tdr-body">
          <span class="tdr-date">${day.weekday}, ${fmtDateLabel(day)}</span>
          <span class="tdr-title">${title}</span>
        </span>
        <span class="tdr-count">${tickets.length ? tickets.length : "–"}</span>
      `;
      row.addEventListener("click", () => {
        window.scrollTo(0, 0);
        state.ticketsDayIndex = i;
        render();
      });
      list.appendChild(row);
    });
    container.appendChild(list);
    return container;
  }

  function renderTicketsDayDetail(dayIndex) {
    const day = DAYS[dayIndex];
    const container = document.createElement("div");
    container.className = "tickets-view";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "tickets-back";
    backBtn.textContent = "‹ All days";
    backBtn.addEventListener("click", () => {
      window.scrollTo(0, 0);
      state.ticketsDayIndex = null;
      render();
    });
    container.appendChild(backBtn);

    const head = document.createElement("div");
    head.className = "day-head";
    head.innerHTML = `
      <p class="day-eyebrow">Day ${day.day_number} of ${DAYS.length} · ${day.weekday}, ${fmtDateLabel(day)}</p>
      <h1 class="day-title">${day.title.split("—").slice(1).join("—").trim() || day.title}</h1>
    `;
    container.appendChild(head);

    const tickets = TICKETS_BY_DATE[day.date] || [];
    if (!tickets.length) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "No tickets for this day.";
      container.appendChild(note);
      return container;
    }

    const list = document.createElement("div");
    list.className = "ticket-list";
    tickets.forEach((t) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "ticket-row";
      const icon = t.ext === "jpg" || t.ext === "jpeg" ? "🖼️" : "📄";
      const label = t.time24 ? `${t.description} - ${formatTicketTime(t.time24)}` : t.description;
      row.innerHTML = `<span class="ticket-icon">${icon}</span><span class="ticket-label">${label}</span>`;
      row.addEventListener("click", () => {
        window.scrollTo(0, 0);
        state.ticketFile = t;
        render();
      });
      list.appendChild(row);
    });
    container.appendChild(list);
    return container;
  }

  // Shown inline within the app (not a real navigation) so there's no
  // browser-back/history confusion, and app.js/styles.css never unload --
  // a plain <a href="...pdf"> navigating away was losing all in-app state
  // and even visual styling when the user hit back to return. PDFs render
  // via an <embed> (see the fuller reasoning below); the two .jpg tickets
  // via a plain <img>, relying on the page's own native pinch-zoom (the
  // viewport meta tag doesn't restrict scaling).
  // Ticket files downloaded ahead of time (see downloadToIdb()
  // below) live in IndexedDB, not Cache Storage -- offline viewing reads
  // the blob back and creates a local blob: URL rather than making a
  // network request the service worker would need to intercept and serve
  // correctly. Only one of these is ever "current" at a time; revoking
  // the previous one whenever a new one is created (or the view is left)
  // keeps this from accumulating unreleased blob: URLs over a session.
  let currentTicketObjectUrl = null;
  function revokeCurrentTicketObjectUrl() {
    if (currentTicketObjectUrl) {
      URL.revokeObjectURL(currentTicketObjectUrl);
      currentTicketObjectUrl = null;
    }
  }

  function renderTicketFileView(t) {
    const container = document.createElement("div");
    container.className = "ticket-file-view";

    const header = document.createElement("div");
    header.className = "ticket-file-header";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "ticket-file-back";
    backBtn.textContent = "‹ Back";
    backBtn.setAttribute("aria-label", "Back to tickets");
    backBtn.addEventListener("click", () => {
      state.ticketFile = null;
      render();
    });
    header.appendChild(backBtn);

    const label = document.createElement("div");
    label.className = "ticket-file-label";
    label.textContent = t.time24 ? `${t.description} - ${formatTicketTime(t.time24)}` : t.description;
    header.appendChild(label);

    const networkUrl = ticketFileUrl(t.filename);
    const openLink = document.createElement("a");
    openLink.className = "ticket-file-openlink";
    openLink.href = networkUrl;
    openLink.target = "_blank";
    openLink.rel = "noopener";
    openLink.textContent = "↗";
    openLink.setAttribute("aria-label", "Open in new tab");
    header.appendChild(openLink);

    container.appendChild(header);

    // The frame fills all remaining screen space (flex: 1 in the CSS) so
    // the file itself -- not the surrounding chrome -- is what a touch
    // drag lands on.
    const frame = document.createElement("div");
    frame.className = "ticket-file-frame";
    let mediaEl;
    if (t.ext === "jpg" || t.ext === "jpeg") {
      // A scrollable wrapper (rather than the image alone) so a tall/wide
      // image can be panned by dragging even before zooming in; native
      // pinch-zoom (the viewport meta tag doesn't restrict scaling) layers
      // on top of that for reading small text/QR codes.
      const wrap = document.createElement("div");
      wrap.className = "ticket-file-image-wrap";
      mediaEl = document.createElement("img");
      mediaEl.className = "ticket-file-image";
      mediaEl.alt = t.description;
      wrap.appendChild(mediaEl);
      frame.appendChild(wrap);
    } else {
      // <embed> rather than <iframe> -- in an installed/standalone PWA on
      // iOS, a PDF inside an <iframe> often only gets a stripped-down,
      // single-page preview from WKWebView instead of the full multi-page
      // viewer a real top-level navigation to the same PDF gets.
      mediaEl = document.createElement("embed");
      mediaEl.className = "ticket-file-pdf";
      mediaEl.type = "application/pdf";
      frame.appendChild(mediaEl);
    }
    container.appendChild(frame);

    // src is set below, once it's known whether a downloaded blob is
    // available -- not synchronously here, since idbKeyval.get() is
    // always async.
    revokeCurrentTicketObjectUrl();
    if (window.idbKeyval) {
      idbKeyval.get(networkUrl).then((blob) => {
        // The user may have navigated to a different ticket (or away
        // entirely) before this resolved -- state.ticketFile is a stable
        // reference into the same TICKETS_BY_DATE objects built once at
        // module load, so this comparison is reliable. Setting .src on
        // this render's now-detached mediaEl would be harmless either
        // way, but skipping it also avoids creating/leaking an object
        // URL for a ticket that's no longer being shown.
        if (state.ticketFile !== t) return;
        if (blob) {
          currentTicketObjectUrl = URL.createObjectURL(blob);
          mediaEl.src = currentTicketObjectUrl;
          openLink.href = currentTicketObjectUrl;
        } else {
          mediaEl.src = networkUrl;
        }
      }).catch(() => { mediaEl.src = networkUrl; });
    } else {
      mediaEl.src = networkUrl;
    }

    return container;
  }

  // ---------------- Wiki (points of interest) ----------------
  // POI_LIST/POI_BY_ID are defined near the top of the file (see comment
  // there) since buildTripMapPoints() needs them earlier than this section
  // runs.

  function escapeHtml(text) {
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Minimal markdown -> HTML: content/summary/fun_fact carry literal
  // **bold**/*italic* markdown syntax in some entries (per the data's own
  // documentation) rather than real formatting. HTML-escape first (this is
  // long-form prose, not curated tag-free text like the rest of the app's
  // data -- a stray "<" or "&" in an entry needs to render literally, not
  // break the markup), then convert just bold/italic and paragraph breaks.
  function mdLiteToHtml(text) {
    const escaped = escapeHtml(text);
    const emphasized = escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return emphasized
      .split(/\n\s*\n/)
      .map((para) => `<p>${para.trim().replace(/\n/g, "<br>")}</p>`)
      .join("");
  }

  // Cross-references: any other POI's name mentioned verbatim in an
  // entry's long-form `content` essay becomes an in-place link to that
  // entry, with a "See also" list at the bottom summarizing every entry
  // referenced that way. One combined regex covers every POI name, tried
  // longest-first at each position (so e.g. "Bergen Railway
  // (Bergensbanen)" wins over the plainer "Bergen" where both would
  // otherwise match at the same spot) -- built once at module load, not
  // per render, since POI_LIST never changes at runtime. Case-sensitive
  // on purpose: entry names are proper nouns that always appear
  // capitalized in this data, and case-insensitive matching would risk
  // false positives on any name that doubles as an ordinary word.
  const POI_REF_NAMES_SORTED = POI_LIST.slice().sort((a, b) => b.name.length - a.name.length);
  const POI_REF_BY_NAME = new Map(POI_LIST.map((p) => [p.name, p]));
  const POI_REF_REGEX = POI_REF_NAMES_SORTED.length
    ? new RegExp(
        "(?<![\\p{L}\\p{N}])(?:" +
          POI_REF_NAMES_SORTED.map((p) => p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") +
          ")(?![\\p{L}\\p{N}])",
        "gu"
      )
    : null;

  // Replaces the *first* mention of each other-POI's name in `text` with
  // a "@@POIREF:<id>@@" marker -- plain letters/digits/@/: so it passes
  // through mdLiteToHtml's HTML-escaping/markdown pipeline unscathed --
  // and returns the marked-up text plus the ordered, de-duplicated list
  // of POIs referenced, for the caller to substitute real <a> tags in
  // afterward and build a "See also" list. Only the first mention per
  // target is linked (later repeats of the same name are left as plain
  // text) so a page that says "Bergen" ten times doesn't turn ten of them
  // blue; every *distinct* entry referenced still gets linked once and
  // still shows up in "See also". Skips the entry's own name so it never
  // links to itself.
  function markPoiReferences(text, currentId) {
    if (!POI_REF_REGEX) return { text, refs: [] };
    const refs = [];
    const linked = new Set();
    const marked = text.replace(POI_REF_REGEX, (match) => {
      const poi = POI_REF_BY_NAME.get(match);
      if (!poi || poi.id === currentId || linked.has(poi.id)) return match;
      linked.add(poi.id);
      refs.push(poi);
      return `@@POIREF:${poi.id}@@`;
    });
    return { text: marked, refs };
  }

  // Runs an entry's content through the reference-marking + markdown-lite
  // pipeline, then resolves the markers into real links -- done in this
  // order (mark plain-text references -> escape/markdown -> resolve
  // markers) rather than linkifying the final HTML directly, so a POI
  // name is never accidentally matched inside an HTML tag, and the
  // eventual <a> never gets torn in half by a bold/italic/paragraph
  // boundary landing mid-name.
  function linkifyPoiContent(poi) {
    // Only the marked-up text is needed here -- markPoiReferences() also
    // returns the ordered outgoing-refs list, but the caller builds "See
    // also" from seeAlsoRefsFor() instead (outgoing + incoming), so that
    // list would just go unused if kept here too.
    const { text: marked } = markPoiReferences(poi.content, poi.id);
    return mdLiteToHtml(marked).replace(/@@POIREF:([a-z0-9_]+)@@/g, (whole, id) => {
      const target = POI_BY_ID[id];
      if (!target) return "";
      return `<a href="#" class="wiki-inline-ref" data-poi-id="${id}">${escapeHtml(target.name)}</a>`;
    });
  }

  // "See also" is meant to be one-way-reference-proof: if entry A's
  // content mentions entry B but B's content never happens to mention A
  // back, B's own "See also" should still list A -- otherwise a
  // one-directional in-prose mention (common; e.g. plenty of entries
  // mention "Bergen" while Bergen's own essay obviously can't organically
  // mention all of them back) would make the backlink invisible from the
  // referenced entry's page. So this is precomputed once for the *whole*
  // POI set at module load: POI_OUTGOING_REFS is exactly what
  // markPoiReferences() finds per entry (same as the in-body links), and
  // POI_INCOMING_REFS is that graph inverted -- every entry that
  // references a given entry. seeAlsoRefsFor() unions both, deduplicated,
  // outgoing first.
  const POI_OUTGOING_REFS = new Map(
    POI_LIST.map((p) => [p.id, markPoiReferences(p.content, p.id).refs])
  );
  const POI_INCOMING_REFS = new Map(POI_LIST.map((p) => [p.id, []]));
  POI_OUTGOING_REFS.forEach((refs, fromId) => {
    refs.forEach((toPoi) => {
      POI_INCOMING_REFS.get(toPoi.id).push(POI_BY_ID[fromId]);
    });
  });

  function seeAlsoRefsFor(poi) {
    const seen = new Set([poi.id]);
    const combined = [];
    [...POI_OUTGOING_REFS.get(poi.id), ...POI_INCOMING_REFS.get(poi.id)].forEach((p) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      combined.push(p);
    });
    return combined;
  }

  // Indexes name/category/summary/fun_fact *and* the full long-form
  // content essay -- broader recall than the Day/Dining search (which
  // deliberately skips full-length text), so e.g. searching "viking"
  // surfaces entries that discuss Vikings even if it's not in their title
  // or summary.
  const POI_SEARCH_INDEX = POI_LIST.map((p) => {
    const raw = [p.name, p.category, p.summary, p.fun_fact, p.content].filter(Boolean).join(" ");
    return { poi: p, haystack: normalizeForSearch(raw), haystackCollapsed: collapseForSearch(raw) };
  });

  function renderWikiView() {
    if (state.wikiEntryId) {
      const poi = POI_BY_ID[state.wikiEntryId];
      if (poi) return renderWikiEntryView(poi);
    }
    return renderWikiDirectory();
  }

  function renderWikiDirectory() {
    const container = document.createElement("div");
    container.className = "wiki-view";

    const input = document.createElement("input");
    input.className = "search-input wiki-search-input";
    input.type = "search";
    input.placeholder = "Search points of interest…";
    container.appendChild(input);

    const list = document.createElement("div");
    list.className = "wiki-list";
    container.appendChild(list);

    function openEntry(poi) {
      window.scrollTo(0, 0);
      state.wikiEntryId = poi.id;
      render();
    }

    function renderRows(pois) {
      list.innerHTML = "";
      if (!pois.length) {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = "No matches.";
        list.appendChild(note);
        return;
      }
      pois.forEach((poi) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "wiki-row";
        row.innerHTML = `
          <span class="tml-dot" style="background:${categoryMapColor("poi")}"></span>
          <span class="wiki-row-body">
            <span class="wiki-row-name">${poi.name}</span>
            <span class="wiki-row-category">${poi.category} · ${poi.country}</span>
          </span>
        `;
        row.addEventListener("click", () => openEntry(poi));
        list.appendChild(row);
      });
    }

    input.addEventListener("input", () => {
      const q = input.value.trim();
      if (!q) {
        renderRows(POI_LIST);
        return;
      }
      const query = normalizeForSearch(q);
      const queryCollapsed = collapseForSearch(q);
      const matches = POI_SEARCH_INDEX.filter(
        (e) => e.haystack.includes(query) || (queryCollapsed && e.haystackCollapsed.includes(queryCollapsed))
      ).map((e) => e.poi);
      renderRows(matches);
    });

    renderRows(POI_LIST);
    return container;
  }

  function renderWikiEntryView(poi) {
    const container = document.createElement("div");
    container.className = "wiki-view";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "tickets-back";
    backBtn.textContent = "‹ All entries";
    backBtn.addEventListener("click", () => {
      window.scrollTo(0, 0);
      state.wikiEntryId = null;
      render();
    });
    container.appendChild(backBtn);

    const head = document.createElement("div");
    head.className = "wiki-entry-head";
    head.innerHTML = `
      <p class="wiki-entry-eyebrow">
        <span class="tml-dot" style="background:${categoryMapColor("poi")}"></span>
        ${poi.category} · ${poi.country}
      </p>
      <h1 class="wiki-entry-title">${poi.name}</h1>
    `;
    container.appendChild(head);

    const pinRef = TRIP_MAP_POINTS.poiPinById[poi.id];
    if (pinRef) {
      const mapBtn = document.createElement("button");
      mapBtn.type = "button";
      mapBtn.className = "leg-map-link wiki-map-btn";
      mapBtn.textContent = "🗺️ View on map";
      mapBtn.addEventListener("click", () => goToMapPin(pinRef.key, pinRef.lat, pinRef.lon));
      container.appendChild(mapBtn);
    }

    function openReferencedEntry(id) {
      const target = POI_BY_ID[id];
      if (!target) return;
      window.scrollTo(0, 0);
      state.wikiEntryId = target.id;
      render();
    }

    const bodyHtml = linkifyPoiContent(poi);
    const seeAlsoRefs = seeAlsoRefsFor(poi);

    const body = document.createElement("div");
    body.className = "wiki-entry-body";
    body.innerHTML = bodyHtml;
    // Event delegation, not a per-link listener -- the links themselves
    // are built as an HTML string above (innerHTML), not individual DOM
    // nodes we already have references to.
    body.addEventListener("click", (e) => {
      const link = e.target.closest(".wiki-inline-ref");
      if (!link) return;
      e.preventDefault();
      openReferencedEntry(link.dataset.poiId);
    });
    container.appendChild(body);

    if (poi.fun_fact) {
      const fact = document.createElement("div");
      fact.className = "wiki-fun-fact";
      fact.innerHTML = `<span class="wiki-fun-fact-label">Fun fact</span>${mdLiteToHtml(poi.fun_fact)}`;
      container.appendChild(fact);
    }

    if (seeAlsoRefs.length) {
      const seeAlso = document.createElement("div");
      seeAlso.className = "wiki-see-also";
      seeAlso.innerHTML = `<span class="wiki-see-also-label">See also</span>`;
      seeAlsoRefs.forEach((ref) => {
        const link = document.createElement("button");
        link.type = "button";
        link.className = "wiki-see-also-link";
        link.innerHTML = `<span class="tml-dot" style="background:${categoryMapColor("poi")}"></span>${ref.name}`;
        link.addEventListener("click", () => openReferencedEntry(ref.id));
        seeAlso.appendChild(link);
      });
      container.appendChild(seeAlso);
    }

    if (poi.sources && poi.sources.length) {
      const sources = document.createElement("div");
      sources.className = "wiki-sources";
      sources.textContent = "Sources: " + poi.sources.join(", ");
      container.appendChild(sources);
    }

    return container;
  }

  // ---------------- Checklist view ----------------
  // One row of the Checklist tab's "Offline data" section: a title, a
  // status line, a progress bar, and a "Download" button. On mount it
  // checks (via checkFn) how much of `urls` is *actually* already
  // downloaded, rather than trusting a localStorage "done" flag that this
  // whole feature exists because it can't be fully trusted on its own
  // (see downloadToIdb()'s doc comment). Tapping the button always
  // re-runs the full download regardless of that flag -- the point of a
  // manual "force" trigger -- with live progress, and updates the flag on
  // completion so the silent background prefetch doesn't redundantly
  // re-run next load.
  // downloadFn(urls, concurrency, onProgress, onDone) and checkFn(urls,
  // callback) are passed in explicitly rather than hardcoded, even though
  // both tickets and map tiles currently go through the same
  // downloadToIdb()/countCachedIdb() (IndexedDB) -- this row doesn't need
  // to know or care which storage backend a given resource actually uses
  // underneath, and didn't for most of this feature's history (tickets
  // and tiles used to be on different backends). See CLAUDE.md's "Offline
  // ticket downloads"/"Offline map tile downloads" notes for why both
  // ended up on IndexedDB.
  function renderOfflineDataRow(title, urls, concurrency, prefetchKey, prefetchVersion, downloadFn, checkFn) {
    const row = document.createElement("div");
    row.className = "offline-data-row";

    const head = document.createElement("div");
    head.className = "offline-data-head";
    const titleEl = document.createElement("span");
    titleEl.className = "offline-data-title";
    titleEl.textContent = title;
    const statusEl = document.createElement("span");
    statusEl.className = "offline-data-status";
    statusEl.textContent = "Checking…";
    head.appendChild(titleEl);
    head.appendChild(statusEl);
    row.appendChild(head);

    const track = document.createElement("div");
    track.className = "offline-data-track";
    const fill = document.createElement("div");
    fill.className = "offline-data-fill";
    track.appendChild(fill);
    row.appendChild(track);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "offline-data-btn";
    btn.textContent = "Download";
    row.appendChild(btn);

    function setProgress(done, total, label) {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      fill.style.width = pct + "%";
      statusEl.textContent = label || `${done} / ${total} (${pct}%)`;
    }

    function onProgress(done, total) {
      btn.disabled = true;
      setProgress(done, total);
    }
    function onDone(succeeded, total) {
      try { localStorage.setItem(prefetchKey, prefetchVersion); } catch (e) {}
      btn.disabled = false;
      setProgress(succeeded, total, succeeded === total
        ? `✓ All ${total} downloaded`
        : `${succeeded} / ${total} — tap Download to retry the rest`);
    }

    btn.addEventListener("click", () => {
      // Checked here too (not just inside downloadToIdb()) so the button
      // can show a clear, specific message immediately -- rather than
      // attempting anything first and only learning after the fact that
      // nothing could have worked.
      if (navigator.onLine === false) {
        setProgress(0, urls.length, "You're offline — connect to WiFi or cellular data, then tap Download");
        return;
      }
      btn.disabled = true;
      setProgress(0, urls.length);
      // startDedupedDownload (not downloadFn directly) so a tap here
      // merges into an already-running download
      // for this same resource (the silent background prefetch, or a
      // still-in-flight run from before this row was last rebuilt) rather
      // than starting a second, independent run racing the first -- see
      // its doc comment for why that used to look like the download
      // restarting partway through.
      startDedupedDownload(prefetchKey, urls.length, (progress, done) => {
        downloadFn(urls, concurrency, progress, done);
      }, onProgress, onDone);
    });

    // If a download for this resource is already running (the silent
    // background prefetch, most commonly), reflect that immediately
    // instead of showing a "Checking…" cached-state snapshot that would
    // just be superseded a moment later anyway.
    if (!subscribeToActiveDownload(prefetchKey, onProgress, onDone)) {
      checkFn(urls, (cached, total) => setProgress(cached, total));
    }

    return row;
  }

  // navigator.storage.estimate()'s reported usage figure is *not*
  // trustworthy ground truth on its own -- it's a browser-computed
  // estimate (disk accounting/compression/rounding can all cause it to
  // diverge from real bytes actually stored, and this has been observed
  // in practice on this app reporting numbers implausibly smaller than
  // the known size of what's actually downloaded, e.g. ticket files
  // alone total ~9MB, well above a reported total of "1.6MB"). Directly
  // summing the real byte size of every Blob actually sitting in
  // IndexedDB (via idbKeyval.entries()) is a second, independent number
  // that can't share whatever caused the browser's own estimate to be
  // wrong -- both are shown together so a large gap between them is
  // itself a visible, actionable signal rather than something only
  // discoverable by plugging into a Mac and using Safari's Web Inspector.
  function computeRealIdbUsage(callback) {
    if (!window.idbKeyval || !idbKeyval.entries) { callback(null); return; }
    idbKeyval.entries().then((entries) => {
      let bytes = 0;
      let count = 0;
      entries.forEach(([, value]) => {
        if (value && typeof value.size === "number") {
          bytes += value.size;
          count++;
        }
      });
      callback({ bytes, count });
    }).catch(() => callback(null));
  }

  // Support for navigator.storage.estimate() isn't universal, so this is
  // best-effort and simply omits itself if neither number is available.
  function renderStorageEstimateRow() {
    // Return null (rather than building a node and trying to .remove()
    // it later) when unsupported -- an element only has a parent to
    // remove itself from *after* the caller appends it, so calling
    // .remove() from inside this function, before that append ever
    // happens, would silently do nothing and leave a stuck "Checking
    // storage…" placeholder visible forever.
    if ((!navigator.storage || !navigator.storage.estimate) && !window.idbKeyval) return null;
    const row = document.createElement("div");
    row.className = "offline-data-storage";
    row.textContent = "Checking storage…";

    let estimateText = null;
    let realText = null;
    function render() {
      const parts = [estimateText, realText].filter(Boolean);
      row.textContent = parts.length ? parts.join(" — ") : "";
      if (!parts.length) row.remove();
    }

    if (navigator.storage && navigator.storage.estimate) {
      navigator.storage.estimate().then((est) => {
        const usedMb = (est.usage / (1024 * 1024)).toFixed(1);
        const quotaMb = est.quota ? (est.quota / (1024 * 1024)).toFixed(0) : null;
        estimateText = quotaMb
          ? `Browser reports ${usedMb} MB of ~${quotaMb} MB available`
          : `Browser reports ${usedMb} MB used`;
        render();
      }).catch(() => { estimateText = null; render(); });
    }
    computeRealIdbUsage((real) => {
      if (real) {
        realText = `${(real.bytes / (1024 * 1024)).toFixed(1)} MB actually stored across ${real.count} downloaded file${real.count === 1 ? "" : "s"}`;
      }
      render();
    });

    return row;
  }

  // Still referenced by the "Clear cached data" button below -- must stay
  // in sync with sw.js's own RUNTIME_CACHE_NAME constant (no shared
  // module between the two files). Bulk downloads no longer write here
  // (both tickets and map tiles use IndexedDB via downloadToIdb()), but
  // the service worker's own opportunistic caching of anything fetched
  // outside a bulk download (e.g. a tile loaded from normal map-panning)
  // still uses this Cache Storage bucket, so clearing it out is still
  // part of a real "start fresh".
  const RUNTIME_CACHE_NAME = "rougeux-trip-runtime";

  function renderChecklistView() {
    const container = document.createElement("div");
    container.className = "checklist-view";

    const offlineLabel = document.createElement("div");
    offlineLabel.className = "section-label";
    offlineLabel.textContent = "Offline data";
    container.appendChild(offlineLabel);

    const offlineCard = document.createElement("div");
    offlineCard.className = "offline-data-card";
    offlineCard.appendChild(renderOfflineDataRow(
      "Tickets & vouchers", TICKET_FILES.map(ticketFileUrl), 3, TICKET_PREFETCH_KEY, TICKET_PREFETCH_VERSION,
      (urls, concurrency, onProgress, onDone) => downloadToIdb(urls, concurrency, null, onProgress, onDone),
      countCachedIdb
    ));
    offlineCard.appendChild(renderOfflineDataRow(
      // No crossOrigin option -- unlike tile.openstreetmap.org, Stadia
      // Maps' tile responses include CORS headers (see stadiaTileUrl()'s
      // doc comment), so a normal fetch() here gets a fully readable
      // response (real res.ok/Content-Length), the same as a same-origin
      // request. That also means no "no-cors"/opaque-response blindness,
      // so full byte-size verification applies to tiles the same way it
      // already does for tickets.
      "Map tiles (Sweden & Norway)", buildMapPrefetchUrls(), 3, MAP_PREFETCH_KEY, MAP_PREFETCH_VERSION,
      (urls, concurrency, onProgress, onDone) => downloadToIdb(urls, concurrency, null, onProgress, onDone),
      countCachedIdb
    ));
    const storageRow = renderStorageEstimateRow();
    if (storageRow) offlineCard.appendChild(storageRow);

    // A hard reset: clears every ticket and map tile blob from IndexedDB,
    // plus the RUNTIME_CACHE_NAME Cache Storage bucket the service
    // worker's own opportunistic caching still uses for anything not run
    // through a bulk download (e.g. a tile fetched just from normal
    // map-panning), plus both "done" flags -- so any bad/stale entry left
    // over from an earlier, broken write in this app's history can't keep
    // silently interfering with a fresh download. Existence/size checks
    // (see downloadToIdb()) catch a bad entry going forward, but this
    // clears out anything already sitting there from before those checks
    // existed. Cheap to recover from since everything here is just
    // re-downloaded from this same static site.
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "offline-data-clear-btn";
    clearBtn.textContent = "Clear cached data & start fresh";
    clearBtn.addEventListener("click", () => {
      if (!window.confirm("This deletes every cached ticket and map tile so they can be freshly re-downloaded. Continue?")) return;
      clearBtn.disabled = true;
      clearBtn.textContent = "Clearing…";
      Promise.all([
        caches.delete(RUNTIME_CACHE_NAME),
        window.idbKeyval ? idbKeyval.clear() : Promise.resolve()
      ]).then(() => {
        try {
          localStorage.removeItem(TICKET_PREFETCH_KEY);
          localStorage.removeItem(MAP_PREFETCH_KEY);
        } catch (e) {}
        render();
      });
    });
    offlineCard.appendChild(clearBtn);

    container.appendChild(offlineCard);

    const label = document.createElement("div");
    label.className = "section-label";
    label.textContent = "Open items";
    container.appendChild(label);

    (DATA.global_open_items || []).forEach((text, i) => {
      const key = "global-" + i;
      container.appendChild(renderChecklistItem(key, text, null));
    });

    const label2 = document.createElement("div");
    label2.className = "section-label";
    label2.textContent = "Flagged legs";
    container.appendChild(label2);

    let anyFlag = false;
    DAYS.forEach((day) => {
      day.legs.forEach((leg) => {
        if (leg.flag) {
          anyFlag = true;
          const key = "leg-" + leg.num;
          const text = leg.activity + (leg.detail ? " — " + leg.detail : "");
          container.appendChild(renderChecklistItem(key, text, `Day ${day.day_number} · ${fmtDateLabel(day)}`));
        }
      });
    });
    if (!anyFlag) {
      const note = document.createElement("div");
      note.className = "empty-note";
      note.textContent = "No flagged legs.";
      container.appendChild(note);
    }

    return container;
  }

  function renderChecklistItem(key, text, dayLabel) {
    const el = document.createElement("label");
    const checked = !!state.checks[key];
    el.className = "checklist-item" + (checked ? " checked" : "");
    el.innerHTML = `
      <input type="checkbox" ${checked ? "checked" : ""} />
      <div class="ci-text">${dayLabel ? `<span class="ci-day">${dayLabel}</span>` : ""}${text}</div>
    `;
    el.querySelector("input").addEventListener("change", (e) => {
      state.checks[key] = e.target.checked;
      saveChecks();
      el.classList.toggle("checked", e.target.checked);
    });
    return el;
  }

  // ---------------- Header / bottom nav ----------------
  // Persistent shell containers -- created once (ensureShell(), called
  // from render()) and never removed from the DOM again; render()
  // updates their *contents* in place instead of destroying and
  // rebuilding the whole tree on every navigation. This matters
  // specifically for the header: position:sticky needs the browser to
  // continuously track an element's position relative to its scrolling
  // ancestor, and recreating a brand-new sticky element on every
  // navigation meant that tracking had to be reestablished from scratch
  // each time -- visible as the header flashing into its normal (static,
  // in-document-flow) position for a frame before snapping back to
  // sticky, especially noticeable since it's the very first thing
  // painted after a navigation clears the page. The bottom nav
  // (position:fixed, not sticky) doesn't have that exact failure mode,
  // but is kept stable too for the same reason and so its buttons' click
  // listeners aren't needlessly torn down and re-attached on every
  // render. The main view content (Day/Map/Wiki/etc.) has no such state
  // to preserve, so it's still fully replaced each time -- see viewEl in
  // render() below.
  let headerEl = null;
  let bottomNavEl = null;
  let bottomNavButtons = null; // { day: <button>, map: <button>, ... }
  let viewEl = null;

  function ensureShell() {
    if (headerEl) return;
    headerEl = document.createElement("div");
    root.appendChild(headerEl);

    viewEl = document.createElement("div");
    root.appendChild(viewEl);

    bottomNavEl = document.createElement("div");
    bottomNavEl.className = "bottom-nav";
    bottomNavButtons = {};
    const items = [
      { key: "day", icon: "🗓️", label: "Day" },
      { key: "map", icon: "🗺️", label: "Map" },
      { key: "wiki", icon: "📖", label: "Wiki" },
      { key: "tickets", icon: "🎫", label: "Tickets" },
      { key: "search", icon: "🔍", label: "Search" },
      { key: "checklist", icon: "✓", label: "Checklist" }
    ];
    items.forEach((it) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerHTML = `<span class="bicon">${it.icon}</span><span>${it.label}</span>`;
      btn.addEventListener("click", () => {
        const wasDay = state.view === "day";
        // Scroll *before* tearing down/rebuilding the DOM wherever the
        // target is a fixed position (0,0) -- the old (still full-size)
        // content is still on screen at that point, so the jump is safe.
        // Restoring dayViewScrollY has to happen after render() instead,
        // since it needs the Day view's real (taller) content height to
        // exist first. Scrolling only after render() (the old approach)
        // meant a brief window where the new, often shorter, content
        // existed at the old scroll offset -- an out-of-bounds position
        // the browser would clamp, sometimes visibly (a flash) before
        // our own scrollTo(0,0) corrected it a moment later.
        if (it.key !== "day") {
          captureDayScrollIfLeaving();
          window.scrollTo(0, 0);
        }
        state.view = it.key;
        render();
        if (it.key === "day" && !wasDay) window.scrollTo(0, dayViewScrollY);
        // else: redundant click on the already-active Day tab -- leave
        // scroll exactly where it is rather than yanking to a stale value.
      });
      bottomNavButtons[it.key] = btn;
      bottomNavEl.appendChild(btn);
    });
    root.appendChild(bottomNavEl);
  }

  function updateHeader() {
    headerEl.className = "app-header";
    headerEl.innerHTML = `
      <div class="app-banner">
        <p class="app-title">${DATA.meta.family_name} Family Itinerary 🇸🇪<span class="app-title-flag-gap">🇳🇴</span></p>
        <p class="app-subtitle">${fmtFullDate(DATA.meta.start_date)} - ${fmtFullDate(DATA.meta.end_date)}</p>
      </div>
    `;
    if (state.view === "day") {
      headerEl.appendChild(renderDayNav());
    }
  }

  function updateBottomNav() {
    Object.keys(bottomNavButtons).forEach((key) => {
      bottomNavButtons[key].className = key === state.view ? "active" : "";
    });
  }

  // Scroll position within the Day view, captured whenever navigating away
  // from it (to Map or elsewhere) so returning to the *same* day restores
  // where you were instead of snapping back to the top. Every call site
  // that can leave Day view (bottom nav, a leg's "Map view" button) calls
  // this explicitly, immediately before it -- this used to be handled
  // generically inside render() itself instead (comparing state.view
  // against the previously-rendered view), but that broke once those
  // call sites started scrolling to (0,0) *before* calling render() (see
  // the comment in the bottom-nav click handler): by the time render()
  // ran, window.scrollY already read 0 from that scroll, so the capture
  // was recording 0 instead of the real prior position. Capturing here,
  // strictly before any scroll manipulation, is what makes it correct
  // again.
  let dayViewScrollY = 0;
  function captureDayScrollIfLeaving() {
    if (state.view === "day") dayViewScrollY = window.scrollY;
  }

  function render() {
    saveLastView(state.view);
    saveTicketsDayIndex(state.ticketsDayIndex);
    saveWikiEntryId(state.wikiEntryId);
    teardownTripMap();
    ensureShell();

    // Viewing a ticket file is a full-screen takeover -- no header or
    // bottom-nav, and the page itself can't scroll (matches the day-jump
    // sheet's overlay pattern). On mobile, a single-finger touch drag
    // defaults to scrolling whatever's the *outer* page rather than a
    // nested iframe/image, so anything else visibly on screen competes
    // for that gesture and the file ends up feeling clipped/unscrollable.
    // Making the file viewer the only thing on screen removes that
    // ambiguity entirely. headerEl/bottomNavEl are hidden (not removed)
    // rather than torn down, consistent with keeping them persistent
    // everywhere else.
    if (state.view === "tickets" && state.ticketFile) {
      document.body.style.overflow = "hidden";
      headerEl.style.display = "none";
      bottomNavEl.style.display = "none";
      viewEl.innerHTML = "";
      viewEl.appendChild(renderTicketFileView(state.ticketFile));
      return;
    }
    headerEl.style.display = "";
    bottomNavEl.style.display = "";
    document.body.style.overflow = "";

    updateHeader();

    viewEl.innerHTML = "";
    let view;
    if (state.view === "day") view = renderDayView();
    else if (state.view === "map") view = renderTripMapView();
    else if (state.view === "wiki") view = renderWikiView();
    else if (state.view === "tickets") view = renderTicketsView();
    else if (state.view === "search") view = renderSearchView();
    else view = renderChecklistView();
    viewEl.appendChild(view);

    updateBottomNav();
  }

  // ---------------- Map tile prefetch (offline-ready without browsing first) ----------------
  // Opportunistic per-tile caching (see sw.js's fetch handler, which still
  // covers tiles fetched by ordinary map-panning into Cache Storage) only
  // saves a tile once a user has actually scrolled it into view -- fine
  // for casual browsing, but means the map goes blank in airplane mode
  // anywhere not already visited. This proactively fetches (and, via
  // downloadToIdb(), stores into IndexedDB -- see its doc comment for why
  // tiles are on IndexedDB rather than Cache Storage) tiles for the views
  // a user hits without any panning.
  //
  // Covers two zoom ranges, stitched together so there's no gap a normal
  // zoom gesture could land in and hit blank tiles:
  //  - MAP_PREFETCH_OVERVIEW_ZOOMS: the *whole trip's* bounding box, at
  //    zoom levels low enough that one fetch covers every city at once
  //    cheaply (tile count roughly doubles per zoom level here, and
  //    explodes well before city-block detail, so this only goes up to
  //    zoom 9 -- beyond that the per-city viewport approach below is far
  //    cheaper for the same detail level).
  //  - MAP_PREFETCH_CITY_VIEWPORT_ZOOMS: each lodging city individually,
  //    at a *fixed pixel viewport* (not a growing geographic bounds), so
  //    tile count stays roughly constant per zoom level regardless of
  //    how far zoomed in -- covers from where the overview leaves off up
  //    through past the per-day map's own default zoom, i.e. the entire
  //    range a user would naturally pass through zooming from "see the
  //    whole trip" in to "see this street."
  // Together ~4,800 tiles as of the current lodging list -- deliberately
  // still bounded to the actual trip region across its practical zoom
  // range, not "all of Scandinavia at every zoom level."
  // v7: both zoom ranges extended by one level, from 17 up through 18 --
  // 18 is also the trip-wide Leaflet map's own maxZoom (see
  // renderTripMapView()), so a user pinch-zooming or tapping "+" all the
  // way in was reaching a zoom level nothing had ever prefetched, which
  // is what surfaced as "no data at the maximum zoom level." Deliberately
  // *not* jumping straight to Stadia's true native max of zoom 20 here --
  // that was considered (verified real, distinct tile content exists all
  // the way to 20) but rejected: Leaflet's zoom controls step one level
  // at a time, so covering only 17 and 20 while skipping 18-19 would mean
  // the map goes visibly blank at those intermediate steps before
  // reappearing at 20, and covering *every* level up to 20 for all
  // secondary points nearly triples the total tile count, uncomfortably
  // close to Stadia's 100MB/device offline-caching allowance. One more
  // level (18) for both the lodging and secondary layers keeps every
  // step of a normal zoom gesture covered without either problem.
  // Bumped so an existing "done" flag from the old, narrower range
  // doesn't suppress a real run under this one.
  const MAP_PREFETCH_VERSION = "v7"; // bump to force a re-run (e.g. if lodging locations change, or this coverage is widened further)
  const MAP_PREFETCH_KEY = "rougeux_map_tiles_prefetched";
  const MAP_PREFETCH_OVERVIEW_ZOOMS = [4, 5, 6, 7, 8, 9];
  const MAP_PREFETCH_CITY_VIEWPORT_ZOOMS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  // Bigger than the 640x320 per-day map canvas -- the trip-wide Leaflet
  // map's "fly into this city" view (see TRIP_MAP_DETAIL_MIN_ZOOM) can
  // fill a full-screen viewport, so this covers that too, not just the
  // per-day map card.
  const MAP_PREFETCH_CITY_VIEWPORT = 900;
  // A user zoomed all the way in (15-18) is most likely looking at
  // something *specific* -- a restaurant, a landmark, a station -- not
  // idly panning around the general vicinity of their lodging the way
  // MAP_PREFETCH_CITY_VIEWPORT's much larger 900px radius assumes. Real-
  // world geographic coverage for a *fixed pixel* radius shrinks sharply
  // as zoom increases, so the lodging-only prefetch above left every
  // other point of interest -- exactly the places someone would actually
  // zoom in on -- uncovered at the highest zoom levels, which is what
  // surfaced as "the three highest zoom levels contain no data." This
  // adds a second, smaller-radius prefetch centered on every other real
  // point this trip already has coordinates for (activities, dining,
  // transport/walking hubs, and points of interest), at just the zoom
  // levels where that gap actually showed up. tileKeysForViewport's own
  // Set-based deduplication (folded together with the lodging prefetch's
  // tiles in buildMapPrefetchUrls() below) means overlapping coverage
  // near a lodging point costs nothing extra.
  const MAP_PREFETCH_SECONDARY_ZOOMS = [15, 16, 17, 18];
  const MAP_PREFETCH_SECONDARY_VIEWPORT = 400;

  function uniqueLodgingPoints() {
    const seen = new Set();
    const points = [];
    LODGING.forEach((l) => {
      if (typeof l.lat !== "number" || typeof l.lon !== "number") return;
      const key = l.lat.toFixed(4) + "," + l.lon.toFixed(4);
      if (seen.has(key)) return;
      seen.add(key);
      points.push([l.lat, l.lon]);
    });
    return points;
  }

  // Every non-lodging point this trip has real coordinates for --
  // activities, dining, transport/walking hubs, and Wiki points of
  // interest (TRIP_MAP_POINTS, already computed once at module load).
  // "Country"/"Region" POIs (e.g. the "Sweden"/"Norway" overview entries)
  // are excluded -- their coordinates are a country/region centroid, not
  // a real place someone would zoom in on street-level, so prefetching a
  // detailed radius around one would be geographically meaningless.
  function uniqueSecondaryPoints() {
    const seen = new Set();
    const points = [];
    function addPoint(lat, lon) {
      if (typeof lat !== "number" || typeof lon !== "number") return;
      const key = lat.toFixed(4) + "," + lon.toFixed(4);
      if (seen.has(key)) return;
      seen.add(key);
      points.push([lat, lon]);
    }
    TRIP_MAP_POINTS.detailPoints.forEach((p) => addPoint(p.lat, p.lon));
    TRIP_MAP_POINTS.hubPoints.forEach((p) => addPoint(p.lat, p.lon));
    TRIP_MAP_POINTS.poiPoints.forEach((p) => {
      if (p.category === "Country" || p.category === "Region") return;
      addPoint(p.lat, p.lon);
    });
    return points;
  }

  function tileUrlsForRange(zoom, txStart, txEnd, tyStart, tyEnd) {
    const n = Math.pow(2, zoom);
    const urls = [];
    for (let tx = txStart; tx <= txEnd; tx++) {
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wrappedX = ((tx % n) + n) % n;
        urls.push(stadiaTileUrl(zoom, wrappedX, ty));
      }
    }
    return urls;
  }

  function tileUrlsForViewport(lat, lon, zoom, pxSize, bufferTiles) {
    const center = lonLatToTilePixel(lat, lon, zoom);
    const half = pxSize / 2;
    return tileUrlsForRange(
      zoom,
      Math.floor((center.x - half) / MAP_TILE_SIZE) - bufferTiles,
      Math.floor((center.x + half) / MAP_TILE_SIZE) + bufferTiles,
      Math.floor((center.y - half) / MAP_TILE_SIZE) - bufferTiles,
      Math.floor((center.y + half) / MAP_TILE_SIZE) + bufferTiles
    );
  }

  function tileUrlsForBounds(points, zoom, bufferTiles) {
    const pixels = points.map(([lat, lon]) => lonLatToTilePixel(lat, lon, zoom));
    return tileUrlsForRange(
      zoom,
      Math.floor(Math.min(...pixels.map((p) => p.x)) / MAP_TILE_SIZE) - bufferTiles,
      Math.floor(Math.max(...pixels.map((p) => p.x)) / MAP_TILE_SIZE) + bufferTiles,
      Math.floor(Math.min(...pixels.map((p) => p.y)) / MAP_TILE_SIZE) - bufferTiles,
      Math.floor(Math.max(...pixels.map((p) => p.y)) / MAP_TILE_SIZE) + bufferTiles
    );
  }

  function buildMapPrefetchUrls() {
    const points = uniqueLodgingPoints();
    if (!points.length) return [];
    const urls = new Set();
    MAP_PREFETCH_CITY_VIEWPORT_ZOOMS.forEach((zoom) => {
      points.forEach(([lat, lon]) => {
        tileUrlsForViewport(lat, lon, zoom, MAP_PREFETCH_CITY_VIEWPORT, 1).forEach((u) => urls.add(u));
      });
    });
    MAP_PREFETCH_OVERVIEW_ZOOMS.forEach((zoom) => {
      tileUrlsForBounds(points, zoom, 1).forEach((u) => urls.add(u));
    });
    // Secondary points (see uniqueSecondaryPoints()'s doc comment) --
    // added into the same urls Set, so any tile already covered by the
    // lodging viewport above costs nothing extra here.
    const secondaryPoints = uniqueSecondaryPoints();
    MAP_PREFETCH_SECONDARY_ZOOMS.forEach((zoom) => {
      secondaryPoints.forEach(([lat, lon]) => {
        tileUrlsForViewport(lat, lon, zoom, MAP_PREFETCH_SECONDARY_VIEWPORT, 1).forEach((u) => urls.add(u));
      });
    });
    return Array.from(urls);
  }

  // ---------------- Shared download core (map tiles + ticket files, IndexedDB) ----------------
  // Both ticket files and map tiles are downloaded into IndexedDB via
  // idb-keyval (vendored under assets/idb-keyval/), not Cache Storage.
  // Tickets moved here first (see CLAUDE.md's "Offline ticket downloads"
  // notes) after several rounds of increasingly elaborate fixes to make
  // Cache Storage + the service worker reliably serve files offline on
  // iOS Safari every one of which eventually reproduced some version of
  // "reports success, nothing real happens" -- pointing at Cache
  // Storage/service-worker reliability itself as the actual problem, not
  // any particular bug in how this app was using it. Map tiles had the
  // same "some zoom levels missing" symptom and were migrated here right
  // after for the same reason, using this same generic function.
  // Storing the raw Blob directly, keyed by the same URL string
  // ticketFileUrl()/tile URLs already produce, means the serving side
  // (renderTicketFileView(), drawStaticMap(), the trip map's tile layer)
  // can read it straight back and hand the browser a local blob: URL
  // (URL.createObjectURL()) instead of a network request that would need
  // the service worker to intercept and serve correctly -- offline
  // viewing no longer depends on the service worker for either file type
  // once downloaded this way.
  //
  // A request that never resolves (hangs rather than cleanly failing)
  // would otherwise leave the whole batch stuck forever without the
  // per-request timeout fallback -- settledOnce guards against double-
  // counting if the real fetch() response still arrives later, after the
  // fallback already fired. onProgress(done, total) fires after every
  // request settles; onDone(succeeded, total) fires once every request
  // has (whether that one succeeded, failed, or hit the timeout).
  //
  // opts.crossOrigin requests the response in "no-cors" mode, required
  // for a cross-origin request to a server that doesn't send CORS
  // headers -- fetch() in its default "cors" mode would otherwise reject
  // outright rather than resolving. Not currently exercised by anything
  // in this app: tickets are same-origin, and map tiles come from Stadia
  // Maps (see stadiaTileUrl()'s doc comment), which *does* send CORS
  // headers, so a normal "cors" request works fine there too. Kept for
  // any future cross-origin source that doesn't support CORS -- for such
  // a source, the resulting "opaque" response can't have its status/
  // headers read by the page even on success, but its body can still be
  // read via .blob() and stored (that's the entire point of caching an
  // opaque response at all); since Content-Length isn't readable either,
  // an opaque entry can only be verified by a non-zero blob size, not a
  // size-vs-expected-length comparison the way a normal response is.
  function downloadToIdb(urls, concurrency, opts, onProgress, onDone) {
    if (!urls.length) { onDone(0, 0); return; }
    // Defensive/uniform check (silent prefetches already checked this
    // themselves before calling in, but the manual "Download" buttons
    // didn't). Without it, tapping Download while genuinely offline (e.g.
    // airplane mode) still attempted every fetch -- and since
    // onProgress/the progress bar advance on *every* settled request
    // regardless of success or failure, a batch of fast (or, depending on
    // network conditions, up to the 30s-timeout-slow) failures still
    // visually reads as real download progress happening, when nothing is
    // actually being stored. Bailing out immediately here, before
    // attempting a single request, is what lets the button show a clear
    // "you're offline" message instead.
    if (navigator.onLine === false) { onDone(0, urls.length); return; }
    if (!window.idbKeyval) { onDone(0, urls.length); return; }
    const crossOrigin = !!(opts && opts.crossOrigin);
    // cache: "reload" makes sure this always gets a guaranteed-fresh
    // network copy -- every same-origin fetch (tickets) still passes
    // through sw.js's fetch handler first, and without this it could get
    // served back whatever's already sitting in Cache Storage under this
    // URL from this app's own earlier, deprecated Cache-Storage-based
    // caching mechanisms, instead of a real fresh fetch.
    const fetchOpts = Object.assign(
      { cache: "reload" },
      crossOrigin ? { mode: "no-cors" } : null
    );
    const total = urls.length;
    // A minimum delay for cross-origin requests, not currently exercised
    // by anything in this app (see opts.crossOrigin's doc comment above)
    // -- kept for any future source with a stated rate limit like "no
    // more than ~2 requests/second" (this app hit exactly that with a
    // previous tile source; a rate-limited/blocked response can still
    // *resolve*, rather than reject, as a non-empty opaque response,
    // passing the non-zero-blob-size check below even though it's a
    // block page rather than real content -- see CLAUDE.md's "Offline
    // map tile downloads" notes for the full story of how that surfaced).
    // Same-origin (or CORS-verifiable cross-origin, like the current
    // Stadia Maps tile source) requests have no need for this.
    const minDelayMs = crossOrigin ? 600 : 0;

    // A per-tile idbKeyval.get() re-read immediately after idbKeyval.set()
    // resolves (below) has not, in practice, proven sufficient at map-tile
    // scale (~2,400 writes) the way it has for ~28 ticket files -- a run
    // could visually complete (the progress bar reaching 100%, since it
    // counts every *attempt* settling, not just successes) yet nothing
    // was actually retrievable afterward. An immediate read-back can
    // succeed off an in-memory/write-behind state that hasn't necessarily
    // been durably flushed to disk yet -- the same underlying class of
    // problem this saga hit with Cache Storage's event.waitUntil(), just
    // surfacing at a different scale/timing here. So the real, trusted
    // success count this function reports is a SEPARATE, final
    // idbKeyval.getMany() pass over the *entire* original url list, done
    // only after every fetch/write attempt has already settled and some
    // real time has passed -- not the accumulated per-tile "succeeded"
    // flags from during the run.
    function finalizeWithRealCheck() {
      idbKeyval.getMany(urls).then((finalState) => {
        const realSucceeded = finalState.filter((b) => b && b.size > 0).length;
        onDone(realSucceeded, total);
      }).catch(() => onDone(0, total));
    }

    // Runs the actual fetch loop over `pending` (the subset of `urls`
    // not already sitting in IndexedDB -- see the getMany() check below),
    // with `alreadyGoodCount` folded into progress from the start.
    // settledTotal counts every *attempt* settling (success or failure,
    // starting from alreadyGoodCount so the progress bar reads as a
    // fraction of the *original* full url list, not just the
    // still-pending remainder) -- the real, final success count reported
    // to onDone comes from finalizeWithRealCheck() above, not from
    // tallying these per-tile results directly.
    function runPending(pending, alreadyGoodCount) {
      let settledTotal = alreadyGoodCount;
      if (onProgress) onProgress(settledTotal, total);
      if (!pending.length) { finalizeWithRealCheck(); return; }

      let nextIndex = 0;
      function loadNext() {
        if (nextIndex >= pending.length) return;
        const url = pending[nextIndex++];
        let settledOnce = false;
        const timeoutId = setTimeout(() => settle(false), 30000);
        function settle(ok) {
          if (settledOnce) return;
          settledOnce = true;
          clearTimeout(timeoutId);
          settledTotal++;
          if (onProgress) onProgress(settledTotal, total);
          if (settledTotal >= total) finalizeWithRealCheck();
          else if (minDelayMs > 0) setTimeout(loadNext, minDelayMs);
          else loadNext();
        }
        fetch(url, fetchOpts).then((res) => {
          const headersOk = crossOrigin ? true : !!(res && res.ok);
          if (!headersOk) {
            // Still fully consume the body so a failed/erroring response
            // doesn't leave a request hanging before moving on.
            return res.blob().then(() => settle(false), () => settle(false));
          }
          const expectedLength = crossOrigin ? null : parseInt(res.headers.get("content-length") || "", 10) || null;
          res.blob().then((blob) => {
            if (!blob || blob.size === 0 || (expectedLength != null && blob.size < expectedLength * 0.9)) {
              settle(false);
              return;
            }
            idbKeyval.set(url, blob).then(
              // Re-read the entry back independently rather than trusting
              // idbKeyval.set()'s own resolution alone -- same "verify,
              // don't just trust a completion signal" principle this whole
              // offline-data feature has followed since it first ran into
              // exactly that failure mode with Cache Storage.
              () => idbKeyval.get(url).then(
                (check) => settle(!!check && check.size === blob.size),
                () => settle(false)
              ),
              () => settle(false)
            );
          }, () => settle(false));
        }, () => settle(false));
      }
      for (let c = 0; c < Math.min(concurrency, pending.length); c++) loadNext();
    }

    // Skip re-fetching URLs already successfully stored from a previous
    // (possibly interrupted) run -- without this, any interruption
    // partway through a long download (the tab backgrounding, the phone
    // locking, a service worker update reloading the page -- much likelier
    // for map tiles' ~2,400 URLs across several minutes than tickets'
    // ~28) meant the *entire* batch re-fetched from scratch on the next
    // attempt: not just slow and wasteful, but visually indistinguishable
    // from "the download reverts back to 0%", since this function's own
    // progress counters always started over at zero with no memory of
    // what a previous, interrupted call had already finished. One batched
    // idbKeyval.getMany() upfront is far cheaper than a get() per URL.
    idbKeyval.getMany(urls).then((existing) => {
      const pending = [];
      let alreadyGoodCount = 0;
      urls.forEach((url, i) => {
        const blob = existing[i];
        if (blob && blob.size > 0) alreadyGoodCount++;
        else pending.push(url);
      });
      runPending(pending, alreadyGoodCount);
    }).catch(() => {
      // If the upfront batch check itself fails for some reason, fall
      // back to treating everything as pending -- safe, just loses the
      // "skip already downloaded" optimization for this one run.
      runPending(urls.slice(), 0);
    });
  }

  // Real, current presence check against IndexedDB, for both resource
  // types -- used to show real download status on the Checklist tab's
  // Offline Data section on mount, rather than only ever trusting the
  // "done" localStorage flags (which this whole feature exists because
  // those flags can't be fully trusted on their own).
  function countCachedIdb(urls, callback) {
    if (!urls.length) { callback(0, 0); return; }
    if (!window.idbKeyval) { callback(0, urls.length); return; }
    Promise.all(urls.map((u) => idbKeyval.get(u).then((v) => !!v).catch(() => false)))
      .then((results) => callback(results.filter(Boolean).length, urls.length))
      .catch(() => callback(0, urls.length));
  }

  // Both the silent background prefetch (prefetchTicketFiles()/
  // prefetchMapTiles(), on every app load) and the Checklist "Download"
  // button can independently decide to download the exact same set of
  // files -- e.g. the silent prefetch is still running when the user
  // finds and taps "Download" a few seconds after load, or the Checklist
  // view gets rebuilt from scratch mid-download (ticking any unrelated
  // checklist item elsewhere on the same page re-renders the whole view,
  // including this row, per this app's "full content replacement on every
  // render()" model) and the user taps the freshly-mounted, once-again-
  // enabled button while the original run is still going in the
  // background. Two independent runs racing against the same URLs is
  // exactly what looked like "the download restarts partway through" --
  // each run's onProgress/onDone calls its own UI callbacks with its own
  // independently-tracked counts, so two of them interleaved on the same
  // progress bar/button made completion look like it jumped backward.
  // activeDownloads keys by the same string used for that resource's
  // localStorage "done" flag (TICKET_PREFETCH_KEY/MAP_PREFETCH_KEY) --
  // already a unique, stable per-resource-type identity -- and ensures at
  // most one real download runs per key at a time; every other caller
  // just attaches its callbacks to the one already in flight instead of
  // starting a second, independent run.
  const activeDownloads = {};

  function subscribeToActiveDownload(key, onProgress, onDone) {
    const state = activeDownloads[key];
    if (!state) return false;
    if (onProgress) state.progressListeners.add(onProgress);
    if (onDone) state.doneListeners.add(onDone);
    // Report the current known progress right away so a freshly
    // (re-)mounted row reflects the in-progress download immediately,
    // rather than showing stale/misleading state until the next tick.
    if (onProgress) onProgress(state.done, state.total);
    return true;
  }

  function startDedupedDownload(key, total, startFn, onProgress, onDone) {
    if (activeDownloads[key]) {
      subscribeToActiveDownload(key, onProgress, onDone);
      return;
    }
    const state = { total, done: 0, progressListeners: new Set(), doneListeners: new Set() };
    if (onProgress) state.progressListeners.add(onProgress);
    if (onDone) state.doneListeners.add(onDone);
    activeDownloads[key] = state;
    startFn((done, doneTotal) => {
      state.done = done;
      state.total = doneTotal;
      state.progressListeners.forEach((fn) => fn(done, doneTotal));
    }, (succeeded, doneTotal) => {
      delete activeDownloads[key];
      state.doneListeners.forEach((fn) => fn(succeeded, doneTotal));
    });
  }

  // Best-effort, low-priority background fetch of every tile the trip
  // needs, from Stadia Maps (see stadiaTileUrl()'s doc comment) -- their
  // CORS headers mean this gets full res.ok/Content-Length verification
  // the same as a same-origin request, so concurrency 3 (matching ticket
  // downloads) is fine here, no crossOrigin option or throttle needed.
  // The prefetch is only marked "done" in localStorage once the final
  // real-state check (not just in-loop optimism -- see downloadToIdb()'s
  // finalizeWithRealCheck() doc comment) confirms every tile actually
  // landed -- so an interrupted first run (e.g. the tab closed early)
  // retries in full next time instead of silently staying incomplete
  // forever.
  function prefetchMapTiles() {
    if (navigator.onLine === false) return;
    try {
      if (localStorage.getItem(MAP_PREFETCH_KEY) === MAP_PREFETCH_VERSION) return;
    } catch (e) {}
    const urls = buildMapPrefetchUrls();
    // startDedupedDownload (not downloadToIdb() directly) so this merges
    // into a Checklist "Download" tap already in flight for map tiles,
    // instead of racing it -- see startDedupedDownload's doc comment.
    startDedupedDownload(MAP_PREFETCH_KEY, urls.length, (onProgress, onDone) => {
      downloadToIdb(urls, 3, null, onProgress, onDone);
    }, null, () => {
      try { localStorage.setItem(MAP_PREFETCH_KEY, MAP_PREFETCH_VERSION); } catch (e) {}
    });
  }

  // ---------------- Ticket file prefetch (offline-ready without opening first) ----------------
  // Same problem/shape as prefetchMapTiles() above, for assets/tickets/:
  // a ticket never opened with a connection is simply missing in
  // airplane mode. ~9MB total across all current tickets -- small enough
  // to fetch in full on first load rather than needing the zoom-level-
  // style range logic prefetchMapTiles() has.
  // v6: several earlier mechanisms never reliably made ticket PDFs
  // available offline on iOS Safari, even when they reported success --
  // see downloadToIdb()'s doc comment above for the current approach
  // (IndexedDB instead of Cache Storage entirely). Bumped again so
  // everyone's existing "done" flag -- quite possibly set by a false
  // success under an earlier mechanism -- doesn't suppress a real retry
  // here. The Checklist tab's "Clear cached data & start fresh" button
  // (see renderChecklistView) also directly clears IndexedDB.
  const TICKET_PREFETCH_VERSION = "v6";
  const TICKET_PREFETCH_KEY = "rougeux_tickets_prefetched";

  function prefetchTicketFiles() {
    if (navigator.onLine === false) return;
    try {
      if (localStorage.getItem(TICKET_PREFETCH_KEY) === TICKET_PREFETCH_VERSION) return;
    } catch (e) {}
    const urls = TICKET_FILES.map(ticketFileUrl);
    // Lower concurrency than prefetchMapTiles()'s 6 -- these are
    // individual PDFs/JPGs up to ~2MB each (map tiles are a few KB), so
    // fewer of them in flight at once is politer to the connection.
    // startDedupedDownload (not downloadToIdb() directly) so this merges
    // into a Checklist "Download" tap already in flight for tickets,
    // instead of racing it -- see its doc comment for why two independent
    // runs used to look like the download restarting partway through.
    startDedupedDownload(TICKET_PREFETCH_KEY, urls.length, (onProgress, onDone) => {
      downloadToIdb(urls, 3, null, onProgress, onDone);
    }, null, () => {
      try { localStorage.setItem(TICKET_PREFETCH_KEY, TICKET_PREFETCH_VERSION); } catch (e) {}
    });
  }

  render();

  // Best-effort request that the browser treat this origin's storage
  // (Cache Storage, localStorage) as "persistent" rather than eligible
  // for silent eviction under storage pressure -- iOS Safari in
  // particular can otherwise clear a regular website's cached data
  // without warning, which would look exactly like "the ticket/map-tile
  // prefetch silently isn't working" even when the fetch/caching logic
  // itself is correct. The browser can still ignore this (especially for
  // a page that isn't installed to the home screen), so it's not a fix
  // on its own -- just improves the odds.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").then((reg) => {
        // register() alone relies on the browser's own update-check
        // schedule, which iOS Safari (especially an installed/home-
        // screen PWA) can be slow or inconsistent about -- an app fix can
        // sit deployed for a long time before it's actually picked up.
        // Forcing an explicit check on every load makes that immediate
        // instead of best-effort.
        reg.update().catch(() => {});
      }).catch(() => {});

      // A new service worker activating (skipWaiting + clients.claim(),
      // both already used in sw.js) makes it start controlling THIS page
      // too, but doesn't retroactively re-run anything already loaded
      // under the old one -- app.js/styles.css/data.js already in memory
      // stay whatever version they were when the page loaded. Reloading
      // once when control actually switches is what makes an update
      // fully take effect right away instead of only on some later,
      // unrelated reload. Guarded so this can only ever fire once per
      // page load, not loop.
      let reloadedForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadedForUpdate) return;
        reloadedForUpdate = true;
        window.location.reload();
      });

      // Wait until the service worker actually controls this page --
      // register() alone doesn't guarantee that yet, especially on a
      // first-ever visit -- so these fetches are actually intercepted
      // and cached by its fetch handler, not just loaded straight from
      // the network and discarded.
      navigator.serviceWorker.ready.then(prefetchMapTiles).catch(() => {});
      navigator.serviceWorker.ready.then(prefetchTicketFiles).catch(() => {});
    });
  }
})();
