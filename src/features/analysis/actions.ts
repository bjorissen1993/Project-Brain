"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { createRelationAction } from "@/features/relations/actions";
import {
  fingerprintForOutdatedCheck,
  runReadyAnalysis,
  suggestionKey,
} from "@/features/analysis/ready-analysis";
import type { NodeAIAnalysis } from "@/features/ai/node-analysis-schema";
import {
  detectSignificantBalanceShifts,
  getBalanceSnapshot,
  recalculateProjectBalance,
  type BalanceFocusNode,
} from "@/features/design-focus/balance-engine";
import { getAIService } from "@/features/ai";

function revalidateAnalysisPaths(projectId: string, nodeId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/nodes/${nodeId}`);
  revalidatePath(`/projects/${projectId}/tree`);
  revalidatePath(`/projects/${projectId}/balance`);
}

export async function reanalyzeNodeAction(
  nodeId: string,
  opts?: { locale?: "en" | "nl" },
) {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    select: { id: true, projectId: true, status: true },
  });
  if (!node) return { ok: false as const, error: "Node not found" };
  if (node.status !== "READY") {
    return {
      ok: false as const,
      error: "Mark the node Ready before running analysis",
    };
  }

  const result = await runReadyAnalysis(node.id, {
    force: true,
    locale: opts?.locale,
  });
  revalidateAnalysisPaths(node.projectId, node.id);

  if (!result.ok) {
    return { ok: false as const, error: result.error };
  }
  return {
    ok: true as const,
    status: result.status,
    message: result.message,
    deferred: result.deferred,
    analysisId: result.analysisId,
  };
}

const correctClassificationSchema = z.object({
  classificationId: z.string().min(1),
  action: z.enum(["accept", "reject", "edit", "move"]),
  reason: z.string().trim().max(1000).optional(),
  weight: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(100).optional(),
  designFocusId: z.string().min(1).optional(),
  saveAsRule: z.boolean().optional(),
});

export async function correctClassificationAction(raw: unknown) {
  const parsed = correctClassificationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid correction",
    };
  }

  const data = parsed.data;
  const row = await prisma.nodeClassification.findUnique({
    where: { id: data.classificationId },
  });
  if (!row) {
    return { ok: false as const, error: "Classification not found" };
  }

  const prevMeta = (row.metadata as Record<string, unknown> | null) ?? {};
  const previousCategory = row.category;

  // Capture balance BEFORE mutation so threshold shifts are detectable.
  let beforeRoots: BalanceFocusNode[] = [];
  try {
    beforeRoots = (await getBalanceSnapshot(row.projectId)).roots;
  } catch {
    beforeRoots = [];
  }

  if (data.action === "reject") {
    await prisma.nodeClassification.update({
      where: { id: row.id },
      data: {
        source: "user",
        metadata: {
          ...prevMeta,
          designFocusId: previousCategory,
          status: "rejected",
          correctionReason: data.reason?.trim() || "Doesn't belong here",
          previousCategory,
        },
      },
    });

    if (data.saveAsRule && data.reason?.trim()) {
      await prisma.projectClassificationRule.create({
        data: {
          projectId: row.projectId,
          name: `Correction: not ${previousCategory}`,
          isActive: true,
          rule: {
            type: "negative_example",
            nodeId: row.nodeId,
            designFocusId: previousCategory,
            reason: data.reason.trim(),
            sourceClassificationId: row.id,
          },
        },
      });
    }
  } else if (data.action === "accept") {
    await prisma.nodeClassification.update({
      where: { id: row.id },
      data: {
        source: "user",
        metadata: {
          ...prevMeta,
          designFocusId: previousCategory,
          status: "accepted",
          correctionReason: data.reason?.trim() || undefined,
        },
      },
    });
  } else if (data.action === "edit") {
    const weight =
      data.weight ??
      (typeof prevMeta.weight === "number" ? prevMeta.weight : 50);
    const confidence = data.confidence ?? row.confidence ?? 80;
    await prisma.nodeClassification.update({
      where: { id: row.id },
      data: {
        source: "user",
        confidence,
        metadata: {
          ...prevMeta,
          designFocusId: previousCategory,
          weight,
          status: "corrected",
          correctionReason: data.reason?.trim() || "Edited by creator",
          previousCategory,
        },
      },
    });
  } else if (data.action === "move") {
    if (!data.designFocusId) {
      return { ok: false as const, error: "Select a design focus to move to" };
    }
    const focus = await prisma.designFocus.findFirst({
      where: { id: data.designFocusId, projectId: row.projectId },
    });
    if (!focus) {
      return { ok: false as const, error: "Design focus not found" };
    }

    await prisma.nodeClassification.update({
      where: { id: row.id },
      data: {
        category: focus.id,
        source: "user",
        confidence: data.confidence ?? row.confidence,
        metadata: {
          ...prevMeta,
          designFocusId: focus.id,
          focusName: focus.name,
          weight:
            data.weight ??
            (typeof prevMeta.weight === "number" ? prevMeta.weight : 50),
          status: "corrected",
          correctionReason: data.reason?.trim() || `Moved to ${focus.name}`,
          previousCategory,
        },
      },
    });
  }

  // Phase 3: recalc balance; Phase 4: quick AI pass only on significant shifts.
  const after = await recalculateProjectBalance(row.projectId);
  const shifts = detectSignificantBalanceShifts(beforeRoots, after.roots);

  let quickAiMessage: string | null = null;
  if (shifts.length) {
    const ai = getAIService();
    const quick = await ai.quickReanalysis(
      {
        projectId: row.projectId,
        scope: "project",
        balanceShifts: shifts,
      },
      { modelTier: "quick" },
    );
    quickAiMessage = quick.message;
    if (quick.ok && quick.data?.imbalance) {
      await prisma.aIAnalysis.create({
        data: {
          projectId: row.projectId,
          nodeId: row.nodeId,
          type: "quick_reanalysis",
          model: quick.model ?? null,
          status: quick.stubbed ? "deferred" : "completed",
          inputHash: quick.inputHash ?? null,
          result: quick.data.imbalance,
          metadata: {
            advisoryOnly: true,
            balanceShifts: shifts,
            trigger: "classification_correction",
          },
        },
      });
    }
  }

  // Positive save-as-rule for accept/edit/move with reason.
  if (
    data.saveAsRule &&
    data.reason?.trim() &&
    (data.action === "accept" || data.action === "edit" || data.action === "move")
  ) {
    await prisma.projectClassificationRule.create({
      data: {
        projectId: row.projectId,
        name: `Correction: ${data.action} ${row.category}`,
        isActive: true,
        rule: {
          type: "positive_example",
          nodeId: row.nodeId,
          designFocusId:
            data.action === "move" && data.designFocusId
              ? data.designFocusId
              : row.category,
          reason: data.reason.trim(),
          sourceClassificationId: row.id,
          action: data.action,
        },
      },
    });
  }

  revalidateAnalysisPaths(row.projectId, row.nodeId);
  return {
    ok: true as const,
    balanceShifts: shifts,
    quickAiMessage,
  };
}

const suggestionActionSchema = z.object({
  analysisId: z.string().min(1),
  targetNodeId: z.string().min(1),
  relationType: z.string().trim().min(1).max(80),
  decision: z.enum(["accept", "reject"]),
});

export async function resolveSuggestedRelationAction(raw: unknown) {
  const parsed = suggestionActionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid suggestion action",
    };
  }

  const data = parsed.data;
  const analysis = await prisma.aIAnalysis.findUnique({
    where: { id: data.analysisId },
  });
  if (!analysis || !analysis.nodeId) {
    return { ok: false as const, error: "Analysis not found" };
  }

  const meta = (analysis.metadata as Record<string, unknown> | null) ?? {};
  const statuses =
    (meta.suggestionStatuses as Record<
      string,
      { status: string; targetNodeId: string; relationType: string }
    > | null) ?? {};
  const key = suggestionKey(data.targetNodeId, data.relationType);

  if (data.decision === "accept") {
    const created = await createRelationAction({
      projectId: analysis.projectId,
      sourceNodeId: analysis.nodeId,
      targetNodeId: data.targetNodeId,
      type: data.relationType,
      label: "AI suggestion (accepted)",
    });
    if (!created.ok) {
      return { ok: false as const, error: created.error };
    }
    statuses[key] = {
      status: "accepted",
      targetNodeId: data.targetNodeId,
      relationType: data.relationType,
    };
  } else {
    statuses[key] = {
      status: "rejected",
      targetNodeId: data.targetNodeId,
      relationType: data.relationType,
    };
  }

  await prisma.aIAnalysis.update({
    where: { id: analysis.id },
    data: {
      metadata: {
        ...meta,
        suggestionStatuses: statuses,
      },
    },
  });

  revalidateAnalysisPaths(analysis.projectId, analysis.nodeId);
  return { ok: true as const };
}

export type NodeAnalysisView = {
  summary: string | null;
  projectImpact: string | null;
  analysisStatus: "none" | "completed" | "deferred" | "failed" | "outdated";
  analysisMessage: string | null;
  analysisId: string | null;
  model: string | null;
  analyzedAt: string | null;
  isOutdated: boolean;
  observations: NodeAIAnalysis["observations"];
  classifications: {
    id: string;
    designFocusId: string;
    focusName: string;
    weight: number;
    confidence: number | null;
    source: string;
    status: string;
    reasoning: string | null;
    correctionReason: string | null;
  }[];
  suggestedRelations: {
    targetNodeId: string;
    targetName: string;
    relationType: string;
    reasoning: string;
    confidence: number;
    status: "pending" | "accepted" | "rejected";
  }[];
};

export async function getNodeAnalysisView(
  nodeId: string,
): Promise<NodeAnalysisView | null> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      classifications: { orderBy: { updatedAt: "desc" } },
      aiAnalyses: {
        where: { type: "ready_node" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      project: {
        include: {
          intents: { orderBy: { version: "desc" }, take: 1 },
          designFocuses: {
            select: { id: true, name: true, targetImportance: true },
          },
          nodes: { select: { id: true, name: true } },
          classificationRules: {
            where: { isActive: true },
            select: { id: true, updatedAt: true },
          },
        },
      },
    },
  });

  if (!node) return null;

  const latest = node.aiAnalyses[0] ?? null;
  const focusNameById = new Map(
    node.project.designFocuses.map((f) => [f.id, f.name]),
  );
  const nodeNameById = new Map(node.project.nodes.map((n) => [n.id, n.name]));

  const result = (latest?.result ?? null) as Partial<NodeAIAnalysis> | null;
  const meta = (latest?.metadata ?? null) as {
    suggestionStatuses?: Record<
      string,
      { status: "pending" | "accepted" | "rejected" }
    >;
    contentFingerprint?: string;
  } | null;

  const classifications = node.classifications
    .map((c) => {
      const cmeta = (c.metadata as Record<string, unknown> | null) ?? {};
      const status =
        typeof cmeta.status === "string" ? cmeta.status : "proposed";
      return {
        id: c.id,
        designFocusId: c.category,
        focusName:
          (typeof cmeta.focusName === "string" && cmeta.focusName) ||
          focusNameById.get(c.category) ||
          c.category,
        weight: typeof cmeta.weight === "number" ? cmeta.weight : 0,
        confidence: c.confidence,
        source: c.source,
        status,
        reasoning:
          typeof cmeta.reasoning === "string" ? cmeta.reasoning : null,
        correctionReason:
          typeof cmeta.correctionReason === "string"
            ? cmeta.correctionReason
            : null,
      };
    })
    .filter((c) => c.status !== "rejected");

  const suggestedRelations = (result?.suggestedRelations ?? []).map((rel) => {
    const key = suggestionKey(rel.targetNodeId, rel.relationType);
    const status = meta?.suggestionStatuses?.[key]?.status ?? "pending";
    return {
      targetNodeId: rel.targetNodeId,
      targetName: nodeNameById.get(rel.targetNodeId) ?? rel.targetNodeId,
      relationType: rel.relationType,
      reasoning: rel.reasoning,
      confidence: rel.confidence,
      status,
    };
  });

  let analysisStatus: NodeAnalysisView["analysisStatus"] = "none";
  if (latest?.status === "completed") analysisStatus = "completed";
  else if (latest?.status === "deferred") analysisStatus = "deferred";
  else if (latest?.status === "failed") analysisStatus = "failed";

  const analyzedAt = latest?.createdAt ?? null;
  const currentFingerprint = fingerprintForOutdatedCheck({
    name: node.name,
    content: node.content,
    intent: node.project.intents[0]?.content,
    rulesFingerprint: node.project.classificationRules
      .map((r) => `${r.id}:${r.updatedAt.toISOString()}`)
      .sort()
      .join("|"),
    taxonomyFingerprint: node.project.designFocuses
      .map((f) => `${f.id}:${f.name}:${f.targetImportance}`)
      .sort()
      .join("|"),
  });
  const isOutdated =
    Boolean(latest && latest.status === "completed") &&
    Boolean(
      meta?.contentFingerprint &&
        meta.contentFingerprint !== currentFingerprint,
    );

  if (isOutdated) analysisStatus = "outdated";

  let analysisMessage: string | null = null;
  if (latest?.status === "deferred") {
    analysisMessage = "Analysis pending — configure OPENAI_API_KEY";
  } else if (latest?.status === "failed") {
    const err = (result as { error?: string } | null)?.error;
    analysisMessage = err ?? "Ready analysis failed";
  }

  return {
    summary: node.summary,
    projectImpact: node.projectImpact,
    analysisStatus,
    analysisMessage,
    analysisId: latest?.id ?? null,
    model: latest?.model ?? null,
    analyzedAt: analyzedAt?.toISOString() ?? null,
    isOutdated,
    observations: result?.observations ?? [],
    classifications,
    suggestedRelations,
  };
}
