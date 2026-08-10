"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { PbIcon, type IconKey } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
  defaultFocusColor,
  IDLE_SATELLITE_COUNT,
  idleSatelliteSpecs,
} from "./focus-blob-color";
import type { FocusPieSlice } from "./focus-pie-adapter";
import {
  blobDiameterPx,
  blobPadNormSize,
  blobsOverlap,
  buildFocusDescendantMap,
  canNestFocus,
  clampBlobDiameter,
  clampBlobNormSize,
  clampBlobRectSize,
  defaultBlobPositions,
  defaultNoteRectPx,
  isBlobRectSize,
  loadBlobPositions,
  loadBlobSizes,
  saveBlobPositions,
  saveBlobSizes,
  separateBlobPositions,
  separateMovedBlob,
  type BlobRectSize,
  type BlobSizeValue,
  type NormPos,
} from "./focus-blob-layout";
import type { FocusHoverSource } from "./focus-interaction-context";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";
import { FocusRelationLayer } from "./focus-relation-layer";
import { isNoteBlobSlice, NoteBlobFace } from "./note-blob-face";
import {
  buildRelationNodeViews,
  filterRelationsForMode,
  scoreVisibleRelations,
} from "./relation-strength";

const BLOB_RADII = [
  "58% 42% 48% 52% / 46% 54% 46% 54%",
  "48% 52% 42% 58% / 52% 44% 56% 48%",
  "54% 46% 56% 44% / 42% 58% 42% 58%",
  "44% 56% 50% 50% / 58% 42% 55% 45%",
  "50% 50% 42% 58% / 48% 52% 48% 52%",
  "46% 54% 54% 46% / 55% 45% 52% 48%",
];

const DRAG_RADII = [
  "62% 38% 55% 45% / 40% 60% 38% 62%",
  "55% 45% 38% 62% / 58% 42% 62% 38%",
  "60% 40% 58% 42% / 36% 64% 40% 60%",
  "42% 58% 48% 52% / 64% 36% 58% 42%",
  "56% 44% 40% 60% / 44% 56% 42% 58%",
  "48% 52% 58% 42% / 60% 40% 55% 45%",
];

const DRAG_THRESHOLD = 6;
const EXTRACT_ZONE_PX = 56;
const EXTRACT_PROXIMITY_PX = 150;
const PARTICLE_CAP = 72;
const MAX_EMIT_PER_MOVE = 5;
/** Baseline extract-arrow strength while dragging (proximity adds on top). */
const EXTRACT_BASE_GLOW = 0.62;

type BlobState =
  | "idle"
  | "pressing"
  | "dragging"
  | "drag-over"
  | "invalid"
  | "released"
  | "extracting"
  | "dropped";

type ParticleShape = "round" | "oval" | "speck";

type Particle = {
  id: number;
  x: number;
  y: number;
  size: number;
  color: string;
  vx: number;
  vy: number;
  duration: number;
  opacity: number;
  shape: ParticleShape;
  rotate: number;
  gravity: number;
};

type DragMorph = {
  radius: string;
  sx: number;
  sy: number;
};

type DragSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originNx: number;
  originNy: number;
  moved: boolean;
  lastX: number;
  lastY: number;
  lastT: number;
  morph: DragMorph;
};

/** Fresh stretch / radius morph for each grab — client-only, never SSR. */
function createDragMorph(): DragMorph {
  const seed = Math.random();
  const axis = Math.random();
  // Alternate which axis stretches so repeats feel different
  const sx =
    axis < 0.5 ? 1.06 + seed * 0.18 : 0.82 + seed * 0.14;
  const sy =
    axis < 0.5 ? 0.78 + (1 - seed) * 0.14 : 1.04 + (1 - seed) * 0.2;
  const base = DRAG_RADII[Math.floor(Math.random() * DRAG_RADII.length)]!;
  const jitter = Math.floor(Math.random() * 8) - 4;
  const parts = base.split(/[\s%/]+/).filter(Boolean);
  if (parts.length >= 8) {
    const tweak = (v: string) =>
      `${Math.min(72, Math.max(28, Number(v.replace("%", "")) + jitter))}%`;
    return {
      radius: `${tweak(parts[0]!)} ${tweak(parts[1]!)} ${tweak(parts[2]!)} ${tweak(parts[3]!)} / ${tweak(parts[4]!)} ${tweak(parts[5]!)} ${tweak(parts[6]!)} ${tweak(parts[7]!)}`,
      sx,
      sy,
    };
  }
  return { radius: base, sx, sy };
}

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pickShape(): ParticleShape {
  const r = Math.random();
  if (r < 0.55) return "speck";
  if (r < 0.88) return "round";
  return "oval";
}

