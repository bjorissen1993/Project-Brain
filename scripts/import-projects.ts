/**
 * Import projects from a JSON export (application-level, multi-pass for circular FKs).
 * Never wipes the target DB. Never silently overwrites existing projects.
 * Imported projects always get userId=null so the existing claim flow works.
 *
 * Usage:
 *   npm run db:import-projects -- brain-projects.json
 *   npm run db:import-projects -- brain-projects.json --dry-run
 *   npm run db:import-projects -- brain-projects.json --fail-on-conflict
 *
 * Default conflict policy: --skip-existing (skip projects whose id already exists).
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../src/generated/prisma/client";
import {
  ProjectMigrateFileSchema,
  argValue,
  hasFlag,
  toDate,
  type ProjectBundle,
  type ProjectMigrateFile,
} from "./lib/project-migrate-types";

type JsonInput = Prisma.InputJsonValue;

function asJson(value: unknown): JsonInput | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as JsonInput;
}

function positionalFileArg(): string | undefined {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  return args[0];
}

async function ensureGenres(
  prisma: PrismaClient,
  file: ProjectMigrateFile,
  dryRun: boolean,
): Promise<Map<string, string>> {
  /** Map export genreId → target genreId */
  const map = new Map<string, string>();

  for (const g of file.genres) {
    const existingBySlug = await prisma.genre.findUnique({
      where: { slug: g.slug },
    });
    if (existingBySlug) {
      map.set(g.id, existingBySlug.id);
      continue;
    }

    if (dryRun) {
      map.set(g.id, g.id);
      console.log(`  [dry-run] would create Genre slug=${g.slug} id=${g.id}`);
      continue;
    }

    const idTaken = await prisma.genre.findUnique({ where: { id: g.id } });
    const created = await prisma.genre.create({
      data: {
        id: idTaken ? undefined : g.id,
        slug: g.slug,
        name: g.name,
        description: g.description,
        templateKey: g.templateKey,
        createdAt: toDate(g.createdAt),
        updatedAt: toDate(g.updatedAt),
      },
    });
    map.set(g.id, created.id);
    console.log(`  Created Genre slug=${g.slug} id=${created.id}`);
  }

  // Also resolve slugs referenced by projectGenres that might not be in genres[]
  // (defensive — export always includes them).
  for (const bundle of file.projects) {
    for (const pg of bundle.projectGenres) {
      if (map.has(pg.genreId)) continue;
      const bySlug = await prisma.genre.findUnique({
        where: { slug: pg.genreSlug },
      });
      if (bySlug) {
        map.set(pg.genreId, bySlug.id);
      }
    }
  }

  return map;
}

function summarizeBundle(bundle: ProjectBundle): string {
  const p = bundle.project;
  return `${p.name} (${p.id}): nodes=${bundle.nodes.length}, focuses=${bundle.designFocuses.length}, relations=${bundle.nodeRelations.length}, chats=${bundle.chatThreads.length}`;
}

