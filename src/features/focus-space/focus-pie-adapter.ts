import {
  balanceStatusFromDifference,
  directionLabelFromDifference,
  type BalanceFocusNode,
  type BalanceStatus,
} from "@/features/design-focus/balance-model";
import {
  imageUrlFromNodeContent,
  isImageNode,
} from "@/features/nodes/image-node";
import type { DesignFocus, NodeStatus, ProjectNode } from "@/types";

/** How the pie slice percentage was derived — UI stays source-agnostic. */
export type FocusPieWeightSource =
  | "actualWeight"
  | "nodeDistribution"
  | "subtreeMass"
  | "equal";

export type FocusPieStatusCounts = {
  ready: number;
  inProgress: number;
  draft: number;
  review: number;
  idea: number;
  total: number;
};

export type FocusPieSlice = {
  id: string;
  name: string;
  /** Share of the current level (0–100), sums ~100 across siblings. */
  percentage: number;
  weightSource: FocusPieWeightSource;
  containedNodeCount: number;
  statusCounts: FocusPieStatusCounts;
  hasChildren: boolean;
  /** Structure-only: node type for blob rendering / selection. */
  nodeType?: string;
  customTypeLabel?: string | null;
  /** Structure-only: note body text for note-like blobs. */
  content?: string | null;
  /** Public upload path when this slice is an image blob. */
  imageUrl?: string | null;
  balance: {
    actualWeight: number;
    targetWeight: number;
    status: BalanceStatus;
    directionLabel: string;
    difference: number;
    confidence: number;
  } | null;
};

export type FocusLevelSummary = {
  focusId: string | null;
  name: string;
  parentId: string | null;
  breadcrumb: { id: string | null; name: string }[];
  slices: FocusPieSlice[];
  totalContainedNodes: number;
  statusCounts: FocusPieStatusCounts;
  balanceStatus: BalanceStatus | null;
  balanceDirection: string | null;
  weightSource: FocusPieWeightSource;
};

type FocusRow = {
  id: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
  actualWeight: number;
  confidence: number;
  sortOrder?: number;
};

type AdapterInput = {
  projectName: string;
  /** Flat design-focus rows (from Prisma / getProject). */
  focuses: FocusRow[];
  nodes: Pick<ProjectNode, "id" | "designFocusId" | "status">[];
  /** Optional Phase 3 snapshot — preferred when present. */
  balanceRoots?: BalanceFocusNode[];
  /** Current focus id; null = project root level. */
  focusId: string | null;
};

function emptyStatusCounts(): FocusPieStatusCounts {
  return { ready: 0, inProgress: 0, draft: 0, review: 0, idea: 0, total: 0 };
}

function bumpStatus(counts: FocusPieStatusCounts, status: NodeStatus) {
  counts.total += 1;
  switch (status) {
    case "READY":
      counts.ready += 1;
      break;
    case "IN_PROGRESS":
      counts.inProgress += 1;
      break;
    case "DRAFT":
      counts.draft += 1;
      break;
    case "REVIEW":
      counts.review += 1;
      break;
    case "IDEA":
      counts.idea += 1;
      break;
  }
}

function mergeStatus(
  a: FocusPieStatusCounts,
  b: FocusPieStatusCounts,
): FocusPieStatusCounts {
  return {
    ready: a.ready + b.ready,
    inProgress: a.inProgress + b.inProgress,
    draft: a.draft + b.draft,
    review: a.review + b.review,
    idea: a.idea + b.idea,
    total: a.total + b.total,
  };
}

function normalizePercents(weights: number[]): number[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) {
    const n = weights.length;
    return n > 0 ? weights.map(() => Math.round(100 / n)) : [];
  }
  const raw = weights.map((w) => (w / total) * 100);
  const rounded = raw.map((w) => Math.round(w));
  // Fix rounding drift so slices sum to 100 when possible.
  const drift = 100 - rounded.reduce((a, b) => a + b, 0);
  if (drift !== 0 && rounded.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if ((rounded[i] ?? 0) > (rounded[maxIdx] ?? 0)) maxIdx = i;
    }
    rounded[maxIdx] = (rounded[maxIdx] ?? 0) + drift;
  }
  return rounded;
}

