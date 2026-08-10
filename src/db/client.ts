import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres (docker compose up -d).",
    );
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

/** True when a hot-reloaded global client was built from an older generated schema. */
function isStalePrismaClient(client: PrismaClient): boolean {
  const delegates = client as {
    chatThread?: unknown;
    nodeImage?: unknown;
    project?: { fields?: { isFavorite?: unknown } };
  };
  if (typeof delegates.chatThread === "undefined") {
    return true;
  }
  if (typeof delegates.nodeImage === "undefined") {
    return true;
  }
  // New scalar fields do not appear as top-level delegates — check Project.fields.
  return typeof delegates.project?.fields?.isFavorite === "undefined";
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (cached && !isStalePrismaClient(cached)) {
    return cached;
  }

  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
  }
  return client;
}

export const prisma = getPrismaClient();
