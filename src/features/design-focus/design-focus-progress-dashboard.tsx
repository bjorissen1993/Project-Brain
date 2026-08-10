"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  effectiveClassificationWeight,
  MIN_FILL_CONTENT_CHARS,
  nodeFillContentLength,
  summarizeTargetPool,
  type BalanceFocusNode,
  type BalanceStatus,
} from "./balance-model";
import { useFocusWorkspace } from "@/features/focus-space/focus-interaction-context";
import {
  readItemsViewMode,
  subscribeItemsViewMode,
  type ItemsViewMode,
} from "./items-view-mode";
import { ItemsViewToggle } from "./items-view-toggle";

const INTENT_COLLAPSE_KEY = "pb:design-focus:intent-collapsed";
const INTENT_COLLAPSE_EVENT = "pb:design-focus:intent-collapsed-change";

function subscribeIntentCollapsed(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === INTENT_COLLAPSE_KEY || e.key === null) onStoreChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(INTENT_COLLAPSE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(INTENT_COLLAPSE_EVENT, onStoreChange);
  };
}

function readIntentCollapsed(): boolean {
  try {
    const stored = localStorage.getItem(INTENT_COLLAPSE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
  } catch {
    /* ignore */
  }
  return true; // default collapsed
}

function setIntentCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(INTENT_COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(INTENT_COLLAPSE_EVENT));
}

function statusBarClass(status: BalanceStatus) {
  switch (status) {
    case "green":
      return "bg-accent";
    case "orange":
      return "bg-warning";
    case "red":
      return "bg-danger";
    default:
      return "bg-muted";
  }
}

function statusTextClass(status: BalanceStatus) {
  switch (status) {
    case "green":
      return "text-accent";
    case "orange":
      return "text-warning";
    case "red":
      return "text-danger";
    default:
      return "text-muted";
  }
}

function findSubtree(
  roots: BalanceFocusNode[],
  focusId: string | null,
): { nodes: BalanceFocusNode[]; trail: BalanceFocusNode[] } {
  if (focusId == null) return { nodes: roots, trail: [] };

  const trail: BalanceFocusNode[] = [];
  const walk = (
    list: BalanceFocusNode[],
    path: BalanceFocusNode[],
  ): BalanceFocusNode | null => {
    for (const n of list) {
      const next = [...path, n];
      if (n.id === focusId) {
        trail.push(...next);
        return n;
      }
      const found = walk(n.children, next);
      if (found) return found;
    }
    return null;
  };

  const node = walk(roots, []);
  if (!node) return { nodes: roots, trail: [] };
  return {
    nodes: node.children.length > 0 ? node.children : [node],
    trail,
  };
}

function metaRejected(metadata: unknown): boolean {
  return (metadata as { status?: string } | null)?.status === "rejected";
}

function metaWeight(metadata: unknown): number {
  const meta = metadata as { weight?: number; status?: string } | null;
  if (meta?.status === "rejected") return 0;
  return typeof meta?.weight === "number" ? meta.weight : 0;
}

type FillSource = {
  nodeId: string;
  name: string;
  contentLength: number;
  rawWeight: number;
  effectiveWeight: number;
};

