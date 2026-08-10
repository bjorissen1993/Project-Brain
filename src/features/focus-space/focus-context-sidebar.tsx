"use client";

import type { ReactNode } from "react";
import { Suspense, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FocusCompositionLegend,
  FocusCompositionPie,
} from "./focus-composition-pie";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";
import type { BalanceStatus } from "@/features/design-focus/balance-model";
import {
  buildRelationNodeViews,
  RELATION_WEIGHTS,
  scoreVisibleRelations,
  type ScoredRelation,
} from "./relation-strength";
import { FocusRelationsControl } from "./focus-relations-control";
import { parseStructureView } from "./structure-href";
import { StructureViewSwitcher } from "./structure-view-switcher";

function StructureViewSwitcherSlot({
  projectId,
  nodeId,
}: {
  projectId: string;
  nodeId: string | null;
}) {
  const searchParams = useSearchParams();
  const view = parseStructureView(searchParams.get("view"));
  return (
    <StructureViewSwitcher
      projectId={projectId}
      nodeId={nodeId}
      view={view}
    />
  );
}

type RouteKind = "structure" | "design-focus" | null;

function parseWorkspaceRoute(
  pathname: string | null,
): { kind: RouteKind; id: string | null } {
  if (!pathname) return { kind: null, id: null };

  const designNested = pathname.match(
    /\/projects\/[^/]+\/design-focus\/([^/]+)/,
  );
  if (designNested?.[1]) {
    return { kind: "design-focus", id: designNested[1] };
  }
  if (/\/projects\/[^/]+\/design-focus\/?$/.test(pathname)) {
    return { kind: "design-focus", id: null };
  }

  const structureNested = pathname.match(/\/projects\/[^/]+\/focus\/([^/]+)/);
  if (structureNested?.[1]) {
    return { kind: "structure", id: structureNested[1] };
  }
  if (/\/projects\/[^/]+\/focus\/?$/.test(pathname)) {
    return { kind: "structure", id: null };
  }

  return { kind: null, id: null };
}

