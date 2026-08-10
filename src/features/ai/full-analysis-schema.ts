import { z } from "zod";

export const fullProjectAnalysisSchema = z.object({
  executiveSummary: z.string().trim().min(1).max(4000),
  intentAlignment: z.object({
    score: z.number().min(0).max(100),
    notes: z.array(z.string().trim().min(1).max(800)).max(10),
  }),
  balanceNarrative: z.string().trim().min(1).max(3000),
  strengths: z.array(z.string().trim().min(1).max(500)).max(12),
  risks: z.array(z.string().trim().min(1).max(500)).max(12),
  recommendedFocusAreas: z.array(z.string().trim().min(1).max(500)).max(12),
  gamePhaseNotes: z.string().trim().max(2000).optional(),
});

export type FullProjectAnalysis = z.infer<typeof fullProjectAnalysisSchema>;

export function normalizeFullProjectAnalysis(
  raw: unknown,
): FullProjectAnalysis | null {
  const parsed = fullProjectAnalysisSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data;
}
