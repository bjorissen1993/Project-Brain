import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { GENRE_TEMPLATES } from "../src/features/game-profile/genre-templates";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const template of GENRE_TEMPLATES) {
    await prisma.genre.upsert({
      where: { slug: template.key },
      update: {
        name: template.name,
        description: template.description,
        templateKey: template.key,
      },
      create: {
        slug: template.key,
        name: template.name,
        description: template.description,
        templateKey: template.key,
      },
    });
  }

  console.log(`Seeded ${GENRE_TEMPLATES.length} genres from code templates.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
