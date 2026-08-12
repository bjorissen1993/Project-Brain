"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { Link2, Minus, Plus, Trash2, ZoomIn } from "lucide-react";
import { useT } from "@/features/i18n";
import {
  createRelationAction,
  deleteRelationAction,
} from "@/features/relations/actions";
import { NODE_TYPE_OPTIONS } from "@/types";
import { cn } from "@/lib/utils";

type GraphNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  parentId: string | null;
};

type GraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  label: string | null;
};

type Camera = { x: number; y: number; scale: number };

/** Virtual hub id for the project center — not a real node. */
const PROJECT_HUB_ID = "__project_hub__";

const PAD = 80;
/** Clear space between node edges (world units). */
const NODE_CLEAR = 12;
/** Radial step when resolving collisions / stacking sub-orbits. */
const ORBIT_STEP = 36;
/** Minimum radial gap from a parent ring to its children's base ring. */
const DEPTH_RING_GAP = 88;
const HUB_R = 28;
const CHAR_W = 6.2;
const LABEL_CHARS_FULL = 16;
const LABEL_CHARS_MED = 10;
const LABEL_CHARS_SHORT = 5;
/** Arc length (world) required before a non-hover label may appear. */
const LABEL_MIN_ARC = 52;

type NodePos = {
  x: number;
  y: number;
  depth: number;
  angle: number;
  ringR: number;
  nodeR: number;
  sectorSpan: number;
  hasChildren: boolean;
  /** Angular gap to nearest same-depth neighbor (radians). */
  neighborGap: number;
  /** Layout parent id (hub or real node). */
  parentId: string | null;
};

type HierarchyEdge = {
  parentId: string;
  childId: string;
};

type PlacedCircle = { x: number; y: number; r: number };

function typeLabel(type: string) {
  return NODE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function abbreviateLabel(name: string, maxChars: number): string {
  if (name.length <= maxChars) return name;
  if (maxChars <= 1) return "…";
  return `${name.slice(0, maxChars - 1)}…`;
}

function nodeRadiusFor(
  depth: number,
  hasChildren: boolean,
  type: string,
): number {
  if (depth <= 0) return HUB_R;
  const folderBoost = type === "FOLDER" || hasChildren ? 1 : 0;
  const base = hasChildren ? 15 : 9;
  const depthShrink = Math.max(0, depth - 1) * 1.5;
  return Math.max(6, base + folderBoost * 3 - depthShrink);
}

function minAngleForChord(radius: number, chord: number): number {
  if (radius <= 1e-6) return Math.PI * 2;
  const half = Math.min(1, chord / (2 * radius));
  return 2 * Math.asin(half);
}

function circlesOverlap(
  a: PlacedCircle,
  b: PlacedCircle,
  clear: number,
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const min = a.r + b.r + clear;
  return dx * dx + dy * dy < min * min;
}

/**
 * Place a node on a ray from the hub. Grow radius (sub-orbits) until it clears
 * every already-placed circle — collision-aware packing for dense sectors.
 */
function placeOnRay(
  cx: number,
  cy: number,
  angle: number,
  nodeR: number,
  minR: number,
  placed: PlacedCircle[],
): { x: number; y: number; ringR: number } {
  let ringR = Math.max(minR, nodeR + HUB_R + NODE_CLEAR);
  const maxR = minR + ORBIT_STEP * 48;
  while (ringR <= maxR) {
    const x = cx + Math.cos(angle) * ringR;
    const y = cy + Math.sin(angle) * ringR;
    const cand: PlacedCircle = { x, y, r: nodeR };
    let hit = false;
    for (const p of placed) {
      if (circlesOverlap(cand, p, NODE_CLEAR)) {
        hit = true;
        break;
      }
    }
    if (!hit) return { x, y, ringR };
    ringR += ORBIT_STEP;
  }
  const x = cx + Math.cos(angle) * ringR;
  const y = cy + Math.sin(angle) * ringR;
  return { x, y, ringR };
}

/**
 * Pack siblings inside a parent sector onto one or more concentric orbits.
 * Keeps leaf-weighted angles (hierarchy sectors), then stacks onto outer
 * sub-rings whenever minimum angular separation cannot be met.
 */
function packSiblingGroup(
  kids: Array<{ id: string; nodeR: number; weight: number }>,
  a0: number,
  a1: number,
  baseR: number,
): Array<{ id: string; angle: number; ringR: number; nodeR: number }> {
  if (kids.length === 0) return [];
  const span = Math.max(1e-6, a1 - a0);
  const totalW = kids.reduce((s, k) => s + k.weight, 0) || 1;

  // Leaf-weighted preferred angles (stable hierarchy sectors).
  let cursor = a0;
  const preferred = kids.map((k) => {
    const wSpan = (span * k.weight) / totalW;
    const angle = cursor + wSpan / 2;
    cursor += wSpan;
    return { id: k.id, nodeR: k.nodeR, angle };
  });

  if (preferred.length === 1) {
    const k = preferred[0]!;
    return [{ id: k.id, angle: k.angle, ringR: baseR, nodeR: k.nodeR }];
  }

  // Grow base radius first so a full-circle (or wide) sector fits more on orbit 0.
  const maxNodeR = Math.max(...preferred.map((k) => k.nodeR));
  let ring0 = baseR;
  const chord0 = 2 * maxNodeR + NODE_CLEAR;
  let cap0 = Math.max(1, Math.floor(span / minAngleForChord(ring0, chord0)));
  while (cap0 < preferred.length && ring0 < baseR + ORBIT_STEP * 10) {
    ring0 += ORBIT_STEP;
    cap0 = Math.max(1, Math.floor(span / minAngleForChord(ring0, chord0)));
    if (cap0 * 8 >= preferred.length && ring0 >= baseR + ORBIT_STEP * 4) break;
  }

  const sorted = [...preferred].sort((a, b) => a.angle - b.angle);
  const orbitMembers: Array<Array<{ angle: number; nodeR: number }>> = [];
  const out: Array<{
    id: string;
    angle: number;
    ringR: number;
    nodeR: number;
  }> = [];

  function fitsOnOrbit(
    orbit: Array<{ angle: number; nodeR: number }>,
    angle: number,
    nodeR: number,
    R: number,
  ): boolean {
    for (const other of orbit) {
      const need = minAngleForChord(R, other.nodeR + nodeR + NODE_CLEAR);
      let d = Math.abs(other.angle - angle);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d < need) return false;
    }
    return true;
  }

  for (const k of sorted) {
    let orbitIdx = -1;
    for (let o = 0; o < orbitMembers.length; o++) {
      const R = ring0 + o * ORBIT_STEP;
      if (fitsOnOrbit(orbitMembers[o]!, k.angle, k.nodeR, R)) {
        orbitIdx = o;
        break;
      }
    }
    if (orbitIdx < 0) {
      orbitIdx = orbitMembers.length;
      orbitMembers.push([]);
    }
    orbitMembers[orbitIdx]!.push({ angle: k.angle, nodeR: k.nodeR });
    out.push({
      id: k.id,
      angle: k.angle,
      ringR: ring0 + orbitIdx * ORBIT_STEP,
      nodeR: k.nodeR,
    });
  }

  return out;
}

