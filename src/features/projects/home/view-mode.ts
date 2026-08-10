export const PROJECT_VIEW_MODES = [
  "extra-large",
  "large",
  "medium",
  "small",
  "list",
  "details",
  "tiles",
  "content",
] as const;

export type ProjectViewMode = (typeof PROJECT_VIEW_MODES)[number];

export const DEFAULT_PROJECT_VIEW_MODE: ProjectViewMode = "medium";

export const PROJECT_VIEW_STORAGE_KEY = "pb:projects-view-mode";
export const PROJECT_VIEW_CHANGE_EVENT = "pb:projects-view-mode-change";

export const PROJECT_VIEW_LABELS: Record<ProjectViewMode, string> = {
  "extra-large": "Extra large icons",
  large: "Large icons",
  medium: "Medium icons",
  small: "Small icons",
  list: "List",
  details: "Details",
  tiles: "Tiles",
  content: "Content",
};

export function isProjectViewMode(value: unknown): value is ProjectViewMode {
  return (
    typeof value === "string" &&
    (PROJECT_VIEW_MODES as readonly string[]).includes(value)
  );
}

export function readProjectViewMode(): ProjectViewMode {
  if (typeof window === "undefined") return DEFAULT_PROJECT_VIEW_MODE;
  try {
    const raw = localStorage.getItem(PROJECT_VIEW_STORAGE_KEY);
    if (isProjectViewMode(raw)) return raw;
  } catch {
    // ignore
  }
  return DEFAULT_PROJECT_VIEW_MODE;
}

export function saveProjectViewMode(mode: ProjectViewMode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PROJECT_VIEW_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(PROJECT_VIEW_CHANGE_EVENT));
}

export function subscribeProjectViewMode(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === PROJECT_VIEW_STORAGE_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(PROJECT_VIEW_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(PROJECT_VIEW_CHANGE_EVENT, onStoreChange);
  };
}

/** Views that show root structure blob previews. */
export function viewShowsStructurePreview(mode: ProjectViewMode): boolean {
  return mode === "extra-large" || mode === "large" || mode === "tiles";
}

export function previewBlobLimit(mode: ProjectViewMode): number {
  if (mode === "extra-large") return 6;
  if (mode === "large") return 4;
  if (mode === "tiles") return 3;
  return 0;
}
