"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";

const positionsSchema = z.object({
  projectId: z.string().min(1),
  positions: z
    .array(
      z.object({
        id: z.string().min(1),
        posX: z.number(),
        posY: z.number(),
      }),
    )
    .max(500),
});

export async function updateNodePositionsAction(raw: unknown) {
  const parsed = positionsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid positions",
    };
  }

  const { projectId, positions } = parsed.data;
  await prisma.$transaction(
    positions.map((p) =>
      prisma.node.updateMany({
        where: { id: p.id, projectId },
        data: { posX: p.posX, posY: p.posY },
      }),
    ),
  );

  revalidatePath(`/projects/${projectId}/canvas`);
  revalidatePath(`/projects/${projectId}/graph`);
  return { ok: true as const };
}
