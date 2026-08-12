"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { ArrowUp, Info } from "lucide-react";
import { ContextMenu } from "@/components/ui/context-menu";
import { StatusSelect } from "@/components/ui/status-select";
import { copyNodeSubtreeAction } from "@/features/chat/actions";
import { isNodeContentEmpty } from "@/features/nodes/node-empty";
import { updateNodeAction } from "@/features/nodes/actions";
import { createRelationAction } from "@/features/relations/actions";
import type { NodeStatus } from "@/types";
import { AddStructureBlobControl } from "./add-structure-blob-control";
import {
  CombineNotesControl,
  isCombineNoteCandidate,
} from "./combine-notes-control";
import { EmptyNodeNotesModal } from "./empty-node-notes-modal";
import { FocusBlobs } from "./focus-blobs";
import {
  structureNodeMenuItems,
  structurePaneMenuItems,
  type StructureContextMenuState,
} from "./structure-context-menu";
import {
  getStructureNodeClipboard,
  setStructureNodeClipboard,
} from "./structure-node-clipboard";
import { StructureBlobPropertiesDialog } from "./structure-blob-properties-dialog";
import { StructureDetailsPanel } from "./structure-details-panel";
import { StructureSuggestButton } from "./structure-suggest-button";
import { StructureTreePanel } from "./structure-tree-panel";
import {
  BLOB_VIEW_MAX_CHILDREN,
  parseStructureView,
  rememberStructureReturn,
  structureFocusHref,
  structureNodeInfoHref,
  type StructureViewMode,
} from "./structure-href";
import { useFocusWorkspace } from "./focus-interaction-context";
import { useT } from "@/features/i18n";

const TREE_WIDTH_STORAGE_KEY = "pb:structure-tree-width";
const TREE_WIDTH_DEFAULT = 352;
const TREE_WIDTH_MIN = 220;
const TREE_WIDTH_MAX = 560;

function readStoredTreeWidth() {
  if (typeof window === "undefined") return TREE_WIDTH_DEFAULT;
  try {
    const raw = localStorage.getItem(TREE_WIDTH_STORAGE_KEY);
    if (!raw) return TREE_WIDTH_DEFAULT;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n)) return TREE_WIDTH_DEFAULT;
    return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, n));
  } catch {
    return TREE_WIDTH_DEFAULT;
  }
}

function clampTreeWidth(width: number) {
  return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_MIN, width));
}

