"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  defaultFocusColor,
  FOCUS_PALETTE,
  resolveFocusColor,
} from "./focus-blob-color";
import type { FocusPieSlice } from "./focus-pie-adapter";

/** Degrees of sticky hold past a slice boundary before switching. */
const HOVER_HYSTERESIS_DEG = 5.5;

/** @deprecated Prefer resolveFocusColor(focusId). */
export function sliceColor(index: number) {
  return FOCUS_PALETTE[index % FOCUS_PALETTE.length]!;
}

export { defaultFocusColor, resolveFocusColor };

/** Stabilize float strings so SSR (Node) and client (browser) match. */
function roundCoord(n: number) {
  return Math.round(n * 1e4) / 1e4;
}

function polar(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: roundCoord(cx + r * Math.cos(rad)),
    y: roundCoord(cy + r * Math.sin(rad)),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polar(cx, cy, r, endAngle);
  const end = polar(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  const rcx = roundCoord(cx);
  const rcy = roundCoord(cy);
  const rr = roundCoord(r);
  return [
    `M ${rcx} ${rcy}`,
    `L ${start.x} ${start.y}`,
    `A ${rr} ${rr} 0 ${largeArc} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

function midAngle(start: number, end: number) {
  return (start + end) / 2;
}

function normalizeDeg(deg: number) {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function angleInSweep(angle: number, start: number, end: number) {
  const a = normalizeDeg(angle);
  const s = normalizeDeg(start);
  const e = normalizeDeg(end);
  if (s <= e) return a >= s && a < e;
  // Wrap across 0°
  return a >= s || a < e;
}

export function FocusCompositionPie({
  slices,
  hoveredId,
  onHover,
  onSelect,
  colorFor,
  size = 196,
}: {
  slices: FocusPieSlice[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  colorFor?: (focusId: string) => string;
  size?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const stickyIdRef = useRef<string | null>(null);
  const [tooltip, setTooltip] = useState<{
    id: string;
    x: number;
    y: number;
  } | null>(null);

  const cx = size / 2;
  const cy = size / 2;
  const baseR = size * 0.42;

  const arcs = useMemo(() => {
    const sweeps = slices.map(
      (slice) => (Math.max(0, slice.percentage) / 100) * 360,
    );
    const starts = sweeps.map((_, index) =>
      sweeps.slice(0, index).reduce((sum, s) => sum + s, 0),
    );
    return slices.map((slice, index) => {
      const sweep = sweeps[index] ?? 0;
      const start = starts[index] ?? 0;
      // Cap below 360° so a full-circle slice still renders as a valid arc.
      const end =
        start +
        Math.min(359.99, Math.max(sweep, slice.percentage > 0 ? 0.8 : 0));
      return { slice, index, start, end };
    });
  }, [slices]);

  const sliceAtAngle = useCallback(
    (angle: number) => {
      for (const arc of arcs) {
        if (angleInSweep(angle, arc.start, arc.end)) return arc.slice.id;
      }
      return arcs[0]?.slice.id ?? null;
    },
    [arcs],
  );

  /** Sticky active slice with boundary hysteresis to stop rapid flicker. */
  const resolveStickySlice = useCallback(
    (angle: number) => {
      const sticky = stickyIdRef.current;
      if (sticky) {
        const current = arcs.find((a) => a.slice.id === sticky);
        if (current) {
          const pad = Math.min(
            HOVER_HYSTERESIS_DEG,
            Math.max(1.5, (current.end - current.start) * 0.2),
          );
          if (angleInSweep(angle, current.start - pad, current.end + pad)) {
            return sticky;
          }
        }
      }
      const next = sliceAtAngle(angle);
      stickyIdRef.current = next;
      return next;
    },
    [arcs, sliceAtAngle],
  );

  const pointerToLocal = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      // Solid pie: only hit within outer radius (small center still belongs to slices).
      if (dist > baseR + 2) return null;
      let deg = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
      deg = normalizeDeg(deg);
      return { x, y, deg, dist };
    },
    [baseR, cx, cy],
  );

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const local = pointerToLocal(clientX, clientY);
      if (!local) {
        stickyIdRef.current = null;
        onHover(null);
        setTooltip(null);
        return;
      }
      const id = resolveStickySlice(local.deg);
      if (id) {
        onHover(id);
        setTooltip({ id, x: local.x, y: local.y });
      }
    },
    [onHover, pointerToLocal, resolveStickySlice],
  );

  const clearHover = useCallback(() => {
    stickyIdRef.current = null;
    onHover(null);
    setTooltip(null);
  }, [onHover]);

  if (slices.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-full border border-dashed border-border bg-panel text-xs text-muted"
        style={{ width: size, height: size }}
      >
        No child focuses
      </div>
    );
  }

  const activeTooltipSlice = tooltip
    ? slices.find((s) => s.id === tooltip.id)
    : null;

  return (
    <div className="relative mx-auto w-fit">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label="Composition of current focus level"
        className="overflow-visible"
        onPointerLeave={clearHover}
        onPointerMove={(e) => updateFromPointer(e.clientX, e.clientY)}
        onClick={(e) => {
          const local = pointerToLocal(e.clientX, e.clientY);
          if (!local) return;
          const id = resolveStickySlice(local.deg);
          if (id) onSelect(id);
        }}
      >
        {/* Visual slices — pointer events off; hit testing is angle-based on the SVG. */}
        {arcs.map(({ slice, start, end }) => {
          const active = hoveredId === slice.id;
          const mid = midAngle(start, end);
          const explode = active ? 4 : 0;
          const offset = polar(0, 0, explode, mid);
          const r = active ? baseR + 1.5 : baseR;
          const fill = colorFor?.(slice.id) ?? defaultFocusColor(slice.id);
          return (
            <path
              key={slice.id}
              d={describeArc(cx + offset.x, cy + offset.y, r, start, end)}
              fill={fill}
              opacity={hoveredId && !active ? 0.45 : 0.92}
              className="pointer-events-none transition-[opacity] duration-150 ease-out"
              style={{
                filter: active
                  ? "drop-shadow(0 1px 5px rgba(0,0,0,0.28))"
                  : undefined,
              }}
            />
          );
        })}
        {/* Invisible solid hit disc — stable hit target, no per-path boundary thrash. */}
        <circle
          cx={cx}
          cy={cy}
          r={baseR + 2}
          fill="transparent"
          className="cursor-pointer"
          style={{ pointerEvents: "all" }}
        />
      </svg>

      {activeTooltipSlice && tooltip ? (
        <div
          className="pointer-events-none absolute z-20 w-48 rounded-[var(--radius)] border border-border-strong bg-panel px-2.5 py-2 text-[11px] shadow-lg"
          style={{
            left: Math.min(tooltip.x + 12, size - 8),
            top: Math.max(8, tooltip.y - 8),
            transform: "translateY(-100%)",
          }}
        >
          <p className="font-semibold text-foreground">
            {activeTooltipSlice.name}
          </p>
          <p className="mt-0.5 text-muted">
            {activeTooltipSlice.percentage}% of this level
          </p>
          <p className="text-muted">
            {activeTooltipSlice.containedNodeCount} contained node
            {activeTooltipSlice.containedNodeCount === 1 ? "" : "s"}
          </p>
          {(activeTooltipSlice.statusCounts.ready > 0 ||
            activeTooltipSlice.statusCounts.inProgress > 0 ||
            activeTooltipSlice.statusCounts.draft > 0) && (
            <p className="mt-1 text-muted">
              Ready {activeTooltipSlice.statusCounts.ready} · In progress{" "}
              {activeTooltipSlice.statusCounts.inProgress} · Draft{" "}
              {activeTooltipSlice.statusCounts.draft}
            </p>
          )}
          {activeTooltipSlice.balance ? (
            <p className="mt-1 text-muted">
              Target {activeTooltipSlice.balance.targetWeight}% · Actual{" "}
              {activeTooltipSlice.balance.actualWeight}%
              <span className="block">
                {activeTooltipSlice.balance.directionLabel}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function FocusCompositionLegend({
  slices,
  hoveredId,
  onHover,
  onSelect,
  colorFor,
  onColorChange,
}: {
  slices: FocusPieSlice[];
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  colorFor?: (focusId: string) => string;
  /** When set, shows a compact color control per row. */
  onColorChange?: (focusId: string, color: string | null) => void;
}) {
  if (slices.length === 0) return null;

  return (
    <ul className="mt-4 space-y-1">
      {slices.map((slice) => {
        const active = hoveredId === slice.id;
        const color = colorFor?.(slice.id) ?? defaultFocusColor(slice.id);
        return (
          <li key={slice.id}>
            <div
              className={cn(
                "flex w-full items-center gap-2 rounded-[var(--radius)] px-2 py-1.5 text-xs transition-colors duration-150",
                active
                  ? "bg-muted-bg text-foreground"
                  : "text-muted hover:bg-muted-bg/70 hover:text-foreground",
              )}
              onMouseEnter={() => onHover(slice.id)}
              onMouseLeave={() => onHover(null)}
            >
              {onColorChange ? (
                <label
                  className="relative h-2.5 w-2.5 shrink-0 cursor-pointer overflow-hidden rounded-sm"
                  title="Choose color"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span
                    className="absolute inset-0"
                    style={{ background: color }}
                    aria-hidden
                  />
                  <input
                    type="color"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    value={color.startsWith("#") ? color : "#0090e7"}
                    aria-label={`Color for ${slice.name}`}
                    onChange={(e) => onColorChange(slice.id, e.target.value)}
                    onDoubleClick={(e) => {
                      e.preventDefault();
                      onColorChange(slice.id, null);
                    }}
                  />
                </label>
              ) : (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ background: color }}
                  aria-hidden
                />
              )}
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left font-medium"
                onClick={() => onSelect(slice.id)}
              >
                {slice.name}
              </button>
              <span className="shrink-0 tabular-nums">{slice.percentage}%</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
