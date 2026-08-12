import { createHash } from "node:crypto";
import { prisma } from "@/db/client";
import { getAIService } from "@/features/ai";
import type { NodeAIAnalysis } from "@/features/ai/node-analysis-schema";
import { recalculateProjectBalance } from "@/features/design-focus/balance-engine";

export function fingerprintForOutdatedCheck(parts: {
  content: string | null | undefined;
  intent: string | null | undefined;
  name: string;
  /** Active classification rule ids or serialized rules. */
  rulesFingerprint?: string | null;
  /** Design focus taxonomy fingerprint (ids + names + targets). */
  taxonomyFingerprint?: string | null;
}): string {
  return createHash("sha256")
    .update(
      [
        parts.name,
        parts.content ?? "",
        parts.intent ?? "",
        parts.rulesFingerprint ?? "",
        parts.taxonomyFingerprint ?? "",
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 32);
}

export type ReadyAnalysisRunResult =
  | {
      ok: true;
      analysisId: string;
      status: "completed" | "deferred" | "failed";
      message: string;
      deferred?: boolean;
    }
  | { ok: false; error: string; analysisId?: string };

function suggestionKey(targetNodeId: string, relationType: string) {
  return `${targetNodeId}::${relationType}`;
}

/**
 * Run Ready analysis for a node: gather selective context → OpenAI → Zod →
 * persist advisory summary/classifications/AIAnalysis. Never auto-creates relations.
 */
export async function runReadyAnalysis(
  nodeId: string,
  opts?: { force?: boolean; locale?: "en" | "nl" },
): Promise<ReadyAnalysisRunResult> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true, projectId: true, status: true },
  });
  if (!node) {
    return { ok: false, error: "Node not found" };
  }

  const ai = getAIService();
  const result = await ai.analyzeReadyNode(
    { projectId: node.projectId, nodeId: node.id },
    { modelTier: "quick", locale: opts?.locale },
  );

  // Deferred: missing API key — record pending analysis, do not fake results.
  if (result.data?.deferred || result.error === "OPENAI_API_KEY is not set") {
    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId: node.projectId,
        nodeId: node.id,
        type: "ready_node",
        model: result.model ?? null,
        status: "deferred",
        inputHash: result.inputHash ?? null,
        result: {
          deferred: true,
          reason: "OPENAI_API_KEY is not set",
        },
        metadata: {
          advisoryOnly: true,
          force: Boolean(opts?.force),
        },
      },
    });
    return {
      ok: true,
      analysisId: analysis.id,
      status: "deferred",
      deferred: true,
      message: "Analysis pending — configure OPENAI_API_KEY",
    };
  }

  if (!result.ok || !result.data) {
    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId: node.projectId,
        nodeId: node.id,
        type: "ready_node",
        model: result.model ?? null,
        status: "failed",
        inputHash: result.inputHash ?? null,
        result: { error: result.error ?? result.message },
        metadata: { advisoryOnly: true },
      },
    });
    return {
      ok: false,
      error: result.error ?? result.message ?? "Ready analysis failed",
      analysisId: analysis.id,
    };
  }

  const data = result.data;
  const analysisId = await persistReadyAnalysis({
    projectId: node.projectId,
    nodeId: node.id,
    model: result.model,
    inputHash: result.inputHash,
    analysis: data,
    isParent: data.isParent,
  });

  // Phase 3: persist DesignFocus actualWeight / confidence after Ready classifications.
  await recalculateProjectBalance(node.projectId);

  return {
    ok: true,
    analysisId,
    status: "completed",
    message: result.message,
  };
}

async function persistReadyAnalysis(params: {
  projectId: string;
  nodeId: string;
  model?: string;
  inputHash?: string;
  analysis: NodeAIAnalysis & { isParent?: boolean };
  isParent: boolean;
}): Promise<string> {
  const { projectId, nodeId, model, inputHash, analysis, isParent } = params;

  const [focuses, nodeRow, intent, rules] = await Promise.all([
    prisma.designFocus.findMany({
      where: { projectId },
      select: { id: true, name: true, targetImportance: true },
    }),
    prisma.node.findUnique({
      where: { id: nodeId },
      select: { name: true, content: true },
    }),
    prisma.projectIntentVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { content: true },
    }),
    prisma.projectClassificationRule.findMany({
      where: { projectId, isActive: true },
      select: { id: true, updatedAt: true },
    }),
  ]);
  const focusNameById = new Map(focuses.map((f) => [f.id, f.name]));
  const contentFingerprint = fingerprintForOutdatedCheck({
    name: nodeRow?.name ?? "",
    content: nodeRow?.content,
    intent: intent?.content,
    rulesFingerprint: rules
      .map((r) => `${r.id}:${r.updatedAt.toISOString()}`)
      .sort()
      .join("|"),
    taxonomyFingerprint: focuses
      .map((f) => `${f.id}:${f.name}:${f.targetImportance}`)
      .sort()
      .join("|"),
  });

  // Preserve human corrections; replace prior AI/rule proposed rows for this node.
  const existing = await prisma.nodeClassification.findMany({
    where: { nodeId },
  });
  const userProtectedFocusIds = new Set(
    existing
      .filter((row) => {
        if (row.source === "user") return true;
        const meta = row.metadata as { status?: string } | null;
        return meta?.status === "corrected" || meta?.status === "rejected";
      })
      .map((row) => row.category),
  );

  const aiRowsToRemove = existing.filter(
    (row) =>
      row.source === "ai" &&
      !userProtectedFocusIds.has(row.category) &&
      (row.metadata as { status?: string } | null)?.status !== "rejected",
  );

  const suggestionStatuses: Record<
    string,
    { status: "pending" | "accepted" | "rejected"; targetNodeId: string; relationType: string }
  > = {};
  for (const rel of analysis.suggestedRelations) {
    suggestionStatuses[suggestionKey(rel.targetNodeId, rel.relationType)] = {
      status: "pending",
      targetNodeId: rel.targetNodeId,
      relationType: rel.relationType,
    };
  }

  const analysisId = await prisma.$transaction(async (tx) => {
    if (aiRowsToRemove.length) {
      await tx.nodeClassification.deleteMany({
        where: { id: { in: aiRowsToRemove.map((r) => r.id) } },
      });
    }

    await tx.node.update({
      where: { id: nodeId },
      data: {
        summary: analysis.summary,
        projectImpact: analysis.projectImpact,
      },
    });

    for (const c of analysis.classifications) {
      if (userProtectedFocusIds.has(c.designFocusId)) continue;

      await tx.nodeClassification.create({
        data: {
          projectId,
          nodeId,
          category: c.designFocusId,
          confidence: c.confidence,
          source: "ai",
          metadata: {
            designFocusId: c.designFocusId,
            focusName: focusNameById.get(c.designFocusId) ?? null,
            weight: c.weight,
            reasoning: c.reasoning,
            status: "proposed",
          },
        },
      });
    }

    const created = await tx.aIAnalysis.create({
      data: {
        projectId,
        nodeId,
        type: "ready_node",
        model: model ?? null,
        status: "completed",
        inputHash: inputHash ?? null,
        result: {
          summary: analysis.summary,
          projectImpact: analysis.projectImpact,
          classifications: analysis.classifications,
          suggestedRelations: analysis.suggestedRelations,
          observations: analysis.observations,
          isParent,
        },
        metadata: {
          advisoryOnly: true,
          suggestionStatuses,
          contentFingerprint,
          version: 1,
        },
      },
    });
    return created.id;
  });

  return analysisId;
}

export { suggestionKey };
