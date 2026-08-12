"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/db/client";
import { getAIService } from "@/features/ai";
import {
  flattenBalanceLines,
  getBalanceSnapshot,
} from "@/features/design-focus/balance-helpers";
import { improvementCategorySchema } from "@/features/ai/improvement-schema";

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/balance`);
  revalidatePath(`/projects/${projectId}/intelligence`);
}

export async function runImbalanceAnalysisAction(
  projectId: string,
  opts?: { locale?: "en" | "nl" },
) {
  const snapshot = await getBalanceSnapshot(projectId);
  const balanceLines = flattenBalanceLines(snapshot.roots);
  const ai = getAIService();
  const result = await ai.analyzeImbalance(
    { projectId, balanceLines },
    { modelTier: "standard", locale: opts?.locale },
  );

  if (!result.ok || !result.data) {
    if (result.error === "OPENAI_API_KEY is not set") {
      await prisma.aIAnalysis.create({
        data: {
          projectId,
          type: "imbalance",
          status: "deferred",
          inputHash: result.inputHash ?? null,
          result: { deferred: true },
          metadata: { advisoryOnly: true },
        },
      });
      revalidateProject(projectId);
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

  const analysis = await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "imbalance",
      model: result.model ?? null,
      status: "completed",
      inputHash: result.inputHash ?? null,
      result: result.data,
      metadata: { advisoryOnly: true },
    },
  });

  revalidateProject(projectId);
  return {
    ok: true as const,
    analysisId: analysis.id,
    data: result.data,
    message: result.message,
  };
}

export async function runImprovementSuggestionsAction(
  projectId: string,
  opts?: { locale?: "en" | "nl" },
) {
  const snapshot = await getBalanceSnapshot(projectId);
  const balanceLines = flattenBalanceLines(snapshot.roots);
  const ai = getAIService();
  const result = await ai.generateImprovementSuggestions(
    { projectId, balanceLines },
    { modelTier: "standard", locale: opts?.locale },
  );

  if (!result.ok || !result.data) {
    if (result.error === "OPENAI_API_KEY is not set") {
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

  const createdIds: string[] = [];
  for (const suggestion of result.data.suggestions) {
    const row = await prisma.improvementSuggestion.create({
      data: {
        projectId,
        nodeId: suggestion.relatedNodeIds[0] ?? null,
        status: "pending",
        suggestion: suggestion,
      },
    });
    createdIds.push(row.id);
  }

  await prisma.aIAnalysis.create({
    data: {
      projectId,
      type: "improvements",
      model: result.model ?? null,
      status: "completed",
      inputHash: result.inputHash ?? null,
      result: result.data,
      metadata: {
        advisoryOnly: true,
        suggestionIds: createdIds,
      },
    },
  });

  revalidateProject(projectId);
  return {
    ok: true as const,
    count: createdIds.length,
    summary: result.data.summary,
    message: result.message,
  };
}

const resolveSuggestionSchema = z.object({
  suggestionId: z.string().min(1),
  decision: z.enum(["accept", "reject"]),
});

export async function resolveImprovementSuggestionAction(raw: unknown) {
  const parsed = resolveSuggestionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const row = await prisma.improvementSuggestion.findUnique({
    where: { id: parsed.data.suggestionId },
  });
  if (!row) {
    return { ok: false as const, error: "Suggestion not found" };
  }

  await prisma.improvementSuggestion.update({
    where: { id: row.id },
    data: {
      status: parsed.data.decision === "accept" ? "accepted" : "rejected",
    },
  });

  revalidateProject(row.projectId);
  return { ok: true as const };
}

export async function listPendingImprovements(projectId: string) {
  const rows = await prisma.improvementSuggestion.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  return rows.map((r) => {
    const s = r.suggestion as {
      category?: z.infer<typeof improvementCategorySchema>;
      title?: string;
      description?: string;
      rationale?: string;
      priority?: string;
      relatedNodeIds?: string[];
      relatedFocusIds?: string[];
    };
    return {
      id: r.id,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      category: s.category ?? "ADD",
      title: s.title ?? "Suggestion",
      description: s.description ?? "",
      rationale: s.rationale ?? "",
      priority: s.priority ?? "medium",
      relatedNodeIds: s.relatedNodeIds ?? [],
      relatedFocusIds: s.relatedFocusIds ?? [],
    };
  });
}

export async function getLatestImbalanceAnalysis(projectId: string) {
  const row = await prisma.aIAnalysis.findFirst({
    where: { projectId, type: "imbalance" },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
    result: row.result,
  };
}