/**
 * Collision-aware radial tree: leaf-weighted sectors for hierarchy, then
 * sibling packing + ray collision resolve so nodes never overlap (200+ ok).
 */
function computeRadialLayout(nodes: GraphNode[], hubLabel: string) {
  const idSet = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, GraphNode[]>();
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  const roots: GraphNode[] = [];
  for (const n of nodes) {
    const parentVisible = n.parentId != null && idSet.has(n.parentId);
    if (!parentVisible) {
      roots.push(n);
      continue;
    }
    const list = childrenOf.get(n.parentId!) ?? [];
    list.push(n);
    childrenOf.set(n.parentId!, list);
  }

  const leafCountCache = new Map<string, number>();
  function leafCount(id: string): number {
    const cached = leafCountCache.get(id);
    if (cached != null) return cached;
    const kids = childrenOf.get(id) ?? [];
    const value =
      kids.length === 0 ? 1 : kids.reduce((sum, k) => sum + leafCount(k.id), 0);
    leafCountCache.set(id, value);
    return value;
  }

  const depthOf = new Map<string, number>();
  const sectorOf = new Map<string, { start: number; end: number; mid: number }>();

  const FULL = Math.PI * 2;
  const ORIGIN = -Math.PI / 2;

  function assignSectors(
    _parentId: string,
    kids: GraphNode[],
    depth: number,
    a0: number,
    a1: number,
  ) {
    // Reserve a floor share so tiny leaves still get a non-zero sector for
    // descendant layout; packing later enforces real clearance.
    const weights = kids.map((k) => Math.max(1, leafCount(k.id)));
    const total = weights.reduce((s, w) => s + w, 0) || 1;
    let cursor = a0;
    kids.forEach((k, i) => {
      const span = ((a1 - a0) * weights[i]!) / total;
      const start = cursor;
      const end = cursor + span;
      depthOf.set(k.id, depth);
      sectorOf.set(k.id, { start, end, mid: (start + end) / 2 });
      const grandKids = childrenOf.get(k.id) ?? [];
      if (grandKids.length) {
        assignSectors(k.id, grandKids, depth + 1, start, end);
      }
      cursor = end;
    });
  }

  if (roots.length) {
    assignSectors(PROJECT_HUB_ID, roots, 1, ORIGIN, ORIGIN + FULL);
  }

  let maxDepth = 0;
  for (const d of depthOf.values()) maxDepth = Math.max(maxDepth, d);

  const countAtDepth = new Map<number, number>();
  for (const d of depthOf.values()) {
    countAtDepth.set(d, (countAtDepth.get(d) ?? 0) + 1);
  }

  // Tentative base radius per depth from sibling density (full circle chord).
  const baseRing = new Map<number, number>();
  baseRing.set(0, 0);
  for (let d = 1; d <= maxDepth; d++) {
    const prev = baseRing.get(d - 1) ?? 0;
    const count = countAtDepth.get(d) ?? 1;
    const approxR = 10;
    const chord = 2 * approxR + NODE_CLEAR;
    const fromChord = (count * chord) / (2 * Math.PI);
    // Sibling-count boost: denser depths sit further out.
    const siblingBoost = Math.log2(1 + count) * 18;
    baseRing.set(
      d,
      Math.max(prev + DEPTH_RING_GAP + siblingBoost, fromChord, HUB_R + 48),
    );
  }

  // Pre-size canvas from a generous outer estimate (multi-orbit headroom).
  const estOuter =
    (baseRing.get(maxDepth) ?? DEPTH_RING_GAP) +
    ORBIT_STEP * Math.ceil(Math.log2(1 + (countAtDepth.get(maxDepth) ?? 1)));
  const extent = estOuter + HUB_R + 64;
  let width = Math.max(900, extent * 2 + PAD * 2);
  let height = Math.max(900, extent * 2 + PAD * 2);
  let cx = width / 2;
  let cy = height / 2;

  const positions = new Map<string, NodePos>();
  const hierarchyEdges: HierarchyEdge[] = [];
  const placed: PlacedCircle[] = [];
  const usedRings = new Set<number>();

  positions.set(PROJECT_HUB_ID, {
    x: cx,
    y: cy,
    depth: 0,
    angle: 0,
    ringR: 0,
    nodeR: HUB_R,
    sectorSpan: FULL,
    neighborGap: FULL,
    hasChildren: roots.length > 0,
    parentId: null,
  });
  placed.push({ x: cx, y: cy, r: HUB_R });

  /** Pack one parent's children, then recurse — depth-first keeps parents placed first. */
  function layoutChildren(parentId: string, kids: GraphNode[]) {
    if (!kids.length) return;
    const parentPos = positions.get(parentId);
    const parentDepth = parentPos?.depth ?? 0;
    const depth = parentDepth + 1;

    let a0: number;
    let a1: number;
    if (parentId === PROJECT_HUB_ID) {
      a0 = ORIGIN;
      a1 = ORIGIN + FULL;
    } else {
      const sec = sectorOf.get(parentId);
      a0 = sec?.start ?? ORIGIN;
      a1 = sec?.end ?? ORIGIN + FULL;
    }

    const parentR = parentPos?.ringR ?? 0;
    const parentNodeR = parentPos?.nodeR ?? HUB_R;
    const depthBase = baseRing.get(depth) ?? depth * DEPTH_RING_GAP;
    const minChildR = Math.max(
      depthBase,
      parentR + parentNodeR + 14 + NODE_CLEAR,
    );

    const packInput = kids.map((k) => {
      const grand = childrenOf.get(k.id) ?? [];
      const hasChildren = grand.length > 0;
      return {
        id: k.id,
        nodeR: nodeRadiusFor(depth, hasChildren, k.type),
        weight: leafCount(k.id),
      };
    });

    const packed = packSiblingGroup(packInput, a0, a1, minChildR);

    // Place in angular order so ray-resolve prefers earlier siblings inward.
    const ordered = [...packed].sort((a, b) => a.angle - b.angle);
    for (const slot of ordered) {
      const n = nodeById.get(slot.id);
      if (!n) continue;
      const sector = sectorOf.get(slot.id);
      const kidsOfN = childrenOf.get(slot.id) ?? [];
      const hasChildren = kidsOfN.length > 0;
      const nodeR = slot.nodeR;
      const placedPos = placeOnRay(
        cx,
        cy,
        slot.angle,
        nodeR,
        slot.ringR,
        placed,
      );
      usedRings.add(placedPos.ringR);
      positions.set(slot.id, {
        x: placedPos.x,
        y: placedPos.y,
        depth,
        angle: slot.angle,
        ringR: placedPos.ringR,
        nodeR,
        sectorSpan: sector ? sector.end - sector.start : (a1 - a0) / kids.length,
        neighborGap: 0,
        hasChildren,
        parentId,
      });
      placed.push({ x: placedPos.x, y: placedPos.y, r: nodeR });
      hierarchyEdges.push({ parentId, childId: slot.id });
    }

    for (const k of kids) {
      layoutChildren(k.id, childrenOf.get(k.id) ?? []);
    }
  }

  layoutChildren(PROJECT_HUB_ID, roots);

  // Neighbor angular gaps (same depth) for label LOD.
  const byDepth = new Map<number, string[]>();
  for (const [id, p] of positions) {
    if (id === PROJECT_HUB_ID) continue;
    const list = byDepth.get(p.depth) ?? [];
    list.push(id);
    byDepth.set(p.depth, list);
  }
  for (const ids of byDepth.values()) {
    ids.sort(
      (a, b) =>
        (positions.get(a)?.angle ?? 0) - (positions.get(b)?.angle ?? 0),
    );
    const m = ids.length;
    for (let i = 0; i < m; i++) {
      const id = ids[i]!;
      const p = positions.get(id)!;
      if (m === 1) {
        p.neighborGap = FULL;
        continue;
      }
      const prev = positions.get(ids[(i - 1 + m) % m]!)!;
      const next = positions.get(ids[(i + 1) % m]!)!;
      let dPrev = Math.abs(p.angle - prev.angle);
      let dNext = Math.abs(next.angle - p.angle);
      if (dPrev > Math.PI) dPrev = FULL - dPrev;
      if (dNext > Math.PI) dNext = FULL - dNext;
      p.neighborGap = Math.min(dPrev, dNext);
    }
  }

  // Expand canvas if collision stacking pushed nodes past the estimate.
  let maxR = 0;
  for (const p of positions.values()) {
    maxR = Math.max(maxR, p.ringR + p.nodeR);
  }
  const need = maxR + PAD + 40;
  const size = Math.max(900, need * 2);
  if (size > width || size > height) {
    const dx = (size - width) / 2;
    const dy = (size - height) / 2;
    width = size;
    height = size;
    cx = width / 2;
    cy = height / 2;
    for (const p of positions.values()) {
      p.x += dx;
      p.y += dy;
    }
    for (const c of placed) {
      c.x += dx;
      c.y += dy;
    }
  }

  // Guide rings: quantize so collision sub-orbits don't draw hundreds of circles.
  const rings = [
    ...new Set(
      [...usedRings]
        .filter((r) => r > 0)
        .map((r) => Math.round(r / ORBIT_STEP) * ORBIT_STEP),
    ),
  ].sort((a, b) => a - b);

  return {
    width,
    height,
    cx,
    cy,
    positions,
    hierarchyEdges,
    rings,
    hubLabel,
  };
}

