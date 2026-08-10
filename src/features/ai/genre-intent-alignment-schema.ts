import { z } from "zod";
import { GENRE_TEMPLATES } from "@/features/game-profile/genre-templates";
import type { SetupSuggestionData } from "./types";

const knownGenreKeys = new Set(GENRE_TEMPLATES.map((g) => g.key));

const genreKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine((key) => knownGenreKeys.has(key), { message: "Unknown genre key" });

export const genreIntentAlignmentSchema = z.object({
  aligned: z.boolean(),
  confidence: z.number().min(0).max(100).default(70),
  message: z.string().trim().min(1).max(800),
  suggestedPrimaryGenreKey: genreKeySchema.optional(),
  suggestedSecondaryGenreKeys: z.array(genreKeySchema).max(5).default([]),
  reasons: z.array(z.string().trim().min(1).max(400)).max(8).default([]),
  source: z.enum(["ai", "heuristic"]),
});

export type GenreIntentAlignment = z.infer<typeof genreIntentAlignmentSchema>;

export const checkGenreIntentAlignmentInputSchema = z.object({
  projectId: z.string().min(1),
  primaryGenreKey: genreKeySchema,
  secondaryGenreKeys: z.array(genreKeySchema).max(5).default([]),
});

/**
 * Compare creator-chosen genres against an intent-derived suggestion.
 * Never mutates genres — advisory only for a confirmation UI.
 */
export function assessGenreIntentAlignment(
  primaryGenreKey: string,
  secondaryGenreKeys: string[],
  suggestion: SetupSuggestionData,
): GenreIntentAlignment {
  const suggestedPrimary = suggestion.primaryGenreKey;
  if (!suggestedPrimary) {
    return {
      aligned: true,
      confidence: 50,
      message:
        "No genre suggestion available to compare. You can save your genre choice.",
      suggestedPrimaryGenreKey: primaryGenreKey,
      suggestedSecondaryGenreKeys: secondaryGenreKeys,
      reasons: [],
      source: suggestion.source,
    };
  }
  const suggestedSecondary = (suggestion.secondaryGenreKeys ?? []).filter(
    (key) => key !== suggestedPrimary,
  );
  const chosenSecondary = [
    ...new Set(secondaryGenreKeys.filter((key) => key !== primaryGenreKey)),
  ];
  const suggestedSet = new Set([suggestedPrimary, ...suggestedSecondary]);
  const chosenSet = new Set([primaryGenreKey, ...chosenSecondary]);

  const reasons: string[] = [];

  if (primaryGenreKey === suggestedPrimary) {
    const secondaryOverlap = chosenSecondary.filter((key) =>
      suggestedSet.has(key),
    ).length;
    return {
      aligned: true,
      confidence: Math.min(
        95,
        70 + secondaryOverlap * 8 + (suggestion.source === "ai" ? 5 : 0),
      ),
      message:
        "Chosen genres look consistent with the project intent. You can save without changes.",
      suggestedPrimaryGenreKey: suggestedPrimary,
      suggestedSecondaryGenreKeys: suggestedSecondary,
      reasons,
      source: suggestion.source,
    };
  }

  const softPrimary =
    suggestedSecondary.includes(primaryGenreKey) ||
    chosenSecondary.includes(suggestedPrimary);

  if (softPrimary) {
    reasons.push(
      `Primary differs from the strongest intent match (“${suggestedPrimary}”), but there is overlap with secondary influences.`,
    );
    return {
      aligned: true,
      confidence: 55,
      message:
        "Genres partially match the intent (primary/secondary overlap). Saving is fine if this mix is intentional.",
      suggestedPrimaryGenreKey: suggestedPrimary,
      suggestedSecondaryGenreKeys: suggestedSecondary,
      reasons,
      source: suggestion.source,
    };
  }

  const overlap = [...chosenSet].filter((key) => suggestedSet.has(key));
  if (overlap.length === 0) {
    reasons.push(
      `Intent suggests “${suggestedPrimary}” as primary; your selection does not overlap with suggested genres.`,
    );
  } else {
    reasons.push(
      `Intent leans toward “${suggestedPrimary}”, while your primary is “${primaryGenreKey}”.`,
    );
  }

  return {
    aligned: false,
    confidence: suggestion.source === "ai" ? 72 : 58,
    message:
      "Chosen genres may not align with the project intent. Confirm to keep them, or go back and adjust.",
    suggestedPrimaryGenreKey: suggestedPrimary,
    suggestedSecondaryGenreKeys: suggestedSecondary,
    reasons,
    source: suggestion.source,
  };
}

export function normalizeGenreIntentAlignment(
  raw: unknown,
): GenreIntentAlignment | null {
  const parsed = genreIntentAlignmentSchema.safeParse(raw);
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    message: parsed.data.message.trim(),
    reasons: parsed.data.reasons.map((r) => r.trim()).slice(0, 8),
    suggestedSecondaryGenreKeys: [
      ...new Set(
        parsed.data.suggestedSecondaryGenreKeys.filter(
          (key) => key !== parsed.data.suggestedPrimaryGenreKey,
        ),
      ),
    ].slice(0, 4),
  };
}
