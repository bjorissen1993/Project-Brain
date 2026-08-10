import { z } from "zod";

/** Weight / confidence as percentages 0–100 for Phase 3 balance math. */
const percentSchema = z.number().min(0).max(100);

export const nodeClassificationResultSchema = z.object({
  designFocusId: z.string().min(1),
  weight: percentSchema,
  confidence: percentSchema,
  reasoning: z.string().trim().min(1).max(800),
});

export const suggestedRelationSchema = z.object({
  targetNodeId: z.string().min(1),
  relationType: z.string().trim().min(1).max(80),
  reasoning: z.string().trim().min(1).max(800),
  confidence: percentSchema,
});

export const observationSchema = z.object({
  type: z.enum([
    "overrepresented",
    "underrepresented",
    "repetitive",
    "disconnected",
    "none",
  ]),
  description: z.string().trim().min(1).max(800),
});

export const nodeAIAnalysisSchema = z.object({
  summary: z.string().trim().min(1).max(4000),
  projectImpact: z.string().trim().min(1).max(4000),
  classifications: z.array(nodeClassificationResultSchema).max(20),
  suggestedRelations: z.array(suggestedRelationSchema).max(20).default([]),
  observations: z.array(observationSchema).max(12).default([]),
});

export type NodeAIAnalysis = z.infer<typeof nodeAIAnalysisSchema>;
export type NodeClassificationResult = z.infer<
  typeof nodeClassificationResultSchema
>;
export type SuggestedRelation = z.infer<typeof suggestedRelationSchema>;

export const classificationMetadataSchema = z.object({
  designFocusId: z.string().min(1),
  weight: percentSchema,
  reasoning: z.string().optional(),
  status: z
    .enum(["proposed", "accepted", "rejected", "corrected"])
    .default("proposed"),
  correctionReason: z.string().optional(),
  previousCategory: z.string().optional(),
  focusName: z.string().optional(),
});

export type ClassificationMetadata = z.infer<
  typeof classificationMetadataSchema
>;

export const LOW_CONFIDENCE_THRESHOLD = 60;

/**
 * Normalize raw AI JSON: keep only design focuses / nodes that exist,
 * clamp percents, drop self-relations.
 */
export function normalizeNodeAIAnalysis(
  raw: unknown,
  opts: {
    validDesignFocusIds: Set<string>;
    validNodeIds: Set<string>;
    selfNodeId: string;
  },
): NodeAIAnalysis | null {
  const parsed = nodeAIAnalysisSchema.safeParse(raw);
  if (!parsed.success) return null;

  const classifications = parsed.data.classifications
    .filter((c) => opts.validDesignFocusIds.has(c.designFocusId))
    .map((c) => ({
      ...c,
      weight: Math.round(Math.min(100, Math.max(0, c.weight))),
      confidence: Math.round(Math.min(100, Math.max(0, c.confidence))),
    }));

  // Deduplicate by designFocusId — keep highest confidence.
  const byFocus = new Map<string, (typeof classifications)[number]>();
  for (const row of classifications) {
    const existing = byFocus.get(row.designFocusId);
    if (!existing || row.confidence > existing.confidence) {
      byFocus.set(row.designFocusId, row);
    }
  }

  const suggestedRelations = parsed.data.suggestedRelations
    .filter(
      (r) =>
        r.targetNodeId !== opts.selfNodeId &&
        opts.validNodeIds.has(r.targetNodeId),
    )
    .map((r) => ({
      ...r,
      relationType: r.relationType.trim().slice(0, 80),
      confidence: Math.round(Math.min(100, Math.max(0, r.confidence))),
    }))
    .slice(0, 12);

  return {
    summary: parsed.data.summary.trim(),
    projectImpact: parsed.data.projectImpact.trim(),
    classifications: [...byFocus.values()].slice(0, 12),
    suggestedRelations,
    observations: parsed.data.observations.slice(0, 8),
  };
}
