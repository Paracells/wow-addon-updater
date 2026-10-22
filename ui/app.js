(() => {
  "use strict";

  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const listen = tauri?.event?.listen;
  const $ = (id) => document.getElementById(id);

  const state = {
    ready: false,
    fatal: null,
    page: "installed",
    settings: {
      wowPath: null,
      apiKey: "",
      useOfficialApi: false,
      autoCheckUpdates: true,
      keepBackups: true,
    },
    settingsDraft: {
      wowPath: null,
      apiKey: "",
      useOfficialApi: false,
      autoCheckUpdates: true,
      keepBackups: true,
    },
    installs: [],
    selectedInstall: null,
    install: null,
    storage: null,
    addons: [],
    checks: new Map(),
    checking: false,
    checkProgress: null,
    lastCheck: null,
    installedQuery: "",
    installedFilter: "all",
    catalog: {
      query: "",
      sort: "popular",
      page: 0,
      results: [],
      hasMore: false,
      loading: false,
      loaded: false,
      error: null,
      seq: 0,
    },
    details: null,
    detailsToken: 0,
    detailsScroll: 0,
    lightbox: null,
    installModal: false,
    installModalBusy: false,
    installTasks: new Map(),
    batchActive: false,
    toasts: [],
    toastSeq: 0,
    showApiKey: false,
    logoByMod: new Map(),
    searchTimer: null,
  };

  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-4.2-4.2"></path>',
    refresh:
      '<path d="M20 5v6h-6"></path><path d="M4 19v-6h6"></path><path d="M5.6 9.4a7.2 7.2 0 0 1 11.7-2.8L20 9"></path><path d="M18.4 14.6a7.2 7.2 0 0 1-11.7 2.8L4 15"></path>',
    download:
      '<path d="M12 3v11"></path><path d="m7.5 10 4.5 4.5 4.5-4.5"></path><path d="M4 18v2h16v-2"></path>',
    check: '<path d="m5 12 4 4L19 6"></path>',
    close: '<path d="m6 6 12 12M18 6 6 18"></path>',
    info: '<circle cx="12" cy="12" r="9"></circle><path d="M12 11v5"></path><path d="M12 8h.01"></path>',
    external:
      '<path d="M14 4h6v6"></path><path d="M20 4 11 13"></path><path d="M19 14v5H5V5h5"></path>',
    folder:
      '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>',
    gamepad:
      '<path d="M7 8h10a4 4 0 0 1 3.7 5.5l-1.2 3A2.4 2.4 0 0 1 15 17l-1.3-1.5H10L8.7 17a2.4 2.4 0 0 1-4.4-1.5l-1.2-3A4 4 0 0 1 7 8Z"></path><path d="M7 11v3"></path><path d="M5.5 12.5h3"></path><path d="M15 11h.01"></path><path d="M17 13h.01"></path>',
    key: '<circle cx="8" cy="15" r="4"></circle><path d="m11 12 8-8 2 2-2 2 2 2-3 3-2-2-2 2"></path>',
    database:
      '<ellipse cx="12" cy="5" rx="7" ry="3"></ellipse><path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5"></path><path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path>',
    shield:
      '<path d="M12 3 5 6v5c0 4.7 3 8 7 10 4-2 7-5.3 7-10V6Z"></path><path d="m9 12 2 2 4-4"></path>',
    compass:
      '<circle cx="12" cy="12" r="9"></circle><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8 4.8-2.2Z"></path>',
    arrowUp: '<path d="M12 19V5"></path><path d="m6 11 6-6 6 6"></path>',
    arrowLeft: '<path d="M19 12H5"></path><path d="m10 17-5-5 5-5"></path>',
    arrowRight: '<path d="M5 12h14"></path><path d="m14 7 5 5-5 5"></path>',
    image:
      '<rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m21 15-5-5L5 20"></path>',
    clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
    sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"></path>',
    monitor:
      '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path>',
  };

  function icon(name, className = "") {
    const body = ICONS[name] || "";
    return `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
  }

  function safeUrl(value) {
    if (!value) return "";
    try {
      const url = new URL(String(value));
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function cssUrl(value) {
    const url = safeUrl(value);
    if (!url) return "";
    return url.replace(/'/g, "%27").replace(/\)/g, "%29").replace(/"/g, "%22");
  }

  function initials(title) {
    const parts = String(title || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    const letters = parts
      .slice(0, 2)
      .map((part) => Array.from(part)[0] || "")
      .join("");
    return (letters || "?").toUpperCase();
  }

  function avatarTone(seed) {
    let hash = 0;
    for (const char of String(seed || "")) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
    return (hash % 5) + 1;
  }

  function plural(number, one, few, many) {
    const n = Math.abs(Number(number) || 0);
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function friendlyVersion(title, version) {
    let value = String(version || "").trim();
    if (value.toLowerCase().endsWith(".zip")) value = value.slice(0, -4);
    const titleLower = String(title || "").trim().toLowerCase();
    if (titleLower) {
      const valueLower = value.toLowerCase();
      if (valueLower.startsWith(titleLower)) {
        const separator = valueLower.slice(titleLower.length, titleLower.length + 1);
        if (separator === "-" || separator === "_" || separator === " ") {
          value = value.slice(titleLower.length + separator.length);
        }
      }
    }
    return value.trim();
  }

  function fileVersionLabel(title, file) {
    if (!file) return "";
    return friendlyVersion(title, file.displayName || file.fileName || "");
  }

  function largestScreenshot(screenshots) {
    const list = (screenshots || []).filter((shot) => safeUrl(shot.url) || safeUrl(shot.thumb));
    if (!list.length) return null;
    return [...list].sort(
      (a, b) => String(b.url || b.thumb || "").length - String(a.url || a.thumb || "").length,
    )[0];
  }

  function gameVersionParts(value) {
    return String(value || "")
      .split(".")
      .map((part) => Number.parseInt(part, 10) || 0);
  }

  function compareGameVersions(a, b) {
    const left = gameVersionParts(a);
    const right = gameVersionParts(b);
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const diff = (left[index] || 0) - (right[index] || 0);
      if (diff) return diff;
    }
    return 0;
  }

  function sameGameVersion(a, b) {
    const left = String(a || "").trim().toLowerCase();
    const right = String(b || "").trim().toLowerCase();
    return Boolean(left && right && left === right);
  }

  function orderedGameVersions(versions, currentVersion) {
    const seen = new Set();
    const list = [];
    for (const value of versions || []) {
      const version = String(value || "").trim();
      const key = version.toLowerCase();
      if (!version || seen.has(key)) continue;
      seen.add(key);
      list.push(version);
    }
    list.sort((a, b) => {
      const currentA = sameGameVersion(a, currentVersion);
      const currentB = sameGameVersion(b, currentVersion);
      if (currentA !== currentB) return currentA ? -1 : 1;
      return compareGameVersions(b, a);
    });
    if (currentVersion && !list.some((version) => sameGameVersion(version, currentVersion))) {
      list.unshift(currentVersion);
    }
    return list;
  }

  function galleryItems() {
    const screenshots = state.details?.data?.remote?.screenshots || [];
    return screenshots
      .map((shot, index) => {
        const full = safeUrl(shot.url) || safeUrl(shot.thumb);
        const thumb = safeUrl(shot.thumb) || full;
        if (!full) return null;
        return {
          full,
          thumb,
          title: String(shot.title || "").trim() || `Скриншот ${index + 1}`,
        };
      })
      .filter(Boolean);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch (_) {
      return date.toLocaleDateString();
    }
  }

  function formatTime(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(date);
    } catch (_) {
      return "";
    }
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    if (!n) return "0";
    try {
      return new Intl.NumberFormat("ru-RU", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
    } catch (_) {
      return String(n);
    }
  }

  function formatBytes(value) {
    let n = Number(value || 0);
    if (!n) return "—";
    const units = ["Б", "КБ", "МБ", "ГБ"];
    let index = 0;
    while (n >= 1024 && index < units.length - 1) {
      n /= 1024;
      index += 1;
    }
    return `${n >= 10 || index === 0 ? Math.round(n) : n.toFixed(1)} ${units[index]}`;
  }

  function releaseLabel(type) {
    if (Number(type) === 1) return "Релиз";
    if (Number(type) === 2) return "Бета";
    if (Number(type) === 3) return "Альфа";
    return "Файл";
  }

  function authorLine(remote) {
    const authors = Array.isArray(remote?.authors)
      ? remote.authors.map(namedValue).filter(Boolean)
      : [];
    return authors.length ? authors.join(", ") : "Автор не указан";
  }

  function namedValue(value) {
    if (typeof value === "string") return value.trim();
    if (value && typeof value === "object") {
      return String(value.name || value.displayName || value.title || "").trim();
    }
    return "";
  }

  function categoryNames(remote, limit = 99) {
    const list = Array.isArray(remote?.categories) ? remote.categories : [];
    return list.map(namedValue).filter(Boolean).slice(0, limit);
  }

  function curseUrl(remote) {
    const direct = safeUrl(remote?.websiteUrl);
    if (direct) return direct;
    if (remote?.slug) return `https://www.curseforge.com/wow/addons/${encodeURIComponent(remote.slug)}`;
    return "";
  }

  function errorText(error) {
    if (error == null) return "Неизвестная ошибка";
    if (typeof error === "string") return error;
    if (typeof error === "object" && error.message) return String(error.message);
    try {
      return JSON.stringify(error);
    } catch (_) {
      return String(error);
    }
  }

  function statusFor(addon) {
    const task = taskFor(addon.key);
    if (task) {
      return {
        addonKey: addon.key,
        status: "installing",
        statusLabel: task.isUpdate ? "Обновление…" : "Установка…",
        tone: "info",
        updateAvailable: false,
        pulsing: true,
      };
    }
    const check = state.checks.get(addon.key);
    if (!check) {
      return {
        addonKey: addon.key,
        status: "unknown",
        statusLabel: "Не проверен",
        tone: "neutral",
        updateAvailable: false,
      };
    }
    return check;
  }

  function taskFor(key) {
    for (const task of state.installTasks.values()) {
      if (task.key === key) return task;
    }
    return null;
  }

  function settlePendingChecks() {
    for (const [key, check] of state.checks.entries()) {
      if (check?.status !== "checking") continue;
      state.checks.set(key, {
        ...check,
        status: "unknown",
        statusLabel: "Не проверен",
        tone: "neutral",
        updateAvailable: false,
        pulsing: false,
      });
    }
  }

  function logoForAddon(addon) {
    const check = state.checks.get(addon.key);
    const modId = Number(addon.curseId || check?.modId || 0);
    if (!modId) return "";
    return safeUrl(state.logoByMod.get(modId) || "");
  }

  function addonAvatar(addon) {
    const tone = avatarTone(addon.primaryFolder || addon.title);
    const logo = logoForAddon(addon);
    return `<div class="addon-avatar avatar-tone-${tone}">
      <span class="avatar-fallback">${esc(initials(addon.title))}</span>
      ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" />` : ""}
    </div>`;
  }

  function statusPill(status, extraTitle = "") {
    const pulse = status.pulsing ? " pulsing" : "";
    const title = extraTitle ? ` title="${esc(extraTitle)}"` : "";
    return `<span class="status-pill ${esc(status.tone || "neutral")}${pulse}"${title}><span class="status-dot"></span>${esc(status.statusLabel || "Не проверен")}</span>`;
  }

  function installedForRemote(remote) {
    if (!remote) return null;
    const title = String(remote.name || "").trim().toLowerCase();
    const slug = String(remote.slug || "").trim().toLowerCase();
    return (
      state.addons.find((addon) => Number(addon.curseId) === Number(remote.id)) ||
      (title && state.addons.find((addon) => String(addon.title).trim().toLowerCase() === title)) ||
      (slug &&
        state.addons.find(
          (addon) => String(addon.primaryFolder || "").trim().toLowerCase() === slug,
        )) ||
      null
    );
  }

  function cacheRemoteLogo(remote) {
    if (remote && remote.id && safeUrl(remote.logo)) {
      state.logoByMod.set(Number(remote.id), remote.logo);
    }
  }

  function computeCounts() {
    let updates = 0;
    let upToDate = 0;
    let attention = 0;
    let unknown = 0;
    for (const addon of state.addons) {
      const status = statusFor(addon);
      if (status.updateAvailable) updates += 1;
      else if (status.status === "upToDate") upToDate += 1;
      else if (["unresolved", "noCompatible", "error"].includes(status.status)) attention += 1;
      else if (status.status === "unknown" || status.status === "checking") unknown += 1;
    }
    return { total: state.addons.length, updates, upToDate, attention, unknown };
  }

  async function registerEvents() {
    if (!listen) return;
    const bindings = [
      ["check-progress", onCheckProgress],
      ["check-result", onCheckResult],
      ["check-finished", onCheckFinished],
      ["install-start", onInstallStart],
      ["install-progress", onInstallProgress],
      ["install-done", onInstallDone],
      ["install-failed", onInstallFailed],
      ["batch-done", onBatchDone],
    ];
    for (const [name, handler] of bindings) {
      try {
        await listen(name, (event) => {
          const payload =
            event && Object.prototype.hasOwnProperty.call(event, "payload") ? event.payload : event;
          try {
            handler(payload || {});
          } catch (error) {
            console.error(`event ${name}`, error);
          }
        });
      } catch (error) {
        console.error(`Не удалось подписаться на ${name}`, error);
      }
    }
  }

  function onCheckProgress(payload) {
    if (!payload) return;
    state.checking = true;
    state.checkProgress = payload;
    const previous = state.checks.get(payload.addonKey);
    state.checks.set(payload.addonKey, {
      ...(previous || {}),
      addonKey: payload.addonKey,
      status: "checking",
      statusLabel: "Проверка…",
      tone: "info",
      updateAvailable: false,
      pulsing: true,
    });
    if (state.page === "installed") render();
  }

  function onCheckResult(payload) {
    if (!payload?.addonKey) return;
    state.checks.set(payload.addonKey, payload);
    render();
  }

  function onCheckFinished(payload) {
    state.checking = false;
    state.checkProgress = null;
    settlePendingChecks();
    state.lastCheck = { ...(payload || {}), at: Date.now() };
    render();
  }

  function onInstallStart(payload) {
    if (!payload?.key) return;
    state.installTasks.set(payload.key, {
      key: payload.key,
      title: payload.title || "Аддон",
      isUpdate: Boolean(payload.isUpdate),
      stage: "resolve",
      message: "Подготовка…",
      downloaded: 0,
      total: 0,
    });
    render();
  }

  function onInstallProgress(payload) {
    if (!payload?.key) return;
    let task = state.installTasks.get(payload.key);
    if (!task) {
      task = {
        key: payload.key,
        title: payload.title || "Аддон",
        isUpdate: false,
        stage: payload.stage || "download",
        message: payload.message || "",
        downloaded: payload.downloaded || 0,
        total: payload.total || 0,
      };
      state.installTasks.set(payload.key, task);
      render();
      return;
    }
    Object.assign(task, payload);
    updateTaskDom(task);
  }

  function onInstallDone(payload) {
    if (!payload?.key) return;
    state.installTasks.delete(payload.key);
    if (!String(payload.key).startsWith("mod:")) {
      const previous = state.checks.get(payload.key);
      state.checks.set(payload.key, {
        ...(previous || {}),
        addonKey: payload.key,
        status: "upToDate",
        statusLabel: "Актуально",
        tone: "success",
        updateAvailable: false,
        error: null,
        pulsing: false,
      });
    }
    render();
  }

  function onInstallFailed(payload) {
    if (!payload?.key) return;
    state.installTasks.delete(payload.key);
    render();
  }

  function onBatchDone(payload) {
    if (payload?.addons) state.addons = payload.addons;
    state.batchActive = false;
    state.installTasks.clear();
    render();
  }

  async function loadBootstrap() {
    setBootText("Поиск установок World of Warcraft…");
    try {
      const data = await invoke("bootstrap");
      applyBootstrap(data);
      hideBoot();
      if (data.settings?.autoCheckUpdates && data.addons?.length) {
        setTimeout(() => checkUpdates({ silent: true }), 380);
      }
    } catch (error) {
      hideBoot();
      state.ready = true;
      state.fatal = errorText(error);
      render();
    }
  }

  function applyBootstrap(data, options = {}) {
    const { autoCheck = true, keepModal = false } = options;
    state.ready = true;
    state.fatal = null;
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.settingsDraft = { ...state.settings };
    state.installs = data.installs || [];
    state.selectedInstall = data.selectedInstall ?? null;
    state.install = data.install || null;
    state.addons = data.addons || [];
    state.storage = data.storage || null;
    state.checks.clear();
    state.installTasks.clear();
    state.checking = false;
    state.checkProgress = null;
    state.lastCheck = null;
    state.batchActive = false;
    state.installModalBusy = false;
    state.catalog.loaded = false;
    state.catalog.results = [];
    state.catalog.hasMore = false;
    state.catalog.error = null;
    state.catalog.page = 0;
    if (!keepModal) {
      state.installModal = false;
      state.details = null;
      state.lightbox = null;
    }
    render();
    if (state.page === "catalog") setTimeout(() => searchCatalog(true), 30);
    if (autoCheck && state.settings.autoCheckUpdates && state.install && state.addons.length) {
      setTimeout(() => checkUpdates({ silent: true }), 380);
    }
  }

  function applySelection(data, options = {}) {
    const { autoCheck = true } = options;
    state.installs = data.installs || [];
    state.selectedInstall = data.selectedInstall ?? null;
    state.install = data.install || null;
    state.addons = data.addons || [];
    state.checks.clear();
    state.installTasks.clear();
    state.checking = false;
    state.checkProgress = null;
    state.lastCheck = null;
    state.batchActive = false;
    state.installModal = false;
    state.installModalBusy = false;
    state.catalog.loaded = false;
    state.catalog.results = [];
    state.catalog.hasMore = false;
    state.catalog.error = null;
    state.catalog.page = 0;
    render();
    if (state.page === "catalog") setTimeout(() => searchCatalog(true), 30);
    if (autoCheck && state.settings.autoCheckUpdates && state.install && state.addons.length) {
      setTimeout(() => checkUpdates({ silent: true }), 380);
    }
  }

  function render() {
    if (!state.ready && !state.fatal) return;
    const active = document.activeElement;
    const focusId = active && active.id ? active.id : null;
    let selectionStart = null;
    let selectionEnd = null;
    try {
      selectionStart = active?.selectionStart ?? null;
      selectionEnd = active?.selectionEnd ?? null;
    } catch (_) {
      selectionStart = null;
    }

    renderSidebar();
    const header = $("page-header");
    const progress = $("global-progress");
    const view = $("view");
    const modalRoot = $("modal-root");
    if (!header || !view || !modalRoot) return;

    if (state.fatal) {
      header.innerHTML = "";
      if (progress) progress.innerHTML = "";
      view.innerHTML = renderFatal();
      modalRoot.innerHTML = "";
      return;
    }

    renderHeader();
    if (progress) progress.innerHTML = renderInstallTasks();
    view.innerHTML = renderView();
    modalRoot.innerHTML = renderModals();

    const detailsBody = modalRoot.querySelector(".details-body");
    if (detailsBody) detailsBody.scrollTop = state.detailsScroll || 0;

    const activeLightboxThumb = modalRoot.querySelector(".lightbox-thumb.active");
    if (activeLightboxThumb) {
      activeLightboxThumb.scrollIntoView({ block: "nearest", inline: "center" });
    }

    if (focusId) {
      const element = document.getElementById(focusId);
      if (element) {
        try {
          element.focus({ preventScroll: true });
          if (selectionStart != null && typeof element.setSelectionRange === "function") {
            element.setSelectionRange(selectionStart, selectionEnd ?? selectionStart);
          }
        } catch (_) {
          /* ignore focus restoration errors */
        }
      }
    }
  }

  function renderSidebar() {
    document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
      item.classList.toggle("active", item.dataset.page === state.page);
    });
    const counts = computeCounts();
    const badge = $("nav-updates");
    if (badge) {
      badge.textContent = counts.updates ? String(counts.updates) : "";
      badge.hidden = counts.updates === 0;
    }
    const chip = $("install-card");
    if (!chip) return;
    if (state.install) {
      chip.classList.remove("no-install");
      chip.innerHTML = `
        <span class="install-card-label">Установка</span>
        <span class="install-card-main">${esc(state.install.flavorLabel || state.install.displayName)}<span style="color: var(--dim); font-weight: 500;"> · ${esc(state.install.version || "—")}</span></span>
        <span class="install-card-path">${esc(state.install.flavorDir || state.install.root || "")}</span>`;
    } else {
      chip.classList.add("no-install");
      chip.innerHTML = `
        <span class="install-card-label">Установка</span>
        <span class="install-card-main">Игра не найдена</span>
        <span class="install-card-path">Нажмите, чтобы указать папку</span>`;
    }
  }

  function renderHeader() {
    const header = $("page-header");
    if (!header) return;
    const counts = computeCounts();
    const busy = state.checking || state.installTasks.size > 0 || state.batchActive;
    if (state.page === "installed") {
      const subtitle = state.install
        ? `${state.install.displayName} · ${state.install.version || "версия неизвестна"}${state.install.interface ? ` · Interface ${state.install.interface}` : ""}`
        : "World of Warcraft не обнаружен";
      header.innerHTML = `
        <div class="page-title">
          <div class="eyebrow"><span class="eyebrow-line"></span>Библиотека</div>
          <h1>Установленные аддоны</h1>
          <p>${esc(subtitle)}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-action="check-updates" ${!state.install || !state.addons.length || busy ? "disabled" : ""}>
            ${icon("refresh", state.checking ? "spin" : "")}
            ${state.checking ? "Проверка…" : "Проверить обновления"}
          </button>
          <button class="btn btn-primary" type="button" data-action="update-all" ${!counts.updates || busy ? "disabled" : ""}>
            ${icon("download")}
            Обновить всё${counts.updates ? ` · ${counts.updates}` : ""}
          </button>
        </div>`;
      return;
    }
    if (state.page === "catalog") {
      header.innerHTML = `
        <div class="page-title">
          <div class="eyebrow"><span class="eyebrow-line"></span>CurseForge</div>
          <h1>Каталог аддонов</h1>
          <p>${state.install ? `Подбор файлов для ${esc(state.install.version || state.install.flavorLabel)}` : "Выберите установку игры, чтобы фильтровать версии"}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-action="catalog-refresh" ${state.catalog.loading ? "disabled" : ""}>
            ${icon("refresh", state.catalog.loading ? "spin" : "")} Обновить каталог
          </button>
        </div>`;
      return;
    }
    header.innerHTML = `
      <div class="page-title">
        <div class="eyebrow"><span class="eyebrow-line"></span>Приложение</div>
        <h1>Настройки</h1>
        <p>Подключение, обновления и локальное хранилище</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" type="button" data-action="open-storage" data-kind="data">
          ${icon("folder")} Папка данных
        </button>
      </div>`;
  }

  function renderFatal() {
    return `<div class="empty-hero">
      <div class="empty-emblem">${icon("shield")}</div>
      <div class="eyebrow">Ошибка запуска</div>
      <h2>Не удалось загрузить приложение</h2>
      <p>${esc(state.fatal)}</p>
      <div class="empty-actions">
        <button class="btn btn-primary" type="button" data-action="retry-bootstrap">${icon("refresh")} Повторить</button>
      </div>
    </div>`;
  }

  function renderInstallTasks() {
    if (!state.installTasks.size) return "";
    const tasks = [...state.installTasks.values()];
    return `<div class="task-stack">${tasks
      .map((task) => {
        const known = Number(task.total) > 0;
        const percent = known
          ? Math.max(0, Math.min(100, Math.round((Number(task.downloaded || 0) * 100) / Number(task.total))))
          : 0;
        const indeterminate = task.stage !== "download" || !known;
        return `<div class="task-card" data-task-key="${esc(task.key)}">
          <div class="task-icon">${icon("download")}</div>
          <div class="task-body">
            <div class="task-head">
              <span class="task-title">${esc(task.title)}</span>
              <span class="task-message">${esc(task.message || "Подготовка…")}</span>
            </div>
            <div class="task-bar${indeterminate ? " indeterminate" : ""}"><span style="width:${indeterminate ? 35 : percent}%"></span></div>
          </div>
          <span class="task-percent">${indeterminate ? "…" : `${percent}%`}</span>
        </div>`;
      })
      .join("")}</div>`;
  }

  function updateTaskDom(task) {
    const cards = document.querySelectorAll(".task-card[data-task-key]");
    for (const card of cards) {
      if (card.dataset.taskKey !== task.key) continue;
      const message = card.querySelector(".task-message");
      const bar = card.querySelector(".task-bar");
      const fill = card.querySelector(".task-bar span");
      const percent = card.querySelector(".task-percent");
      if (message) message.textContent = task.message || "Подготовка…";
      const known = Number(task.total) > 0;
      const indeterminate = task.stage !== "download" || !known;
      const value = known
        ? Math.max(0, Math.min(100, Math.round((Number(task.downloaded || 0) * 100) / Number(task.total))))
        : 0;
      if (bar) bar.classList.toggle("indeterminate", indeterminate);
      if (fill && !indeterminate) fill.style.width = `${value}%`;
      if (percent) percent.textContent = indeterminate ? "…" : `${value}%`;
      return;
    }
    render();
  }

  function toast(title, message = "", tone = "info", timeout = 5200) {
    const id = ++state.toastSeq;
    state.toasts.push({ id, title, message, tone, timeout });
    renderToasts();
    setTimeout(() => {
      state.toasts = state.toasts.filter((item) => item.id !== id);
      renderToasts();
    }, timeout);
  }

  function renderToasts() {
    const root = $("toasts");
    if (!root) return;
    root.innerHTML = state.toasts
      .map(
        (item) => `<div class="toast ${esc(item.tone)}">
          <div class="toast-copy">
            <div class="toast-title">${esc(item.title)}</div>
            ${item.message ? `<div class="toast-message">${esc(item.message).replace(/\n/g, "<br>")}</div>` : ""}
          </div>
          <button class="toast-close" type="button" data-action="close-toast" data-toast-id="${item.id}" aria-label="Закрыть">${icon("close")}</button>
        </div>`,
      )
      .join("");
  }

  function setBootText(text) {
    const element = $("boot-text");
    if (element) element.textContent = text;
  }

  function showBoot() {
    const boot = $("boot-screen");
    if (!boot) return;
    boot.classList.remove("hidden");
  }

  function hideBoot() {
    const boot = $("boot-screen");
    if (!boot) return;
    boot.classList.add("hidden");
  }

  function renderView() {
    if (state.page === "installed") return renderInstalledPage();
    if (state.page === "catalog") return renderCatalogPage();
    return renderSettingsPage();
  }

  function renderInstalledPage() {
    if (!state.install) return renderNoInstall();
    const counts = computeCounts();
    const stats = `<div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Всего установлено</div>
        <div class="stat-value">${counts.total}</div>
        <div class="stat-note">${state.addons.reduce((sum, addon) => sum + (addon.folders?.length || 1), 0)} ${plural(state.addons.reduce((sum, addon) => sum + (addon.folders?.length || 1), 0), "папка", "папки", "папок")} в AddOns</div>
      </div>
      <div class="stat-card tone-warning">
        <div class="stat-label">Доступно обновлений</div>
        <div class="stat-value">${counts.updates}</div>
        <div class="stat-note">${counts.updates ? "готовы к установке" : "всё актуально"}</div>
      </div>
      <div class="stat-card tone-success">
        <div class="stat-label">Актуальны</div>
        <div class="stat-value">${counts.upToDate}</div>
        <div class="stat-note">последние версии</div>
      </div>
      <div class="stat-card ${counts.attention ? "tone-danger" : ""}">
        <div class="stat-label">Требуют внимания</div>
        <div class="stat-value">${counts.attention}</div>
        <div class="stat-note">CurseForge или версия игры</div>
      </div>
    </div>`;

    if (!state.addons.length) {
      return `${stats}<div class="empty-state">
        <div class="empty-emblem">${icon("gamepad")}</div>
        <h2>В AddOns пока нет аддонов</h2>
        <p>Папка AddOns найдена, но аддонов в ней нет. Откройте каталог CurseForge и установите первый аддон — файлы будут распакованы автоматически.</p>
        <div class="empty-actions">
          <button class="btn btn-primary" type="button" data-action="nav" data-page="catalog">${icon("compass")} Открыть каталог</button>
          <button class="btn btn-secondary" type="button" data-action="refresh-addons">${icon("refresh")} Обновить список</button>
        </div>
      </div>`;
    }

    const filtered = filteredAddons();
    const note = state.checking
      ? `${state.checkProgress?.current || 0} из ${state.checkProgress?.total || state.addons.length}`
      : state.lastCheck
        ? `Проверено в ${formatTime(state.lastCheck.at)}`
        : "Проверка ещё не выполнялась";

    return `${stats}
      ${state.checking ? renderCheckCard() : ""}
      <div class="installed-toolbar">
        <div class="search-box">
          ${icon("search")}
          <input id="installed-search" data-input="installed-search" type="text" value="${esc(state.installedQuery)}" placeholder="Поиск среди установленных аддонов…" autocomplete="off" spellcheck="false" />
        </div>
        <div class="segmented">
          <button type="button" data-action="filter-installed" data-filter="all" class="${state.installedFilter === "all" ? "active" : ""}">Все</button>
          <button type="button" data-action="filter-installed" data-filter="updates" class="${state.installedFilter === "updates" ? "active" : ""}">Обновления${counts.updates ? ` · ${counts.updates}` : ""}</button>
          <button type="button" data-action="filter-installed" data-filter="attention" class="${state.installedFilter === "attention" ? "active" : ""}">Проблемы${counts.attention ? ` · ${counts.attention}` : ""}</button>
        </div>
        <div class="toolbar-note">${esc(note)}</div>
      </div>
      ${filtered.length ? `<div class="addon-list">${filtered.map(renderAddonRow).join("")}</div>` : renderInstalledEmpty()}`;
  }

  function renderCheckCard() {
    const total = Number(state.checkProgress?.total || state.addons.length || 0);
    const current = Number(state.checkProgress?.current || 0);
    const percent = total ? Math.min(100, Math.round((current * 100) / total)) : 0;
    return `<div class="check-card">
      <span class="check-spinner"></span>
      <div class="check-copy">
        <div class="check-title">Проверка обновлений CurseForge</div>
        <div class="check-sub">${current && total ? `${current} из ${total} · ${esc(state.checkProgress?.title || "")}` : "Подготовка к проверке…"}</div>
      </div>
      <div class="check-progress"><span style="width:${percent}%"></span></div>
      <span class="check-percent">${percent}%</span>
    </div>`;
  }

  function filteredAddons() {
    const query = state.installedQuery.trim().toLowerCase();
    return state.addons.filter((addon) => {
      if (query) {
        const haystack = [addon.title, addon.author, addon.primaryFolder, ...(addon.folders || [])]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (state.installedFilter === "updates") return Boolean(statusFor(addon).updateAvailable);
      if (state.installedFilter === "attention") {
        return ["unresolved", "noCompatible", "error"].includes(statusFor(addon).status);
      }
      return true;
    });
  }

  function renderInstalledEmpty() {
    if (state.installedQuery.trim() || state.installedFilter !== "all") {
      return `<div class="empty-state">
        <div class="empty-emblem">${icon("search")}</div>
        <h2>Ничего не найдено</h2>
        <p>Попробуйте изменить запрос или сбросить фильтр. Поиск работает по названию, автору и папкам аддона.</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" data-action="reset-installed-filter">${icon("refresh")} Сбросить фильтр</button>
        </div>
      </div>`;
    }
    return `<div class="empty-state">
      <div class="empty-emblem">${icon("info")}</div>
      <h2>Список пуст</h2>
      <p>Обновите список установленных аддонов или проверьте папку AddOns в настройках.</p>
    </div>`;
  }

  function renderAddonRow(addon) {
    const status = statusFor(addon);
    const task = taskFor(addon.key);
    const latest = status.latest
      ? fileVersionLabel(status.modName || addon.title, status.latest)
      : "";
    const folders = addon.folders || [];
    const folderChips = folders
      .slice(0, 2)
      .map((folder) => `<span class="folder-chip">${esc(folder)}</span>`)
      .join("");
    const moreFolders = folders.length > 2 ? `<span class="folder-chip">+${folders.length - 2}</span>` : "";
    const meta = [
      addon.author ? esc(addon.author) : "Автор не указан",
      `${folders.length || 1} ${plural(folders.length || 1, "папка", "папки", "папок")}`,
      addon.interface ? `Interface ${addon.interface}` : "",
    ].filter(Boolean);

    let primaryAction = "";
    if (task) {
      primaryAction = `<button class="btn btn-secondary btn-sm" type="button" disabled>${icon("refresh", "spin")} В процессе</button>`;
    } else if (status.updateAvailable) {
      primaryAction = `<button class="btn btn-primary btn-sm" type="button" data-action="update-addon" data-key="${esc(addon.key)}">${icon("download")} Обновить</button>`;
    } else if (["unknown", "error", "unresolved", "noCompatible"].includes(status.status)) {
      primaryAction = `<button class="btn btn-secondary btn-sm" type="button" data-action="check-addon" data-key="${esc(addon.key)}">${icon("refresh")} Проверить</button>`;
    }

    return `<div class="addon-row">
      ${addonAvatar(addon)}
      <div class="addon-main">
        <div class="addon-title-line">
          <span class="addon-title" title="${esc(addon.title)}">${esc(addon.title)}</span>
          ${statusPill(status, status.error || "")}
        </div>
        <div class="addon-meta">
          ${meta.map((item) => `<span>${item}</span>`).join('<span class="meta-dot"></span>')}
        </div>
        ${folderChips || moreFolders ? `<div class="folder-chips">${folderChips}${moreFolders}</div>` : ""}
      </div>
      <div class="version-cell">
        <div class="version-current" title="Установленная версия">${esc(addon.displayVersion || addon.version || "—")}</div>
        ${status.updateAvailable && latest ? `<div class="version-next">${icon("arrowUp")} ${esc(latest)}</div>` : `<div class="version-next version-unknown">${status.status === "upToDate" ? "актуально" : status.status === "checking" || task ? "проверка…" : ""}</div>`}
      </div>
      <div class="row-actions">
        ${primaryAction}
        <button class="btn btn-ghost btn-sm" type="button" data-action="details-installed" data-key="${esc(addon.key)}" title="Подробнее об аддоне">${icon("info")} Детали</button>
      </div>
    </div>`;
  }

  function renderNoInstall() {
    return `<div class="empty-hero">
      <div class="empty-emblem">${icon("compass")}</div>
      <div class="eyebrow">Начало работы</div>
      <h2>World of Warcraft не найден</h2>
      <p>Addon Forge автоматически ищет Retail, Classic, Classic Era и Forever. Если игра установлена на другом диске, укажите папку вручную — приложение найдёт нужный каталог AddOns.</p>
      <div class="empty-actions">
        <button class="btn btn-primary" type="button" data-action="choose-folder">${icon("folder")} Указать папку</button>
        <button class="btn btn-secondary" type="button" data-action="rescan-installs">${icon("search")} Искать снова</button>
      </div>
      <div class="empty-hint">Можно выбрать папку игры, папку версии (_retail_, _forever_) или Interface/AddOns.</div>
    </div>`;
  }

  function renderCatalogPage() {
    const catalog = state.catalog;
    const sortOptions = [
      ["popular", "По популярности"],
      ["updated", "Недавно обновлённые"],
      ["name", "По алфавиту"],
    ];
    const toolbar = `<div class="catalog-toolbar">
      <div class="search-box">
        ${icon("search")}
        <input id="catalog-search" data-input="catalog-search" type="text" value="${esc(catalog.query)}" placeholder="Название аддона или ключевое слово…" autocomplete="off" spellcheck="false" />
      </div>
      <div class="select-wrap">
        <select id="catalog-sort" data-input="catalog-sort" aria-label="Сортировка каталога">
          ${sortOptions.map(([value, label]) => `<option value="${value}" ${catalog.sort === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      <button class="btn btn-secondary btn-icon" type="button" data-action="catalog-refresh" title="Обновить каталог">${icon("refresh", catalog.loading ? "spin" : "")}</button>
    </div>`;

    const count = catalog.results.length;
    const statusLine = `<div class="catalog-status">
      ${catalog.loading ? `<span class="check-spinner" style="width:12px;height:12px;flex-basis:12px;border-width:1px"></span><span>Загрузка каталога CurseForge…</span>` : `<span>${count ? `Показано ${count} ${plural(count, "аддон", "аддона", "аддонов")}` : "Каталог CurseForge"}</span>${catalog.hasMore ? "<span>· есть ещё</span>" : ""}`}
      ${!state.install ? '<span>· установка не выбрана, фильтр по версии игры отключён</span>' : ""}
    </div>`;

    let content = "";
    if (catalog.error) {
      content = `<div class="error-panel">
        <h3>Не удалось загрузить каталог</h3>
        <p>${esc(catalog.error)}</p>
        <button class="btn btn-secondary btn-sm" type="button" data-action="catalog-refresh">${icon("refresh")} Повторить</button>
      </div>`;
      if (catalog.results.length) {
        content += `<div class="catalog-grid" style="margin-top:12px">${catalog.results.map(renderCatalogCard).join("")}</div>`;
      }
    } else if (catalog.loading && !catalog.results.length) {
      content = `<div class="catalog-grid">${Array.from({ length: 6 }, renderCatalogSkeleton).join("")}</div>`;
    } else if (!catalog.loaded) {
      content = `<div class="catalog-grid">${Array.from({ length: 4 }, renderCatalogSkeleton).join("")}</div>`;
    } else if (!catalog.results.length) {
      content = `<div class="empty-state">
        <div class="empty-emblem">${icon("search")}</div>
        <h2>Ничего не найдено</h2>
        <p>${catalog.query ? `По запросу «${esc(catalog.query)}» ничего не найдено.` : "Каталог пуст."} Попробуйте другое название или измените сортировку.</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" data-action="catalog-reset">${icon("refresh")} Сбросить поиск</button>
        </div>
      </div>`;
    } else {
      content = `<div class="catalog-grid">${catalog.results.map(renderCatalogCard).join("")}</div>`;
      if (catalog.hasMore) {
        content += `<div class="load-more-row"><button class="btn btn-secondary" type="button" data-action="catalog-more" ${catalog.loading ? "disabled" : ""}>${icon("download")} ${catalog.loading ? "Загрузка…" : "Показать ещё"}</button></div>`;
      }
    }

    return `${toolbar}${statusLine}${content}`;
  }

  function renderCatalogSkeleton() {
    return `<div class="addon-card skeleton">
      <div class="card-top">
        <div class="skeleton-block"></div>
        <div style="flex:1;padding-top:3px">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
      <div class="skeleton-line body"></div>
      <div class="skeleton-line body2"></div>
      <div style="margin-top:auto;padding-top:14px"><div class="skeleton-line short" style="width:42%;height:20px"></div></div>
    </div>`;
  }

  function renderCatalogCard(remote) {
    const installed = installedForRemote(remote);
    const check = installed ? state.checks.get(installed.key) : null;
    const latest = remote.latestFile;
    const version = fileVersionLabel(remote.name, latest);
    const logo = safeUrl(remote.logo);
    const categories = categoryNames(remote, 3);
    const busy = state.installTasks.size > 0 || state.batchActive;
    const isUpdate = Boolean(check?.updateAvailable);
    const summary = String(remote.summary || "").trim() || "Описание не опубликовано.";

    let badge = "";
    if (installed && isUpdate) badge = '<span class="badge badge-warning">Есть обновление</span>';
    else if (installed) badge = '<span class="badge badge-success">Установлен</span>';

    let primary = "";
    if (isUpdate) {
      primary = `<button class="btn btn-primary" type="button" data-action="update-addon" data-key="${esc(installed.key)}" ${busy ? "disabled" : ""}>${icon("download")} Обновить</button>`;
    } else if (installed) {
      primary = `<button class="btn btn-secondary" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}">${icon("info")} Подробнее</button>`;
    } else {
      primary = `<button class="btn btn-primary" type="button" data-action="catalog-install" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" ${busy || !latest ? "disabled" : ""} title="${latest ? "Установить последнюю версию" : "Нет файла для вашей версии игры"}">${icon("download")} Установить</button>`;
    }

    const detailsButton = !(installed && !isUpdate)
      ? `<button class="btn btn-ghost btn-icon" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" title="Подробнее">${icon("info")}</button>`
      : "";

    return `<article class="addon-card">
      <div class="card-top">
        <div class="card-logo-wrap" style="--tone:${avatarTone(remote.slug || remote.name)}">
          <span>${esc(initials(remote.name))}</span>
          ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" />` : ""}
        </div>
        <div class="card-title-wrap">
          <button class="card-title" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" title="${esc(remote.name)}">${esc(remote.name)}</button>
          <div class="card-author">${esc(authorLine(remote))}</div>
          <div class="card-badges">
            ${badge}
            ${version ? `<span class="card-version" title="Последняя версия">${esc(version)}</span>` : ""}
          </div>
        </div>
      </div>
      <p class="card-summary">${esc(summary)}</p>
      ${categories.length ? `<div class="card-categories">${categories.map((category) => `<span class="category-chip">${esc(category)}</span>`).join("")}</div>` : ""}
      <div class="card-footer">
        <div class="card-stats">
          <span>${icon("download")} ${formatNumber(remote.downloadCount)}</span>
          <span>${icon("clock")} ${formatDate(remote.dateModified)}</span>
        </div>
        <div class="card-actions">${detailsButton}${primary}</div>
      </div>
    </article>`;
  }

  function renderSettingsPage() {
    const install = state.install;
    const draft = state.settingsDraft;
    const settings = state.settings;
    const storage = state.storage || {};
    const official = Boolean(draft.useOfficialApi);
    const key = String(draft.apiKey || "");
    const keyHint = official && !key.trim()
      ? '<div class="hint warning">Официальный API не будет работать без ключа. Получите ключ в CurseForge Console.</div>'
      : key.trim()
        ? '<div class="hint success">Ключ сохранён локально и не покидает этот компьютер.</div>'
        : '<div class="hint">Для прокси ключ не требуется. Официальный API доступен с личным ключом CurseForge.</div>';

    const installSection = install
      ? `<div class="install-summary ${install.flavor === "_forever_" ? "flavor-forever" : ""}">
          <div class="install-summary-icon">${icon("gamepad")}</div>
          <div class="install-summary-copy">
            <div class="install-summary-title">${esc(install.displayName)}</div>
            <div class="install-summary-meta">${esc(install.flavorDir)}</div>
          </div>
          <span class="badge badge-success install-summary-badge">v${esc(install.version || install.build || "—")}</span>
        </div>
        <div class="settings-actions">
          <button class="btn btn-secondary btn-sm" type="button" data-action="open-install-modal">${icon("gamepad")} Сменить установку</button>
          <button class="btn btn-secondary btn-sm" type="button" data-action="choose-folder">${icon("folder")} Указать папку</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="rescan-installs">${icon("search")} Найти установки</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="refresh-addons">${icon("refresh")} Обновить аддоны</button>
        </div>`
      : `<div class="error-panel" style="margin:0">
          <h3>Установка не выбрана</h3>
          <p>Найдите World of Warcraft автоматически или укажите папку игры вручную.</p>
          <div class="settings-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="choose-folder">${icon("folder")} Указать папку</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="rescan-installs">${icon("search")} Найти установки</button>
          </div>
        </div>`;

    const storageRows = [
      ["Конфигурация", storage.configPath, "config"],
      ["Манифест", storage.manifestPath, "manifest"],
      ["Резервные копии", storage.backupsPath, "backups"],
      ["Загрузки", storage.downloadsPath, "downloads"],
    ]
      .map(
        ([label, path, kind]) => `<div class="storage-row">
          <span class="storage-label">${label}</span>
          <span class="storage-path" title="${esc(path || "")}">${esc(path || "—")}</span>
          <button class="btn btn-ghost" type="button" data-action="open-storage" data-kind="${kind}" ${path ? "" : "disabled"}>${icon("folder")} Открыть</button>
        </div>`,
      )
      .join("");

    return `<div class="settings-grid">
      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("gamepad")}</div>
          <div><h2>Установка World of Warcraft</h2><p>Версия игры определяет, какие файлы CurseForge будут скачаны.</p></div>
        </div>
        ${installSection}
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="section-icon">${icon("key")}</div>
          <div><h2>CurseForge API</h2><p>По умолчанию используется публичный прокси без ключа.</p></div>
        </div>
        <div class="choice-grid">
          <button class="api-choice ${official ? "" : "selected"}" type="button" data-action="set-api-mode" data-official="false">
            <span class="choice-title">Прокси без ключа</span>
            <span class="choice-desc">api.curse.tools · работает сразу</span>
          </button>
          <button class="api-choice ${official ? "selected" : ""}" type="button" data-action="set-api-mode" data-official="true">
            <span class="choice-title">Официальный API</span>
            <span class="choice-desc">api.curseforge.com · нужен ключ</span>
          </button>
        </div>
        <div class="field-label">API-ключ CurseForge</div>
        <div class="key-row">
          <div class="input-with-action">
            <input id="api-key-input" data-input="api-key" type="${state.showApiKey ? "text" : "password"}" value="${esc(key)}" placeholder="Вставьте ключ…" autocomplete="off" spellcheck="false" />
            <button class="key-toggle" type="button" data-action="toggle-api-key">${state.showApiKey ? "Скрыть" : "Показать"}</button>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="save-api-key">${icon("check")} Сохранить</button>
        </div>
        ${keyHint}
        <div class="hint"><button class="btn btn-ghost btn-sm" style="height:auto;padding:0;margin-top:2px;font-size:11.5px;color:var(--gold)" type="button" data-action="open-url" data-url="https://console.curseforge.com/">Открыть CurseForge Console ${icon("external")}</button></div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="section-icon">${icon("shield")}</div>
          <div><h2>Обновления и копии</h2><p>Поведение проверки и безопасность установки.</p></div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-title">Проверять обновления при запуске</div>
            <div class="settings-row-desc">Сверять установленные аддоны с CurseForge автоматически.</div>
          </div>
          <button class="switch ${settings.autoCheckUpdates ? "on" : ""}" type="button" role="switch" aria-checked="${settings.autoCheckUpdates}" data-action="toggle-setting" data-field="autoCheckUpdates"><span></span></button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-title">Сохранять резервные копии</div>
            <div class="settings-row-desc">Перед заменой файлов создавать копию старых папок в локальном хранилище.</div>
          </div>
          <button class="switch ${settings.keepBackups ? "on" : ""}" type="button" role="switch" aria-checked="${settings.keepBackups}" data-action="toggle-setting" data-field="keepBackups"><span></span></button>
        </div>
        <div class="hint">Резервные копии хранятся в LocalAppData и позволяют вручную откатить установку.</div>
      </section>

      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("database")}</div>
          <div><h2>Локальное хранилище</h2><p>Конфигурация, манифест установок, архивы и резервные копии.</p></div>
        </div>
        <div class="storage-list">${storageRows}</div>
      </section>

      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("sparkle")}</div>
          <div><h2>О приложении</h2><p>Addon Forge — менеджер аддонов World of Warcraft на Rust и Tauri.</p></div>
        </div>
        <p class="about-copy">Приложение читает TOC-метаданные установленных аддонов, определяет проект CurseForge, подбирает совместимый файл и безопасно распаковывает архив в папку AddOns. Перед заменой существующих папок создаётся резервная копия.</p>
        <div class="about-links">
          <button class="btn btn-secondary btn-sm" type="button" data-action="open-url" data-url="https://www.curseforge.com/wow/addons">${icon("external")} CurseForge</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="nav" data-page="catalog">${icon("compass")} Открыть каталог</button>
        </div>
        <div class="about-meta">
          <div class="about-meta-item"><strong>Версия</strong>0.1.0</div>
          <div class="about-meta-item"><strong>Интерфейс</strong>Tauri 2 + HTML/CSS/JS</div>
          <div class="about-meta-item"><strong>Источник</strong>CurseForge</div>
        </div>
      </section>
    </div>`;
  }

  function renderModals() {
    return `${renderDetailsModal()}${renderInstallModal()}${renderLightbox()}`;
  }

  function modalCloseButton(action = "details-close") {
    return `<button class="modal-close" type="button" data-action="${action}" aria-label="Закрыть">${icon("close")}</button>`;
  }

  function renderDetailsModal() {
    const details = state.details;
    if (!details?.open) return "";

    if (details.loading) {
      return `<div class="modal-backdrop" data-action="details-backdrop">
        <div class="modal details-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><h2>${esc(details.title || "Аддон CurseForge")}</h2><p>Загрузка описания с CurseForge…</p></div>
            ${modalCloseButton()}
          </div>
          <div class="details-loading"><span class="loading-ring"></span><span>Получение информации…</span></div>
        </div>
      </div>`;
    }

    if (details.error) {
      return `<div class="modal-backdrop" data-action="details-backdrop">
        <div class="modal details-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><h2>${esc(details.title || "Аддон CurseForge")}</h2><p>Не удалось получить данные проекта.</p></div>
            ${modalCloseButton()}
          </div>
          <div class="modal-error">
            <div class="empty-emblem">${icon("info")}</div>
            <h3>Ошибка загрузки</h3>
            <p>${esc(details.error)}</p>
            <button class="btn btn-secondary btn-sm" type="button" data-action="details-retry">${icon("refresh")} Повторить</button>
          </div>
        </div>
      </div>`;
    }

    const data = details.data;
    if (!data) return "";
    const remote = data.remote || {};
    const screenshots = (remote.screenshots || []).filter((shot) => safeUrl(shot.url) || safeUrl(shot.thumb));
    const initialHero = largestScreenshot(screenshots);
    const heroUrl = safeUrl(details.activeShot) || safeUrl(initialHero?.url) || safeUrl(initialHero?.thumb);
    const logo = safeUrl(remote.logo);
    const file = data.latest || remote.latestFile || null;
    const installed = details.key
      ? state.addons.find((addon) => addon.key === details.key) || null
      : installedForRemote(remote);
    const check = installed ? state.checks.get(installed.key) : null;
    const latestLabel = fileVersionLabel(remote.name || installed?.title || "", file);
    const busy = state.installTasks.size > 0 || state.batchActive;
    const external = curseUrl(remote);
    const isUpdate = Boolean(installed && check?.updateAvailable);
    const actionLabel = !file
      ? "Нет версии для игры"
      : busy
        ? "Подождите…"
        : installed
          ? isUpdate
            ? `Обновить${latestLabel ? ` · ${latestLabel}` : ""}`
            : "Переустановить"
          : `Установить${latestLabel ? ` · ${latestLabel}` : ""}`;

    const note = !file
      ? "Для выбранной версии игры у проекта нет подходящего файла."
      : installed
        ? isUpdate
          ? "Текущая версия будет заменена, старая папка сохранится в резервной копии."
          : "Аддон уже установлен. Можно переустановить последнюю версию поверх текущей."
        : `Файл ${esc(file.fileName || file.displayName || "")} будет распакован в AddOns.`;

    const localVersion = String(state.install?.version || "").trim();
    const supportedVersions = [...(data.supportedGameVersions || [])];
    if (!supportedVersions.length) {
      for (const remoteFile of data.files || []) {
        supportedVersions.push(...(remoteFile.gameVersions || []));
      }
    }
    const supportedVersionKeys = new Set(
      supportedVersions.map((version) => String(version || "").trim().toLowerCase()).filter(Boolean),
    );
    const gameVersions = orderedGameVersions(supportedVersions, localVersion);
    const currentVersionAvailable =
      !localVersion ||
      gameVersions.some(
        (version) =>
          sameGameVersion(version, localVersion) && supportedVersionKeys.has(version.toLowerCase()),
      );
    const gameVersionChips = gameVersions
      .map((version) => {
        const isCurrent = sameGameVersion(version, localVersion);
        const isSupported = supportedVersionKeys.has(String(version).toLowerCase());
        const classes = ["game-version-chip", isSupported ? "supported" : "missing"];
        if (isCurrent) classes.push("current");
        const marker = isSupported ? icon("check") : icon("info");
        const tag = isCurrent
          ? `<span class="version-tag">${isSupported ? "ваша" : "нет файла"}</span>`
          : "";
        const title = isCurrent
          ? isSupported
            ? "Ваша версия игры поддерживается"
            : "Для вашей версии игры нет подходящего файла"
          : "Для этой версии игры доступен файл";
        return `<span class="${classes.join(" ")}" title="${esc(title)}">${marker}${esc(version)}${tag}</span>`;
      })
      .join("");
    const categories = categoryNames(remote, 6);
    const gallery = galleryItems();
    const screenshotThumbs = gallery
      .slice(0, 6)
      .map((shot, index) => {
        const active = heroUrl && shot.full === heroUrl;
        const more =
          gallery.length > 6 && index === 5
            ? `<span class="shot-more">+${gallery.length - 6}</span>`
            : "";
        return `<button class="shot-thumb ${active ? "active" : ""}" type="button" data-action="details-shot" data-index="${index}" title="${esc(shot.title)}" aria-label="Открыть галерею: ${esc(shot.title)}">
          <img src="${esc(shot.thumb)}" alt="" loading="lazy" />
          ${more}
        </button>`;
      })
      .join("");

    return `<div class="modal-backdrop" data-action="details-backdrop">
      <div class="modal details-modal" role="dialog" aria-modal="true" aria-label="${esc(remote.name || "Аддон")}">
        <div class="details-hero">
          <div class="details-hero-bg"${heroUrl ? ` style="background-image:url('${cssUrl(heroUrl)}')"` : ""}></div>
          <div class="details-hero-content">
            <div class="details-logo">
              <span>${esc(initials(remote.name))}</span>
              ${logo ? `<img src="${esc(logo)}" alt="" />` : ""}
            </div>
            <div class="details-title-wrap">
              <h2 class="details-title" title="${esc(remote.name || "")}">${esc(remote.name || "Без названия")}</h2>
              <div class="details-meta-line">
                <span>${esc(authorLine(remote))}</span>
                <span class="meta-dot"></span>
                <span>${formatNumber(remote.downloadCount)} загрузок</span>
                <span class="meta-dot"></span>
                <span>Обновлён ${formatDate(remote.dateModified)}</span>
              </div>
            </div>
            <div class="details-hero-actions">
              ${external ? `<button class="btn btn-secondary btn-icon" type="button" data-action="open-url" data-url="${esc(external)}" title="Открыть на CurseForge">${icon("external")}</button>` : ""}
              ${modalCloseButton()}
            </div>
          </div>
        </div>

        <div class="details-body">
          <div class="details-layout">
            <div>
              <div class="details-section-label">Описание</div>
              ${formatDescription(data.description)}
            </div>
            <aside class="details-side">
              <div class="side-block">
                <div class="side-block-title">Версия</div>
                <div class="side-list">
                  <div class="side-pair"><span class="label">Последняя</span><span class="value" style="color:var(--gold)">${esc(latestLabel || "—")}</span></div>
                  <div class="side-pair"><span class="label">Тип</span><span class="value">${esc(releaseLabel(file?.releaseType))}</span></div>
                  <div class="side-pair"><span class="label">Размер</span><span class="value">${formatBytes(file?.fileLength)}</span></div>
                  <div class="side-pair"><span class="label">Файл</span><span class="value" title="${esc(file?.fileName || "")}">${esc(file?.fileName || "—")}</span></div>
                </div>
              </div>

              ${gameVersions.length ? `<div class="side-block">
                <div class="side-block-title">Версии игры</div>
                <div class="game-version-list">${gameVersionChips}</div>
                <div class="game-version-note">${localVersion
                  ? currentVersionAvailable
                    ? "Ваша версия выделена золотым."
                    : "Для вашей версии игры файла нет."
                  : "Версия игры не определена."}</div>
              </div>` : ""}

              ${categories.length ? `<div class="side-block">
                <div class="side-block-title">Категории</div>
                <div class="side-chips">${categories.map((category) => `<span class="category-chip">${esc(category)}</span>`).join("")}</div>
              </div>` : ""}

              ${screenshotThumbs ? `<div class="side-block">
                <div class="side-block-title">Скриншоты <span class="side-block-count">${gallery.length}</span></div>
                <div class="screenshot-grid">${screenshotThumbs}</div>
                <div class="screenshot-hint">${icon("image")} Нажмите, чтобы открыть галерею</div>
              </div>` : ""}

              ${external ? `<button class="btn btn-secondary btn-sm" type="button" data-action="open-url" data-url="${esc(external)}">${icon("external")} Страница на CurseForge</button>` : ""}
            </aside>
          </div>
        </div>

        <div class="modal-footer details-footer">
          <div class="details-install-note">${note}</div>
          <button class="btn btn-primary" type="button" data-action="details-install" ${!file || busy ? "disabled" : ""}>${icon("download")} ${esc(actionLabel)}</button>
        </div>
      </div>
    </div>`;
  }

  function formatDescription(text) {
    const source = String(text || "").replace(/\r/g, "");
    if (!source.trim()) return '<div class="description-empty">Описание не опубликовано.</div>';
    const lines = source.split("\n");
    const output = [];
    let paragraph = [];
    let list = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      output.push(`<p>${esc(paragraph.join(" "))}</p>`);
      paragraph = [];
    };
    const flushList = () => {
      if (!list.length) return;
      output.push(`<ul>${list.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`);
      list = [];
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }
      const bullet = line.match(/^[•·]\s*(.*)$/);
      if (bullet) {
        flushParagraph();
        if (bullet[1]) list.push(bullet[1]);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
    return `<div class="description-text">${output.join("")}</div>`;
  }

  function renderInstallModal() {
    if (!state.installModal) return "";
    const busy = state.installModalBusy;
    const options = state.installs.length
      ? state.installs
          .map((install, index) => {
            const selected = state.selectedInstall === index;
            return `<button class="install-option ${selected ? "selected" : ""}" type="button" data-action="select-install" data-index="${index}" ${busy ? "disabled" : ""}>
              <span class="install-option-icon">${icon("gamepad")}</span>
              <span class="install-option-copy">
                <span class="install-option-title">${esc(install.displayName || install.flavorLabel)}${selected ? '<span class="badge badge-success">Выбрано</span>' : ""}</span>
                <span class="install-option-path">${esc(install.addonsDir)}</span>
              </span>
              <span class="install-option-meta">${esc(install.version || "—")}<br />Interface ${esc(install.interface || "—")}</span>
              ${selected ? `<span class="install-option-check">${icon("check")}</span>` : ""}
            </button>`;
          })
          .join("")
      : `<div class="install-modal-empty">Установки не найдены.<br />Укажите папку World of Warcraft или обновите список.</div>`;

    return `<div class="modal-backdrop" data-action="install-backdrop">
      <div class="modal modal-small" role="dialog" aria-modal="true" aria-label="Выбор установки World of Warcraft">
        <div class="modal-header">
          <div><h2>Установка World of Warcraft</h2><p>Выберите версию игры, с которой будет работать Addon Forge.</p></div>
          ${modalCloseButton("close-install-modal")}
        </div>
        <div class="install-options">${options}</div>
        <div class="modal-footer split">
          <div class="footer-left">${state.installs.length ? `Найдено: ${state.installs.length}` : "Поддерживаются Retail, Classic, Classic Era и Forever"}</div>
          <div class="footer-right">
            <button class="btn btn-secondary" type="button" data-action="rescan-installs" ${busy ? "disabled" : ""}>${icon("search", busy ? "spin" : "")} Обновить список</button>
            <button class="btn btn-primary" type="button" data-action="choose-folder" ${busy ? "disabled" : ""}>${icon("folder")} Указать папку</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderLightbox() {
    if (!state.lightbox) return "";
    const items = galleryItems();
    if (!items.length) return "";
    const index = Math.min(Math.max(Number(state.lightbox.index) || 0, 0), items.length - 1);
    const current = items[index];
    const multiple = items.length > 1;
    const thumbnails = items
      .map(
        (shot, shotIndex) =>
          `<button class="lightbox-thumb ${shotIndex === index ? "active" : ""}" type="button" data-action="lightbox-select" data-index="${shotIndex}" aria-label="Скриншот ${shotIndex + 1}" aria-current="${shotIndex === index ? "true" : "false"}">
            <img src="${esc(shot.thumb)}" alt="" loading="lazy" />
          </button>`,
      )
      .join("");

    return `<div class="lightbox" data-action="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="Галерея скриншотов">
      <div class="lightbox-card">
        <div class="lightbox-head">
          <div>
            <div class="lightbox-kicker">Галерея аддона</div>
            <div class="lightbox-counter">${index + 1} из ${items.length}</div>
          </div>
          <button class="lightbox-close" type="button" data-action="close-lightbox" aria-label="Закрыть галерею">${icon("close")}</button>
        </div>
        <div class="lightbox-stage">
          ${multiple ? `<button class="lightbox-nav prev" type="button" data-action="lightbox-prev" aria-label="Предыдущий скриншот">${icon("arrowLeft")}</button>` : ""}
          <img src="${esc(current.full)}" alt="${esc(current.title)}" />
          ${multiple ? `<button class="lightbox-nav next" type="button" data-action="lightbox-next" aria-label="Следующий скриншот">${icon("arrowRight")}</button>` : ""}
        </div>
        <div class="lightbox-caption">
          <span>${esc(current.title)}</span>
          <span class="lightbox-hint">← → для навигации · Esc для закрытия</span>
        </div>
        ${multiple ? `<div class="lightbox-thumbs">${thumbnails}</div>` : ""}
      </div>
    </div>`;
  }

  function setPage(page) {
    if (!["installed", "catalog", "settings"].includes(page)) return;
    const changed = state.page !== page;
    state.page = page;
    if (changed) {
      state.details = null;
      state.lightbox = null;
      state.installModal = false;
      state.detailsToken += 1;
      const main = $("main");
      if (main) main.scrollTop = 0;
    }
    render();
    if (page === "catalog" && !state.catalog.loaded && !state.catalog.loading) {
      searchCatalog(true);
    }
  }

  async function checkUpdates(options = {}) {
    const { silent = false } = options;
    if (state.checking) return;
    if (!state.install) {
      if (!silent) toast("Сначала выберите установку игры", "Настройки → Установка World of Warcraft.", "warning");
      return;
    }
    state.checking = true;
    state.checkProgress = { current: 0, total: state.addons.length, addonKey: "", title: "" };
    state.lastCheck = null;
    render();
    try {
      const summary = await invoke("check_updates");
      state.checking = false;
      state.checkProgress = null;
      settlePendingChecks();
      state.lastCheck = { ...(summary || {}), at: Date.now() };
      render();
      showCheckToast(summary || {}, silent);
    } catch (error) {
      state.checking = false;
      state.checkProgress = null;
      settlePendingChecks();
      render();
      toast("Не удалось проверить обновления", errorText(error), "danger");
    }
  }

  function showCheckToast(summary, silent) {
    const checked = Number(summary.checked || state.addons.length);
    const updates = Number(summary.updates || 0);
    const failed = Number(summary.failed || 0);
    if (updates > 0) {
      toast(
        `Найдено ${updates} ${plural(updates, "обновление", "обновления", "обновлений")}`,
        `Проверено ${checked} ${plural(checked, "аддон", "аддона", "аддонов")}${failed ? ` · ошибок: ${failed}` : ""}.`,
        "warning",
      );
      return;
    }
    if (failed > 0) {
      toast(
        "Проверка завершена с ошибками",
        `Не удалось проверить ${failed} из ${checked}. Подробности — в статусе аддонов.`,
        "danger",
      );
      return;
    }
    if (!silent) {
      toast(
        "Все аддоны актуальны",
        `Проверено ${checked} ${plural(checked, "аддон", "аддона", "аддонов")} — обновлений нет.`,
        "success",
      );
    }
  }

  async function checkAddon(key) {
    if (!state.install || !key) return;
    const previous = state.checks.get(key);
    state.checks.set(key, {
      ...(previous || {}),
      addonKey: key,
      status: "checking",
      statusLabel: "Проверка…",
      tone: "info",
      updateAvailable: false,
      pulsing: true,
    });
    render();
    try {
      const result = await invoke("check_addon", { key });
      state.checks.set(key, result);
      render();
      if (result.status === "error") {
        toast("Не удалось проверить аддон", result.error || result.statusLabel, "danger");
      }
    } catch (error) {
      if (previous) state.checks.set(key, previous);
      render();
      toast("Не удалось проверить аддон", errorText(error), "danger");
    }
  }

  async function updateAddon(key) {
    if (!state.install) {
      openInstallModal();
      toast("Сначала выберите установку игры", "Без неё нельзя определить подходящую версию файла.", "warning");
      return;
    }
    if (state.checking) {
      toast("Дождитесь проверки обновлений", "Установка во время проверки может изменить список аддонов.", "info");
      return;
    }
    if (state.installTasks.size || state.batchActive) {
      toast("Установка уже выполняется", "Дождитесь завершения текущей операции.", "info");
      return;
    }
    try {
      const result = await invoke("update_addon", { key });
      state.addons = result.addons || state.addons;
      const previous = state.checks.get(result.key) || state.checks.get(key);
      const upToDate = {
        ...(previous || {}),
        addonKey: result.key,
        status: "upToDate",
        statusLabel: "Актуально",
        tone: "success",
        updateAvailable: false,
        error: null,
        pulsing: false,
      };
      state.checks.set(result.key, upToDate);
      if (key !== result.key) state.checks.set(key, upToDate);
      render();
      toast(
        result.isUpdate ? "Аддон обновлён" : "Аддон установлен",
        `${result.title} · ${result.version}${result.backupDir ? " · резервная копия создана" : ""}`,
        "success",
      );
    } catch (error) {
      toast("Не удалось обновить аддон", errorText(error), "danger");
    } finally {
      state.installTasks.delete(key);
      render();
    }
  }

  async function updateAll() {
    if (!state.install) return;
    if (state.checking || state.installTasks.size || state.batchActive) {
      toast("Дождитесь завершения текущей операции", "Проверка или установка уже выполняется.", "info");
      return;
    }
    const keys = state.addons.filter((addon) => statusFor(addon).updateAvailable).map((addon) => addon.key);
    if (!keys.length) {
      toast("Обновлений нет", "Все установленные аддоны актуальны.", "success");
      return;
    }
    state.batchActive = true;
    render();
    try {
      const result = await invoke("update_addons", { keys });
      state.addons = result.addons || state.addons;
      const succeeded = Number(result.succeeded || 0);
      const failed = Number(result.failed || 0);
      const lines = Array.isArray(result.errors) ? result.errors.slice(0, 3) : [];
      const message = `Обновлено ${succeeded} из ${Number(result.total || keys.length)}.${lines.length ? `\n${lines.join("\n")}` : ""}`;
      toast(
        failed ? "Обновление завершено с ошибками" : "Обновление завершено",
        message,
        failed ? "warning" : "success",
        7000,
      );
    } catch (error) {
      toast("Не удалось обновить аддоны", errorText(error), "danger");
    } finally {
      state.batchActive = false;
      state.installTasks.clear();
      render();
    }
  }

  async function installCatalog(modId, title, latestFile = null) {
    if (!state.install) {
      openInstallModal();
      toast("Сначала выберите установку игры", "Установка аддона требует известной версии игры.", "warning");
      return;
    }
    if (state.checking) {
      toast("Дождитесь проверки обновлений", "Установка во время проверки может изменить список аддонов.", "info");
      return;
    }
    if (state.installTasks.size || state.batchActive) {
      toast("Установка уже выполняется", "Дождитесь завершения текущей операции.", "info");
      return;
    }
    try {
      const result = await invoke("install_mod", {
        modId: Number(modId),
        title: title || null,
      });
      state.addons = result.addons || state.addons;
      state.checks.set(result.key, {
        addonKey: result.key,
        modId: Number(modId),
        modName: result.title,
        latest: latestFile || null,
        status: "upToDate",
        statusLabel: "Актуально",
        tone: "success",
        updateAvailable: false,
        error: null,
        pulsing: false,
      });
      state.installTasks.clear();
      render();
      toast(
        result.isUpdate ? "Аддон обновлён" : "Аддон установлен",
        `${result.title} · ${result.version}${result.backupDir ? " · резервная копия создана" : ""}`,
        "success",
      );
    } catch (error) {
      toast("Не удалось установить аддон", errorText(error), "danger");
    } finally {
      state.installTasks.clear();
      render();
    }
  }

  async function searchCatalog(reset = false) {
    const catalog = state.catalog;
    if (reset) {
      catalog.page = 0;
      catalog.results = [];
      catalog.hasMore = false;
      catalog.loaded = true;
    }
    const requestedPage = catalog.page;
    const seq = ++catalog.seq;
    catalog.loading = true;
    catalog.error = null;
    if (state.page === "catalog") render();
    try {
      const data = await invoke("search_addons", {
        query: catalog.query.trim(),
        sort: catalog.sort,
        page: requestedPage,
      });
      if (seq !== catalog.seq) return;
      const incoming = Array.isArray(data.results) ? data.results : [];
      if (reset) {
        catalog.results = incoming;
      } else {
        const seen = new Set(catalog.results.map((item) => Number(item.id)));
        for (const item of incoming) {
          if (!seen.has(Number(item.id))) {
            seen.add(Number(item.id));
            catalog.results.push(item);
          }
        }
      }
      for (const item of catalog.results) cacheRemoteLogo(item);
      catalog.hasMore = Boolean(data.hasMore);
      catalog.loaded = true;
    } catch (error) {
      if (seq !== catalog.seq) return;
      catalog.error = errorText(error);
      catalog.loaded = true;
    } finally {
      if (seq === catalog.seq) {
        catalog.loading = false;
        if (state.page === "catalog") render();
      }
    }
  }

  function loadMoreCatalog() {
    if (state.catalog.loading || !state.catalog.hasMore) return;
    state.catalog.page += 1;
    searchCatalog(false);
  }

  async function openCatalogDetails(modId, title) {
    const id = Number(modId);
    if (!id) return;
    const token = ++state.detailsToken;
    state.details = {
      open: true,
      loading: true,
      key: null,
      modId: id,
      title: title || "",
      data: null,
      error: null,
      activeShot: null,
    };
    state.detailsScroll = 0;
    state.lightbox = null;
    state.installModal = false;
    render();
    try {
      const response = await invoke("get_details", { modId: id });
      if (token !== state.detailsToken || !state.details) return;
      state.details.modId = Number(response.modId || id);
      state.details.data = response.details;
      cacheRemoteLogo(response.details?.remote);
      const hero = largestScreenshot(response.details?.remote?.screenshots);
      state.details.activeShot = safeUrl(hero?.url) || safeUrl(hero?.thumb);
      state.details.loading = false;
      render();
    } catch (error) {
      if (token !== state.detailsToken || !state.details) return;
      state.details.error = errorText(error);
      state.details.loading = false;
      render();
    }
  }

  async function openInstalledDetails(key) {
    if (!key) return;
    const addon = state.addons.find((item) => item.key === key);
    const check = state.checks.get(key);
    const token = ++state.detailsToken;
    state.details = {
      open: true,
      loading: true,
      key,
      modId: check?.modId || addon?.curseId || null,
      title: addon?.title || "Аддон",
      data: null,
      error: null,
      activeShot: null,
    };
    state.detailsScroll = 0;
    state.lightbox = null;
    state.installModal = false;
    render();
    try {
      const response = await invoke("installed_details", {
        key,
        modId: state.details.modId || null,
      });
      if (token !== state.detailsToken || !state.details) return;
      state.details.modId = Number(response.modId || 0);
      state.details.data = response.details;
      cacheRemoteLogo(response.details?.remote);
      const hero = largestScreenshot(response.details?.remote?.screenshots);
      state.details.activeShot = safeUrl(hero?.url) || safeUrl(hero?.thumb);
      state.details.loading = false;
      render();
    } catch (error) {
      if (token !== state.detailsToken || !state.details) return;
      state.details.error = errorText(error);
      state.details.loading = false;
      render();
    }
  }

  function retryDetails() {
    const details = state.details;
    if (!details) return;
    if (details.key) openInstalledDetails(details.key);
    else if (details.modId) openCatalogDetails(details.modId, details.title);
  }

  function closeDetails() {
    state.detailsToken += 1;
    state.details = null;
    state.detailsScroll = 0;
    state.lightbox = null;
    render();
  }

  function openLightbox(index) {
    const items = galleryItems();
    if (!items.length || !state.details) return;
    const nextIndex = Math.min(Math.max(Number(index) || 0, 0), items.length - 1);
    state.lightbox = { index: nextIndex };
    state.details.activeShot = items[nextIndex].full;
    render();
  }

  function moveLightbox(delta) {
    if (!state.lightbox) return;
    const items = galleryItems();
    if (!items.length) return;
    const current = Math.min(Math.max(Number(state.lightbox.index) || 0, 0), items.length - 1);
    const nextIndex = (current + delta + items.length) % items.length;
    state.lightbox = { index: nextIndex };
    if (state.details) state.details.activeShot = items[nextIndex].full;
    render();
  }

  function selectLightbox(index) {
    if (!state.lightbox) return;
    const items = galleryItems();
    const nextIndex = Number(index);
    if (!items.length || !Number.isFinite(nextIndex)) return;
    state.lightbox = { index: Math.min(Math.max(nextIndex, 0), items.length - 1) };
    if (state.details) state.details.activeShot = items[state.lightbox.index].full;
    render();
  }

  function closeLightbox() {
    state.lightbox = null;
    render();
  }

  function installFromDetails() {
    const details = state.details;
    if (!details?.data) return;
    const remote = details.data.remote || {};
    const latest = details.data.latest || remote.latestFile || null;
    const installed = details.key
      ? state.addons.find((addon) => addon.key === details.key) || null
      : installedForRemote(remote);
    state.detailsToken += 1;
    state.details = null;
    state.lightbox = null;
    render();
    if (installed) updateAddon(installed.key);
    else installCatalog(Number(remote.id), remote.name, latest);
  }

  function openInstallModal() {
    state.details = null;
    state.detailsToken += 1;
    state.lightbox = null;
    state.installModal = true;
    render();
  }

  function closeInstallModal() {
    if (state.installModalBusy) return;
    state.installModal = false;
    render();
  }

  async function selectInstall(index) {
    if (state.installModalBusy) return;
    if (state.checking) {
      toast("Дождитесь проверки обновлений", "Смена установки во время проверки может смешать результаты.", "info");
      return;
    }
    if (state.selectedInstall === index) {
      state.installModal = false;
      render();
      return;
    }
    state.installModalBusy = true;
    render();
    try {
      const data = await invoke("select_install", { index: Number(index) });
      applySelection(data);
      toast(
        "Установка выбрана",
        data.install ? `${data.install.displayName} · ${data.install.version}` : "",
        "success",
      );
    } catch (error) {
      state.installModalBusy = false;
      render();
      toast("Не удалось выбрать установку", errorText(error), "danger");
    }
  }

  async function chooseFolder() {
    if (state.installModalBusy) return;
    if (state.checking) {
      toast("Дождитесь проверки обновлений", "После проверки можно выбрать другую папку игры.", "info");
      return;
    }
    state.installModalBusy = true;
    render();
    try {
      const path = await invoke("pick_wow_folder");
      if (!path) return;
      const data = await invoke("add_install_path", { path });
      applySelection(data);
      toast(
        "Папка добавлена",
        data.install ? `${data.install.displayName} · ${data.install.version}` : "",
        "success",
      );
    } catch (error) {
      toast("Не удалось добавить папку", errorText(error), "danger");
    } finally {
      state.installModalBusy = false;
      render();
    }
  }

  async function rescanInstalls() {
    if (state.installModalBusy) return;
    if (state.checking) {
      toast("Дождитесь проверки обновлений", "Повторный поиск установки остановит текущую сверку.", "info");
      return;
    }
    state.installModalBusy = true;
    render();
    try {
      const data = await invoke("bootstrap");
      applyBootstrap(data, { autoCheck: true, keepModal: state.installModal });
      toast("Список установок обновлён", data.install ? `Выбрано: ${data.install.displayName}` : "Установки не найдены", data.install ? "success" : "info");
    } catch (error) {
      toast("Не удалось обновить список", errorText(error), "danger");
    } finally {
      state.installModalBusy = false;
      render();
    }
  }

  async function refreshAddons() {
    if (!state.install) {
      toast("Установка не выбрана", "Сначала найдите World of Warcraft.", "warning");
      return;
    }
    try {
      const data = await invoke("refresh_installed");
      state.installs = data.installs || state.installs;
      state.selectedInstall = data.selectedInstall ?? state.selectedInstall;
      state.install = data.install || state.install;
      state.addons = data.addons || state.addons;
      render();
      toast("Список аддонов обновлён", `Найдено: ${state.addons.length}.`, "success");
    } catch (error) {
      toast("Не удалось обновить список", errorText(error), "danger");
    }
  }

  async function openStorage(kind) {
    try {
      await invoke("open_storage", { kind });
    } catch (error) {
      toast("Не удалось открыть папку", errorText(error), "danger");
    }
  }

  async function openExternal(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    try {
      await invoke("open_external", { url: safe });
    } catch (error) {
      toast("Не удалось открыть ссылку", errorText(error), "danger");
    }
  }

  async function persistSettings(patch, successMessage = "") {
    const merged = { ...state.settingsDraft, ...patch };
    state.settingsDraft = merged;
    try {
      const saved = await invoke("save_settings", {
        settings: {
          apiKey: String(merged.apiKey || ""),
          useOfficialApi: Boolean(merged.useOfficialApi),
          autoCheckUpdates: Boolean(merged.autoCheckUpdates),
          keepBackups: Boolean(merged.keepBackups),
        },
      });
      state.settings = { ...state.settings, ...saved };
      state.settingsDraft = { ...state.settingsDraft, ...saved };
      render();
      if (successMessage) toast(successMessage, "", "success");
    } catch (error) {
      toast("Не удалось сохранить настройки", errorText(error), "danger");
    }
  }

  function setApiMode(official) {
    persistSettings({ useOfficialApi: Boolean(official) });
  }

  function toggleSetting(field) {
    if (!["autoCheckUpdates", "keepBackups"].includes(field)) return;
    persistSettings({ [field]: !state.settings[field] });
  }

  function saveApiKey() {
    const key = String(state.settingsDraft.apiKey || "").trim();
    persistSettings({ apiKey: key }, "Ключ сохранён");
  }

  function onClick(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (
      (action === "details-backdrop" ||
        action === "install-backdrop" ||
        action === "lightbox-backdrop") &&
      event.target !== actionEl
    ) {
      return;
    }

    switch (action) {
      case "nav":
        setPage(actionEl.dataset.page);
        break;
      case "check-updates":
        checkUpdates();
        break;
      case "update-all":
        updateAll();
        break;
      case "update-addon":
        updateAddon(actionEl.dataset.key);
        break;
      case "check-addon":
        checkAddon(actionEl.dataset.key);
        break;
      case "details-installed":
        openInstalledDetails(actionEl.dataset.key);
        break;
      case "filter-installed":
        state.installedFilter = actionEl.dataset.filter || "all";
        render();
        break;
      case "reset-installed-filter":
        state.installedQuery = "";
        state.installedFilter = "all";
        render();
        break;
      case "catalog-refresh":
        searchCatalog(true);
        break;
      case "catalog-reset":
        state.catalog.query = "";
        state.catalog.page = 0;
        state.catalog.results = [];
        state.catalog.hasMore = false;
        state.catalog.loaded = true;
        state.catalog.error = null;
        render();
        searchCatalog(true);
        break;
      case "catalog-more":
        loadMoreCatalog();
        break;
      case "catalog-details":
        openCatalogDetails(Number(actionEl.dataset.modId), actionEl.dataset.title || "");
        break;
      case "catalog-install": {
        const id = Number(actionEl.dataset.modId);
        const remote = state.catalog.results.find((item) => Number(item.id) === id);
        installCatalog(id, actionEl.dataset.title || remote?.name || "", remote?.latestFile || null);
        break;
      }
      case "details-close":
        closeDetails();
        break;
      case "details-retry":
        retryDetails();
        break;
      case "details-install":
        installFromDetails();
        break;
      case "details-shot":
        openLightbox(Number(actionEl.dataset.index));
        break;
      case "lightbox-prev":
        moveLightbox(-1);
        break;
      case "lightbox-next":
        moveLightbox(1);
        break;
      case "lightbox-select":
        selectLightbox(Number(actionEl.dataset.index));
        break;
      case "close-lightbox":
        closeLightbox();
        break;
      case "open-install-modal":
        openInstallModal();
        break;
      case "close-install-modal":
        closeInstallModal();
        break;
      case "select-install":
        selectInstall(Number(actionEl.dataset.index));
        break;
      case "choose-folder":
        chooseFolder();
        break;
      case "rescan-installs":
        rescanInstalls();
        break;
      case "refresh-addons":
        refreshAddons();
        break;
      case "open-storage":
        openStorage(actionEl.dataset.kind || "");
        break;
      case "open-url":
        openExternal(actionEl.dataset.url || "");
        break;
      case "set-api-mode":
        setApiMode(actionEl.dataset.official === "true");
        break;
      case "toggle-api-key":
        state.showApiKey = !state.showApiKey;
        render();
        break;
      case "save-api-key":
        saveApiKey();
        break;
      case "toggle-setting":
        toggleSetting(actionEl.dataset.field || "");
        break;
      case "close-toast": {
        const toastId = Number(actionEl.dataset.toastId);
        state.toasts = state.toasts.filter((item) => item.id !== toastId);
        renderToasts();
        break;
      }
      case "retry-bootstrap":
        showBoot();
        setBootText("Повторный поиск World of Warcraft…");
        loadBootstrap();
        break;
      default:
        break;
    }
  }

  function onInput(event) {
    const input = event.target.closest("[data-input]");
    if (!input) return;
    const kind = input.dataset.input;
    if (kind === "installed-search") {
      state.installedQuery = input.value;
      render();
      return;
    }
    if (kind === "catalog-search") {
      state.catalog.query = input.value;
      state.catalog.seq += 1;
      state.catalog.page = 0;
      state.catalog.results = [];
      state.catalog.hasMore = false;
      state.catalog.loaded = true;
      state.catalog.loading = true;
      state.catalog.error = null;
      if (state.searchTimer) clearTimeout(state.searchTimer);
      render();
      state.searchTimer = setTimeout(() => {
        state.searchTimer = null;
        searchCatalog(true);
      }, 420);
      return;
    }
    if (kind === "api-key") {
      state.settingsDraft.apiKey = input.value;
    }
  }

  function onChange(event) {
    const input = event.target.closest("[data-input]");
    if (!input) return;
    if (input.dataset.input === "catalog-sort") {
      state.catalog.sort = input.value;
      state.catalog.page = 0;
      state.catalog.results = [];
      state.catalog.hasMore = false;
      state.catalog.loaded = true;
      state.catalog.error = null;
      render();
      searchCatalog(true);
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      if (state.lightbox) {
        closeLightbox();
        event.preventDefault();
        return;
      }
      if (state.details) {
        closeDetails();
        event.preventDefault();
        return;
      }
      if (state.installModal) {
        closeInstallModal();
        event.preventDefault();
      }
      return;
    }

    if (state.lightbox && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      moveLightbox(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    if (event.key === "Enter" && event.target?.matches?.('[data-input="catalog-search"]')) {
      if (state.searchTimer) clearTimeout(state.searchTimer);
      state.searchTimer = null;
      searchCatalog(true);
      event.preventDefault();
      return;
    }

    if (event.key === "Enter" && event.target?.matches?.('[data-input="api-key"]')) {
      saveApiKey();
      event.preventDefault();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === "f") {
      const selector =
        state.page === "catalog" ? "#catalog-search" : state.page === "installed" ? "#installed-search" : "";
      if (selector) {
        const input = document.querySelector(selector);
        if (input) {
          event.preventDefault();
          input.focus();
          input.select?.();
        }
      }
    }
  }

  function onScroll(event) {
    if (event.target?.classList?.contains("details-body")) {
      state.detailsScroll = event.target.scrollTop;
    }
  }

  function onImageError(event) {
    const target = event.target;
    if (target instanceof HTMLImageElement) target.remove();
  }

  function init() {
    if (!invoke) {
      state.ready = true;
      state.fatal =
        "Tauri API недоступен. Запустите приложение через Tauri, а не открывайте index.html в браузере.";
      hideBoot();
      render();
      return;
    }

    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("error", onImageError, true);

    registerEvents().then(loadBootstrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
