"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type DragEvent,
  type MouseEvent,
  type SetStateAction,
} from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { STATUS_DOT } from "@/components/ui/status-select";
import { moveNodeInTreeAction } from "@/features/nodes/actions";
import { isImageNode, isNoteLikeNode } from "@/features/nodes/image-node";
import { structureFocusHref } from "@/features/focus-space/structure-href";
import {
  PbIcon,
  iconKeyForNodeType,
  type IconKey,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { NODE_STATUS_OPTIONS, NODE_TYPE_OPTIONS, type ProjectNode } from "@/types";

const STATUS_HOVER_DELAY_MS = 500;
const TREE_EXPAND_ON_DRAG_MS = 550;
const TREE_DRAG_MIME = "application/x-structure-tree-node-id";

type DropPosition = "before" | "after" | "into";

type DropTarget = {
  /** null = project root (pane empty area). */
  nodeId: string | null;
  position: DropPosition;
};

type TreeDragContextValue = {
  enabled: boolean;
  draggingId: string | null;
  dropTarget: DropTarget | null;
  dropAllowed: boolean;
  consumeSuppressClick: () => boolean;
  onDragStart: (nodeId: string, event: DragEvent) => void;
  onDragEnd: () => void;
  onRowDragOver: (nodeId: string, event: DragEvent) => void;
  onRowDrop: (nodeId: string, event: DragEvent) => void;
  onPaneDragOver: (event: DragEvent) => void;
  onPaneDrop: (event: DragEvent) => void;
  onPaneDragLeave: (event: DragEvent) => void;
};

const TreeDragContext = createContext<TreeDragContextValue | null>(null);

function useTreeDrag() {
  return useContext(TreeDragContext);
}

function typeLabel(type: ProjectNode["type"], custom?: string | null) {
  if (type === "CUSTOM" && custom) return custom;
  return NODE_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

function statusLabel(status: ProjectNode["status"]) {
  return NODE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

/** Visual kind for tree rows — icons/labels aligned with Structure / blobs. */
function treeElementKind(node: ProjectNode): {
  kind: "folder" | "note" | "image" | "node";
  label: string;
  icon: IconKey;
} {
  const hasChildren = (node.children?.length ?? 0) > 0;
  if (isImageNode(node)) {
    return { kind: "image", label: "Image", icon: "image" };
  }
  if (
    isNoteLikeNode({
      type: node.type,
      customTypeLabel: node.customTypeLabel,
      content: node.content,
      hasChildren,
    })
  ) {
    // Created “notes” are IDEA; keep Story Beat / Task labels when those types.
    const label =
      node.type === "IDEA" ? "Note" : typeLabel(node.type, node.customTypeLabel);
    return { kind: "note", label, icon: "sticky-note" };
  }
  if (node.type === "FOLDER" || hasChildren) {
    return {
      kind: "folder",
      label: typeLabel(node.type, node.customTypeLabel),
      icon: iconKeyForNodeType(node.type === "FOLDER" ? "FOLDER" : node.type),
    };
  }
  return {
    kind: "node",
    label: typeLabel(node.type, node.customTypeLabel),
    icon: iconKeyForNodeType(node.type),
  };
}

function expandStorageKey(projectId: string) {
  return `pb:structure-tree-expanded:v1:${projectId}`;
}

function loadExpandedIds(projectId: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(expandStorageKey(projectId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function saveExpandedIds(projectId: string, ids: Set<string>) {
  try {
    sessionStorage.setItem(
      expandStorageKey(projectId),
      JSON.stringify([...ids]),
    );
  } catch {
    // ignore quota / private mode
  }
}

function isExpandableTreeFolder(node: ProjectNode): boolean {
  return (node.children?.length ?? 0) > 0;
}

function buildTreeIndex(nodes: ProjectNode[]) {
  const parentById = new Map<string, string | null>();
  const nodeById = new Map<string, ProjectNode>();
  const childrenByParent = new Map<string | null, ProjectNode[]>();

  const walk = (list: ProjectNode[], parentId: string | null) => {
    childrenByParent.set(parentId, list);
    for (const n of list) {
      const pid = n.parentId ?? parentId;
      parentById.set(n.id, pid);
      nodeById.set(n.id, n);
      if (n.children?.length) walk(n.children, n.id);
      else childrenByParent.set(n.id, n.children ?? []);
    }
  };
  walk(nodes, null);
  return { parentById, nodeById, childrenByParent };
}

function collectAncestorIdsFromIndex(
  parentById: Map<string, string | null>,
  selectedId: string | undefined,
): Set<string> {
  if (!selectedId) return new Set();
  const ancestors = new Set<string>();
  let current: string | null | undefined = selectedId;
  while (current) {
    const parentId: string | null = parentById.get(current) ?? null;
    if (!parentId) break;
    ancestors.add(parentId);
    current = parentId;
  }
  return ancestors;
}

/** True when `maybeDescendantId` is the node or under it in the tree. */
function isSelfOrDescendant(
  childrenByParent: Map<string | null, ProjectNode[]>,
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  if (ancestorId === maybeDescendantId) return true;
  const stack = [...(childrenByParent.get(ancestorId) ?? []).map((n) => n.id)];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === maybeDescendantId) return true;
    for (const child of childrenByParent.get(current) ?? []) {
      stack.push(child.id);
    }
  }
  return false;
}

function dropPositionFromEvent(
  event: DragEvent,
  element: HTMLElement,
): DropPosition {
  const rect = element.getBoundingClientRect();
  const ratio =
    rect.height <= 0 ? 0.5 : (event.clientY - rect.top) / rect.height;
  if (ratio < 0.28) return "before";
  if (ratio > 0.72) return "after";
  return "into";
}

function isTreeDragEvent(event: DragEvent, draggingId: string | null) {
  const types = Array.from(event.dataTransfer.types);
  return (
    draggingId != null ||
    types.includes(TREE_DRAG_MIME) ||
    types.includes("text/plain")
  );
}

function resolveDropParentAndIndex(
  target: DropTarget,
  draggingId: string,
  parentById: Map<string, string | null>,
  childrenByParent: Map<string | null, ProjectNode[]>,
): { parentId: string | null; index: number } | null {
  if (target.nodeId == null) {
    // Root append.
    const roots = (childrenByParent.get(null) ?? []).filter(
      (n) => n.id !== draggingId,
    );
    return { parentId: null, index: roots.length };
  }

  if (target.position === "into") {
    const children = (childrenByParent.get(target.nodeId) ?? []).filter(
      (n) => n.id !== draggingId,
    );
    return { parentId: target.nodeId, index: children.length };
  }

  const parentId = parentById.get(target.nodeId) ?? null;
  const siblings = (childrenByParent.get(parentId) ?? []).filter(
    (n) => n.id !== draggingId,
  );
  const targetIndex = siblings.findIndex((n) => n.id === target.nodeId);
  if (targetIndex < 0) return null;
  const index =
    target.position === "before" ? targetIndex : targetIndex + 1;
  return { parentId, index };
}

function isDropAllowed(
  target: DropTarget,
  draggingId: string,
  parentById: Map<string, string | null>,
  childrenByParent: Map<string | null, ProjectNode[]>,
): boolean {
  if (target.nodeId == null) {
    // Root is always a valid parent (not self/descendant).
    return true;
  }

  if (target.position === "into") {
    return !isSelfOrDescendant(childrenByParent, draggingId, target.nodeId);
  }

  // before/after → new parent is the target's parent
  if (target.nodeId === draggingId) return false;
  const parentId = parentById.get(target.nodeId) ?? null;
  if (parentId == null) return true;
  return !isSelfOrDescendant(childrenByParent, draggingId, parentId);
}

/** Ancestors + focused folder (notes/images stay leaf; only path opens). */
function collectFocusOpenIds(
  nodes: ProjectNode[],
  selectedId: string | undefined,
): Set<string> {
  const { parentById, nodeById } = buildTreeIndex(nodes);
  const openIds = collectAncestorIdsFromIndex(parentById, selectedId);
  if (!selectedId) return openIds;
  const selected = nodeById.get(selectedId);
  if (selected && isExpandableTreeFolder(selected)) {
    openIds.add(selectedId);
  }
  return openIds;
}

/**
 * Same-level focus accordion: expand the focused folder + ancestors;
 * collapse sibling folders under the same parent; leave other branches alone
 * unless the previous focus folder is no longer on the path (focus moved up/away).
 */
function applyFocusExpandSync(
  nodes: ProjectNode[],
  selectedId: string,
  previousId: string | undefined,
  setExpandedIds: Dispatch<SetStateAction<Set<string>>>,
  setCollapsedAway: Dispatch<SetStateAction<Set<string>>>,
) {
  const { parentById, nodeById, childrenByParent } = buildTreeIndex(nodes);
  const mustOpen = collectAncestorIdsFromIndex(parentById, selectedId);
  const selected = nodeById.get(selectedId);
  if (selected && isExpandableTreeFolder(selected)) {
    mustOpen.add(selectedId);
  }

  const collapseIds = new Set<string>();

  // Accordion among folder siblings when the focused node is a folder.
  if (selected && isExpandableTreeFolder(selected)) {
    const parentId = parentById.get(selectedId) ?? null;
    const siblings = childrenByParent.get(parentId) ?? [];
    for (const sib of siblings) {
      if (sib.id === selectedId) continue;
      if (!isExpandableTreeFolder(sib)) continue;
      collapseIds.add(sib.id);
    }
  }

  // Focus moved up or to another branch: close the old folder focus if it
  // is no longer needed to keep the new focus visible.
  if (
    previousId &&
    previousId !== selectedId &&
    !mustOpen.has(previousId)
  ) {
    const previous = nodeById.get(previousId);
    if (previous && isExpandableTreeFolder(previous)) {
      collapseIds.add(previousId);
    }
  }

  // Never collapse anything required for the focused path.
  for (const id of mustOpen) collapseIds.delete(id);

  setCollapsedAway((prev) => {
    let next = prev;
    let changed = false;
    for (const id of mustOpen) {
      if (!next.has(id)) continue;
      if (!changed) {
        next = new Set(prev);
        changed = true;
      }
      next.delete(id);
    }
    for (const id of collapseIds) {
      if (next.has(id)) continue;
      if (!changed) {
        next = new Set(prev);
        changed = true;
      }
      next.add(id);
    }
    return changed ? next : prev;
  });

  setExpandedIds((prev) => {
    let next = prev;
    let changed = false;
    for (const id of mustOpen) {
      if (next.has(id)) continue;
      if (!changed) {
        next = new Set(prev);
        changed = true;
      }
      next.add(id);
    }
    for (const id of collapseIds) {
      if (!next.has(id)) continue;
      if (!changed) {
        next = new Set(prev);
        changed = true;
      }
      next.delete(id);
    }
    return changed ? next : prev;
  });
}

function StatusDotWithHover({
  status,
  name,
}: {
  status: ProjectNode["status"];
  name: string;
}) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <span
      className="relative inline-flex shrink-0 items-center"
      onMouseEnter={() => {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          setOpen(true);
          timerRef.current = null;
        }, STATUS_HOVER_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearTimer();
        setOpen(false);
      }}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full ring-1 ring-border/50",
          STATUS_DOT[status],
        )}
        aria-label={`Status: ${statusLabel(status)}`}
        title={undefined}
      />
      {open ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-40 mt-1.5 w-max max-w-[14rem] rounded-[var(--radius)] border border-border bg-panel-elevated px-2.5 py-1.5 text-[11px] leading-snug text-foreground shadow-lg"
        >
          <span className="font-semibold">{statusLabel(status)}</span>
          <span className="mt-0.5 block truncate text-muted">{name}</span>
        </span>
      ) : null}
    </span>
  );
}

