export type StructureViewMode = "blobs" | "tree";

/**
 * Max direct children Blobs view may show at the current focus parent.
 * Count = `level.slices.length` (siblings under the focused node / root).
 * Above this, Structure forces Tree (+ Details) and disables the Blobs switcher option.
 */
export const BLOB_VIEW_MAX_CHILDREN = 20;

const STRUCTURE_RETURN_KEY_PREFIX = "pb:structure-return:v1:";

export type StructureReturnState = {
  nodeId: string | null;
  view: StructureViewMode;
};

function structureReturnKey(projectId: string) {
  return `${STRUCTURE_RETURN_KEY_PREFIX}${projectId}`;
}

/** Remember Structure view so node profile "Back to Structure" can restore it. */
export function rememberStructureReturn(
  projectId: string,
  nodeId: string | null,
  view: StructureViewMode,
) {
  if (typeof window === "undefined") return;
  try {
    const payload: StructureReturnState = { nodeId, view };
    sessionStorage.setItem(
      structureReturnKey(projectId),
      JSON.stringify(payload),
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readStructureReturn(
  projectId: string,
): StructureReturnState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(structureReturnKey(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StructureReturnState>;
    if (parsed.view !== "tree" && parsed.view !== "blobs") return null;
    return {
      nodeId: typeof parsed.nodeId === "string" ? parsed.nodeId : null,
      view: parsed.view,
    };
  } catch {
    return null;
  }
}

/**
 * Structure nav / default entry href from the last remembered view (+ node).
 * Falls back to project-root Blobs. Blob-cap force-tree still happens in FocusSpaceView.
 */
export function structureEntryHref(projectId: string): string {
  const remembered = readStructureReturn(projectId);
  if (!remembered) return structureFocusHref(projectId, null, "blobs");
  return structureFocusHref(projectId, remembered.nodeId, remembered.view);
}

/** Pure URL helper for Structure Focus Space routes (server-safe). */
export function structureFocusHref(
  projectId: string,
  nodeId: string | null,
  view: StructureViewMode = "blobs",
) {
  const base =
    nodeId == null
      ? `/projects/${projectId}/focus`
      : `/projects/${projectId}/focus/${nodeId}`;
  if (view === "tree") return `${base}?view=tree`;
  return base;
}

/** Node profile link that encodes the Structure view to restore on back. */
export function structureNodeInfoHref(
  projectId: string,
  nodeId: string,
  view: StructureViewMode,
) {
  const params = new URLSearchParams();
  params.set("fromView", view);
  return `/projects/${projectId}/nodes/${nodeId}?${params.toString()}`;
}

/**
 * Prefer tree when Blobs would be forced by the sibling cap.
 * `directChildCount` = children under the Structure focus target.
 */
export function structureViewRespectingBlobCap(
  view: StructureViewMode,
  directChildCount: number,
): StructureViewMode {
  if (view === "blobs" && directChildCount > BLOB_VIEW_MAX_CHILDREN) {
    return "tree";
  }
  return view;
}

export function parseStructureView(
  raw: string | null | undefined,
): StructureViewMode {
  // Legacy `?view=details` redirects into the merged Tree + Details view.
  if (raw === "tree" || raw === "details") return "tree";
  return "blobs";
}
