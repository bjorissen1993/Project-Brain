import { prisma } from "@/db/client";
import {
  balanceStatusFromDifference,
  directionLabelFromDifference,
  effectiveClassificationWeight,
  type BalanceFocusNode,
  type BalanceSnapshot,
  type BalanceStatus,
} from "./balance-model";

export type { BalanceFocusNode, BalanceSnapshot, BalanceStatus };
export { balanceStatusFromDifference, directionLabelFromDifference };

type FocusRow = {
  id: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
  sortOrder: number;
};

type ClassRow = {
  category: string;
  confidence: number | null;
  metadata: unknown;
  nodeId: string;
};

/** Optional creator content by node id — used to gate/scale fill contributions. */
export type NodeContentById = Map<string, string | null | undefined>;

function clampPercent(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function metaWeight(metadata: unknown): number {
  const meta = metadata as { weight?: number; status?: string } | null;
  if (meta?.status === "rejected") return 0;
  return typeof meta?.weight === "number" ? meta.weight : 0;
}

function metaRejected(metadata: unknown): boolean {
  return (metadata as { status?: string } | null)?.status === "rejected";
}

/**
 * Pure balance calculation. Targets need NOT sum to 100 — normalize among siblings.
 * Actuals roll up from Ready-node classification weights scaled by content fill
 * factor (empty/near-empty Ready stubs → 0). Each sibling group is compared
 * independently so a green parent can still have red children.
 *
 * Classifications on empty nodes are not deleted — they simply contribute 0
 * until the node has meaningful creator content.
 */
export function computeBalanceTree(
  focuses: FocusRow[],
  classifications: ClassRow[],
  nodeContentById: NodeContentById = new Map(),
): BalanceFocusNode[] {
  const byParent = new Map<string | null, FocusRow[]>();
  for (const f of focuses) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const [, list] of byParent) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  // Direct contributions per focus id (Ready classifications only; caller filters).
  const directRaw = new Map<string, number>();
  const directConfWeight = new Map<string, number>(); // sum(weight * confidence)
  const directWeightSum = new Map<string, number>();
  const contributingNodes = new Map<string, Set<string>>();

  for (const c of classifications) {
    if (metaRejected(c.metadata)) continue;
    const rawW = metaWeight(c.metadata);
    if (rawW <= 0) continue;
    // Gate by creator content — AI weight alone must not dump points into the pool.
    const w = effectiveClassificationWeight(
      rawW,
      nodeContentById.get(c.nodeId),
    );
    if (w <= 0) continue;
    directRaw.set(c.category, (directRaw.get(c.category) ?? 0) + w);
    const conf = typeof c.confidence === "number" ? c.confidence : 0;
    directConfWeight.set(
      c.category,
      (directConfWeight.get(c.category) ?? 0) + w * conf,
    );
    directWeightSum.set(
      c.category,
      (directWeightSum.get(c.category) ?? 0) + w,
    );
    const nodes = contributingNodes.get(c.category) ?? new Set();
    nodes.add(c.nodeId);
    contributingNodes.set(c.category, nodes);
  }

  // Descendant-inclusive raw: focus + all descendants.
  const childrenOf = (id: string): string[] =>
    (byParent.get(id) ?? []).map((c) => c.id);

  const descendantIds = (id: string): string[] => {
    const out: string[] = [];
    const stack = [...childrenOf(id)];
    while (stack.length) {
      const cur = stack.pop()!;
      out.push(cur);
      stack.push(...childrenOf(cur));
    }
    return out;
  };

  const rawInclusive = (id: string): number => {
    let sum = directRaw.get(id) ?? 0;
    for (const d of descendantIds(id)) {
      sum += directRaw.get(d) ?? 0;
    }
    return sum;
  };

  const confidenceInclusive = (id: string): number => {
    let confSum = directConfWeight.get(id) ?? 0;
    let wSum = directWeightSum.get(id) ?? 0;
    for (const d of descendantIds(id)) {
      confSum += directConfWeight.get(d) ?? 0;
      wSum += directWeightSum.get(d) ?? 0;
    }
    if (wSum <= 0) return 0;
    return clampPercent(confSum / wSum);
  };

  const nodeCountInclusive = (id: string): number => {
    const set = new Set<string>();
    for (const n of contributingNodes.get(id) ?? []) set.add(n);
    for (const d of descendantIds(id)) {
      for (const n of contributingNodes.get(d) ?? []) set.add(n);
    }
    return set.size;
  };

  const buildGroup = (parentId: string | null): BalanceFocusNode[] => {
    const siblings = byParent.get(parentId) ?? [];
    if (!siblings.length) return [];

    const raws = siblings.map((s) => rawInclusive(s.id));
    const rawTotal = raws.reduce((a, b) => a + b, 0);
    const targetTotal = siblings.reduce(
      (a, s) => a + Math.max(0, s.targetImportance),
      0,
    );

    return siblings.map((s, i) => {
      const raw = raws[i] ?? 0;
      const normalizedTarget =
        targetTotal > 0
          ? (Math.max(0, s.targetImportance) / targetTotal) * 100
          : siblings.length > 0
            ? 100 / siblings.length
            : 0;
      const actual =
        rawTotal > 0 ? (raw / rawTotal) * 100 : 0;
      const difference = actual - normalizedTarget;
      // No Ready data yet → neutral (not red for being under).
      const status: BalanceStatus =
        rawTotal <= 0 ? "neutral" : balanceStatusFromDifference(difference);

      return {
        id: s.id,
        name: s.name,
        parentId: s.parentId,
        targetImportance: s.targetImportance,
        normalizedTargetWeight: clampPercent(normalizedTarget),
        rawActualWeight: Math.round(raw),
        actualWeight: clampPercent(actual),
        confidence: confidenceInclusive(s.id),
        difference: Math.round(difference),
        status,
        directionLabel:
          rawTotal <= 0
            ? "no Ready content yet"
            : directionLabelFromDifference(difference),
        contributingNodeCount: nodeCountInclusive(s.id),
        children: buildGroup(s.id),
      };
    });
  };

  return buildGroup(null);
}

