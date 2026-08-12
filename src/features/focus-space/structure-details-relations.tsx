"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";
import { cn } from "@/lib/utils";
import {
  relationVisuals,
  type ScoredRelation,
} from "./relation-strength";

/** Horizontal stub/lane: adjacent = OFFSET_MIN; +LANE_STEP per item between, capped at MAX_LANE. */
const OFFSET_MIN = 8;
/** Clear horizontal separation between consecutive span-levels (was 3.5 — too tight). */
const LANE_STEP = 12;
const MAX_LANE = 4;
/** Half of max emphasized glow stroke so the outer lane isn't clipped. */
const STROKE_PAD = 8;
/** Max lane extent + stroke pad (SVG width). Outer glow may paint past list pad. */
export const DETAILS_CONNECTOR_GUTTER =
  OFFSET_MIN + MAX_LANE * LANE_STEP + STROKE_PAD;
/**
 * List `paddingRight`: a bit under full gutter so cards grow ~12px and lanes
 * sit nearer the scrollbar (panel px absorbs the overflow). Keep MAX_LANE/spacing.
 */
export const DETAILS_CONNECTOR_LIST_PAD = DETAILS_CONNECTOR_GUTTER - 12;
/** Corner radius ≈ list-card `--radius` (0.5rem). */
const CORNER_R = 8;

type AnchorMap = Record<string, { y: number; right: number }>;

/** Items between the two list indices (0 = adjacent). Saturates at MAX_LANE. */
export function detailsRelationStepsBetween(
  indexA: number,
  indexB: number,
): number {
  return Math.max(0, Math.abs(indexA - indexB) - 1);
}

export function detailsRelationLaneOffset(stepsBetween: number): number {
  const lane = Math.min(Math.max(0, stepsBetween), MAX_LANE);
  return OFFSET_MIN + lane * LANE_STEP;
}

/**
 * Orthogonal right-edge connector between two list-row midpoints.
 * Goes right → vertical → left, with quadratic rounded 90° corners.
 * Lane offset scales with list distance (adjacent = closest; +step per item between, max 6).
 */
export function detailsListRelationCurve(
  y1: number,
  y2: number,
  x: number,
  stepsBetween: number,
): string {
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const dist = Math.max(1, bottom - top);
  const offset = detailsRelationLaneOffset(stepsBetween);
  const r = Math.min(CORNER_R, offset * 0.5, dist / 2);
  const ox = x + offset;

  return [
    `M ${x} ${top}`,
    `L ${ox - r} ${top}`,
    `Q ${ox} ${top} ${ox} ${top + r}`,
    `L ${ox} ${bottom - r}`,
    `Q ${ox} ${bottom} ${ox - r} ${bottom}`,
    `L ${x} ${bottom}`,
  ].join(" ");
}

function measureAnchors(
  listEl: HTMLElement,
  ids: string[],
): { anchors: AnchorMap; width: number; height: number } {
  const listRect = listEl.getBoundingClientRect();
  const anchors: AnchorMap = {};
  for (const id of ids) {
    const row = listEl.querySelector<HTMLElement>(`[data-details-child="${id}"]`);
    if (!row) continue;
    const r = row.getBoundingClientRect();
    anchors[id] = {
      y: r.top - listRect.top + r.height / 2,
      right: r.right - listRect.left,
    };
  }
  return {
    anchors,
    width: listEl.scrollWidth,
    height: Math.max(listEl.scrollHeight, listEl.clientHeight),
  };
}

/**
 * Orthogonal relation connectors along the right edge of the Details children list.
 * Hidden when Relations mode is Off; Focused/Strong follow the same filters as blobs.
 */
