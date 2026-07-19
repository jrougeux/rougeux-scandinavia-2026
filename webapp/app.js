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

  function renderLeg(leg) {
    const el = document.createElement("div");
    const cat = categorizeLeg(leg);
    el.className = "leg cat-" + cat;
    const times = leg.depart || leg.arrive
      ? `${leg.depart || ""}${leg.depart && leg.arrive ? '<span class="arrow">→</span>' : ""}${leg.arrive || ""}`
      : "";
    const modeIcon = leg.mode ? renderModeIcon(leg.mode) : "";
    const chipEmoji = modeIcon || CATEGORY_META[cat].emoji;
    const chipLabel = leg.mode || CATEGORY_META[cat].label;
    el.innerHTML = `
      <span class="num">${leg.num}</span>
      <span class="times">${times}</span>
      <div class="body">
        <p class="activity">${leg.flag ? '<span class="flag-icon">⚠</span>' : ""}${leg.activity}</p>
        <span class="mode-chip cat-${cat}">${chipEmoji} ${chipLabel}</span>
        ${leg.detail ? `<p class="detail">${leg.detail}</p>` : ""}
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

  function renderCollapsible(title, contentEl, openByDefault) {
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
    day.legs.forEach((leg) => legsWrap.appendChild(renderLeg(leg)));
    container.appendChild(legsWrap);

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