/** Project Structure Focus Space — blobs are structural Nodes, not Design Focuses. */
export function FocusSpaceView({ nodeId }: { nodeId: string | null }) {
  const t = useT();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedView: StructureViewMode = parseStructureView(
    searchParams.get("view"),
  );
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
  // Direct children under the current focus parent — what Blobs would render as siblings.
  const blobChildCount = level.slices.length;
  const blobViewOverLimit = blobChildCount > BLOB_VIEW_MAX_CHILDREN;
  // Never render Blobs when over the limit (avoids a flash / partial canvas).
  const view: StructureViewMode =
    requestedView === "blobs" && blobViewOverLimit ? "tree" : requestedView;
  const [propertiesNodeId, setPropertiesNodeId] = useState<string | null>(null);

  const [menu, setMenu] = useState<StructureContextMenuState>(null);
  const [createRequestId, setCreateRequestId] = useState(0);
  const [linkToolActive, setLinkToolActive] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [linkLevelId, setLinkLevelId] = useState(nodeId);
  const [linkFlash, setLinkFlash] = useState<string | null>(null);
  const [dismissedEmptyId, setDismissedEmptyId] = useState<string | null>(null);
  const [combineSelecting, setCombineSelecting] = useState(false);
  const [combineSelected, setCombineSelected] = useState<string[]>([]);
  const [, startTransition] = useTransition();
  const [treeWidth, setTreeWidth] = useState(TREE_WIDTH_DEFAULT);
  const [resizingTree, setResizingTree] = useState(false);
  const [headerStatus, setHeaderStatus] = useState<NodeStatus>("IDEA");
  const [headerStatusError, setHeaderStatusError] = useState<string | null>(
    null,
  );
  const [pendingHeaderStatus, startHeaderStatusTransition] = useTransition();
  const treeResizeRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

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

  const headerStatusKey = `${currentNode?.id ?? "root"}:${currentNode?.status ?? ""}`;
  const [syncedHeaderStatusKey, setSyncedHeaderStatusKey] =
    useState(headerStatusKey);
  if (syncedHeaderStatusKey !== headerStatusKey) {
    setSyncedHeaderStatusKey(headerStatusKey);
    setHeaderStatus(currentNode?.status ?? "IDEA");
    setHeaderStatusError(null);
  }

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

  // Restore tree pane width after mount (SSR-safe).
  useEffect(() => {
    const t = window.setTimeout(() => {
      setTreeWidth(readStoredTreeWidth());
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  // Remember Structure view for node profile "Back to Structure".
  useEffect(() => {
    rememberStructureReturn(projectId, nodeId, view);
  }, [projectId, nodeId, view]);

  // Persist Tree in the URL when Blobs is over the sibling limit, or migrate legacy Details.
  useEffect(() => {
    const raw = searchParams.get("view");
    if (raw === "details") {
      router.replace(structureFocusHref(projectId, nodeId, "tree"));
      return;
    }
    if (requestedView !== "blobs" || !blobViewOverLimit) return;
    router.replace(structureFocusHref(projectId, nodeId, "tree"));
  }, [
    searchParams,
    requestedView,
    blobViewOverLimit,
    projectId,
    nodeId,
    router,
  ]);

  useEffect(() => {
    if (!linkFlash) return;
    const t = window.setTimeout(() => setLinkFlash(null), 2400);
    return () => window.clearTimeout(t);
  }, [linkFlash]);

  useEffect(() => {
    if (!resizingTree) return;
    const onMove = (ev: PointerEvent) => {
      const start = treeResizeRef.current;
      if (!start) return;
      setTreeWidth(clampTreeWidth(start.startWidth + (ev.clientX - start.startX)));
    };
    const onUp = () => {
      setResizingTree(false);
      treeResizeRef.current = null;
      setTreeWidth((w) => {
        const next = clampTreeWidth(w);
        try {
          localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(next));
        } catch {
          // ignore
        }
        return next;
      });
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [resizingTree]);

  const onTreeResizePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    treeResizeRef.current = { startX: e.clientX, startWidth: treeWidth };
    setResizingTree(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const persistTreeWidth = (next: number) => {
    const clamped = clampTreeWidth(next);
    try {
      localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
    return clamped;
  };

  const onTreeResizeKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setTreeWidth((w) => persistTreeWidth(w - 16));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setTreeWidth((w) => persistTreeWidth(w + 16));
    }
  };

  const onHeaderStatusChange = (next: NodeStatus) => {
    if (!currentNode) return;
    setHeaderStatus(next);
    setHeaderStatusError(null);
    startHeaderStatusTransition(async () => {
      const result = await updateNodeAction({
        id: currentNode.id,
        status: next,
      });
      if (!result.ok) {
        setHeaderStatus(currentNode.status);
        setHeaderStatusError(result.error ?? "Could not update status");
        return;
      }
      router.refresh();
    });
  };

  const navigateTo = (id: string) => {
    router.push(structureFocusHref(projectId, id, view));
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

  const startLinkTool = (sourceId?: string) => {
    setLinkToolActive(true);
    setLinkSourceId(sourceId ?? null);
    setLinkFlash(
      sourceId
        ? t("structure.linkFlashTarget")
        : t("structure.linkFlashSource"),
    );
  };

  const cancelLinkTool = () => {
    setLinkToolActive(false);
    setLinkSourceId(null);
  };

  useEffect(() => {
    if (!linkToolActive) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      cancelLinkTool();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [linkToolActive]);

  const onLinkPick = (id: string) => {
    if (!linkToolActive) return;
    if (!linkSourceId) {
      setLinkSourceId(id);
      setLinkFlash(t("structure.linkFlashNowTarget"));
      return;
    }
    if (linkSourceId === id) {
      setLinkFlash(t("structure.linkFlashDifferent"));
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
      setLinkFlash(t("structure.linkCreated"));
      router.refresh();
    });
  };

  const pasteClipboard = (targetParentId: string | null = nodeId) => {
    const clip = getStructureNodeClipboard(projectId);
    if (!clip) {
      setLinkFlash(t("structure.nothingToPaste"));
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

  const openNodeMenu = (id: string, x: number, y: number) => {
    setMenu({ kind: "node", nodeId: id, x, y });
  };
  const openPaneMenu = (x: number, y: number) => {
    setMenu({ kind: "pane", x, y });
  };

  const onMenuSelect = (action: string) => {
    if (menu?.kind === "node") {
      const id = menu.nodeId;
      const node = nodes.find((n) => n.id === id);
      switch (action) {
        case "open":
          navigateTo(id);
          break;
        case "details":
          router.push(structureNodeInfoHref(projectId, id, view));
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
    if (menu?.kind === "pane") {
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
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 40%, color-mix(in srgb, var(--nav) 10%, transparent), transparent 70%), radial-gradient(ellipse 60% 40% at 70% 80%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 65%)",
        }}
      />

      <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden px-4 pt-5 sm:px-8 sm:pt-5">
        {/* Level chrome stays visible; only tree / details (and blobs canvas) scroll below. */}
        <div className="shrink-0 space-y-4 bg-background/90 pb-2 backdrop-blur-sm sm:space-y-4 sm:pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              {parentHref ? (
                <Link
                  href={parentHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius)] border border-nav/30 bg-nav-muted/80 px-3 py-2 text-sm font-medium text-nav transition-colors hover:border-nav/55 hover:bg-nav/15 hover:text-nav-hover sm:min-h-0 sm:py-1.5"
                >
                  <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
                  {t("focusSpace.upOneLevel")}
                </Link>
              ) : null}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:items-end sm:gap-1">
              <h1 className="min-w-0 truncate font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {level.name}
              </h1>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                {currentNode ? (
                  <StatusSelect
                    value={headerStatus}
                    onChange={onHeaderStatusChange}
                    disabled={pendingHeaderStatus}
                    size="compact"
                    aria-label={`Status for ${currentNode.name}`}
                  />
                ) : null}
                {nodeId ? (
                  <Link
                    href={structureNodeInfoHref(projectId, nodeId, view)}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/80 bg-panel text-muted transition-colors hover:border-nav/45 hover:bg-nav-muted hover:text-nav sm:h-9 sm:w-9"
                    title={t("structure.nodeInfo")}
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
              {headerStatusError ? (
                <p className="text-xs text-danger">{headerStatusError}</p>
              ) : null}
            </div>
          </div>

          {blobViewOverLimit ? (
            <div
              role="status"
              className="rounded-[var(--radius)] border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground"
            >
              {t("structure.blobsDisabled", {
                count: blobChildCount,
                max: BLOB_VIEW_MAX_CHILDREN,
              })}
            </div>
          ) : null}
        </div>

        <div className="relative mt-5 min-h-0 flex-1 overflow-hidden sm:mt-4">
          {view === "tree" ? (
            <div
              className={`relative flex h-full min-h-0 flex-col gap-4 lg:flex-row lg:gap-0 lg:overflow-hidden lg:rounded-[var(--radius)] lg:border lg:border-border/80 ${
                resizingTree ? "lg:select-none" : ""
              }`}
            >
              {linkToolActive ? (
                <div className="absolute left-2 top-2 z-30 flex max-w-sm flex-wrap items-center gap-2 rounded-[var(--radius)] border border-nav/40 bg-panel/95 px-3 py-1.5 text-xs text-foreground shadow-sm backdrop-blur">
                  <span>
                    {linkSourceId
                      ? t("structure.linkToolTarget")
                      : t("structure.linkToolSource")}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-nav hover:text-nav-hover"
                    onClick={cancelLinkTool}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : null}
              <aside
                className="relative min-h-0 w-full shrink-0 overflow-hidden rounded-[var(--radius)] border border-border/80 bg-panel/40 max-lg:h-[min(38dvh,16rem)] max-lg:min-h-[11rem] lg:h-full lg:w-[min(var(--structure-tree-width),45%)] lg:min-w-[220px] lg:max-w-[560px] lg:rounded-none lg:border-0 lg:border-r lg:border-border/80"
                style={
                  {
                    "--structure-tree-width": `${treeWidth}px`,
                  } as CSSProperties
                }
              >
                <StructureTreePanel
                  focusNodeId={nodeId}
                  view={view}
                  onNodeContextMenu={openNodeMenu}
                  onPaneContextMenu={openPaneMenu}
                  linkToolActive={linkToolActive}
                  linkSourceId={linkSourceId}
                  onLinkPick={onLinkPick}
                />
              </aside>
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label={t("structure.resizeTree")}
                aria-valuemin={TREE_WIDTH_MIN}
                aria-valuemax={TREE_WIDTH_MAX}
                aria-valuenow={treeWidth}
                tabIndex={0}
                onPointerDown={onTreeResizePointerDown}
                onKeyDown={onTreeResizeKeyDown}
                className="relative z-10 hidden w-1.5 shrink-0 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-nav/25 focus-visible:bg-nav/30 focus-visible:outline-none lg:block"
              >
                <span
                  className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/80"
                  aria-hidden
                />
              </div>
              <section className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-[var(--radius)] border border-border/80 bg-panel/30 max-lg:min-h-[14rem] lg:rounded-none lg:border-0">
                <StructureDetailsPanel
                  focusNodeId={nodeId}
                  onNodeContextMenu={openNodeMenu}
                  onPaneContextMenu={openPaneMenu}
                  linkToolActive={linkToolActive}
                  linkSourceId={linkSourceId}
                  onLinkPick={onLinkPick}
                />
              </section>
            </div>
          ) : (
            <div className="relative h-full min-h-0 overflow-hidden">
              <FocusBlobs
                key={`${projectId}:structure:${nodeId ?? "root"}`}
                slices={level.slices}
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
                    setLinkFlash(t("structure.onlyNotesCombine"));
                    return;
                  }
                  navigateTo(id);
                }}
                onBlobContextMenu={openNodeMenu}
                onCanvasContextMenu={openPaneMenu}
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
                  router.push(structureNodeInfoHref(projectId, id, view));
                }}
              />
              <CombineNotesControl
                parentNodeId={nodeId}
                className="absolute bottom-20 left-3 z-30 sm:bottom-16 lg:bottom-3"
                selecting={combineSelecting}
                onSelectingChange={setCombineSelecting}
                selected={combineSelected}
                onSelectedChange={setCombineSelected}
              />
              {linkToolActive ? (
                <div className="absolute left-3 top-3 z-30 flex max-w-sm flex-wrap items-center gap-2 rounded-[var(--radius)] border border-nav/40 bg-panel/95 px-3 py-1.5 text-xs text-foreground shadow-sm backdrop-blur">
                  <span>
                    {linkSourceId
                      ? t("structure.linkToolTargetBlob")
                      : t("structure.linkToolSourceBlob")}
                  </span>
                  <button
                    type="button"
                    className="font-medium text-nav hover:text-nav-hover"
                    onClick={cancelLinkTool}
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="safe-pb relative mt-3 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border/60 py-3.5 text-xs text-muted/90 sm:mt-2 sm:gap-2 sm:py-4 sm:text-muted">
          <span className="leading-relaxed">
            {t("focusSpace.directChild", { count: level.slices.length })}
            {level.totalContainedNodes > 0
              ? ` ${t("focusSpace.containedNodes", { count: level.totalContainedNodes })}`
              : ""}
          </span>
          <Link
            href={`/projects/${projectId}/design-focus`}
            className="inline-flex min-h-11 items-center font-medium text-nav hover:text-nav-hover sm:min-h-0"
          >
            {t("focusSpace.designFocusView")}
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
            menu.kind === "node"
              ? structureNodeMenuItems({
                  targetName: nodes.find((n) => n.id === menu.nodeId)?.name,
                  clipboard: clip,
                })
              : structurePaneMenuItems({ clipboard: clip })
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
