import { z } from "zod";
import { nodeTypeSchema } from "@/lib/validation";

export const suggestedChildElementSchema = z.object({
  name: z.string().trim().min(1).max(160),
  type: nodeTypeSchema.default("IDEA"),
  content: z.string().trim().max(2000).optional(),
  reasoning: z.string().trim().max(400).optional(),
  selected: z.boolean().default(true),
});

/** Max suggestions from AI / apply batch (UI shows first 4 inline + overflow modal). */
export const ELEMENT_SUGGESTION_MAX = 30;
export const ELEMENT_SUGGESTION_INLINE = 4;

export const childElementSuggestionsSchema = z.object({
  suggestions: z
    .array(suggestedChildElementSchema)
    .max(ELEMENT_SUGGESTION_MAX)
    .default([]),
  notes: z.string().trim().max(600).optional(),
});

export const suggestChildElementsInputSchema = z.object({
  projectId: z.string().min(1),
  /** Parent container; null = project root (top-level structure). */
  nodeId: z.string().min(1).nullable(),
  /** Optional override; defaults to saved node content (or project intent at root). */
  content: z.string().trim().max(50000).optional(),
});

export const applyChildElementSuggestionsSchema = z.object({
  projectId: z.string().min(1),
  /** Parent container; null = create under project root. */
  parentNodeId: z.string().min(1).nullable(),
  /** Optional AIAnalysis id to mark accepted. */
  analysisId: z.string().min(1).optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        type: nodeTypeSchema,
        content: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .min(1)
    .max(ELEMENT_SUGGESTION_MAX),
});

export const ignoreChildElementSuggestionsSchema = z.object({
  projectId: z.string().min(1),
  /** Parent container; null = project-root proposals. */
  nodeId: z.string().min(1).nullable(),
  analysisId: z.string().min(1).optional(),
});

export type SuggestedChildElement = z.infer<typeof suggestedChildElementSchema>;
export type ChildElementSuggestions = z.infer<
  typeof childElementSuggestionsSchema
>;

const ALLOWED_TYPES = new Set(nodeTypeSchema.options);

/** Normalize for duplicate / near-duplicate checks. */
export function normalizeSuggestionName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): Set<string> {
  return new Set(normalizeSuggestionName(name).split(" ").filter(Boolean));
}

/** True when names are exact or near-duplicate (shared tokens / containment). */
export function isNearDuplicateName(a: string, b: string): boolean {
  const na = normalizeSuggestionName(a);
  const nb = normalizeSuggestionName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const shorter = Math.min(na.length, nb.length);
    if (shorter >= 4) return true;
  }
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap += 1;
  const union = new Set([...ta, ...tb]).size;
  return overlap / union >= 0.75 && overlap >= 2;
}

function conflictsExisting(
  name: string,
  existing: Set<string>,
  existingRaw: string[],
): boolean {
  const key = normalizeSuggestionName(name);
  if (existing.has(key)) return true;
  return existingRaw.some((other) => isNearDuplicateName(name, other));
}

/**
 * True when `name` is an exact or near-duplicate of any existing sibling title
 * (case-insensitive, trimmed, shared structure-suggest rules).
 */
export function nameConflictsExisting(
  name: string,
  existingNames: Iterable<string>,
): boolean {
  const existingRaw = [...existingNames]
    .map((n) => n.trim())
    .filter(Boolean);
  if (!existingRaw.length) return false;
  const existingKeys = new Set(existingRaw.map(normalizeSuggestionName));
  return conflictsExisting(name, existingKeys, existingRaw);
}

/** Normalize AI/heuristic child-element suggestions. */
export function normalizeChildElementSuggestions(
  raw: unknown,
  existingChildNames: Set<string> = new Set(),
): ChildElementSuggestions | null {
  const incoming =
    raw && typeof raw === "object"
      ? (() => {
          const obj = { ...(raw as Record<string, unknown>) };
          if (!Array.isArray(obj.suggestions) && Array.isArray(obj.elements)) {
            obj.suggestions = obj.elements;
          }
          return obj;
        })()
      : raw;

  const parsed = childElementSuggestionsSchema.safeParse(incoming);
  if (!parsed.success) return null;

  const existingRaw = [...existingChildNames];
  const seen = new Set<string>();
  const acceptedNames: string[] = [];
  const suggestions: SuggestedChildElement[] = [];

  for (const item of parsed.data.suggestions) {
    const name = item.name.trim();
    if (!name) continue;
    const key = normalizeSuggestionName(name);
    if (!key) continue;
    if (seen.has(key) || conflictsExisting(name, existingChildNames, existingRaw)) {
      continue;
    }
    if (acceptedNames.some((other) => isNearDuplicateName(name, other))) {
      continue;
    }
    seen.add(key);
    acceptedNames.push(name);

    const type = ALLOWED_TYPES.has(item.type) ? item.type : "IDEA";
    suggestions.push({
      name,
      type,
      content: item.content?.trim() || undefined,
      reasoning: item.reasoning?.trim() || undefined,
      selected: item.selected !== false,
    });
    if (suggestions.length >= ELEMENT_SUGGESTION_MAX) break;
  }

  return {
    suggestions,
    notes: parsed.data.notes?.trim() || undefined,
  };
}
