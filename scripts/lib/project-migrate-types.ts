/**
 * Shared Zod schemas + helpers for application-level project export/import.
 * Auth models (User/Account/Session) are intentionally excluded.
 */
import { z } from "zod";

export const EXPORT_FORMAT_VERSION = 1 as const;

const isoDate = z.union([z.string(), z.date()]).transform((v) =>
  v instanceof Date ? v.toISOString() : v,
);

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export const GenreExportSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  templateKey: z.string().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const ProjectExportSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["GAME", "SOFTWARE", "APP", "CREATIVE", "OTHER", "CUSTOM"]),
  customTypeLabel: z.string().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  setupCompleted: z.boolean(),
  isFavorite: z.boolean(),
  githubRepo: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const IntentExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  content: z.string(),
  version: z.number().int(),
  isOriginal: z.boolean(),
  reason: z.string().nullable(),
  createdAt: isoDate,
});

export const GameProfileExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  customGameType: z.string().nullable(),
  notes: z.string().nullable(),
  aiProfileMeta: jsonValue.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const ProjectGenreExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  genreId: z.string().min(1),
  /** Stable match key on target DB (seed may use different genre ids). */
  genreSlug: z.string().min(1),
  role: z.enum(["PRIMARY", "SECONDARY"]),
  createdAt: isoDate,
});

export const DesignFocusExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  parentId: z.string().nullable(),
  targetImportance: z.number().int(),
  actualWeight: z.number().int(),
  confidence: z.number().int(),
  sortOrder: z.number().int(),
  isCustom: z.boolean(),
  templateSource: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const NodeExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  parentId: z.string().nullable(),
  name: z.string().min(1),
  type: z.enum([
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
  ]),
  customTypeLabel: z.string().nullable(),
  status: z.enum(["IDEA", "DRAFT", "IN_PROGRESS", "REVIEW", "READY"]),
  content: z.string().nullable(),
  summary: z.string().nullable(),
  projectImpact: z.string().nullable(),
  designFocusId: z.string().nullable(),
  gamePhase: z.enum(["EARLY", "MID", "LATE", "ENDGAME"]).nullable(),
  posX: z.number().nullable(),
  posY: z.number().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const NodeImageExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  url: z.string().min(1),
  filename: z.string().nullable(),
  mimeType: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDate,
});

export const NodeRelationExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  type: z.string().min(1),
  label: z.string().nullable(),
  metadata: jsonValue.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const NodeClassificationExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  nodeId: z.string().min(1),
  category: z.string().min(1),
  confidence: z.number().nullable(),
  source: z.string().min(1),
  metadata: jsonValue.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const AIAnalysisExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  nodeId: z.string().nullable(),
  type: z.string().min(1),
  model: z.string().nullable(),
  status: z.string().min(1),
  inputHash: z.string().nullable(),
  result: jsonValue.nullable(),
  metadata: jsonValue.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const ClassificationRuleExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  name: z.string().min(1),
  rule: jsonValue,
  isActive: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const DirectionCheckExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  nodeId: z.string().nullable(),
  intentVersionId: z.string().nullable(),
  status: z.string().min(1),
  result: jsonValue.nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const ImprovementSuggestionExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  nodeId: z.string().nullable(),
  status: z.string().min(1),
  suggestion: jsonValue,
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const ChatMessageExportSchema = z.object({
  id: z.string().min(1),
  threadId: z.string().min(1),
  role: z.string().min(1),
  content: z.string(),
  proposals: jsonValue.nullable(),
  metadata: jsonValue.nullable(),
  createdAt: isoDate,
});

export const ChatThreadExportSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  contextNodeId: z.string().nullable(),
  title: z.string().nullable(),
  attachedGptText: z.string().nullable(),
  attachedGptUrl: z.string().nullable(),
  attachedGptSource: z.string().nullable(),
  createdAt: isoDate,
  updatedAt: isoDate,
  messages: z.array(ChatMessageExportSchema),
});

export const ProjectBundleSchema = z.object({
  project: ProjectExportSchema,
  intents: z.array(IntentExportSchema),
  gameProfile: GameProfileExportSchema.nullable(),
  projectGenres: z.array(ProjectGenreExportSchema),
  designFocuses: z.array(DesignFocusExportSchema),
  nodes: z.array(NodeExportSchema),
  nodeImages: z.array(NodeImageExportSchema),
  nodeRelations: z.array(NodeRelationExportSchema),
  classifications: z.array(NodeClassificationExportSchema),
  aiAnalyses: z.array(AIAnalysisExportSchema),
  classificationRules: z.array(ClassificationRuleExportSchema),
  directionChecks: z.array(DirectionCheckExportSchema),
  improvementSuggestions: z.array(ImprovementSuggestionExportSchema),
  chatThreads: z.array(ChatThreadExportSchema),
});

export const ProjectMigrateFileSchema = z.object({
  formatVersion: z.literal(EXPORT_FORMAT_VERSION),
  exportedAt: isoDate,
  source: z
    .object({
      databaseHostHint: z.string().optional(),
      projectCount: z.number().int().nonnegative(),
    })
    .optional(),
  genres: z.array(GenreExportSchema),
  projects: z.array(ProjectBundleSchema),
});

export type ProjectMigrateFile = z.infer<typeof ProjectMigrateFileSchema>;
export type ProjectBundle = z.infer<typeof ProjectBundleSchema>;

export function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a === flag || a.startsWith(prefix));
  if (!hit) return undefined;
  if (hit.startsWith(prefix)) return hit.slice(prefix.length).trim();
  const idx = process.argv.indexOf(hit);
  return process.argv[idx + 1]?.trim();
}

export function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}
