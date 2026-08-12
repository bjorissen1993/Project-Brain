"use client";

import { useMemo } from "react";
import { NodeTree } from "@/features/nodes/node-tree";
import { buildNodeTree } from "@/features/projects/tree";
import { useFocusWorkspace } from "./focus-interaction-context";
import type { StructureViewMode } from "./structure-href";

/** Full Project Structure tree inside the Structure workspace (left pane of Tree view). */
export function StructureTreePanel({
  focusNodeId,
  view,
  onNodeContextMenu,
  onPaneContextMenu,
  linkToolActive,
  linkSourceId,
  onLinkPick,
}: {
  focusNodeId: string | null;
  view: StructureViewMode;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  onPaneContextMenu?: (x: number, y: number) => void;
  linkToolActive?: boolean;
  linkSourceId?: string | null;
  onLinkPick?: (id: string) => void;
}) {
  const { projectId, nodes, colorFor, iconFor } = useFocusWorkspace();
  const tree = useMemo(
    () =>
      buildNodeTree(
        nodes.map((n) => ({
          id: n.id,
          projectId: n.projectId,
          parentId: n.parentId ?? null,
          name: n.name,
          type: n.type,
          customTypeLabel: n.customTypeLabel ?? null,
          status: n.status,
          content: n.content ?? null,
          designFocusId: n.designFocusId ?? null,
          sortOrder: n.sortOrder,
        })),
      ),
    [nodes],
  );

  return (
    <div className="relative flex h-full min-h-[18rem] flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 45%, color-mix(in srgb, var(--panel-elevated) 80%, transparent), transparent 72%)",
        }}
      />
      <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-1 py-1 sm:px-2">
        {tree.length === 0 ? (
          <div
            className="flex h-full min-h-[12rem] items-center justify-center"
            onContextMenu={(e) => {
              if (!onPaneContextMenu) return;
              e.preventDefault();
              onPaneContextMenu(e.clientX, e.clientY);
            }}
          >
            <p className="px-3 py-12 text-center text-sm text-muted">
              No content nodes yet. Right-click to create, or use + in Blobs
              view.
            </p>
          </div>
        ) : (
          <NodeTree
            projectId={projectId}
            nodes={tree}
            selectedId={focusNodeId ?? undefined}
            embedded
            linkMode="structure"
            structureView={view === "blobs" ? "tree" : view}
            expandToSelected
            colorFor={colorFor}
            iconFor={iconFor}
            onNodeContextMenu={onNodeContextMenu}
            onPaneContextMenu={onPaneContextMenu}
            linkToolActive={linkToolActive}
            linkSourceId={linkSourceId}
            onLinkPick={onLinkPick}
          />
        )}
      </div>
    </div>
  );
}
