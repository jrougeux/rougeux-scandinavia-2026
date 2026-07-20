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
    const saved = localStorage.getItem("rougeux_day_index");
    if (saved !== null && !isNaN(+saved)) return +saved;
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
    prev.className = "day-nav-arrow";
    prev.setAttribute("aria-label", "Previous day");
    prev.textContent = "‹";
    prev.disabled = state.dayIndex === 0;
    prev.addEventListener("click", () => goToDay(state.dayIndex - 1));

    const label = document.createElement("button");
    label.className = "day-nav-label";
    label.innerHTML = `
      <span class="dnl-eyebrow">Day ${day.day_number} of ${DAYS.length}</span>
      <span class="dnl-current"><span class="dnl-flag" aria-hidden="true">${countryFlag(day.day_number)}</span> ${day.weekday}, ${fmtDateLabel(day)} — ${cityLabelFor(day)}</span>
    `;
    label.setAttribute("aria-label", "Choose a day to jump to");
    label.addEventListener("click", openDaySheet);

    const next = document.createElement("button");
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
  const MAP_MAX_ZOOM = 17;
  const MAP_DEFAULT_ZOOM = 14;
  const MAP_CANVAS_W = 640;
  const MAP_CANVAS_H = 320;

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

    const loads = [];
    for (let tx = txStart; tx <= txEnd; tx++) {
      for (let ty = tyStart; ty <= tyEnd; ty++) {
        if (ty < 0 || ty >= n) continue;
        const wrappedX = ((tx % n) + n) % n;
        const url = `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png`;
        loads.push(
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ img, tx, ty });
            img.onerror = () => resolve(null);
            img.src = url;
          })
        );
      }
    }

    Promise.all(loads).then((tiles) => {
      if (getToken() !== token) return; // a newer render superseded this one
      tiles.forEach((t) => {
        if (!t) return;
        const dx = t.tx * MAP_TILE_SIZE - originX;
        const dy = t.ty * MAP_TILE_SIZE - originY;
        ctx.drawImage(t.img, dx, dy, MAP_TILE_SIZE, MAP_TILE_SIZE);
      });
      drawMapPin(ctx, W / 2, H / 2);
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
        const clamped = Math.min(Math.max(pinchScale, 0.4), 3);
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
    attribution.innerHTML = `Map data © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors`;

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
    59.323305,
    18.067002
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
    prevBtn.textContent = "← Previous day";
    prevBtn.disabled = state.dayIndex === 0;
    prevBtn.addEventListener("click", () => { state.dayIndex--; saveLastDay(state.dayIndex); render(); window.scrollTo(0,0); });
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next day →";
    nextBtn.disabled = state.dayIndex === DAYS.length - 1;
    nextBtn.addEventListener("click", () => { state.dayIndex++; saveLastDay(state.dayIndex); render(); window.scrollTo(0,0); });
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

  function renderSearchView() {
    const container = document.createElement("div");
    container.className = "search-view";

    const input = document.createElement("input");
    input.className = "search-input";
    input.type = "search";
    input.placeholder = "Search activities, restaurants, confirmations…";
    input.autofocus = true;

    const results = document.createElement("div");

    function runSearch(q) {
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
    runSearch("");

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
  }

  // Jump straight to a specific pin on the trip map (from a "Map view"
  // link in the day itinerary) -- centers on it, zooms in close enough
  // that its layer is visible, and opens its popup. Reuses the same
  // tripMapPersisted mechanism that restores state when navigating back
  // to the Map tab, since "go to this exact pin" is the same operation.
  function goToMapPin(key, lat, lon) {
    tripMapPersisted = { center: [lat, lon], zoom: 15, openPopupKey: key };
    state.view = "map";
    render();
    window.scrollTo(0, 0);
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

  function renderTripMapView() {
    const container = document.createElement("div");
    container.className = "trip-map-view";

    const mapEl = document.createElement("div");
    mapEl.className = "trip-map-canvas";
    container.appendChild(mapEl);

    const hint = document.createElement("p");
    hint.className = "trip-map-hint";
    hint.textContent = "Tap a city to zoom in, then tap any pin for details.";
    container.appendChild(hint);

    const legend = document.createElement("div");
    legend.className = "trip-map-legend";
    legend.innerHTML = `
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("lodging")}"></span>City / lodging</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("activity")}"></span>Activity</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("dining")}"></span>Dining (confirmed)</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("dining-suggested")}"></span>Dining (suggested)</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("transport")}"></span>Station / stop</span>
      <span class="tml-item"><span class="tml-dot" style="background:${categoryMapColor("poi")}"></span>Point of interest</span>
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

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
      }).addTo(map);

      const { cityPoints, detailPoints, hubPoints, poiPoints } = TRIP_MAP_POINTS;

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
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon("lodging", 30) });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        popupEl.innerHTML = `
          <div class="tmp-title">${tripMapDotHtml("lodging")}${p.location}</div>
          <div class="tmp-sub">${p.name}</div>
        `;
        const zoomBtn = document.createElement("button");
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
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon(p.kind, 16) });
        const popupEl = document.createElement("div");
        popupEl.className = "trip-map-popup";
        popupEl.innerHTML = `
          <div class="tmp-eyebrow">${mapPopupDayLabel(p.dayIndex)}${p.time ? " · " + p.time : ""}</div>
          <div class="tmp-title">${tripMapDotHtml(p.kind)}${p.label}</div>
        `;
        const gotoBtn = document.createElement("button");
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
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon(p.kind, p.kind === "activity" ? 16 : 14) });
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
        const marker = L.marker([p.lat, p.lon], { icon: makeTripMapIcon("poi", 16) });
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
          state.view = "wiki";
          state.wikiEntryId = p.id;
          render();
          window.scrollTo(0, 0);
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
  "24-07-2026 14-00 Nordic Walking Tour.pdf",
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
        state.ticketsDayIndex = i;
        render();
        window.scrollTo(0, 0);
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
    backBtn.className = "tickets-back";
    backBtn.textContent = "‹ All days";
    backBtn.addEventListener("click", () => {
      state.ticketsDayIndex = null;
      render();
      window.scrollTo(0, 0);
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
        state.ticketFile = t;
        render();
        window.scrollTo(0, 0);
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
  // via an <iframe> (the browser's native PDF viewer still supports
  // pinch-zoom inside it); the two .jpg tickets via a plain <img>, relying
  // on the page's own native pinch-zoom (the viewport meta tag doesn't
  // restrict scaling).
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

    const openLink = document.createElement("a");
    openLink.className = "ticket-file-openlink";
    openLink.href = ticketFileUrl(t.filename);
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
    if (t.ext === "jpg" || t.ext === "jpeg") {
      // A scrollable wrapper (rather than the image alone) so a tall/wide
      // image can be panned by dragging even before zooming in; native
      // pinch-zoom (the viewport meta tag doesn't restrict scaling) layers
      // on top of that for reading small text/QR codes.
      const wrap = document.createElement("div");
      wrap.className = "ticket-file-image-wrap";
      const img = document.createElement("img");
      img.className = "ticket-file-image";
      img.src = ticketFileUrl(t.filename);
      img.alt = t.description;
      wrap.appendChild(img);
      frame.appendChild(wrap);
    } else {
      // <embed> rather than <iframe> -- in an installed/standalone PWA on
      // iOS, a PDF inside an <iframe> often only gets a stripped-down,
      // single-page preview from WKWebView instead of the full multi-page
      // viewer a real top-level navigation to the same PDF gets.
      const embed = document.createElement("embed");
      embed.className = "ticket-file-pdf";
      embed.src = ticketFileUrl(t.filename);
      embed.type = "application/pdf";
      frame.appendChild(embed);
    }
    container.appendChild(frame);

    return container;
  }

  // ---------------- Wiki (points of interest) ----------------
  // POI_LIST/POI_BY_ID are defined near the top of the file (see comment
  // there) since buildTripMapPoints() needs them earlier than this section
  // runs.

  // Minimal markdown -> HTML: content/summary/fun_fact carry literal
  // **bold**/*italic* markdown syntax in some entries (per the data's own
  // documentation) rather than real formatting. HTML-escape first (this is
  // long-form prose, not curated tag-free text like the rest of the app's
  // data -- a stray "<" or "&" in an entry needs to render literally, not
  // break the markup), then convert just bold/italic and paragraph breaks.
  function mdLiteToHtml(text) {
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const emphasized = escaped
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    return emphasized
      .split(/\n\s*\n/)
      .map((para) => `<p>${para.trim().replace(/\n/g, "<br>")}</p>`)
      .join("");
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
      state.wikiEntryId = poi.id;
      render();
      window.scrollTo(0, 0);
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
    container.className = "wiki-view wiki-entry-view";

    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.className = "tickets-back";
    backBtn.textContent = "‹ All entries";
    backBtn.addEventListener("click", () => {
      state.wikiEntryId = null;
      render();
      window.scrollTo(0, 0);
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

    const body = document.createElement("div");
    body.className = "wiki-entry-body";
    body.innerHTML = mdLiteToHtml(poi.content);
    container.appendChild(body);

    if (poi.fun_fact) {
      const fact = document.createElement("div");
      fact.className = "wiki-fun-fact";
      fact.innerHTML = `<span class="wiki-fun-fact-label">Fun fact</span>${mdLiteToHtml(poi.fun_fact)}`;
      container.appendChild(fact);
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
  function renderChecklistView() {
    const container = document.createElement("div");
    container.className = "checklist-view";

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
  function renderHeader() {
    const header = document.createElement("div");
    header.className = "app-header";
    header.innerHTML = `
      <div class="app-banner">
        <p class="app-title">${DATA.meta.family_name} Family — ${DATA.meta.trip_title}</p>
        <p class="app-subtitle">${DATA.meta.start_date} → ${DATA.meta.end_date}</p>
      </div>
    `;
    if (state.view === "day") {
      header.appendChild(renderDayNav());
    }
    return header;
  }

  function renderBottomNav() {
    const nav = document.createElement("div");
    nav.className = "bottom-nav";
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
      btn.className = it.key === state.view ? "active" : "";
      btn.innerHTML = `<span class="bicon">${it.icon}</span><span>${it.label}</span>`;
      btn.addEventListener("click", () => {
        const wasDay = state.view === "day";
        state.view = it.key;
        render();
        if (it.key === "day" && !wasDay) window.scrollTo(0, dayViewScrollY);
        else if (it.key !== "day") window.scrollTo(0, 0);
        // else: redundant click on the already-active Day tab -- leave
        // scroll exactly where it is rather than yanking to a stale value.
      });
      nav.appendChild(btn);
    });
    return nav;
  }

  // Scroll position within the Day view, captured whenever navigating away
  // from it (to Map or elsewhere) so returning to the *same* day restores
  // where you were instead of snapping back to the top. Tracked here
  // rather than in each individual nav click handler since there are
  // multiple ways to leave Day view (bottom nav, a leg's "Map view"
  // button) and this way none of them can forget to capture it.
  let dayViewScrollY = 0;
  let lastRenderedView = null;

  function render() {
    if (lastRenderedView === "day" && state.view !== "day") {
      dayViewScrollY = window.scrollY;
    }
    saveLastView(state.view);
    saveTicketsDayIndex(state.ticketsDayIndex);
    saveWikiEntryId(state.wikiEntryId);
    teardownTripMap();
    root.innerHTML = "";

    // Viewing a ticket file is a full-screen takeover -- no header or
    // bottom-nav, and the page itself can't scroll (matches the day-jump
    // sheet's overlay pattern). On mobile, a single-finger touch drag
    // defaults to scrolling whatever's the *outer* page rather than a
    // nested iframe/image, so anything else visibly on screen competes
    // for that gesture and the file ends up feeling clipped/unscrollable.
    // Making the file viewer the only thing on screen removes that
    // ambiguity entirely.
    if (state.view === "tickets" && state.ticketFile) {
      document.body.style.overflow = "hidden";
      root.appendChild(renderTicketFileView(state.ticketFile));
      lastRenderedView = state.view;
      return;
    }
    document.body.style.overflow = "";

    root.appendChild(renderHeader());
    let view;
    if (state.view === "day") view = renderDayView();
    else if (state.view === "map") view = renderTripMapView();
    else if (state.view === "wiki") view = renderWikiView();
    else if (state.view === "tickets") view = renderTicketsView();
    else if (state.view === "search") view = renderSearchView();
    else view = renderChecklistView();
    root.appendChild(view);
    root.appendChild(renderBottomNav());
    lastRenderedView = state.view;
  }

  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
