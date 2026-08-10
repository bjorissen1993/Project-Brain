/**
 * Shared cards | list display preference for Design Focus progress and Balance.
 */

export const ITEMS_VIEW_MODES = ["list", "cards"] as const;

export type ItemsViewMode = (typeof ITEMS_VIEW_MODES)[number];

export const DEFAULT_ITEMS_VIEW_MODE: ItemsViewMode = "list";

export const ITEMS_VIEW_STORAGE_KEY = "pb:items-view-mode";
export const ITEMS_VIEW_CHANGE_EVENT = "pb:items-view-mode-change";

export function isItemsViewMode(value: unknown): value is ItemsViewMode {
  return (
    typeof value === "string" &&
    (ITEMS_VIEW_MODES as readonly string[]).includes(value)
  );
}

export function readItemsViewMode(): ItemsViewMode {
  if (typeof window === "undefined") return DEFAULT_ITEMS_VIEW_MODE;
  try {
    const raw = localStorage.getItem(ITEMS_VIEW_STORAGE_KEY);
    if (isItemsViewMode(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_ITEMS_VIEW_MODE;
}

export function saveItemsViewMode(mode: ItemsViewMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ITEMS_VIEW_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(ITEMS_VIEW_CHANGE_EVENT));
}

export function subscribeItemsViewMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === ITEMS_VIEW_STORAGE_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(ITEMS_VIEW_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(ITEMS_VIEW_CHANGE_EVENT, onStoreChange);
  };
}
