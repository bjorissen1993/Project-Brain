"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { runReadyAnalysis } from "@/features/analysis/ready-analysis";
import { recalculateProjectBalance } from "@/features/design-focus/balance-engine";
import {
  createNodeSchema,
  moveNodeInTreeSchema,
  updateNodeSchema,
} from "@/lib/validation";
import { buildNodeTree } from "@/features/projects/tree";

function revalidateNodePaths(projectId: string, nodeId?: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/tree`);
  revalidatePath(`/projects/${projectId}/focus`);
  revalidatePath(`/projects/${projectId}/design-focus`);
  revalidatePath(`/projects/${projectId}/balance`);
  if (nodeId) {
    revalidatePath(`/projects/${projectId}/nodes/${nodeId}`);
    revalidatePath(`/projects/${projectId}/focus/${nodeId}`);
  }
}

/**
 * When a content element gains children (nest/create under it), promote it to FOLDER.
 * Does not demote when children are removed.
 */
async function promoteParentToFolderIfNeeded(
  parentId: string | null | undefined,
  projectId: string,
) {
  if (!parentId) return;
  const parent = await prisma.node.findFirst({
    where: { id: parentId, projectId },
    select: { id: true, type: true },
  });
  if (!parent || parent.type === "FOLDER") return;

  await prisma.node.update({
    where: { id: parent.id },
    data: { type: "FOLDER", customTypeLabel: null },
  });
  revalidatePath(`/projects/${projectId}/nodes/${parent.id}`);
  revalidatePath(`/projects/${projectId}/focus/${parent.id}`);
}

export async function listNodeTree(projectId: string) {
  const rows = await prisma.node.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return buildNodeTree(rows);
}

export async function getNode(nodeId: string) {
  return prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      designFocus: true,
      children: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
      sourceRelations: {
        include: { targetNode: { select: { id: true, name: true, type: true } } },
      },
      targetRelations: {
        include: { sourceNode: { select: { id: true, name: true, type: true } } },
      },
    },
  });
}

export async function createNodeAction(raw: unknown) {
  const parsed = createNodeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid node" };
  }

  const data = parsed.data;

  if (data.parentId) {
    const parent = await prisma.node.findFirst({
      where: { id: data.parentId, projectId: data.projectId },
    });
    if (!parent) {
      return { ok: false as const, error: "Parent node not found in this project" };
    }
  }

  const maxSort = await prisma.node.aggregate({
    where: { projectId: data.projectId, parentId: data.parentId ?? null },
    _max: { sortOrder: true },
  });

  const node = await prisma.node.create({
    data: {
      projectId: data.projectId,
      parentId: data.parentId ?? null,
      name: data.name,
      type: data.type,
      customTypeLabel: data.type === "CUSTOM" ? data.customTypeLabel ?? "Custom" : null,
      status: data.status,
      content: data.content ?? null,
      designFocusId: data.designFocusId ?? null,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  await promoteParentToFolderIfNeeded(data.parentId, data.projectId);

  let analysis:
    | Awaited<ReturnType<typeof runReadyAnalysis>>
    | undefined;
  if (node.status === "READY") {
    analysis = await runReadyAnalysis(node.id);
  }

  revalidateNodePaths(data.projectId, node.id);
  return { ok: true as const, node, analysis };
}

async function assertValidParentChange(
  id: string,
  projectId: string,
  parentId: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (parentId === undefined) return { ok: true };
  if (parentId === id) {
    return { ok: false, error: "A node cannot be its own parent" };
  }
  if (parentId == null) return { ok: true };

  const parent = await prisma.node.findFirst({
    where: { id: parentId, projectId },
  });
  if (!parent) {
    return { ok: false, error: "Parent node not found in this project" };
  }

  // Prevent cycles: parent cannot be a descendant of this node.
  const descendants = await prisma.node.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string, string[]>();
  for (const row of descendants) {
    if (!row.parentId) continue;
    const list = childrenMap.get(row.parentId) ?? [];
    list.push(row.id);
    childrenMap.set(row.parentId, list);
  }
  const stack = [...(childrenMap.get(id) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === parentId) {
      return { ok: false, error: "Cannot move a node under its descendant" };
    }
    stack.push(...(childrenMap.get(current) ?? []));
  }
  return { ok: true };
}

export async function updateNodeAction(raw: unknown) {
  const parsed = updateNodeSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid node" };
  }

  const { id, ...rest } = parsed.data;
  const existing = await prisma.node.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Node not found" };
  }

  const parentCheck = await assertValidParentChange(
    id,
    existing.projectId,
    rest.parentId,
  );
  if (!parentCheck.ok) {
    return { ok: false as const, error: parentCheck.error };
  }

  const becameReady =
    rest.status === "READY" && existing.status !== "READY";
  const leftReady =
    rest.status !== undefined &&
    rest.status !== "READY" &&
    existing.status === "READY";
  const contentChanged =
    rest.content !== undefined && rest.content !== existing.content;
  const wasOrIsReady =
    existing.status === "READY" || rest.status === "READY";

  const parentChanged =
    rest.parentId !== undefined && rest.parentId !== existing.parentId;

  const node = await prisma.node.update({
    where: { id },
    data: {
      ...(rest.name !== undefined ? { name: rest.name } : {}),
      ...(rest.type !== undefined ? { type: rest.type } : {}),
      ...(rest.customTypeLabel !== undefined
        ? { customTypeLabel: rest.customTypeLabel }
        : {}),
      ...(rest.status !== undefined ? { status: rest.status } : {}),
      ...(rest.content !== undefined ? { content: rest.content } : {}),
      ...(rest.summary !== undefined ? { summary: rest.summary } : {}),
      ...(rest.parentId !== undefined ? { parentId: rest.parentId } : {}),
      ...(rest.designFocusId !== undefined
        ? { designFocusId: rest.designFocusId }
        : {}),
      ...(rest.gamePhase !== undefined ? { gamePhase: rest.gamePhase } : {}),
      ...(rest.sortOrder !== undefined ? { sortOrder: rest.sortOrder } : {}),
    },
  });

  if (parentChanged) {
    await promoteParentToFolderIfNeeded(rest.parentId, existing.projectId);
  }

  let analysis:
    | Awaited<ReturnType<typeof runReadyAnalysis>>
    | undefined;
  if (becameReady) {
    analysis = await runReadyAnalysis(id);
  } else if (wasOrIsReady && (contentChanged || leftReady)) {
    // Content gating affects fill; recalculate without re-running AI.
    await recalculateProjectBalance(existing.projectId);
  }

  revalidateNodePaths(existing.projectId, id);
  return { ok: true as const, node, analysis };
}

/**
 * Move a node under a new parent (or same parent) at a sibling index.
 * Reindexes all siblings under the destination parent so order is stable.
 */
export async function moveNodeInTreeAction(raw: unknown) {
  const parsed = moveNodeInTreeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid move",
    };
  }

  const { id, parentId, index } = parsed.data;
  const existing = await prisma.node.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Node not found" };
  }

  const parentCheck = await assertValidParentChange(
    id,
    existing.projectId,
    parentId,
  );
  if (!parentCheck.ok) {
    return { ok: false as const, error: parentCheck.error };
  }

  const siblings = await prisma.node.findMany({
    where: {
      projectId: existing.projectId,
      parentId,
      id: { not: id },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });

  const clampedIndex = Math.min(Math.max(index, 0), siblings.length);
  const orderedIds = [
    ...siblings.slice(0, clampedIndex).map((s) => s.id),
    id,
    ...siblings.slice(clampedIndex).map((s) => s.id),
  ];

  const parentChanged = parentId !== existing.parentId;

  await prisma.$transaction(
    orderedIds.map((siblingId, sortOrder) =>
      prisma.node.update({
        where: { id: siblingId },
        data:
          siblingId === id
            ? { parentId, sortOrder }
            : { sortOrder },
      }),
    ),
  );

  if (parentChanged) {
    await promoteParentToFolderIfNeeded(parentId, existing.projectId);
  }

  const node = await prisma.node.findUnique({ where: { id } });
  revalidateNodePaths(existing.projectId, id);
  if (parentId) {
    revalidatePath(`/projects/${existing.projectId}/nodes/${parentId}`);
    revalidatePath(`/projects/${existing.projectId}/focus/${parentId}`);
  }
  if (existing.parentId && existing.parentId !== parentId) {
    revalidatePath(`/projects/${existing.projectId}/nodes/${existing.parentId}`);
    revalidatePath(`/projects/${existing.projectId}/focus/${existing.parentId}`);
  }

  return { ok: true as const, node };
}

export async function deleteNodeAction(id: string) {
  const existing = await prisma.node.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Node not found" };
  }

  await prisma.node.delete({ where: { id } });
  if (existing.status === "READY") {
    await recalculateProjectBalance(existing.projectId);
  }
  revalidateNodePaths(existing.projectId);
  return { ok: true as const };
}

export async function setNodeStatusAction(id: string, status: string) {
  return updateNodeAction({ id, status });
}
