"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/db/client";
import {
  abandonProjectSetupSchema,
  createProjectSchema,
  deleteProjectSchema,
  exportProjectSchema,
  gameSetupSchema,
  genericSetupSchema,
  toggleProjectFavoriteSchema,
  updateIntentSchema,
  updateProjectGenresSchema,
  updateProjectGithubRepoSchema,
} from "@/lib/validation";
import { getGenreTemplate } from "@/features/game-profile/genre-templates";
import { assessGenreIntentAlignment } from "@/features/ai/genre-intent-alignment-schema";
import { getAIService } from "@/features/ai";
import type { GenreIntentAlignment } from "@/features/ai/genre-intent-alignment-schema";
import { isGameProjectType } from "@/features/projects/type-templates";
import {
  buildProjectExportPayload,
  formatProjectExportMarkdown,
  projectExportFilename,
  serializeProjectExportJson,
} from "./export-project";

async function ensureGenresExist(keys: string[]) {
  const unique = [...new Set(keys)];
  for (const key of unique) {
    const template = getGenreTemplate(key);
    if (!template) continue;
    await prisma.genre.upsert({
      where: { slug: key },
      update: {
        name: template.name,
        description: template.description,
        templateKey: template.key,
      },
      create: {
        slug: key,
        name: template.name,
        description: template.description,
        templateKey: template.key,
      },
    });
  }
}

export async function listProjects() {
  return prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      gameProfile: true,
      genres: { include: { genre: true } },
      intents: { orderBy: { version: "desc" }, take: 1 },
      _count: { select: { nodes: true, designFocuses: true } },
    },
  });
}

/**
 * Lightweight root structure blobs for project-list previews.
 * `mass` matches Focus Space structure weighting: subtree size + contained
 * descendants (see `buildStructureLevelSummary` in focus-pie-adapter).
 */
export type RootStructurePreview = {
  id: string;
  name: string;
  mass: number;
};

export type HomeProjectItem = {
  id: string;
  name: string;
  type: string;
  setupCompleted: boolean;
  status: string;
  isFavorite: boolean;
  updatedAt: string;
  primaryGenre: string | null;
  nodeCount: number;
  focusCount: number;
  rootStructure: RootStructurePreview[];
};

const ROOT_PREVIEW_LIMIT = 6;

/** Focus Space mass for a structure root: max(1, subtreeSize + containedCount). */
function structureMassFromSubtreeSize(subtreeSize: number): number {
  const contained = Math.max(0, subtreeSize - 1);
  return Math.max(1, subtreeSize + contained);
}

/** Subtree sizes (self + descendants) keyed by node id. */
function buildSubtreeSizes(
  nodes: { id: string; parentId: string | null }[],
): Map<string, number> {
  const children = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentId) continue;
    const list = children.get(n.parentId) ?? [];
    list.push(n.id);
    children.set(n.parentId, list);
  }

  const cache = new Map<string, number>();
  const walk = (id: string): number => {
    const hit = cache.get(id);
    if (hit != null) return hit;
    let size = 1;
    for (const childId of children.get(id) ?? []) {
      size += walk(childId);
    }
    cache.set(id, size);
    return size;
  };

  for (const n of nodes) walk(n.id);
  return cache;
}

/** Home landing payload: projects + root structure previews sorted by mass. */
export async function listProjectsForHome(): Promise<HomeProjectItem[]> {
  const projects = await listProjects();
  if (projects.length === 0) return [];

  const projectIds = projects.map((p) => p.id);
  const nodes = await prisma.node.findMany({
    where: { projectId: { in: projectIds } },
    select: {
      id: true,
      name: true,
      projectId: true,
      parentId: true,
    },
  });

  const byProjectNodes = new Map<string, typeof nodes>();
  for (const node of nodes) {
    const list = byProjectNodes.get(node.projectId) ?? [];
    list.push(node);
    byProjectNodes.set(node.projectId, list);
  }

  const byProject = new Map<string, RootStructurePreview[]>();
  for (const projectId of projectIds) {
    const projectNodes = byProjectNodes.get(projectId) ?? [];
    const subtreeSizes = buildSubtreeSizes(projectNodes);
    const roots = projectNodes
      .filter((n) => n.parentId == null)
      .map((n) => ({
        id: n.id,
        name: n.name,
        mass: structureMassFromSubtreeSize(subtreeSizes.get(n.id) ?? 1),
      }))
      .sort(
        (a, b) =>
          b.mass - a.mass || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
      )
      .slice(0, ROOT_PREVIEW_LIMIT);
    byProject.set(projectId, roots);
  }

  return projects.map((project) => {
    const primary = project.genres.find((g) => g.role === "PRIMARY")?.genre;
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      setupCompleted: project.setupCompleted,
      status: project.status,
      isFavorite: project.isFavorite,
      updatedAt: project.updatedAt.toISOString(),
      primaryGenre: primary?.name ?? null,
      nodeCount: project._count.nodes,
      focusCount: project._count.designFocuses,
      rootStructure: byProject.get(project.id) ?? [],
    };
  });
}

