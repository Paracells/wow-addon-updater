(() => {
  "use strict";

  const tauri = window.__TAURI__;
  const invoke = tauri?.core?.invoke;
  const listen = tauri?.event?.listen;
  const i18n = window.AddonForgeI18n;
  const t = i18n?.t || ((ru, _en) => ru);
  const tn = i18n?.tn || ((count, ruForms) => ruForms[0].replace(/\{count\}/g, String(count)));
  const localeTag = i18n?.localeTag || (() => "ru-RU");
  const getLocale = i18n?.getLocale || (() => "ru");
  const setLocale = i18n?.setLocale || (() => "ru");
  const setInitialLanguage = i18n?.setInitialLanguage || (() => "ru");
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
      language: "auto",
    },
    settingsDraft: {
      wowPath: null,
      apiKey: "",
      useOfficialApi: false,
      autoCheckUpdates: true,
      keepBackups: true,
      language: "auto",
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
    viewModes: { installed: "list", catalog: "grid" },
    contextMenu: null,
    confirm: null,
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
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.4"></rect><rect x="14" y="3" width="7" height="7" rx="1.4"></rect><rect x="3" y="14" width="7" height="7" rx="1.4"></rect><rect x="14" y="14" width="7" height="7" rx="1.4"></rect>',
    list: '<path d="M9 6h11"></path><path d="M9 12h11"></path><path d="M9 18h11"></path><path d="M4 6h.01"></path><path d="M4 12h.01"></path><path d="M4 18h.01"></path>',
    trash:
      '<path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="m6 7 1 13h10l1-13"></path><path d="M10 11v5"></path><path d="M14 11v5"></path>',
  };

  try {
    const savedViews = JSON.parse(localStorage.getItem("addonforge.viewModes") || "{}");
    if (["list", "grid"].includes(savedViews.installed)) {
      state.viewModes.installed = savedViews.installed;
    }
    if (["list", "grid"].includes(savedViews.catalog)) {
      state.viewModes.catalog = savedViews.catalog;
    }
  } catch (_) {
    /* localStorage may be unavailable */
  }

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
          title:
            String(shot.title || "").trim() ||
            t("Скриншот {number}", "Screenshot {number}", { number: index + 1 }),
        };
      })
      .filter(Boolean);
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    try {
      return new Intl.DateTimeFormat(localeTag(), {
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
      return new Intl.DateTimeFormat(localeTag(), {
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
    } catch (_) {
      return "";
    }
  }

  function formatNumber(value) {
    const n = Number(value || 0);
    if (!n) return "0";
    try {
      return new Intl.NumberFormat(localeTag(), {
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
    const units = t("Б|КБ|МБ|ГБ", "B|KB|MB|GB").split("|");
    let index = 0;
    while (n >= 1024 && index < units.length - 1) {
      n /= 1024;
      index += 1;
    }
    return `${n >= 10 || index === 0 ? Math.round(n) : n.toFixed(1)} ${units[index]}`;
  }

  function releaseLabel(type) {
    if (Number(type) === 1) return t("Релиз", "Release");
    if (Number(type) === 2) return t("Бета", "Beta");
    if (Number(type) === 3) return t("Альфа", "Alpha");
    return t("Файл", "File");
  }

  function authorLine(remote) {
    const authors = Array.isArray(remote?.authors)
      ? remote.authors.map(namedValue).filter(Boolean)
      : [];
    return authors.length ? authors.join(", ") : t("Автор не указан", "Unknown author");
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

  const BACKEND_ERROR_REPLACEMENTS = [
    [
      /Сначала выберите установку World of Warcraft в настройках\./g,
      "Select a World of Warcraft installation in Settings first.",
    ],
    [/Установка не найдена\. Обновите список\./g, "Installation not found. Refresh the list."],
    [/Выбранная папка не существует\./g, "The selected folder does not exist."],
    [
      /В этой папке не найдена World of Warcraft\. Выберите папку игры или папку с _retail_ \/ _classic_ \/ _forever_\./g,
      "World of Warcraft was not found in this folder. Select the game folder or a folder containing _retail_ / _classic_ / _forever_.",
    ],
    [/Неизвестный раздел хранилища\./g, "Unknown storage section."],
    [/Можно открывать только http\/https ссылки\./g, "Only http/https links can be opened."],
    [
      /Аддон не найден\. Обновите список установленных\./g,
      "Addon not found. Refresh the installed list.",
    ],
    [/Этот аддон не найден на CurseForge\./g, "This addon was not found on CurseForge."],
    [
      /Установка уже выполняется\. Дождитесь её окончания\./g,
      "An installation is already in progress. Wait for it to finish.",
    ],
    [/Не указан проект CurseForge\./g, "No CurseForge project was specified."],
    [/Аддон больше не найден в папке AddOns/g, "The addon is no longer present in the AddOns folder"],
    [/Папки аддона не найдены в AddOns\./g, "The addon folders were not found in AddOns."],
    [/Папка аддона является символической ссылкой/g, "The addon folder is a symbolic link"],
    [/Некорректное имя папки аддона/g, "Invalid addon folder name"],
    [/некорректное имя папки аддона/g, "invalid addon folder name"],
    [
      /для официального API нужен ключ CurseForge\. Укажите его в настройках или переключитесь на прокси без ключа\./g,
      "The official API requires a CurseForge key. Add it in Settings or switch to the keyless proxy.",
    ],
    [/CurseForge вернул ошибку /g, "CurseForge returned error "],
    [/у проекта нет файла для версии игры /g, "the project has no file for game version "],
    [/\(неизвестна\)/g, "(unknown)"],
    [/сервер вернул HTTP /g, "the server returned HTTP "],
    [/не удалось начать загрузку/g, "could not start the download"],
    [/не удалось подключиться к CurseForge/g, "could not connect to CurseForge"],
    [/не удалось разобрать ответ CurseForge/g, "could not parse the CurseForge response"],
    [/не удалось выполнить удаление/g, "could not remove the addon"],
    [/Не удалось выполнить удаление/g, "Could not remove the addon"],
    [/Не удалось прочитать папку AddOns/g, "Could not read the AddOns folder"],
    [/Не удалось просканировать диск/g, "Could not scan the disk"],
    [/Не удалось проверить папку/g, "Could not inspect the folder"],
    [/Не удалось открыть выбор папки/g, "Could not open the folder picker"],
    [/Задача установки завершилась с ошибкой/g, "The installation task failed"],
    [/не удалось сохранить настройки/g, "could not save settings"],
    [/Не удалось сохранить настройки/g, "Could not save settings"],
    [/не удалось создать/g, "could not create"],
    [/Не удалось создать/g, "Could not create"],
    [/не удалось сохранить/g, "could not save"],
    [/Не удалось сохранить/g, "Could not save"],
    [/не удалось записать/g, "could not write"],
    [/Не удалось записать/g, "Could not write"],
    [/не удалось прочитать файл #(\d+) архива/g, "could not read archive file #$1"],
    [/не удалось прочитать файл/g, "could not read the file"],
    [/не удалось прочитать/g, "could not read"],
    [/Не удалось прочитать/g, "Could not read"],
    [/не удалось открыть/g, "could not open"],
    [/Не удалось открыть/g, "Could not open"],
    [/не удалось удалить устаревшую папку/g, "could not remove the outdated folder"],
    [/не удалось удалить/g, "could not remove"],
    [/Не удалось удалить/g, "Could not remove"],
    [/не удалось установить/g, "could not install"],
    [/Не удалось установить/g, "Could not install"],
    [/не удалось распаковать/g, "could not extract"],
    [/не удалось скопировать/g, "could not copy"],
    [/не удалось проверить/g, "could not inspect"],
    [/не удалось скачать файл/g, "could not download the file"],
    [/не удалось скачать/g, "could not download"],
    [/не удалось запустить/g, "could not start"],
    [/Скачивание архива\.\.\./g, "Downloading archive…"],
    [/в архиве не найдена папка аддона с \.toc файлом/g, "no addon folder with a .toc file was found in the archive"],
    [/архив содержит небезопасный путь/g, "the archive contains an unsafe path"],
    [/архив содержит символическую ссылку/g, "the archive contains a symbolic link"],
    [/небезопасный путь в архиве/g, "unsafe path in the archive"],
    [/некорректное имя файла/g, "invalid file name"],
    [/зарезервированное имя файла/g, "reserved file name"],
    [/пустой путь в архиве/g, "empty path in the archive"],
    [/конфликт при распаковке/g, "extraction conflict"],
    [/не найден на CurseForge/g, "not found on CurseForge"],
    [/Получение информации о версии\.\.\./g, "Fetching version information…"],
    [/Скачивание\.\.\./g, "Downloading…"],
    [/Распаковка и установка\.\.\./g, "Extracting and installing…"],
    [/Проект #/g, "Project #"],
    [/ошибок:/g, "errors:"],
  ];

  function localizeBackendMessage(message) {
    let text = String(message ?? "");
    if (getLocale() !== "en" || !text) return text;
    for (const [pattern, replacement] of BACKEND_ERROR_REPLACEMENTS) {
      text = text.replace(pattern, replacement);
    }
    return text;
  }

  function errorText(error) {
    if (error == null) return t("Неизвестная ошибка", "Unknown error");
    if (typeof error === "string") return localizeBackendMessage(error);
    if (typeof error === "object" && error.message) {
      return localizeBackendMessage(error.message);
    }
    try {
      return localizeBackendMessage(JSON.stringify(error));
    } catch (_) {
      return localizeBackendMessage(error);
    }
  }

  function statusLabel(status, fallback = "") {
    switch (status) {
      case "upToDate":
        return t("Актуально", "Up to date");
      case "updateAvailable":
        return t("Есть обновление", "Update available");
      case "unresolved":
        return t("Не найден на CurseForge", "Not found on CurseForge");
      case "noCompatible":
        return t("Нет версии для игры", "No compatible game version");
      case "error":
        return t("Ошибка", "Error");
      case "checking":
        return t("Проверка…", "Checking…");
      case "installing":
        return t("Установка…", "Installing…");
      case "updating":
        return t("Обновление…", "Updating…");
      case "unknown":
        return t("Не проверен", "Not checked");
      default:
        return localizeBackendMessage(fallback) || t("Не проверен", "Not checked");
    }
  }

  function statusFor(addon) {
    const task = taskFor(addon.key);
    if (task) {
      return {
        addonKey: addon.key,
        status: "installing",
        statusLabel: task.isUpdate
          ? t("Обновление…", "Updating…")
          : t("Установка…", "Installing…"),
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
        statusLabel: t("Не проверен", "Not checked"),
        tone: "neutral",
        updateAvailable: false,
      };
    }
    return {
      ...check,
      statusLabel: statusLabel(check.status, check.statusLabel),
      error: check.error ? localizeBackendMessage(check.error) : check.error,
    };
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
        statusLabel: t("Не проверен", "Not checked"),
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

  function addonCardLogo(addon) {
    const tone = avatarTone(addon.primaryFolder || addon.title);
    const logo = logoForAddon(addon);
    return `<div class="card-logo-wrap" style="--tone:${tone}">
      <span>${esc(initials(addon.title))}</span>
      ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" />` : ""}
    </div>`;
  }

  function statusPill(status, extraTitle = "") {
    const pulse = status.pulsing ? " pulsing" : "";
    const title = extraTitle ? ` title="${esc(extraTitle)}"` : "";
    return `<span class="status-pill ${esc(status.tone || "neutral")}${pulse}"${title}><span class="status-dot"></span>${esc(status.statusLabel || t("Не проверен", "Not checked"))}</span>`;
  }

  function installedForRemote(remote) {
    if (!remote) return null;
    const modId = Number(remote.id);
    const title = String(remote.name || "").trim().toLowerCase();
    const slug = String(remote.slug || "").trim().toLowerCase();
    return (
      (modId && state.addons.find((addon) => Number(addon.curseId) === modId)) ||
      (modId &&
        state.addons.find((addon) => Number(state.checks.get(addon.key)?.modId) === modId)) ||
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
        console.error(`Failed to subscribe to ${name}`, error);
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
      statusLabel: t("Проверка…", "Checking…"),
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
      title: payload.title || t("Аддон", "Addon"),
      isUpdate: Boolean(payload.isUpdate),
      stage: "resolve",
      message: "",
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
        title: payload.title || t("Аддон", "Addon"),
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
        statusLabel: t("Актуально", "Up to date"),
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
    setBootText(t("Поиск установок World of Warcraft…", "Searching for World of Warcraft installations…"));
    try {
      const data = await invoke("bootstrap");
      setInitialLanguage(data.settings?.language);
      applyBootstrap(data);
      hideBoot();
      if (data.settings?.autoCheckUpdates && data.addons?.length) {
        setTimeout(() => checkUpdates({ silent: true }), 380);
      }
    } catch (error) {
      hideBoot();
      state.ready = true;
      state.fatal = error;
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

    syncLightboxRoot();

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
        <span class="install-card-label">${t("Установка", "Installation")}</span>
        <span class="install-card-main">${esc(state.install.flavorLabel || state.install.displayName)}<span style="color: var(--dim); font-weight: 500;"> · ${esc(state.install.version || "—")}</span></span>
        <span class="install-card-path">${esc(state.install.flavorDir || state.install.root || "")}</span>`;
    } else {
      chip.classList.add("no-install");
      chip.innerHTML = `
        <span class="install-card-label">${t("Установка", "Installation")}</span>
        <span class="install-card-main">${t("Игра не найдена", "Game not found")}</span>
        <span class="install-card-path">${t("Нажмите, чтобы указать папку", "Click to choose a folder")}</span>`;
    }
  }

  function renderHeader() {
    const header = $("page-header");
    if (!header) return;
    const counts = computeCounts();
    const busy = state.checking || state.installTasks.size > 0 || state.batchActive;
    if (state.page === "installed") {
      const subtitle = state.install
        ? `${state.install.displayName} · ${state.install.version || t("версия неизвестна", "version unknown")}${state.install.interface ? ` · Interface ${state.install.interface}` : ""}`
        : t("World of Warcraft не обнаружен", "World of Warcraft not detected");
      header.innerHTML = `
        <div class="page-title">
          <div class="eyebrow"><span class="eyebrow-line"></span>${t("Библиотека", "Library")}</div>
          <h1>${t("Установленные аддоны", "Installed addons")}</h1>
          <p>${esc(subtitle)}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-action="check-updates" ${!state.install || !state.addons.length || busy ? "disabled" : ""}>
            ${icon("refresh", state.checking ? "spin" : "")}
            ${state.checking ? t("Проверка…", "Checking…") : t("Проверить обновления", "Check for updates")}
          </button>
          <button class="btn btn-primary" type="button" data-action="update-all" ${!counts.updates || busy ? "disabled" : ""}>
            ${icon("download")}
            ${t("Обновить всё", "Update all")}${counts.updates ? ` · ${counts.updates}` : ""}
          </button>
        </div>`;
      return;
    }
    if (state.page === "catalog") {
      header.innerHTML = `
        <div class="page-title">
          <div class="eyebrow"><span class="eyebrow-line"></span>CurseForge</div>
          <h1>${t("Каталог аддонов", "Addon catalog")}</h1>
          <p>${state.install ? t("Подбор файлов для {version}", "Matching files for {version}", { version: esc(state.install.version || state.install.flavorLabel) }) : t("Выберите установку игры, чтобы фильтровать версии", "Select a game installation to filter versions")}</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" data-action="catalog-refresh" ${state.catalog.loading ? "disabled" : ""}>
            ${icon("refresh", state.catalog.loading ? "spin" : "")} ${t("Обновить каталог", "Refresh catalog")}
          </button>
        </div>`;
      return;
    }
    header.innerHTML = `
      <div class="page-title">
        <div class="eyebrow"><span class="eyebrow-line"></span>${t("Приложение", "Application")}</div>
        <h1>${t("Настройки", "Settings")}</h1>
        <p>${t("Подключение, обновления и локальное хранилище", "Connection, updates, and local storage")}</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" type="button" data-action="open-storage" data-kind="data">
          ${icon("folder")} ${t("Папка данных", "Data folder")}
        </button>
      </div>`;
  }

  function renderFatal() {
    return `<div class="empty-hero">
      <div class="empty-emblem">${icon("shield")}</div>
      <div class="eyebrow">${t("Ошибка запуска", "Startup error")}</div>
      <h2>${t("Не удалось загрузить приложение", "Could not load the application")}</h2>
      <p>${esc(errorText(state.fatal))}</p>
      <div class="empty-actions">
        <button class="btn btn-primary" type="button" data-action="retry-bootstrap">${icon("refresh")} ${t("Повторить", "Retry")}</button>
      </div>
    </div>`;
  }

  function installTaskMessage(task) {
    if (task.stage === "resolve") {
      return t("Получение информации о версии…", "Fetching version information…");
    }
    if (task.stage === "download") {
      const total = Number(task.total || 0);
      if (total > 0) {
        const percent = Math.max(
          0,
          Math.min(100, Math.round((Number(task.downloaded || 0) * 100) / total)),
        );
        return t("Скачивание… {percent}%", "Downloading… {percent}%", { percent });
      }
      return t("Скачивание…", "Downloading…");
    }
    if (task.stage === "install") {
      return t("Распаковка и установка…", "Extracting and installing…");
    }
    return task.message
      ? localizeBackendMessage(task.message)
      : t("Подготовка…", "Preparing…");
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
              <span class="task-message">${esc(installTaskMessage(task))}</span>
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
      if (message) message.textContent = installTaskMessage(task);
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
          <button class="toast-close" type="button" data-action="close-toast" data-toast-id="${item.id}" aria-label="${t("Закрыть", "Close")}">${icon("close")}</button>
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

  function viewToggle(view) {
    const mode = state.viewModes[view];
    const button = (value, iconName, label) =>
      `<button type="button" data-action="set-view-mode" data-view="${view}" data-mode="${value}" class="${mode === value ? "active" : ""}" title="${label}" aria-label="${label}" aria-pressed="${mode === value}">${icon(iconName)}</button>`;
    return `<div class="segmented view-toggle" role="group" aria-label="${t("Вид списка", "List view")}">
      ${button("list", "list", t("Показать списком", "Show as list"))}
      ${button("grid", "grid", t("Показать сеткой", "Show as grid"))}
    </div>`;
  }

  function setViewMode(view, mode) {
    if (!["installed", "catalog"].includes(view) || !["list", "grid"].includes(mode)) return;
    state.viewModes[view] = mode;
    try {
      localStorage.setItem("addonforge.viewModes", JSON.stringify(state.viewModes));
    } catch (_) {
      /* localStorage may be unavailable */
    }
    render();
  }

  function renderInstalledPage() {
    if (!state.install) return renderNoInstall();
    const counts = computeCounts();
    const folderTotal = state.addons.reduce(
      (sum, addon) => sum + (addon.folders?.length || 1),
      0,
    );
    const stats = `<div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">${t("Всего установлено", "Installed")}</div>
        <div class="stat-value">${counts.total}</div>
        <div class="stat-note">${tn(folderTotal, ["{count} папка в AddOns", "{count} папки в AddOns", "{count} папок в AddOns"], ["{count} folder in AddOns", "{count} folders in AddOns"])}</div>
      </div>
      <div class="stat-card tone-warning">
        <div class="stat-label">${t("Доступно обновлений", "Updates available")}</div>
        <div class="stat-value">${counts.updates}</div>
        <div class="stat-note">${counts.updates ? t("готовы к установке", "ready to install") : t("всё актуально", "everything is up to date")}</div>
      </div>
      <div class="stat-card tone-success">
        <div class="stat-label">${t("Актуальны", "Up to date")}</div>
        <div class="stat-value">${counts.upToDate}</div>
        <div class="stat-note">${t("последние версии", "latest versions")}</div>
      </div>
      <div class="stat-card ${counts.attention ? "tone-danger" : ""}">
        <div class="stat-label">${t("Требуют внимания", "Needs attention")}</div>
        <div class="stat-value">${counts.attention}</div>
        <div class="stat-note">${t("CurseForge или версия игры", "CurseForge or game version")}</div>
      </div>
    </div>`;

    if (!state.addons.length) {
      return `${stats}<div class="empty-state">
        <div class="empty-emblem">${icon("gamepad")}</div>
        <h2>${t("В AddOns пока нет аддонов", "There are no addons in AddOns yet")}</h2>
        <p>${t("Папка AddOns найдена, но аддонов в ней нет. Откройте каталог CurseForge и установите первый аддон — файлы будут распакованы автоматически.", "The AddOns folder was found, but it contains no addons. Open the CurseForge catalog and install your first addon — the files will be extracted automatically.")}</p>
        <div class="empty-actions">
          <button class="btn btn-primary" type="button" data-action="nav" data-page="catalog">${icon("compass")} ${t("Открыть каталог", "Open catalog")}</button>
          <button class="btn btn-secondary" type="button" data-action="refresh-addons">${icon("refresh")} ${t("Обновить список", "Refresh list")}</button>
        </div>
      </div>`;
    }

    const filtered = filteredAddons();
    const note = state.checking
      ? t("{current} of {total}", "{current} of {total}", {
          current: state.checkProgress?.current || 0,
          total: state.checkProgress?.total || state.addons.length,
        })
      : state.lastCheck
        ? t("Проверено в {time}", "Checked at {time}", { time: formatTime(state.lastCheck.at) })
        : t("Проверка ещё не выполнялась", "Updates have not been checked yet");

    return `${stats}
      ${state.checking ? renderCheckCard() : ""}
      <div class="installed-toolbar">
        <div class="search-box">
          ${icon("search")}
          <input id="installed-search" data-input="installed-search" type="text" value="${esc(state.installedQuery)}" placeholder="${t("Поиск среди установленных аддонов…", "Search installed addons…")}" autocomplete="off" spellcheck="false" />
        </div>
        <div class="segmented">
          <button type="button" data-action="filter-installed" data-filter="all" class="${state.installedFilter === "all" ? "active" : ""}">${t("Все", "All")}</button>
          <button type="button" data-action="filter-installed" data-filter="updates" class="${state.installedFilter === "updates" ? "active" : ""}">${t("Обновления", "Updates")}${counts.updates ? ` · ${counts.updates}` : ""}</button>
          <button type="button" data-action="filter-installed" data-filter="attention" class="${state.installedFilter === "attention" ? "active" : ""}">${t("Проблемы", "Issues")}${counts.attention ? ` · ${counts.attention}` : ""}</button>
        </div>
        ${viewToggle("installed")}
        <div class="toolbar-note">${esc(note)}</div>
      </div>
      ${
        filtered.length
          ? state.viewModes.installed === "grid"
            ? `<div class="installed-grid">${filtered.map(renderInstalledCard).join("")}</div>`
            : `<div class="addon-list">${filtered.map(renderAddonRow).join("")}</div>`
          : renderInstalledEmpty()
      }`;
  }

  function renderCheckCard() {
    const total = Number(state.checkProgress?.total || state.addons.length || 0);
    const current = Number(state.checkProgress?.current || 0);
    const percent = total ? Math.min(100, Math.round((current * 100) / total)) : 0;
    return `<div class="check-card">
      <span class="check-spinner"></span>
      <div class="check-copy">
        <div class="check-title">${t("Проверка обновлений CurseForge", "Checking CurseForge updates")}</div>
        <div class="check-sub">${current && total ? t("{current} of {total} · {title}", "{current} of {total} · {title}", { current, total, title: esc(state.checkProgress?.title || "") }) : t("Подготовка к проверке…", "Preparing to check…")}</div>
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
        <h2>${t("Ничего не найдено", "Nothing found")}</h2>
        <p>${t("Попробуйте изменить запрос или сбросить фильтр. Поиск работает по названию, автору и папкам аддона.", "Try changing the query or resetting the filter. Search matches the addon name, author, and folders.")}</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" data-action="reset-installed-filter">${icon("refresh")} ${t("Сбросить фильтр", "Reset filter")}</button>
        </div>
      </div>`;
    }
    return `<div class="empty-state">
      <div class="empty-emblem">${icon("info")}</div>
      <h2>${t("Список пуст", "The list is empty")}</h2>
      <p>${t("Обновите список установленных аддонов или проверьте папку AddOns в настройках.", "Refresh the installed addon list or check the AddOns folder in Settings.")}</p>
    </div>`;
  }

  function addonPrimaryAction(addon, status, task) {
    if (task) {
      return `<button class="btn btn-secondary btn-sm" type="button" disabled>${icon("refresh", "spin")} ${t("В работе", "Working")}</button>`;
    }
    if (status.updateAvailable) {
      return `<button class="btn btn-primary btn-sm" type="button" data-action="update-addon" data-key="${esc(addon.key)}">${icon("download")} ${t("Обновить", "Update")}</button>`;
    }
    if (["unknown", "error", "unresolved", "noCompatible"].includes(status.status)) {
      return `<button class="btn btn-secondary btn-sm" type="button" data-action="check-addon" data-key="${esc(addon.key)}">${icon("refresh")} ${t("Проверить", "Check")}</button>`;
    }
    return "";
  }

  function addonDetailsButton(addon, iconOnly = false) {
    return `<button class="btn btn-ghost ${iconOnly ? "btn-icon" : "btn-sm"}" type="button" data-action="details-installed" data-key="${esc(addon.key)}" title="${t("Подробнее об аддоне", "Addon details")}">${icon("info")}${iconOnly ? "" : ` ${t("Детали", "Details")}`}</button>`;
  }

  function renderInstalledCard(addon) {
    const status = statusFor(addon);
    const task = taskFor(addon.key);
    const latest = status.latest
      ? fileVersionLabel(status.modName || addon.title, status.latest)
      : "";
    const folders = addon.folders || [];
    const version = addon.displayVersion || addon.version || "—";
    const summary =
      String(addon.notes || "").replace(/\s+/g, " ").trim() ||
      t("Описание не опубликовано.", "No description published.");
    const folderChips = folders
      .slice(0, 3)
      .map((folder) => `<span class="category-chip">${esc(folder)}</span>`)
      .join("");
    const moreFolders =
      folders.length > 3 ? `<span class="category-chip">+${folders.length - 3}</span>` : "";
    return `<article class="addon-card installed-card" data-context-kind="installed" data-addon-key="${esc(addon.key)}" data-addon-title="${esc(addon.title)}">
      <div class="card-top">
        ${addonCardLogo(addon)}
        <div class="card-title-wrap">
          <button class="card-title" type="button" data-action="details-installed" data-key="${esc(addon.key)}" title="${esc(addon.title)}">${esc(addon.title)}</button>
          <div class="card-author">${esc(addon.author || t("Автор не указан", "Unknown author"))}</div>
          <div class="card-badges">
            ${statusPill(status, status.error || "")}
            ${version ? `<span class="card-version">${esc(version)}</span>` : ""}
          </div>
        </div>
      </div>
      <p class="card-summary">${esc(summary)}</p>
      ${folderChips || moreFolders ? `<div class="card-categories">${folderChips}${moreFolders}</div>` : ""}
      <div class="card-footer">
        <div class="card-stats">
          ${status.updateAvailable && latest ? `<span>${icon("arrowUp")} ${t("Доступно: {version}", "Available: {version}", { version: esc(latest) })}</span>` : `<span>${icon("folder")} ${tn(folders.length || 1, ["{count} папка", "{count} папки", "{count} папок"], ["{count} folder", "{count} folders"])}</span>`}
          ${addon.interface ? `<span>${icon("monitor")} ${esc(addon.interface)}</span>` : ""}
        </div>
        <div class="card-actions">
          ${addonPrimaryAction(addon, status, task)}
          ${addonDetailsButton(addon, true)}
        </div>
      </div>
    </article>`;
  }

  function renderAddonRow(addon) {
    const status = statusFor(addon);
    const task = taskFor(addon.key);
    const latest = status.latest
      ? fileVersionLabel(status.modName || addon.title, status.latest)
      : "";
    const folders = addon.folders || [];
    const version = addon.displayVersion || addon.version || "—";
    const summary =
      String(addon.notes || "").replace(/\s+/g, " ").trim() ||
      t("Описание не опубликовано.", "No description published.");
    const folderChips = folders
      .slice(0, 3)
      .map((folder) => `<span class="category-chip">${esc(folder)}</span>`)
      .join("");
    const moreFolders =
      folders.length > 3 ? `<span class="category-chip">+${folders.length - 3}</span>` : "";
    const upToDate = status.status === "upToDate" && !task;

    let primaryAction = "";
    let detailsButton = "";
    if (task) {
      primaryAction = `<button class="btn btn-secondary" type="button" disabled>${icon("refresh", "spin")} ${t("В работе", "Working")}</button>`;
    } else if (status.updateAvailable) {
      primaryAction = `<button class="btn btn-primary" type="button" data-action="update-addon" data-key="${esc(addon.key)}">${icon("download")} ${t("Обновить", "Update")}</button>`;
    } else if (["unknown", "error", "unresolved", "noCompatible"].includes(status.status)) {
      primaryAction = `<button class="btn btn-secondary" type="button" data-action="check-addon" data-key="${esc(addon.key)}">${icon("refresh")} ${t("Проверить", "Check")}</button>`;
    } else {
      primaryAction = `<button class="btn btn-secondary" type="button" data-action="details-installed" data-key="${esc(addon.key)}">${icon("info")} ${t("Подробнее", "Details")}</button>`;
    }
    if (!upToDate) {
      detailsButton = `<button class="btn btn-ghost btn-icon" type="button" data-action="details-installed" data-key="${esc(addon.key)}" title="${t("Подробнее об аддоне", "Addon details")}">${icon("info")}</button>`;
    }

    return `<article class="catalog-row installed-row" data-context-kind="installed" data-addon-key="${esc(addon.key)}" data-addon-title="${esc(addon.title)}">
      ${addonCardLogo(addon)}
      <div class="catalog-row-main">
        <div class="catalog-row-title-line">
          <button class="card-title" type="button" data-action="details-installed" data-key="${esc(addon.key)}" title="${esc(addon.title)}">${esc(addon.title)}</button>
          ${statusPill(status, status.error || "")}
          ${version ? `<span class="card-version" title="${t("Установленная версия", "Installed version")}">${esc(version)}</span>` : ""}
        </div>
        <div class="card-author">${esc(addon.author || t("Автор не указан", "Unknown author"))}</div>
        <p class="catalog-row-summary">${esc(summary)}</p>
        ${folderChips || moreFolders ? `<div class="card-categories catalog-row-categories">${folderChips}${moreFolders}</div>` : ""}
      </div>
      <div class="catalog-row-meta">
        <span class="card-stats">
          ${status.updateAvailable && latest ? `<span>${icon("arrowUp")} ${t("Доступно: {version}", "Available: {version}", { version: esc(latest) })}</span>` : `<span>${icon("folder")} ${tn(folders.length || 1, ["{count} папка", "{count} папки", "{count} папок"], ["{count} folder", "{count} folders"])}</span>`}
          ${addon.interface ? `<span>${icon("monitor")} Interface ${esc(addon.interface)}</span>` : ""}
        </span>
      </div>
      <div class="card-actions">${detailsButton}${primaryAction}</div>
    </article>`;
  }

  function renderNoInstall() {
    return `<div class="empty-hero">
      <div class="empty-emblem">${icon("compass")}</div>
      <div class="eyebrow">${t("Начало работы", "Getting started")}</div>
      <h2>${t("World of Warcraft не найден", "World of Warcraft not found")}</h2>
      <p>${t("Addon Forge автоматически ищет Retail, Classic, Classic Era и Forever. Если игра установлена на другом диске, укажите папку вручную — приложение найдёт нужный каталог AddOns.", "Addon Forge automatically looks for Retail, Classic, Classic Era, and Forever. If the game is installed on another drive, select its folder manually — the app will find the correct AddOns directory.")}</p>
      <div class="empty-actions">
        <button class="btn btn-primary" type="button" data-action="choose-folder">${icon("folder")} ${t("Указать папку", "Choose folder")}</button>
        <button class="btn btn-secondary" type="button" data-action="rescan-installs">${icon("search")} ${t("Искать снова", "Search again")}</button>
      </div>
      <div class="empty-hint">${t("Можно выбрать папку игры, папку версии (_retail_, _forever_) или Interface/AddOns.", "You can select the game folder, a version folder (_retail_, _forever_), or Interface/AddOns.")}</div>
    </div>`;
  }

  function renderCatalogPage() {
    const catalog = state.catalog;
    const sortOptions = [
      ["popular", t("По популярности", "Most popular")],
      ["updated", t("Недавно обновлённые", "Recently updated")],
      ["name", t("По алфавиту", "Alphabetical")],
    ];
    const toolbar = `<div class="catalog-toolbar">
      <div class="search-box">
        ${icon("search")}
        <input id="catalog-search" data-input="catalog-search" type="text" value="${esc(catalog.query)}" placeholder="${t("Название аддона или ключевое слово…", "Addon name or keyword…")}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="select-wrap">
        <select id="catalog-sort" data-input="catalog-sort" aria-label="${t("Сортировка каталога", "Catalog sorting")}">
          ${sortOptions.map(([value, label]) => `<option value="${value}" ${catalog.sort === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
      ${viewToggle("catalog")}
      <button class="btn btn-secondary btn-icon" type="button" data-action="catalog-refresh" title="${t("Обновить каталог", "Refresh catalog")}">${icon("refresh", catalog.loading ? "spin" : "")}</button>
    </div>`;

    const count = catalog.results.length;
    const statusLine = `<div class="catalog-status">
      ${catalog.loading ? `<span class="check-spinner" style="width:12px;height:12px;flex-basis:12px;border-width:1px"></span><span>${t("Загрузка каталога CurseForge…", "Loading the CurseForge catalog…")}</span>` : `<span>${count ? tn(count, ["Показан {count} аддон", "Показано {count} аддона", "Показано {count} аддонов"], ["{count} addon shown", "{count} addons shown"]) : t("Каталог CurseForge", "CurseForge catalog")}</span>${catalog.hasMore ? `<span>· ${t("есть ещё", "more available")}</span>` : ""}`}
      ${!state.install ? `<span>· ${t("установка не выбрана, фильтр по версии игры отключён", "no installation selected; game version filtering is disabled")}</span>` : ""}
    </div>`;

    const listMode = state.viewModes.catalog === "list";
    const containerClass = listMode ? "catalog-list" : "catalog-grid";
    const renderItem = listMode ? renderCatalogRow : renderCatalogCard;
    const renderSkeleton = listMode ? renderCatalogListSkeleton : renderCatalogSkeleton;
    let content = "";
    if (catalog.error) {
      content = `<div class="error-panel">
        <h3>${t("Не удалось загрузить каталог", "Could not load the catalog")}</h3>
        <p>${esc(errorText(catalog.error))}</p>
        <button class="btn btn-secondary btn-sm" type="button" data-action="catalog-refresh">${icon("refresh")} ${t("Повторить", "Retry")}</button>
      </div>`;
      if (catalog.results.length) {
        content += `<div class="${containerClass}" style="margin-top:12px">${catalog.results.map(renderItem).join("")}</div>`;
      }
    } else if (catalog.loading && !catalog.results.length) {
      content = `<div class="${containerClass}">${Array.from({ length: 6 }, renderSkeleton).join("")}</div>`;
    } else if (!catalog.loaded) {
      content = `<div class="${containerClass}">${Array.from({ length: 4 }, renderSkeleton).join("")}</div>`;
    } else if (!catalog.results.length) {
      content = `<div class="empty-state">
        <div class="empty-emblem">${icon("search")}</div>
        <h2>${t("Ничего не найдено", "Nothing found")}</h2>
        <p>${catalog.query ? t("По запросу «{query}» ничего не найдено.", "Nothing was found for “{query}”.", { query: esc(catalog.query) }) : t("Каталог пуст.", "The catalog is empty.")} ${t("Попробуйте другое название или измените сортировку.", "Try another name or change the sorting.")}</p>
        <div class="empty-actions">
          <button class="btn btn-secondary" type="button" data-action="catalog-reset">${icon("refresh")} ${t("Сбросить поиск", "Reset search")}</button>
        </div>
      </div>`;
    } else {
      content = `<div class="${containerClass}">${catalog.results.map(renderItem).join("")}</div>`;
      if (catalog.hasMore) {
        content += `<div class="load-more-row"><button class="btn btn-secondary" type="button" data-action="catalog-more" ${catalog.loading ? "disabled" : ""}>${icon("download")} ${catalog.loading ? t("Загрузка…", "Loading…") : t("Показать ещё", "Show more")}</button></div>`;
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

  function renderCatalogListSkeleton() {
    return `<div class="catalog-row skeleton">
      <div class="skeleton-block"></div>
      <div class="catalog-row-main">
        <div class="skeleton-line title"></div>
        <div class="skeleton-line short"></div>
        <div class="skeleton-line body" style="margin-top:10px"></div>
      </div>
      <div class="catalog-row-meta"><div class="skeleton-line short" style="width:80%"></div></div>
      <div class="card-actions"><div class="skeleton-line short" style="width:120px;height:31px"></div></div>
    </div>`;
  }

  function renderCatalogRow(remote) {
    const installed = installedForRemote(remote);
    const check = installed ? state.checks.get(installed.key) : null;
    const latest = remote.latestFile;
    const version = fileVersionLabel(remote.name, latest);
    const logo = safeUrl(remote.logo);
    const categories = categoryNames(remote, 3);
    const busy = state.installTasks.size > 0 || state.batchActive;
    const isUpdate = Boolean(check?.updateAvailable);
    const summary =
      String(remote.summary || "").trim() || t("Описание не опубликовано.", "No description published.");

    let badge = "";
    if (installed && isUpdate) badge = `<span class="badge badge-warning">${t("Есть обновление", "Update available")}</span>`;
    else if (installed) badge = `<span class="badge badge-success">${t("Установлен", "Installed")}</span>`;

    let primary = "";
    if (isUpdate) {
      primary = `<button class="btn btn-primary" type="button" data-action="update-addon" data-key="${esc(installed.key)}" ${busy ? "disabled" : ""}>${icon("download")} ${t("Обновить", "Update")}</button>`;
    } else if (installed) {
      primary = `<button class="btn btn-secondary" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}">${icon("info")} ${t("Подробнее", "Details")}</button>`;
    } else {
      primary = `<button class="btn btn-primary" type="button" data-action="catalog-install" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" ${busy || !latest ? "disabled" : ""} title="${latest ? t("Установить последнюю версию", "Install the latest version") : t("Нет файла для вашей версии игры", "No file for your game version")}">${icon("download")} ${t("Установить", "Install")}</button>`;
    }
    const detailsButton = !(installed && !isUpdate)
      ? `<button class="btn btn-ghost btn-icon" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" title="${t("Подробнее", "Details")}">${icon("info")}</button>`
      : "";

    return `<article class="catalog-row" data-context-kind="catalog" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}">
      <div class="card-logo-wrap" style="--tone:${avatarTone(remote.slug || remote.name)}">
        <span>${esc(initials(remote.name))}</span>
        ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" />` : ""}
      </div>
      <div class="catalog-row-main">
        <div class="catalog-row-title-line">
          <button class="card-title" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" title="${esc(remote.name)}">${esc(remote.name)}</button>
          ${badge}
          ${version ? `<span class="card-version" title="${t("Последняя версия", "Latest version")}">${esc(version)}</span>` : ""}
        </div>
        <div class="card-author">${esc(authorLine(remote))}</div>
        <p class="catalog-row-summary">${esc(summary)}</p>
        ${categories.length ? `<div class="card-categories catalog-row-categories">${categories.map((category) => `<span class="category-chip">${esc(category)}</span>`).join("")}</div>` : ""}
      </div>
      <div class="catalog-row-meta">
        <span class="card-stats"><span>${icon("download")} ${formatNumber(remote.downloadCount)}</span><span>${icon("clock")} ${formatDate(remote.dateModified)}</span></span>
      </div>
      <div class="card-actions">${detailsButton}${primary}</div>
    </article>`;
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
    const summary =
      String(remote.summary || "").trim() || t("Описание не опубликовано.", "No description published.");

    let badge = "";
    if (installed && isUpdate) badge = `<span class="badge badge-warning">${t("Есть обновление", "Update available")}</span>`;
    else if (installed) badge = `<span class="badge badge-success">${t("Установлен", "Installed")}</span>`;

    let primary = "";
    if (isUpdate) {
      primary = `<button class="btn btn-primary" type="button" data-action="update-addon" data-key="${esc(installed.key)}" ${busy ? "disabled" : ""}>${icon("download")} ${t("Обновить", "Update")}</button>`;
    } else if (installed) {
      primary = `<button class="btn btn-secondary" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}">${icon("info")} ${t("Подробнее", "Details")}</button>`;
    } else {
      primary = `<button class="btn btn-primary" type="button" data-action="catalog-install" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" ${busy || !latest ? "disabled" : ""} title="${latest ? t("Установить последнюю версию", "Install the latest version") : t("Нет файла для вашей версии игры", "No file for your game version")}">${icon("download")} ${t("Установить", "Install")}</button>`;
    }

    const detailsButton = !(installed && !isUpdate)
      ? `<button class="btn btn-ghost btn-icon" type="button" data-action="catalog-details" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}" title="${t("Подробнее", "Details")}">${icon("info")}</button>`
      : "";

    return `<article class="addon-card" data-context-kind="catalog" data-mod-id="${Number(remote.id)}" data-title="${esc(remote.name)}">
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
            ${version ? `<span class="card-version" title="${t("Последняя версия", "Latest version")}">${esc(version)}</span>` : ""}
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
      ? `<div class="hint warning">${t("Официальный API не будет работать без ключа. Получите ключ в CurseForge Console.", "The official API will not work without a key. Get one in the CurseForge Console.")}</div>`
      : key.trim()
        ? `<div class="hint success">${t("Ключ сохранён локально и не покидает этот компьютер.", "The key is stored locally and never leaves this computer.")}</div>`
        : `<div class="hint">${t("Для прокси ключ не требуется. Официальный API доступен с личным ключом CurseForge.", "The proxy does not require a key. The official API is available with a personal CurseForge key.")}</div>`;

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
          <button class="btn btn-secondary btn-sm" type="button" data-action="open-install-modal">${icon("gamepad")} ${t("Сменить установку", "Change installation")}</button>
          <button class="btn btn-secondary btn-sm" type="button" data-action="choose-folder">${icon("folder")} ${t("Указать папку", "Choose folder")}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="rescan-installs">${icon("search")} ${t("Найти установки", "Find installations")}</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="refresh-addons">${icon("refresh")} ${t("Обновить аддоны", "Refresh addons")}</button>
        </div>`
      : `<div class="error-panel" style="margin:0">
          <h3>${t("Установка не выбрана", "No installation selected")}</h3>
          <p>${t("Найдите World of Warcraft автоматически или укажите папку игры вручную.", "Find World of Warcraft automatically or select the game folder manually.")}</p>
          <div class="settings-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="choose-folder">${icon("folder")} ${t("Указать папку", "Choose folder")}</button>
            <button class="btn btn-secondary btn-sm" type="button" data-action="rescan-installs">${icon("search")} ${t("Найти установки", "Find installations")}</button>
          </div>
        </div>`;

    const storageRows = [
      [t("Конфигурация", "Configuration"), storage.configPath, "config"],
      [t("Манифест", "Manifest"), storage.manifestPath, "manifest"],
      [t("Резервные копии", "Backups"), storage.backupsPath, "backups"],
      [t("Загрузки", "Downloads"), storage.downloadsPath, "downloads"],
    ]
      .map(
        ([label, path, kind]) => `<div class="storage-row">
          <span class="storage-label">${label}</span>
          <span class="storage-path" title="${esc(path || "")}">${esc(path || "—")}</span>
          <button class="btn btn-ghost" type="button" data-action="open-storage" data-kind="${kind}" ${path ? "" : "disabled"}>${icon("folder")} ${t("Открыть", "Open")}</button>
        </div>`,
      )
      .join("");

    return `<div class="settings-grid">
      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("gamepad")}</div>
          <div><h2>${t("Установка World of Warcraft", "World of Warcraft installation")}</h2><p>${t("Версия игры определяет, какие файлы CurseForge будут скачаны.", "The game version determines which CurseForge files are downloaded.")}</p></div>
        </div>
        ${installSection}
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="section-icon">${icon("key")}</div>
          <div><h2>CurseForge API</h2><p>${t("По умолчанию используется публичный прокси без ключа.", "A public keyless proxy is used by default.")}</p></div>
        </div>
        <div class="choice-grid">
          <button class="api-choice ${official ? "" : "selected"}" type="button" data-action="set-api-mode" data-official="false">
            <span class="choice-title">${t("Прокси без ключа", "Keyless proxy")}</span>
            <span class="choice-desc">api.curse.tools · ${t("работает сразу", "works instantly")}</span>
          </button>
          <button class="api-choice ${official ? "selected" : ""}" type="button" data-action="set-api-mode" data-official="true">
            <span class="choice-title">${t("Официальный API", "Official API")}</span>
            <span class="choice-desc">api.curseforge.com · ${t("нужен ключ", "requires a key")}</span>
          </button>
        </div>
        <div class="field-label">${t("API-ключ CurseForge", "CurseForge API key")}</div>
        <div class="key-row">
          <div class="input-with-action">
            <input id="api-key-input" data-input="api-key" type="${state.showApiKey ? "text" : "password"}" value="${esc(key)}" placeholder="${t("Вставьте ключ…", "Paste your key…")}" autocomplete="off" spellcheck="false" />
            <button class="key-toggle" type="button" data-action="toggle-api-key">${state.showApiKey ? t("Скрыть", "Hide") : t("Показать", "Show")}</button>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" data-action="save-api-key">${icon("check")} ${t("Сохранить", "Save")}</button>
        </div>
        ${keyHint}
        <div class="hint"><button class="btn btn-ghost btn-sm" style="height:auto;padding:0;margin-top:2px;font-size:11.5px;color:var(--gold)" type="button" data-action="open-url" data-url="https://console.curseforge.com/">${t("Открыть CurseForge Console", "Open CurseForge Console")} ${icon("external")}</button></div>
      </section>

      <section class="settings-card">
        <div class="settings-card-head">
          <div class="section-icon">${icon("shield")}</div>
          <div><h2>${t("Обновления и копии", "Updates and backups")}</h2><p>${t("Поведение проверки и безопасность установки.", "Check behavior and installation safety.")}</p></div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-title">${t("Проверять обновления при запуске", "Check for updates on startup")}</div>
            <div class="settings-row-desc">${t("Сверять установленные аддоны с CurseForge автоматически.", "Compare installed addons with CurseForge automatically.")}</div>
          </div>
          <button class="switch ${settings.autoCheckUpdates ? "on" : ""}" type="button" role="switch" aria-checked="${settings.autoCheckUpdates}" data-action="toggle-setting" data-field="autoCheckUpdates"><span></span></button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-title">${t("Сохранять резервные копии", "Keep backups")}</div>
            <div class="settings-row-desc">${t("Перед заменой файлов создавать копию старых папок в локальном хранилище.", "Create a copy of old folders in local storage before replacing files.")}</div>
          </div>
          <button class="switch ${settings.keepBackups ? "on" : ""}" type="button" role="switch" aria-checked="${settings.keepBackups}" data-action="toggle-setting" data-field="keepBackups"><span></span></button>
        </div>
        <div class="hint">${t("Резервные копии хранятся в LocalAppData и позволяют вручную откатить установку.", "Backups are stored in LocalAppData and allow manual rollback.")}</div>
      </section>

      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("database")}</div>
          <div><h2>${t("Локальное хранилище", "Local storage")}</h2><p>${t("Конфигурация, манифест установок, архивы и резервные копии.", "Configuration, installation manifest, archives, and backups.")}</p></div>
        </div>
        <div class="storage-list">${storageRows}</div>
      </section>

      <section class="settings-card span-2">
        <div class="settings-card-head">
          <div class="section-icon">${icon("sparkle")}</div>
          <div><h2>${t("О приложении", "About")}</h2><p>${t("Addon Forge — менеджер аддонов World of Warcraft на Rust и Tauri.", "Addon Forge is a World of Warcraft addon manager built with Rust and Tauri.")}</p></div>
        </div>
        <p class="about-copy">${t("Приложение читает TOC-метаданные установленных аддонов, определяет проект CurseForge, подбирает совместимый файл и безопасно распаковывает архив в папку AddOns. Перед заменой существующих папок создаётся резервная копия.", "The app reads TOC metadata from installed addons, resolves the CurseForge project, selects a compatible file, and safely extracts the archive into AddOns. Existing folders are backed up before replacement.")}</p>
        <div class="about-links">
          <button class="btn btn-secondary btn-sm" type="button" data-action="open-url" data-url="https://www.curseforge.com/wow/addons">${icon("external")} CurseForge</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="nav" data-page="catalog">${icon("compass")} ${t("Открыть каталог", "Open catalog")}</button>
        </div>
        <div class="about-meta">
          <div class="about-meta-item"><strong>${t("Версия", "Version")}</strong>0.1.0</div>
          <div class="about-meta-item"><strong>${t("Интерфейс", "Interface")}</strong>Tauri 2 + HTML/CSS/JS</div>
          <div class="about-meta-item"><strong>${t("Источник", "Source")}</strong>CurseForge</div>
        </div>
      </section>
    </div>`;
  }

  function renderModals() {
    return `${renderDetailsModal()}${renderInstallModal()}${renderConfirmModal()}`;
  }

  function modalCloseButton(action = "details-close") {
    return `<button class="modal-close" type="button" data-action="${action}" aria-label="${t("Закрыть", "Close")}">${icon("close")}</button>`;
  }

  function renderDetailsModal() {
    const details = state.details;
    if (!details?.open) return "";

    if (details.loading) {
      return `<div class="modal-backdrop" data-action="details-backdrop">
        <div class="modal details-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><h2>${esc(details.title || t("Аддон CurseForge", "CurseForge addon"))}</h2><p>${t("Загрузка описания с CurseForge…", "Loading the description from CurseForge…")}</p></div>
            ${modalCloseButton()}
          </div>
          <div class="details-loading"><span class="loading-ring"></span><span>${t("Получение информации…", "Fetching information…")}</span></div>
        </div>
      </div>`;
    }

    if (details.error) {
      return `<div class="modal-backdrop" data-action="details-backdrop">
        <div class="modal details-modal" role="dialog" aria-modal="true">
          <div class="modal-header">
            <div><h2>${esc(details.title || t("Аддон CurseForge", "CurseForge addon"))}</h2><p>${t("Не удалось получить данные проекта.", "Could not load project data.")}</p></div>
            ${modalCloseButton()}
          </div>
          <div class="modal-error">
            <div class="empty-emblem">${icon("info")}</div>
            <h3>${t("Ошибка загрузки", "Loading error")}</h3>
            <p>${esc(errorText(details.error))}</p>
            <button class="btn btn-secondary btn-sm" type="button" data-action="details-retry">${icon("refresh")} ${t("Повторить", "Retry")}</button>
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
      ? t("Нет версии для игры", "No version for the game")
      : busy
        ? t("Подождите…", "Please wait…")
        : installed
          ? isUpdate
            ? `${t("Обновить", "Update")}${latestLabel ? ` · ${latestLabel}` : ""}`
            : t("Переустановить", "Reinstall")
          : `${t("Установить", "Install")}${latestLabel ? ` · ${latestLabel}` : ""}`;

    const note = !file
      ? t("Для выбранной версии игры у проекта нет подходящего файла.", "The project has no compatible file for the selected game version.")
      : installed
        ? isUpdate
          ? t("Текущая версия будет заменена, старая папка сохранится в резервной копии.", "The current version will be replaced; the old folder will be kept in a backup.")
          : t("Аддон уже установлен. Можно переустановить последнюю версию поверх текущей.", "The addon is already installed. You can reinstall the latest version over the current one.")
        : t("Файл {file} будет распакован в AddOns.", "The file {file} will be extracted into AddOns.", { file: esc(file.fileName || file.displayName || "") });

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
        const classes = ["game-version-chip"];
        if (isCurrent) classes.push("current");
        const tag = isCurrent ? `<span class="version-tag">${t("ваша", "yours")}</span>` : "";
        const title = isCurrent
          ? isSupported
            ? t("Ваша версия игры поддерживается", "Your game version is supported")
            : t("Для вашей версии игры нет подходящего файла", "There is no compatible file for your game version")
          : t("Для этой версии игры доступен файл", "A file is available for this game version");
        return `<span class="${classes.join(" ")}" title="${esc(title)}">${esc(version)}${tag}</span>`;
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
        return `<button class="shot-thumb ${active ? "active" : ""}" type="button" data-action="details-shot" data-index="${index}" title="${esc(shot.title)}" aria-label="${t("Открыть галерею: {title}", "Open gallery: {title}", { title: esc(shot.title) })}">
          <img src="${esc(shot.thumb)}" alt="" loading="lazy" />
          ${more}
        </button>`;
      })
      .join("");

    return `<div class="modal-backdrop" data-action="details-backdrop">
      <div class="modal details-modal" role="dialog" aria-modal="true" aria-label="${esc(remote.name || t("Аддон", "Addon"))}">
        <div class="details-hero">
          <div class="details-hero-bg"${heroUrl ? ` style="background-image:url('${cssUrl(heroUrl)}')"` : ""}></div>
          <div class="details-hero-content">
            <div class="details-logo">
              <span>${esc(initials(remote.name))}</span>
              ${logo ? `<img src="${esc(logo)}" alt="" />` : ""}
            </div>
            <div class="details-title-wrap">
              <h2 class="details-title" title="${esc(remote.name || "")}">${esc(remote.name || t("Без названия", "Untitled"))}</h2>
              <div class="details-meta-line">
                <span>${esc(authorLine(remote))}</span>
                <span class="meta-dot"></span>
                <span>${t("{count} загрузок", "{count} downloads", { count: formatNumber(remote.downloadCount) })}</span>
                <span class="meta-dot"></span>
                <span>${t("Обновлён {date}", "Updated {date}", { date: formatDate(remote.dateModified) })}</span>
              </div>
            </div>
            <div class="details-hero-actions">
              ${external ? `<button class="btn btn-secondary btn-icon" type="button" data-action="open-url" data-url="${esc(external)}" title="${t("Открыть на CurseForge", "Open on CurseForge")}">${icon("external")}</button>` : ""}
              ${modalCloseButton()}
            </div>
          </div>
        </div>

        <div class="details-body">
          <div class="details-layout">
            <div>
              <div class="details-section-label">${t("Описание", "Description")}</div>
              ${formatDescription(data.description)}
            </div>
            <aside class="details-side">
              <div class="side-block">
                <div class="side-block-title">${t("Версия", "Version")}</div>
                <div class="side-list">
                  <div class="side-pair"><span class="label">${t("Последняя", "Latest")}</span><span class="value" style="color:var(--gold)">${esc(latestLabel || "—")}</span></div>
                  <div class="side-pair"><span class="label">${t("Тип", "Type")}</span><span class="value">${esc(releaseLabel(file?.releaseType))}</span></div>
                  <div class="side-pair"><span class="label">${t("Размер", "Size")}</span><span class="value">${formatBytes(file?.fileLength)}</span></div>
                  <div class="side-pair"><span class="label">${t("Файл", "File")}</span><span class="value" title="${esc(file?.fileName || "")}">${esc(file?.fileName || "—")}</span></div>
                </div>
              </div>

              ${gameVersions.length ? `<div class="side-block">
                <div class="side-block-title">${t("Версии игры", "Game versions")}</div>
                <div class="game-version-list">${gameVersionChips}</div>
                <div class="game-version-note">${localVersion
                  ? currentVersionAvailable
                    ? t("Зелёным отмечена ваша версия.", "Your version is highlighted in green.")
                    : t("Для вашей версии игры файла нет.", "There is no file for your game version.")
                  : t("Версия игры не определена.", "The game version was not detected.")}</div>
              </div>` : ""}

              ${categories.length ? `<div class="side-block">
                <div class="side-block-title">${t("Категории", "Categories")}</div>
                <div class="side-chips">${categories.map((category) => `<span class="category-chip">${esc(category)}</span>`).join("")}</div>
              </div>` : ""}

              ${screenshotThumbs ? `<div class="side-block">
                <div class="side-block-title">${t("Скриншоты", "Screenshots")} <span class="side-block-count">${gallery.length}</span></div>
                <div class="screenshot-grid">${screenshotThumbs}</div>
                <div class="screenshot-hint">${icon("image")} ${t("Нажмите, чтобы открыть галерею", "Click to open the gallery")}</div>
              </div>` : ""}

              ${external ? `<button class="btn btn-secondary btn-sm" type="button" data-action="open-url" data-url="${esc(external)}">${icon("external")} ${t("Страница на CurseForge", "CurseForge page")}</button>` : ""}
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
    if (!source.trim()) {
      return `<div class="description-empty">${t("Описание не опубликовано.", "No description published.")}</div>`;
    }
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
                <span class="install-option-title">${esc(install.displayName || install.flavorLabel)}${selected ? `<span class="badge badge-success">${t("Выбрано", "Selected")}</span>` : ""}</span>
                <span class="install-option-path">${esc(install.addonsDir)}</span>
              </span>
              <span class="install-option-meta">${esc(install.version || "—")}<br />Interface ${esc(install.interface || "—")}</span>
              ${selected ? `<span class="install-option-check">${icon("check")}</span>` : ""}
            </button>`;
          })
          .join("")
      : `<div class="install-modal-empty">${t("Установки не найдены.", "No installations found.")}<br />${t("Укажите папку World of Warcraft или обновите список.", "Select the World of Warcraft folder or refresh the list.")}</div>`;

    return `<div class="modal-backdrop" data-action="install-backdrop">
      <div class="modal modal-small" role="dialog" aria-modal="true" aria-label="${t("Выбор установки World of Warcraft", "Select a World of Warcraft installation")}">
        <div class="modal-header">
          <div><h2>${t("Установка World of Warcraft", "World of Warcraft installation")}</h2><p>${t("Выберите версию игры, с которой будет работать Addon Forge.", "Choose the game version Addon Forge should use.")}</p></div>
          ${modalCloseButton("close-install-modal")}
        </div>
        <div class="install-options">${options}</div>
        <div class="modal-footer split">
          <div class="footer-left">${state.installs.length ? t("Найдено: {count}", "Found: {count}", { count: state.installs.length }) : t("Поддерживаются Retail, Classic, Classic Era и Forever", "Retail, Classic, Classic Era, and Forever are supported")}</div>
          <div class="footer-right">
            <button class="btn btn-secondary" type="button" data-action="rescan-installs" ${busy ? "disabled" : ""}>${icon("search", busy ? "spin" : "")} ${t("Обновить список", "Refresh list")}</button>
            <button class="btn btn-primary" type="button" data-action="choose-folder" ${busy ? "disabled" : ""}>${icon("folder")} ${t("Указать папку", "Choose folder")}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function renderConfirmModal() {
    const confirm = state.confirm;
    if (!confirm) return "";
    if (confirm.kind !== "remove-addon") return "";
    const busy = Boolean(confirm.busy);
    return `<div class="modal-backdrop" data-action="confirm-backdrop">
      <div class="modal modal-small confirm-modal" role="dialog" aria-modal="true" aria-label="${t("Удаление аддона", "Remove addon")}">
        <div class="modal-header">
          <div><h2>${t("Удалить аддон?", "Remove addon?")}</h2><p>${t("Действие затронет файлы в папке AddOns.", "This will affect files in the AddOns folder.")}</p></div>
          <button class="modal-close" type="button" data-action="confirm-cancel" aria-label="${t("Закрыть", "Close")}" ${busy ? "disabled" : ""}>${icon("close")}</button>
        </div>
        <div class="confirm-body">
          <div class="confirm-icon">${icon("trash")}</div>
          <div class="confirm-copy">
            <div class="confirm-title">${esc(confirm.title || t("Выбранный аддон", "Selected addon"))}</div>
            <p>${t("Папки аддона будут удалены из World of Warcraft.", "The addon folders will be removed from World of Warcraft.")}${state.settings.keepBackups ? ` ${t("Перед удалением будет создана резервная копия.", "A backup will be created before removal.")}` : ` ${t("Резервная копия создаваться не будет.", "No backup will be created.")}`}</p>
            ${confirm.error ? `<div class="hint warning">${esc(errorText(confirm.error))}</div>` : ""}
          </div>
        </div>
        <div class="modal-footer split">
          <div class="footer-left">${state.settings.keepBackups ? t("Копия сохранится в локальном хранилище", "A copy will be kept in local storage") : t("Резервные копии отключены", "Backups are disabled")}</div>
          <div class="footer-right">
            <button class="btn btn-secondary" type="button" data-action="confirm-cancel" ${busy ? "disabled" : ""}>${t("Отмена", "Cancel")}</button>
            <button class="btn btn-danger" type="button" data-action="confirm-remove-addon" ${busy ? "disabled" : ""}>${busy ? icon("refresh", "spin") : icon("trash")} ${busy ? t("Удаление…", "Removing…") : t("Удалить", "Remove")}</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function contextMenuItem(iconName, label, action, options = {}) {
    const classes = ["context-item", options.danger ? "danger" : ""].filter(Boolean).join(" ");
    return `<button class="${classes}" type="button" role="menuitem" data-action="${action}" ${options.disabled ? "disabled" : ""}>${icon(iconName)}<span>${esc(label)}</span></button>`;
  }

  function renderContextMenu() {
    const root = $("context-menu-root");
    if (!root) return;
    const menu = state.contextMenu;
    if (!menu) {
      if (root.innerHTML) root.innerHTML = "";
      return;
    }

    const busy = state.checking || state.installTasks.size > 0 || state.batchActive;
    let items = "";
    if (menu.installed) {
      items = [
        contextMenuItem("info", t("Подробнее", "Details"), "context-details"),
        contextMenuItem("refresh", t("Переустановить", "Reinstall"), "context-reinstall", { disabled: busy }),
        '<div class="context-separator"></div>',
        contextMenuItem("trash", t("Удалить", "Remove"), "context-delete", { danger: true, disabled: busy }),
      ].join("");
    } else {
      items = [
        contextMenuItem("download", t("Установить", "Install"), "context-install", { disabled: busy || !menu.latestFile }),
        contextMenuItem("info", t("Подробнее", "Details"), "context-details"),
      ].join("");
    }

    root.innerHTML = `<div class="context-menu" role="menu" aria-label="${esc(menu.title || t("Действия", "Actions"))}" style="left:0;top:0">
      <div class="context-title" title="${esc(menu.title || "")}">${esc(menu.title || t("Аддон", "Addon"))}</div>
      ${items}
    </div>`;

    const panel = root.firstElementChild;
    if (!panel) return;
    const margin = 10;
    const maxLeft = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
    panel.style.left = `${Math.min(Math.max(Number(menu.x) || 0, margin), maxLeft)}px`;
    panel.style.top = `${Math.min(Math.max(Number(menu.y) || 0, margin), maxTop)}px`;
  }

  function openContextMenu(menu, x, y) {
    state.contextMenu = { ...menu, x: Number(x) || 0, y: Number(y) || 0 };
    renderContextMenu();
  }

  function closeContextMenu() {
    if (!state.contextMenu && !$("context-menu-root")?.innerHTML) return;
    state.contextMenu = null;
    renderContextMenu();
  }

  function askRemoveAddon(key) {
    const addon = state.addons.find((item) => item.key === key);
    if (!addon) return;
    if (state.checking || state.installTasks.size > 0 || state.batchActive) {
      toast(
        t("Дождитесь завершения операции", "Wait for the current operation to finish"),
        t("Удаление недоступно во время проверки или установки.", "Removal is unavailable while checking or installing."),
        "info",
      );
      return;
    }
    state.confirm = {
      kind: "remove-addon",
      key: addon.key,
      title: addon.title,
      busy: false,
      error: null,
    };
    render();
  }

  function closeConfirm() {
    if (state.confirm?.busy) return;
    state.confirm = null;
    render();
  }

  async function confirmRemoveAddon() {
    const confirm = state.confirm;
    if (!confirm || confirm.kind !== "remove-addon" || confirm.busy) return;
    confirm.busy = true;
    confirm.error = null;
    render();
    try {
      const result = await invoke("remove_addon", { key: confirm.key });
      state.addons = result.addons || state.addons;
      state.checks.delete(confirm.key);
      state.confirm = null;
      render();
      toast(
        t("Аддон удалён", "Addon removed"),
        `${result.title || confirm.title} · ${tn(result.removed, ["{count} папка", "{count} папки", "{count} папок"], ["{count} folder", "{count} folders"])}${result.backupDir ? ` · ${t("резервная копия создана", "backup created")}` : ""}`,
        "success",
      );
    } catch (error) {
      if (state.confirm) {
        state.confirm.busy = false;
        state.confirm.error = errorText(error);
      }
      render();
      toast(t("Не удалось удалить аддон", "Could not remove the addon"), errorText(error), "danger");
    }
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
          `<button class="lightbox-thumb ${shotIndex === index ? "active" : ""}" type="button" data-action="lightbox-select" data-index="${shotIndex}" aria-label="${t("Скриншот {number}", "Screenshot {number}", { number: shotIndex + 1 })}" aria-current="${shotIndex === index ? "true" : "false"}">
            <img src="${esc(shot.thumb)}" alt="" loading="lazy" />
          </button>`,
      )
      .join("");

    return `<div class="lightbox" data-action="lightbox-backdrop" role="dialog" aria-modal="true" aria-label="${t("Галерея скриншотов", "Screenshot gallery")}">
      <div class="lightbox-card">
        <div class="lightbox-head">
          <div>
            <div class="lightbox-kicker">${t("Галерея аддона", "Addon gallery")}</div>
            <div class="lightbox-counter">${t("{current} of {total}", "{current} of {total}", { current: index + 1, total: items.length })}</div>
          </div>
          <button class="lightbox-close" type="button" data-action="close-lightbox" aria-label="${t("Закрыть галерею", "Close gallery")}">${icon("close")}</button>
        </div>
        <div class="lightbox-stage">
          ${multiple ? `<button class="lightbox-nav prev" type="button" data-action="lightbox-prev" aria-label="${t("Предыдущий скриншот", "Previous screenshot")}">${icon("arrowLeft")}</button>` : ""}
          <img src="${esc(current.full)}" alt="${esc(current.title)}" />
          ${multiple ? `<button class="lightbox-nav next" type="button" data-action="lightbox-next" aria-label="${t("Следующий скриншот", "Next screenshot")}">${icon("arrowRight")}</button>` : ""}
        </div>
        <div class="lightbox-caption">
          <span class="lightbox-title">${esc(current.title)}</span>
          <span class="lightbox-hint">${t("← → для навигации · Esc для закрытия", "← → to navigate · Esc to close")}</span>
        </div>
        ${multiple ? `<div class="lightbox-thumbs">${thumbnails}</div>` : ""}
      </div>
    </div>`;
  }

  function centerLightboxThumb(root) {
    const strip = root.querySelector(".lightbox-thumbs");
    const active = root.querySelector(".lightbox-thumb.active");
    if (!strip || !active) return;
    strip.scrollLeft = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
  }

  function syncLightboxRoot(force = false) {
    const root = $("lightbox-root");
    if (!root) return;
    if (!state.lightbox || !galleryItems().length) {
      if (root.innerHTML) root.innerHTML = "";
      return;
    }
    if (force || !root.querySelector(".lightbox")) {
      root.innerHTML = renderLightbox();
      centerLightboxThumb(root);
    }
  }

  function applyDetailsShotPreview() {
    if (!state.details) return;
    const activeShot = safeUrl(state.details.activeShot);
    const hero = document.querySelector(".details-hero-bg");
    if (hero) {
      hero.style.backgroundImage = activeShot ? `url("${cssUrl(activeShot)}")` : "";
    }
    const shots = galleryItems();
    document.querySelectorAll(".details-body .shot-thumb[data-index]").forEach((thumb) => {
      const shot = shots[Number(thumb.dataset.index)];
      thumb.classList.toggle("active", Boolean(shot && shot.full === activeShot));
    });
  }

  function refreshLightboxDom() {
    const root = $("lightbox-root");
    const items = galleryItems();
    if (!root || !state.lightbox || !items.length) {
      syncLightboxRoot();
      return;
    }
    const index = Math.min(Math.max(Number(state.lightbox.index) || 0, 0), items.length - 1);
    state.lightbox = { index };
    const current = items[index];
    if (state.details) state.details.activeShot = current.full;

    const counter = root.querySelector(".lightbox-counter");
    if (counter) {
      counter.textContent = t("{current} of {total}", "{current} of {total}", {
        current: index + 1,
        total: items.length,
      });
    }
    const title = root.querySelector(".lightbox-title");
    if (title) title.textContent = current.title;

    const image = root.querySelector(".lightbox-stage img");
    if (image) {
      if (image.getAttribute("src") === current.full) {
        image.alt = current.title;
      } else {
        const targetIndex = index;
        const targetFull = current.full;
        const fallback = current.thumb;
        const applyImage = (src) => {
          if (!state.lightbox || state.lightbox.index !== targetIndex) return;
          image.src = src;
          image.alt = current.title;
        };
        const preload = new Image();
        preload.onload = () => applyImage(targetFull);
        preload.onerror = () => applyImage(fallback);
        preload.src = targetFull;
      }
    }

    root.querySelectorAll(".lightbox-thumb").forEach((thumb) => {
      const active = Number(thumb.dataset.index) === index;
      thumb.classList.toggle("active", active);
      thumb.setAttribute("aria-current", active ? "true" : "false");
    });
    centerLightboxThumb(root);
    applyDetailsShotPreview();
  }

  async function switchLanguage(language) {
    if (!["ru", "en"].includes(language) || language === getLocale()) return;
    const main = $("main");
    const scrollTop = main?.scrollTop || 0;
    setLocale(language);
    state.settings.language = language;
    state.settingsDraft.language = language;
    render();
    if (main) main.scrollTop = scrollTop;
    if (!invoke) return;
    try {
      await invoke("set_language", { language });
    } catch (error) {
      console.error("Failed to persist the interface language", error);
      toast(
        t("Не удалось сохранить язык", "Could not save the language preference"),
        errorText(error),
        "danger",
      );
    }
  }

  function setPage(page) {
    if (!["installed", "catalog", "settings"].includes(page)) return;
    const changed = state.page !== page;
    state.page = page;
    if (changed) {
      state.details = null;
      state.lightbox = null;
      state.installModal = false;
      state.confirm = null;
      closeContextMenu();
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
      if (!silent) {
        toast(
          t("Сначала выберите установку игры", "Select a game installation first"),
          t("Настройки → Установка World of Warcraft.", "Settings → World of Warcraft installation."),
          "warning",
        );
      }
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
      toast(t("Не удалось проверить обновления", "Could not check for updates"), errorText(error), "danger");
    }
  }

  function showCheckToast(summary, silent) {
    const checked = Number(summary.checked || state.addons.length);
    const updates = Number(summary.updates || 0);
    const failed = Number(summary.failed || 0);
    if (updates > 0) {
      toast(
        tn(updates, ["Найдено {count} обновление", "Найдено {count} обновления", "Найдено {count} обновлений"], ["{count} update found", "{count} updates found"]),
        `${tn(checked, ["Проверено {count} аддон", "Проверено {count} аддона", "Проверено {count} аддонов"], ["{count} addon checked", "{count} addons checked"])}${failed ? ` · ${t("ошибок: {count}", "errors: {count}", { count: failed })}` : ""}.`,
        "warning",
      );
      return;
    }
    if (failed > 0) {
      toast(
        t("Проверка завершена с ошибками", "Update check completed with errors"),
        t("Не удалось проверить {failed} из {checked}. Подробности — в статусе аддонов.", "Could not check {failed} of {checked}. See the addon statuses for details.", { failed, checked }),
        "danger",
      );
      return;
    }
    if (!silent) {
      toast(
        t("Все аддоны актуальны", "All addons are up to date"),
        `${tn(checked, ["Проверен {count} аддон", "Проверено {count} аддона", "Проверено {count} аддонов"], ["{count} addon checked", "{count} addons checked"])} — ${t("обновлений нет", "no updates found")}.`,
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
      statusLabel: t("Проверка…", "Checking…"),
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
        toast(
          t("Не удалось проверить аддон", "Could not check the addon"),
          result.error
            ? errorText(result.error)
            : statusLabel(result.status, result.statusLabel),
          "danger",
        );
      }
    } catch (error) {
      if (previous) state.checks.set(key, previous);
      render();
      toast(t("Не удалось проверить аддон", "Could not check the addon"), errorText(error), "danger");
    }
  }

  async function updateAddon(key, options = {}) {
    const reinstall = Boolean(options.reinstall);
    if (!state.install) {
      openInstallModal();
      toast(
        t("Сначала выберите установку игры", "Select a game installation first"),
        t("Без неё нельзя определить подходящую версию файла.", "Without it, the correct file version cannot be determined."),
        "warning",
      );
      return;
    }
    if (state.checking) {
      toast(
        t("Дождитесь проверки обновлений", "Wait for the update check to finish"),
        t("Установка во время проверки может изменить список аддонов.", "Installing during an update check may change the addon list."),
        "info",
      );
      return;
    }
    if (state.installTasks.size || state.batchActive) {
      toast(
        t("Установка уже выполняется", "An installation is already in progress"),
        t("Дождитесь завершения текущей операции.", "Wait for the current operation to finish."),
        "info",
      );
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
        statusLabel: t("Актуально", "Up to date"),
        tone: "success",
        updateAvailable: false,
        error: null,
        pulsing: false,
      };
      state.checks.set(result.key, upToDate);
      if (key !== result.key) state.checks.set(key, upToDate);
      render();
      toast(
        reinstall
          ? t("Аддон переустановлен", "Addon reinstalled")
          : result.isUpdate
            ? t("Аддон обновлён", "Addon updated")
            : t("Аддон установлен", "Addon installed"),
        `${result.title} · ${result.version}${result.backupDir ? ` · ${t("резервная копия создана", "backup created")}` : ""}`,
        "success",
      );
    } catch (error) {
      toast(
        reinstall
          ? t("Не удалось переустановить аддон", "Could not reinstall the addon")
          : t("Не удалось обновить аддон", "Could not update the addon"),
        errorText(error),
        "danger",
      );
    } finally {
      state.installTasks.delete(key);
      render();
    }
  }

  async function updateAll() {
    if (!state.install) return;
    if (state.checking || state.installTasks.size || state.batchActive) {
      toast(
        t("Дождитесь завершения текущей операции", "Wait for the current operation to finish"),
        t("Проверка или установка уже выполняется.", "A check or installation is already in progress."),
        "info",
      );
      return;
    }
    const keys = state.addons.filter((addon) => statusFor(addon).updateAvailable).map((addon) => addon.key);
    if (!keys.length) {
      toast(
        t("Обновлений нет", "No updates available"),
        t("Все установленные аддоны актуальны.", "All installed addons are up to date."),
        "success",
      );
      return;
    }
    state.batchActive = true;
    render();
    try {
      const result = await invoke("update_addons", { keys });
      state.addons = result.addons || state.addons;
      const succeeded = Number(result.succeeded || 0);
      const failed = Number(result.failed || 0);
      const lines = Array.isArray(result.errors)
        ? result.errors.slice(0, 3).map((line) => errorText(line))
        : [];
      const message = `${t("Обновлено {succeeded} из {total}.", "{succeeded} of {total} updated.", { succeeded, total: Number(result.total || keys.length) })}${lines.length ? `\n${lines.join("\n")}` : ""}`;
      toast(
        failed
          ? t("Обновление завершено с ошибками", "Update completed with errors")
          : t("Обновление завершено", "Update completed"),
        message,
        failed ? "warning" : "success",
        7000,
      );
    } catch (error) {
      toast(t("Не удалось обновить аддоны", "Could not update addons"), errorText(error), "danger");
    } finally {
      state.batchActive = false;
      state.installTasks.clear();
      render();
    }
  }

  async function installCatalog(modId, title, latestFile = null) {
    if (!state.install) {
      openInstallModal();
      toast(
        t("Сначала выберите установку игры", "Select a game installation first"),
        t("Установка аддона требует известной версии игры.", "Installing an addon requires a known game version."),
        "warning",
      );
      return;
    }
    if (state.checking) {
      toast(
        t("Дождитесь проверки обновлений", "Wait for the update check to finish"),
        t("Установка во время проверки может изменить список аддонов.", "Installing during an update check may change the addon list."),
        "info",
      );
      return;
    }
    if (state.installTasks.size || state.batchActive) {
      toast(
        t("Установка уже выполняется", "An installation is already in progress"),
        t("Дождитесь завершения текущей операции.", "Wait for the current operation to finish."),
        "info",
      );
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
        statusLabel: t("Актуально", "Up to date"),
        tone: "success",
        updateAvailable: false,
        error: null,
        pulsing: false,
      });
      state.installTasks.clear();
      render();
      toast(
        result.isUpdate
          ? t("Аддон обновлён", "Addon updated")
          : t("Аддон установлен", "Addon installed"),
        `${result.title} · ${result.version}${result.backupDir ? ` · ${t("резервная копия создана", "backup created")}` : ""}`,
        "success",
      );
    } catch (error) {
      toast(t("Не удалось установить аддон", "Could not install the addon"), errorText(error), "danger");
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
      title: addon?.title || t("Аддон", "Addon"),
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
    applyDetailsShotPreview();
    syncLightboxRoot(true);
  }

  function moveLightbox(delta) {
    if (!state.lightbox) return;
    const items = galleryItems();
    if (!items.length) return;
    const current = Math.min(Math.max(Number(state.lightbox.index) || 0, 0), items.length - 1);
    state.lightbox = { index: (current + delta + items.length) % items.length };
    refreshLightboxDom();
  }

  function selectLightbox(index) {
    if (!state.lightbox) return;
    const items = galleryItems();
    const nextIndex = Number(index);
    if (!items.length || !Number.isFinite(nextIndex)) return;
    state.lightbox = { index: Math.min(Math.max(nextIndex, 0), items.length - 1) };
    refreshLightboxDom();
  }

  function closeLightbox() {
    state.lightbox = null;
    syncLightboxRoot();
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
      toast(
        t("Дождитесь проверки обновлений", "Wait for the update check to finish"),
        t("Смена установки во время проверки может смешать результаты.", "Changing the installation during a check may mix results."),
        "info",
      );
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
        t("Установка выбрана", "Installation selected"),
        data.install ? `${data.install.displayName} · ${data.install.version}` : "",
        "success",
      );
    } catch (error) {
      state.installModalBusy = false;
      render();
      toast(t("Не удалось выбрать установку", "Could not select the installation"), errorText(error), "danger");
    }
  }

  async function chooseFolder() {
    if (state.installModalBusy) return;
    if (state.checking) {
      toast(
        t("Дождитесь проверки обновлений", "Wait for the update check to finish"),
        t("После проверки можно выбрать другую папку игры.", "You can choose another game folder after the check."),
        "info",
      );
      return;
    }
    state.installModalBusy = true;
    render();
    try {
      const path = await invoke("pick_wow_folder", { language: getLocale() });
      if (!path) return;
      const data = await invoke("add_install_path", { path });
      applySelection(data);
      toast(
        t("Папка добавлена", "Folder added"),
        data.install ? `${data.install.displayName} · ${data.install.version}` : "",
        "success",
      );
    } catch (error) {
      toast(t("Не удалось добавить папку", "Could not add the folder"), errorText(error), "danger");
    } finally {
      state.installModalBusy = false;
      render();
    }
  }

  async function rescanInstalls() {
    if (state.installModalBusy) return;
    if (state.checking) {
      toast(
        t("Дождитесь проверки обновлений", "Wait for the update check to finish"),
        t("Повторный поиск установки остановит текущую сверку.", "Searching again will stop the current check."),
        "info",
      );
      return;
    }
    state.installModalBusy = true;
    render();
    try {
      const data = await invoke("bootstrap");
      applyBootstrap(data, { autoCheck: true, keepModal: state.installModal });
      toast(
        t("Список установок обновлён", "Installation list refreshed"),
        data.install
          ? t("Выбрано: {name}", "Selected: {name}", { name: data.install.displayName })
          : t("Установки не найдены", "No installations found"),
        data.install ? "success" : "info",
      );
    } catch (error) {
      toast(t("Не удалось обновить список", "Could not refresh the list"), errorText(error), "danger");
    } finally {
      state.installModalBusy = false;
      render();
    }
  }

  async function refreshAddons() {
    if (!state.install) {
      toast(
        t("Установка не выбрана", "No installation selected"),
        t("Сначала найдите World of Warcraft.", "Find World of Warcraft first."),
        "warning",
      );
      return;
    }
    try {
      const data = await invoke("refresh_installed");
      state.installs = data.installs || state.installs;
      state.selectedInstall = data.selectedInstall ?? state.selectedInstall;
      state.install = data.install || state.install;
      state.addons = data.addons || state.addons;
      render();
      toast(
        t("Список аддонов обновлён", "Addon list refreshed"),
        t("Найдено: {count}.", "Found: {count}.", { count: state.addons.length }),
        "success",
      );
    } catch (error) {
      toast(t("Не удалось обновить список", "Could not refresh the list"), errorText(error), "danger");
    }
  }

  async function openStorage(kind) {
    try {
      await invoke("open_storage", { kind });
    } catch (error) {
      toast(t("Не удалось открыть папку", "Could not open the folder"), errorText(error), "danger");
    }
  }

  async function openExternal(url) {
    const safe = safeUrl(url);
    if (!safe) return;
    try {
      await invoke("open_external", { url: safe });
    } catch (error) {
      toast(t("Не удалось открыть ссылку", "Could not open the link"), errorText(error), "danger");
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
      toast(t("Не удалось сохранить настройки", "Could not save settings"), errorText(error), "danger");
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
    persistSettings({ apiKey: key }, t("Ключ сохранён", "Key saved"));
  }

  function onContextMenu(event) {
    const target = event.target.closest?.("[data-context-kind]");
    if (!target) return;
    event.preventDefault();
    const kind = target.dataset.contextKind;
    if (kind === "installed") {
      const key = target.dataset.addonKey || "";
      const addon = state.addons.find((item) => item.key === key);
      if (!addon) return;
      openContextMenu(
        {
          kind: "installed",
          key: addon.key,
          title: addon.title,
          installed: true,
        },
        event.clientX,
        event.clientY,
      );
      return;
    }
    if (kind === "catalog") {
      const modId = Number(target.dataset.modId);
      const remote = state.catalog.results.find((item) => Number(item.id) === modId);
      if (!remote) return;
      const installed = installedForRemote(remote);
      openContextMenu(
        {
          kind: "catalog",
          modId,
          title: remote.name || target.dataset.title || "",
          installed: Boolean(installed),
          key: installed?.key || null,
          latestFile: remote.latestFile || null,
        },
        event.clientX,
        event.clientY,
      );
    }
  }

  function onDoubleClick(event) {
    if (event.target.closest("button, a, input, select, textarea, [data-action]")) return;
    const target = event.target.closest?.("[data-context-kind]");
    if (!target) return;
    closeContextMenu();
    if (target.dataset.contextKind === "installed") {
      openInstalledDetails(target.dataset.addonKey || "");
      return;
    }
    if (target.dataset.contextKind === "catalog") {
      openCatalogDetails(Number(target.dataset.modId), target.dataset.title || "");
    }
  }

  function onClick(event) {
    const inContextMenu = Boolean(event.target.closest("#context-menu-root"));
    if (state.contextMenu && !inContextMenu) closeContextMenu();
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (
      (action === "details-backdrop" ||
        action === "install-backdrop" ||
        action === "confirm-backdrop" ||
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
      case "set-view-mode":
        setViewMode(actionEl.dataset.view || "", actionEl.dataset.mode || "");
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
      case "details-backdrop":
        closeDetails();
        break;
      case "install-backdrop":
        closeInstallModal();
        break;
      case "confirm-backdrop":
        closeConfirm();
        break;
      case "lightbox-backdrop":
        closeLightbox();
        break;
      case "context-details": {
        const menu = state.contextMenu;
        if (!menu) break;
        if (menu.kind === "installed") openInstalledDetails(menu.key);
        else openCatalogDetails(menu.modId, menu.title);
        break;
      }
      case "context-reinstall": {
        const menu = state.contextMenu;
        if (menu?.key) updateAddon(menu.key, { reinstall: true });
        break;
      }
      case "context-delete": {
        const menu = state.contextMenu;
        if (menu?.key) askRemoveAddon(menu.key);
        break;
      }
      case "context-install": {
        const menu = state.contextMenu;
        if (menu?.modId) {
          const remote = state.catalog.results.find((item) => Number(item.id) === Number(menu.modId));
          installCatalog(menu.modId, menu.title || remote?.name || "", remote?.latestFile || null);
        }
        break;
      }
      case "confirm-cancel":
        closeConfirm();
        break;
      case "confirm-remove-addon":
        confirmRemoveAddon();
        break;
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
      case "set-language":
        switchLanguage(actionEl.dataset.language);
        break;
      case "retry-bootstrap":
        showBoot();
        setBootText(t("Повторный поиск World of Warcraft…", "Searching for World of Warcraft again…"));
        loadBootstrap();
        break;
      default:
        break;
    }
    if (inContextMenu) closeContextMenu();
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
      if (state.contextMenu) {
        closeContextMenu();
        event.preventDefault();
        return;
      }
      if (state.lightbox) {
        closeLightbox();
        event.preventDefault();
        return;
      }
      if (state.confirm) {
        closeConfirm();
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
    if (state.contextMenu) closeContextMenu();
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
      state.fatal = t(
        "Tauri API недоступен. Запустите приложение через Tauri, а не открывайте index.html в браузере.",
        "The Tauri API is unavailable. Launch the app through Tauri instead of opening index.html in a browser.",
      );
      hideBoot();
      render();
      return;
    }

    document.addEventListener("click", onClick);
    document.addEventListener("contextmenu", onContextMenu);
    document.addEventListener("dblclick", onDoubleClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onChange);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("error", onImageError, true);
    window.addEventListener("resize", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);

    registerEvents().then(loadBootstrap);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
