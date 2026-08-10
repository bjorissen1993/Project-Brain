"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderTree } from "lucide-react";
import { PbIcon, type IconKey } from "@/lib/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { structureFocusHref } from "@/features/focus-space/structure-href";
import { cn } from "@/lib/utils";
import type { ProjectNode } from "@/types";
import { NODE_TYPE_OPTIONS } from "@/types";

function typeLabel(type: ProjectNode["type"], custom?: string | null) {
  if (type === "CUSTOM" && custom) return custom;
  return NODE_TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
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

function collectAncestorIds(
  nodes: ProjectNode[],
  selectedId: string | undefined,
): Set<string> {
  if (!selectedId) return new Set();
  const parentById = new Map<string, string | null>();
  const walk = (list: ProjectNode[]) => {
    for (const n of list) {
      parentById.set(n.id, n.parentId ?? null);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(nodes);
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
}: {
  node: ProjectNode;
  projectId: string;
  selectedId?: string;
  depth: number;
  linkMode: "detail" | "structure";
  structureView: "blobs" | "tree" | "details";
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  colorFor?: (id: string) => string;
  iconFor?: (id: string) => IconKey | null;
}) {
  const hasChildren = (node.children?.length ?? 0) > 0;
  const selected = selectedId === node.id;
  const open = hasChildren && isOpen(node.id);
  const color = colorFor?.(node.id);
  const icon = iconFor?.(node.id);

  const href =
    linkMode === "structure"
      ? structureFocusHref(projectId, node.id, structureView)
      : `/projects/${projectId}/nodes/${node.id}`;

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-[var(--radius)] px-1.5 py-1.5 text-sm transition-colors",
          selected ? "bg-nav-muted text-foreground" : "hover:bg-muted-bg",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
      >
        <button
          type="button"
          className="flex h-5 w-5 shrink-0 items-center justify-center text-muted"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          aria-label={open ? "Collapse" : "Expand"}
          aria-expanded={hasChildren ? open : undefined}
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
        {color ? (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
            style={{ backgroundColor: color }}
            aria-hidden
          />
        ) : null}
        {icon ? (
          <PbIcon
            icon={icon}
            size={16}
            className="text-muted"
            style={
              color
                ? {
                    color: `color-mix(in srgb, ${color} 50%, var(--muted))`,
                  }
                : undefined
            }
          />
        ) : null}
        <Link href={href} className="min-w-0 flex-1 truncate">
          <span
            className="font-medium"
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
          <span className="ml-2 text-[11px] text-muted">
            {typeLabel(node.type, node.customTypeLabel)}
          </span>
        </Link>
        <StatusBadge status={node.status} className="opacity-80" />
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
}: {
  projectId: string;
  nodes: ProjectNode[];
  selectedId?: string;
  /** Center-column management view (no sidebar chrome). */
  embedded?: boolean;
  /** detail → node page; structure → Structure workspace at that node. */
  linkMode?: "detail" | "structure";
  structureView?: "blobs" | "tree" | "details";
  /** Keep ancestors of the selected node expanded (path only). */
  expandToSelected?: boolean;
  /** Same palette as Structure blobs (`resolveFocusColor`). */
  colorFor?: (id: string) => string;
  /** Same icon map as Structure blobs (`resolveFocusIcon`). */
  iconFor?: (id: string) => IconKey | null;
}) {
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

  // When selection changes, open the path to the current node only (clear path collapses).
  if (pathSelectedId !== selectedId) {
    setPathSelectedId(selectedId);
    if (expandToSelected && selectedId) {
      const ancestors = collectAncestorIds(nodes, selectedId);
      setCollapsedAway((prev) => {
        if (prev.size === 0) return prev;
        const next = new Set(prev);
        for (const id of ancestors) next.delete(id);
        return next;
      });
      setExpandedIds((prev) => {
        const next = new Set(prev);
        for (const id of ancestors) next.add(id);
        return next;
      });
    }
  }

  const forceOpenIds = useMemo(() => {
    if (!expandToSelected) return new Set<string>();
    return collectAncestorIds(nodes, selectedId);
  }, [expandToSelected, nodes, selectedId]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const stored = loadExpandedIds(projectId);
      if (expandToSelected && selectedId) {
        for (const id of collectAncestorIds(nodes, selectedId)) {
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

  return (
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
      <div className={cn("space-y-0.5", embedded ? "p-1" : "flex-1 p-2")}>
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
            />
          ))
        )}
      </div>
    </div>
  );
}
