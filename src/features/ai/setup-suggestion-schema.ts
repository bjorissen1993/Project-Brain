import { z } from "zod";
import { GENRE_TEMPLATES } from "@/features/game-profile/genre-templates";
import {
  PROJECT_TYPE_AREAS,
  PROJECT_TYPE_FOCUS_TEMPLATES,
} from "@/features/projects/type-templates";
import type { ProjectType } from "@/types";

const knownGenreKeys = new Set(GENRE_TEMPLATES.map((g) => g.key));
const nonGameTypes = new Set(
  Object.keys(PROJECT_TYPE_AREAS) as Exclude<ProjectType, "GAME">[],
);

const genreKeySchema = z
  .string()
  .trim()
  .min(1)
  .refine((key) => knownGenreKeys.has(key), { message: "Unknown genre key" });

export const suggestedFocusSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentName: z.string().trim().min(1).max(120).optional(),
  templateKey: z.string().trim().optional(),
  selected: z.boolean().default(true),
  targetImportance: z.number().min(0).max(100).default(50),
  reasoning: z.string().trim().max(400).optional(),
});

/** Structural Project Area suggestion — no importance. */
export const suggestedProjectAreaSchema = z.object({
  name: z.string().trim().min(1).max(120),
  templateKey: z.string().trim().optional(),
  selected: z.boolean().default(true),
  reasoning: z.string().trim().max(400).optional(),
});

export const extractedIntentHintsSchema = z
  .object({
    primaryExperiences: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    supportingSystems: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    minorSystems: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
    thingsToAvoid: z.array(z.string().trim().min(1).max(120)).max(8).optional(),
  })
  .optional();

export const setupSuggestionSchema = z.object({
  primaryGenreKey: genreKeySchema,
  secondaryGenreKeys: z.array(genreKeySchema).max(5).default([]),
  customGameType: z.string().trim().max(120).optional(),
  /** Structural organization sections (Project Areas). */
  suggestedProjectAreas: z.array(suggestedProjectAreaSchema).max(40).default([]),
  /**
   * Design Focus criteria with targetImportance.
   * Accepts legacy `suggestedFocuses` during normalize.
   */
  suggestedDesignFocuses: z.array(suggestedFocusSchema).max(40).default([]),
  extractedIntentHints: extractedIntentHintsSchema,
});

/** Non-game setup suggestions — areas + focuses only (no genres). */
export const genericSetupSuggestionSchema = z.object({
  suggestedProjectAreas: z.array(suggestedProjectAreaSchema).max(40).default([]),
  suggestedDesignFocuses: z.array(suggestedFocusSchema).max(40).default([]),
  extractedIntentHints: extractedIntentHintsSchema,
});

export const suggestSetupFromIntentInputSchema = z.object({
  projectId: z.string().min(1),
  intentText: z.string().trim().min(1, "Describe the experience first").max(10000),
  locale: z.enum(["en", "nl"]).optional(),
});

export type SetupSuggestionParsed = z.infer<typeof setupSuggestionSchema>;
export type GenericSetupSuggestionParsed = z.infer<
  typeof genericSetupSuggestionSchema
>;
export type SuggestSetupFromIntentInputParsed = z.infer<
  typeof suggestSetupFromIntentInputSchema
>;

/** Normalize AI/heuristic output: valid keys only, no primary in secondary, clamp importances. */
export function normalizeSetupSuggestion(
  raw: unknown,
): SetupSuggestionParsed | null {
  // Accept legacy `suggestedFocuses` key from older prompts / cached shapes.
  const incoming =
    raw && typeof raw === "object"
      ? (() => {
          const obj = { ...(raw as Record<string, unknown>) };
          if (
            !Array.isArray(obj.suggestedDesignFocuses) &&
            Array.isArray(obj.suggestedFocuses)
          ) {
            obj.suggestedDesignFocuses = obj.suggestedFocuses;
          }
          return obj;
        })()
      : raw;

  const parsed = setupSuggestionSchema.safeParse(incoming);
  if (!parsed.success) return null;

  const data = parsed.data;
  const secondaryGenreKeys = [
    ...new Set(
      data.secondaryGenreKeys.filter((key) => key !== data.primaryGenreKey),
    ),
  ].slice(0, 4);

  const suggestedDesignFocuses = data.suggestedDesignFocuses.map((focus) => ({
    ...focus,
    targetImportance: Math.round(
      Math.min(100, Math.max(0, focus.targetImportance)),
    ),
    templateKey:
      focus.templateKey && knownGenreKeys.has(focus.templateKey)
        ? focus.templateKey
        : undefined,
  }));

  const suggestedProjectAreas = data.suggestedProjectAreas.map((area) => ({
    ...area,
    name: area.name.trim(),
    templateKey:
      area.templateKey && knownGenreKeys.has(area.templateKey)
        ? area.templateKey
        : undefined,
  }));

  const customGameType =
    data.primaryGenreKey === "custom" || secondaryGenreKeys.includes("custom")
      ? data.customGameType?.trim() || undefined
      : data.customGameType?.trim() || undefined;

  return {
    ...data,
    secondaryGenreKeys,
    customGameType,
    suggestedProjectAreas,
    suggestedDesignFocuses,
  };
}

/** Normalize non-game AI/heuristic output; templateKey = project type slug. */
export function normalizeGenericSetupSuggestion(
  raw: unknown,
  projectType: Exclude<ProjectType, "GAME">,
): GenericSetupSuggestionParsed | null {
  const incoming =
    raw && typeof raw === "object"
      ? (() => {
          const obj = { ...(raw as Record<string, unknown>) };
          if (
            !Array.isArray(obj.suggestedDesignFocuses) &&
            Array.isArray(obj.suggestedFocuses)
          ) {
            obj.suggestedDesignFocuses = obj.suggestedFocuses;
          }
          return obj;
        })()
      : raw;

  const parsed = genericSetupSuggestionSchema.safeParse(incoming);
  if (!parsed.success) return null;

  const typeKey = nonGameTypes.has(projectType) ? projectType : "OTHER";
  const knownAreaNames = new Set(
    PROJECT_TYPE_AREAS[typeKey as Exclude<ProjectType, "GAME">].map((n) =>
      n.toLowerCase(),
    ),
  );
  const knownFocusNames = new Set(
    PROJECT_TYPE_FOCUS_TEMPLATES[typeKey as Exclude<ProjectType, "GAME">].map(
      (f) => f.name.toLowerCase(),
    ),
  );

  const suggestedDesignFocuses = parsed.data.suggestedDesignFocuses.map(
    (focus) => ({
      ...focus,
      targetImportance: Math.round(
        Math.min(100, Math.max(0, focus.targetImportance)),
      ),
      templateKey:
        focus.templateKey === typeKey ||
        knownFocusNames.has(focus.name.toLowerCase())
          ? typeKey
          : undefined,
    }),
  );

  const suggestedProjectAreas = parsed.data.suggestedProjectAreas.map(
    (area) => ({
      ...area,
      name: area.name.trim(),
      templateKey:
        area.templateKey === typeKey ||
        knownAreaNames.has(area.name.toLowerCase())
          ? typeKey
          : undefined,
    }),
  );

  return {
    ...parsed.data,
    suggestedProjectAreas,
    suggestedDesignFocuses,
  };
}
