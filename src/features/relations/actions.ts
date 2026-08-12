"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { createRelationSchema } from "@/lib/validation";

export async function listRelations(projectId: string) {
  return prisma.nodeRelation.findMany({
    where: { projectId },
    include: {
      sourceNode: { select: { id: true, name: true, type: true } },
      targetNode: { select: { id: true, name: true, type: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createRelationAction(raw: unknown) {
  const parsed = createRelationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid relation",
    };
  }

  const data = parsed.data;
  if (data.sourceNodeId === data.targetNodeId) {
    return { ok: false as const, error: "A node cannot relate to itself" };
  }

  const [source, target] = await Promise.all([
    prisma.node.findFirst({
      where: { id: data.sourceNodeId, projectId: data.projectId },
    }),
    prisma.node.findFirst({
      where: { id: data.targetNodeId, projectId: data.projectId },
    }),
  ]);

  if (!source || !target) {
    return { ok: false as const, error: "Both nodes must belong to the project" };
  }

  try {
    const relation = await prisma.nodeRelation.create({
      data: {
        projectId: data.projectId,
        sourceNodeId: data.sourceNodeId,
        targetNodeId: data.targetNodeId,
        type: data.type,
        label: data.label ?? null,
      },
    });

    revalidatePath(`/projects/${data.projectId}`);
    revalidatePath(`/projects/${data.projectId}/focus`);
    revalidatePath(`/projects/${data.projectId}/graph`);
    revalidatePath(`/projects/${data.projectId}/nodes/${data.sourceNodeId}`);
    revalidatePath(`/projects/${data.projectId}/nodes/${data.targetNodeId}`);
    return { ok: true as const, relation };
  } catch {
    return {
      ok: false as const,
      error: "This relation already exists",
    };
  }
}

export async function deleteRelationAction(id: string) {
  const existing = await prisma.nodeRelation.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Relation not found" };
  }

  await prisma.nodeRelation.delete({ where: { id } });
  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/projects/${existing.projectId}/graph`);
  revalidatePath(`/projects/${existing.projectId}/nodes/${existing.sourceNodeId}`);
  revalidatePath(`/projects/${existing.projectId}/nodes/${existing.targetNodeId}`);
  return { ok: true as const };
}
