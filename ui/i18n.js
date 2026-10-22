(() => {
  "use strict";

  const STORAGE_KEY = "addonforge.language";
  const SUPPORTED = ["ru", "en"];
  const STATIC_TEXT = {
    "nav.section": { ru: "Навигация", en: "Navigation" },
    "nav.aria": { ru: "Основная навигация", en: "Main navigation" },
    "nav.installed": { ru: "Установленные", en: "Installed" },
    "nav.catalog": { ru: "Каталог CurseForge", en: "CurseForge Catalog" },
    "nav.settings": { ru: "Настройки", en: "Settings" },
    "install.label": { ru: "Установка", en: "Installation" },
    "install.searching": { ru: "Поиск игры…", en: "Searching for game…" },
    "boot.searching": { ru: "Поиск World of Warcraft…", en: "Searching for World of Warcraft…" },
    "language.label": { ru: "Язык", en: "Language" },
    "language.aria": { ru: "Язык интерфейса", en: "Interface language" },
  };

  function normalize(value) {
    const language = String(value || "")
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0];
    return SUPPORTED.includes(language) ? language : "";
  }

  function systemLanguage() {
    const languages = Array.isArray(navigator.languages) ? navigator.languages : [];
    const candidate = languages.find(Boolean) || navigator.language || "";
    return normalize(candidate) || "en";
  }

  function storedLanguage() {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch (_) {
      return "";
    }
  }

  let locale = storedLanguage() || systemLanguage();

  function interpolate(template, vars) {
    if (!vars) return template;
    return String(template).replace(/\{(\w+)\}/g, (match, key) =>
      Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
    );
  }

  function t(ru, en, vars) {
    return interpolate(locale === "ru" ? ru : en, vars);
  }

  function ruPluralIndex(count) {
    const n = Math.abs(Number(count) || 0);
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 0;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 1;
    return 2;
  }

  function tn(count, ruForms, enForms, vars) {
    const value = Number(count) || 0;
    const template =
      locale === "ru" ? ruForms[ruPluralIndex(value)] : value === 1 ? enForms[0] : enForms[1];
    return interpolate(template, { count: value, ...(vars || {}) });
  }

  function localeTag() {
    return locale === "ru" ? "ru-RU" : "en-US";
  }

  function staticText(key) {
    const entry = STATIC_TEXT[key];
    if (!entry) return key;
    return entry[locale] || entry.ru || key;
  }

  function applyStatic(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = staticText(element.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", staticText(element.dataset.i18nAriaLabel));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.setAttribute("title", staticText(element.dataset.i18nTitle));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.setAttribute("placeholder", staticText(element.dataset.i18nPlaceholder));
    });
    syncLanguageButtons(root);
  }

  function syncLanguageButtons(root = document) {
    root.querySelectorAll('[data-action="set-language"]').forEach((button) => {
      const active = button.dataset.language === locale;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setLocale(value, options = {}) {
    const next = normalize(value);
    if (!next) return locale;
    locale = next;
    document.documentElement.lang = locale;
    if (options.persist !== false) {
      try {
        localStorage.setItem(STORAGE_KEY, locale);
      } catch (_) {
        /* localStorage may be unavailable */
      }
    }
    applyStatic();
    window.dispatchEvent(new CustomEvent("addonforge:language", { detail: { locale } }));
    return locale;
  }

  function setInitialLanguage(preferred) {
    const explicit = normalize(preferred);
    locale = explicit || storedLanguage() || systemLanguage();
    return setLocale(locale, { persist: Boolean(explicit) });
  }

  function getLocale() {
    return locale;
  }

  document.documentElement.lang = locale;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => applyStatic());
  } else {
    applyStatic();
  }

  window.AddonForgeI18n = {
    t,
    tn,
    localeTag,
    getLocale,
    setLocale,
    setInitialLanguage,
    applyStatic,
  };
})();