function labelAnchor(angle: number): "start" | "middle" | "end" {
  const c = Math.cos(angle);
  if (c > 0.4) return "start";
  if (c < -0.4) return "end";
  return "middle";
}

function maxLabelCharsForSlot(
  ringR: number,
  neighborGap: number,
  scale: number,
): number {
  const arc = Math.max(4, ringR * neighborGap * scale);
  const fromArc = Math.floor(arc / (CHAR_W * 0.9));
  if (scale >= 1) return Math.min(LABEL_CHARS_FULL, Math.max(3, fromArc));
  if (scale >= 0.7) return Math.min(LABEL_CHARS_MED, Math.max(3, fromArc));
  return Math.min(LABEL_CHARS_SHORT, Math.max(2, fromArc));
}

/** Whether a non-emphasized label has enough clear arc to avoid stacking. */
function labelFitsSlot(
  ringR: number,
  neighborGap: number,
  scale: number,
  depth: number,
): boolean {
  const arc = ringR * neighborGap;
  const need =
    depth <= 1 ? LABEL_MIN_ARC : depth === 2 ? LABEL_MIN_ARC * 1.25 : LABEL_MIN_ARC * 1.6;
  return arc * scale >= need;
}

export function GraphView({
  projectId,
  projectName,
  nodes,
  relations: initialRelations,
}: {
  projectId: string;
  projectName: string;
  nodes: GraphNode[];
  relations: GraphEdge[];
}) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [relations, setRelations] = useState(initialRelations);
  const [relationsBase, setRelationsBase] = useState(initialRelations);
  if (initialRelations !== relationsBase) {
    setRelationsBase(initialRelations);
    setRelations(initialRelations);
  }
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [linkTool, setLinkTool] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, scale: 1 });
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const typesInGraph = useMemo(() => {
    const set = new Set(nodes.map((n) => n.type));
    return NODE_TYPE_OPTIONS.filter((o) => set.has(o.value));
  }, [nodes]);

  const visibleNodes = useMemo(() => {
    if (typeFilter === "all") return nodes;
    return nodes.filter((n) => n.type === typeFilter);
  }, [nodes, typeFilter]);

  const visibleIds = useMemo(
    () => new Set(visibleNodes.map((n) => n.id)),
    [visibleNodes],
  );

  const visibleRelations = useMemo(
    () =>
      relations.filter(
        (r) => visibleIds.has(r.sourceNodeId) && visibleIds.has(r.targetNodeId),
      ),
    [relations, visibleIds],
  );

  const layout = useMemo(
    () => computeRadialLayout(visibleNodes, projectName || t("graph.hubLabel")),
    [visibleNodes, projectName, t],
  );

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const related = selected
    ? relations.filter(
        (r) =>
          r.sourceNodeId === selected.id || r.targetNodeId === selected.id,
      )
    : [];

  const fitView = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { clientWidth: vw, clientHeight: vh } = el;
    if (vw < 40 || vh < 40) return;
    const pad = 40;
    const sx = (vw - pad * 2) / layout.width;
    const sy = (vh - pad * 2) / layout.height;
    const scale = Math.min(1.35, Math.max(0.1, Math.min(sx, sy)));
    setCamera({
      scale,
      x: (vw - layout.width * scale) / 2,
      y: (vh - layout.height * scale) / 2,
    });
  }, [layout.width, layout.height]);

  useEffect(() => {
    const id = window.setTimeout(fitView, 0);
    return () => window.clearTimeout(id);
  }, [fitView, typeFilter]);

  function zoomBy(factor: number, cx?: number, cy?: number) {
    const el = viewportRef.current;
    const pivotX = cx ?? (el ? el.clientWidth / 2 : 0);
    const pivotY = cy ?? (el ? el.clientHeight / 2 : 0);
    setCamera((prev) => {
      const nextScale = Math.min(2.8, Math.max(0.08, prev.scale * factor));
      const wx = (pivotX - prev.x) / prev.scale;
      const wy = (pivotY - prev.y) / prev.scale;
      return {
        scale: nextScale,
        x: pivotX - wx * nextScale,
        y: pivotY - wy * nextScale,
      };
    });
  }

  function onWheel(e: ReactWheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    zoomBy(factor, cx, cy);
  }

  function onViewportPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    if ((e.target as HTMLElement).closest("[data-graph-node]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: camera.x,
      originY: camera.y,
    };
  }

  function onViewportPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== e.pointerId) return;
    setCamera((prev) => ({
      ...prev,
      x: pan.originX + (e.clientX - pan.startX),
      y: pan.originY + (e.clientY - pan.startY),
    }));
  }

  function onViewportPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  }

  function cancelLinkTool() {
    setLinkTool(false);
    setLinkSourceId(null);
  }

  function onNodeClick(id: string) {
    if (!linkTool) {
      setSelectedId(id);
      return;
    }
    if (!linkSourceId) {
      setLinkSourceId(id);
      setSelectedId(id);
      setFlash(t("graph.nowTarget"));
      return;
    }
    if (linkSourceId === id) {
      setFlash(t("graph.differentTarget"));
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
        setFlash(result.error);
        return;
      }
      setRelations((prev) => [
        ...prev,
        {
          id: result.relation.id,
          sourceNodeId: result.relation.sourceNodeId,
          targetNodeId: result.relation.targetNodeId,
          type: result.relation.type,
          label: result.relation.label,
        },
      ]);
      setSelectedId(id);
      setFlash(t("graph.linkCreated"));
      router.refresh();
    });
  }

  function removeRelation(relationId: string) {
    startTransition(async () => {
      const result = await deleteRelationAction(relationId);
      if (!result.ok) {
        setFlash(result.error);
        return;
      }
      setRelations((prev) => prev.filter((r) => r.id !== relationId));
      setFlash(t("graph.linkRemoved"));
      router.refresh();
    });
  }

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of nodes) m.set(n.id, n.name);
    return m;
  }, [nodes]);

  /** Paint order: base nodes first; hovered/selected/link-source last (on top). */
  const { baseNodes, topNodes } = useMemo(() => {
    const topOrder = [selectedId, linkSourceId, hoveredId].filter(
      (id): id is string => Boolean(id),
    );
    const topSet = new Set(topOrder);
    const byId = new Map(visibleNodes.map((n) => [n.id, n]));
    const topNodes = [...new Set(topOrder)]
      .map((id) => byId.get(id))
      .filter((n): n is GraphNode => Boolean(n));
    const baseNodes = visibleNodes.filter((n) => !topSet.has(n.id));
    return { baseNodes, topNodes };
  }, [visibleNodes, selectedId, linkSourceId, hoveredId]);

  const scale = camera.scale;

  function renderGraphNode(n: GraphNode) {
    const p = layout.positions.get(n.id);
    if (!p) return null;
    const active = n.id === selectedId;
    const hovered = n.id === hoveredId;
    const linkSource = linkSourceId === n.id;
    const emphasize = active || hovered || linkSource;
    const r = active || linkSource ? p.nodeR + 2.5 : p.nodeR;
    const hoverOnly = hovered && !active && !linkSource;

    let labelText: string | null = null;
    if (emphasize) {
      labelText = n.name;
    } else {
      // Strong LOD: hide most labels until zoom; never stack on dense arcs.
      const depthGate =
        p.depth <= 1
          ? 0.55
          : p.depth === 2
            ? 0.85
            : p.depth === 3
              ? 1.15
              : 1.5;
      const zoomOk = scale >= depthGate;
      const arcOk = labelFitsSlot(
        p.ringR,
        p.neighborGap,
        scale,
        p.depth,
      );
      if (zoomOk && arcOk) {
        const maxChars = maxLabelCharsForSlot(
          p.ringR,
          p.neighborGap,
          scale,
        );
        labelText = abbreviateLabel(n.name, maxChars);
      }
    }

    // Labels sit radially outward from the node (away from hub).
    const labelOffset = r + (emphasize ? 16 : 12);
    const lx = Math.cos(p.angle) * labelOffset;
    const ly = Math.sin(p.angle) * labelOffset;
    const anchor = labelAnchor(p.angle);
    const fontSize = emphasize ? 12 : scale >= 0.9 ? 10 : 8;

    return (
      <g
        key={n.id}
        data-graph-node
        transform={`translate(${p.x}, ${p.y})`}
        className="cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          onNodeClick(n.id);
        }}
        onPointerEnter={() => setHoveredId(n.id)}
        onPointerLeave={() =>
          setHoveredId((cur) => (cur === n.id ? null : cur))
        }
      >
        <title>{n.name}</title>
        {hoverOnly ? (
          <>
            <circle
              r={r + 10}
              fill="var(--nav)"
              className="graph-node-glow"
            />
            <circle
              r={r + 5}
              fill="none"
              stroke="var(--nav)"
              strokeWidth={1.25 / scale}
              className="graph-node-glow-ring"
            />
          </>
        ) : null}
        <circle
          r={r}
          fill={
            n.status === "READY"
              ? "var(--accent)"
              : active || linkSource
                ? "var(--nav)"
                : p.hasChildren || n.type === "FOLDER"
                  ? "var(--panel-elevated)"
                  : "var(--muted-bg)"
          }
          stroke={
            linkSource
              ? "var(--accent)"
              : active
                ? "var(--nav)"
                : hoverOnly
                  ? "color-mix(in srgb, var(--nav) 55%, transparent)"
                  : p.hasChildren || n.type === "FOLDER"
                    ? "var(--border-strong)"
                    : "var(--border)"
          }
          strokeWidth={
            linkSource || active ? 2.5 : hoverOnly ? 1.5 : 1.4
          }
        />
        {(p.hasChildren || n.type === "FOLDER") &&
        n.status !== "READY" &&
        !active &&
        !linkSource ? (
          <circle
            r={Math.max(2.5, r * 0.28)}
            fill="var(--muted)"
            opacity={0.55}
          />
        ) : null}
        {labelText ? (
          <text
            x={lx}
            y={ly}
            dy="0.35em"
            textAnchor={anchor}
            fill="var(--foreground)"
            fontSize={fontSize}
            fontWeight={emphasize || p.depth <= 1 ? 600 : 400}
            className="pointer-events-none"
            style={{
              paintOrder: "stroke",
              stroke: "var(--panel)",
              strokeWidth: 3.5,
              strokeLinejoin: "round",
            }}
          >
            {labelText}
          </text>
        ) : null}
      </g>
    );
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-3 overflow-x-clip px-3 py-4 sm:px-4 sm:py-5 lg:px-6">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display text-2xl sm:text-3xl">{t("nav.graph")}</h1>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {t("graph.intro")}{" "}
            <Link
              href={`/projects/${projectId}/canvas`}
              className="text-accent underline"
            >
              {t("graph.openCanvas")}
            </Link>{" "}
            {t("graph.openCanvasHint")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-muted">
            <span className="uppercase tracking-wide">{t("graph.typeFilter")}</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-[var(--radius)] border border-border bg-panel px-2 py-1.5 text-xs text-foreground outline-none focus:border-nav"
            >
              <option value="all">{t("graph.allTypes")}</option>
              {typesInGraph.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              if (linkTool) {
                cancelLinkTool();
                setFlash(null);
              } else {
                setLinkTool(true);
                setLinkSourceId(null);
                setFlash(t("graph.linkTool"));
              }
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-2.5 py-1.5 text-xs font-medium transition",
              linkTool
                ? "border-nav bg-nav-muted text-nav"
                : "border-border bg-panel text-muted hover:border-border-strong hover:text-foreground",
            )}
          >
            <Link2 size={14} strokeWidth={2} aria-hidden />
            {linkTool ? t("graph.cancelLink") : t("graph.link")}
          </button>
        </div>
      </div>

      {flash ? (
        <p className="shrink-0 text-xs text-nav" role="status">
          {flash}
        </p>
      ) : null}

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius)] border border-border bg-[radial-gradient(ellipse_at_center,var(--panel-elevated)_0%,var(--panel)_55%,var(--background)_100%)]">
        <div
          ref={viewportRef}
          className={cn(
            "absolute inset-0 touch-none",
            linkTool ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
          )}
          onWheel={onWheel}
          onPointerDown={onViewportPointerDown}
          onPointerMove={onViewportPointerMove}
          onPointerUp={onViewportPointerUp}
          onPointerCancel={onViewportPointerUp}
        >
          <svg
            width="100%"
            height="100%"
            className="block h-full w-full"
            role="img"
            aria-label={t("graph.aria")}
          >
            <g
              transform={`translate(${camera.x}, ${camera.y}) scale(${camera.scale})`}
            >
              {/* Concentric guide rings (incl. collision sub-orbits) */}
              {layout.rings.map((r, i) => (
                <circle
                  key={`ring-${i}-${r}`}
                  cx={layout.cx}
                  cy={layout.cy}
                  r={r}
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth={1 / scale}
                  opacity={0.28}
                />
              ))}

              {/* Hierarchy spokes */}
              {layout.hierarchyEdges.map((e) => {
                const a = layout.positions.get(e.parentId);
                const b = layout.positions.get(e.childId);
                if (!a || !b) return null;
                const active =
                  selectedId &&
                  (e.parentId === selectedId || e.childId === selectedId);
                return (
                  <line
                    key={`h-${e.parentId}-${e.childId}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={active ? "var(--accent)" : "var(--border-strong)"}
                    strokeWidth={
                      active ? 2 / scale : 1.35 / scale
                    }
                    opacity={active ? 0.95 : 0.7}
                  />
                );
              })}

              {/* Cross-links (relations) */}
              {visibleRelations.map((r) => {
                const a = layout.positions.get(r.sourceNodeId);
                const b = layout.positions.get(r.targetNodeId);
                if (!a || !b) return null;
                const active =
                  selectedId &&
                  (r.sourceNodeId === selectedId ||
                    r.targetNodeId === selectedId);
                return (
                  <line
                    key={r.id}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={active ? "var(--nav)" : "var(--purple)"}
                    strokeWidth={active ? 2 / scale : 1.1 / scale}
                    strokeDasharray={`${6 / scale} ${5 / scale}`}
                    opacity={active ? 0.95 : 0.45}
                  />
                );
              })}

              {/* Project hub */}
              {(() => {
                const hub = layout.positions.get(PROJECT_HUB_ID)!;
                const showHubLabel =
                  scale >= 0.25 || hoveredId === PROJECT_HUB_ID;
                return (
                  <g transform={`translate(${hub.x}, ${hub.y})`}>
                    <circle
                      r={hub.nodeR + 10}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={1.25 / scale}
                      opacity={0.35}
                    />
                    <circle
                      r={hub.nodeR}
                      fill="var(--panel-elevated)"
                      stroke="var(--accent)"
                      strokeWidth={2.5}
                    />
                    <circle
                      r={hub.nodeR * 0.38}
                      fill="var(--accent)"
                      opacity={0.9}
                    />
                    {showHubLabel ? (
                      <text
                        y={hub.nodeR + 18}
                        textAnchor="middle"
                        fill="var(--foreground)"
                        fontSize={scale >= 0.5 ? 13 : 11}
                        fontWeight={700}
                        className="pointer-events-none"
                        style={{
                          paintOrder: "stroke",
                          stroke: "var(--panel)",
                          strokeWidth: 4,
                          strokeLinejoin: "round",
                        }}
                      >
                        {abbreviateLabel(
                          layout.hubLabel,
                          scale >= 0.7 ? LABEL_CHARS_FULL : LABEL_CHARS_MED,
                        )}
                      </text>
                    ) : null}
                  </g>
                );
              })()}

              {/* Base nodes (edges already drawn above). Emphasized nodes paint last. */}
              {baseNodes.map(renderGraphNode)}
              {/* Hovered / selected / link-source: node + label above everything else */}
              {topNodes.map(renderGraphNode)}
            </g>
          </svg>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
          <div className="pointer-events-auto flex items-center gap-1 rounded-[var(--radius)] border border-border bg-panel-elevated/95 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => zoomBy(1.15)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-2px)] text-muted hover:bg-muted-bg hover:text-foreground"
              aria-label={t("graph.zoomIn")}
              title={t("graph.zoomIn")}
            >
              <Plus size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.15)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-2px)] text-muted hover:bg-muted-bg hover:text-foreground"
              aria-label={t("graph.zoomOut")}
              title={t("graph.zoomOut")}
            >
              <Minus size={16} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={fitView}
              className="inline-flex h-8 items-center gap-1 rounded-[calc(var(--radius)-2px)] px-2 text-xs font-medium text-muted hover:bg-muted-bg hover:text-foreground"
              aria-label={t("graph.fitAria")}
              title={t("graph.fit")}
            >
              <ZoomIn size={14} strokeWidth={2} aria-hidden />
              {t("graph.fit")}
            </button>
          </div>
          <p className="rounded-[var(--radius)] border border-border bg-panel-elevated/95 px-2 py-1 text-[10px] text-muted">
            {t("graph.hintControls")}
          </p>
        </div>
      </div>

      {selected ? (
        <div className="surface-card shrink-0 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{selected.name}</p>
              <p className="text-xs text-muted">
                {typeLabel(selected.type)} · {selected.status}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setLinkTool(true);
                  setLinkSourceId(selected.id);
                  setFlash(t("graph.nowTarget"));
                }}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-panel-elevated px-2.5 py-1 text-xs font-medium text-muted hover:border-nav hover:text-nav"
              >
                <Link2 size={13} strokeWidth={2} aria-hidden />
                {t("graph.linkFromHere")}
              </button>
              <Link
                href={`/projects/${projectId}/nodes/${selected.id}`}
                className="inline-flex items-center rounded-[var(--radius)] border border-border px-2.5 py-1 text-xs font-medium text-accent hover:border-accent"
              >
                {t("graph.openNode")}
              </Link>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            {t("graph.relationsCount", { count: related.length })}
          </p>
          <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto text-xs text-muted">
            {related.map((r) => {
              const otherId =
                r.sourceNodeId === selected.id
                  ? r.targetNodeId
                  : r.sourceNodeId;
              const dir = r.sourceNodeId === selected.id ? "→" : "←";
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-2 rounded border border-transparent px-1 py-0.5 hover:border-border hover:bg-muted-bg/40"
                >
                  <button
                    type="button"
                    className="min-w-0 truncate text-left hover:text-foreground"
                    onClick={() => setSelectedId(otherId)}
                  >
                    {dir} {nameById.get(otherId) ?? otherId.slice(0, 8)}
                    <span className="text-muted">
                      {" "}
                      · {r.type}
                      {r.label ? ` (${r.label})` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRelation(r.id)}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-danger/15 hover:text-danger"
                    aria-label={t("graph.removeRelation")}
                    title={t("graph.removeRelation")}
                  >
                    <Trash2 size={13} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="shrink-0 text-xs text-muted">
          {t("graph.inspectHint")}
          {linkTool ? t("graph.inspectHintLink") : "."}
        </p>
      )}
    </div>
  );
}
