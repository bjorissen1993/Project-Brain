import type { AiRelationEvidence } from "./relation-strength";

type AnalysisRow = {
  nodeId: string | null;
  result: unknown;
  metadata: unknown;
};

/**
 * Extract deterministic AI relation evidence from stored Ready analyses.
 * Never triggers OpenAI — reads persisted JSON only.
 */
export function extractAiRelationEvidence(
  analyses: AnalysisRow[],
): AiRelationEvidence[] {
  // Newest analysis per node wins.
  const seenNodes = new Set<string>();
  const out: AiRelationEvidence[] = [];

  for (const row of analyses) {
    if (!row.nodeId || seenNodes.has(row.nodeId)) continue;
    seenNodes.add(row.nodeId);

    const result = row.result as {
      suggestedRelations?: Array<{
        targetNodeId?: string;
        relationType?: string;
        confidence?: number;
      }>;
    } | null;
    if (!result?.suggestedRelations?.length) continue;

    const meta = row.metadata as {
      suggestionStatuses?: Record<
        string,
        { status?: "pending" | "accepted" | "rejected" }
      >;
    } | null;

    for (const rel of result.suggestedRelations) {
      if (!rel.targetNodeId || typeof rel.confidence !== "number") continue;
      const type = (rel.relationType ?? "related").trim() || "related";
      const key = `${rel.targetNodeId}::${type}`;
      const status = meta?.suggestionStatuses?.[key]?.status ?? "pending";
      if (status === "rejected") continue;
      out.push({
        sourceNodeId: row.nodeId,
        targetNodeId: rel.targetNodeId,
        relationType: type,
        confidence: Math.max(0, Math.min(100, rel.confidence)),
        status,
      });
    }
  }

  return out;
}