async function importProject(
  prisma: PrismaClient,
  bundle: ProjectBundle,
  genreIdMap: Map<string, string>,
): Promise<void> {
  const projectId = bundle.project.id;
  const p = bundle.project;

  await prisma.$transaction(async (tx) => {
    // Pass 1 — base project (unclaimed)
    await tx.project.create({
      data: {
        id: p.id,
        name: p.name,
        type: p.type,
        customTypeLabel: p.customTypeLabel,
        status: p.status,
        setupCompleted: p.setupCompleted,
        isFavorite: p.isFavorite,
        githubRepo: p.githubRepo,
        userId: null,
        createdAt: toDate(p.createdAt),
        updatedAt: toDate(p.updatedAt),
      },
    });

    if (bundle.intents.length > 0) {
      await tx.projectIntentVersion.createMany({
        data: bundle.intents.map((i) => ({
          id: i.id,
          projectId,
          content: i.content,
          version: i.version,
          isOriginal: i.isOriginal,
          reason: i.reason,
          createdAt: toDate(i.createdAt),
        })),
      });
    }

    if (bundle.gameProfile) {
      const gp = bundle.gameProfile;
      await tx.gameProfile.create({
        data: {
          id: gp.id,
          projectId,
          customGameType: gp.customGameType,
          notes: gp.notes,
          aiProfileMeta: asJson(gp.aiProfileMeta),
          createdAt: toDate(gp.createdAt),
          updatedAt: toDate(gp.updatedAt),
        },
      });
    }

    if (bundle.projectGenres.length > 0) {
      await tx.projectGenre.createMany({
        data: bundle.projectGenres.map((pg) => {
          const targetGenreId = genreIdMap.get(pg.genreId);
          if (!targetGenreId) {
            throw new Error(
              `Missing genre mapping for genreId=${pg.genreId} slug=${pg.genreSlug}`,
            );
          }
          return {
            id: pg.id,
            projectId,
            genreId: targetGenreId,
            role: pg.role,
            createdAt: toDate(pg.createdAt),
          };
        }),
      });
    }

    // Pass 2a — DesignFocus without parents (circular self-FK)
    if (bundle.designFocuses.length > 0) {
      await tx.designFocus.createMany({
        data: bundle.designFocuses.map((f) => ({
          id: f.id,
          projectId,
          name: f.name,
          parentId: null,
          targetImportance: f.targetImportance,
          actualWeight: f.actualWeight,
          confidence: f.confidence,
          sortOrder: f.sortOrder,
          isCustom: f.isCustom,
          templateSource: f.templateSource,
          createdAt: toDate(f.createdAt),
          updatedAt: toDate(f.updatedAt),
        })),
      });

      for (const f of bundle.designFocuses) {
        if (!f.parentId) continue;
        await tx.designFocus.update({
          where: { id: f.id },
          data: { parentId: f.parentId },
        });
      }
    }

    // Pass 2b — Nodes without parents (circular self-FK); designFocusId ok after focuses
    if (bundle.nodes.length > 0) {
      await tx.node.createMany({
        data: bundle.nodes.map((n) => ({
          id: n.id,
          projectId,
          parentId: null,
          name: n.name,
          type: n.type,
          customTypeLabel: n.customTypeLabel,
          status: n.status,
          content: n.content,
          summary: n.summary,
          projectImpact: n.projectImpact,
          designFocusId: n.designFocusId,
          gamePhase: n.gamePhase,
          posX: n.posX,
          posY: n.posY,
          sortOrder: n.sortOrder,
          createdAt: toDate(n.createdAt),
          updatedAt: toDate(n.updatedAt),
        })),
      });

      for (const n of bundle.nodes) {
        if (!n.parentId) continue;
        await tx.node.update({
          where: { id: n.id },
          data: { parentId: n.parentId },
        });
      }
    }

    // Pass 3 — dependent rows
    if (bundle.nodeImages.length > 0) {
      await tx.nodeImage.createMany({
        data: bundle.nodeImages.map((img) => ({
          id: img.id,
          projectId,
          nodeId: img.nodeId,
          url: img.url,
          filename: img.filename,
          mimeType: img.mimeType,
          sortOrder: img.sortOrder,
          createdAt: toDate(img.createdAt),
        })),
      });
    }

    if (bundle.nodeRelations.length > 0) {
      await tx.nodeRelation.createMany({
        data: bundle.nodeRelations.map((r) => ({
          id: r.id,
          projectId,
          sourceNodeId: r.sourceNodeId,
          targetNodeId: r.targetNodeId,
          type: r.type,
          label: r.label,
          metadata: asJson(r.metadata),
          createdAt: toDate(r.createdAt),
          updatedAt: toDate(r.updatedAt),
        })),
      });
    }

    if (bundle.classifications.length > 0) {
      await tx.nodeClassification.createMany({
        data: bundle.classifications.map((c) => ({
          id: c.id,
          projectId,
          nodeId: c.nodeId,
          category: c.category,
          confidence: c.confidence,
          source: c.source,
          metadata: asJson(c.metadata),
          createdAt: toDate(c.createdAt),
          updatedAt: toDate(c.updatedAt),
        })),
      });
    }

    if (bundle.aiAnalyses.length > 0) {
      await tx.aIAnalysis.createMany({
        data: bundle.aiAnalyses.map((a) => ({
          id: a.id,
          projectId,
          nodeId: a.nodeId,
          type: a.type,
          model: a.model,
          status: a.status,
          inputHash: a.inputHash,
          result: asJson(a.result),
          metadata: asJson(a.metadata),
          createdAt: toDate(a.createdAt),
          updatedAt: toDate(a.updatedAt),
        })),
      });
    }

    if (bundle.classificationRules.length > 0) {
      await tx.projectClassificationRule.createMany({
        data: bundle.classificationRules.map((r) => ({
          id: r.id,
          projectId,
          name: r.name,
          rule: asJson(r.rule) as JsonInput,
          isActive: r.isActive,
          createdAt: toDate(r.createdAt),
          updatedAt: toDate(r.updatedAt),
        })),
      });
    }

    if (bundle.directionChecks.length > 0) {
      await tx.directionCheck.createMany({
        data: bundle.directionChecks.map((d) => ({
          id: d.id,
          projectId,
          nodeId: d.nodeId,
          intentVersionId: d.intentVersionId,
          status: d.status,
          result: asJson(d.result),
          createdAt: toDate(d.createdAt),
          updatedAt: toDate(d.updatedAt),
        })),
      });
    }

    if (bundle.improvementSuggestions.length > 0) {
      await tx.improvementSuggestion.createMany({
        data: bundle.improvementSuggestions.map((s) => ({
          id: s.id,
          projectId,
          nodeId: s.nodeId,
          status: s.status,
          suggestion: asJson(s.suggestion) as JsonInput,
          createdAt: toDate(s.createdAt),
          updatedAt: toDate(s.updatedAt),
        })),
      });
    }

    for (const thread of bundle.chatThreads) {
      await tx.chatThread.create({
        data: {
          id: thread.id,
          projectId,
          contextNodeId: thread.contextNodeId,
          title: thread.title,
          attachedGptText: thread.attachedGptText,
          attachedGptUrl: thread.attachedGptUrl,
          attachedGptSource: thread.attachedGptSource,
          createdAt: toDate(thread.createdAt),
          updatedAt: toDate(thread.updatedAt),
        },
      });
      if (thread.messages.length > 0) {
        await tx.chatMessage.createMany({
          data: thread.messages.map((m) => ({
            id: m.id,
            threadId: thread.id,
            role: m.role,
            content: m.content,
            proposals: asJson(m.proposals),
            metadata: asJson(m.metadata),
            createdAt: toDate(m.createdAt),
          })),
        });
      }
    }
  });
}

