(function () {
  const DATA = window.TRIP_DATA;
  const DAYS = DATA.days;
  const LODGING = DATA.lodging;

  const state = {
    view: "day",       // "day" | "search" | "checklist"
    dayIndex: 0,
    checks: loadChecks()
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

  state.dayIndex = loadLastDay();

  const root = document.getElementById("app");

  function countryFlag(dayNumber) {
    // Days 1-8 Sweden (incl. Karlstad), Day 9 crossing, 9-16 Norway
    return dayNumber <= 8 ? "🇸🇪" : "🇳🇴";
  }

  function fmtDateLabel(day) {
    const d = new Date(day.date + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  // ---------------- Day nav (arrows + jump sheet, all screen sizes) ----------------
  function cityLabelFor(day) {
    const lodging = findLodgingFor(day);
    return lodging ? lodging.location : "Travel Day";
  }

  function goToDay(i) {
    state.dayIndex = i;
    state.view = "day";
    saveLastDay(i);
    render();
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
    const times = leg.depart || leg.arrive
      ? `${leg.depart || ""}${leg.depart && leg.arrive ? '<span class="arrow">→</span>' : ""}${leg.arrive || ""}`
      : "";
    const modeIcon = leg.mode ? renderModeIcon(leg.mode) : "";
    const chipEmoji = modeIcon || CATEGORY_META[cat].emoji;
    const chipLabel = leg.mode || CATEGORY_META[cat].label;
    const mapLink = mapLinkForLeg(leg, day, cat);
    const mapLinkHtml = mapLink
      ? `<a class="leg-map-link" href="${mapLink.url}" target="_blank" rel="noopener">${mapLink.type === "walk" ? "🚶 Walking directions" : "📍 View on map"}</a>`
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
    return el;
  }

  function telHref(phone) {
    return "tel:" + phone.replace(/[^\d+]/g, "");
  }

  function renderDiningItem(d) {
    const el = document.createElement("div");
    el.className = "dining-item" + (d.leading ? " leading" : "");
    const phoneLink = d.phone ? `<a href="${telHref(d.phone)}">${d.phone}</a>` : "";
    const websiteHref = d.website ? (d.website.startsWith("http") ? d.website : "https://" + d.website) : "";
    const websiteLink = d.website ? `<a href="${websiteHref}" target="_blank" rel="noopener">${d.website}</a>` : "";
    const contactBits = [phoneLink, websiteLink].filter(Boolean).join(" · ");
    el.innerHTML = `
      <div class="row">
        <span class="name">${d.name}</span>
        <span class="dining-badge">${d.status || ""}</span>
      </div>
      <div class="meta">${[d.meal, d.walk, d.address].filter(Boolean).join(" · ")}</div>
      ${d.description ? `<p class="desc">${d.description}</p>` : ""}
      ${contactBits ? `<div class="contact-line">${contactBits}</div>` : ""}
    `;
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
      day.dining.forEach((d) => diningContent.appendChild(renderDiningItem(d)));
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
  function buildSearchIndex() {
    const idx = [];
    DAYS.forEach((day) => {
      day.legs.forEach((leg) => {
        idx.push({
          dayIndex: DAYS.indexOf(day),
          dayLabel: `Day ${day.day_number} · ${fmtDateLabel(day)}`,
          title: leg.activity,
          detail: [leg.mode, leg.detail].filter(Boolean).join(" — "),
          haystack: [leg.activity, leg.detail, leg.mode].filter(Boolean).join(" ").toLowerCase()
        });
      });
      (day.dining || []).forEach((d) => {
        idx.push({
          dayIndex: DAYS.indexOf(day),
          dayLabel: `Day ${day.day_number} · ${fmtDateLabel(day)}`,
          title: d.name + (d.leading ? " ★" : ""),
          detail: [d.meal, d.address, d.description].filter(Boolean).join(" — "),
          haystack: [d.name, d.meal, d.address, d.description].filter(Boolean).join(" ").toLowerCase()
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
      const query = q.trim().toLowerCase();
      if (!query) {
        const note = document.createElement("div");
        note.className = "empty-note";
        note.textContent = "Start typing to search across the whole trip.";
        results.appendChild(note);
        return;
      }
      const matches = SEARCH_INDEX.filter((item) => item.haystack.includes(query)).slice(0, 40);
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
        card.addEventListener("click", () => {
          state.dayIndex = m.dayIndex;
          state.view = "day";
          saveLastDay(m.dayIndex);
          render();
          window.scrollTo(0, 0);
        });
        results.appendChild(card);
      });
    }

    input.addEventListener("input", () => runSearch(input.value));
    runSearch("");

    container.appendChild(input);
    container.appendChild(results);
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
      <p class="app-title">${DATA.meta.family_name} Family — ${DATA.meta.trip_title}</p>
      <p class="app-subtitle">${DATA.meta.start_date} → ${DATA.meta.end_date}</p>
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
      { key: "search", icon: "🔍", label: "Search" },
      { key: "checklist", icon: "✓", label: "Checklist" }
    ];
    items.forEach((it) => {
      const btn = document.createElement("button");
      btn.className = it.key === state.view ? "active" : "";
      btn.innerHTML = `<span class="bicon">${it.icon}</span><span>${it.label}</span>`;
      btn.addEventListener("click", () => { state.view = it.key; render(); window.scrollTo(0, 0); });
      nav.appendChild(btn);
    });
    return nav;
  }

  function render() {
    root.innerHTML = "";
    root.appendChild(renderHeader());
    let view;
    if (state.view === "day") view = renderDayView();
    else if (state.view === "search") view = renderSearchView();
    else view = renderChecklistView();
    root.appendChild(view);
    root.appendChild(renderBottomNav());
  }

  render();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
})();
