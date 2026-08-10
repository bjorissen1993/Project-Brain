import { z } from "zod";

export const imbalanceFindingSchema = z.object({
  designFocusId: z.string().min(1).optional(),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1200),
  suggestedAction: z.string().trim().max(800).optional(),
});

export const imbalanceAnalysisSchema = z.object({
  findings: z.array(imbalanceFindingSchema).max(20),
  summary: z.string().trim().min(1).max(2000),
  respectsIntent: z.boolean().default(true),
});

export type ImbalanceAnalysis = z.infer<typeof imbalanceAnalysisSchema>;
export type ImbalanceFinding = z.infer<typeof imbalanceFindingSchema>;

export function normalizeImbalanceAnalysis(
  raw: unknown,
  validDesignFocusIds: Set<string>,
): ImbalanceAnalysis | null {
  const parsed = imbalanceAnalysisSchema.safeParse(raw);
  if (!parsed.success) return null;

  const findings = parsed.data.findings
    .filter(
      (f) =>
        !f.designFocusId || validDesignFocusIds.has(f.designFocusId),
    )
    .slice(0, 16);

  return {
    summary: parsed.data.summary.trim(),
    respectsIntent: parsed.data.respectsIntent,
    findings,
  };
}
