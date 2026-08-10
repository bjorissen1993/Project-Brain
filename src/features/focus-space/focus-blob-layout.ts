/**
 * Organic spatial layout + session persistence for Focus Space blobs.
 * Positions are normalized (0–1) so they adapt to canvas size.
 */

export type NormPos = { nx: number; ny: number };

function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Visual size floor: every blob is at least as large as a 25% composition
 * slice under the same formula. Labels may still show smaller real %.
 */
export const MIN_BLOB_VISUAL_COMPOSITION_PCT = 25;

/** Extra px beyond radius so soft shadow / organic rim stays inside the canvas. */
const EDGE_MARGIN_PX = 10;

/**
 * Diameter from composition % — same share as pie/sidebar.
 * Primary size metric is linear with percentage (~1% steps):
 * e.g. 70% ≈ 70/30 ≈ 2.33× a 30% blob before clamps.
 * Crowded levels use a 25% visual floor so text stays readable; size still
 * grows above that floor with score. separateBlobPositions prevents overlap.
 */
export function blobDiameterPx(
  percentage: number,
  count: number,
  canvasShortSide: number,
): number {
  const short = Math.max(240, canvasShortSide);
  // Solo child: dominate the canvas so one focus does not look stranded.
  if (count === 1) {
    return Math.round(Math.min(460, Math.max(240, short * 0.78)));
  }

  const pct = Math.min(100, Math.max(0, percentage));
  // Floor: never render smaller than a 25%-composition blob.
  const sizingPct = Math.max(pct, MIN_BLOB_VISUAL_COMPOSITION_PCT);
  // Crowd factor shrinks the per-% scale when many siblings share the canvas.
  const crowd = count <= 2 ? 1 : count <= 4 ? 0.92 : count <= 7 ? 0.84 : 0.74;
  // Linear diameter: ~0.95% of short side per composition percentage point.
  const perPercent = short * 0.0095 * crowd;
  let diameter = perPercent * sizingPct;

  // Safety floor for tiny canvases; primary readability floor is 25% composition.
  const absoluteMin = 72;
  const absoluteMax =
    count <= 2 ? 400 : count <= 4 ? 340 : count <= 7 ? 300 : 248;

  diameter = Math.min(absoluteMax, Math.max(absoluteMin, diameter));
  return Math.round(diameter);
}

function clampNormAxis(n: number, pad: number) {
  if (pad >= 0.5) return 0.5;
  return Math.min(1 - pad, Math.max(pad, n));
}

/** Normalized inset so a blob of `diameterPx` (plus margin) stays fully visible. */
export function blobPadNorm(
  diameterPx: number,
  canvasW: number,
  canvasH: number,
  marginPx = EDGE_MARGIN_PX,
): { padNx: number; padNy: number } {
  return blobPadNormSize(diameterPx, diameterPx, canvasW, canvasH, marginPx);
}

/** Max pad across a set of slices — used by multi-blob separation. */
export function maxBlobPadNorm(
  slices: { percentage: number }[],
  canvasW: number,
  canvasH: number,
): { padNx: number; padNy: number } {
  const n = slices.length;
  if (n === 0 || canvasW <= 0 || canvasH <= 0) {
    return { padNx: 0.08, padNy: 0.08 };
  }
  const short = Math.min(canvasW, canvasH);
  let padNx = 0;
  let padNy = 0;
  for (const s of slices) {
    const d = blobDiameterPx(s.percentage, n, short);
    const p = blobPadNorm(d, canvasW, canvasH);
    padNx = Math.max(padNx, p.padNx);
    padNy = Math.max(padNy, p.padNy);
  }
  return { padNx, padNy };
}

export function clampBlobNorm(
  pos: NormPos,
  diameterPx: number,
  canvasW: number,
  canvasH: number,
  opts?: { padTop?: number },
): NormPos {
  return clampBlobNormSize(
    pos,
    diameterPx,
    diameterPx,
    canvasW,
    canvasH,
    opts,
  );
}

/** Minimum gap between blob edges (px) when resolving collisions. */
const DEFAULT_GAP_PX = 8;

/**
 * Iterative pairwise separation so resting blobs never overlap.
 * Works in normalized space using pixel radii + canvas size.
 */
