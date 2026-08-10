import { z } from "zod";

export const improvementCategorySchema = z.enum([
  "ADD",
  "REMOVE",
  "MERGE",
  "SIMPLIFY",
  "AUTOMATE",
  "REPOSITION",
  "CONNECT",
  "REPURPOSE",
]);

export type ImprovementCategory = z.infer<typeof improvementCategorySchema>;

export const improvementItemSchema = z.object({
  category: improvementCategorySchema,
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(1600),
  rationale: z.string().trim().min(1).max(1200),
  relatedNodeIds: z.array(z.string().min(1)).max(12).default([]),
  relatedFocusIds: z.array(z.string().min(1)).max(12).default([]),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
});

export const improvementSuggestionsSchema = z.object({
  suggestions: z.array(improvementItemSchema).max(16),
  summary: z.string().trim().min(1).max(2000),
});

export type ImprovementSuggestions = z.infer<
  typeof improvementSuggestionsSchema
>;
export type ImprovementItem = z.infer<typeof improvementItemSchema>;

export function normalizeImprovementSuggestions(
  raw: unknown,
  opts: {
    validNodeIds: Set<string>;
    validDesignFocusIds: Set<string>;
  },
): ImprovementSuggestions | null {
  const parsed = improvementSuggestionsSchema.safeParse(raw);
  if (!parsed.success) return null;

  const suggestions = parsed.data.suggestions
    .map((s) => ({
      ...s,
      relatedNodeIds: s.relatedNodeIds.filter((id) =>
        opts.validNodeIds.has(id),
      ),
      relatedFocusIds: s.relatedFocusIds.filter((id) =>
        opts.validDesignFocusIds.has(id),
      ),
    }))
    .slice(0, 12);

  return {
    summary: parsed.data.summary.trim(),
    suggestions,
  };
}