export async function getProject(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      gameProfile: true,
      genres: { include: { genre: true }, orderBy: { role: "asc" } },
      intents: { orderBy: { version: "asc" } },
      designFocuses: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      nodes: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      classifications: {
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          nodeId: true,
          category: true,
          confidence: true,
          source: true,
          metadata: true,
        },
      },
      nodeRelations: true,
      /** Stored Ready-node analyses for relation evidence (no live AI). */
      aiAnalyses: {
        where: { type: "ready_node", status: "completed" },
        orderBy: [{ updatedAt: "desc" }],
        select: {
          id: true,
          nodeId: true,
          result: true,
          metadata: true,
          updatedAt: true,
        },
      },
    },
  });
}

export async function createProjectAction(raw: unknown) {
  const parsed = createProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const data = parsed.data;

  const project = await prisma.project.create({
    data: {
      name: data.name,
      type: data.type,
      customTypeLabel: data.customTypeLabel,
      status: "DRAFT",
      setupCompleted: false,
    },
  });

  revalidatePath("/");
  redirect(`/projects/${project.id}/setup`);
}

export async function completeGameSetupAction(raw: unknown) {
  const parsed = gameSetupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid setup" };
  }

  const data = parsed.data;
  const project = await prisma.project.findUnique({ where: { id: data.projectId } });
  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }
  if (project.type !== "GAME") {
    return { ok: false as const, error: "Game setup only applies to Game projects" };
  }

  const genreKeys = [data.primaryGenreKey, ...data.secondaryGenreKeys];
  await ensureGenresExist(genreKeys);

  const genres = await prisma.genre.findMany({
    where: { slug: { in: genreKeys } },
  });
  const bySlug = new Map(genres.map((g) => [g.slug, g]));

  const primary = bySlug.get(data.primaryGenreKey);
  if (!primary) {
    return { ok: false as const, error: "Primary genre not found" };
  }

  const areaNodeIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.projectGenre.deleteMany({ where: { projectId: data.projectId } });
    await tx.designFocus.deleteMany({ where: { projectId: data.projectId } });

    await tx.projectGenre.create({
      data: {
        projectId: data.projectId,
        genreId: primary.id,
        role: "PRIMARY",
      },
    });

    for (const key of data.secondaryGenreKeys) {
      const genre = bySlug.get(key);
      if (!genre) continue;
      await tx.projectGenre.create({
        data: {
          projectId: data.projectId,
          genreId: genre.id,
          role: "SECONDARY",
        },
      });
    }

    await tx.gameProfile.upsert({
      where: { projectId: data.projectId },
      update: {
        customGameType: data.customGameType ?? null,
      },
      create: {
        projectId: data.projectId,
        customGameType: data.customGameType ?? null,
      },
    });

    // Preserve original intent: if none exists, create version 1 as original.
    const existingIntent = await tx.projectIntentVersion.findFirst({
      where: { projectId: data.projectId },
      orderBy: { version: "desc" },
    });

    if (!existingIntent) {
      await tx.projectIntentVersion.create({
        data: {
          projectId: data.projectId,
          content: data.intent,
          version: 1,
          isOriginal: true,
        },
      });
    } else if (existingIntent.content !== data.intent) {
      await tx.projectIntentVersion.create({
        data: {
          projectId: data.projectId,
          content: data.intent,
          version: existingIntent.version + 1,
          isOriginal: false,
        },
      });
    }

    // Project Areas → top-level structural Nodes (FOLDER). Independent of Design Focus.
    let areaSort = 0;
    for (const area of data.selectedProjectAreas) {
      const createdArea = await tx.node.create({
        data: {
          projectId: data.projectId,
          parentId: null,
          name: area.name,
          type: "FOLDER",
          status: "IDEA",
          content: null,
          designFocusId: null,
          sortOrder: areaSort++,
        },
      });
      areaNodeIds.push(createdArea.id);
    }

    // Design Focuses → analysis criteria with targetImportance. Not structural blobs.
    const createdByKey = new Map<string, string>();
    let sort = 0;

    for (const focus of data.selectedFocuses) {
      const key = focus.parentName
        ? `${focus.parentName}::${focus.name}`
        : focus.name;

      let parentId: string | null = null;
      if (focus.parentName) {
        parentId = createdByKey.get(focus.parentName) ?? null;
      }

      const created = await tx.designFocus.create({
        data: {
          projectId: data.projectId,
          name: focus.name,
          parentId,
          targetImportance: focus.targetImportance,
          actualWeight: 0,
          confidence: 0,
          sortOrder: sort++,
          isCustom: focus.isCustom,
          templateSource: focus.templateSource ?? null,
        },
      });

      if (!focus.parentName) {
        createdByKey.set(focus.name, created.id);
      }
      createdByKey.set(key, created.id);
    }

    await tx.project.update({
      where: { id: data.projectId },
      data: {
        setupCompleted: true,
        status: "ACTIVE",
      },
    });
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/focus`);
  return { ok: true as const, areaNodeIds };
}

/**
 * Finish non-game setup: Intent + Project Areas + Design Focuses.
 * Same persistence pattern as game finish, without genres / GameProfile.
 */
export async function completeGenericSetupAction(raw: unknown) {
  const parsed = genericSetupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid setup" };
  }

  const data = parsed.data;
  const project = await prisma.project.findUnique({ where: { id: data.projectId } });
  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }
  if (isGameProjectType(project.type)) {
    return {
      ok: false as const,
      error: "Use game setup for Game projects",
    };
  }

  const areaNodeIds: string[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.designFocus.deleteMany({ where: { projectId: data.projectId } });

    const existingIntent = await tx.projectIntentVersion.findFirst({
      where: { projectId: data.projectId },
      orderBy: { version: "desc" },
    });

    if (!existingIntent) {
      await tx.projectIntentVersion.create({
        data: {
          projectId: data.projectId,
          content: data.intent,
          version: 1,
          isOriginal: true,
        },
      });
    } else if (existingIntent.content !== data.intent) {
      await tx.projectIntentVersion.create({
        data: {
          projectId: data.projectId,
          content: data.intent,
          version: existingIntent.version + 1,
          isOriginal: false,
        },
      });
    }

    let areaSort = 0;
    for (const area of data.selectedProjectAreas) {
      const createdArea = await tx.node.create({
        data: {
          projectId: data.projectId,
          parentId: null,
          name: area.name,
          type: "FOLDER",
          status: "IDEA",
          content: null,
          designFocusId: null,
          sortOrder: areaSort++,
        },
      });
      areaNodeIds.push(createdArea.id);
    }

    const createdByKey = new Map<string, string>();
    let sort = 0;

    for (const focus of data.selectedFocuses) {
      const key = focus.parentName
        ? `${focus.parentName}::${focus.name}`
        : focus.name;

      let parentId: string | null = null;
      if (focus.parentName) {
        parentId = createdByKey.get(focus.parentName) ?? null;
      }

      const created = await tx.designFocus.create({
        data: {
          projectId: data.projectId,
          name: focus.name,
          parentId,
          targetImportance: focus.targetImportance,
          actualWeight: 0,
          confidence: 0,
          sortOrder: sort++,
          isCustom: focus.isCustom,
          templateSource: focus.templateSource ?? null,
        },
      });

      if (!focus.parentName) {
        createdByKey.set(focus.name, created.id);
      }
      createdByKey.set(key, created.id);
    }

    await tx.project.update({
      where: { id: data.projectId },
      data: {
        setupCompleted: true,
        status: "ACTIVE",
      },
    });
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/focus`);
  return { ok: true as const, areaNodeIds };
}