export function separateBlobPositions(
  positions: Record<string, NormPos>,
  slices: { id: string; percentage: number }[],
  canvasW: number,
  canvasH: number,
  opts?: {
    iterations?: number;
    gapPx?: number;
    padNx?: number;
    padNy?: number;
  },
): Record<string, NormPos> {
  const n = slices.length;
  if (n <= 1 || canvasW <= 0 || canvasH <= 0) return { ...positions };

  const short = Math.min(canvasW, canvasH);
  const gap = opts?.gapPx ?? DEFAULT_GAP_PX;
  const autoPad = maxBlobPadNorm(slices, canvasW, canvasH);
  const padNx = opts?.padNx ?? autoPad.padNx;
  const padNy = opts?.padNy ?? autoPad.padNy;
  const iterations = opts?.iterations ?? Math.min(100, 28 + n * 10);

  const ids = slices.map((s) => s.id);
  const radii: Record<string, number> = {};
  for (const s of slices) {
    radii[s.id] = blobDiameterPx(s.percentage, n, short) * 0.5;
  }

  const pos: Record<string, NormPos> = {};
  for (const id of ids) {
    const p = positions[id] ?? { nx: 0.5, ny: 0.5 };
    pos[id] = { nx: p.nx, ny: p.ny };
  }

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = ids[i]!;
        const b = ids[j]!;
        const pa = pos[a]!;
        const pb = pos[b]!;
        const ax = pa.nx * canvasW;
        const ay = pa.ny * canvasH;
        const bx = pb.nx * canvasW;
        const by = pb.ny * canvasH;
        const minDist = radii[a]! + radii[b]! + gap;
        let dx = bx - ax;
        let dy = by - ay;
        let dist = Math.hypot(dx, dy);
        if (dist < 1e-4) {
          // Identical centers — nudge with a stable seed direction
          const seed = hashSeed(`${a}:${b}`);
          const angle = seed * Math.PI * 2;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1e-4;
        }
        if (dist >= minDist) continue;
        const overlap = (minDist - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        pa.nx = clampNormAxis(pa.nx - (ux * overlap) / canvasW, padNx);
        pa.ny = clampNormAxis(pa.ny - (uy * overlap) / canvasH, padNy);
        pb.nx = clampNormAxis(pb.nx + (ux * overlap) / canvasW, padNx);
        pb.ny = clampNormAxis(pb.ny + (uy * overlap) / canvasH, padNy);
        moved = true;
      }
    }
    if (!moved) break;
  }

  return pos;
}

/**
 * Nudge only `movedId` out of collisions. Sibling centers stay fixed.
 * Used after drag-drop so a free reposition never reflows the whole board.
 */
export function separateMovedBlob(
  positions: Record<string, NormPos>,
  movedId: string,
  slices: { id: string; percentage: number }[],
  canvasW: number,
  canvasH: number,
  opts?: { iterations?: number; gapPx?: number },
): Record<string, NormPos> {
  const n = slices.length;
  const out: Record<string, NormPos> = {};
  for (const s of slices) {
    const p = positions[s.id] ?? { nx: 0.5, ny: 0.5 };
    out[s.id] = { nx: p.nx, ny: p.ny };
  }
  if (n <= 1 || canvasW <= 0 || canvasH <= 0 || !out[movedId]) return out;

  const short = Math.min(canvasW, canvasH);
  const gap = opts?.gapPx ?? DEFAULT_GAP_PX;
  const iterations = opts?.iterations ?? Math.min(80, 24 + n * 8);
  const movedSlice = slices.find((s) => s.id === movedId);
  if (!movedSlice) return out;

  const movedDiameter = blobDiameterPx(movedSlice.percentage, n, short);
  const movedR = movedDiameter * 0.5;

  for (let iter = 0; iter < iterations; iter++) {
    let pushed = false;
    const pm = out[movedId]!;
    let mx = pm.nx * canvasW;
    let my = pm.ny * canvasH;

    for (const s of slices) {
      if (s.id === movedId) continue;
      const other = out[s.id];
      if (!other) continue;
      const or = blobDiameterPx(s.percentage, n, short) * 0.5;
      const ox = other.nx * canvasW;
      const oy = other.ny * canvasH;
      const minDist = movedR + or + gap;
      let dx = mx - ox;
      let dy = my - oy;
      let dist = Math.hypot(dx, dy);
      if (dist < 1e-4) {
        const seed = hashSeed(`${movedId}:${s.id}`);
        const angle = seed * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        dist = 1e-4;
      }
      if (dist >= minDist) continue;
      const push = minDist - dist;
      const ux = dx / dist;
      const uy = dy / dist;
      mx += ux * push;
      my += uy * push;
      pushed = true;
    }

    out[movedId] = clampBlobNorm(
      { nx: mx / canvasW, ny: my / canvasH },
      movedDiameter,
      canvasW,
      canvasH,
    );
    if (!pushed) break;
  }

  return out;
}

