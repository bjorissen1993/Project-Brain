"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ArrowUp, Info } from "lucide-react";
import { ContextMenu, type ContextMenuItem } from "@/components/ui/context-menu";
import { copyNodeSubtreeAction } from "@/features/chat/actions";
import { isNodeContentEmpty } from "@/features/nodes/node-empty";
import { updateNodeAction } from "@/features/nodes/actions";
import { createRelationAction } from "@/features/relations/actions";
import { AddStructureBlobControl } from "./add-structure-blob-control";
import {
  CombineNotesControl,
  isCombineNoteCandidate,
} from "./combine-notes-control";
import { EmptyNodeNotesModal } from "./empty-node-notes-modal";
import { FocusBlobs } from "./focus-blobs";
import {
  getStructureNodeClipboard,
  setStructureNodeClipboard,
} from "./structure-node-clipboard";
import { StructureBlobPropertiesDialog } from "./structure-blob-properties-dialog";
import { StructureDetailsPanel } from "./structure-details-panel";
import { StructureSuggestButton } from "./structure-suggest-button";
import { StructureTreePanel } from "./structure-tree-panel";
import {
  parseStructureView,
  structureFocusHref,
  type StructureViewMode,
} from "./structure-href";
import { useFocusWorkspace } from "./focus-interaction-context";

/** Show a calm subset when a container is busy; Tree always has full access. */
const BLOB_VISIBLE_LIMIT = 12;

type MenuState =
  | { kind: "blob"; nodeId: string; x: number; y: number }
  | { kind: "canvas"; x: number; y: number }
  | null;

