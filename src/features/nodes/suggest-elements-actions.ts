"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { getAIService } from "@/features/ai";
import {
  applyChildElementSuggestionsSchema,
  ignoreChildElementSuggestionsSchema,
  suggestChildElementsInputSchema,
} from "@/features/ai/element-suggestion-schema";
import type { ChildElementSuggestionsData } from "@/features/ai/types";
import { createNodeAction } from "@/features/nodes/actions";

export type SuggestChildElementsActionResult =
  | {
      ok: true;
      data: ChildElementSuggestionsData;
      source: "ai" | "heuristic";
      model?: string;
      message: string;
      analysisId?: string;
    }
  | { ok: false; error: string };

/**
 * Advisory structure proposals from idea text.
 * Never creates nodes — creator must accept in the UI.
 * Stored on AIAnalysis (status pending) before accept.
 * When nodeId is null, proposals target the project root.
 */
export async function suggestChildElementsAction(
  raw: unknown,
): Promise<SuggestChildElementsActionResult> {
  const parsed = suggestChildElementsInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, nodeId, content: contentOverride } = parsed.data;

  let content = (contentOverride ?? "").trim();
  let nodeName = "project root";

  if (nodeId) {
    const node = await prisma.node.findFirst({
      where: { id: nodeId, projectId },
      select: { id: true, content: true, name: true },
    });
    if (!node) {
      return { ok: false, error: "Node not found in this project" };
    }
    content = (contentOverride ?? node.content ?? "").trim();
    nodeName = node.name;
  } else {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        name: true,
        intents: {
          orderBy: { version: "desc" },
          take: 1,
          select: { content: true },
        },
      },
    });
    if (!project) {
      return { ok: false, error: "Project not found" };
    }
    nodeName = project.name;
    if (!content) {
      content = (project.intents[0]?.content ?? "").trim();
    }
  }

  if (content.length < 20) {
    return {
      ok: false,
      error: "Write a bit more about the idea (at least a short paragraph) first.",
    };
  }

  const ai = getAIService();
  const result = await ai.suggestChildElements(
    { projectId, nodeId, content },
    { modelTier: "quick" },
  );

  if (!result.ok || !result.data) {
    return {
      ok: false,
      error: result.error ?? result.message ?? "Could not generate suggestions",
    };
  }

  let analysisId: string | undefined;
  try {
    const inputHash =
      result.inputHash ??
      createHash("sha256").update(content).digest("hex").slice(0, 32);

    // Supersede older pending proposals for this parent (node or root).
    await prisma.aIAnalysis.updateMany({
      where: {
        projectId,
        nodeId: nodeId ?? null,
        type: "suggest_child_elements",
        status: "pending",
      },
      data: { status: "superseded" },
    });

    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId,
        nodeId: nodeId ?? null,
        type: "suggest_child_elements",
        model: result.model ?? null,
        status: "pending",
        inputHash,
        result: result.data,
        metadata: {
          source: result.data.source,
          stubbed: result.stubbed,
          advisoryOnly: true,
          nodeName,
          atRoot: nodeId == null,
        },
      },
    });
    analysisId = analysis.id;
  } catch {
    // Best-effort metadata — UI still works without persistence.
  }

  return {
    ok: true,
    data: result.data,
    source: result.data.source,
    model: result.model,
    message: result.message,
    analysisId,
  };
}

export type ApplyChildElementsActionResult =
  | { ok: true; createdIds: string[]; message: string }
  | { ok: false; error: string };

/**
 * Create accepted suggestions as child Nodes under the container.
 * Only called after explicit creator acceptance.
 * When parentNodeId is null, creates top-level nodes under the project root.
 * Children are IDEA, ordered as accepted; content is left empty (idea stays on parent).
 */
export async function applyChildElementSuggestionsAction(
  raw: unknown,
): Promise<ApplyChildElementsActionResult> {
  const parsed = applyChildElementSuggestionsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid selection",
    };
  }

  const { projectId, parentNodeId, items, analysisId } = parsed.data;

  if (parentNodeId) {
    const parent = await prisma.node.findFirst({
      where: { id: parentNodeId, projectId },
      select: { id: true },
    });
    if (!parent) {
      return { ok: false, error: "Parent node not found in this project" };
    }
  } else {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false, error: "Project not found" };
    }
  }

  const createdIds: string[] = [];
  for (const item of items) {
    const result = await createNodeAction({
      projectId,
      parentId: parentNodeId,
      name: item.name,
      type: item.type,
      status: "IDEA",
      // Preserve the original idea on the parent — don't fill child content.
      content: null,
    });
    if (!result.ok) {
      return {
        ok: false,
        error:
          createdIds.length > 0
            ? `Created ${createdIds.length}, then failed: ${result.error}`
            : result.error,
      };
    }
    createdIds.push(result.node.id);
  }

  if (analysisId) {
    try {
      await prisma.aIAnalysis.updateMany({
        where: {
          id: analysisId,
          projectId,
          type: "suggest_child_elements",
        },
        data: {
          status: "accepted",
          metadata: {
            acceptedCount: createdIds.length,
            createdIds,
          },
        },
      });
    } catch {
      // Non-blocking.
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/focus`);
  if (parentNodeId) {
    revalidatePath(`/projects/${projectId}/focus/${parentNodeId}`);
    revalidatePath(`/projects/${projectId}/nodes/${parentNodeId}`);
  }

  return {
    ok: true,
    createdIds,
    message: parentNodeId
      ? `Added ${createdIds.length} section${createdIds.length === 1 ? "" : "s"}. Your notes on this node were kept.`
      : `Added ${createdIds.length} section${createdIds.length === 1 ? "" : "s"} at the project root.`,
  };
}

export async function ignoreChildElementSuggestionsAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = ignoreChildElementSuggestionsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }
  const { projectId, nodeId, analysisId } = parsed.data;
  try {
    if (analysisId) {
      await prisma.aIAnalysis.updateMany({
        where: {
          id: analysisId,
          projectId,
          nodeId: nodeId ?? null,
          type: "suggest_child_elements",
        },
        data: { status: "ignored" },
      });
    } else {
      await prisma.aIAnalysis.updateMany({
        where: {
          projectId,
          nodeId: nodeId ?? null,
          type: "suggest_child_elements",
          status: "pending",
        },
        data: { status: "ignored" },
      });
    }
  } catch {
    return { ok: false, error: "Could not update proposal status" };
  }
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}