function balanceTone(status: BalanceStatus | null | undefined) {
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

function StatusDistribution({
  counts,
}: {
  counts: {
    ready: number;
    inProgress: number;
    draft: number;
    review: number;
    idea: number;
    total: number;
  };
}) {
  if (counts.total === 0) {
    return <p className="text-xs text-muted">No contained components yet.</p>;
  }

  const rows = [
    { label: "Ready", value: counts.ready, color: "var(--ready)" },
    { label: "In progress", value: counts.inProgress, color: "var(--in-progress)" },
    { label: "Review", value: counts.review, color: "var(--review)" },
    { label: "Draft", value: counts.draft, color: "var(--draft)" },
    { label: "Idea", value: counts.idea, color: "var(--idea)" },
  ].filter((r) => r.value > 0);

  return (
    <ul className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-2 text-xs">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: row.color }}
            aria-hidden
          />
          <span className="flex-1 text-muted">{row.label}</span>
          <span className="tabular-nums text-foreground">{row.value}</span>
          <span className="w-8 text-right tabular-nums text-muted">
            {Math.round((row.value / counts.total) * 100)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

function weightFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const w = (metadata as { weight?: unknown }).weight;
  return typeof w === "number" && Number.isFinite(w) ? w : 0;
}

function signalRows(rel: ScoredRelation) {
  return (
    [
      {
        key: "explicit",
        label: "Explicit relation",
        value: rel.signals.explicit,
        max: RELATION_WEIGHTS.explicit,
      },
      {
        key: "shared",
        label: "Shared Design Focus",
        value: rel.signals.sharedClassification,
        max: RELATION_WEIGHTS.sharedClassification,
      },
      {
        key: "structural",
        label: "Structural proximity",
        value: rel.signals.structural,
        max: RELATION_WEIGHTS.structural,
      },
      {
        key: "ai",
        label: "AI evidence",
        value: rel.signals.aiEvidence,
        max: RELATION_WEIGHTS.aiEvidence,
      },
    ] as const
  ).filter((s) => s.value > 0);
}

function ConnectionsSection({
  focusId,
  kind,
}: {
  focusId: string | null;
  kind: RouteKind;
}) {
  const router = useRouter();
  const workspace = useOptionalFocusWorkspace();

  const data = useMemo(() => {
    if (!workspace || kind !== "structure") return null;
    const level = workspace.structureLevelFor(focusId);
    const visibleIds = level.slices.map((s) => s.id);
    if (visibleIds.length < 2) return null;

    const namesById = new Map(level.slices.map((s) => [s.id, s.name]));
    const views = buildRelationNodeViews({
      visibleIds,
      namesById,
      nodes: workspace.nodes.map((n) => ({
        id: n.id,
        parentId: n.parentId ?? null,
        sortOrder: n.sortOrder,
      })),
      classifications: workspace.classifications,
    });
    const scored = scoreVisibleRelations({
      views,
      relations: workspace.relations,
      aiEvidence: workspace.aiRelationEvidence,
    });

    const anchor =
      workspace.relationFocusId && visibleIds.includes(workspace.relationFocusId)
        ? workspace.relationFocusId
        : workspace.hoveredId && visibleIds.includes(workspace.hoveredId)
          ? workspace.hoveredId
          : null;

    const list = anchor
      ? scored.filter((r) => r.sourceId === anchor || r.targetId === anchor)
      : scored.slice(0, 8);

    return { list, anchor, namesById, visibleIds, projectId: workspace.projectId };
  }, [workspace, focusId, kind]);

  if (!workspace || kind !== "structure" || !data) return null;

  const { list, anchor, namesById, visibleIds, projectId } = data;
  const anchorName = anchor ? namesById.get(anchor) : null;

  const focusOther = (otherId: string) => {
    workspace.setRelationFocusId(otherId);
    workspace.setHoveredId(otherId, "chart");
    if (visibleIds.includes(otherId)) {
      // Stay on this level — soft-focus the sibling for Focused mode.
      return;
    }
    router.push(`/projects/${projectId}/focus/${otherId}`);
  };

  return (
    <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        Connections
      </p>
      <p className="mt-1 text-[10px] text-muted">
        {anchorName
          ? `Sorted by strength for ${anchorName}`
          : "Hover a blob to inspect its connections — scores from stored signals only"}
      </p>
      {list.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          {anchor
            ? "No visible relations above the threshold for this blob."
            : "No relations above the visibility threshold at this level."}
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {list.map((rel) => {
            const otherId =
              anchor == null
                ? rel.targetId
                : rel.sourceId === anchor
                  ? rel.targetId
                  : rel.sourceId;
            const otherName =
              anchor == null
                ? `${namesById.get(rel.sourceId) ?? "?"} ↔ ${namesById.get(rel.targetId) ?? "?"}`
                : namesById.get(otherId) ?? otherId;
            const signals = signalRows(rel);
            return (
              <li key={rel.key}>
                <button
                  type="button"
                  className="w-full rounded-[var(--radius)] px-1.5 py-1.5 text-left transition-colors hover:bg-panel-elevated"
                  onClick={() => focusOther(otherId)}
                  onMouseEnter={() => {
                    if (visibleIds.includes(otherId)) {
                      workspace.setHoveredId(otherId, "chart");
                    }
                  }}
                  onMouseLeave={() => workspace.setHoveredId(null)}
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium text-foreground">
                      {otherName}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted">
                      {rel.strength}
                      <span className="text-muted/70">
                        {rel.explicit ? " · explicit" : " · inferred"}
                      </span>
                    </span>
                  </div>
                  {signals.length > 0 ? (
                    <ul className="mt-1 space-y-0.5">
                      {signals.map((s) => (
                        <li
                          key={s.key}
                          className="flex items-center justify-between gap-2 text-[10px] text-muted"
                        >
                          <span>{s.label}</span>
                          <span className="tabular-nums">
                            {Math.round(s.value)}
                            <span className="text-muted/60">/{s.max}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {rel.relationTypes.length > 0 ? (
                    <p className="mt-1 text-[10px] text-muted/80">
                      {rel.relationTypes.join(" · ")}
                      {rel.labels.length > 0
                        ? ` — ${rel.labels.join(", ")}`
                        : ""}
                    </p>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Aggregate Design Focus contributions from Ready nodes under a structure container. */
function useDesignFocusContribution(
  containerNodeId: string | null,
  kind: RouteKind,
) {
  const workspace = useOptionalFocusWorkspace();
  return useMemo(() => {
    if (!workspace || kind !== "structure") return [];
    const { nodes, focuses, classifications } = workspace;

    const children = new Map<string | null, string[]>();
    for (const n of nodes) {
      const key = n.parentId ?? null;
      const list = children.get(key) ?? [];
      list.push(n.id);
      children.set(key, list);
    }

    const collect = (id: string, into: Set<string>) => {
      into.add(id);
      for (const child of children.get(id) ?? []) collect(child, into);
    };

    const under = new Set<string>();
    if (containerNodeId == null) {
      for (const n of nodes) under.add(n.id);
    } else {
      collect(containerNodeId, under);
      under.delete(containerNodeId);
    }

    const readyIds = new Set(
      nodes
        .filter((n) => under.has(n.id) && n.status === "READY")
        .map((n) => n.id),
    );
    if (readyIds.size === 0) return [];

    const byFocus = new Map<string, { name: string; weight: number; count: number }>();
    for (const c of classifications) {
      if (!readyIds.has(c.nodeId)) continue;
      const focus = focuses.find((f) => f.id === c.category);
      if (!focus) continue;
      const weight = weightFromMetadata(c.metadata);
      const prev = byFocus.get(focus.id) ?? {
        name: focus.name,
        weight: 0,
        count: 0,
      };
      prev.weight += weight;
      prev.count += 1;
      byFocus.set(focus.id, prev);
    }

    return [...byFocus.values()]
      .sort((a, b) => b.weight - a.weight || a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [workspace, containerNodeId, kind]);
}

/** Right rail when browsing Project Structure or Design Focus space. */
export function FocusContextSidebar({
  focusId,
  kind,
}: {
  focusId: string | null;
  kind: "structure" | "design-focus";
}) {
  const router = useRouter();
  const workspace = useOptionalFocusWorkspace();
  const contributions = useDesignFocusContribution(focusId, kind);
  if (!workspace) return null;

  const {
    projectId,
    hoveredId,
    setHoveredId,
    structureLevelFor,
    designFocusLevelFor,
    observations,
    colorFor,
    setFocusColor,
    focuses,
    relationMode,
    setRelationMode,
  } = workspace;

  const level =
    kind === "structure"
      ? structureLevelFor(focusId)
      : designFocusLevelFor(focusId);

  const basePath =
    kind === "structure"
      ? `/projects/${projectId}/focus`
      : `/projects/${projectId}/design-focus`;

  const navigateTo = (id: string) => {
    router.push(`${basePath}/${id}`);
  };

  const currentFocus =
    kind === "design-focus" && focusId
      ? focuses.find((f) => f.id === focusId)
      : null;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        {kind === "structure" ? (
          <div className="space-y-2">
            <Suspense
              fallback={
                <div className="h-8 animate-pulse rounded-[var(--radius)] bg-muted-bg" />
              }
            >
              <StructureViewSwitcherSlot
                projectId={projectId}
                nodeId={focusId}
              />
            </Suspense>
            <FocusRelationsControl
              mode={relationMode}
              onChange={setRelationMode}
            />
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold">Design Focus context</h2>
            <p className="mt-1 text-xs text-muted">
              Composition of Design Focuses at this level
            </p>
          </>
        )}
      </div>

      <div className="scrollbar-thin flex-1 space-y-5 overflow-y-auto p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Current
          </p>
          <p className="mt-1 font-display text-lg font-semibold leading-snug">
            {level.name}
          </p>
          <p className="mt-1 text-xs text-muted">
            {level.totalContainedNodes} contained component
            {level.totalContainedNodes === 1 ? "" : "s"}
          </p>
          {currentFocus ? (
            <p className="mt-2 text-xs text-muted">
              Target importance:{" "}
              <span className="font-medium text-foreground">
                {currentFocus.targetImportance}
              </span>
              {currentFocus.actualWeight > 0 ? (
                <>
                  {" · "}
                  Actual:{" "}
                  <span className="font-medium text-foreground">
                    {currentFocus.actualWeight}
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <ConnectionsSection focusId={focusId} kind={kind} />

        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Composition
          </p>
          <FocusCompositionPie
            slices={level.slices}
            hoveredId={hoveredId}
            onHover={(id) => setHoveredId(id, "chart")}
            onSelect={navigateTo}
            colorFor={colorFor}
          />
          <FocusCompositionLegend
            slices={level.slices}
            hoveredId={hoveredId}
            onHover={(id) => setHoveredId(id, "chart")}
            onSelect={navigateTo}
            colorFor={colorFor}
            onColorChange={setFocusColor}
          />
          {level.slices.length > 0 ? (
            <p className="mt-2 text-[10px] text-muted">
              Weights:{" "}
              {kind === "structure"
                ? level.weightSource === "nodeDistribution"
                  ? "contained node distribution"
                  : level.weightSource === "subtreeMass"
                    ? "subtree / content mass"
                    : "equal split"
                : level.weightSource === "actualWeight"
                  ? "balance actualWeight"
                  : level.weightSource === "nodeDistribution"
                    ? "classification / node distribution"
                    : level.weightSource === "subtreeMass"
                      ? "subtree / content mass"
                      : "equal split"}
              {" · "}
              Click a color swatch to customize (double-click to reset)
            </p>
          ) : null}
        </div>

        {kind === "design-focus" && level.slices.length > 0 ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Target importance (siblings)
            </p>
            <ul className="mt-2 space-y-1.5">
              {level.slices.map((slice) => {
                const focus = focuses.find((f) => f.id === slice.id);
                return (
                  <li
                    key={slice.id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-muted">{slice.name}</span>
                    <span className="tabular-nums text-foreground">
                      {focus?.targetImportance ?? "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Status distribution
          </p>
          <div className="mt-2">
            <StatusDistribution counts={level.statusCounts} />
          </div>
        </div>

        {kind === "structure" ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Design Focus contribution
            </p>
            <p className="mt-1 text-[10px] text-muted">
              Classifications of Ready nodes inside this container — does not
              change structure blobs.
            </p>
            {contributions.length === 0 ? (
              <p className="mt-2 text-xs text-muted">
                No Ready classifications under this level yet.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {contributions.map((row) => (
                  <li
                    key={row.name}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate text-muted">{row.name}</span>
                    <span className="tabular-nums text-foreground">
                      {Math.round(row.weight)}
                      <span className="text-muted"> · {row.count}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {kind === "design-focus" &&
        (level.balanceStatus || level.balanceDirection) ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Balance
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold uppercase",
                balanceTone(level.balanceStatus),
              )}
            >
              {level.balanceStatus ?? "neutral"}
            </p>
            {level.balanceDirection ? (
              <p className="mt-1 text-xs text-muted">{level.balanceDirection}</p>
            ) : null}
          </div>
        ) : null}

        {observations.length > 0 ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel px-3 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              Design observations
            </p>
            <ul className="mt-2 space-y-2">
              {observations.map((obs, i) => (
                <li key={i} className="text-xs leading-relaxed text-muted">
                  {obs}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Pathname-aware right rail: structure / design-focus context, else fallback. */
export function WorkspaceContextRail({
  fallback,
}: {
  fallback: ReactNode;
}) {
  const pathname = usePathname();
  const route = parseWorkspaceRoute(pathname);

  if (!route.kind) {
    return <>{fallback}</>;
  }

  return <FocusContextSidebar focusId={route.id} kind={route.kind} />;
}