export function StructureDetailsRelationLayer({
  listRef,
  relations,
  childIds,
  emphasizedId,
  colorFor,
  layoutEpoch,
}: {
  listRef: RefObject<HTMLElement | null>;
  relations: ScoredRelation[];
  childIds: string[];
  emphasizedId: string | null;
  colorFor: (id: string) => string;
  /** Bump when accordion / content height changes so paths remeasure. */
  layoutEpoch: string | number;
}) {
  const [geometry, setGeometry] = useState<{
    anchors: AnchorMap;
    width: number;
    height: number;
  }>({ anchors: {}, width: 0, height: 0 });

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl || childIds.length === 0) {
      setGeometry({ anchors: {}, width: 0, height: 0 });
      return;
    }

    const update = () => {
      setGeometry(measureAnchors(listEl, childIds));
    };

    update();
    // Accordion height animates ~250ms — remasure mid/end so cables stay aligned.
    const t1 = window.setTimeout(update, 140);
    const t2 = window.setTimeout(update, 300);

    const ro = new ResizeObserver(update);
    ro.observe(listEl);
    for (const id of childIds) {
      const row = listEl.querySelector(`[data-details-child="${id}"]`);
      if (row) ro.observe(row);
    }

    const scrollParent = listEl.closest(".overflow-y-auto");
    scrollParent?.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      scrollParent?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [listRef, childIds, layoutEpoch, relations.length]);

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    childIds.forEach((id, i) => map.set(id, i));
    return map;
  }, [childIds]);

  const ranked = useMemo(() => {
    // Draw short list-distance first; longer lanes sit farther out (and paint above).
    return [...relations].sort((a, b) => {
      const aSteps = detailsRelationStepsBetween(
        indexById.get(a.sourceId) ?? 0,
        indexById.get(a.targetId) ?? 0,
      );
      const bSteps = detailsRelationStepsBetween(
        indexById.get(b.sourceId) ?? 0,
        indexById.get(b.targetId) ?? 0,
      );
      return aSteps - bSteps || b.strength - a.strength;
    });
  }, [relations, indexById]);

  if (relations.length === 0 || geometry.height < 8) return null;

  const svgW = Math.max(
    geometry.width + DETAILS_CONNECTOR_GUTTER,
    geometry.width,
  );
  const svgH = geometry.height;

  return (
    <svg
      className="pointer-events-none absolute left-0 top-0 z-[2] overflow-visible"
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      aria-hidden
    >
      <defs>
        {ranked.map((rel) => {
          const vis = relationVisuals(rel.strength, rel.explicit);
          const c1 = colorFor(rel.sourceId);
          const c2 = colorFor(rel.targetId);
          return (
            <linearGradient
              key={`dg-${rel.key}`}
              id={`details-rel-grad-${rel.key}`}
              gradientUnits="userSpaceOnUse"
            >
              <stop
                offset="0%"
                stopColor={c1}
                stopOpacity={0.7 * vis.strokeAlpha}
              />
              <stop
                offset="100%"
                stopColor={c2}
                stopOpacity={0.7 * vis.strokeAlpha}
              />
            </linearGradient>
          );
        })}
      </defs>
      {ranked.map((rel) => {
        const a = geometry.anchors[rel.sourceId];
        const b = geometry.anchors[rel.targetId];
        if (!a || !b) return null;
        const vis = relationVisuals(rel.strength, rel.explicit);
        const x = Math.max(a.right, b.right) - 1;
        const stepsBetween = detailsRelationStepsBetween(
          indexById.get(rel.sourceId) ?? 0,
          indexById.get(rel.targetId) ?? 0,
        );
        const d = detailsListRelationCurve(a.y, b.y, x, stepsBetween);
        const linked =
          emphasizedId != null &&
          (rel.sourceId === emphasizedId || rel.targetId === emphasizedId);
        const dimmed = emphasizedId != null && !linked;
        return (
          <g key={rel.key}>
            {linked || !emphasizedId ? (
              <path
                d={d}
                fill="none"
                stroke={`url(#details-rel-grad-${rel.key})`}
                strokeWidth={(vis.strokeWidth + (linked ? 1.2 : 0)) * 2.2}
                strokeOpacity={
                  (linked ? 0.28 : 0.12) * (dimmed ? 0.25 : 1)
                }
                strokeLinecap="round"
              />
            ) : null}
            <path
              d={d}
              fill="none"
              stroke={`url(#details-rel-grad-${rel.key})`}
              strokeWidth={vis.strokeWidth + (linked ? 1.1 : 0)}
              strokeOpacity={
                vis.opacity *
                vis.strokeAlpha *
                (linked ? 1.35 : dimmed ? 0.22 : 0.85)
              }
              strokeDasharray={vis.dashArray}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                "transition-[stroke-opacity,stroke-width] duration-200",
                linked && "details-rel-path--active",
              )}
            />
          </g>
        );
      })}
    </svg>
  );
}