function findBalanceNode(
  roots: BalanceFocusNode[],
  id: string,
): BalanceFocusNode | null {
  const stack = [...roots];
  while (stack.length) {
    const n = stack.pop()!;
    if (n.id === id) return n;
    stack.push(...n.children);
  }
  return null;
}

function balanceChildrenAt(
  roots: BalanceFocusNode[],
  focusId: string | null,
): BalanceFocusNode[] | null {
  if (!roots.length) return null;
  if (focusId == null) return roots;
  const node = findBalanceNode(roots, focusId);
  return node ? node.children : null;
}

function buildDescendantMap(focuses: FocusRow[]): Map<string, Set<string>> {
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

function statusCountsForFocusIds(
  nodes: AdapterInput["nodes"],
  focusIds: Set<string>,
): FocusPieStatusCounts {
  const counts = emptyStatusCounts();
  for (const node of nodes) {
    if (!node.designFocusId || !focusIds.has(node.designFocusId)) continue;
    bumpStatus(counts, node.status);
  }
  return counts;
}

function pathToFocus(
  focuses: FocusRow[],
  projectName: string,
  focusId: string | null,
): { id: string | null; name: string }[] {
  const byId = new Map(focuses.map((f) => [f.id, f]));
  const crumb: { id: string | null; name: string }[] = [
    { id: null, name: projectName },
  ];
  if (!focusId) return crumb;

  const chain: FocusRow[] = [];
  let cur: FocusRow | undefined = byId.get(focusId);
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  chain.reverse();
  for (const f of chain) {
    crumb.push({ id: f.id, name: f.name });
  }
  return crumb;
}

/**
 * Structural + content mass for a sibling when balance weights are unavailable.
 * Counts every focus in the subtree (self included) plus linked project nodes.
 * Empty nested children still add mass — a nest of 3 empty blobs outweighs a leaf.
 */
function contentMassForFocus(
  focusId: string,
  descendants: Map<string, Set<string>>,
  containedNodeCount: number,
): number {
  const focusCount = descendants.get(focusId)?.size ?? 1;
  return Math.max(1, focusCount + Math.max(0, containedNodeCount));
}

/**
 * Build pie / blob composition for the **current focus level only**.
 *
 * Weight priority (adapter boundary — UI never chooses the source):
 * 1. Phase 3 `actualWeight` among siblings when any sibling has weight > 0
 * 2. Else subtree/content mass (descendant focuses + linked nodes) among siblings
 * 3. Equal split only when every sibling has the same mass
 *
 * Later: step 1 can become the sole source without changing pie/blob components.
 */
export function buildFocusLevelSummary(input: AdapterInput): FocusLevelSummary {
  const { projectName, focuses, nodes, balanceRoots, focusId } = input;
  const breadcrumb = pathToFocus(focuses, projectName, focusId);
  const descendants = buildDescendantMap(focuses);

  const byParent = new Map<string | null, FocusRow[]>();
  for (const f of focuses) {
    const list = byParent.get(f.parentId) ?? [];
    list.push(f);
    byParent.set(f.parentId, list);
  }
  for (const [, list] of byParent) {
    list.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );
  }

  const childRows = byParent.get(focusId) ?? [];
  const balanceKids = balanceRoots
    ? balanceChildrenAt(balanceRoots, focusId)
    : null;

  const currentFocus = focusId
    ? focuses.find((f) => f.id === focusId) ?? null
    : null;
  const currentName = currentFocus?.name ?? projectName;

  // Contained nodes for the current level (this focus + descendants, or whole project at root).
  const currentFocusIds =
    focusId == null
      ? new Set(focuses.map((f) => f.id))
      : (descendants.get(focusId) ?? new Set([focusId]));
  const levelStatus = statusCountsForFocusIds(nodes, currentFocusIds);

  // Also count nodes with no designFocusId when at project root.
  if (focusId == null) {
    for (const node of nodes) {
      if (!node.designFocusId) bumpStatus(levelStatus, node.status);
    }
  }

  if (childRows.length === 0) {
    const bal =
      focusId && balanceRoots
        ? findBalanceNode(balanceRoots, focusId)
        : null;
    return {
      focusId,
      name: currentName,
      parentId: currentFocus?.parentId ?? null,
      breadcrumb,
      slices: [],
      totalContainedNodes: levelStatus.total,
      statusCounts: levelStatus,
      balanceStatus: bal?.status ?? null,
      balanceDirection: bal?.directionLabel ?? null,
      weightSource: "equal",
    };
  }

  const childMeta = childRows.map((row) => {
    const bal = balanceKids?.find((b) => b.id === row.id) ?? null;
    const focusIds = descendants.get(row.id) ?? new Set([row.id]);
    const statusCounts = statusCountsForFocusIds(nodes, focusIds);
    const actual =
      bal?.actualWeight ??
      (typeof row.actualWeight === "number" ? row.actualWeight : 0);
    const target =
      bal?.normalizedTargetWeight ??
      (() => {
        const targetTotal = childRows.reduce(
          (a, s) => a + Math.max(0, s.targetImportance),
          0,
        );
        return targetTotal > 0
          ? Math.round((Math.max(0, row.targetImportance) / targetTotal) * 100)
          : Math.round(100 / childRows.length);
      })();
    const hasBalanceSignal =
      bal != null || childRows.some((c) => c.actualWeight > 0);
    const difference = bal?.difference ?? actual - target;
    const status: BalanceStatus =
      bal?.status ??
      (childRows.every((c) => (c.actualWeight ?? 0) <= 0)
        ? "neutral"
        : balanceStatusFromDifference(difference));
    const directionLabel =
      bal?.directionLabel ??
      (childRows.every((c) => (c.actualWeight ?? 0) <= 0)
        ? "no Ready data yet"
        : directionLabelFromDifference(difference));

    return {
      row,
      bal,
      statusCounts,
      actual,
      target,
      hasBalanceSignal,
      difference,
      status,
      directionLabel,
      hasChildren: (byParent.get(row.id)?.length ?? 0) > 0,
    };
  });

  const actualWeights = childMeta.map((c) => c.actual);
  const actualTotal = actualWeights.reduce((a, b) => a + b, 0);

  let weightSource: FocusPieWeightSource;
  let rawWeights: number[];
  if (actualTotal > 0) {
    weightSource = "actualWeight";
    rawWeights = actualWeights;
  } else {
    // Composition % (and blob size) from how “filled” each sibling is:
    // nested focus count + linked nodes — not a flat equal split.
    const massWeights = childMeta.map((c) =>
      contentMassForFocus(c.row.id, descendants, c.statusCounts.total),
    );
    const nodeTotal = childMeta.reduce((a, c) => a + c.statusCounts.total, 0);
    const hasNestedStructure = childMeta.some((c) => c.hasChildren);
    const allEqual =
      massWeights.length > 0 &&
      massWeights.every((w) => w === massWeights[0]);

    if (allEqual) {
      weightSource = "equal";
      rawWeights = childMeta.map(() => 1);
    } else if (nodeTotal > 0 && !hasNestedStructure) {
      // Pure node skew with no nesting — keep the familiar source label.
      weightSource = "nodeDistribution";
      rawWeights = massWeights;
    } else {
      weightSource = "subtreeMass";
      rawWeights = massWeights;
    }
  }

  const percentages = normalizePercents(rawWeights);

  const slices: FocusPieSlice[] = childMeta.map((c, i) => ({
    id: c.row.id,
    name: c.row.name,
    percentage: percentages[i] ?? 0,
    weightSource,
    containedNodeCount: c.statusCounts.total,
    statusCounts: c.statusCounts,
    hasChildren: c.hasChildren,
    balance: {
      actualWeight: c.actual,
      targetWeight: c.target,
      status: c.status,
      directionLabel: c.directionLabel,
      difference: Math.round(c.difference),
      confidence: c.bal?.confidence ?? c.row.confidence ?? 0,
    },
  }));

  const currentBal =
    focusId && balanceRoots
      ? findBalanceNode(balanceRoots, focusId)
      : null;

  return {
    focusId,
    name: currentName,
    parentId: currentFocus?.parentId ?? null,
    breadcrumb,
    slices,
    totalContainedNodes: levelStatus.total,
    statusCounts: levelStatus,
    balanceStatus: currentBal?.status ?? null,
    balanceDirection: currentBal?.directionLabel ?? null,
    weightSource,
  };
}