function flattenBalance(
  nodes: BalanceFocusNode[],
): BalanceFocusNode[] {
  const out: BalanceFocusNode[] = [];
  const walk = (list: BalanceFocusNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function summarizeBalance(roots: BalanceFocusNode[]) {
  const all = flattenBalance(roots);
  return {
    green: all.filter((n) => n.status === "green").length,
    orange: all.filter((n) => n.status === "orange").length,
    red: all.filter((n) => n.status === "red").length,
    neutral: all.filter((n) => n.status === "neutral").length,
  };
}

/**
 * Recalculate and persist DesignFocus.actualWeight + confidence for a project.
 * Pure code — no AI. Call after Ready analysis / classification corrections.
 */
export async function recalculateProjectBalance(
  projectId: string,
): Promise<BalanceSnapshot> {
  const [focuses, readyNodes] = await Promise.all([
    prisma.designFocus.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        parentId: true,
        targetImportance: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.node.findMany({
      where: { projectId, status: "READY" },
      select: { id: true, content: true },
    }),
  ]);

  const readyIds = readyNodes.map((n) => n.id);
  const nodeContentById: NodeContentById = new Map(
    readyNodes.map((n) => [n.id, n.content]),
  );
  const classifications =
    readyIds.length === 0
      ? []
      : await prisma.nodeClassification.findMany({
          where: { projectId, nodeId: { in: readyIds } },
          select: {
            category: true,
            confidence: true,
            metadata: true,
            nodeId: true,
          },
        });

  const roots = computeBalanceTree(focuses, classifications, nodeContentById);
  const flat = flattenBalance(roots);

  await prisma.$transaction(
    flat.map((f) =>
      prisma.designFocus.update({
        where: { id: f.id },
        data: {
          actualWeight: f.actualWeight,
          confidence: f.confidence,
        },
      }),
    ),
  );

  return {
    projectId,
    readyNodeCount: readyIds.length,
    classificationCount: classifications.filter((c) => !metaRejected(c.metadata))
      .length,
    roots,
    summary: summarizeBalance(roots),
  };
}

export async function getBalanceSnapshot(
  projectId: string,
): Promise<BalanceSnapshot> {
  // Always recompute from source classifications (authoritative); persist as side effect.
  return recalculateProjectBalance(projectId);
}

/** Previous vs current status map for Quick Reanalysis threshold detection. */
export function detectSignificantBalanceShifts(
  before: BalanceFocusNode[],
  after: BalanceFocusNode[],
): { focusId: string; name: string; from: BalanceStatus; to: BalanceStatus }[] {
  const beforeMap = new Map(
    flattenBalance(before).map((n) => [n.id, n] as const),
  );
  const shifts: {
    focusId: string;
    name: string;
    from: BalanceStatus;
    to: BalanceStatus;
  }[] = [];

  for (const n of flattenBalance(after)) {
    const prev = beforeMap.get(n.id);
    if (!prev) continue;
    if (prev.status === n.status) continue;
    const important =
      (prev.status === "orange" && n.status === "green") ||
      (prev.status === "red" && (n.status === "green" || n.status === "orange")) ||
      (prev.status === "green" && (n.status === "orange" || n.status === "red")) ||
      (prev.status === "orange" && n.status === "red");
    if (important) {
      shifts.push({
        focusId: n.id,
        name: n.name,
        from: prev.status,
        to: n.status,
      });
    }
  }
  return shifts;
}
