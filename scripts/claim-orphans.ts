/**
 * One-shot: assign all Project rows with userId=null to a user (by email).
 *
 * Usage (against the DB you intend to fix — usually production after restore):
 *   set DATABASE_URL=...
 *   npm run db:claim-orphans -- --email=you@example.com
 *
 * Optional: claim a single project by id or exact name:
 *   npm run db:claim-orphans -- --email=you@example.com --project=Valorush
 *   npm run db:claim-orphans -- --email=you@example.com --project=clxyz...
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

function argValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const hit = process.argv.find((a) => a === flag || a.startsWith(prefix));
  if (!hit) return undefined;
  if (hit.startsWith(prefix)) return hit.slice(prefix.length).trim();
  const idx = process.argv.indexOf(hit);
  return process.argv[idx + 1]?.trim();
}

async function main() {
  const email = argValue("--email")?.toLowerCase();
  const projectKey = argValue("--project");

  if (!email) {
    console.error(
      "Usage: npm run db:claim-orphans -- --email=you@example.com [--project=name-or-id]",
    );
    process.exit(1);
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.error(
        `No user with email "${email}" in this database. Sign in once on that server first, then re-run.`,
      );
      process.exit(1);
    }

    if (projectKey) {
      const byId = await prisma.project.findFirst({
        where: { id: projectKey, userId: null },
      });
      const matches = byId
        ? [byId]
        : await prisma.project.findMany({
            where: { name: projectKey, userId: null },
          });

      if (matches.length === 0) {
        console.error(
          `No unowned project matching "${projectKey}" (id or exact name).`,
        );
        process.exit(1);
      }
      if (matches.length > 1) {
        console.error(
          `Multiple unowned projects named "${projectKey}". Pass --project=<id> instead:`,
        );
        for (const p of matches) {
          console.error(`  ${p.id}  ${p.name}`);
        }
        process.exit(1);
      }

      await prisma.project.update({
        where: { id: matches[0].id },
        data: { userId: user.id },
      });
      console.log(
        `Claimed 1 project "${matches[0].name}" (${matches[0].id}) → ${email}`,
      );
      return;
    }

    const result = await prisma.project.updateMany({
      where: { userId: null },
      data: { userId: user.id },
    });
    console.log(
      `Claimed ${result.count} unowned project(s) → ${email} (${user.id})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
