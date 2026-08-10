/** Pure balance model — safe for client bundles (no Prisma / pg). */

/**
 * Design Focus fill only counts Ready classifications when the node has
 * meaningful creator content. Empty Ready stubs (and Idea nodes) contribute 0
 * even if AI already wrote classifications/summary — those rows are kept; they
 * simply do not fill the target pool until content exists.
 */
export const MIN_FILL_CONTENT_CHARS = 40;
/** Linear ramp from 0→1 between MIN and FULL; at/above FULL use full weight. */
export const FULL_FILL_CONTENT_CHARS = 160;

/** Trimmed creator content length used for fill (summary alone does not count). */
export function nodeFillContentLength(
  content: string | null | undefined,
): number {
  return (content ?? "").trim().length;
}

/**
 * 0 = ignore classification weight for fill; 1 = apply full metadata.weight.
 * Short placeholders between MIN and FULL are down-weighted linearly.
 */
export function contentFillFactor(
  content: string | null | undefined,
): number {
  const len = nodeFillContentLength(content);
  if (len < MIN_FILL_CONTENT_CHARS) return 0;
  if (len >= FULL_FILL_CONTENT_CHARS) return 1;
  return (len - MIN_FILL_CONTENT_CHARS) / (FULL_FILL_CONTENT_CHARS - MIN_FILL_CONTENT_CHARS);
}

/** Effective contribution points after content gating. */
export function effectiveClassificationWeight(
  metadataWeight: number,
  content: string | null | undefined,
): number {
  if (metadataWeight <= 0) return 0;
  return metadataWeight * contentFillFactor(content);
}

/** Balance status from absolute difference in percentage points (code, not AI). */
export type BalanceStatus = "green" | "orange" | "red" | "neutral";

export type BalanceFocusNode = {
  id: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
  /** Normalized target among siblings (0–100). */
  normalizedTargetWeight: number;
  /** Raw contribution weight from Ready classifications (pre-normalize). */
  rawActualWeight: number;
  /** Normalized actual among siblings (0–100). Persisted as DesignFocus.actualWeight. */
  actualWeight: number;
  /** Weighted-average classification confidence (0–100). Separate from balance color. */
  confidence: number;
  /** actualWeight - normalizedTargetWeight (percentage points). */
  difference: number;
  status: BalanceStatus;
  directionLabel: string;
  contributingNodeCount: number;
  children: BalanceFocusNode[];
};

export type BalanceSnapshot = {
  projectId: string;
  readyNodeCount: number;
  classificationCount: number;
  roots: BalanceFocusNode[];
  summary: {
    green: number;
    orange: number;
    red: number;
    neutral: number;
  };
};

export function balanceStatusFromDifference(differencePp: number): BalanceStatus {
  const abs = Math.abs(differencePp);
  if (abs <= 5) return "green";
  if (abs <= 10) return "orange";
  return "red";
}

export function directionLabelFromDifference(differencePp: number): string {
  const rounded = Math.round(differencePp);
  if (rounded === 0) return "on target";
  if (rounded > 0) return `+${rounded}% over target`;
  return `${rounded}% under target`;
}

export function flattenBalanceNodes(roots: BalanceFocusNode[]): BalanceFocusNode[] {
  const out: BalanceFocusNode[] = [];
  const walk = (nodes: BalanceFocusNode[]) => {
    for (const n of nodes) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(roots);
  return out;
}

/** Target pool + fill at one sibling level (e.g. roots: 60+70+90 → 220). */
export type TargetPoolSummary = {
  targetPool: number;
  actualFilled: number;
  /** 0–100+; may exceed 100 if over-contributed. */
  fillPercent: number;
  /** Points still needed to reach the pool (0 if at/over). */
  remaining: number;
  underfilled: boolean;
  overfilled: boolean;
  /** True when any focus has orange/red distribution status. */
  distributionWarning: boolean;
  worstStatus: BalanceStatus;
  redCount: number;
  orangeCount: number;
};

function worstOf(a: BalanceStatus, b: BalanceStatus): BalanceStatus {
  const rank: Record<BalanceStatus, number> = {
    neutral: 0,
    green: 1,
    orange: 2,
    red: 3,
  };
  return rank[b] > rank[a] ? b : a;
}

/**
 * Sum of sibling targetImportance = work-point pool.
 * Actual fill = sum of rawActualWeight (Ready classifications with meaningful
 * creator content, after contentFillFactor scaling).
 * Distribution quality reuses balance status (normalized share vs target share).
 */
export function summarizeTargetPool(roots: BalanceFocusNode[]): TargetPoolSummary {
  const targetPool = roots.reduce(
    (sum, n) => sum + Math.max(0, n.targetImportance),
    0,
  );
  const actualFilled = roots.reduce(
    (sum, n) => sum + Math.max(0, n.rawActualWeight),
    0,
  );
  const fillPercent =
    targetPool > 0 ? Math.round((actualFilled / targetPool) * 100) : 0;
  const remaining = Math.max(0, targetPool - actualFilled);
  const underfilled = targetPool > 0 && actualFilled < targetPool;
  const overfilled = targetPool > 0 && actualFilled > targetPool;

  const all = flattenBalanceNodes(roots);
  let worstStatus: BalanceStatus = "neutral";
  let redCount = 0;
  let orangeCount = 0;
  for (const n of all) {
    if (n.status === "red") redCount += 1;
    if (n.status === "orange") orangeCount += 1;
    worstStatus = worstOf(worstStatus, n.status);
  }

  return {
    targetPool,
    actualFilled,
    fillPercent,
    remaining,
    underfilled,
    overfilled,
    distributionWarning: redCount > 0 || orangeCount > 0,
    worstStatus,
    redCount,
    orangeCount,
  };
}
