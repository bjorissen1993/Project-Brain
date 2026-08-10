/**
 * Adaptive relation strength — pure scoring from stored data.
 * Never call OpenAI / network here; keep deterministic and render-safe.
 */

export const MIN_VISIBLE_RELATION = 25;
export const STRONG_RELATION_THRESHOLD = 60;
/** Idle Strong mode: keep at most this many edges when many qualify. */
export const STRONG_MODE_TOP_N = 8;
/** Hard cap on drawn edges for clutter/performance (10–15 blobs). */
export const MAX_VISIBLE_RELATIONS = 24;

export const RELATION_WEIGHTS = {
  explicit: 45,
  sharedClassification: 30,
  structural: 15,
  aiEvidence: 10,
} as const;

export type RelationMode = "off" | "focused" | "strong" | "all";

export type RelationSignalBreakdown = {
  explicit: number;
  sharedClassification: number;
  structural: number;
  aiEvidence: number;
};

export type ExplicitRelationInput = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  label?: string | null;
  metadata?: unknown;
};

export type ClassificationInput = {
  nodeId: string;
  category: string;
  confidence: number | null;
  metadata: unknown;
};

export type AiRelationEvidence = {
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  confidence: number;
  status: "pending" | "accepted" | "rejected";
};

export type StructureNodeInput = {
  id: string;
  parentId?: string | null;
  sortOrder?: number;
};

export type RelationNodeView = {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  /** Own + descendant node ids (for rollup). */
  memberIds: Set<string>;
  /** Aggregated Design Focus weight/confidence for shared-classification scoring. */
  focusProfile: Map<string, { weight: number; confidence: number }>;
};

export type ScoredRelation = {
  key: string;
  sourceId: string;
  targetId: string;
  strength: number;
  signals: RelationSignalBreakdown;
  /** True when an accepted NodeRelation contributes. */
  explicit: boolean;
  /** Directed when explicit edge exists; particles follow source→target. */
  directed: boolean;
  relationTypes: string[];
  labels: string[];
};

function clamp01to100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function weightFromMetadata(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const w = (metadata as { weight?: unknown }).weight;
  return typeof w === "number" && Number.isFinite(w) ? clamp01to100(w) : 0;
}

function classificationStatus(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "proposed";
  const s = (metadata as { status?: unknown }).status;
  return typeof s === "string" ? s : "proposed";
}

function metadataStrengthBoost(metadata: unknown): number {
  if (!metadata || typeof metadata !== "object") return 0;
  const m = metadata as { strength?: unknown; confidence?: unknown };
  if (typeof m.strength === "number" && Number.isFinite(m.strength)) {
    return (clamp01to100(m.strength) / 100) * 10;
  }
  if (typeof m.confidence === "number" && Number.isFinite(m.confidence)) {
    return (clamp01to100(m.confidence) / 100) * 6;
  }
  return 0;
}

/** Build descendant maps for rollup of leaf relations onto visible blobs. */
export function buildMemberMaps(
  nodes: StructureNodeInput[],
): Map<string, Set<string>> {
  const children = new Map<string | null, string[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    const list = children.get(key) ?? [];
    list.push(n.id);
    children.set(key, list);
  }

  const cache = new Map<string, Set<string>>();
  const collect = (id: string): Set<string> => {
    const hit = cache.get(id);
    if (hit) return hit;
    const set = new Set<string>([id]);
    for (const child of children.get(id) ?? []) {
      for (const x of collect(child)) set.add(x);
    }
    cache.set(id, set);
    return set;
  };

  for (const n of nodes) collect(n.id);
  return cache;
}

export function buildRelationNodeViews(opts: {
  visibleIds: string[];
  namesById: Map<string, string>;
  nodes: StructureNodeInput[];
  classifications: ClassificationInput[];
}): RelationNodeView[] {
  const memberMaps = buildMemberMaps(opts.nodes);
  const nodeById = new Map(opts.nodes.map((n) => [n.id, n]));

  return opts.visibleIds.map((id) => {
    const node = nodeById.get(id);
    const members = memberMaps.get(id) ?? new Set([id]);
    const focusProfile = new Map<
      string,
      { weight: number; confidence: number }
    >();

    for (const c of opts.classifications) {
      if (!members.has(c.nodeId)) continue;
      if (classificationStatus(c.metadata) === "rejected") continue;
      const weight = weightFromMetadata(c.metadata);
      if (weight <= 0) continue;
      const confidence = clamp01to100(c.confidence ?? 50);
      const prev = focusProfile.get(c.category) ?? {
        weight: 0,
        confidence: 0,
      };
      // Keep strongest contribution per focus (weight × confidence).
      const score = weight * (confidence / 100);
      const prevScore = prev.weight * (prev.confidence / 100);
      if (score >= prevScore) {
        focusProfile.set(c.category, { weight, confidence });
      }
    }

    return {
      id,
      name: opts.namesById.get(id) ?? id,
      parentId: node?.parentId ?? null,
      sortOrder: node?.sortOrder ?? 0,
      memberIds: members,
      focusProfile,
    };
  });
}

