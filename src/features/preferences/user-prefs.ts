/**
 * Local UI preferences (theme, locale, font scale) — persist with pb: keys
 * until a real user settings store exists.
 */

export const THEME_STORAGE_KEY = "pb:theme";
export const LOCALE_STORAGE_KEY = "pb:locale";
export const FONT_SCALE_STORAGE_KEY = "pb:font-scale";
export const PREFS_EVENT = "pb:user-prefs-change";

export type ThemeId =
  | "dark"
  | "light"
  | "mono"
  | "slate"
  | "charcoal"
  | "phosphor";

export type LocaleId = "en" | "nl";

export type FontScaleId = "sm" | "md" | "lg";

export const THEME_OPTIONS: {
  id: ThemeId;
  label: string;
  description: string;
}[] = [
  {
    id: "dark",
    label: "Corona dark",
    description: "Default professional dashboard",
  },
  {
    id: "light",
    label: "Paper light",
    description: "Bright panels with cool ink",
  },
  {
    id: "mono",
    label: "High-contrast mono",
    description: "Near-black / near-white focus",
  },
  {
    id: "slate",
    label: "Cool slate",
    description: "Steel blues and muted surfaces",
  },
  {
    id: "charcoal",
    label: "Warm charcoal",
    description: "Soft ember accents on warm dark",
  },
  {
    id: "phosphor",
    label: "Green phosphor",
    description: "Classic CRT terminal glow",
  },
];

export const LOCALE_OPTIONS: { id: LocaleId; label: string }[] = [
  { id: "en", label: "English" },
  { id: "nl", label: "Nederlands" },
];

export const FONT_SCALE_OPTIONS: {
  id: FontScaleId;
  label: string;
  scale: string;
}[] = [
  { id: "sm", label: "Small", scale: "0.925" },
  { id: "md", label: "Medium", scale: "1" },
  { id: "lg", label: "Large", scale: "1.1" },
];

export const DEFAULT_THEME: ThemeId = "dark";
export const DEFAULT_LOCALE: LocaleId = "en";
export const DEFAULT_FONT_SCALE: FontScaleId = "md";

function emitPrefsChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PREFS_EVENT));
  }
}

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return (
    value === "dark" ||
    value === "light" ||
    value === "mono" ||
    value === "slate" ||
    value === "charcoal" ||
    value === "phosphor"
  );
}

export function isLocaleId(value: string | null | undefined): value is LocaleId {
  return value === "en" || value === "nl";
}

export function isFontScaleId(
  value: string | null | undefined,
): value is FontScaleId {
  return value === "sm" || value === "md" || value === "lg";
}

export function readTheme(): ThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function readLocale(): LocaleId {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocaleId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

export function readFontScale(): FontScaleId {
  if (typeof window === "undefined") return DEFAULT_FONT_SCALE;
  try {
    const raw = localStorage.getItem(FONT_SCALE_STORAGE_KEY);
    if (isFontScaleId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_FONT_SCALE;
}

export function fontScaleValue(id: FontScaleId): string {
  return FONT_SCALE_OPTIONS.find((o) => o.id === id)?.scale ?? "1";
}

/** Apply theme + font scale to <html> (and optional lang). */
export function applyDocumentPrefs(prefs?: {
  theme?: ThemeId;
  locale?: LocaleId;
  fontScale?: FontScaleId;
}) {
  if (typeof document === "undefined") return;
  const theme = prefs?.theme ?? readTheme();
  const locale = prefs?.locale ?? readLocale();
  const fontScale = prefs?.fontScale ?? readFontScale();
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  root.lang = locale;
  root.style.setProperty("--font-scale", fontScaleValue(fontScale));
}

export function writeTheme(theme: ThemeId) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyDocumentPrefs({ theme });
  emitPrefsChange();
}

export function writeLocale(locale: LocaleId) {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  applyDocumentPrefs({ locale });
  emitPrefsChange();
}

export function writeFontScale(fontScale: FontScaleId) {
  try {
    localStorage.setItem(FONT_SCALE_STORAGE_KEY, fontScale);
  } catch {
    /* ignore */
  }
  applyDocumentPrefs({ fontScale });
  emitPrefsChange();
}

export function subscribeUserPrefs(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (
      e.key === THEME_STORAGE_KEY ||
      e.key === LOCALE_STORAGE_KEY ||
      e.key === FONT_SCALE_STORAGE_KEY ||
      e.key === null
    ) {
      onStoreChange();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PREFS_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PREFS_EVENT, onStoreChange);
  };
}

/** Inline boot script — prevents theme FOUC before React hydrates. */
export const PREFS_BOOT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var ok=t==="dark"||t==="light"||t==="mono"||t==="slate"||t==="charcoal"||t==="phosphor";document.documentElement.setAttribute("data-theme",ok?t:${JSON.stringify(DEFAULT_THEME)});var l=localStorage.getItem(${JSON.stringify(LOCALE_STORAGE_KEY)});if(l==="en"||l==="nl")document.documentElement.lang=l;var f=localStorage.getItem(${JSON.stringify(FONT_SCALE_STORAGE_KEY)});var s=f==="sm"?"0.925":f==="lg"?"1.1":"1";document.documentElement.style.setProperty("--font-scale",s);}catch(e){}})();`;
