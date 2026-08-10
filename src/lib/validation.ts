import { z } from "zod";

export const projectTypeSchema = z.enum([
  "GAME",
  "SOFTWARE",
  "APP",
  "CREATIVE",
  "OTHER",
  "CUSTOM",
]);

export const nodeTypeSchema = z.enum([
  "FOLDER",
  "MECHANIC",
  "CHARACTER",
  "QUEST",
  "LOCATION",
  "STORY_BEAT",
  "SYSTEM",
  "ITEM",
  "FACTION",
  "UI_SCREEN",
  "IDEA",
  "TASK",
  "ACT",
  "CUSTOM",
]);

export const nodeStatusSchema = z.enum([
  "IDEA",
  "DRAFT",
  "IN_PROGRESS",
  "REVIEW",
  "READY",
]);

export const gamePhaseSchema = z.enum(["EARLY", "MID", "LATE", "ENDGAME"]);

export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1, "Project name is required").max(120),
    type: projectTypeSchema,
    customTypeLabel: z.string().trim().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "CUSTOM" && !data.customTypeLabel?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "Custom type label is required",
        path: ["customTypeLabel"],
      });
    }
  });

export const gameSetupSchema = z
  .object({
    projectId: z.string().min(1),
    primaryGenreKey: z.string().min(1, "Select a primary genre"),
    secondaryGenreKeys: z.array(z.string()).default([]),
    customGameType: z.string().trim().max(120).optional(),
    /** Structural Project Areas → top-level FOLDER Nodes. No importance. */
    selectedProjectAreas: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          templateSource: z.string().optional(),
          isCustom: z.boolean().default(false),
        }),
      )
      .default([]),
    /** Design Focus criteria with targetImportance. */
    selectedFocuses: z
      .array(
        z.object({
          name: z.string().trim().min(1),
          parentName: z.string().trim().optional(),
          targetImportance: z.number().min(0).max(100).default(50),
          templateSource: z.string().optional(),
          isCustom: z.boolean().default(false),
        }),
      )
      .default([]),
    intent: z.string().trim().min(1, "Project intent is required").max(10000),
  })
  .superRefine((data, ctx) => {
    if (
      data.primaryGenreKey === "custom" &&
      !data.customGameType?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Describe your custom game type",
        path: ["customGameType"],
      });
    }
    if (data.secondaryGenreKeys.includes(data.primaryGenreKey)) {
      ctx.addIssue({
        code: "custom",
        message: "Primary genre cannot also be secondary",
        path: ["secondaryGenreKeys"],
      });
    }
  });

/**
 * Generic (non-game) setup: Intent + Project Areas + Design Focus.
 * No genres / GameProfile required.
 */
export const genericSetupSchema = z.object({
  projectId: z.string().min(1),
  /** Structural Project Areas → top-level FOLDER Nodes. No importance. */
  selectedProjectAreas: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        templateSource: z.string().optional(),
        isCustom: z.boolean().default(false),
      }),
    )
    .min(1, "Select at least one project area"),
  /** Design Focus criteria with targetImportance (optional but useful). */
  selectedFocuses: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        parentName: z.string().trim().optional(),
        targetImportance: z.number().min(0).max(100).default(50),
        templateSource: z.string().optional(),
        isCustom: z.boolean().default(false),
      }),
    )
    .default([]),
  intent: z.string().trim().min(1, "Project intent is required").max(10000),
});

export const updateIntentSchema = z.object({
  projectId: z.string().min(1),
  content: z.string().trim().min(1).max(10000),
  reason: z.string().trim().max(240).optional(),
});

/** Post-setup genre edit. Never auto-mutates genres from AI — confirmMismatch required on mismatch. */
export const updateProjectGenresSchema = z
  .object({
    projectId: z.string().min(1),
    primaryGenreKey: z.string().min(1, "Select a primary genre"),
    secondaryGenreKeys: z.array(z.string()).default([]),
    customGameType: z.string().trim().max(120).optional(),
    /** Creator explicitly accepted keeping genres despite intent mismatch warning. */
    confirmMismatch: z.boolean().optional().default(false),
  })
  .superRefine((data, ctx) => {
    if (
      data.primaryGenreKey === "custom" &&
      !data.customGameType?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Describe your custom game type",
        path: ["customGameType"],
      });
    }
    if (data.secondaryGenreKeys.includes(data.primaryGenreKey)) {
      ctx.addIssue({
        code: "custom",
        message: "Primary genre cannot also be secondary",
        path: ["secondaryGenreKeys"],
      });
    }
  });