function scoreExplicit(
  a: RelationNodeView,
  b: RelationNodeView,
  relations: ExplicitRelationInput[],
): { score: number; types: string[]; labels: string[]; directedAB: boolean; directedBA: boolean } {
  let best = 0;
  const types: string[] = [];
  const labels: string[] = [];
  let directedAB = false;
  let directedBA = false;

  for (const rel of relations) {
    const aToB =
      a.memberIds.has(rel.sourceNodeId) && b.memberIds.has(rel.targetNodeId);
    const bToA =
      b.memberIds.has(rel.sourceNodeId) && a.memberIds.has(rel.targetNodeId);
    if (!aToB && !bToA) continue;

    // Base explicit presence + light type/metadata tuning (capped by weight).
    let score = 32;
    const t = rel.type.toLowerCase();
    if (t.includes("depends") || t.includes("requires") || t.includes("blocks")) {
      score += 8;
    } else if (t.includes("related") || t.includes("links") || t.includes("supports")) {
      score += 5;
    } else {
      score += 3;
    }
    score += metadataStrengthBoost(rel.metadata);
    score = Math.min(RELATION_WEIGHTS.explicit, score);

    if (score > best) best = score;
    if (!types.includes(rel.type)) types.push(rel.type);
    if (rel.label && !labels.includes(rel.label)) labels.push(rel.label);
    if (aToB) directedAB = true;
    if (bToA) directedBA = true;
  }

  return { score: best, types, labels, directedAB, directedBA };
}

function scoreSharedClassification(
  a: RelationNodeView,
  b: RelationNodeView,
): number {
  if (a.focusProfile.size === 0 || b.focusProfile.size === 0) return 0;

  let overlap = 0;
  let shared = 0;
  for (const [focusId, av] of a.focusProfile) {
    const bv = b.focusProfile.get(focusId);
    if (!bv) continue;
    shared += 1;
    const weightFactor = Math.min(av.weight, bv.weight) / 100;
    const confFactor = ((av.confidence + bv.confidence) / 2) / 100;
    overlap += weightFactor * confFactor;
  }
  if (shared === 0) return 0;

  // A few strong shared focuses approach the full band; extra weak overlaps taper.
  const normalized = Math.min(1.15, overlap / Math.max(1, Math.min(2, shared)));
  return Math.min(
    RELATION_WEIGHTS.sharedClassification,
    normalized * RELATION_WEIGHTS.sharedClassification,
  );
}

function scoreStructural(a: RelationNodeView, b: RelationNodeView): number {
  // Visible siblings share a parent at a Focus Space level.
  if (a.parentId !== b.parentId) {
    // Still allow a weak score if one is ancestor of the other (rare at same level).
    if (a.memberIds.has(b.id) || b.memberIds.has(a.id)) {
      return Math.min(RELATION_WEIGHTS.structural, 10);
    }
    return 4;
  }

  const orderGap = Math.abs(a.sortOrder - b.sortOrder);
  // Closer sortOrder → slightly stronger structural affinity.
  const proximity = orderGap <= 1 ? 1 : orderGap <= 3 ? 0.75 : 0.55;
  return Math.round(RELATION_WEIGHTS.structural * proximity * 10) / 10;
}

function scoreAiEvidence(
  a: RelationNodeView,
  b: RelationNodeView,
  evidence: AiRelationEvidence[],
): number {
  let best = 0;
  for (const ev of evidence) {
    if (ev.status === "rejected") continue;
    // Accepted suggestions usually become NodeRelation; still allow soft boost if present.
    const aToB =
      a.memberIds.has(ev.sourceNodeId) && b.memberIds.has(ev.targetNodeId);
    const bToA =
      b.memberIds.has(ev.sourceNodeId) && a.memberIds.has(ev.targetNodeId);
    if (!aToB && !bToA) continue;
    const conf = clamp01to100(ev.confidence) / 100;
    const statusFactor = ev.status === "accepted" ? 0.55 : 1;
    const score = conf * statusFactor * RELATION_WEIGHTS.aiEvidence;
    if (score > best) best = score;
  }
  return Math.min(RELATION_WEIGHTS.aiEvidence, best);
}

/**
 * Future AI semantic hook — embeddings / LLM similarity (0–100 contribution).
 * v1 returns 0; wire stored embedding scores here later without touching render.
 */
export function semanticRelationBoost(
  ..._nodes: [RelationNodeView, RelationNodeView]
): number {
  void _nodes;
  return 0;
}

/**
 * Modular strength calculator — call outside render hot paths when inputs change.
 * Returns normalized 0–100 with signal breakdown.
 */