export async function updateIntentAction(raw: unknown) {
  const parsed = updateIntentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid intent" };
  }

  const { projectId, content, reason } = parsed.data;
  const latest = await prisma.projectIntentVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
  });

  const amendmentText = content.trim();
  const reasonKey = reason?.trim() || "amendment";

  // Amendments stack onto the latest effective intent unless this is the first version.
  const stackedContent =
    latest && reasonKey === "amendment"
      ? `${latest.content.trim()}\n\n${amendmentText}`
      : amendmentText;

  // Never overwrite original — always append a new version when content changes.
  if (latest?.content === stackedContent) {
    return { ok: true as const };
  }

  await prisma.projectIntentVersion.create({
    data: {
      projectId,
      content: stackedContent,
      version: (latest?.version ?? 0) + 1,
      isOriginal: !latest,
      reason: reasonKey,
    },
  });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/intent`);
  revalidatePath(`/projects/${projectId}/profile`);
  return { ok: true as const };
}

export type UpdateProjectGenresResult =
  | { ok: true }
  | {
      ok: false;
      error: string;
      needsConfirmation?: boolean;
      alignment?: GenreIntentAlignment;
    };

/**
 * Update primary/secondary genres after setup.
 * On intent mismatch, returns needsConfirmation unless confirmMismatch is true.
 * Never silently changes genres based on AI.
 */
export async function updateProjectGenresAction(
  raw: unknown,
): Promise<UpdateProjectGenresResult> {
  const parsed = updateProjectGenresSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid genres",
    };
  }

  const data = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: data.projectId },
    include: {
      intents: { orderBy: { version: "desc" }, take: 1 },
    },
  });
  if (!project) {
    return { ok: false, error: "Project not found" };
  }
  if (!isGameProjectType(project.type)) {
    return {
      ok: false,
      error: "Genres apply to Game projects only",
    };
  }

  const secondaryGenreKeys = [
    ...new Set(
      data.secondaryGenreKeys.filter((key) => key !== data.primaryGenreKey),
    ),
  ];

  const intentText = project.intents[0]?.content?.trim() ?? "";
  if (intentText && !data.confirmMismatch) {
    const ai = getAIService();
    const suggestion = await ai.suggestSetupFromIntent(
      { projectId: data.projectId, intentText, projectType: project.type },
      { modelTier: "quick" },
    );
    if (suggestion.ok && suggestion.data) {
      const alignment = assessGenreIntentAlignment(
        data.primaryGenreKey,
        secondaryGenreKeys,
        suggestion.data,
      );
      if (!alignment.aligned) {
        return {
          ok: false,
          error: alignment.message,
          needsConfirmation: true,
          alignment,
        };
      }
    }
  }

  const genreKeys = [data.primaryGenreKey, ...secondaryGenreKeys];
  await ensureGenresExist(genreKeys);

  const genres = await prisma.genre.findMany({
    where: { slug: { in: genreKeys } },
  });
  const bySlug = new Map(genres.map((g) => [g.slug, g]));
  const primary = bySlug.get(data.primaryGenreKey);
  if (!primary) {
    return { ok: false, error: "Primary genre not found" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectGenre.deleteMany({ where: { projectId: data.projectId } });
    await tx.projectGenre.create({
      data: {
        projectId: data.projectId,
        genreId: primary.id,
        role: "PRIMARY",
      },
    });
    for (const key of secondaryGenreKeys) {
      const genre = bySlug.get(key);
      if (!genre) continue;
      await tx.projectGenre.create({
        data: {
          projectId: data.projectId,
          genreId: genre.id,
          role: "SECONDARY",
        },
      });
    }

    const customGameType =
      data.primaryGenreKey === "custom" || secondaryGenreKeys.includes("custom")
        ? data.customGameType?.trim() || null
        : data.customGameType?.trim() || null;

    await tx.gameProfile.upsert({
      where: { projectId: data.projectId },
      update: { customGameType },
      create: {
        projectId: data.projectId,
        customGameType,
      },
    });
  });

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/profile`);
  revalidatePath(`/projects/${data.projectId}/focus`);
  return { ok: true };
}

