import type { NodeType, ProjectType } from "@/types";
import { isIconKey, type IconKey } from "./catalog";
import {
  GENRE_ICONS,
  GUIDANCE_KIND_ICONS,
  NAME_ICONS,
  NODE_TYPE_ICONS,
  PROJECT_TYPE_ICONS,
} from "./defaults";

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/** Exact then substring match against NAME_ICONS. */
export function iconKeyForName(name: string | null | undefined): IconKey | null {
  if (!name?.trim()) return null;
  const n = normalizeName(name);
  const exact = NAME_ICONS[n];
  if (exact) return exact;
  for (const [key, icon] of Object.entries(NAME_ICONS)) {
    if (n.includes(key) || key.includes(n)) return icon;
  }
  return null;
}

export function iconKeyForProjectType(type: ProjectType): IconKey {
  return PROJECT_TYPE_ICONS[type];
}

export function iconKeyForGenre(genreKey: string | null | undefined): IconKey {
  if (!genreKey) return "sparkles";
  return GENRE_ICONS[genreKey] ?? "sparkles";
}

export function iconKeyForNodeType(type: NodeType): IconKey {
  return NODE_TYPE_ICONS[type] ?? "shapes";
}

export function iconKeyForGuidanceKind(
  kind: keyof typeof GUIDANCE_KIND_ICONS,
): IconKey {
  return GUIDANCE_KIND_ICONS[kind];
}

/**
 * Default icon for a Focus Space blob / tree row when no custom override exists.
 * Prefers name mapping (areas / focuses), then node type.
 */
export function defaultIconForBlob(input: {
  name?: string | null;
  nodeType?: NodeType | null;
  genreKey?: string | null;
}): IconKey | null {
  const byName = iconKeyForName(input.name);
  if (byName) return byName;
  if (input.genreKey) return iconKeyForGenre(input.genreKey);
  if (input.nodeType) return iconKeyForNodeType(input.nodeType);
  return null;
}

export function resolveIconKey(
  override: string | null | undefined,
  fallback: IconKey | null = null,
): IconKey | null {
  if (typeof override === "string") {
    const key = override.trim();
    if (isIconKey(key)) return key;
  }
  return fallback;
}