export function blobsOverlap(
  positions: Record<string, NormPos>,
  slices: { id: string; percentage: number }[],
  canvasW: number,
  canvasH: number,
  gapPx = DEFAULT_GAP_PX,
): boolean {
  const n = slices.length;
  if (n <= 1 || canvasW <= 0 || canvasH <= 0) return false;
  const short = Math.min(canvasW, canvasH);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = slices[i]!;
      const b = slices[j]!;
      const pa = positions[a.id];
      const pb = positions[b.id];
      if (!pa || !pb) continue;
      const ra = blobDiameterPx(a.percentage, n, short) * 0.5;
      const rb = blobDiameterPx(b.percentage, n, short) * 0.5;
      const dist = Math.hypot(
        (pa.nx - pb.nx) * canvasW,
        (pa.ny - pb.ny) * canvasH,
      );
      if (dist < ra + rb + gapPx - 0.5) return true;
    }
  }
  return false;
}

/**
 * Default organic placement across the canvas (not a tight center cluster).
 * Few nodes: loose pairing / triad. Many: sunflower spiral with jitter.
 * Always runs a separation pass so idle blobs do not overlap.
 */
export function defaultBlobPositions(
  slices: { id: string; percentage: number }[],
  canvasW = 640,
  canvasH = 420,
): Record<string, NormPos> {
  const n = slices.length;
  const out: Record<string, NormPos> = {};
  if (n === 0) return out;

  const { padNx, padNy } = maxBlobPadNorm(slices, canvasW, canvasH);

  if (n === 1) {
    out[slices[0]!.id] = { nx: 0.5, ny: 0.52 };
    return out;
  }

  if (n === 2) {
    out[slices[0]!.id] = { nx: 0.3, ny: 0.46 };
    out[slices[1]!.id] = { nx: 0.7, ny: 0.54 };
  } else if (n === 3) {
    out[slices[0]!.id] = { nx: 0.5, ny: Math.max(padNy, 0.28) };
    out[slices[1]!.id] = { nx: 0.26, ny: 0.62 };
    out[slices[2]!.id] = { nx: 0.74, ny: 0.64 };
  } else {
    // Vogel / golden-angle spiral — fills space organically
    const golden = Math.PI * (3 - Math.sqrt(5));
    // Keep spiral inside the visible pad so defaults never spawn clipped.
    const maxR = Math.min(n >= 7 ? 0.48 : 0.44, 0.5 - Math.max(padNx, padNy) - 0.02);
    for (let i = 0; i < n; i++) {
      const s = slices[i]!;
      const seed = hashSeed(s.id);
      const angle = i * golden + seed * 0.35;
      const t = (i + 0.6) / n;
      const r = Math.max(0.08, maxR) * Math.sqrt(t) * (0.88 + seed * 0.16);
      // Stretch horizontally so the canvas feels used
      let nx = 0.5 + Math.cos(angle) * r * 1.22;
      let ny = 0.5 + Math.sin(angle) * r * 0.96;
      nx = clampNormAxis(nx, padNx);
      ny = clampNormAxis(ny, padNy);
      out[s.id] = { nx, ny };
    }
  }

  return separateBlobPositions(out, slices, canvasW, canvasH, {
    iterations: Math.min(120, 36 + n * 12),
    padNx,
    padNy,
  });
}

function storageKey(projectId: string, levelFocusId: string | null) {
  return `pb:focus-blob-pos:v1:${projectId}:${levelFocusId ?? "root"}`;
}

export function loadBlobPositions(
  projectId: string,
  levelFocusId: string | null,
  sliceIds: string[],
): Record<string, NormPos> {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey(projectId, levelFocusId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, NormPos>;
    const idSet = new Set(sliceIds);
    const kept: Record<string, NormPos> = {};
    for (const [id, pos] of Object.entries(parsed)) {
      if (
        idSet.has(id) &&
        typeof pos?.nx === "number" &&
        typeof pos?.ny === "number"
      ) {
        // Soft clamp only — radius-aware inset is applied at render / settle.
        kept[id] = {
          nx: Math.min(0.98, Math.max(0.02, pos.nx)),
          ny: Math.min(0.98, Math.max(0.02, pos.ny)),
        };
      }
    }
    return kept;
  } catch {
    return {};
  }
}

export function saveBlobPositions(
  projectId: string,
  levelFocusId: string | null,
  positions: Record<string, NormPos>,
) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      storageKey(projectId, levelFocusId),
      JSON.stringify(positions),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/** Drop ids from a level's persisted map without reshuffling survivors. */
export function removeBlobPositions(
  projectId: string,
  levelFocusId: string | null,
  idsToRemove: string[],
) {
  if (typeof window === "undefined" || idsToRemove.length === 0) return;
  try {
    const key = storageKey(projectId, levelFocusId);
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, NormPos>;
    let changed = false;
    for (const id of idsToRemove) {
      if (id in parsed) {
        delete parsed[id];
        changed = true;
      }
    }
    if (changed) {
      sessionStorage.setItem(key, JSON.stringify(parsed));
    }
  } catch {
    // ignore
  }
}

