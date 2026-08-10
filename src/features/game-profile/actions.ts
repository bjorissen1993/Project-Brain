"use server";

import { createHash } from "node:crypto";
import { prisma } from "@/db/client";
import { getAIService } from "@/features/ai";
import { suggestSetupFromIntentInputSchema } from "@/features/ai/setup-suggestion-schema";
import type { SetupSuggestionData } from "@/features/ai/types";

export type SuggestSetupActionResult =
  | {
      ok: true;
      data: SetupSuggestionData;
      source: "ai" | "heuristic";
      model?: string;
      message: string;
      analysisId?: string;
    }
  | { ok: false; error: string };

/**
 * Advisory setup suggestions from project intent.
 * Never writes genres/focuses/intent — only optional AIAnalysis metadata.
 * Creator must Accept/Edit in the wizard, then Finish setup to persist.
 */
export async function suggestSetupFromIntentAction(
  raw: unknown,
): Promise<SuggestSetupActionResult> {
  const parsed = suggestSetupFromIntentInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid intent",
    };
  }

  const { projectId, intentText } = parsed.data;
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return { ok: false, error: "Project not found" };
  }

  const ai = getAIService();
  const result = await ai.suggestSetupFromIntent(
    { projectId, intentText, projectType: project.type },
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
    const inputHash = createHash("sha256")
      .update(intentText)
      .digest("hex")
      .slice(0, 32);

    const analysis = await prisma.aIAnalysis.create({
      data: {
        projectId,
        type: "suggest_setup",
        model: result.model ?? null,
        status: "completed",
        inputHash,
        result: result.data,
        metadata: {
          source: result.data.source,
          stubbed: result.stubbed,
          advisoryOnly: true,
        },
      },
    });
    analysisId = analysis.id;
  } catch {
    // Metadata persistence is best-effort; suggestions still return to the UI.
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