/** Narrow DesignFocus[] / Prisma rows into adapter FocusRow shape. */
export function toFocusRows(
  focuses: (DesignFocus | FocusRow)[],
): FocusRow[] {
  return focuses.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId ?? null,
    targetImportance: f.targetImportance,
    actualWeight: f.actualWeight,
    confidence: f.confidence,
    sortOrder: f.sortOrder,
  }));
}

export function aggregateSliceStatus(
  slices: FocusPieSlice[],
): FocusPieStatusCounts {
  return slices.reduce(
    (acc, s) => mergeStatus(acc, s.statusCounts),
    emptyStatusCounts(),
  );
}

// ─── Project Structure (Node tree) ───────────────────────────────────────────

type StructureNodeRow = {
  id: string;
  name: string;
  parentId: string | null;
  status: NodeStatus;
  sortOrder?: number;
  type?: string;
  customTypeLabel?: string | null;
  content?: string | null;
  imageUrl?: string | null;
};

type StructureAdapterInput = {
  projectName: string;
  nodes: StructureNodeRow[];
  /** Current structure node id; null = project root (top-level areas). */
  nodeId: string | null;
};

function buildNodeDescendantMap(
  nodes: StructureNodeRow[],
): Map<string, Set<string>> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    const key = n.parentId ?? "__root__";
    const list = children.get(key) ?? [];
    list.push(n.id);
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

  for (const n of nodes) walk(n.id);
  return cache;
}