/** Delete requires exact project name confirmation (case-sensitive). */
export const deleteProjectSchema = z.object({
  projectId: z.string().min(1),
  confirmName: z.string().trim().min(1, "Type the project name to confirm"),
});

/** Abandon incomplete setup — deletes DRAFT projects that never finished setup. */
export const abandonProjectSetupSchema = z.object({
  projectId: z.string().min(1),
});

export const toggleProjectFavoriteSchema = z.object({
  projectId: z.string().min(1),
  isFavorite: z.boolean(),
});

export const exportProjectSchema = z.object({
  projectId: z.string().min(1),
  format: z.enum(["markdown", "json"]).default("markdown"),
});

export const createDesignFocusSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  parentId: z.string().optional().nullable(),
  targetImportance: z.number().min(0).max(100).default(50),
  isCustom: z.boolean().default(true),
  /** Optional idea text — stored on a linked Idea node (DesignFocus has no description column). */
  description: z.string().max(50000).optional().nullable(),
  /** When true (or when description is set), create a linked Idea node. */
  createIdeaNode: z.boolean().optional().default(false),
});

export const updateDesignFocusSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  targetImportance: z.number().min(0).max(100).optional(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
});

/** Upsert focus properties + optional linked Idea content from Focus Space. */
export const updateFocusElementSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  targetImportance: z.number().min(0).max(100).optional(),
  description: z.string().max(50000).optional().nullable(),
  ideaNodeId: z.string().min(1).optional().nullable(),
});

export const createNodeSchema = z.object({
  projectId: z.string().min(1),
  parentId: z.string().optional().nullable(),
  name: z.string().trim().min(1).max(160),
  type: nodeTypeSchema,
  customTypeLabel: z.string().trim().max(120).optional().nullable(),
  status: nodeStatusSchema.default("IDEA"),
  content: z.string().max(50000).optional().nullable(),
  designFocusId: z.string().optional().nullable(),
});

export const updateNodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  type: nodeTypeSchema.optional(),
  customTypeLabel: z.string().trim().max(120).optional().nullable(),
  status: nodeStatusSchema.optional(),
  content: z.string().max(50000).optional().nullable(),
  summary: z.string().max(8000).optional().nullable(),
  parentId: z.string().optional().nullable(),
  designFocusId: z.string().optional().nullable(),
  gamePhase: gamePhaseSchema.optional().nullable(),
  sortOrder: z.number().int().optional(),
});

export const combineNotesSchema = z.object({
  projectId: z.string().min(1),
  parentNodeId: z.string().optional().nullable(),
  sourceNodeIds: z.array(z.string().min(1)).min(2).max(12),
  /** Optional draft title when accepting a new combined note. */
  title: z.string().trim().min(1).max(160).optional(),
});

export const acceptCombinedNoteSchema = z.object({
  projectId: z.string().min(1),
  parentNodeId: z.string().optional().nullable(),
  sourceNodeIds: z.array(z.string().min(1)).min(2).max(12),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(50000),
  /** When set, update this existing note instead of creating a new one. */
  targetNodeId: z.string().min(1).optional().nullable(),
  /**
   * When true, delete source notes after a successful Accept.
   * Default off — never silently remove originals.
   */
  removeSourceNotes: z.boolean().optional().default(false),
});

/** AI / heuristic draft for combine-notes (Zod-validated). */
export const combinedNoteDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(50000),
});

export const createRelationSchema = z.object({
  projectId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  type: z.string().trim().min(1).max(80),
  label: z.string().trim().max(160).optional().nullable(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type GameSetupInput = z.infer<typeof gameSetupSchema>;
export type GenericSetupInput = z.infer<typeof genericSetupSchema>;
export type UpdateProjectGenresInput = z.infer<typeof updateProjectGenresSchema>;
export type AbandonProjectSetupInput = z.infer<typeof abandonProjectSetupSchema>;
export type ToggleProjectFavoriteInput = z.infer<typeof toggleProjectFavoriteSchema>;
export type CreateNodeInput = z.infer<typeof createNodeSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;