export function calculateRelationStrength(
  nodeA: RelationNodeView,
  nodeB: RelationNodeView,
  opts: {
    relations: ExplicitRelationInput[];
    aiEvidence?: AiRelationEvidence[];
  },
): {
  strength: number;
  signals: RelationSignalBreakdown;
  explicit: boolean;
  directed: boolean;
  direction: "a-to-b" | "b-to-a" | "neutral";
  relationTypes: string[];
  labels: string[];
} {
  if (nodeA.id === nodeB.id) {
    return {
      strength: 0,
      signals: {
        explicit: 0,
        sharedClassification: 0,
        structural: 0,
        aiEvidence: 0,
      },
      explicit: false,
      directed: false,
      direction: "neutral",
      relationTypes: [],
      labels: [],
    };
  }

  const explicit = scoreExplicit(nodeA, nodeB, opts.relations);
  const sharedClassification = scoreSharedClassification(nodeA, nodeB);
  const structural = scoreStructural(nodeA, nodeB);
  const aiEvidence = scoreAiEvidence(
    nodeA,
    nodeB,
    opts.aiEvidence ?? [],
  );

  const signals: RelationSignalBreakdown = {
    explicit: Math.round(explicit.score * 10) / 10,
    sharedClassification: Math.round(sharedClassification * 10) / 10,
    structural: Math.round(structural * 10) / 10,
    aiEvidence: Math.round(aiEvidence * 10) / 10,
  };

  const strength = Math.round(
    clamp01to100(
      signals.explicit +
        signals.sharedClassification +
        signals.structural +
        signals.aiEvidence,
    ),
  );

  let direction: "a-to-b" | "b-to-a" | "neutral" = "neutral";
  if (explicit.directedAB && !explicit.directedBA) direction = "a-to-b";
  else if (explicit.directedBA && !explicit.directedAB) direction = "b-to-a";

  return {
    strength,
    signals,
    explicit: explicit.score > 0,
    directed: direction !== "neutral",
    direction,
    relationTypes: explicit.types,
    labels: explicit.labels,
  };
}

/** Score all unordered pairs among visible blobs. */
export function scoreVisibleRelations(opts: {
  views: RelationNodeView[];
  relations: ExplicitRelationInput[];
  aiEvidence?: AiRelationEvidence[];
}): ScoredRelation[] {
  const out: ScoredRelation[] = [];
  const { views } = opts;
  for (let i = 0; i < views.length; i++) {
    for (let j = i + 1; j < views.length; j++) {
      const a = views[i]!;
      const b = views[j]!;
      const scored = calculateRelationStrength(a, b, {
        relations: opts.relations,
        aiEvidence: opts.aiEvidence,
      });
      if (scored.strength < MIN_VISIBLE_RELATION) continue;

      const sourceId =
        scored.direction === "b-to-a" ? b.id : a.id;
      const targetId =
        scored.direction === "b-to-a" ? a.id : b.id;

      out.push({
        key: [a.id, b.id].sort().join("::"),
        sourceId,
        targetId,
        strength: scored.strength,
        signals: scored.signals,
        explicit: scored.explicit,
        directed: scored.directed,
        relationTypes: scored.relationTypes,
        labels: scored.labels,
      });
    }
  }
  return out.sort((x, y) => y.strength - x.strength || x.key.localeCompare(y.key));
}

/** Apply mode / clutter rules for what to draw. */
export function filterRelationsForMode(
  scored: ScoredRelation[],
  mode: RelationMode,
  focusId: string | null,
): ScoredRelation[] {
  if (mode === "off") return [];

  let list = scored.filter((r) => r.strength >= MIN_VISIBLE_RELATION);

  if (mode === "focused") {
    if (!focusId) return [];
    list = list.filter(
      (r) => r.sourceId === focusId || r.targetId === focusId,
    );
  } else if (mode === "strong") {
    const strong = list.filter((r) => r.strength >= STRONG_RELATION_THRESHOLD);
    list =
      strong.length > 0
        ? strong.slice(0, STRONG_MODE_TOP_N)
        : list.slice(0, Math.min(3, STRONG_MODE_TOP_N));
  }
  // "all" keeps everything above MIN_VISIBLE_RELATION

  return list.slice(0, MAX_VISIBLE_RELATIONS);
}

export function loadRelationMode(projectId: string): RelationMode {
  if (typeof window === "undefined") return "strong";
  try {
    const raw = sessionStorage.getItem(`pb:focus-rel-mode:v1:${projectId}`);
    if (raw === "off" || raw === "focused" || raw === "strong" || raw === "all") {
      return raw;
    }
  } catch {
    /* ignore */
  }
  return "strong";
}

export function saveRelationMode(projectId: string, mode: RelationMode) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(`pb:focus-rel-mode:v1:${projectId}`, mode);
  } catch {
    /* ignore */
  }
}

/** Map strength → visual parameters (not color-only). */
export function relationVisuals(strength: number, explicit: boolean) {
  const t = clamp01to100(strength) / 100;
  return {
    opacity: 0.18 + t * 0.55,
    strokeWidth: 1.1 + t * 2.4,
    glow: 2 + t * 8,
    particleCount: Math.round(1 + t * 4),
    particleSpeed: 0.35 + t * 0.9,
    particleFrequency: 1800 - t * 900,
    dashArray: explicit ? undefined : "5 7",
    strokeAlpha: explicit ? 0.9 : 0.65,
  };
}