/**
 * Gather all recorded project substance for download (Markdown or JSON).
 * Scoped to a single projectId; no AI call.
 */
export async function exportProjectAction(raw: unknown) {
  const parsed = exportProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid export request",
    };
  }

  const { projectId, format } = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      gameProfile: true,
      genres: {
        include: { genre: true },
        orderBy: { role: "asc" },
      },
      intents: { orderBy: { version: "asc" } },
      designFocuses: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      nodes: {
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      },
      classifications: {
        orderBy: [{ updatedAt: "desc" }],
      },
      nodeRelations: {
        orderBy: [{ createdAt: "asc" }],
      },
      classificationRules: {
        orderBy: [{ name: "asc" }],
      },
      directionChecks: {
        orderBy: [{ createdAt: "desc" }],
      },
      aiAnalyses: {
        orderBy: [{ createdAt: "desc" }],
      },
      improvementSuggestions: {
        orderBy: [{ createdAt: "desc" }],
      },
    },
  });

  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }

  const payload = buildProjectExportPayload(project);
  const content =
    format === "json"
      ? serializeProjectExportJson(payload)
      : formatProjectExportMarkdown(payload);

  return {
    ok: true as const,
    format,
    filename: projectExportFilename(
      project.name,
      format,
      new Date(payload.exportedAt),
    ),
    content,
  };
}

