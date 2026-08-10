/**
 * Local-only display profile (pre-auth). Persist name in localStorage until
 * a real Auth.js session replaces it.
 */

export const LOCAL_DISPLAY_NAME_KEY = "pb:maker-display-name";
export const LOCAL_DISPLAY_NAME_EVENT = "pb:maker-display-name-change";
export const DEFAULT_LOCAL_DISPLAY_NAME = "Creator";

export function subscribeLocalDisplayName(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_DISPLAY_NAME_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_DISPLAY_NAME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_DISPLAY_NAME_EVENT, onStoreChange);
  };
}

export function readLocalDisplayName(): string {
  if (typeof window === "undefined") return DEFAULT_LOCAL_DISPLAY_NAME;
  try {
    const stored = localStorage.getItem(LOCAL_DISPLAY_NAME_KEY)?.trim();
    if (stored) return stored;
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_DISPLAY_NAME;
}

export function writeLocalDisplayName(name: string) {
  try {
    localStorage.setItem(LOCAL_DISPLAY_NAME_KEY, name);
  } catch {
    // ignore
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(LOCAL_DISPLAY_NAME_EVENT));
  }
}

export function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
}
