"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { hasOpenAIApiKey } from "@/features/ai";
import { openAIChatJson } from "@/features/ai/openai-client";
import {
  acceptCombinedNoteSchema,
  combinedNoteDraftSchema,
  combineNotesSchema,
} from "@/lib/validation";
import { createNodeAction, deleteNodeAction, updateNodeAction } from "./actions";
import { blurbFromContent } from "./image-node";

function heuristicCombine(
  notes: { name: string; content: string | null; summary: string | null }[],
): { title: string; summary: string } {
  const names = notes.map((n) => n.name);
  const title =
    names.length <= 2
      ? `${names[0]} + ${names[1] ?? "notes"}`
      : `Combined: ${names.slice(0, 2).join(" · ")}…`;
  const parts = notes.map((n) => {
    const body =
      n.summary?.trim() ||
      blurbFromContent(n.content, 400) ||
      "(no notes yet)";
    return `## ${n.name}\n${body}`;
  });
  return {
    title: title.slice(0, 160),
    summary: `Combined summary of ${notes.length} notes:\n\n${parts.join("\n\n")}`,
  };
}

/**
 * Propose a combined story/summary from selected note-like nodes.
 * Never writes — creator must Accept.
 */
export async function combineNotesAction(raw: unknown): Promise<
  | {
      ok: true;
      title: string;
      summary: string;
      source: "ai" | "heuristic";
      message: string;
    }
  | { ok: false; error: string }
> {
  const parsed = combineNotesSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid combine request",
    };
  }
  const { projectId, sourceNodeIds } = parsed.data;

  const nodes = await prisma.node.findMany({
    where: { projectId, id: { in: sourceNodeIds } },
    select: {
      id: true,
      name: true,
      content: true,
      summary: true,
      type: true,
      customTypeLabel: true,
    },
  });
  if (nodes.length < 2) {
    return { ok: false, error: "Select at least two notes to combine" };
  }

  const ordered = sourceNodeIds
    .map((id) => nodes.find((n) => n.id === id))
    .filter((n): n is (typeof nodes)[number] => Boolean(n));

  if (!hasOpenAIApiKey()) {
    const draft = heuristicCombine(ordered);
    return {
      ok: true,
      ...draft,
      source: "heuristic",
      message:
        "Heuristic combine (no OPENAI_API_KEY). Review before accepting — nothing was saved.",
    };
  }

  const block = ordered
    .map((n, i) => {
      const body =
        n.summary?.trim() ||
        blurbFromContent(n.content, 1200) ||
        "(empty)";
      return `[${i + 1}] ${n.name}\n${body}`;
    })
    .join("\n\n---\n\n");

  const completion = await openAIChatJson({
    system: `You combine creator notes into one coherent narrative or summary. Return JSON only:
{ "title": string, "summary": string }
Rules:
- Preserve creator meaning; do not invent facts.
- Write a flowing story or summary that merges the notes — not a bullet dump of each source.
- summary is markdown-friendly prose the creator can edit.
- title is short (≤80 chars).
- Match the language of the source notes (e.g. Dutch notes → Dutch output).
- Do not mention that you are an AI.`,
    user: `Combine these notes into one coherent story/summary:\n\n${block}`,
    modelTier: "quick",
    temperature: 0.4,
  });

  if (!completion.ok) {
    const draft = heuristicCombine(ordered);
    return {
      ok: true,
      ...draft,
      source: "heuristic",
      message: `AI unavailable (${completion.error}) — showing heuristic draft. Nothing saved.`,
    };
  }

  let incoming: unknown;
  try {
    incoming = JSON.parse(completion.content) as unknown;
  } catch {
    const draft = heuristicCombine(ordered);
    return {
      ok: true,
      ...draft,
      source: "heuristic",
      message: "AI response unreadable — showing heuristic draft. Nothing saved.",
    };
  }

  const validated = combinedNoteDraftSchema.safeParse(incoming);
  if (!validated.success) {
    const draft = heuristicCombine(ordered);
    return {
      ok: true,
      ...draft,
      source: "heuristic",
      message: "AI draft failed validation — showing heuristic draft. Nothing saved.",
    };
  }

  return {
    ok: true,
    title: validated.data.title.slice(0, 160),
    summary: validated.data.summary,
    source: "ai",
    message:
      "Review the combined story, then Accept to create or update a note. Sources stay unless you opt in to remove them.",
  };
}

/** Persist an accepted combine result as a new or updated note. */
export async function acceptCombinedNoteAction(raw: unknown): Promise<
  | { ok: true; nodeId: string; message: string }
  | { ok: false; error: string }
> {
  const parsed = acceptCombinedNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid accept request",
    };
  }
  const data = parsed.data;

  let nodeId: string;

  if (data.targetNodeId) {
    const existing = await prisma.node.findFirst({
      where: { id: data.targetNodeId, projectId: data.projectId },
      select: { id: true },
    });
    if (!existing) {
      return { ok: false, error: "Target note not found" };
    }
    const result = await updateNodeAction({
      id: data.targetNodeId,
      name: data.title,
      content: data.summary,
      summary: blurbFromContent(data.summary, 400) || null,
    });
    if (!result.ok) return { ok: false, error: result.error };
    nodeId = data.targetNodeId;
  } else {
    const created = await createNodeAction({
      projectId: data.projectId,
      parentId: data.parentNodeId ?? null,
      name: data.title,
      type: "IDEA",
      status: "DRAFT",
      content: data.summary,
    });
    if (!created.ok) return { ok: false, error: created.error };

    await updateNodeAction({
      id: created.node.id,
      summary: blurbFromContent(data.summary, 400) || null,
    });
    nodeId = created.node.id;
  }

  let removed = 0;
  if (data.removeSourceNotes) {
    const toRemove = data.sourceNodeIds.filter((id) => id !== nodeId);
    for (const id of toRemove) {
      const del = await deleteNodeAction(id);
      if (del.ok) removed += 1;
    }
  }

  revalidatePath(`/projects/${data.projectId}/focus`);
  if (data.parentNodeId) {
    revalidatePath(`/projects/${data.projectId}/focus/${data.parentNodeId}`);
  }

  const base = data.targetNodeId
    ? "Updated note with the combined story."
    : "Created a new note from the combined story.";
  const sourcesMsg = data.removeSourceNotes
    ? ` Removed ${removed} source note${removed === 1 ? "" : "s"}.`
    : " Sources were not deleted.";

  return {
    ok: true,
    nodeId,
    message: `${base}${sourcesMsg}`,
  };
}
