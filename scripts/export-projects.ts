/**
 * Export all (or selected) projects to a JSON file for application-level migration.
 * Does NOT export User/Account/Session. Project.userId is omitted (import forces null).
 *
 * Usage:
 *   npm run db:export-projects
 *   npm run db:export-projects -- --out=brain-projects.json
 *   npm run db:export-projects -- --project=Valorush
 *   npm run db:export-projects -- --project=clxyz...
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  EXPORT_FORMAT_VERSION,
  ProjectMigrateFileSchema,
  argValue,
} from "./lib/project-migrate-types";

function serializeDates<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      v instanceof Date ? v.toISOString() : v,
    ),
  ) as T;
}

async function main() {
  const outArg = argValue("--out") ?? argValue("-o");
  const projectKey = argValue("--project");
  const outPath = resolve(
    process.cwd(),
    outArg ??
      `brain-projects-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    let projectIds: string[] | undefined;

    if (projectKey) {
      const byId = await prisma.project.findFirst({
        where: { id: projectKey },
        select: { id: true, name: true },
      });
      const matches = byId
        ? [byId]
        : await prisma.project.findMany({
            where: { name: projectKey },
            select: { id: true, name: true },
          });

      if (matches.length === 0) {
        console.error(`No project matching "${projectKey}" (id or exact name).`);
        process.exit(1);
      }
      if (matches.length > 1) {
        console.error(
          `Multiple projects named "${projectKey}". Pass --project=<id>:`,
        );
        for (const p of matches) {
          console.error(`  ${p.id}  ${p.name}`);
        }
        process.exit(1);
      }
      projectIds = [matches[0].id];
      console.log(`Exporting project "${matches[0].name}" (${matches[0].id})`);
    }

    const projects = await prisma.project.findMany({
      where: projectIds ? { id: { in: projectIds } } : undefined,
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        customTypeLabel: true,
        status: true,
        setupCompleted: true,
        isFavorite: true,
        githubRepo: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (projects.length === 0) {
      console.error("No projects found to export.");
      process.exit(1);
    }

    const ids = projects.map((p) => p.id);

    const [
      intents,
      gameProfiles,
      projectGenres,
      designFocuses,
      nodes,
      nodeImages,
      nodeRelations,
      classifications,
      aiAnalyses,
      classificationRules,
      directionChecks,
      improvementSuggestions,
      chatThreads,
    ] = await Promise.all([
      prisma.projectIntentVersion.findMany({
        where: { projectId: { in: ids } },
        orderBy: [{ projectId: "asc" }, { version: "asc" }],
      }),
      prisma.gameProfile.findMany({ where: { projectId: { in: ids } } }),
      prisma.projectGenre.findMany({
        where: { projectId: { in: ids } },
        include: { genre: { select: { slug: true } } },
      }),
      prisma.designFocus.findMany({
        where: { projectId: { in: ids } },
        orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.node.findMany({
        where: { projectId: { in: ids } },
        orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.nodeImage.findMany({
        where: { projectId: { in: ids } },
        orderBy: [{ projectId: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.nodeRelation.findMany({ where: { projectId: { in: ids } } }),
      prisma.nodeClassification.findMany({
        where: { projectId: { in: ids } },
      }),
      prisma.aIAnalysis.findMany({ where: { projectId: { in: ids } } }),
      prisma.projectClassificationRule.findMany({
        where: { projectId: { in: ids } },
      }),
      prisma.directionCheck.findMany({ where: { projectId: { in: ids } } }),
      prisma.improvementSuggestion.findMany({
        where: { projectId: { in: ids } },
      }),
      prisma.chatThread.findMany({
        where: { projectId: { in: ids } },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const genreIds = [...new Set(projectGenres.map((pg) => pg.genreId))];
    const genres =
      genreIds.length > 0
        ? await prisma.genre.findMany({ where: { id: { in: genreIds } } })
        : [];

    const bundles = projects.map((project) => {
      const pid = project.id;
      return {
        project,
        intents: intents.filter((r) => r.projectId === pid),
        gameProfile: gameProfiles.find((r) => r.projectId === pid) ?? null,
        projectGenres: projectGenres
          .filter((r) => r.projectId === pid)
          .map(({ genre, ...rest }) => ({
            ...rest,
            genreSlug: genre.slug,
          })),
        designFocuses: designFocuses.filter((r) => r.projectId === pid),
        nodes: nodes.filter((r) => r.projectId === pid),
        nodeImages: nodeImages.filter((r) => r.projectId === pid),
        nodeRelations: nodeRelations.filter((r) => r.projectId === pid),
        classifications: classifications.filter((r) => r.projectId === pid),
        aiAnalyses: aiAnalyses.filter((r) => r.projectId === pid),
        classificationRules: classificationRules.filter(
          (r) => r.projectId === pid,
        ),
        directionChecks: directionChecks.filter((r) => r.projectId === pid),
        improvementSuggestions: improvementSuggestions.filter(
          (r) => r.projectId === pid,
        ),
        chatThreads: chatThreads
          .filter((r) => r.projectId === pid)
          .map(({ messages, ...thread }) => ({
            ...thread,
            messages,
          })),
      };
    });

    const payload = serializeDates({
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      source: {
        projectCount: bundles.length,
      },
      genres,
      projects: bundles,
    });

    const validated = ProjectMigrateFileSchema.parse(payload);

    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");

    console.log(`Wrote ${bundles.length} project(s) → ${outPath}`);
    for (const b of bundles) {
      console.log(
        `  - ${b.project.name} (${b.project.id}): nodes=${b.nodes.length}, focuses=${b.designFocuses.length}, chats=${b.chatThreads.length}`,
      );
    }
    console.log(
      "Note: auth users/sessions are not exported. Import will set userId=null (claimable).",
    );
    console.log(
      "Note: NodeImage rows export URL metadata only; copy public/uploads separately if needed.",
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