export function FocusBlobs({
  slices,
  hoveredId,
  hoverSource,
  onHover,
  onSelect,
  onBlobContextMenu,
  onCanvasContextMenu,
  projectId,
  levelFocusId,
  canExtract,
  extractToParentId,
  focuses,
  onReparent,
  colorFor,
  iconFor,
  /** Structure Focus Space enables Adaptive Relation Visualization. */
  relationsEnabled = false,
  /** When true, click picks blobs for creating a NodeRelation instead of drilling in. */
  linkToolActive = false,
  linkSourceId = null,
  onLinkPick,
  /** Persist note body for structure note blobs (inline edit). */
  onSaveNoteContent,
  /** Open note details/info (double-click / open control). */
  onOpenNoteDetails,
}: {
  slices: FocusPieSlice[];
  hoveredId: string | null;
  /** Only chart/legend hover dims sibling blobs; blob hover stays calm. */
  hoverSource: FocusHoverSource;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  /** Right-click blob → standard context menu (not properties immediately). */
  onBlobContextMenu?: (id: string, clientX: number, clientY: number) => void;
  /** Right-click empty canvas → paste / create / link. */
  onCanvasContextMenu?: (clientX: number, clientY: number) => void;
  projectId: string;
  levelFocusId: string | null;
  /** When true, top-edge drop reparents to extractToParentId (may be null = root). */
  canExtract: boolean;
  extractToParentId: string | null;
  focuses: { id: string; parentId?: string | null }[];
  onReparent: (
    focusId: string,
    newParentId: string | null,
  ) => Promise<{ ok: boolean; error?: string }>;
  colorFor?: (focusId: string) => string;
  iconFor?: (focusId: string) => IconKey | null;
  relationsEnabled?: boolean;
  linkToolActive?: boolean;
  linkSourceId?: string | null;
  onSaveNoteContent?: (
    id: string,
    content: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  onOpenNoteDetails?: (id: string) => void;
  onLinkPick?: (id: string) => void;
}) {
  const workspace = useOptionalFocusWorkspace();
  const blobColor = useCallback(
    (id: string) => colorFor?.(id) ?? defaultFocusColor(id),
    [colorFor],
  );
  const blobIcon = useCallback(
    (id: string) => iconFor?.(id) ?? workspace?.iconFor(id) ?? null,
    [iconFor, workspace],
  );
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 640, h: 420 });
  /**
   * User / session overrides. Always start empty so SSR + first client paint match;
   * sessionStorage is restored after mount.
   */
  const [userPositions, setUserPositions] = useState<Record<string, NormPos>>(
    {},
  );
  /** Manual size overrides — diameter for images; {w,h} for sticky notes. */
  const [sizeOverrides, setSizeOverrides] = useState<
    Record<string, BlobSizeValue>
  >({});
  const [positionsReady, setPositionsReady] = useState(false);
  const [drag, setDrag] = useState<DragSession | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [extractProximity, setExtractProximity] = useState(0);
  const [overTargetId, setOverTargetId] = useState<string | null>(null);
  const [overExtract, setOverExtract] = useState(false);
  const [dropValid, setDropValid] = useState<boolean | null>(null);
  const [blobStates, setBlobStates] = useState<Record<string, BlobState>>({});
  const [particles, setParticles] = useState<Particle[]>([]);
  const [flashError, setFlashError] = useState<string | null>(null);
  /** Bump per blob after drag settle so exterior spots reshuffle. */
  const [satGeneration, setSatGeneration] = useState<Record<string, number>>(
    {},
  );
  /** Optimistic hide while nest/extract reparent + refresh completes. */
  const [exitingIds, setExitingIds] = useState<Record<string, true>>({});
  /** Inline note editor (structure note blobs only). */
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteContentOverrides, setNoteContentOverrides] = useState<
    Record<string, string>
  >({});
  const [, startTransition] = useTransition();
  const particleId = useRef(0);
  const lastEmitAt = useRef(0);
  const dragRef = useRef<DragSession | null>(null);
  const particleTimers = useRef<Map<number, number>>(new Map());

  const beginEditNote = useCallback(
    (id: string) => {
      if (!onSaveNoteContent) {
        onSelect(id);
        return;
      }
      const slice = slices.find((s) => s.id === id);
      if (!slice || !isNoteBlobSlice(slice)) {
        onSelect(id);
        return;
      }
      const content =
        noteContentOverrides[id] ?? slice.content ?? "";
      setEditingNoteId(id);
      setNoteDraft(content);
    },
    [noteContentOverrides, onSaveNoteContent, onSelect, slices],
  );

  const cancelEditNote = useCallback(() => {
    setEditingNoteId(null);
  }, []);

  const saveNoteContent = useCallback(
    async (id: string, content: string) => {
      if (!onSaveNoteContent) {
        return { ok: false as const, error: "Note editing unavailable" };
      }
      const slice = slices.find((s) => s.id === id);
      const previous =
        noteContentOverrides[id] ?? slice?.content ?? "";
      const next = content.trim();
      if (next === (previous ?? "").trim()) {
        return { ok: true as const };
      }
      const result = await onSaveNoteContent(id, next);
      if (result.ok) {
        setNoteContentOverrides((prev) => ({ ...prev, [id]: next }));
      }
      return result;
    },
    [noteContentOverrides, onSaveNoteContent, slices],
  );

  const effectiveEditingNoteId =
    editingNoteId != null && slices.some((s) => s.id === editingNoteId)
      ? editingNoteId
      : null;

  const descendants = useMemo(
    () => buildFocusDescendantMap(focuses),
    [focuses],
  );

  const layoutSlices = useMemo(
    () => slices.filter((s) => !exitingIds[s.id]),
    [slices, exitingIds],
  );

  const diameterFor = useCallback(
    (slice: { id: string; percentage: number }, count: number, short: number) => {
      const base = blobDiameterPx(slice.percentage, count, short);
      const override = sizeOverrides[slice.id];
      if (typeof override === "number") return clampBlobDiameter(override);
      return base;
    },
    [sizeOverrides],
  );

  const noteRectFor = useCallback(
    (slice: FocusPieSlice, count: number, short: number): BlobRectSize => {
      const override = sizeOverrides[slice.id];
      if (isBlobRectSize(override)) return clampBlobRectSize(override);
      // Legacy: a plain number on a note was a square-ish diameter override.
      if (typeof override === "number") {
        return defaultNoteRectPx(override);
      }
      return defaultNoteRectPx(blobDiameterPx(slice.percentage, count, short));
    },
    [sizeOverrides],
  );

  const shellSizeFor = useCallback(
    (
      slice: FocusPieSlice,
      count: number,
      short: number,
    ): { w: number; h: number } => {
      if (slice.imageUrl) {
        const d = diameterFor(slice, count, short);
        return { w: d, h: d };
      }
      if (isNoteBlobSlice(slice)) {
        return noteRectFor(slice, count, short);
      }
      const d = diameterFor(slice, count, short);
      return { w: d, h: d };
    },
    [diameterFor, noteRectFor],
  );

  const positions = useMemo(() => {
    // Defaults stay keyed by full level so siblings don't reflow when one exits.
    // Never run a global separation pass here — that scatters everyone on drag/refresh.
    const defaults = defaultBlobPositions(slices, size.w, size.h);
    const short = Math.min(size.w, size.h);
    const count = slices.length;
    const merged: Record<string, NormPos> = {};
    for (const s of layoutSlices) {
      const raw =
        userPositions[s.id] ?? defaults[s.id] ?? { nx: 0.5, ny: 0.5 };
      const { w: bw, h: bh } = shellSizeFor(s, count, short);
      // While dragging this blob toward extract, allow a shallower top inset.
      const allowExtractTop =
        Boolean(canExtract && drag?.moved && drag.id === s.id);
      const { padNy } = blobPadNormSize(bw, bh, size.w, size.h);
      merged[s.id] = clampBlobNormSize(raw, bw, bh, size.w, size.h, {
        padTop: allowExtractTop ? Math.min(padNy, 0.04) : padNy,
      });
    }
    return merged;
  }, [
    canExtract,
    drag,
    layoutSlices,
    shellSizeFor,
    size.h,
    size.w,
    slices,
    userPositions,
  ]);

  const positionsRef = useRef(positions);

  useEffect(() => {
    positionsRef.current = positions;
  }, [positions]);

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  const sliceIdsKey = slices.map((s) => s.id).join(",");

  const relationMode = workspace?.relationMode ?? "off";
  const relationFocusId = workspace?.relationFocusId ?? null;
  const workspaceRelations = workspace?.relations;
  const workspaceClassifications = workspace?.classifications;
  const workspaceAiEvidence = workspace?.aiRelationEvidence;
  const workspaceNodes = workspace?.nodes;

  // Adaptive relations — rescore when visible set / stored graph data changes
  // (nest/extract refresh), not on every drag frame.
  const visibleRelations = useMemo(() => {
    if (!relationsEnabled || !workspaceNodes || relationMode === "off") {
      return [];
    }
    const visibleIds = layoutSlices.map((s) => s.id);
    if (visibleIds.length < 2) return [];

    const namesById = new Map(layoutSlices.map((s) => [s.id, s.name]));
    const views = buildRelationNodeViews({
      visibleIds,
      namesById,
      nodes: workspaceNodes.map((n) => ({
        id: n.id,
        parentId: n.parentId ?? null,
        sortOrder: n.sortOrder,
      })),
      classifications: workspaceClassifications ?? [],
    });
    const scored = scoreVisibleRelations({
      views,
      relations: workspaceRelations ?? [],
      aiEvidence: workspaceAiEvidence ?? [],
    });
    const focusId =
      relationMode === "focused" ? relationFocusId ?? hoveredId : null;
    return filterRelationsForMode(scored, relationMode, focusId);
  }, [
    relationsEnabled,
    relationMode,
    relationFocusId,
    hoveredId,
    layoutSlices,
    workspaceNodes,
    workspaceClassifications,
    workspaceRelations,
    workspaceAiEvidence,
  ]);

  const relationEmphasisId = relationFocusId ?? hoveredId ?? null;

  // Restore session positions after mount (async) — SSR + first paint stay deterministic.
  useEffect(() => {
    const ids = sliceIdsKey ? sliceIdsKey.split(",") : [];
    const t = window.setTimeout(() => {
      const stored = loadBlobPositions(projectId, levelFocusId, ids);
      setUserPositions(Object.keys(stored).length > 0 ? stored : {});
      setSizeOverrides(loadBlobSizes(projectId, levelFocusId, ids));
      setPositionsReady(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, [projectId, levelFocusId, sliceIdsKey]);

  useEffect(() => {
    const timers = particleTimers.current;
    return () => {
      for (const t of timers.values()) window.clearTimeout(t);
      timers.clear();
    };
  }, []);

  const overlapPersistKey = useRef("");
  const userPositionsRef = useRef(userPositions);
  useEffect(() => {
    userPositionsRef.current = userPositions;
  }, [userPositions]);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = cr.width;
      const h = cr.height;
      setSize({ w, h });
      // Wait until session restore finished so we don't persist empty overlays
      if (!positionsReady || w < 80 || h < 80) return;
      const sliceIds = slices.map((s) => s.id).join(",");
      const key = `${projectId}:${levelFocusId ?? "root"}:${sliceIds}:${Math.round(w)}x${Math.round(h)}`;
      if (overlapPersistKey.current === key) return;
      overlapPersistKey.current = key;
      // Resize may change diameters — clamp each blob in place; only separate
      // when overlap appears, and keep that to the resize path (not drag/drop).
      const defaults = defaultBlobPositions(slices, w, h);
      const short = Math.min(w, h);
      const count = slices.length;
      const merged: Record<string, NormPos> = {};
      for (const s of slices) {
        const raw =
          userPositionsRef.current[s.id] ??
          defaults[s.id] ?? { nx: 0.5, ny: 0.5 };
        const { w: bw, h: bh } = shellSizeFor(s, count, short);
        merged[s.id] = clampBlobNormSize(raw, bw, bh, w, h);
      }
      if (!blobsOverlap(merged, slices, w, h)) {
        // Persist clamps so edge insets stick after resize without reflow.
        const prev = userPositionsRef.current;
        let changed = false;
        for (const s of slices) {
          const next = merged[s.id]!;
          const before = prev[s.id];
          if (
            !before ||
            Math.abs(before.nx - next.nx) > 1e-6 ||
            Math.abs(before.ny - next.ny) > 1e-6
          ) {
            changed = true;
            break;
          }
        }
        if (changed && Object.keys(prev).length > 0) {
          setUserPositions(merged);
          saveBlobPositions(projectId, levelFocusId, merged);
        }
        return;
      }
      const separated = separateBlobPositions(merged, slices, w, h);
      setUserPositions(separated);
      saveBlobPositions(projectId, levelFocusId, separated);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [levelFocusId, positionsReady, projectId, shellSizeFor, slices]);

  const shortSide = Math.min(size.w, size.h);

  const diameters = useMemo(() => {
    const map: Record<string, number> = {};
    const count = slices.length;
    for (const s of slices) {
      map[s.id] = diameterFor(s, count, shortSide);
    }
    return map;
  }, [diameterFor, slices, shortSide]);

  const shellSizes = useMemo(() => {
    const map: Record<string, BlobRectSize> = {};
    const count = slices.length;
    for (const s of slices) {
      map[s.id] = shellSizeFor(s, count, shortSide);
    }
    return map;
  }, [shellSizeFor, slices, shortSide]);

  const persistUser = useCallback(
    (next: Record<string, NormPos>) => {
      setUserPositions(next);
      saveBlobPositions(projectId, levelFocusId, next);
    },
    [projectId, levelFocusId],
  );

  const persistSize = useCallback(
    (id: string, diameterPx: number) => {
      setSizeOverrides((prev) => {
        const next = {
          ...prev,
          [id]: clampBlobDiameter(diameterPx),
        };
        saveBlobSizes(projectId, levelFocusId, next);
        return next;
      });
    },
    [projectId, levelFocusId],
  );

  const persistNoteSize = useCallback(
    (id: string, nextSize: BlobRectSize) => {
      setSizeOverrides((prev) => {
        const next = {
          ...prev,
          [id]: clampBlobRectSize(nextSize),
        };
        saveBlobSizes(projectId, levelFocusId, next);
        return next;
      });
    },
    [projectId, levelFocusId],
  );

  const bumpSatGeneration = useCallback((id: string) => {
    setSatGeneration((prev) => ({
      ...prev,
      [id]: (prev[id] ?? 0) + 1,
    }));
  }, []);

  const markExiting = useCallback((id: string) => {
    setExitingIds((prev) => ({ ...prev, [id]: true }));
  }, []);

  const clearExiting = useCallback((id: string) => {
    setExitingIds((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setTransientState = useCallback(
    (id: string, state: BlobState, ms = 420) => {
      setBlobStates((prev) => ({ ...prev, [id]: state }));
      window.setTimeout(() => {
        setBlobStates((prev) => {
          if (prev[id] !== state) return prev;
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
      }, ms);
    },
    [],
  );

  const hitTestBlob = useCallback(
    (clientX: number, clientY: number, excludeId: string) => {
      const el = canvasRef.current;
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      let best: { id: string; dist: number } | null = null;
      for (const s of slices) {
        if (s.id === excludeId) continue;
        const pos = positionsRef.current[s.id];
        if (!pos) continue;
        const cx = pos.nx * size.w;
        const cy = pos.ny * size.h;
        const shell = shellSizes[s.id] ?? { w: 100, h: 100 };
        const isNote = !s.imageUrl && isNoteBlobSlice(s);
        if (isNote) {
          const halfW = shell.w * 0.5;
          const halfH = shell.h * 0.5;
          if (
            Math.abs(px - cx) <= halfW &&
            Math.abs(py - cy) <= halfH
          ) {
            const dist = Math.hypot(px - cx, py - cy);
            if (!best || dist < best.dist) best = { id: s.id, dist };
          }
          continue;
        }
        const d = diameters[s.id] ?? Math.max(shell.w, shell.h);
        const dist = Math.hypot(px - cx, py - cy);
        if (dist <= d * 0.48) {
          if (!best || dist < best.dist) best = { id: s.id, dist };
        }
      }
      return best?.id ?? null;
    },
    [diameters, shellSizes, size.h, size.w, slices],
  );

  const scheduleParticleCleanup = useCallback((id: number, duration: number) => {
    const existing = particleTimers.current.get(id);
    if (existing) window.clearTimeout(existing);
    const t = window.setTimeout(() => {
      particleTimers.current.delete(id);
      setParticles((prev) => prev.filter((p) => p.id !== id));
    }, duration + 40);
    particleTimers.current.set(id, t);
  }, []);

  const pushParticles = useCallback(
    (next: Particle[]) => {
      if (next.length === 0) return;
      setParticles((prev) => {
        const merged = [...prev, ...next];
        const overflow = merged.length - PARTICLE_CAP;
        if (overflow <= 0) return merged;
        const dropped = merged.slice(0, overflow);
        for (const p of dropped) {
          const t = particleTimers.current.get(p.id);
          if (t) {
            window.clearTimeout(t);
            particleTimers.current.delete(p.id);
          }
        }
        return merged.slice(overflow);
      });
      for (const p of next) scheduleParticleCleanup(p.id, p.duration);
    },
    [scheduleParticleCleanup],
  );

  const makeParticle = useCallback(
    (
      x: number,
      y: number,
      color: string,
      opts: {
        vx: number;
        vy: number;
        size?: number;
        duration?: number;
        opacity?: number;
        shape?: ParticleShape;
        gravity?: number;
      },
    ): Particle => {
      const shape = opts.shape ?? pickShape();
      const size =
        opts.size ??
        (shape === "speck"
          ? rand(1.6, 3.2)
          : shape === "oval"
            ? rand(4.2, 9)
            : rand(2.8, 6.8));
      // Occasional larger gel drop
      const finalSize = Math.random() < 0.14 ? rand(8, 13) : size;
      return {
        id: ++particleId.current,
        x,
        y,
        size: finalSize,
        color,
        vx: opts.vx,
        vy: opts.vy,
        duration: opts.duration ?? rand(480, 920),
        opacity: opts.opacity ?? rand(0.45, 0.88),
        shape,
        rotate: rand(-34, 34),
        gravity: opts.gravity ?? rand(12, 42),
      };
    },
    [],
  );

  /** Squeeze-out burst when grab becomes a drag — not an explosion. */
  const emitGrabBurst = useCallback(
    (x: number, y: number, color: string) => {
      const count = 10 + Math.floor(Math.random() * 6);
      const next: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const speed = rand(10, 32);
        next.push(
          makeParticle(
            x + Math.cos(a) * rand(2, 12),
            y + Math.sin(a) * rand(2, 10),
            color,
            {
              vx: Math.cos(a) * speed + rand(-5, 5),
              vy: Math.sin(a) * speed * 0.7 + rand(6, 18),
              duration: rand(420, 820),
              opacity: rand(0.5, 0.85),
              gravity: rand(20, 48),
            },
          ),
        );
      }
      // Micro-specks
      for (let i = 0; i < 7; i++) {
        const a = rand(0, Math.PI * 2);
        next.push(
          makeParticle(x, y, color, {
            vx: Math.cos(a) * rand(5, 16),
            vy: Math.sin(a) * rand(3, 14) + 8,
            size: rand(1.2, 2.8),
            shape: "speck",
            duration: rand(320, 580),
            opacity: rand(0.35, 0.65),
            gravity: rand(10, 26),
          }),
        );
      }
      pushParticles(next);
    },
    [makeParticle, pushParticles],
  );

  /**
   * Inviting droplets falling from the top edge when extract is available —
   * cues “pull toward the top to move up one level”.
   */
  const emitExtractInvite = useCallback(
    (canvasW: number, color: string) => {
      const count = 16 + Math.floor(Math.random() * 8);
      const next: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const x = rand(canvasW * 0.06, canvasW * 0.94);
        const y = rand(1, 16);
        next.push(
          makeParticle(x, y, color, {
            vx: rand(-12, 12),
            vy: rand(32, 84),
            duration: rand(680, 1200),
            opacity: rand(0.45, 0.85),
            gravity: rand(24, 52),
            shape: Math.random() < 0.4 ? "oval" : pickShape(),
            size: rand(2.6, 8),
          }),
        );
      }
      for (let i = 0; i < 8; i++) {
        next.push(
          makeParticle(rand(canvasW * 0.12, canvasW * 0.88), rand(1, 10), color, {
            vx: rand(-8, 8),
            vy: rand(20, 48),
            size: rand(1.2, 2.8),
            shape: "speck",
            duration: rand(520, 900),
            opacity: rand(0.3, 0.6),
            gravity: rand(12, 28),
          }),
        );
      }
      pushParticles(next);
    },
    [makeParticle, pushParticles],
  );

  const emitTrail = useCallback(
    (
      x: number,
      y: number,
      color: string,
      velX: number,
      velY: number,
      speed: number,
    ) => {
      const now = performance.now();
      const minGap = speed > 18 ? 18 : speed > 8 ? 32 : 52;
      if (now - lastEmitAt.current < minGap) return;
      lastEmitAt.current = now;

      const count = Math.min(
        MAX_EMIT_PER_MOVE,
        speed > 22 ? 5 : speed > 10 ? 3 : 2,
      );
      const mag = Math.hypot(velX, velY) || 1;
      // Trail behind motion direction
      const tx = -velX / mag;
      const ty = -velY / mag;
      const next: Particle[] = [];
      for (let i = 0; i < count; i++) {
        const drift = rand(-0.65, 0.65);
        const sideX = -ty * drift * 16;
        const sideY = tx * drift * 16;
        next.push(
          makeParticle(
            x + tx * rand(4, 16) + sideX + rand(-4, 4),
            y + ty * rand(4, 14) + sideY + rand(-4, 4),
            color,
            {
              vx: tx * rand(8, 22) + sideX * 0.45 + rand(-4, 4),
              vy: ty * rand(5, 16) + sideY * 0.45 + rand(3, 14),
              duration: rand(400, 860),
              opacity: rand(0.4, 0.82),
              gravity: rand(14, 44),
              shape: Math.random() < 0.25 ? "oval" : pickShape(),
            },
          ),
        );
      }
      if (Math.random() < 0.55) {
        next.push(
          makeParticle(x + rand(-8, 8), y + rand(-5, 5), color, {
            vx: rand(-8, 8),
            vy: rand(3, 12),
            size: rand(1.2, 2.6),
            shape: "speck",
            duration: rand(300, 540),
            opacity: rand(0.3, 0.58),
            gravity: rand(8, 22),
          }),
        );
      }
      pushParticles(next);
    },
    [makeParticle, pushParticles],
  );

  const clearDragUi = useCallback(() => {
    setOverExtract(false);
    setExtractProximity(0);
    setOverTargetId(null);
    setDropValid(null);
    setDragPos(null);
  }, []);

  const finishDrag = useCallback(
    async (clientX: number, clientY: number, session: DragSession) => {
      const el = canvasRef.current;
      if (!el) {
        setDrag(null);
        clearDragUi();
        return;
      }
      const rect = el.getBoundingClientRect();
      const localY = clientY - rect.top;
      const inExtract = canExtract && localY < EXTRACT_ZONE_PX;
      const nestTarget = hitTestBlob(clientX, clientY, session.id);

      if (!session.moved) {
        setDrag(null);
        clearDragUi();
        setBlobStates((prev) => {
          const copy = { ...prev };
          delete copy[session.id];
          return copy;
        });
        if (linkToolActive && onLinkPick) {
          onLinkPick(session.id);
        } else {
          const slice = slices.find((s) => s.id === session.id);
          if (
            slice &&
            isNoteBlobSlice(slice) &&
            onSaveNoteContent &&
            effectiveEditingNoteId !== session.id
          ) {
            beginEditNote(session.id);
          } else if (!(slice && isNoteBlobSlice(slice) && onSaveNoteContent)) {
            onSelect(session.id);
          }
        }
        return;
      }

      // Any moved drag settle reshuffles exterior spots for this blob.
      bumpSatGeneration(session.id);

      if (inExtract) {
        clearDragUi();
        setDrag(null);
        setBlobStates((prev) => ({ ...prev, [session.id]: "extracting" }));
        window.setTimeout(() => {
          markExiting(session.id);
          startTransition(async () => {
            const result = await onReparent(session.id, extractToParentId);
            if (result.ok) {
              const next = { ...userPositionsRef.current };
              delete next[session.id];
              persistUser(next);
            } else {
              clearExiting(session.id);
              setFlashError(result.error ?? "Cannot move out of this level");
              setTransientState(session.id, "invalid", 500);
              persistUser({
                ...userPositionsRef.current,
                [session.id]: {
                  nx: session.originNx,
                  ny: session.originNy,
                },
              });
            }
          });
        }, 260);
        return;
      }

      if (nestTarget) {
        const valid = canNestFocus(session.id, nestTarget, descendants);
        if (!valid) {
          clearDragUi();
          setDrag(null);
          setFlashError("Can't nest under itself or a descendant");
          setTransientState(session.id, "invalid", 500);
          setTransientState(nestTarget, "invalid", 500);
          persistUser({
            ...userPositionsRef.current,
            [session.id]: {
              nx: session.originNx,
              ny: session.originNy,
            },
          });
          return;
        }
        // Hide immediately at drop so we never flash default layout positions.
        markExiting(session.id);
        const nextPos = { ...userPositionsRef.current };
        delete nextPos[session.id];
        persistUser(nextPos);
        clearDragUi();
        setDrag(null);
        setTransientState(nestTarget, "dropped", 380);
        startTransition(async () => {
          const result = await onReparent(session.id, nestTarget);
          if (!result.ok) {
            clearExiting(session.id);
            setFlashError(result.error ?? "Reparent failed");
            setTransientState(session.id, "invalid", 500);
            persistUser({
              ...userPositionsRef.current,
              [session.id]: {
                nx: session.originNx,
                ny: session.originNy,
              },
            });
          }
        });
        return;
      }

      // Free reposition — only nudge the released blob out of collisions.
      const short = Math.min(size.w, size.h);
      const movedSlice = slices.find((s) => s.id === session.id);
      const movedShell = movedSlice
        ? shellSizeFor(movedSlice, slices.length, short)
        : { w: blobDiameterPx(25, slices.length, short), h: blobDiameterPx(25, slices.length, short) };
      const dropped = clampBlobNormSize(
        {
          nx: (clientX - rect.left) / size.w,
          ny: (clientY - rect.top) / size.h,
        },
        movedShell.w,
        movedShell.h,
        size.w,
        size.h,
      );
      const tentative = {
        ...userPositionsRef.current,
        [session.id]: dropped,
      };
      // Ensure every visible sibling has a sticky position so settle does not
      // invent fresh defaults for missing ids and then scatter the board.
      const defaults = defaultBlobPositions(slices, size.w, size.h);
      const baseline: Record<string, NormPos> = {};
      for (const s of slices) {
        const raw = tentative[s.id] ?? defaults[s.id] ?? { nx: 0.5, ny: 0.5 };
        const shell = shellSizeFor(s, slices.length, short);
        baseline[s.id] = clampBlobNormSize(
          raw,
          shell.w,
          shell.h,
          size.w,
          size.h,
        );
      }
      const settled = separateMovedBlob(
        baseline,
        session.id,
        slices,
        size.w,
        size.h,
      );
      persistUser(settled);
      setTransientState(session.id, "released", 480);
      setDrag(null);
      clearDragUi();
    },
    [
      bumpSatGeneration,
      canExtract,
      clearDragUi,
      clearExiting,
      descendants,
      extractToParentId,
      hitTestBlob,
      markExiting,
      onReparent,
      onSelect,
      linkToolActive,
      onLinkPick,
      onSaveNoteContent,
      beginEditNote,
      effectiveEditingNoteId,
      persistUser,
      setTransientState,
      shellSizeFor,
      size.h,
      size.w,
      slices,
    ],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (!session.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
        session.moved = true;
        setDrag({ ...session, moved: true });
        setBlobStates((prev) => ({ ...prev, [session.id]: "dragging" }));
        const color = blobColor(session.id);
        emitGrabBurst(
          e.clientX - rect.left,
          e.clientY - rect.top,
          color,
        );
        if (canExtract) {
          emitExtractInvite(rect.width, color);
        }
      }
      if (!session.moved) return;

      const now = performance.now();
      const dt = Math.max(8, now - session.lastT);
      const velX = ((e.clientX - session.lastX) / dt) * 16;
      const velY = ((e.clientY - session.lastY) / dt) * 16;
      const speed = Math.hypot(velX, velY);
      session.lastX = e.clientX;
      session.lastY = e.clientY;
      session.lastT = now;

      const short = Math.min(size.w, size.h);
      const movedSlice = slices.find((s) => s.id === session.id);
      const movedShell = movedSlice
        ? shellSizeFor(movedSlice, slices.length, short)
        : {
            w: blobDiameterPx(25, slices.length, short),
            h: blobDiameterPx(25, slices.length, short),
          };
      const { padNy } = blobPadNormSize(
        movedShell.w,
        movedShell.h,
        size.w,
        size.h,
      );
      const nextPos = clampBlobNormSize(
        {
          nx: (e.clientX - rect.left) / size.w,
          ny: (e.clientY - rect.top) / size.h,
        },
        movedShell.w,
        movedShell.h,
        size.w,
        size.h,
        {
          // Let extract zone stay reachable; resting clamp still uses full pad.
          padTop: canExtract ? Math.min(padNy, 0.04) : padNy,
        },
      );
      setUserPositions((prev) => ({
        ...prev,
        [session.id]: nextPos,
      }));
      const localX = e.clientX - rect.left;
      const localY = e.clientY - rect.top;
      setDragPos({ x: localX, y: localY });

      if (canExtract) {
        const proximity = Math.max(
          0,
          Math.min(1, 1 - localY / EXTRACT_PROXIMITY_PX),
        );
        setExtractProximity(proximity);
        const inExtract = localY < EXTRACT_ZONE_PX;
        setOverExtract(inExtract);
        if (inExtract) {
          setOverTargetId(null);
          setDropValid(true);
        } else {
          const target = hitTestBlob(e.clientX, e.clientY, session.id);
          setOverTargetId(target);
          if (target) {
            setDropValid(canNestFocus(session.id, target, descendants));
          } else {
            setDropValid(null);
          }
        }
      } else {
        setExtractProximity(0);
        setOverExtract(false);
        const target = hitTestBlob(e.clientX, e.clientY, session.id);
        setOverTargetId(target);
        if (target) {
          setDropValid(canNestFocus(session.id, target, descendants));
        } else {
          setDropValid(null);
        }
      }

      emitTrail(localX, localY, blobColor(session.id), velX, velY, speed);
    };

    const onUp = (e: PointerEvent) => {
      const session = dragRef.current;
      if (!session || e.pointerId !== session.pointerId) return;
      void finishDrag(e.clientX, e.clientY, session);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [
    blobColor,
    canExtract,
    descendants,
    drag,
    emitExtractInvite,
    emitGrabBurst,
    emitTrail,
    finishDrag,
    hitTestBlob,
    shellSizeFor,
    size.h,
    size.w,
    slices,
  ]);

  useEffect(() => {
    if (!flashError) return;
    const t = window.setTimeout(() => setFlashError(null), 2200);
    return () => window.clearTimeout(t);
  }, [flashError]);

  // Idle: clear any leftover particles if drag ended a while ago
  useEffect(() => {
    if (drag) return;
    if (particles.length === 0) return;
    const t = window.setTimeout(() => {
      setParticles((prev) => (prev.length > 0 ? [] : prev));
      for (const timer of particleTimers.current.values()) {
        window.clearTimeout(timer);
      }
      particleTimers.current.clear();
    }, 900);
    return () => window.clearTimeout(t);
  }, [drag, particles.length]);

  if (slices.length === 0) {
    return (
      <div
        className="relative flex min-h-[280px] h-full flex-col items-center justify-center gap-2 px-6 text-center"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 45%, color-mix(in srgb, var(--panel-elevated) 80%, transparent), transparent 72%)",
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onCanvasContextMenu?.(e.clientX, e.clientY);
        }}
      >
        <p className="text-sm text-foreground">
          Nothing at this level yet
        </p>
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          Use Add to create a node, note, or image — or right-click the canvas to
          paste / create / link.
        </p>
      </div>
    );
  }

  const showExtractUi = Boolean(canExtract && drag?.moved);
  // Baseline glow as soon as drag starts; proximity / over-extract brightens further
  const extractIntensity = showExtractUi
    ? overExtract
      ? 1
      : EXTRACT_BASE_GLOW + extractProximity * (1 - EXTRACT_BASE_GLOW)
    : 0;

  return (
    <div
      ref={canvasRef}
      className="relative h-full min-h-[320px] w-full touch-none select-none overflow-hidden rounded-[var(--radius)]"
      style={{
        background:
          "radial-gradient(ellipse 70% 55% at 50% 45%, color-mix(in srgb, var(--panel-elevated) 80%, transparent), transparent 72%)",
      }}
      onContextMenu={(e) => {
        // Bubbles only when not handled by a blob button.
        if ((e.target as HTMLElement).closest?.("[data-structure-blob]")) {
          return;
        }
        e.preventDefault();
        onCanvasContextMenu?.(e.clientX, e.clientY);
      }}
    >
      {/* Top-edge extract cue — only while dragging in a nested container */}
      {showExtractUi ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-14 flex-col items-center justify-start pt-1.5"
          aria-hidden
          style={{
            opacity: 0.55 + extractIntensity * 0.45,
            background: `linear-gradient(to bottom, color-mix(in srgb, var(--nav) ${
              overExtract ? 34 : 18 + extractIntensity * 16
            }%, transparent), transparent 90%)`,
            boxShadow: overExtract
              ? "inset 0 2px 0 color-mix(in srgb, var(--nav) 55%, transparent), 0 8px 24px color-mix(in srgb, var(--nav) 18%, transparent)"
              : `inset 0 1px 0 color-mix(in srgb, var(--nav) ${
                  22 + extractIntensity * 28
                }%, transparent), 0 6px 18px color-mix(in srgb, var(--nav) ${
                  8 + extractIntensity * 12
                }%, transparent)`,
            transition:
              "opacity 140ms ease-out, background 140ms ease-out, box-shadow 140ms ease-out",
          }}
        >
          <span
            className={cn(
              "focus-extract-arrow text-nav",
              "focus-extract-arrow--lit",
              overExtract && "focus-extract-arrow--active",
            )}
            style={{
              opacity: 0.72 + extractIntensity * 0.28,
              transform: `translateY(${overExtract ? 0 : 1}px) scale(${
                0.95 + extractIntensity * 0.12
              })`,
              filter: `drop-shadow(0 0 ${
                4 + extractIntensity * 8
              }px color-mix(in srgb, var(--nav) ${
                45 + extractIntensity * 40
              }%, transparent))`,
            }}
          >
            ↑
          </span>
        </div>
      ) : null}

      {/* Adaptive relation curves + path particles (under blobs; non-interactive) */}
      {relationsEnabled && visibleRelations.length > 0 ? (
        <FocusRelationLayer
          relations={visibleRelations}
          positions={positions}
          positionsRef={positionsRef}
          size={size}
          dragging={Boolean(drag?.moved)}
          emphasizedId={relationEmphasisId}
          colorFor={blobColor}
        />
      ) : null}

      {/* Particle layer */}
      <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className={cn(
              "focus-particle absolute",
              p.shape === "oval" && "focus-particle--oval",
              p.shape === "speck" && "focus-particle--speck",
            )}
            style={
              {
                left: p.x,
                top: p.y,
                width: p.size,
                height: p.shape === "oval" ? p.size * 0.65 : p.size,
                "--fp-tx": `${p.vx}px`,
                "--fp-ty": `${p.vy + p.gravity}px`,
                "--fp-dur": `${p.duration}ms`,
                "--fp-opacity": String(p.opacity),
                "--fp-rot": `${p.rotate}deg`,
                background: `color-mix(in srgb, ${p.color} ${
                  p.shape === "speck" ? 55 : 72
                }%, transparent)`,
                boxShadow:
                  p.shape === "speck"
                    ? undefined
                    : `0 0 ${Math.max(3, p.size * 0.55)}px color-mix(in srgb, ${p.color} 35%, transparent)`,
              } as CSSProperties
            }
          />
        ))}
      </div>

      {slices.map((slice, index) => {
        if (exitingIds[slice.id]) return null;

        const pos = positions[slice.id] ?? { nx: 0.5, ny: 0.5 };
        const d = diameters[slice.id] ?? 100;
        const shell = shellSizes[slice.id] ?? { w: d, h: d };
        const color = blobColor(slice.id);
        const icon = blobIcon(slice.id);
        const iconSize = d < 110 ? 14 : d < 160 ? 16 : 18;
        const imageUrl = slice.imageUrl ?? null;
        const isImageBlob = Boolean(imageUrl);
        const isNoteBlob = !isImageBlob && isNoteBlobSlice(slice);
        const displaySlice =
          noteContentOverrides[slice.id] !== undefined
            ? { ...slice, content: noteContentOverrides[slice.id] ?? null }
            : slice;
        const isEditingNote = effectiveEditingNoteId === slice.id;
        const satellites = idleSatelliteSpecs(
          slice.id,
          IDLE_SATELLITE_COUNT,
          satGeneration[slice.id] ?? 0,
        );
        const isDragging = drag?.id === slice.id && drag.moved;
        const isPressing = drag?.id === slice.id && !drag.moved;
        const activeMorph =
          drag?.id === slice.id ? drag.morph : null;
        const isOverTarget = overTargetId === slice.id;
        const targetValid = isOverTarget ? dropValid : null;
        const transient = blobStates[slice.id];

        let state: BlobState = "idle";
        if (transient) state = transient;
        else if (isDragging) state = "dragging";
        else if (isPressing) state = "pressing";
        else if (isOverTarget && targetValid === false) state = "invalid";
        else if (isOverTarget && targetValid) state = "drag-over";

        // Dim siblings only when pie/legend drives hover — blob hover stays undimmed
        const dimmed =
          hoverSource === "chart" &&
          hoveredId != null &&
          hoveredId !== slice.id &&
          !isDragging &&
          !isOverTarget &&
          !drag;

        const pieLinked =
          hoveredId === slice.id && !drag?.moved && hoverSource === "chart";
        const blobLinked =
          hoveredId === slice.id && !drag?.moved && hoverSource === "blob";

        const shellStyle = {
          // Fixed decimals keep SSR/client style strings aligned.
          left: `${(pos.nx * 100).toFixed(4)}%`,
          top: `${(pos.ny * 100).toFixed(4)}%`,
          width: shell.w,
          height: shell.h,
          transform: "translate(-50%, -50%)",
          ...(isDragging && activeMorph && !isNoteBlob
            ? {
                ["--blob-drag-sx" as string]: String(activeMorph.sx),
                ["--blob-drag-sy" as string]: String(activeMorph.sy),
              }
            : {}),
        } as CSSProperties;

        const shellClassName = cn(
          "focus-blob-shell absolute z-[1] flex outline-none",
          isNoteBlob
            ? "flex-col items-stretch justify-start overflow-hidden"
            : "flex-col items-center justify-center text-center",
          isDragging || state === "extracting"
            ? "z-30 cursor-grabbing"
            : isEditingNote
              ? "z-30 cursor-default"
              : linkToolActive
                ? "cursor-crosshair"
                : "cursor-grab",
          dimmed && "opacity-45",
          linkToolActive &&
            linkSourceId === slice.id &&
            "ring-2 ring-nav/70 ring-offset-2 ring-offset-transparent",
          state === "extracting" && "focus-blob-shell--extracting",
          isNoteBlob &&
            !isImageBlob &&
            "focus-blob-shell--note",
        );

        const ariaLabel = linkToolActive
          ? `${slice.name}. Click to ${linkSourceId ? "set as link target" : "set as link source"}.`
          : isNoteBlob
            ? `${slice.name} sticky note. Click to edit text; drag edges or corner to resize; double-click or open control for details; drag to move; right-click for menu.`
            : `${slice.name}, ${slice.percentage}%. Drag to reposition or nest; click to open; right-click for menu.`;

        const titleHint = linkToolActive
          ? linkSourceId
            ? "Click to link to this blob"
            : "Click to choose link source"
          : isNoteBlob
            ? "Click to edit · drag edges/corner to resize · double-click or ↗ for details"
            : "Click to open · drag to move · right-click menu";

        const onShellContextMenu = (e: ReactMouseEvent<HTMLElement>) => {
          e.preventDefault();
          e.stopPropagation();
          onBlobContextMenu?.(slice.id, e.clientX, e.clientY);
        };

        const onShellPointerEnter = () => {
          if (!drag) {
            onHover(slice.id);
            if (relationsEnabled) {
              workspace?.setRelationFocusId(slice.id);
            }
          }
        };

        const onShellPointerLeave = () => {
          if (!drag) {
            onHover(null);
          }
        };

        const onShellPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
          if (e.button !== 0) return;
          const target = e.target as HTMLElement | null;
          if (
            target?.closest?.(
              "[data-note-editor], [data-note-open], [data-note-resize]",
            )
          ) {
            return;
          }
          if (isEditingNote) return;
          e.preventDefault();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          const session: DragSession = {
            id: slice.id,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            originNx: pos.nx,
            originNy: pos.ny,
            moved: false,
            lastX: e.clientX,
            lastY: e.clientY,
            lastT: performance.now(),
            morph: createDragMorph(),
          };
          setDrag(session);
          setBlobStates((prev) => ({ ...prev, [slice.id]: "pressing" }));
          onHover(slice.id);
          if (relationsEnabled) {
            workspace?.setRelationFocusId(slice.id);
          }
        };

        const onShellKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (linkToolActive && onLinkPick) onLinkPick(slice.id);
            else if (isNoteBlob && onSaveNoteContent) beginEditNote(slice.id);
            else onSelect(slice.id);
          }
        };

        const openNoteDetails = () => {
          setEditingNoteId(null);
          if (onOpenNoteDetails) onOpenNoteDetails(slice.id);
          else onSelect(slice.id);
        };

        const onShellDoubleClick = (e: ReactMouseEvent<HTMLElement>) => {
          if (!isNoteBlob) return;
          e.preventDefault();
          e.stopPropagation();
          openNoteDetails();
        };

        const shellProps = {
          "data-structure-blob": true,
          "data-blob-state": state,
          className: shellClassName,
          style: shellStyle,
          "aria-label": ariaLabel,
          title: titleHint,
          onContextMenu: onShellContextMenu,
          onPointerEnter: onShellPointerEnter,
          onPointerLeave: onShellPointerLeave,
          onPointerDown: onShellPointerDown,
          onKeyDown: onShellKeyDown,
          onDoubleClick: onShellDoubleClick,
        };

        const blobRadius = isNoteBlob
          ? "10px"
          : isImageBlob
            ? "18%"
            : (state === "dragging" || state === "extracting") && activeMorph
              ? activeMorph.radius
              : BLOB_RADII[index % BLOB_RADII.length];
        const noteIconSize = Math.max(12, iconSize - 2);
        const noteIcon =
          !isImageBlob && icon ? (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border/45 bg-black/[0.04] text-foreground/80"
              style={{
                color: `color-mix(in srgb, ${color} 55%, var(--foreground))`,
              }}
              aria-hidden
            >
              <PbIcon icon={icon} size={noteIconSize} />
            </span>
          ) : null;

        const beginNoteResize = (
          e: ReactPointerEvent<HTMLElement>,
          mode: "e" | "s" | "se",
        ) => {
          e.preventDefault();
          e.stopPropagation();
          const startX = e.clientX;
          const startY = e.clientY;
          const startW = shell.w;
          const startH = shell.h;
          const pointerId = e.pointerId;
          const target = e.currentTarget;
          target.setPointerCapture?.(pointerId);
          const onMove = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            const dx = ev.clientX - startX;
            const dy = ev.clientY - startY;
            const nextW =
              mode === "s" ? startW : startW + dx;
            const nextH =
              mode === "e" ? startH : startH + dy;
            persistNoteSize(slice.id, { w: nextW, h: nextH });
          };
          const onUp = (ev: PointerEvent) => {
            if (ev.pointerId !== pointerId) return;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        };

        const shellInner = (
          <>
            <span
              className="focus-blob-body absolute inset-0 overflow-hidden"
              style={{
                borderRadius: blobRadius,
                // Notes: gel fill lives in CSS via --note-blob-color (keeps ruled lines).
                ...(isNoteBlob
                  ? {
                      ["--note-blob-color" as string]: color,
                    }
                  : {
                      background: isImageBlob
                        ? "var(--panel)"
                        : `radial-gradient(circle at 32% 28%, color-mix(in srgb, ${color} 42%, transparent), color-mix(in srgb, ${color} 18%, var(--panel)) 55%, var(--panel-elevated))`,
                    }),
                border: `1px solid color-mix(in srgb, ${color} ${
                  state === "dragging" ||
                  state === "drag-over" ||
                  state === "extracting"
                    ? 52
                    : pieLinked
                      ? 40
                      : blobLinked
                        ? 32
                        : 28
                }%, var(--border))`,
                boxShadow:
                  state === "dragging"
                    ? `0 14px 30px rgba(0,0,0,0.32), 0 0 0 1px color-mix(in srgb, ${color} 32%, transparent)`
                    : state === "drag-over"
                      ? `0 0 0 1.5px color-mix(in srgb, var(--nav) 42%, transparent), 0 0 18px color-mix(in srgb, var(--nav) 16%, transparent)`
                      : state === "invalid"
                        ? `0 0 0 1.5px color-mix(in srgb, var(--danger) 48%, transparent)`
                        : pieLinked
                          ? `0 8px 22px rgba(0,0,0,0.2), 0 0 0 1px color-mix(in srgb, ${color} 28%, transparent)`
                          : "0 8px 20px rgba(0,0,0,0.18)",
              }}
              aria-hidden
            >
              {isImageBlob && imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local upload path
                <img
                  src={imageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              ) : null}
            </span>
            {/* Exterior spots hide while dragging / extracting; reshuffle on settle. */}
            {!isImageBlob &&
            !isNoteBlob &&
            !isDragging &&
            state !== "extracting" ? (
              <span
                className="focus-blob-satellites absolute inset-0 z-0"
                aria-hidden
              >
                {satellites.map((sat, si) => (
                  <span
                    key={`${slice.id}-sat-${si}-g${satGeneration[slice.id] ?? 0}`}
                    className="pointer-events-none absolute"
                    style={{
                      left: sat.left,
                      top: sat.top,
                      width: sat.size,
                      height: sat.size * (si % 3 === 1 ? 0.72 : 1),
                      opacity: sat.opacity,
                      borderRadius: sat.radius,
                      background: `color-mix(in srgb, ${color} ${
                        30 + si * 5
                      }%, transparent)`,
                      boxShadow:
                        sat.size >= 12
                          ? `0 0 ${Math.round(sat.size * 0.45)}px color-mix(in srgb, ${color} 28%, transparent)`
                          : undefined,
                      transform: "translate(-50%, -50%)",
                    }}
                  />
                ))}
              </span>
            ) : null}
            {isNoteBlob ? (
              <span className="relative z-[1] flex h-full w-full min-h-0 overflow-hidden rounded-[10px]">
                <NoteBlobFace
                  slice={displaySlice}
                  width={shell.w}
                  height={shell.h}
                  editing={isEditingNote}
                  draft={noteDraft}
                  onDraftChange={setNoteDraft}
                  onCancelEdit={cancelEditNote}
                  onSave={(value) => saveNoteContent(slice.id, value)}
                  onOpen={openNoteDetails}
                  iconSlot={noteIcon}
                />
              </span>
            ) : (
              <span
                className={cn(
                  "relative z-[1] max-w-[88%] px-2",
                  isImageBlob &&
                    "rounded bg-black/45 px-2 py-1 text-white backdrop-blur-sm",
                )}
              >
                {!isImageBlob && icon ? (
                  <span
                    className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-full border border-border/50 bg-panel/35 text-foreground/80"
                    style={{
                      color: `color-mix(in srgb, ${color} 55%, var(--foreground))`,
                    }}
                    aria-hidden
                  >
                    <PbIcon icon={icon} size={iconSize} />
                  </span>
                ) : null}
                <span
                  className={cn(
                    "block font-display font-semibold leading-snug",
                    isImageBlob ? "text-white" : "text-foreground",
                    d < 110
                      ? "text-xs"
                      : d < 160
                        ? "text-sm"
                        : d < 240
                          ? "text-base"
                          : "text-lg",
                  )}
                >
                  {slice.name}
                </span>
                {!isImageBlob ? (
                  <>
                    <span className="mt-1 block text-[11px] tabular-nums text-muted">
                      {slice.percentage}%
                      {slice.containedNodeCount > 0
                        ? ` · ${slice.containedNodeCount} nodes`
                        : ""}
                    </span>
                    {slice.hasChildren ? (
                      <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted/80">
                        drill in
                      </span>
                    ) : null}
                  </>
                ) : null}
              </span>
            )}
            {isImageBlob && !isDragging ? (
              <span
                role="slider"
                aria-label={`Resize ${slice.name}`}
                aria-valuemin={72}
                aria-valuemax={520}
                aria-valuenow={d}
                tabIndex={0}
                className="absolute bottom-1 right-1 z-20 h-4 w-4 cursor-se-resize rounded-sm border border-white/70 bg-black/50"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const startX = e.clientX;
                  const startY = e.clientY;
                  const startD = d;
                  const pointerId = e.pointerId;
                  const target = e.currentTarget;
                  target.setPointerCapture?.(pointerId);
                  const onMove = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return;
                    const delta = Math.max(
                      ev.clientX - startX,
                      ev.clientY - startY,
                    );
                    persistSize(slice.id, startD + delta);
                  };
                  const onUp = (ev: PointerEvent) => {
                    if (ev.pointerId !== pointerId) return;
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                    window.removeEventListener("pointercancel", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                  window.addEventListener("pointercancel", onUp);
                }}
              />
            ) : null}
            {isNoteBlob && !isDragging && !isEditingNote ? (
              <>
                <span
                  data-note-resize="e"
                  role="slider"
                  aria-label={`Resize width of ${slice.name}`}
                  aria-valuemin={120}
                  aria-valuemax={480}
                  aria-valuenow={shell.w}
                  tabIndex={0}
                  className="focus-note-resize focus-note-resize--e"
                  onPointerDown={(e) => beginNoteResize(e, "e")}
                />
                <span
                  data-note-resize="s"
                  role="slider"
                  aria-label={`Resize height of ${slice.name}`}
                  aria-valuemin={100}
                  aria-valuemax={560}
                  aria-valuenow={shell.h}
                  tabIndex={0}
                  className="focus-note-resize focus-note-resize--s"
                  onPointerDown={(e) => beginNoteResize(e, "s")}
                />
                <span
                  data-note-resize="se"
                  role="slider"
                  aria-label={`Resize ${slice.name}`}
                  aria-valuemin={120}
                  aria-valuemax={480}
                  aria-valuenow={shell.w}
                  tabIndex={0}
                  className="focus-note-resize focus-note-resize--se"
                  onPointerDown={(e) => beginNoteResize(e, "se")}
                />
              </>
            ) : null}
          </>
        );

        return isNoteBlob ? (
          <div key={slice.id} {...shellProps} role="button" tabIndex={0}>
            {shellInner}
          </div>
        ) : (
          <button key={slice.id} {...shellProps} type="button">
            {shellInner}
          </button>
        );
      })}

      {flashError ? (
        <div
          role="status"
          className="absolute bottom-3 left-1/2 z-40 -translate-x-1/2 rounded-[var(--radius)] border border-danger/40 bg-panel px-3 py-1.5 text-xs text-danger shadow-lg"
        >
          {flashError}
        </div>
      ) : null}

      {drag?.moved && dragPos ? (
        <div className="pointer-events-none absolute bottom-3 right-3 z-10 text-[10px] uppercase tracking-wide text-muted/70">
          {overExtract
            ? canExtract
              ? "Extract"
              : "Invalid"
            : overTargetId
              ? dropValid
                ? "Nest"
                : "Invalid nest"
              : "Reposition"}
        </div>
      ) : null}
    </div>
  );
}