async function main() {
  const fileArg = positionalFileArg() ?? argValue("--file");
  const dryRun = hasFlag("--dry-run");
  const failOnConflict = hasFlag("--fail-on-conflict");
  // Default conflict policy is skip-existing (pass --fail-on-conflict to abort).

  if (!fileArg) {
    console.error(
      "Usage: npm run db:import-projects -- <file.json> [--dry-run] [--skip-existing|--fail-on-conflict]",
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (err) {
    console.error(`Failed to read/parse ${filePath}:`, err);
    process.exit(1);
  }

  const parsed = ProjectMigrateFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error("Zod validation failed:");
    console.error(parsed.error.toString());
    process.exit(1);
  }
  const file = parsed.data;

  console.log(
    `Import file: ${filePath} (format v${file.formatVersion}, ${file.projects.length} project(s))`,
  );
  console.log(
    `Target DATABASE_URL host hint: ${connectionString.replace(/:[^:@/]+@/, ":***@").slice(0, 120)}`,
  );
  console.log(
    `Mode: ${dryRun ? "DRY-RUN (no writes)" : "WRITE"} | conflicts: ${failOnConflict ? "fail" : "skip-existing"}`,
  );
  console.log("Imported projects will have userId=null (claimable).");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  const toCreate: ProjectBundle[] = [];
  const toSkip: { id: string; name: string; reason: string }[] = [];

  try {
    for (const bundle of file.projects) {
      const existing = await prisma.project.findUnique({
        where: { id: bundle.project.id },
        select: { id: true, name: true },
      });
      if (existing) {
        if (failOnConflict) {
          console.error(
            `Conflict: project id ${existing.id} already exists as "${existing.name}". Aborting (--fail-on-conflict).`,
          );
          process.exit(1);
        }
        toSkip.push({
          id: existing.id,
          name: bundle.project.name,
          reason: `id exists as "${existing.name}"`,
        });
        continue;
      }
      toCreate.push(bundle);
    }

    console.log("\nPlan:");
    for (const b of toCreate) {
      console.log(`  CREATE  ${summarizeBundle(b)}`);
    }
    for (const s of toSkip) {
      console.log(`  SKIP    ${s.name} (${s.id}) — ${s.reason}`);
    }

    if (dryRun) {
      console.log(
        `\nDry-run complete: would create ${toCreate.length}, skip ${toSkip.length}. No DB writes.`,
      );
      if (file.genres.length > 0) {
        console.log(
          `(Genres: ${file.genres.length} catalog row(s) would be matched by slug or created if missing.)`,
        );
      }
      return;
    }

    if (toCreate.length === 0) {
      console.log("\nNothing to import.");
      return;
    }

    console.log("\nEnsuring genres…");
    const genreIdMap = await ensureGenres(prisma, file, false);

    let created = 0;
    for (const bundle of toCreate) {
      process.stdout.write(`Importing ${bundle.project.name}… `);
      await importProject(prisma, bundle, genreIdMap);
      created += 1;
      console.log("ok");
    }

    console.log(
      `\nDone: created ${created}, skipped ${toSkip.length}. Claim via Settings or npm run db:claim-orphans.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
