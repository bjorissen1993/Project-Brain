/**
 * Stable Focus Space blob / pie colors keyed by focus id.
 * Defaults are hash-based; optional per-project overrides live in localStorage.
 */

/** Hex palette — stable across themes; works with color-mix and input[type=color]. */
export const FOCUS_PALETTE = [
  "#0090e7",
  "#00d25b",
  "#8f5fe8",
  "#ffab00",
  "#fc424a",
  "#4dc3ff",
  "#3dd68c",
  "#b794f6",
  "#e879a9",
  "#f0a060",
] as const;

export const FOCUS_COLOR_SWATCHES = FOCUS_PALETTE;

const STORAGE_PREFIX = "pb:focus-colors:";

function hashFocusId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Round percent values so SSR and client emit identical style strings. */
function pct(n: number, digits = 4): string {
  return n.toFixed(digits);
}

/** Deterministic palette color from focus id (order-independent). */
export function defaultFocusColor(focusId: string): string {
  return FOCUS_PALETTE[hashSeedIndex(focusId, FOCUS_PALETTE.length)]!;
}

export function hashSeedIndex(id: string, modulo: number): number {
  if (modulo <= 0) return 0;
  return hashFocusId(id) % modulo;
}

export function resolveFocusColor(
  focusId: string,
  overrides?: Record<string, string> | null,
): string {
  const custom = overrides?.[focusId]?.trim();
  if (custom) return custom;
  return defaultFocusColor(focusId);
}

function normalizeHexColor(color: string): string {
  return color.trim().toLowerCase();
}

/**
 * Color for a newly created blob among siblings at the current level.
 * Prefers a random unused palette entry; if every palette color is already
 * taken, picks randomly among the least-used palette colors.
 */
export function pickUnusedFocusColor(usedColors: readonly string[]): string {
  return allocateUniqueFocusColors(usedColors, 1)[0]!;
}

/**
 * Allocate `count` distinct colors for a batch create.
 * Each pick is reserved before the next so siblings created together do not
 * collide on the same "first unused" / random unused color. When the palette
 * is exhausted, spreads across least-used colors within the batch.
 */
export function allocateUniqueFocusColors(
  existingColors: readonly string[],
  count: number,
): string[] {
  if (count <= 0) return [];

  const usedCounts = new Map<string, number>();
  for (const color of existingColors) {
    const key = normalizeHexColor(color);
    if (!key) continue;
    usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
  }

  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const unused = FOCUS_PALETTE.filter(
      (c) => !usedCounts.has(normalizeHexColor(c)),
    );
    let picked: string;
    if (unused.length > 0) {
      picked = unused[Math.floor(Math.random() * unused.length)]!;
    } else {
      let minCount = Infinity;
      const leastUsed: string[] = [];
      for (const c of FOCUS_PALETTE) {
        const n = usedCounts.get(normalizeHexColor(c)) ?? 0;
        if (n < minCount) {
          minCount = n;
          leastUsed.length = 0;
          leastUsed.push(c);
        } else if (n === minCount) {
          leastUsed.push(c);
        }
      }
      picked = leastUsed[Math.floor(Math.random() * leastUsed.length)]!;
    }
    out.push(picked);
    const key = normalizeHexColor(picked);
    usedCounts.set(key, (usedCounts.get(key) ?? 0) + 1);
  }
  return out;
}

/** Alias for batch allocation — same as `allocateUniqueFocusColors`. */
export function pickUnusedFocusColors(
  usedColors: readonly string[],
  count: number,
): string[] {
  return allocateUniqueFocusColors(usedColors, count);
}

export function loadFocusColorOverrides(
  projectId: string,
): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + projectId);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

export function saveFocusColorOverrides(
  projectId: string,
  overrides: Record<string, string>,
) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(overrides).length === 0) {
      localStorage.removeItem(STORAGE_PREFIX + projectId);
    } else {
      localStorage.setItem(STORAGE_PREFIX + projectId, JSON.stringify(overrides));
    }
  } catch {
    // ignore quota / private mode
  }
}

/** Default exterior spot count per blob (reduced for a cleaner orbit). */
export const IDLE_SATELLITE_COUNT = 4;

/**
 * Deterministic exterior satellite “vlekjes” — stable per focus id + generation
 * (SSR-safe). Bump `generation` after a drag settle to reshuffle positions.
 * Orbits hug the blob rim; sizes stay varied.
 */
export function idleSatelliteSpecs(
  focusId: string,
  count = IDLE_SATELLITE_COUNT,
  generation = 0,
) {
  const specs: {
    left: string;
    top: string;
    size: number;
    opacity: number;
    radius: string;
  }[] = [];
  const radii = [
    "60% 40% 55% 45%",
    "45% 55% 48% 52%",
    "50% 50% 42% 58%",
    "55% 45% 60% 40%",
    "42% 58% 50% 50%",
    "68% 32% 58% 42%",
  ];
  // Tight orbit just outside the blob body; hash keeps layout SSR-stable.
  for (let i = 0; i < count; i++) {
    const seed = hashFocusId(`${focusId}:sat:${i}:g${generation}`);
    const angle =
      ((seed % 360) / 360) * Math.PI * 2 +
      i * ((Math.PI * 2) / count) +
      generation * 0.85;
    const ring = (seed >>> 4) % 3; // 0 near-rim, 1 mid, 2 slightly out
    const dist =
      ring === 0 ? 48 + (seed % 8) : ring === 1 ? 56 + (seed % 10) : 64 + (seed % 12);
    const cx = 50 + Math.cos(angle) * (dist * 0.56);
    const cy = 50 + Math.sin(angle) * (dist * 0.56);
    // Mix of large gel drops and small specks
    const large = (seed >>> 12) % 5 === 0 || i % 3 === 0;
    const size = large ? 12 + (seed % 14) : 3 + (seed % 6);
    const opacity = large
      ? 0.34 + ((seed >>> 8) % 28) / 100
      : 0.22 + ((seed >>> 8) % 36) / 100;
    // Fixed decimals avoid SSR/client hydration mismatches on trig floats.
    specs.push({
      left: `${pct(Math.min(148, Math.max(-48, cx)))}%`,
      top: `${pct(Math.min(148, Math.max(-48, cy)))}%`,
      size,
      opacity: Math.round(opacity * 1000) / 1000,
      radius: radii[i % radii.length]!,
    });
  }
  return specs;
}