/**
 * Cancel incomplete project setup: delete the DRAFT project created mid-wizard
 * and return the user to home. Refuses completed/active projects.
 */
export async function abandonProjectSetupAction(raw: unknown) {
  const parsed = abandonProjectSetupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId } = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, setupCompleted: true, status: true },
  });
  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }
  if (project.setupCompleted || project.status !== "DRAFT") {
    return {
      ok: false as const,
      error: "Only incomplete draft projects can be discarded from setup.",
    };
  }

  await prisma.project.delete({ where: { id: projectId } });
  revalidatePath("/");
  redirect("/");
}

/** Persist favorite flag for home landing filter (multi-device). */
export async function toggleProjectFavoriteAction(raw: unknown) {
  const parsed = toggleProjectFavoriteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, isFavorite } = parsed.data;

  const favoriteField = (
    prisma as { project?: { fields?: { isFavorite?: unknown } } }
  ).project?.fields?.isFavorite;
  if (typeof favoriteField === "undefined") {
    console.error(
      "[toggleProjectFavorite] prisma.project.fields.isFavorite missing — run prisma generate and restart the dev server",
    );
    return {
      ok: false as const,
      error:
        "Favorites unavailable (Prisma client outdated). Run prisma migrate deploy, prisma generate, then restart the dev server.",
    };
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false as const, error: "Project not found" };
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { isFavorite },
    });
    revalidatePath("/");
    return { ok: true as const, isFavorite };
  } catch (error) {
    console.error("[toggleProjectFavorite]", error);
    const message =
      error instanceof Error ? error.message : "Failed to update favorite";
    const schemaMismatch =
      message.includes("isFavorite") ||
      message.includes("Unknown arg") ||
      message.includes("column") ||
      /PrismaClientValidationError/i.test(
        error instanceof Error ? error.name : "",
      );
    return {
      ok: false as const,
      error: schemaMismatch
        ? "Favorites unavailable (database or Prisma client outdated). Run prisma migrate deploy, prisma generate, then restart the dev server."
        : "Could not update favorite. Try again.",
    };
  }
}

/**
 * Permanently delete one project and cascaded related rows (Prisma onDelete: Cascade).
 * Requires confirmName to match the project name (case-insensitive).
 */
export async function deleteProjectAction(raw: unknown) {
  const parsed = deleteProjectSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid delete request",
    };
  }

  const { projectId, confirmName } = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }
  const nameMatches =
    confirmName.trim().localeCompare(project.name.trim(), undefined, {
      sensitivity: "base",
    }) === 0;
  if (!nameMatches) {
    return {
      ok: false as const,
      error: "Project name does not match. Type the project name to confirm.",
    };
  }

  await prisma.project.delete({ where: { id: projectId } });

  revalidatePath("/");
  return { ok: true as const };
}

function normalizeGithubRepo(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(
    /^https?:\/\/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)\/?$/,
  );
  if (urlMatch?.[1]) return urlMatch[1];
  return trimmed.replace(/^\/+|\/+$/g, "");
}

/** Link or unlink a GitHub repository (owner/name) on a project. */
export async function updateProjectGithubRepoAction(raw: unknown) {
  const parsed = updateProjectGithubRepoSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid GitHub repo",
    };
  }

  const githubRepo = normalizeGithubRepo(parsed.data.githubRepo);
  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true },
  });
  if (!project) {
    return { ok: false as const, error: "Project not found" };
  }

  await prisma.project.update({
    where: { id: parsed.data.projectId },
    data: { githubRepo },
  });

  revalidatePath(`/projects/${parsed.data.projectId}/profile`);
  revalidatePath(`/projects/${parsed.data.projectId}`);
  return { ok: true as const, githubRepo };
}