function TreeItem({
  node,
  projectId,
  selectedId,
  depth,
  linkMode,
  structureView,
  isOpen,
  onToggle,
  colorFor,
  iconFor,
  onNodeContextMenu,
  linkToolActive,
  linkSourceId,
  onLinkPick,
}: {
  node: ProjectNode;
  projectId: string;
  selectedId?: string;
  depth: number;
  linkMode: "detail" | "structure";
  structureView: "blobs" | "tree";
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  colorFor?: (id: string) => string;
  iconFor?: (id: string) => IconKey | null;
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  linkToolActive?: boolean;
  linkSourceId?: string | null;
  onLinkPick?: (id: string) => void;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const selected = selectedId === node.id;
  const open = hasChildren && isOpen(node.id);
  const color = colorFor?.(node.id);
  const customIcon = iconFor?.(node.id);
  const kind = treeElementKind(node);
  const drag = useTreeDrag();

  const href =
    linkMode === "structure"
      ? structureFocusHref(projectId, node.id, structureView)
      : `/projects/${projectId}/nodes/${node.id}`;

  const rowPad = depth * 12 + 4;

  const onChevronClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasChildren) onToggle(node.id);
  };

  const onRowContextMenu = (e: MouseEvent) => {
    if (!onNodeContextMenu) return;
    e.preventDefault();
    e.stopPropagation();
    onNodeContextMenu(node.id, e.clientX, e.clientY);
  };

  const isDragging = drag?.draggingId === node.id;
  const isDropRow =
    drag?.dropTarget?.nodeId === node.id && drag.draggingId != null;
  const dropPos = isDropRow ? drag!.dropTarget!.position : null;
  const dropOk = Boolean(isDropRow && drag?.dropAllowed);
  const dropBad = Boolean(isDropRow && !drag?.dropAllowed);

  return (
    <div>
      <div
        data-tree-row
        draggable={Boolean(drag?.enabled)}
        onDragStart={(event) => {
          if (!drag?.enabled) return;
          // Don't start a row drag from the expand control.
          if ((event.target as HTMLElement).closest("button")) {
            event.preventDefault();
            return;
          }
          drag.onDragStart(node.id, event);
        }}
        onDragEnd={() => drag?.onDragEnd()}
        onDragOver={(event) => drag?.onRowDragOver(node.id, event)}
        onDrop={(event) => drag?.onRowDrop(node.id, event)}
        className={cn(
          "group relative flex items-center gap-1 rounded-[var(--radius)] px-1.5 py-1.5 text-sm transition-colors",
          linkToolActive ? "cursor-crosshair" : "cursor-pointer",
          selected ? "bg-nav-muted text-foreground" : "hover:bg-muted-bg",
          isDragging && "opacity-45",
          dropOk && dropPos === "into" && "bg-accent-muted ring-1 ring-accent/50",
          dropBad && "bg-danger/10 ring-1 ring-danger/40",
          linkToolActive &&
            linkSourceId === node.id &&
            "ring-2 ring-nav/70 ring-offset-1 ring-offset-transparent",
        )}
        style={{ paddingLeft: `${rowPad}px` }}
        onContextMenu={onRowContextMenu}
      >
        {dropOk && dropPos === "before" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-accent"
          />
        ) : null}
        {dropOk && dropPos === "after" ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-1 bottom-0 z-10 h-0.5 translate-y-1/2 rounded-full bg-accent"
          />
        ) : null}
        <button
          type="button"
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center text-muted",
            hasChildren ? "cursor-pointer" : "cursor-default",
          )}
          onClick={onChevronClick}
          aria-label={
            hasChildren ? (open ? "Collapse" : "Expand") : undefined
          }
          aria-expanded={hasChildren ? open : undefined}
          tabIndex={hasChildren ? undefined : -1}
        >
          {hasChildren ? (
            open ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="h-1 w-1 rounded-full bg-border-strong" />
          )}
        </button>
        <Link
          href={href}
          draggable={false}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1",
            linkToolActive ? "cursor-crosshair" : "cursor-pointer",
          )}
          title={
            linkToolActive
              ? linkSourceId
                ? "Click to link to this node"
                : "Click to choose link source"
              : undefined
          }
          aria-label={
            linkToolActive
              ? `${node.name}. Click to ${linkSourceId ? "set as link target" : "set as link source"}.`
              : undefined
          }
          onClick={(e) => {
            if (drag?.consumeSuppressClick()) {
              e.preventDefault();
              return;
            }
            if (linkToolActive && onLinkPick) {
              e.preventDefault();
              onLinkPick(node.id);
            }
          }}
          onContextMenu={onRowContextMenu}
        >
          {color ? (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
              style={{ backgroundColor: color }}
              aria-hidden
            />
          ) : null}
          {customIcon ? (
            <PbIcon
              icon={customIcon}
              size={16}
              className="shrink-0 text-muted"
              style={
                color
                  ? {
                      color: `color-mix(in srgb, ${color} 50%, var(--muted))`,
                    }
                  : undefined
              }
            />
          ) : (
            <PbIcon
              icon={kind.icon}
              size={14}
              className="shrink-0 text-muted"
              label={kind.label}
            />
          )}
          <span
            className="min-w-0 flex-1 truncate font-medium"
            style={
              color
                ? {
                    color: `color-mix(in srgb, ${color} 55%, var(--foreground))`,
                  }
                : undefined
            }
          >
            {node.name}
          </span>
          <span
            className="inline-flex max-w-[7.5rem] shrink-0 select-none items-center gap-1 truncate rounded border border-border/60 bg-panel/50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted"
            title={kind.label}
            aria-hidden
          >
            {customIcon ? (
              <PbIcon icon={kind.icon} size={10} className="text-muted" />
            ) : null}
            <span className="truncate">{kind.label}</span>
          </span>
          <StatusDotWithHover status={node.status} name={node.name} />
        </Link>
      </div>

      {open && hasChildren
        ? node.children!.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              projectId={projectId}
              selectedId={selectedId}
              depth={depth + 1}
              linkMode={linkMode}
              structureView={structureView}
              isOpen={isOpen}
              onToggle={onToggle}
              colorFor={colorFor}
              iconFor={iconFor}
              onNodeContextMenu={onNodeContextMenu}
              linkToolActive={linkToolActive}
              linkSourceId={linkSourceId}
              onLinkPick={onLinkPick}
            />
          ))
        : null}
    </div>
  );
}