function statusCountsForNodeIds(
  nodes: StructureNodeRow[],
  nodeIds: Set<string>,
  /** When true, exclude the container id itself from counts (count descendants only). */
  excludeRootId?: string | null,
): FocusPieStatusCounts {
  const counts = emptyStatusCounts();
  for (const node of nodes) {
    if (!nodeIds.has(node.id)) continue;
    if (excludeRootId && node.id === excludeRootId) continue;
    bumpStatus(counts, node.status);
  }
  return counts;
}

function pathToNode(
  nodes: StructureNodeRow[],
  projectName: string,
  nodeId: string | null,
): { id: string | null; name: string }[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const crumb: { id: string | null; name: string }[] = [
    { id: null, name: projectName },
  ];
  if (!nodeId) return crumb;

  const chain: StructureNodeRow[] = [];
  let cur: StructureNodeRow | undefined = byId.get(nodeId);
  while (cur) {
    chain.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  chain.reverse();
  for (const n of chain) {
    crumb.push({ id: n.id, name: n.name });
  }
  return crumb;
}

/**
 * Build pie / blob composition for the **current Project Structure level**.
 * Blobs = child Nodes. Sizing = descendant content mass — NOT targetImportance.
 */
export function buildStructureLevelSummary(
  input: StructureAdapterInput,
): FocusLevelSummary {
  const { projectName, nodes, nodeId } = input;
  const breadcrumb = pathToNode(nodes, projectName, nodeId);
  const descendants = buildNodeDescendantMap(nodes);

  const byParent = new Map<string | null, StructureNodeRow[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  for (const [, list] of byParent) {
    list.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
    );
  }

  const childRows = byParent.get(nodeId) ?? [];
  const currentNode = nodeId
    ? (nodes.find((n) => n.id === nodeId) ?? null)
    : null;
  const currentName = currentNode?.name ?? projectName;

  const currentNodeIds =
    nodeId == null
      ? new Set(nodes.map((n) => n.id))
      : (descendants.get(nodeId) ?? new Set([nodeId]));
  const levelStatus = statusCountsForNodeIds(
    nodes,
    currentNodeIds,
    nodeId,
  );

  if (childRows.length === 0) {
    return {
      focusId: nodeId,
      name: currentName,
      parentId: currentNode?.parentId ?? null,
      breadcrumb,
      slices: [],
      totalContainedNodes: levelStatus.total,
      statusCounts: levelStatus,
      balanceStatus: null,
      balanceDirection: null,
      weightSource: "equal",
    };
  }

  const childMeta = childRows.map((row) => {
    const focusIds = descendants.get(row.id) ?? new Set([row.id]);
    // Contained content under this child (exclude the child container itself).
    const statusCounts = statusCountsForNodeIds(nodes, focusIds, row.id);
    const hasChildren = (byParent.get(row.id)?.length ?? 0) > 0;
    // Mass: nested structure + contained content. Empty nest still counts.
    const subtreeSize = focusIds.size;
    const mass = Math.max(1, subtreeSize + statusCounts.total);
    return {
      row,
      statusCounts,
      hasChildren,
      mass,
    };
  });

  const massWeights = childMeta.map((c) => c.mass);
  const nodeTotal = childMeta.reduce((a, c) => a + c.statusCounts.total, 0);
  const hasNestedStructure = childMeta.some((c) => c.hasChildren);
  const allEqual =
    massWeights.length > 0 && massWeights.every((w) => w === massWeights[0]);

  let weightSource: FocusPieWeightSource;
  let rawWeights: number[];
  if (allEqual) {
    weightSource = "equal";
    rawWeights = childMeta.map(() => 1);
  } else if (nodeTotal > 0 && !hasNestedStructure) {
    weightSource = "nodeDistribution";
    rawWeights = massWeights;
  } else {
    weightSource = "subtreeMass";
    rawWeights = massWeights;
  }

  const percentages = normalizePercents(rawWeights);

  const slices: FocusPieSlice[] = childMeta.map((c, i) => ({
    id: c.row.id,
    name: c.row.name,
    percentage: percentages[i] ?? 0,
    weightSource,
    containedNodeCount: c.statusCounts.total,
    statusCounts: c.statusCounts,
    hasChildren: c.hasChildren,
    nodeType: c.row.type,
    customTypeLabel: c.row.customTypeLabel ?? null,
    content: c.row.content ?? null,
    imageUrl: c.row.imageUrl ?? null,
    balance: null,
  }));

  return {
    focusId: nodeId,
    name: currentName,
    parentId: currentNode?.parentId ?? null,
    breadcrumb,
    slices,
    totalContainedNodes: levelStatus.total,
    statusCounts: levelStatus,
    balanceStatus: null,
    balanceDirection: null,
    weightSource,
  };
}

/** Narrow ProjectNode rows into structure adapter input. */
export function toStructureRows(
  nodes: (Pick<
    ProjectNode,
    | "id"
    | "name"
    | "parentId"
    | "status"
    | "sortOrder"
    | "type"
    | "customTypeLabel"
    | "content"
  > & { imageUrl?: string | null })[],
): StructureNodeRow[] {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId ?? null,
    status: n.status,
    sortOrder: n.sortOrder,
    type: n.type,
    customTypeLabel: n.customTypeLabel ?? null,
    content: n.content ?? null,
    imageUrl:
      n.imageUrl ??
      (isImageNode(n) ? imageUrlFromNodeContent(n.content) : null),
  }));
}
