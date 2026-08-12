import type { ContextMenuItem } from "@/components/ui/context-menu";
import type { StructureNodeClipboard } from "./structure-node-clipboard";

export type StructureContextMenuState =
  | { kind: "node"; nodeId: string; x: number; y: number }
  | { kind: "pane"; x: number; y: number }
  | null;

/** Shared right-click actions for Structure nodes (tree / blobs / details). */
export function structureNodeMenuItems({
  targetName,
  clipboard,
}: {
  targetName?: string | null;
  clipboard: StructureNodeClipboard | null;
}): ContextMenuItem[] {
  return [
    { id: "open", label: "Open" },
    { id: "details", label: "Info" },
    {
      id: "edit",
      label: "Edit properties",
      separatorBefore: true,
    },
    { id: "copy", label: "Copy" },
    {
      id: "paste",
      label: clipboard
        ? `Paste under “${targetName?.trim() || "node"}”`
        : "Paste",
      disabled: !clipboard,
    },
    { id: "link", label: "Link tool…", separatorBefore: true },
    { id: "delete", label: "Delete…", danger: true, separatorBefore: true },
  ];
}

/** Shared right-click actions for empty Structure panes / canvas. */
export function structurePaneMenuItems({
  clipboard,
}: {
  clipboard: StructureNodeClipboard | null;
}): ContextMenuItem[] {
  return [
    {
      id: "paste",
      label: clipboard ? `Paste “${clipboard.sourceName}”` : "Paste",
      disabled: !clipboard,
    },
    { id: "create", label: "Create…", separatorBefore: true },
    { id: "link", label: "Link tool…" },
  ];
}

/** Design Focus blob menu — Open / Info / Edit (no structure clipboard). */
export function designFocusBlobMenuItems(): ContextMenuItem[] {
  return [
    { id: "open", label: "Open" },
    { id: "edit", label: "Edit properties", separatorBefore: true },
  ];
}

/** Board card menu — navigate / open node profile. */
export function boardNodeMenuItems(): ContextMenuItem[] {
  return [
    { id: "open", label: "Open" },
    { id: "info", label: "Info" },
  ];
}
