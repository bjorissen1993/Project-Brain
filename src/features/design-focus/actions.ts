"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import {
  createDesignFocusSchema,
  updateDesignFocusSchema,
  updateFocusElementSchema,
} from "@/lib/validation";
import { buildDesignFocusTree } from "@/features/projects/tree";
import { recalculateProjectBalance } from "@/features/design-focus/balance-engine";
import { clamp } from "@/lib/utils";

export async function listDesignFocusTree(projectId: string) {
  const rows = await prisma.designFocus.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return buildDesignFocusTree(rows);
}

async function createLinkedIdeaNode(input: {
  projectId: string;
  designFocusId: string;
  name: string;
  content: string | null;
}) {
  // Prefer nesting under the first top-level Project Area so Design Focus
  // idea stubs do not become root structure blobs.
  const rootArea = await prisma.node.findFirst({
    where: {
      projectId: input.projectId,
      parentId: null,
      type: { in: ["FOLDER", "SYSTEM", "ACT"] },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const parentId = rootArea?.id ?? null;

  const maxSort = await prisma.node.aggregate({
    where: { projectId: input.projectId, parentId },
    _max: { sortOrder: true },
  });
  return prisma.node.create({
    data: {
      projectId: input.projectId,
      parentId,
      name: input.name,
      type: "IDEA",
      status: "IDEA",
      content: input.content,
      designFocusId: input.designFocusId,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function createDesignFocusAction(raw: unknown) {
  const parsed = createDesignFocusSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid focus" };
  }

  const data = parsed.data;
  const maxSort = await prisma.designFocus.aggregate({
    where: { projectId: data.projectId, parentId: data.parentId ?? null },
    _max: { sortOrder: true },
  });

  const description = data.description?.trim() || null;
  const shouldCreateIdea =
    data.createIdeaNode || Boolean(description);

  const focus = await prisma.designFocus.create({
    data: {
      projectId: data.projectId,
      name: data.name,
      parentId: data.parentId ?? null,
      targetImportance: clamp(data.targetImportance, 0, 100),
      actualWeight: 0,
      confidence: 0,
      isCustom: data.isCustom,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  let ideaNode: Awaited<ReturnType<typeof createLinkedIdeaNode>> | null = null;
  if (shouldCreateIdea) {
    ideaNode = await createLinkedIdeaNode({
      projectId: data.projectId,
      designFocusId: focus.id,
      name: data.name,
      content: description,
    });
  }

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath(`/projects/${data.projectId}/design-focus`);
  revalidatePath(`/projects/${data.projectId}/profile`);
  revalidatePath(`/projects/${data.projectId}/focus`);
  revalidatePath(`/projects/${data.projectId}/tree`);
  return { ok: true as const, focus, ideaNode };
}

/** Update focus name/importance and upsert linked Idea content for Focus Space properties. */
export async function updateFocusElementAction(raw: unknown) {
  const parsed = updateFocusElementSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid focus properties",
    };
  }

  const data = parsed.data;
  const existing = await prisma.designFocus.findUnique({ where: { id: data.id } });
  if (!existing) {
    return { ok: false as const, error: "Design focus not found" };
  }

  const focus = await prisma.designFocus.update({
    where: { id: data.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.targetImportance !== undefined
        ? { targetImportance: clamp(data.targetImportance, 0, 100) }
        : {}),
    },
  });

  if (data.targetImportance !== undefined) {
    await recalculateProjectBalance(existing.projectId);
  }

  let ideaNode: { id: string; content: string | null } | null = null;
  if (data.description !== undefined) {
    const content = data.description?.trim() || null;
    if (data.ideaNodeId) {
      const node = await prisma.node.findFirst({
        where: {
          id: data.ideaNodeId,
          projectId: existing.projectId,
          designFocusId: existing.id,
        },
      });
      if (node) {
        ideaNode = await prisma.node.update({
          where: { id: node.id },
          data: {
            content,
            ...(data.name !== undefined ? { name: data.name } : {}),
          },
          select: { id: true, content: true },
        });
      }
    }
    if (!ideaNode) {
      const linked = await prisma.node.findFirst({
        where: {
          projectId: existing.projectId,
          designFocusId: existing.id,
          type: "IDEA",
        },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      });
      if (linked) {
        ideaNode = await prisma.node.update({
          where: { id: linked.id },
          data: {
            content,
            ...(data.name !== undefined ? { name: data.name } : {}),
          },
          select: { id: true, content: true },
        });
      } else if (content) {
        const created = await createLinkedIdeaNode({
          projectId: existing.projectId,
          designFocusId: existing.id,
          name: data.name ?? existing.name,
          content,
        });
        ideaNode = { id: created.id, content: created.content };
      }
    }
  }

  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/projects/${existing.projectId}/design-focus`);
  revalidatePath(`/projects/${existing.projectId}/profile`);
  revalidatePath(`/projects/${existing.projectId}/focus`);
  revalidatePath(`/projects/${existing.projectId}/balance`);
  revalidatePath(`/projects/${existing.projectId}/tree`);
  if (ideaNode) {
    revalidatePath(`/projects/${existing.projectId}/nodes/${ideaNode.id}`);
  }
  return { ok: true as const, focus, ideaNode };
}

export async function updateDesignFocusAction(raw: unknown) {
  const parsed = updateDesignFocusSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid focus" };
  }

  const { id, ...rest } = parsed.data;
  const existing = await prisma.designFocus.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Design focus not found" };
  }

  if (rest.parentId === id) {
    return { ok: false as const, error: "A focus cannot be its own parent" };
  }

  if (rest.parentId !== undefined && rest.parentId != null) {
    const parent = await prisma.designFocus.findFirst({
      where: { id: rest.parentId, projectId: existing.projectId },
    });
    if (!parent) {
      return {
        ok: false as const,
        error: "Parent focus not found in this project",
      };
    }

    // Prevent cycles: new parent cannot be a descendant of this focus.
    const rows = await prisma.designFocus.findMany({
      where: { projectId: existing.projectId },
      select: { id: true, parentId: true },
    });
    const childrenMap = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.parentId) continue;
      const list = childrenMap.get(row.parentId) ?? [];
      list.push(row.id);
      childrenMap.set(row.parentId, list);
    }
    const stack = [...(childrenMap.get(id) ?? [])];
    while (stack.length) {
      const current = stack.pop()!;
      if (current === rest.parentId) {
        return {
          ok: false as const,
          error: "Cannot move a focus under its descendant",
        };
      }
      stack.push(...(childrenMap.get(current) ?? []));
    }
  }

  const focus = await prisma.designFocus.update({
    where: { id },
    data: {
      ...(rest.name !== undefined ? { name: rest.name } : {}),
      ...(rest.targetImportance !== undefined
        ? { targetImportance: clamp(rest.targetImportance, 0, 100) }
        : {}),
      ...(rest.parentId !== undefined ? { parentId: rest.parentId } : {}),
      ...(rest.sortOrder !== undefined ? { sortOrder: rest.sortOrder } : {}),
    },
  });

  if (rest.targetImportance !== undefined || rest.parentId !== undefined) {
    await recalculateProjectBalance(existing.projectId);
  }

  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/projects/${existing.projectId}/design-focus`);
  revalidatePath(`/projects/${existing.projectId}/profile`);
  revalidatePath(`/projects/${existing.projectId}/focus`);
  revalidatePath(`/projects/${existing.projectId}/balance`);
  return { ok: true as const, focus };
}

export async function deleteDesignFocusAction(id: string) {
  const existing = await prisma.designFocus.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: "Design focus not found" };
  }

  await prisma.designFocus.delete({ where: { id } });
  revalidatePath(`/projects/${existing.projectId}`);
  revalidatePath(`/projects/${existing.projectId}/design-focus`);
  revalidatePath(`/projects/${existing.projectId}/profile`);
  revalidatePath(`/projects/${existing.projectId}/focus`);
  return { ok: true as const };
}
