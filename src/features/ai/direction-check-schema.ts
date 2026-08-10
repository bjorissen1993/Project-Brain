import { z } from "zod";

export const directionCheckResultSchema = z.object({
  aligned: z.boolean(),
  confidence: z.number().min(0).max(100).default(70),
  question: z.string().trim().min(1).max(800),
  observations: z.array(z.string().trim().min(1).max(800)).max(12),
  driftSignals: z
    .array(
      z.object({
        type: z.enum([
          "same_purpose_cluster",
          "category_green_to_red",
          "large_folder_ready",
          "distribution_drift",
          "milestone_complete",
          "other",
        ]),
        description: z.string().trim().min(1).max(800),
      }),
    )
    .max(10)
    .default([]),
  notes: z.array(z.string().trim().min(1).max(800)).max(12).default([]),
});

export type DirectionCheckResult = z.infer<typeof directionCheckResultSchema>;

export function normalizeDirectionCheckResult(
  raw: unknown,
): DirectionCheckResult | null {
  const parsed = directionCheckResultSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    question: parsed.data.question.trim(),
    observations: parsed.data.observations.map((o) => o.trim()).slice(0, 10),
    notes: parsed.data.notes.map((n) => n.trim()).slice(0, 10),
  };
}
