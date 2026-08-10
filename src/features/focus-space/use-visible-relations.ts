"use client";

import { useMemo } from "react";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";
import {
  buildRelationNodeViews,
  filterRelationsForMode,
  scoreVisibleRelations,
  type RelationMode,
  type ScoredRelation,
} from "./relation-strength";

/**
 * Score + filter relations for the current Focus Space level.
 * Recalculates when visible slices / graph data change (nest/extract refresh).
 */
export function useVisibleRelations(opts: {
  visibleIds: string[];
  namesById: Map<string, string>;
  mode: RelationMode;
  focusId: string | null;
  /** Structure Focus Space only — Design Focus blobs are not NodeRelations. */
  enabled?: boolean;
}): ScoredRelation[] {
  const workspace = useOptionalFocusWorkspace();
  const enabled = opts.enabled !== false;

  return useMemo(() => {
    if (!enabled || !workspace || opts.mode === "off" || opts.visibleIds.length < 2) {
      return [];
    }

    const views = buildRelationNodeViews({
      visibleIds: opts.visibleIds,
      namesById: opts.namesById,
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

    return filterRelationsForMode(scored, opts.mode, opts.focusId);
  }, [
    enabled,
    workspace,
    opts.visibleIds,
    opts.namesById,
    opts.mode,
    opts.focusId,
  ]);
}

/** All scored connections for a blob (sidebar), ignoring Strong top-N trim. */
export function useBlobConnections(opts: {
  blobId: string | null;
  visibleIds: string[];
  namesById: Map<string, string>;
  enabled?: boolean;
}): ScoredRelation[] {
  const workspace = useOptionalFocusWorkspace();
  const enabled = opts.enabled !== false;

  return useMemo(() => {
    if (!enabled || !workspace || !opts.blobId || opts.visibleIds.length < 2) {
      return [];
    }

    const views = buildRelationNodeViews({
      visibleIds: opts.visibleIds,
      namesById: opts.namesById,
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

    return scored.filter(
      (r) => r.sourceId === opts.blobId || r.targetId === opts.blobId,
    );
  }, [enabled, workspace, opts.blobId, opts.visibleIds, opts.namesById]);
}