/** Manual size overrides — diameter (number) for image blobs; w×h for notes. */
export type BlobRectSize = { w: number; h: number };
export type BlobSizeValue = number | BlobRectSize;

function sizeStorageKey(projectId: string, levelFocusId: string | null) {
  return `pb:focus-blob-size:v1:${projectId}:${levelFocusId ?? "root"}`;
}

export function clampBlobDiameter(px: number): number {
  return Math.min(520, Math.max(72, Math.round(px)));
}

export function clampBlobRectSize(size: BlobRectSize): BlobRectSize {
  return {
    w: Math.min(480, Math.max(120, Math.round(size.w))),
    h: Math.min(560, Math.max(100, Math.round(size.h))),
  };
}

/** Sticky-note default from composition diameter — slightly taller than wide. */
export function defaultNoteRectPx(diameterPx: number): BlobRectSize {
  const d = clampBlobDiameter(diameterPx);
  return clampBlobRectSize({
    w: Math.round(d * 0.95),
    h: Math.round(d * 1.12),
  });
}

export function isBlobRectSize(value: unknown): value is BlobRectSize {
  if (!value || typeof value !== "object") return false;
  const v = value as BlobRectSize;
  return (
    typeof v.w === "number" &&
    Number.isFinite(v.w) &&
    typeof v.h === "number" &&
    Number.isFinite(v.h)
  );
}

function normalizeStoredSize(value: unknown): BlobSizeValue | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampBlobDiameter(value);
  }
  if (isBlobRectSize(value)) {
    return clampBlobRectSize(value);
  }
  return null;
}

/** Pad so a rectangular blob stays fully visible (sticky notes). */
export function blobPadNormSize(
  widthPx: number,
  heightPx: number,
  canvasW: number,
  canvasH: number,
  marginPx = EDGE_MARGIN_PX,
): { padNx: number; padNy: number } {
  const w = Math.max(1, canvasW);
  const h = Math.max(1, canvasH);
  return {
    padNx: Math.min(0.48, (widthPx * 0.5 + marginPx) / w),
    padNy: Math.min(0.48, (heightPx * 0.5 + marginPx) / h),
  };
}

export function clampBlobNormSize(
  pos: NormPos,
  widthPx: number,
  heightPx: number,
  canvasW: number,
  canvasH: number,
  opts?: { padTop?: number },
): NormPos {
  const { padNx, padNy } = blobPadNormSize(widthPx, heightPx, canvasW, canvasH);
  const padTop = opts?.padTop ?? padNy;
  return {
    nx: clampNormAxis(pos.nx, padNx),
    ny: Math.min(1 - padNy, Math.max(padTop, pos.ny)),
  };
}

export function loadBlobSizes(
  projectId: string,
  levelFocusId: string | null,
  sliceIds: string[],
): Record<string, BlobSizeValue> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(sizeStorageKey(projectId, levelFocusId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const idSet = new Set(sliceIds);
    const kept: Record<string, BlobSizeValue> = {};
    for (const [id, size] of Object.entries(parsed)) {
      if (!idSet.has(id)) continue;
      const normalized = normalizeStoredSize(size);
      if (normalized != null) kept[id] = normalized;
    }
    return kept;
  } catch {
    return {};
  }
}

export function saveBlobSizes(
  projectId: string,
  levelFocusId: string | null,
  sizes: Record<string, BlobSizeValue>,
) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      sizeStorageKey(projectId, levelFocusId),
      JSON.stringify(sizes),
    );
  } catch {
    // quota / private mode — ignore
  }
}

/** Build descendant id sets for reparent validation (client-side). */
export function buildFocusDescendantMap(
  focuses: { id: string; parentId?: string | null }[],
): Map<string, Set<string>> {
  const children = new Map<string, string[]>();
  for (const f of focuses) {
    const key = f.parentId ?? "__root__";
    const list = children.get(key) ?? [];
    list.push(f.id);
    children.set(key, list);
  }
  const cache = new Map<string, Set<string>>();
  const walk = (id: string): Set<string> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const set = new Set<string>([id]);
    for (const child of children.get(id) ?? []) {
      for (const d of walk(child)) set.add(d);
    }
    cache.set(id, set);
    return set;
  };
  for (const f of focuses) walk(f.id);
  return cache;
}

export function canNestFocus(
  draggedId: string,
  targetId: string,
  descendants: Map<string, Set<string>>,
): boolean {
  if (draggedId === targetId) return false;
  const desc = descendants.get(draggedId);
  if (desc?.has(targetId)) return false;
  return true;
}