export function NodeTree({
  projectId,
  nodes,
  selectedId,
  embedded = false,
  linkMode = "detail",
  structureView = "tree",
  expandToSelected = false,
  colorFor,
  iconFor,
  onNodeContextMenu,
  onPaneContextMenu,
  linkToolActive,
  linkSourceId,
  onLinkPick,
}: {
  projectId: string;
  nodes: ProjectNode[];
  selectedId?: string;
  /** Center-column management view (no sidebar chrome). */
  embedded?: boolean;
  /** detail → node page; structure → Structure workspace at that node. */
  linkMode?: "detail" | "structure";
  structureView?: "blobs" | "tree";
  /** Keep ancestors (and focused folder) of the selected node expanded. */
  expandToSelected?: boolean;
  /** Same palette as Structure blobs (`resolveFocusColor`). */
  colorFor?: (id: string) => string;
  /** Same icon map as Structure blobs (`resolveFocusIcon`). */
  iconFor?: (id: string) => IconKey | null;
  /** Right-click a tree row (Structure workspace). */
  onNodeContextMenu?: (nodeId: string, x: number, y: number) => void;
  /** Right-click empty tree pane area. */
  onPaneContextMenu?: (x: number, y: number) => void;
  linkToolActive?: boolean;
  linkSourceId?: string | null;
  onLinkPick?: (id: string) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const count = useMemo(() => {
    let total = 0;
    const walk = (list: ProjectNode[]) => {
      for (const n of list) {
        total += 1;
        if (n.children?.length) walk(n.children);
      }
    };
    walk(nodes);
    return total;
  }, [nodes]);

  const treeIndex = useMemo(() => buildTreeIndex(nodes), [nodes]);

  /**
   * Controlled expand map keyed by node id.
   * Persisted in sessionStorage so Focus Space remounts don't re-expand everything.
   * Empty on SSR + first paint; restore after mount (same pattern as blob colors).
   */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  /** Manual collapses that win over path-to-selected until the next navigation. */
  const [collapsedAway, setCollapsedAway] = useState<Set<string>>(
    () => new Set(),
  );
  const [pathSelectedId, setPathSelectedId] = useState(selectedId);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const draggingIdRef = useRef<string | null>(null);
  const suppressClickRef = useRef(false);
  const expandOnDragTimerRef = useRef<number | null>(null);
  const expandOnDragTargetRef = useRef<string | null>(null);

  // When selection changes: expand focused folder + ancestors; accordion sibling folders.
  if (pathSelectedId !== selectedId) {
    const previousId = pathSelectedId;
    setPathSelectedId(selectedId);
    if (expandToSelected && selectedId) {
      applyFocusExpandSync(
        nodes,
        selectedId,
        previousId,
        setExpandedIds,
        setCollapsedAway,
      );
    }
  }

  const forceOpenIds = useMemo(() => {
    if (!expandToSelected) return new Set<string>();
    return collectFocusOpenIds(nodes, selectedId);
  }, [expandToSelected, nodes, selectedId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const stored = loadExpandedIds(projectId);
      if (expandToSelected && selectedId) {
        for (const id of collectFocusOpenIds(nodes, selectedId)) {
          stored.add(id);
        }
      }
      setExpandedIds(stored);
    }, 0);
    return () => window.clearTimeout(t);
    // Hydrate once per project mount — path merges happen via selection sync above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveExpandedIds(projectId, expandedIds);
    }, 0);
    return () => window.clearTimeout(t);
  }, [expandedIds, projectId]);

  useEffect(() => {
    return () => {
      if (expandOnDragTimerRef.current != null) {
        window.clearTimeout(expandOnDragTimerRef.current);
      }
    };
  }, []);

  const isOpen = (id: string) => {
    if (collapsedAway.has(id)) return false;
    return expandedIds.has(id) || forceOpenIds.has(id);
  };

  const onToggle = (id: string) => {
    const currentlyOpen = isOpen(id);
    if (currentlyOpen) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setCollapsedAway((prev) => new Set(prev).add(id));
    } else {
      setExpandedIds((prev) => new Set(prev).add(id));
      setCollapsedAway((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const clearExpandOnDragTimer = useCallback(() => {
    if (expandOnDragTimerRef.current != null) {
      window.clearTimeout(expandOnDragTimerRef.current);
      expandOnDragTimerRef.current = null;
    }
    expandOnDragTargetRef.current = null;
  }, []);

  const scheduleExpandOnDrag = useCallback(
    (nodeId: string) => {
      if (expandOnDragTargetRef.current === nodeId) return;
      clearExpandOnDragTimer();
      expandOnDragTargetRef.current = nodeId;
      expandOnDragTimerRef.current = window.setTimeout(() => {
        expandOnDragTimerRef.current = null;
        setExpandedIds((prev) => new Set(prev).add(nodeId));
        setCollapsedAway((prev) => {
          if (!prev.has(nodeId)) return prev;
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }, TREE_EXPAND_ON_DRAG_MS);
    },
    [clearExpandOnDragTimer],
  );

  const dndEnabled = !linkToolActive;

  const dropAllowed = useMemo(() => {
    if (!draggingId || !dropTarget) return false;
    return isDropAllowed(
      dropTarget,
      draggingId,
      treeIndex.parentById,
      treeIndex.childrenByParent,
    );
  }, [draggingId, dropTarget, treeIndex]);

  const commitMove = useCallback(
    (target: DropTarget, dragId: string) => {
      if (
        !isDropAllowed(
          target,
          dragId,
          treeIndex.parentById,
          treeIndex.childrenByParent,
        )
      ) {
        return;
      }
      const resolved = resolveDropParentAndIndex(
        target,
        dragId,
        treeIndex.parentById,
        treeIndex.childrenByParent,
      );
      if (!resolved) return;

      const currentParent = treeIndex.parentById.get(dragId) ?? null;
      if (currentParent === resolved.parentId) {
        const full = treeIndex.childrenByParent.get(currentParent) ?? [];
        const currentIndex = full.findIndex((n) => n.id === dragId);
        if (currentIndex >= 0) {
          // Index among siblings after removing self.
          const currentIndexExcluding = full
            .slice(0, currentIndex)
            .filter((n) => n.id !== dragId).length;
          if (resolved.index === currentIndexExcluding) return;
        }
      }

      if (resolved.parentId) {
        setExpandedIds((prev) => new Set(prev).add(resolved.parentId!));
        setCollapsedAway((prev) => {
          if (!prev.has(resolved.parentId!)) return prev;
          const next = new Set(prev);
          next.delete(resolved.parentId!);
          return next;
        });
      }

      startTransition(async () => {
        const result = await moveNodeInTreeAction({
          id: dragId,
          parentId: resolved.parentId,
          index: resolved.index,
        });
        if (!result.ok) return;
        router.refresh();
      });
    },
    [router, treeIndex],
  );

  const onDragStart = useCallback((nodeId: string, event: DragEvent) => {
    if (!dndEnabled) {
      event.preventDefault();
      return;
    }
    suppressClickRef.current = false;
    event.dataTransfer.setData(TREE_DRAG_MIME, nodeId);
    event.dataTransfer.setData("text/plain", nodeId);
    event.dataTransfer.effectAllowed = "move";
    draggingIdRef.current = nodeId;
    setDraggingId(nodeId);
    setDropTarget(null);
  }, [dndEnabled]);

  const onDragEnd = useCallback(() => {
    suppressClickRef.current = true;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDropTarget(null);
    clearExpandOnDragTimer();
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [clearExpandOnDragTimer]);

  const onRowDragOver = useCallback(
    (nodeId: string, event: DragEvent) => {
      if (!dndEnabled) return;
      if (!isTreeDragEvent(event, draggingIdRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      const row = event.currentTarget as HTMLElement;
      const position = dropPositionFromEvent(event, row);
      const next: DropTarget = { nodeId, position };
      const dragId = draggingIdRef.current;
      const allowed =
        dragId != null &&
        isDropAllowed(
          next,
          dragId,
          treeIndex.parentById,
          treeIndex.childrenByParent,
        );
      event.dataTransfer.dropEffect = allowed ? "move" : "none";
      setDropTarget((prev) =>
        prev?.nodeId === next.nodeId && prev.position === next.position
          ? prev
          : next,
      );

      const targetNode = treeIndex.nodeById.get(nodeId);
      // Expand collapsed folders when hovering the "into" zone.
      const folderClosed =
        (targetNode?.children?.length ?? 0) > 0 &&
        (collapsedAway.has(nodeId) ||
          !(expandedIds.has(nodeId) || forceOpenIds.has(nodeId)));

      if (allowed && position === "into" && folderClosed) {
        scheduleExpandOnDrag(nodeId);
      } else if (position !== "into") {
        clearExpandOnDragTimer();
      }
    },
    [
      clearExpandOnDragTimer,
      collapsedAway,
      dndEnabled,
      expandedIds,
      forceOpenIds,
      scheduleExpandOnDrag,
      treeIndex,
    ],
  );

  const onRowDrop = useCallback(
    (nodeId: string, event: DragEvent) => {
      if (!dndEnabled) return;
      event.preventDefault();
      event.stopPropagation();
      const dragId =
        event.dataTransfer.getData(TREE_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain") ||
        draggingIdRef.current ||
        "";
      const row = event.currentTarget as HTMLElement;
      const position = dropPositionFromEvent(event, row);
      const target: DropTarget = { nodeId, position };
      draggingIdRef.current = null;
      setDraggingId(null);
      setDropTarget(null);
      clearExpandOnDragTimer();
      if (!dragId) return;
      suppressClickRef.current = true;
      commitMove(target, dragId);
    },
    [clearExpandOnDragTimer, commitMove, dndEnabled],
  );

  const onPaneDragOver = useCallback(
    (event: DragEvent) => {
      if (!dndEnabled) return;
      if (!isTreeDragEvent(event, draggingIdRef.current)) return;
      // Rows handle their own zones; only empty pane → root.
      if ((event.target as HTMLElement).closest?.("[data-tree-row]")) return;
      event.preventDefault();
      const next: DropTarget = { nodeId: null, position: "into" };
      event.dataTransfer.dropEffect = "move";
      setDropTarget((prev) =>
        prev?.nodeId === null && prev.position === "into" ? prev : next,
      );
      clearExpandOnDragTimer();
    },
    [clearExpandOnDragTimer, dndEnabled],
  );

  const onPaneDrop = useCallback(
    (event: DragEvent) => {
      if (!dndEnabled) return;
      if ((event.target as HTMLElement).closest?.("[data-tree-row]")) return;
      event.preventDefault();
      const dragId =
        event.dataTransfer.getData(TREE_DRAG_MIME) ||
        event.dataTransfer.getData("text/plain") ||
        draggingIdRef.current ||
        "";
      draggingIdRef.current = null;
      setDraggingId(null);
      setDropTarget(null);
      clearExpandOnDragTimer();
      if (!dragId) return;
      suppressClickRef.current = true;
      commitMove({ nodeId: null, position: "into" }, dragId);
    },
    [clearExpandOnDragTimer, commitMove, dndEnabled],
  );

  const onPaneDragLeave = useCallback((event: DragEvent) => {
    const next = event.relatedTarget as Node | null;
    if (!event.currentTarget.contains(next)) {
      setDropTarget(null);
      clearExpandOnDragTimer();
    }
  }, [clearExpandOnDragTimer]);

  const consumeSuppressClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  const dragContext = useMemo<TreeDragContextValue>(
    () => ({
      enabled: dndEnabled,
      draggingId,
      dropTarget,
      dropAllowed,
      consumeSuppressClick,
      onDragStart,
      onDragEnd,
      onRowDragOver,
      onRowDrop,
      onPaneDragOver,
      onPaneDrop,
      onPaneDragLeave,
    }),
    [
      dndEnabled,
      draggingId,
      dropTarget,
      dropAllowed,
      consumeSuppressClick,
      onDragStart,
      onDragEnd,
      onRowDragOver,
      onRowDrop,
      onPaneDragOver,
      onPaneDrop,
      onPaneDragLeave,
    ],
  );

  const rootDropActive =
    draggingId != null &&
    dropTarget?.nodeId === null &&
    dropTarget.position === "into";

  return (
    <TreeDragContext.Provider value={dragContext}>
      <div className={cn("flex flex-col", embedded ? "min-h-0" : "h-full")}>
        {!embedded ? (
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FolderTree size={16} className="text-nav" />
              Project Tree
            </div>
            <p className="mt-1 text-xs text-muted">{count} nodes</p>
          </div>
        ) : null}
        <div
          data-tree-pane
          className={cn(
            "relative space-y-0.5",
            embedded ? "min-h-full flex-1 p-1" : "flex-1 p-2",
            rootDropActive && "rounded-[var(--radius)] ring-1 ring-accent/40",
          )}
          onContextMenu={(e) => {
            if (!onPaneContextMenu) return;
            // Rows handle their own menu; empty area gets pane menu.
            if ((e.target as HTMLElement).closest?.("[data-tree-row]")) return;
            e.preventDefault();
            onPaneContextMenu(e.clientX, e.clientY);
          }}
          onDragOver={onPaneDragOver}
          onDrop={onPaneDrop}
          onDragLeave={onPaneDragLeave}
        >
          {nodes.length === 0 ? (
            <p className="px-2 py-4 text-sm text-muted">
              No nodes yet. Create your first component in the workspace.
            </p>
          ) : (
            nodes.map((node) => (
              <TreeItem
                key={node.id}
                node={node}
                projectId={projectId}
                selectedId={selectedId}
                depth={0}
                linkMode={linkMode}
                structureView={structureView}
                isOpen={isOpen}
                onToggle={onToggle}
                colorFor={colorFor}
                iconFor={iconFor}
                onNodeContextMenu={onNodeContextMenu}
                linkToolActive={linkToolActive}
                linkSourceId={linkSourceId}
                onLinkPick={onLinkPick}
              />
            ))
          )}
        </div>
      </div>
    </TreeDragContext.Provider>
  );
}
