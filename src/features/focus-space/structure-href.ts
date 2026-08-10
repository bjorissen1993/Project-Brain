export type StructureViewMode = "blobs" | "tree" | "details";

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
  if (view === "details") return `${base}?view=details`;
  return base;
}

export function parseStructureView(
  raw: string | null | undefined,
): StructureViewMode {
  if (raw === "tree") return "tree";
  if (raw === "details") return "details";
  return "blobs";
}