/** Project Structure Focus Space — blobs are structural Nodes, not Design Focuses. */
export function FocusSpaceView({ nodeId }: { nodeId: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: StructureViewMode = parseStructureView(searchParams.get("view"));
  const {
    projectId,
    hoveredId,
    hoverSource,
    setHoveredId,
    structureLevelFor,
    nodes,
    colorFor,
    iconFor,
    setRelationFocusId,
  } = useFocusWorkspace();
  const level = structureLevelFor(nodeId);
  const [propertiesNodeId, setPropertiesNodeId] = useState<string | null>(null);
  const [showAllBlobs, setShowAllBlobs] = useState(false);
  const [blobsNodeId, setBlobsNodeId] = useState(nodeId);
  if (blobsNodeId !== nodeId) {
    setBlobsNodeId(nodeId);
    setShowAllBlobs(false);
  }

  const [menu, setMenu] = useState<MenuState>(null);
  const [createRequestId, setCreateRequestId] = useState(0);
  const [linkToolActive, setLinkToolActive] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkLevelId, setLinkLevelId] = useState(nodeId);
  const [linkFlash, setLinkFlash] = useState<string | null>(null);
  const [dismissedEmptyId, setDismissedEmptyId] = useState<string | null>(null);
  const [combineSelecting, setCombineSelecting] = useState(false);
  const [combineSelected, setCombineSelected] = useState<string[]>([]);
  const [, startTransition] = useTransition();

  // Reset link tool / combine selection when drilling into another level.
  if (linkLevelId !== nodeId) {
    setLinkLevelId(nodeId);
    setLinkToolActive(false);
    setLinkSourceId(null);
    setCombineSelecting(false);
    setCombineSelected([]);
  }

  const currentNode = useMemo(
    () => (nodeId ? nodes.find((n) => n.id === nodeId) ?? null : null),
    [nodes, nodeId],
  );

  const emptyNotesOpen =
    view === "blobs" &&
    nodeId != null &&
    currentNode != null &&
    level.slices.length === 0 &&
    isNodeContentEmpty(currentNode.content) &&
    dismissedEmptyId !== nodeId;

  // Clear soft relation focus when drilling into another level.
  useEffect(() => {
    setRelationFocusId(null);
  }, [nodeId, setRelationFocusId]);

  useEffect(() => {
    if (!linkFlash) return;
    const t = window.setTimeout(() => setLinkFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [linkFlash]);

  const navigateTo = (id: string) => {
    router.push(structureFocusHref(projectId, id, view === "details" ? "blobs" : view));
  };

  const parentHref =
    level.parentId != null
      ? structureFocusHref(projectId, level.parentId, view)
      : nodeId != null
        ? structureFocusHref(projectId, null, view)
        : null;

  const canExtract = nodeId != null;
  const extractToParentId = level.parentId;

  const onReparent = useCallback(
    async (id: string, newParentId: string | null) => {
      const result = await updateNodeAction({
        id,
        parentId: newParentId,
      });
      if (result.ok) {
        router.refresh();
        return { ok: true as const };
      }
      return {
        ok: false as const,
        error: result.error ?? "Could not reparent node",
      };
    },
    [router],
  );

  const treeRows = nodes.map((n) => ({
    id: n.id,
    parentId: n.parentId ?? null,
  }));

  const hiddenBlobCount = Math.max(
    0,
    level.slices.length - BLOB_VISIBLE_LIMIT,
  );
  const visibleSlices = useMemo(() => {
    if (showAllBlobs || level.slices.length <= BLOB_VISIBLE_LIMIT) {
      return level.slices;
    }
    return level.slices.slice(0, BLOB_VISIBLE_LIMIT);
  }, [level.slices, showAllBlobs]);

  const startLinkTool = (sourceId?: string) => {
    setLinkToolActive(true);
    setLinkSourceId(sourceId ?? null);
    setLinkFlash(
      sourceId
        ? "Link tool: click a target blob"
        : "Link tool: click a source blob, then a target",
    );
  };

  const cancelLinkTool = () => {
    setLinkToolActive(false);
    setLinkSourceId(null);
  };

  const onLinkPick = (id: string) => {
    if (!linkToolActive) return;
    if (!linkSourceId) {
      setLinkSourceId(id);
      setLinkFlash("Now click the target blob");
      return;
    }
    if (linkSourceId === id) {
      setLinkFlash("Pick a different blob as the target");
      return;
    }
    const sourceId = linkSourceId;
    startTransition(async () => {
      const result = await createRelationAction({
        projectId,
        sourceNodeId: sourceId,
        targetNodeId: id,
        type: "related",
        label: null,
      });
      cancelLinkTool();
      if (!result.ok) {
        setLinkFlash(result.error);
        return;
      }
      setLinkFlash("Link created");
      router.refresh();
    });
  };

  const pasteClipboard = (targetParentId: string | null = nodeId) => {
    const clip = getStructureNodeClipboard(projectId);
    if (!clip) {
      setLinkFlash("Nothing to paste");
      return;
    }
    startTransition(async () => {
      const result = await copyNodeSubtreeAction({
        projectId,
        sourceNodeId: clip.sourceNodeId,
        names: [`${clip.sourceName} copy`],
        // Preserve notes, image URLs, summaries, and NodeImage associations.
        clearContent: false,
        targetParentId,
      });
      if (!result.ok) {
        setLinkFlash(result.error);
        return;
      }
      setLinkFlash(`Pasted “${result.createdRoots[0]?.name ?? "copy"}”`);
      router.refresh();
    });
  };

  const clip = getStructureNodeClipboard(projectId);

  const blobMenuItems = (targetId: string): ContextMenuItem[] => [
    { id: "open", label: "Open" },
    { id: "details", label: "Info" },
    {
      id: "edit",
      label: "Edit properties",
      separatorBefore: true,
    },
    // Copy works for folders, leaves, notes, and image blobs.
    { id: "copy", label: "Copy" },
    {
      id: "paste",
      label: clip
        ? `Paste under “${nodes.find((n) => n.id === targetId)?.name ?? "node"}”`
        : "Paste",
      disabled: !clip,
    },
    { id: "link", label: "Link tool…", separatorBefore: true },
    { id: "delete", label: "Delete…", danger: true, separatorBefore: true },
  ];

  const canvasMenuItems: ContextMenuItem[] = [
    {
      id: "paste",
      label: clip ? `Paste “${clip.sourceName}”` : "Paste",
      disabled: !clip,
    },
    { id: "create", label: "Create…", separatorBefore: true },
    { id: "link", label: "Link tool…" },
  ];

  const onMenuSelect = (action: string) => {
    if (menu?.kind === "blob") {
      const id = menu.nodeId;
      const node = nodes.find((n) => n.id === id);
      switch (action) {
        case "open":
          navigateTo(id);
          break;
        case "details":
          router.push(`/projects/${projectId}/nodes/${id}`);
          break;
        case "edit":
          setPropertiesNodeId(id);
          break;
        case "copy":
          if (node) {
            setStructureNodeClipboard({
              projectId,
              sourceNodeId: node.id,
              sourceName: node.name,
              copiedAt: Date.now(),
            });
            setLinkFlash(`Copied “${node.name}”`);
          }
          break;
        case "paste":
          pasteClipboard(id);
          break;
        case "link":
          startLinkTool(id);
          break;
        case "delete":
          setPropertiesNodeId(id);
          break;
        default:
          break;
      }
      return;
    }
    if (menu?.kind === "canvas") {
      switch (action) {
        case "paste":
          pasteClipboard(nodeId);
          break;
        case "create":
          setCreateRequestId((n) => n + 1);
          break;
        case "link":
          startLinkTool();
          break;
        default:
          break;
      }
    }
  };

  return (
    <div className="relative flex h-full min-h-[calc(100dvh-8rem)] flex-col">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 40%, color-mix(in srgb, var(--nav) 10%, transparent), transparent 70%), radial-gradient(ellipse 60% 40% at 70% 80%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 65%)",
        }}
      />

      <div className="relative z-[1] flex flex-1 flex-col px-5 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {parentHref ? (
              <Link
                href={parentHref}
                className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-nav/35 bg-nav-muted px-3 py-1.5 text-sm font-medium text-nav shadow-sm transition-colors hover:border-nav/55 hover:bg-nav/15 hover:text-nav-hover"
              >
                <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
                Up one level
              </Link>
            ) : null}
          </div>

          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
            <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {level.name}
            </h1>
            {nodeId ? (
              <Link
                href={`/projects/${projectId}/nodes/${nodeId}`}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-panel text-muted transition-colors hover:border-nav/45 hover:bg-nav-muted hover:text-nav"
                title="Node info"
                aria-label={`Info about ${level.name}`}
              >
                <Info size={16} strokeWidth={2.25} aria-hidden />
              </Link>
            ) : null}
            <StructureSuggestButton nodeId={nodeId} />
            <AddStructureBlobControl
              projectId={projectId}
              parentNodeId={nodeId}
              openRequestId={createRequestId}
              className="shrink-0"
            />
          </div>
        </div>

        <div className="relative mt-4 min-h-0 flex-1">
          {view === "tree" ? (
            <StructureTreePanel focusNodeId={nodeId} view={view} />
          ) : view === "details" ? (
            <StructureDetailsPanel focusNodeId={nodeId} />
          ) : (
            <>
              <FocusBlobs
                key={`${projectId}:structure:${nodeId ?? "root"}`}
                slices={visibleSlices}
                hoveredId={hoveredId}
                hoverSource={hoverSource}
                onHover={(id) => setHoveredId(id, "blob")}
                onSelect={(id) => {
                  if (combineSelecting) {
                    const node = nodes.find((n) => n.id === id);
                    if (
                      node &&
                      isCombineNoteCandidate(node, level.slices)
                    ) {
                      setCombineSelected((prev) =>
                        prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id],
                      );
                      return;
                    }
                    setLinkFlash("Only notes can be combined");
                    return;
                  }
                  navigateTo(id);
                }}
                onBlobContextMenu={(id, x, y) => {
                  setMenu({ kind: "blob", nodeId: id, x, y });
                }}
                onCanvasContextMenu={(x, y) => {
                  setMenu({ kind: "canvas", x, y });
                }}
                projectId={projectId}
                levelFocusId={nodeId}
                canExtract={canExtract}
                extractToParentId={extractToParentId}
                focuses={treeRows}
                onReparent={onReparent}
                colorFor={colorFor}
                iconFor={iconFor}
                relationsEnabled
                linkToolActive={linkToolActive}
                linkSourceId={linkSourceId}
                onLinkPick={onLinkPick}
                onSaveNoteContent={async (id, content) => {
                  const result = await updateNodeAction({
                    id,
                    content: content.trim() || null,
                  });
                  if (!result.ok) {
                    return {
                      ok: false as const,
                      error: result.error ?? "Could not save note",
                    };
                  }
                  router.refresh();
                  return { ok: true as const };
                }}
                onOpenNoteDetails={(id) => {
                  router.push(`/projects/${projectId}/nodes/${id}`);
                }}
              />
              {!showAllBlobs && hiddenBlobCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllBlobs(true)}
                  className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-panel/95 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur transition-colors hover:border-nav/45 hover:bg-nav-muted hover:text-nav lg:bottom-16"
                >
                  +{hiddenBlobCount} more — Show all {level.slices.length}
                </button>
              ) : null}
              {showAllBlobs && hiddenBlobCount > 0 ? (
                <button
                  type="button"
                  onClick={() => setShowAllBlobs(false)}
                  className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 rounded-full border border-border bg-panel/95 px-3 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur transition-colors hover:text-foreground lg:bottom-16"
                >
                  Show fewer
                </button>
              ) : null}
              <CombineNotesControl
                parentNodeId={nodeId}
                className="absolute bottom-16 left-3 z-30 lg:bottom-3"
                selecting={combineSelecting}
                onSelectingChange={setCombineSelecting}
                selected={combineSelected}
                onSelectedChange={setCombineSelected}
              />
              {linkToolActive ? (
                <div className="absolute left-3 top-3 z-30 flex max-w-sm flex-wrap items-center gap-2 rounded-[var(--radius)] border border-nav/40 bg-panel/95 px-3 py-1.5 text-xs text-foreground shadow-sm backdrop-blur">
                  <span>
                    {linkSourceId
                      ? "Link tool — click target blob"
                      : "Link tool — click source blob"}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-nav hover:text-nav-hover"
                    onClick={cancelLinkTool}
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="relative mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4 text-xs text-muted">
          <span>
            {level.slices.length} direct child
            {level.slices.length === 1 ? "" : "ren"}
            {level.totalContainedNodes > 0
              ? ` · ${level.totalContainedNodes} contained nodes`
              : ""}
          </span>
          <Link
            href={`/projects/${projectId}/design-focus`}
            className="font-medium text-nav hover:text-nav-hover"
          >
            Design Focus view
          </Link>
        </div>
      </div>

      {propertiesNodeId ? (
        <StructureBlobPropertiesDialog
          nodeId={propertiesNodeId}
          onClose={() => setPropertiesNodeId(null)}
        />
      ) : null}

      {nodeId && emptyNotesOpen ? (
        <EmptyNodeNotesModal
          nodeId={nodeId}
          nodeName={level.name}
          open={emptyNotesOpen}
          onClose={() => setDismissedEmptyId(nodeId)}
        />
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={
            menu.kind === "blob" ? blobMenuItems(menu.nodeId) : canvasMenuItems
          }
          onSelect={onMenuSelect}
          onClose={() => setMenu(null)}
        />
      ) : null}

      {linkFlash ? (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[90] -translate-x-1/2 rounded-[var(--radius)] border border-border bg-panel px-3 py-1.5 text-xs text-foreground shadow-lg"
        >
          {linkFlash}
        </div>
      ) : null}
    </div>
  );
}
