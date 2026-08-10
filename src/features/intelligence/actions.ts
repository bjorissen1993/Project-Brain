"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { getAIService } from "@/features/ai";
import {
  flattenBalanceLines,
  getBalanceSnapshot,
} from "@/features/design-focus/balance-helpers";
import {
  analyzeGamePhaseDistribution,
  analyzeRecentIdeaSkew,
  shouldTriggerDirectionCheck,
} from "@/features/intelligence/heuristics";

function revalidateIntel(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/intelligence`);
  revalidatePath(`/projects/${projectId}/intent`);
  revalidatePath(`/projects/${projectId}/profile`);
  revalidatePath(`/projects/${projectId}/balance`);
}

export async function getIntelligenceOverview(projectId: string) {
  const [snapshot, recentSkew, phaseAnalysis, directionChecks, fullAnalysis] =
    await Promise.all([
      getBalanceSnapshot(projectId),
      analyzeRecentIdeaSkew(projectId),
      analyzeGamePhaseDistribution(projectId),
      prisma.directionCheck.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: {
          intentVersion: { select: { id: true, version: true } },
        },
      }),
      prisma.aIAnalysis.findFirst({
        where: { projectId, type: "full_project" },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const trigger = await shouldTriggerDirectionCheck(projectId);

  return {
    balanceSummary: snapshot.summary,
    recentSkew,
    phaseAnalysis,
    directionTrigger: trigger,
    directionChecks: directionChecks.map((d) => ({
      id: d.id,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      intentVersion: d.intentVersion?.version ?? null,
      result: d.result,
    })),
    fullAnalysis: fullAnalysis
      ? {
          id: fullAnalysis.id,
          status: fullAnalysis.status,
          model: fullAnalysis.model,
          createdAt: fullAnalysis.createdAt.toISOString(),
          result: fullAnalysis.result,
        }
      : null,
  };
}

export async function runDirectionCheckAction(projectId: string) {
  const trigger = await shouldTriggerDirectionCheck(projectId);
  const ai = getAIService();
  const result = await ai.performDirectionCheck(
    {
      projectId,
      triggerReason: trigger.reasons.join("; ") || "manual",
    },
    { modelTier: "standard" },
  );

  const latestIntent = await prisma.projectIntentVersion.findFirst({
    where: { projectId },
    orderBy: { version: "desc" },
    select: { id: true },
  });

  if (!result.ok || !result.data) {
    if (result.error === "OPENAI_API_KEY is not set") {
      const row = await prisma.directionCheck.create({
        data: {
          projectId,
          intentVersionId: latestIntent?.id ?? null,
          status: "deferred",
          result: {
            deferred: true,
            message: "Analysis pending — configure OPENAI_API_KEY",
            trigger: trigger.reasons,
          },
        },
      });
      revalidateIntel(projectId);
      return {
        ok: true as const,
        deferred: true,
        checkId: row.id,
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }
    return {
      ok: false as const,
      error: result.error ?? result.message,
    };
  }

  const row = await prisma.directionCheck.create({
    data: {
      projectId,
      intentVersionId: latestIntent?.id ?? null,
      status: "awaiting_response",
      result: {
        ...result.data,
        trigger: trigger.reasons,
        model: result.model,
      },
    },
  });

  await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "direction_check",
      model: result.model ?? null,
      status: "completed",
      inputHash: result.inputHash ?? null,
      result: result.data,
      metadata: { advisoryOnly: true, directionCheckId: row.id },
    },
  });

  revalidateIntel(projectId);
  return {
    ok: true as const,
    checkId: row.id,
    data: result.data,
    message: result.message,
  };
}

const respondSchema = z.object({
  directionCheckId: z.string().min(1),
  response: z.string().trim().min(1).max(8000),
  updateIntent: z.boolean().optional(),
});

export async function respondToDirectionCheckAction(raw: unknown) {
  const parsed = respondSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid response",
    };
  }

  const check = await prisma.directionCheck.findUnique({
    where: { id: parsed.data.directionCheckId },
  });
  if (!check) {
    return { ok: false as const, error: "Direction check not found" };
  }

  const prev = (check.result as Record<string, unknown> | null) ?? {};
  await prisma.directionCheck.update({
    where: { id: check.id },
    data: {
      status: "answered",
      result: {
        ...prev,
        creatorResponse: parsed.data.response,
        answeredAt: new Date().toISOString(),
      },
    },
  });

  // Append intent history with creator response (never overwrite original).
  if (parsed.data.updateIntent !== false) {
    const latest = await prisma.projectIntentVersion.findFirst({
      where: { projectId: check.projectId },
      orderBy: { version: "desc" },
    });
    const base = latest?.content ?? "";
    const appended = `${base.trim()}\n\n---\nDirection response (${new Date().toISOString().slice(0, 10)}):\n${parsed.data.response.trim()}`;
    await prisma.projectIntentVersion.create({
      data: {
        projectId: check.projectId,
        content: appended,
        version: (latest?.version ?? 0) + 1,
        isOriginal: !latest,
        reason: "direction_check_response",
      },
    });
  }

  revalidateIntel(check.projectId);
  return { ok: true as const };
}

export async function runFullProjectAnalysisAction(projectId: string) {
  const snapshot = await getBalanceSnapshot(projectId);
  const balanceLines = flattenBalanceLines(snapshot.roots);
  const ai = getAIService();
  const result = await ai.analyzeFullProject(
    { projectId, balanceLines },
    { modelTier: "deep" },
  );

  if (!result.ok || !result.data) {
    if (result.error === "OPENAI_API_KEY is not set") {
      await prisma.aIAnalysis.create({
        data: {
          projectId,
          type: "full_project",
          status: "deferred",
          result: { deferred: true },
          metadata: { advisoryOnly: true, manual: true },
        },
      });
      revalidateIntel(projectId);
      return {
        ok: true as const,
        deferred: true,
        message: "Analysis pending — configure OPENAI_API_KEY",
      };
    }
    return {
      ok: false as const,
      error: result.error ?? result.message,
    };
  }

  const row = await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "full_project",
      model: result.model ?? null,
      status: "completed",
      inputHash: result.inputHash ?? null,
      result: result.data,
      metadata: { advisoryOnly: true, manual: true },
    },
  });

  revalidateIntel(projectId);
  return {
    ok: true as const,
    analysisId: row.id,
    data: result.data,
    message: result.message,
  };
}
