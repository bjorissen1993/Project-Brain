/**
 * Stable Focus Space blob / tree icons keyed by focus/node id.
 * Defaults come from name/type maps; optional per-project overrides live in localStorage
 * (same persistence pattern as blob colors).
 */

import {
  defaultIconForBlob,
  isIconKey,
  resolveIconKey,
  type IconKey,
} from "@/lib/icons";
import type { NodeType } from "@/types";

const STORAGE_PREFIX = "pb:focus-icons:";

export function loadFocusIconOverrides(
  projectId: string,
): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && isIconKey(v.trim())) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFocusIconOverrides(
  projectId: string,
  overrides: Record<string, string>,
) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + projectId);
    } else {
      localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(overrides));
    }
  } catch {
    // ignore quota / private mode
  }
}

export function resolveFocusIcon(
  focusId: string,
  overrides?: Record<string, string> | null,
  hint?: {
    name?: string | null;
    nodeType?: NodeType | null;
    genreKey?: string | null;
  },
): IconKey | null {
  const custom = resolveIconKey(overrides?.[focusId]);
  if (custom) return custom;
  return defaultIconForBlob(hint ?? {});
}