function FocusProgressRow({
  node,
  depth,
  targetPool,
  expanded,
  onToggle,
  showFillSources,
  fillSourcesByFocus,
  projectId,
  viewMode,
}: {
  node: BalanceFocusNode;
  depth: number;
  targetPool: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  showFillSources: boolean;
  fillSourcesByFocus: Map<string, FillSource[]>;
  projectId: string;
  viewMode: ItemsViewMode;
}) {
  const fillSources = fillSourcesByFocus.get(node.id) ?? [];
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const sharePct =
    targetPool > 0
      ? Math.round((Math.max(0, node.targetImportance) / targetPool) * 100)
      : node.normalizedTargetWeight;
  const fillTowardTarget =
    node.targetImportance > 0
      ? Math.min(
          100,
          Math.round((node.rawActualWeight / node.targetImportance) * 100),
        )
      : 0;
  const barActualShare = Math.min(100, Math.max(0, node.actualWeight));
  const barTargetShare = Math.min(100, Math.max(0, node.normalizedTargetWeight));
  const isCards = viewMode === "cards";

  const children =
    hasChildren && isOpen
      ? (() => {
          const childPool = node.children.reduce(
            (sum, c) => sum + Math.max(0, c.targetImportance),
            0,
          );
          return node.children.map((child) => (
            <FocusProgressRow
              key={child.id}
              node={child}
              depth={depth + 1}
              targetPool={childPool}
              expanded={expanded}
              onToggle={onToggle}
              showFillSources={showFillSources}
              fillSourcesByFocus={fillSourcesByFocus}
              projectId={projectId}
              viewMode={viewMode}
            />
          ));
        })()
      : null;

  return (
    <div className={cn(isCards ? "flex h-full flex-col gap-2" : "space-y-1")}>
      <div
        className={cn(
          "rounded-[var(--radius)] border border-border bg-panel",
          isCards ? "flex h-full flex-col px-4 py-4 shadow-sm" : "px-3 py-2.5",
        )}
        style={isCards ? undefined : { marginLeft: depth * 12 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                className="mt-0.5 rounded px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-muted-bg hover:text-foreground"
                aria-expanded={isOpen}
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span className="mt-0.5 inline-block w-5" />
            )}
            <div className="min-w-0">
              <Link
                href={`/projects/${projectId}/design-focus/${node.id}`}
                className="truncate font-semibold hover:text-nav"
              >
                {node.name}
              </Link>
              <p className="mt-0.5 text-xs text-muted">
                {isCards ? (
                  <>
                    {node.rawActualWeight} / {node.targetImportance} pts ·{" "}
                    {sharePct}% of pool
                  </>
                ) : (
                  <>
                    target {node.targetImportance} pts ({sharePct}% of pool) ·
                    filled {node.rawActualWeight} / {node.targetImportance} ·{" "}
                    {node.contributingNodeCount} Ready with content
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p
              className={cn(
                "font-semibold uppercase",
                statusTextClass(node.status),
              )}
            >
              {node.status}
            </p>
            <p className="text-muted">{node.directionLabel}</p>
          </div>
        </div>

        <div className={cn("mt-3 space-y-2", isCards && "flex-1")}>
          <div>
            <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
              <span>points filled</span>
              <span>
                {node.rawActualWeight} / {node.targetImportance} ({fillTowardTarget}
                %)
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted-bg">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  statusBarClass(node.status),
                )}
                style={{ width: `${fillTowardTarget}%` }}
              />
            </div>
          </div>
          {!isCards || showFillSources ? (
            <div>
              <div className="mb-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
                <span>share of level</span>
                <span>
                  actual {node.actualWeight}% · target{" "}
                  {node.normalizedTargetWeight}%
                </span>
              </div>
              <div className="relative h-2 overflow-hidden rounded-full bg-muted-bg">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full opacity-80 transition-all",
                    statusBarClass(node.status),
                  )}
                  style={{ width: `${barActualShare}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-foreground/70"
                  style={{ left: `calc(${barTargetShare}% - 1px)` }}
                  title={`Normalized target ${node.normalizedTargetWeight}%`}
                />
              </div>
            </div>
          ) : (
            <div className="relative h-2 overflow-hidden rounded-full bg-muted-bg">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full opacity-80 transition-all",
                  statusBarClass(node.status),
                )}
                style={{ width: `${barActualShare}%` }}
              />
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-foreground/70"
                style={{ left: `calc(${barTargetShare}% - 1px)` }}
              />
            </div>
          )}
        </div>

        {showFillSources ? (
          <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted">
            <p className="text-[10px] uppercase tracking-wide">
              Review fill sources
            </p>
            {fillSources.length === 0 ? (
              <p className="text-muted">
                No Ready nodes with enough content (≥{MIN_FILL_CONTENT_CHARS}{" "}
                chars) contribute here.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {fillSources.map((src) => (
                  <li key={src.nodeId} className="flex flex-wrap gap-x-2">
                    <Link
                      href={`/projects/${projectId}/nodes/${src.nodeId}`}
                      className="truncate text-foreground/90 hover:text-nav"
                    >
                      {src.name}
                    </Link>
                    <span className="tabular-nums">
                      {src.effectiveWeight <= 0
                        ? `0 pts (classified ${Math.round(src.rawWeight)}, needs content)`
                        : src.effectiveWeight < src.rawWeight
                          ? `${Math.round(src.effectiveWeight)} pts (of ${Math.round(src.rawWeight)})`
                          : `${Math.round(src.effectiveWeight)} pts`}
                      {" · "}
                      {src.contentLength} chars
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      {children ? (
        isCards ? (
          <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        ) : (
          children
        )
      ) : null}
    </div>
  );
}

function CollapsibleProjectIntent({
  intentText,
  projectId,
}: {
  intentText: string;
  projectId: string;
}) {
  const collapsed = useSyncExternalStore(
    subscribeIntentCollapsed,
    readIntentCollapsed,
    () => true,
  );

  const preview =
    intentText.length > 140
      ? `${intentText.slice(0, 140).trimEnd()}…`
      : intentText;

  return (
    <div className="mt-3 rounded-[var(--radius)] border border-border bg-panel px-3 py-2">
      <button
        type="button"
        onClick={() => setIntentCollapsed(!collapsed)}
        className="flex w-full items-start justify-between gap-2 text-left"
        aria-expanded={!collapsed}
      >
        <span className="text-xs uppercase tracking-wide text-muted">
          Project intent
        </span>
        <span className="text-xs font-semibold text-muted">
          {collapsed ? "Show ▾" : "Hide ▴"}
        </span>
      </button>
      {collapsed ? (
        <p className="mt-1 text-sm leading-relaxed text-muted">{preview}</p>
      ) : (
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">
          {intentText}
        </p>
      )}
      <p className="mt-2 text-[11px] text-muted">
        <Link
          href={`/projects/${projectId}/profile`}
          className="text-accent underline"
        >
          Edit in Profile
        </Link>
      </p>
    </div>
  );
}

export function DesignFocusProgressDashboard({
  focusId = null,
}: {
  focusId?: string | null;
}) {
  const router = useRouter();
  const {
    projectId,
    projectName,
    balanceRoots,
    intentText,
    nodes,
    classifications,
    focuses,
  } = useFocusWorkspace();

  const { nodes: levelRoots, trail } = useMemo(
    () => findSubtree(balanceRoots, focusId),
    [balanceRoots, focusId],
  );

  const pool = useMemo(() => summarizeTargetPool(levelRoots), [levelRoots]);

  const [showFillSources, setShowFillSources] = useState(false);

  const descendantIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const byParent = new Map<string | null, string[]>();
    for (const f of focuses) {
      const parentId = f.parentId ?? null;
      const list = byParent.get(parentId) ?? [];
      list.push(f.id);
      byParent.set(parentId, list);
    }
    const collect = (id: string): Set<string> => {
      const existing = map.get(id);
      if (existing) return existing;
      const set = new Set<string>([id]);
      for (const child of byParent.get(id) ?? []) {
        for (const d of collect(child)) set.add(d);
      }
      map.set(id, set);
      return set;
    };
    for (const f of focuses) collect(f.id);
    return map;
  }, [focuses]);

  const fillSourcesByFocus = useMemo(() => {
    const readyById = new Map(
      nodes.filter((n) => n.status === "READY").map((n) => [n.id, n]),
    );
    const result = new Map<string, FillSource[]>();

    for (const f of focuses) {
      const ids = descendantIds.get(f.id) ?? new Set([f.id]);
      const byNode = new Map<string, FillSource>();
      for (const c of classifications) {
        if (!ids.has(c.category)) continue;
        const node = readyById.get(c.nodeId);
        if (!node) continue;
        if (metaRejected(c.metadata)) continue;
        const rawWeight = metaWeight(c.metadata);
        if (rawWeight <= 0) continue;
        const contentLength = nodeFillContentLength(node.content);
        const effectiveWeight = effectiveClassificationWeight(
          rawWeight,
          node.content,
        );
        // Include zero-effective rows when reviewing so creators see why a
        // classified Ready stub is not filling the bar.
        const prev = byNode.get(c.nodeId);
        if (prev) {
          prev.rawWeight += rawWeight;
          prev.effectiveWeight += effectiveWeight;
        } else {
          byNode.set(c.nodeId, {
            nodeId: c.nodeId,
            name: node.name || c.nodeId,
            contentLength,
            rawWeight,
            effectiveWeight,
          });
        }
      }
      result.set(
        f.id,
        [...byNode.values()].sort(
          (a, b) =>
            b.effectiveWeight - a.effectiveWeight ||
            a.name.localeCompare(b.name),
        ),
      );
    }
    return result;
  }, [classifications, descendantIds, focuses, nodes]);

  const parentHref =
    trail.length > 1
      ? `/projects/${projectId}/design-focus/${trail[trail.length - 2]!.id}`
      : trail.length === 1
        ? `/projects/${projectId}/design-focus`
        : null;

  const alertKind =
    pool.targetPool <= 0
      ? null
      : pool.actualFilled <= 0
        ? "error"
        : pool.underfilled || pool.distributionWarning || pool.overfilled
          ? pool.redCount > 0 || pool.actualFilled <= 0
            ? "error"
            : "warning"
          : null;

  const alertMessage = (() => {
    if (!alertKind) return null;
    const parts: string[] = [];
    if (pool.actualFilled <= 0) {
      parts.push(
        `No Ready nodes with meaningful content yet — target pool is ${pool.targetPool} points.`,
      );
    } else if (pool.underfilled) {
      parts.push(
        `Target pool not filled: ${pool.actualFilled} / ${pool.targetPool} points (${pool.remaining} remaining).`,
      );
    } else if (pool.overfilled) {
      parts.push(
        `Target pool exceeded: ${pool.actualFilled} / ${pool.targetPool} points.`,
      );
    }
    if (pool.distributionWarning) {
      parts.push(
        `Distribution is off (${pool.redCount} red, ${pool.orangeCount} orange) vs Design Focus targets.`,
      );
    }
    return parts.join(" ");
  })();

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div>
        {parentHref ? (
          <button
            type="button"
            onClick={() => router.push(parentHref)}
            className="mb-2 text-xs font-medium text-muted hover:text-foreground"
          >
            ← Up
          </button>
        ) : null}
        <p className="text-xs uppercase tracking-wide text-muted">
          {projectName}
          {trail.length > 0
            ? ` / ${trail.map((t) => t.name).join(" / ")}`
            : ""}
        </p>
        <h1 className="font-display text-3xl">Design Focus</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Target importance forms a points pool. Only{" "}
          <span className="text-foreground/80">Ready nodes with content</span>{" "}
          (≥{MIN_FILL_CONTENT_CHARS} chars) fill that pool via their
          classifications; empty Ready/Idea stubs add 0. Colors use existing
          balance thresholds (≤5 green, ≤10 orange, &gt;10 red) on normalized
          distribution.
        </p>
        {intentText ? (
          <CollapsibleProjectIntent
            intentText={intentText}
            projectId={projectId}
          />
        ) : (
          <p className="mt-3 text-xs text-muted">
            No intent set —{" "}
            <Link
              href={`/projects/${projectId}/profile`}
              className="text-accent underline"
            >
              add intent in Profile
            </Link>
            .
          </p>
        )}
      </div>

      <div className="rounded-[var(--radius)] border border-border bg-panel px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted">
              Total target pool
            </p>
            <p className="mt-1 font-display text-2xl tabular-nums">
              {pool.actualFilled}{" "}
              <span className="text-base text-muted">/ {pool.targetPool}</span>
            </p>
            <p className="mt-1 text-xs text-muted">
              sum of targetImportance at this level · {pool.fillPercent}% filled
              by Ready content
            </p>
          </div>
          <Link
            href={`/projects/${projectId}/profile#design-focus`}
            className="text-xs font-medium text-accent underline"
          >
            Edit targets
          </Link>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted-bg">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              pool.fillPercent >= 100 && !pool.distributionWarning
                ? "bg-accent"
                : pool.fillPercent >= 70
                  ? "bg-warning"
                  : "bg-danger",
            )}
            style={{ width: `${Math.min(100, pool.fillPercent)}%` }}
          />
        </div>
      </div>

      {alertMessage ? (
        <div
          role="alert"
          className={cn(
            "rounded-[var(--radius)] border px-3 py-3 text-sm",
            alertKind === "error"
              ? "border-danger/40 bg-danger/10 text-danger"
              : "border-warning/40 bg-warning/10 text-warning",
          )}
        >
          {alertMessage}
        </div>
      ) : pool.targetPool > 0 ? (
        <div className="rounded-[var(--radius)] border border-accent/30 bg-accent/10 px-3 py-3 text-sm text-accent">
          Target pool filled and distribution within thresholds.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={showFillSources}
            onChange={(e) => setShowFillSources(e.target.checked)}
            className="rounded border-border"
          />
          Review fill sources
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <ItemsViewToggle />
          <Link
            href={`/projects/${projectId}/balance`}
            className="text-xs text-muted underline hover:text-foreground"
          >
            Balance detail
          </Link>
        </div>
      </div>

      <div>
        {levelRoots.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-dashed border-border px-4 py-6 text-sm text-muted">
            No Design Focuses yet.{" "}
            <Link
              href={`/projects/${projectId}/profile#design-focus`}
              className="text-accent underline"
            >
              Add them in Profile
            </Link>
            .
          </div>
        ) : (
          <FocusProgressList
            key={focusId ?? "root"}
            levelRoots={levelRoots}
            targetPool={pool.targetPool}
            showFillSources={showFillSources}
            fillSourcesByFocus={fillSourcesByFocus}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}

function FocusProgressList({
  levelRoots,
  targetPool,
  showFillSources,
  fillSourcesByFocus,
  projectId,
}: {
  levelRoots: BalanceFocusNode[];
  targetPool: number;
  showFillSources: boolean;
  fillSourcesByFocus: Map<string, FillSource[]>;
  projectId: string;
}) {
  const viewMode = useSyncExternalStore(
    subscribeItemsViewMode,
    readItemsViewMode,
    () => "list" as ItemsViewMode,
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const r of levelRoots) set.add(r.id);
    return set;
  });

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className={cn(
        viewMode === "cards"
          ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          : "space-y-2",
      )}
    >
      {levelRoots.map((node) => (
        <FocusProgressRow
          key={node.id}
          node={node}
          depth={0}
          targetPool={targetPool}
          expanded={expanded}
          onToggle={onToggle}
          showFillSources={showFillSources}
          fillSourcesByFocus={fillSourcesByFocus}
          projectId={projectId}
          viewMode={viewMode}
        />
      ))}
    </div>
  );
}
