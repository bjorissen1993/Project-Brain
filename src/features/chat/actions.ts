"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { hasOpenAIApiKey, openAIChatMessages } from "@/features/ai/openai-client";
import { createDesignFocusAction } from "@/features/design-focus/actions";
import { createNodeAction, updateNodeAction } from "@/features/nodes/actions";
import { buildProjectChatContext, CHAT_SYSTEM_PROMPT } from "./context";
import { fetchGptShareConversation } from "./gpt-link";
import {
  buildProfileFollowUpProposals,
  filterNestedProfileSlotProposals,
  followUpAssistantMessage,
  hasDomainFollowUpTemplate,
  isCharacterProfileCreateBatch,
  isCharacterProfileNode,
  isKnownProfileSlotName,
  PROFILE_FOLLOW_UP_MAX,
  userAskedCharacterProfile,
} from "./profile-templates";
import {
  applyChatProposalsSchema,
  attachGptConversationSchema,
  CHAT_ALL_DUPLICATES_FILTERED_MESSAGE,
  CHAT_ALL_PROPOSALS_FILTERED_MESSAGE,
  CHAT_CHARACTER_PROPOSAL_MAX,
  CHAT_EMPTY_PROPOSALS_TEASER_MESSAGE,
  CHAT_PROPOSAL_MAX,
  chatParentKey,
  copyNodeSubtreeSchema,
  filterDuplicateCreateNodeProposals,
  getOrCreateChatThreadSchema,
  GPT_TRANSCRIPT_MAX_CHARS,
  intendedCreateParentKey,
  normalizeChatAiResponse,
  replyPromisesStructuredProposals,
  sendChatMessageSchema,
  sortChatProposalsForApply,
  type ChatProposal,
  type ChatProposalCreateNode,
} from "./schema";
import { z } from "zod";

/** Per prior-turn message cap when building the OpenAI request (latest user msg stays full). */
const CHAT_HISTORY_MESSAGE_MAX_CHARS = 12_000;

/** Compact proposal summary so the model sees prior structured suggestions, not only teaser text. */
function formatProposalsForHistory(proposals: unknown): string | null {
  if (!Array.isArray(proposals) || proposals.length === 0) return null;
  const lines: string[] = [];
  for (const raw of proposals.slice(0, 24)) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    const kind = typeof p.kind === "string" ? p.kind : "?";
    const name = typeof p.name === "string" ? p.name : "";
    if (kind === "create_node" && name) {
      const parent =
        typeof p.parentNodeId === "string"
          ? ` parent=${p.parentNodeId}`
          : Array.isArray(p.parentPath)
            ? ` parentPath=${(p.parentPath as unknown[]).filter((x) => typeof x === "string").join("/")}`
            : typeof p.parentClientKey === "string"
              ? ` parentClientKey=${p.parentClientKey}`
              : "";
      const key =
        typeof p.clientKey === "string" ? ` clientKey=${p.clientKey}` : "";
      lines.push(`- create_node “${name}”${parent}${key}`);
    } else if (kind === "update_node" && typeof p.nodeId === "string") {
      lines.push(`- update_node ${p.nodeId}${name ? ` → “${name}”` : ""}`);
    } else if (kind === "create_focus" && name) {
      lines.push(`- create_focus “${name}”`);
    }
  }
  if (!lines.length) return null;
  const more =
    proposals.length > lines.length
      ? `\n(+${proposals.length - lines.length} more)`
      : "";
  return `[Advisory proposals from this turn — not applied until Accept]\n${lines.join("\n")}${more}`;
}
/** Overall budget for context build + model call (OpenAI fetch itself caps at 90s). */
const CHAT_SEND_OVERALL_TIMEOUT_MS = 95_000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function threadEndsWithAssistant(thread: ChatThreadDTO): boolean {
  for (let i = thread.messages.length - 1; i >= 0; i--) {
    const m = thread.messages[i]!;
    if (m.role === "assistant" && m.content.trim()) return true;
    if (m.role === "user") return false;
  }
  return false;
}

async function persistAssistantError(
  threadId: string,
  projectId: string,
  errorText: string,
  metadata?: Record<string, unknown>,
): Promise<
  | { ok: true; thread: ChatThreadDTO; message: string }
  | { ok: false; error: string }
> {
  const content = errorText.startsWith("Sorry")
    ? errorText
    : `Sorry — ${errorText}. Your message was saved.`;
  console.error("[chat] persisting assistant error:", errorText, metadata ?? {});
  await prisma.chatMessage.create({
    data: {
      threadId,
      role: "assistant",
      content,
      metadata: { error: errorText, ...(metadata ?? {}) },
    },
  });
  await prisma.chatThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date() },
  });
  const dto = await loadThreadDTO(threadId, projectId);
  if (!dto) return { ok: false, error: errorText };
  if (!threadEndsWithAssistant(dto)) {
    console.error(
      "[chat] assistant error saved but missing from returned thread window",
    );
    return { ok: false, error: errorText };
  }
  return { ok: true, thread: dto, message: errorText };
}

export type ChatMessageDTO = {
  id: string;
  role: string;
  content: string;
  proposals: ChatProposal[] | null;
  metadata: unknown;
  createdAt: string;
};

export type ChatThreadDTO = {
  id: string;
  projectId: string;
  contextNodeId: string | null;
  contextNodeName: string | null;
  title: string | null;
  attachedGptText: string | null;
  attachedGptUrl: string | null;
  attachedGptSource: string | null;
  messages: ChatMessageDTO[];
  aiAvailable: boolean;
};

function toMessageDTO(m: {
  id: string;
  role: string;
  content: string;
  proposals: unknown;
  metadata: unknown;
  createdAt: Date;
}): ChatMessageDTO {
  const proposals = Array.isArray(m.proposals)
    ? (m.proposals as ChatProposal[])
    : null;
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    proposals,
    metadata: m.metadata,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Max messages returned to the client — always the newest window. */
const CHAT_THREAD_MESSAGE_WINDOW = 200;
/** Prior turns loaded for the model (newest first, then reversed). */
const CHAT_HISTORY_WINDOW = 40;

async function loadThreadDTO(
  threadId: string,
  projectId: string,
): Promise<ChatThreadDTO | null> {
  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, projectId },
    include: {
      contextNode: { select: { id: true, name: true } },
      // Newest-first + reverse: asc+take would drop brand-new assistant replies
      // once a thread exceeds the window (Thinking ends, no generation in UI).
      messages: {
        orderBy: { createdAt: "desc" },
        take: CHAT_THREAD_MESSAGE_WINDOW,
      },
    },
  });
  if (!thread) return null;
  const messagesChronological = [...thread.messages].reverse();
  return {
    id: thread.id,
    projectId: thread.projectId,
    contextNodeId: thread.contextNodeId,
    contextNodeName: thread.contextNode?.name ?? null,
    title: thread.title,
    attachedGptText: thread.attachedGptText,
    attachedGptUrl: thread.attachedGptUrl,
    attachedGptSource: thread.attachedGptSource,
    messages: messagesChronological.map(toMessageDTO),
    aiAvailable: hasOpenAIApiKey(),
  };
}

function chatSoftFail(error: unknown, fallback = "Chat is temporarily unavailable") {
  console.error("[chat]", error);
  return { ok: false as const, error: fallback };
}

async function resolveContextNode(
  projectId: string,
  contextNodeId: string | null | undefined,
): Promise<
  | { ok: true; contextNodeId: string | null; title: string }
  | { ok: false; error: string }
> {
  const id = contextNodeId?.trim() || null;
  if (!id) {
    return { ok: true, contextNodeId: null, title: "Project chat" };
  }
  const node = await prisma.node.findFirst({
    where: { id, projectId },
    select: { id: true, name: true },
  });
  if (!node) return { ok: false, error: "Context node not found in this project" };
  return {
    ok: true,
    contextNodeId: node.id,
    title: `Chat · ${node.name}`,
  };
}

/** Get or create the chat thread for a project + optional Structure container. */
export async function getOrCreateChatThreadAction(
  raw: unknown,
): Promise<
  { ok: true; thread: ChatThreadDTO } | { ok: false; error: string }
> {
  try {
    const parsed = getOrCreateChatThreadSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request",
      };
    }

    const { projectId } = parsed.data;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) return { ok: false, error: "Project not found" };

    if (
      typeof (prisma as { chatThread?: unknown }).chatThread === "undefined"
    ) {
      return chatSoftFail(
        new Error("prisma.chatThread is undefined — run prisma generate and restart the dev server"),
        "Chat is unavailable (Prisma client outdated). Restart the dev server.",
      );
    }

    const ctx = await resolveContextNode(projectId, parsed.data.contextNodeId);
    if (!ctx.ok) return ctx;

    let thread = await prisma.chatThread.findFirst({
      where: {
        projectId,
        contextNodeId: ctx.contextNodeId,
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });

    if (!thread) {
      thread = await prisma.chatThread.create({
        data: {
          projectId,
          contextNodeId: ctx.contextNodeId,
          title: ctx.title,
        },
        select: { id: true },
      });
    }

    const dto = await loadThreadDTO(thread.id, projectId);
    if (!dto) return { ok: false, error: "Could not load chat thread" };
    return { ok: true, thread: dto };
  } catch (error) {
    return chatSoftFail(error);
  }
}

/**
 * Attach a ChatGPT share link and/or pasted transcript to the thread.
 * Private links never sync automatically — user must paste transcript.
 */
export async function attachGptConversationAction(
  raw: unknown,
): Promise<
  | {
      ok: true;
      thread: ChatThreadDTO;
      message: string;
      needsTranscript?: boolean;
    }
  | { ok: false; error: string; needsTranscript?: boolean }
> {
  const parsed = attachGptConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, url, transcript, contextNodeId } = parsed.data;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) return { ok: false, error: "Project not found" };

  let threadId = parsed.data.threadId;
  if (!threadId) {
    const created = await getOrCreateChatThreadAction({
      projectId,
      contextNodeId,
    });
    if (!created.ok) return created;
    threadId = created.thread.id;
  }

  const thread = await prisma.chatThread.findFirst({
    where: { id: threadId, projectId },
  });
  if (!thread) return { ok: false, error: "Chat thread not found" };

  const pasted = transcript?.trim() || "";
  let attachedText = pasted;
  let source: string | null = pasted ? "paste" : null;
  let attachedUrl: string | null = url?.trim() || null;
  let infoMessage = "";
  let needsTranscript = false;

  if (url?.trim()) {
    const fetched = await fetchGptShareConversation(url.trim());
    if (fetched.ok) {
      attachedUrl = fetched.url;
      if (pasted) {
        attachedText = `${fetched.text}\n\n---\nAdditional pasted transcript:\n${pasted}`;
        source = "paste";
        infoMessage =
          "Share link text plus your pasted transcript are attached as context.";
      } else {
        attachedText = fetched.text;
        source = fetched.source;
        infoMessage =
          fetched.warning ??
          "Share link text attached as context (may be partial).";
      }
    } else {
      needsTranscript = true;
      attachedUrl = fetched.url ?? url.trim();
      if (pasted) {
        attachedText = pasted;
        source = "paste";
        infoMessage = `${fetched.message} Using your pasted transcript as context.`;
        needsTranscript = false;
      } else {
        source = "failed_share";
        await prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            attachedGptUrl: attachedUrl,
            attachedGptSource: source,
            attachedGptText: null,
          },
        });
        const dto = await loadThreadDTO(thread.id, projectId);
        if (!dto) return { ok: false, error: "Could not load chat thread" };
        return {
          ok: false,
          error: fetched.message,
          needsTranscript: true,
        };
      }
    }
  } else if (!pasted) {
    return {
      ok: false,
      error: "Provide a ChatGPT share link and/or paste the transcript.",
      needsTranscript: true,
    };
  } else {
    source = "paste";
    infoMessage =
      "Pasted transcript attached as context. (Private ChatGPT history is never synced automatically.)";
  }

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      attachedGptText: attachedText.slice(0, GPT_TRANSCRIPT_MAX_CHARS),
      attachedGptUrl: attachedUrl,
      attachedGptSource: source,
    },
  });

  // System note in the thread for transparency.
  await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      role: "system",
      content:
        source === "share_fetch"
          ? "Attached GPT conversation from a public share link (may be partial)."
          : "Attached GPT conversation from pasted transcript / export text.",
      metadata: {
        kind: "attachment",
        source,
        url: attachedUrl,
        chars: attachedText.length,
      },
    },
  });

  const dto = await loadThreadDTO(thread.id, projectId);
  if (!dto) return { ok: false, error: "Could not load chat thread" };
  return {
    ok: true,
    thread: dto,
    message: infoMessage,
    needsTranscript: needsTranscript || undefined,
  };
}

/** Send a user message and get an assistant reply (advisory proposals only). */
export async function sendChatMessageAction(
  raw: unknown,
): Promise<
  | { ok: true; thread: ChatThreadDTO; deferred?: boolean; message?: string }
  | { ok: false; error: string }
> {
  let savedThreadId: string | null = null;
  let savedProjectId: string | null = null;

  try {
    const parsed = sendChatMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid request",
      };
    }

    const { projectId, message, focusSummary, contextNodeId } = parsed.data;
    savedProjectId = projectId;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    if (!project) return { ok: false, error: "Project not found" };

    let threadId = parsed.data.threadId;
    if (!threadId) {
      const created = await getOrCreateChatThreadAction({
        projectId,
        contextNodeId,
      });
      if (!created.ok) return created;
      threadId = created.thread.id;
    }

    const thread = await prisma.chatThread.findFirst({
      where: { id: threadId, projectId },
      include: {
        // Newest window for model history (reversed below) — not the oldest 40.
        messages: {
          orderBy: { createdAt: "desc" },
          take: CHAT_HISTORY_WINDOW,
        },
      },
    });
    if (!thread) return { ok: false, error: "Chat thread not found" };
    // Newest-first from DB → chronological for the prompt.
    const priorMessages = [...thread.messages].reverse();

    const effectiveContextId = thread.contextNodeId ?? contextNodeId ?? null;

    // Persist user message first so a later failure never loses the send.
    await prisma.chatMessage.create({
      data: {
        threadId: thread.id,
        role: "user",
        content: message,
        metadata: {
          ...(focusSummary?.trim()
            ? { focusSummary: focusSummary.trim().slice(0, 2000) }
            : {}),
          ...(effectiveContextId ? { contextNodeId: effectiveContextId } : {}),
        },
      },
    });
    savedThreadId = thread.id;

    if (!hasOpenAIApiKey()) {
      await prisma.chatMessage.create({
        data: {
          threadId: thread.id,
          role: "assistant",
          content:
            "Chat is pending — configure OPENAI_API_KEY to enable Project Brain AI replies. Your message was saved.",
          metadata: { deferred: true },
        },
      });
      await prisma.chatThread.update({
        where: { id: thread.id },
        data: { updatedAt: new Date() },
      });
      const dto = await loadThreadDTO(thread.id, projectId);
      if (!dto) return { ok: false, error: "Could not load chat thread" };
      return {
        ok: true,
        thread: dto,
        deferred: true,
        message: "Chat pending — configure OPENAI_API_KEY",
      };
    }

    try {
      type AiTurnResult =
        | { ok: true; thread: ChatThreadDTO; message?: string }
        | { ok: false; error: string };

      const aiTurn = async (): Promise<AiTurnResult> => {
        const contextBlock = await buildProjectChatContext(projectId, {
          contextNodeId: effectiveContextId,
          focusSummary,
          attachedGptText: thread.attachedGptText,
          attachedGptSource: thread.attachedGptSource,
          attachedGptUrl: thread.attachedGptUrl,
        });

        const history = priorMessages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .slice(-24)
          .map((m) => {
            let content = m.content;
            if (m.role === "assistant") {
              const proposalBlock = formatProposalsForHistory(m.proposals);
              if (proposalBlock) {
                content = `${content}\n\n${proposalBlock}`;
              }
            }
            if (content.length > CHAT_HISTORY_MESSAGE_MAX_CHARS) {
              content = `${content.slice(0, CHAT_HISTORY_MESSAGE_MAX_CHARS - 1)}…`;
            }
            return {
              role: m.role as "user" | "assistant",
              content,
            };
          });

        const aiResult = await openAIChatMessages({
          modelTier: "standard",
          temperature: 0.4,
          jsonObject: true,
          messages: [
            { role: "system", content: CHAT_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Project context:\n${contextBlock ?? "(none)"}\n\n---\nRespond to the next user message as JSON.`,
            },
            ...history,
            // Current turn keeps the full accepted message (up to CHAT_MESSAGE_MAX_CHARS).
            { role: "user", content: message },
          ],
        });

        if (!aiResult.ok) {
          return persistAssistantError(
            thread.id,
            projectId,
            `the AI request failed: ${aiResult.error}`,
            { model: aiResult.model },
          );
        }

        let parsedJson: unknown;
        try {
          parsedJson = JSON.parse(aiResult.content) as unknown;
        } catch (parseError) {
          console.error(
            "[chat] assistant JSON parse failed; using raw text reply",
            parseError,
          );
          const raw = aiResult.content.trim();
          parsedJson = {
            reply:
              raw.slice(0, 12000) ||
              "I couldn’t produce a structured reply. Please try again.",
            proposals: [],
          };
        }

        const normalized = normalizeChatAiResponse(parsedJson);
        if (!normalized) {
          console.error(
            "[chat] assistant response failed schema normalize; saving text fallback",
          );
        }
        const parsedReply =
          typeof parsedJson === "object" &&
          parsedJson &&
          typeof (parsedJson as { reply?: unknown }).reply === "string"
            ? String((parsedJson as { reply: string }).reply).trim().slice(0, 12000)
            : "";
        const rawContent =
          typeof aiResult.content === "string" && aiResult.content.trim()
            ? aiResult.content.trim().slice(0, 12000)
            : "";
        let reply =
          normalized?.reply ||
          parsedReply ||
          rawContent ||
          "I couldn’t produce a structured reply. Please try again.";
        let proposals = normalized?.proposals ?? [];
        const droppedInvalidCount = normalized?.droppedInvalidCount ?? 0;
        const truncatedCount = normalized?.truncatedCount ?? 0;
        if (droppedInvalidCount > 0 || truncatedCount > 0) {
          console.warn("[chat] proposals salvaged with drops", {
            kept: proposals.length,
            droppedInvalidCount,
            truncatedCount,
          });
        }

        // Hard filter: never show create_node titles that already exist as siblings
        // under the intended parent (including deep path / clientKey targets).
        const resolvedParentByIndex = new Map<number, string | null>();
        const parentIdsForFilter: (string | null)[] = [effectiveContextId];
        await Promise.all(
          proposals.map(async (p, index) => {
            if (p.kind !== "create_node") return;
            if (p.parentClientKey) return;
            const resolved = await resolveExistingCreateParentId(
              projectId,
              p,
              effectiveContextId,
            );
            if (resolved.ok) {
              resolvedParentByIndex.set(index, resolved.parentId);
              parentIdsForFilter.push(resolved.parentId);
            } else if (p.parentNodeId) {
              parentIdsForFilter.push(p.parentNodeId);
            } else if (p.parentPathIds?.length) {
              parentIdsForFilter.push(
                p.parentPathIds[p.parentPathIds.length - 1] ?? null,
              );
            }
          }),
        );
        const existingByParent = await loadExistingChildNamesByParent(
          projectId,
          parentIdsForFilter,
        );
        const filtered = filterDuplicateCreateNodeProposals(proposals, {
          defaultParentId: effectiveContextId,
          existingByParent,
          resolvedParentByIndex,
        });
        if (filtered.removedCount > 0) {
          console.warn("[chat] duplicate create_node proposals filtered", {
            removed: filtered.removedCount,
            kept: filtered.proposals.length,
          });
        }
        proposals = filtered.proposals;
        const parentNameById = await loadNodeNamesById(
          projectId,
          collectReferencedParentIds(proposals),
        );
        const nestedFiltered = filterNestedProfileSlotProposals(proposals, {
          parentNameById,
        });
        if (nestedFiltered.removedCount > 0) {
          console.warn("[chat] nested profile-slot proposals filtered", {
            removed: nestedFiltered.removedCount,
            kept: nestedFiltered.proposals.length,
          });
        }
        proposals = nestedFiltered.proposals;
        // Character/NPC batches: keep a flat, concise create list.
        const createCap = isCharacterProfileCreateBatch(proposals)
          ? CHAT_CHARACTER_PROPOSAL_MAX
          : CHAT_PROPOSAL_MAX;
        if (proposals.length > createCap) {
          proposals = proposals.slice(0, createCap);
        }
        // Soft-fail: keep the text reply even when every proposal was filtered.
        if (
          filtered.removedCount + nestedFiltered.removedCount > 0 &&
          proposals.length === 0
        ) {
          const notice =
            nestedFiltered.removedCount > 0 && filtered.removedCount === 0
              ? CHAT_ALL_PROPOSALS_FILTERED_MESSAGE
              : filtered.removedCount > 0 && nestedFiltered.removedCount === 0
                ? CHAT_ALL_DUPLICATES_FILTERED_MESSAGE
                : CHAT_ALL_PROPOSALS_FILTERED_MESSAGE;
          reply = `${reply}\n\n${notice}`;
        } else if (
          proposals.length === 0 &&
          replyPromisesStructuredProposals(reply)
        ) {
          // Model teased a list in reply but left proposals empty / all invalid.
          console.warn("[chat] empty proposal teaser without structured items", {
            droppedInvalidCount,
            truncatedCount,
          });
          reply = `${reply}\n\n${CHAT_EMPTY_PROPOSALS_TEASER_MESSAGE}`;
        }

        await prisma.chatMessage.create({
          data: {
            threadId: thread.id,
            role: "assistant",
            content: reply,
            ...(proposals.length ? { proposals } : {}),
            metadata: {
              model: aiResult.model,
              advisoryOnly: true,
              proposalCount: proposals.length,
              ...(droppedInvalidCount
                ? { droppedInvalidProposals: droppedInvalidCount }
                : {}),
              ...(truncatedCount
                ? { truncatedProposals: truncatedCount }
                : {}),
              ...(filtered.removedCount
                ? { filteredDuplicateProposals: filtered.removedCount }
                : {}),
              ...(nestedFiltered.removedCount
                ? {
                    filteredNestedProfileProposals: nestedFiltered.removedCount,
                  }
                : {}),
            },
          },
        });

        await prisma.chatThread.update({
          where: { id: thread.id },
          data: {
            updatedAt: new Date(),
            title: thread.title ?? truncateTitle(message),
          },
        });

        const dto = await loadThreadDTO(thread.id, projectId);
        if (!dto) {
          return { ok: false as const, error: "Could not load chat thread" };
        }
        if (!threadEndsWithAssistant(dto)) {
          console.error(
            "[chat] assistant message created but missing from thread DTO",
          );
          return {
            ok: false as const,
            error:
              "AI reply was saved but could not be loaded. Refresh the chat and try again.",
          };
        }
        return { ok: true as const, thread: dto };
      };

      return await withTimeout<AiTurnResult>(
        aiTurn(),
        CHAT_SEND_OVERALL_TIMEOUT_MS,
        "Chat reply",
      );
    } catch (error) {
      console.error("[chat] send failed after user message", error);
      const errText =
        error instanceof Error ? error.message : "Chat processing failed";
      return persistAssistantError(thread.id, projectId, errText);
    }
  } catch (error) {
    // User message may already be saved — try to surface an assistant error.
    if (savedThreadId && savedProjectId) {
      console.error("[chat] send outer failure", error);
      const errText =
        error instanceof Error ? error.message : "Chat is temporarily unavailable";
      try {
        return await persistAssistantError(
          savedThreadId,
          savedProjectId,
          errText,
        );
      } catch (persistError) {
        return chatSoftFail(persistError, errText);
      }
    }
    return chatSoftFail(error);
  }
}

function truncateTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 60 ? t : `${t.slice(0, 57)}…`;
}

async function assertParentInProject(
  projectId: string,
  parentNodeId: string | null | undefined,
): Promise<boolean> {
  if (!parentNodeId) return true;
  const parent = await prisma.node.findFirst({
    where: { id: parentNodeId, projectId },
    select: { id: true },
  });
  return Boolean(parent);
}

/** True if nodeId is the context container or a descendant (any depth). Root context = any project node. */
async function assertNodeInContextSubtree(
  projectId: string,
  nodeId: string,
  contextNodeId: string | null,
): Promise<boolean> {
  if (!contextNodeId) {
    const node = await prisma.node.findFirst({
      where: { id: nodeId, projectId },
      select: { id: true },
    });
    return Boolean(node);
  }
  if (nodeId === contextNodeId) return true;

  // Walk parents upward — never load the entire project tree.
  let cur: string | null = nodeId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === contextNodeId) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    const parentId: string | null | undefined = (
      await prisma.node.findFirst({
        where: { id: cur, projectId },
        select: { parentId: true },
      })
    )?.parentId;
    if (parentId === undefined) return false;
    cur = parentId;
  }
  return false;
}

/** Case-insensitive child lookup under a parent. */
async function findChildByName(
  projectId: string,
  parentId: string | null,
  name: string,
): Promise<{ id: string; name: string } | null> {
  const children = await prisma.node.findMany({
    where: { projectId, parentId },
    select: { id: true, name: true },
    take: 120,
  });
  const target = name.trim().toLowerCase();
  return children.find((c) => c.name.trim().toLowerCase() === target) ?? null;
}

/**
 * Resolve a create_node's parent using existing nodes only (no folder creation).
 * Used for duplicate filtering before Accept.
 */
async function resolveExistingCreateParentId(
  projectId: string,
  proposal: ChatProposalCreateNode,
  defaultParentId: string | null,
): Promise<{ ok: true; parentId: string | null } | { ok: false }> {
  if (proposal.parentClientKey) {
    return { ok: false };
  }
  if (proposal.parentNodeId) {
    const ok = await assertParentInProject(projectId, proposal.parentNodeId);
    return ok
      ? { ok: true, parentId: proposal.parentNodeId }
      : { ok: false };
  }
  if (proposal.parentPathIds?.length) {
    const last = proposal.parentPathIds[proposal.parentPathIds.length - 1]!;
    const ok = await assertParentInProject(projectId, last);
    return ok ? { ok: true, parentId: last } : { ok: false };
  }
  if (proposal.parentPath?.length) {
    let current: string | null = defaultParentId;
    for (const segment of proposal.parentPath) {
      const child = await findChildByName(projectId, current, segment);
      if (!child) return { ok: false };
      current = child.id;
    }
    return { ok: true, parentId: current };
  }
  return { ok: true, parentId: defaultParentId };
}

type CreatedRecord = {
  kind: string;
  id: string;
  name: string;
  type?: string;
  parentId?: string | null;
};

/**
 * Resolve parent for apply: clientKey map, ids, or parentPath with optional
 * intermediate FOLDER creation (only when Accepting).
 */
async function resolveCreateParentForApply(
  projectId: string,
  proposal: ChatProposalCreateNode,
  opts: {
    defaultParentId: string | null;
    clientKeyToId: Map<string, string>;
    created: CreatedRecord[];
  },
): Promise<
  { ok: true; parentId: string | null } | { ok: false; error: string }
> {
  if (proposal.parentClientKey) {
    const id = opts.clientKeyToId.get(proposal.parentClientKey);
    if (!id) {
      return {
        ok: false,
        error: `Missing parent draft “${proposal.parentClientKey}” for “${proposal.name}” (accept the parent create too, or fix parentClientKey)`,
      };
    }
    return { ok: true, parentId: id };
  }

  if (proposal.parentNodeId) {
    if (!(await assertParentInProject(projectId, proposal.parentNodeId))) {
      return {
        ok: false,
        error: `Parent node not found for “${proposal.name}”`,
      };
    }
    return { ok: true, parentId: proposal.parentNodeId };
  }

  if (proposal.parentPathIds?.length) {
    const last = proposal.parentPathIds[proposal.parentPathIds.length - 1]!;
    if (!(await assertParentInProject(projectId, last))) {
      return {
        ok: false,
        error: `Parent path id not found for “${proposal.name}”`,
      };
    }
    return { ok: true, parentId: last };
  }

  if (proposal.parentPath?.length) {
    let current: string | null = opts.defaultParentId;
    for (const segment of proposal.parentPath) {
      const existing = await findChildByName(projectId, current, segment);
      if (existing) {
        current = existing.id;
        continue;
      }
      // Create missing intermediate folder on Accept only.
      if (!(await assertParentInProject(projectId, current))) {
        return {
          ok: false,
          error: `Cannot create path folder “${segment}” for “${proposal.name}”`,
        };
      }
      const folder = await createNodeAction({
        projectId,
        name: segment,
        type: "FOLDER",
        content: null,
        parentId: current,
        status: "IDEA",
      });
      if (!folder.ok) {
        return {
          ok: false,
          error:
            folder.error ??
            `Failed to create intermediate folder “${segment}”`,
        };
      }
      opts.created.push({
        kind: "create_node",
        id: folder.node.id,
        name: folder.node.name,
        type: folder.node.type,
        parentId: folder.node.parentId,
      });
      current = folder.node.id;
    }
    return { ok: true, parentId: current };
  }

  return { ok: true, parentId: opts.defaultParentId };
}

/** Load direct child titles keyed by parent id ("" = project root). */
async function loadExistingChildNamesByParent(
  projectId: string,
  parentIds: (string | null | undefined)[],
): Promise<Map<string, string[]>> {
  const uniqueKeys = [
    ...new Set(
      parentIds
        .filter((id) => id === null || id === undefined || !String(id).startsWith("client:"))
        .map((id) => chatParentKey(id)),
    ),
  ];
  const map = new Map<string, string[]>();
  await Promise.all(
    uniqueKeys.map(async (key) => {
      const parentId = key === "" ? null : key;
      const children = await prisma.node.findMany({
        where: { projectId, parentId },
        select: { name: true },
        take: 80,
      });
      map.set(
        key,
        children.map((c) => c.name),
      );
    }),
  );
  return map;
}

function collectReferencedParentIds(proposals: ChatProposal[]): string[] {
  const ids: string[] = [];
  for (const p of proposals) {
    if (p.kind !== "create_node") continue;
    if (p.parentNodeId) ids.push(p.parentNodeId);
    if (p.parentPathIds?.length) {
      ids.push(...p.parentPathIds);
    }
  }
  return [...new Set(ids)];
}

async function loadNodeNamesById(
  projectId: string,
  nodeIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(nodeIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await prisma.node.findMany({
    where: { projectId, id: { in: unique } },
    select: { id: true, name: true },
  });
  return new Map(rows.map((r) => [r.id, r.name]));
}

/**
 * Apply accepted chat proposals. Never called automatically by the AI path.
 */
export async function applyChatProposalsAction(
  raw: unknown,
): Promise<
  | {
      ok: true;
      created: { kind: string; id: string; name: string; type?: string }[];
      message: string;
      thread: ChatThreadDTO;
      copyProfileSourceIds?: string[];
    }
  | { ok: false; error: string }
> {
  const parsed = applyChatProposalsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, messageId, proposals } = parsed.data;
  const message = await prisma.chatMessage.findFirst({
    where: { id: messageId, thread: { projectId } },
    include: {
      thread: {
        select: { id: true, projectId: true, contextNodeId: true },
      },
    },
  });
  if (!message) return { ok: false, error: "Chat message not found" };

  const defaultParentId = message.thread.contextNodeId;
  const created: CreatedRecord[] = [];
  const followUpParents: {
    id: string;
    name: string;
    type: string;
    content?: string | null;
  }[] = [];
  const clientKeyToId = new Map<string, string>();

  const recentUserMessages = await prisma.chatMessage.findMany({
    where: { threadId: message.threadId, role: "user" },
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { content: true },
  });
  const askedCharacterProfile = recentUserMessages.some((m) =>
    userAskedCharacterProfile(m.content),
  );

  // Defense in depth: drop create_node titles that already exist as siblings.
  const orderedForFilter = sortChatProposalsForApply(proposals);
  const resolvedParentByIndex = new Map<number, string | null>();
  const applyParentIds: (string | null)[] = [defaultParentId ?? null];
  for (let i = 0; i < orderedForFilter.length; i++) {
    const p = orderedForFilter[i]!;
    if (p.kind !== "create_node") continue;
    if (p.parentClientKey) continue;
    const resolved = await resolveExistingCreateParentId(
      projectId,
      p,
      defaultParentId ?? null,
    );
    if (resolved.ok) {
      resolvedParentByIndex.set(i, resolved.parentId);
      applyParentIds.push(resolved.parentId);
    } else if (p.parentNodeId) {
      applyParentIds.push(p.parentNodeId);
    }
  }
  const existingAtApply = await loadExistingChildNamesByParent(
    projectId,
    applyParentIds,
  );
  // Also seed sibling maps for in-batch clientKey parents as they appear.
  const { proposals: filteredProposals, removedCount: skippedDuplicates } =
    filterDuplicateCreateNodeProposals(orderedForFilter, {
      defaultParentId: defaultParentId ?? null,
      existingByParent: existingAtApply,
      resolvedParentByIndex,
    });
  const parentNameById = await loadNodeNamesById(
    projectId,
    collectReferencedParentIds(filteredProposals),
  );
  const nestedFiltered = filterNestedProfileSlotProposals(filteredProposals, {
    parentNameById,
  });
  let cappedProposals = nestedFiltered.proposals;
  const createCap = isCharacterProfileCreateBatch(cappedProposals)
    ? CHAT_CHARACTER_PROPOSAL_MAX
    : CHAT_PROPOSAL_MAX;
  if (cappedProposals.length > createCap) {
    cappedProposals = cappedProposals.slice(0, createCap);
  }
  const applyProposals = sortChatProposalsForApply(cappedProposals);
  if (applyProposals.length === 0) {
    return {
      ok: false,
      error:
        skippedDuplicates > 0
          ? CHAT_ALL_DUPLICATES_FILTERED_MESSAGE
          : "No proposals to apply",
    };
  }

  for (const proposal of applyProposals) {
    if (proposal.kind === "create_node") {
      // Sibling key before creating path folders (clientKey / known ids / path).
      let knownParentId: string | null | undefined;
      if (proposal.parentClientKey) {
        knownParentId = clientKeyToId.get(proposal.parentClientKey) ?? undefined;
        if (knownParentId === undefined) {
          return {
            ok: false,
            error: `Missing parent draft “${proposal.parentClientKey}” for “${proposal.name}” (accept the parent create too, or fix parentClientKey)`,
          };
        }
      } else {
        const existingParent = await resolveExistingCreateParentId(
          projectId,
          proposal,
          defaultParentId ?? null,
        );
        if (existingParent.ok) knownParentId = existingParent.parentId;
      }

      const siblingKey = intendedCreateParentKey(
        proposal,
        defaultParentId ?? null,
        knownParentId,
      );
      if (
        knownParentId !== undefined &&
        !existingAtApply.has(siblingKey)
      ) {
        const names = await loadExistingChildNamesByParent(projectId, [
          knownParentId,
        ]);
        existingAtApply.set(
          siblingKey,
          names.get(chatParentKey(knownParentId)) ?? [],
        );
      }
      const siblings = existingAtApply.get(siblingKey) ?? [];
      if (
        filterDuplicateCreateNodeProposals([proposal], {
          defaultParentId: defaultParentId ?? null,
          existingByParent: new Map([[siblingKey, siblings]]),
          resolvedParentByIndex:
            knownParentId !== undefined
              ? new Map([[0, knownParentId]])
              : undefined,
        }).removedCount > 0
      ) {
        continue;
      }

      const parentResolved = await resolveCreateParentForApply(
        projectId,
        proposal,
        {
          defaultParentId: defaultParentId ?? null,
          clientKeyToId,
          created,
        },
      );
      if (!parentResolved.ok) {
        return { ok: false, error: parentResolved.error };
      }
      const parentNodeId = parentResolved.parentId;
      if (parentNodeId) {
        const parentInScope = await assertNodeInContextSubtree(
          projectId,
          parentNodeId,
          defaultParentId ?? null,
        );
        if (!parentInScope) {
          return {
            ok: false,
            error: `Parent for “${proposal.name}” is outside the current chat folder scope`,
          };
        }
        // Hard reject: never nest a known profile slot under another known slot
        // that was created in this accept batch (draft recursion). Existing
        // project folders that share slot-like names (e.g. "Dialogue") are kept.
        if (isKnownProfileSlotName(proposal.name)) {
          const parentFromBatch = created.find((c) => c.id === parentNodeId);
          if (
            parentFromBatch &&
            isKnownProfileSlotName(parentFromBatch.name)
          ) {
            console.warn(
              "[chat] skip apply: nested profile slot under batch parent",
              { child: proposal.name, parent: parentFromBatch.name },
            );
            continue;
          }
        }
      } else if (defaultParentId) {
        // Creating at project root while chatting inside a folder — not allowed.
        return {
          ok: false,
          error: `“${proposal.name}” must be created under the current folder (or a descendant)`,
        };
      }
      const finalSiblingKey = chatParentKey(parentNodeId);
      if (!existingAtApply.has(finalSiblingKey)) {
        const names = await loadExistingChildNamesByParent(projectId, [
          parentNodeId,
        ]);
        existingAtApply.set(
          finalSiblingKey,
          names.get(finalSiblingKey) ?? [],
        );
      }
      const finalSiblings = existingAtApply.get(finalSiblingKey) ?? [];
      // Re-check after path folders resolve (intended parent may differ from path: key).
      if (
        filterDuplicateCreateNodeProposals([proposal], {
          defaultParentId: defaultParentId ?? null,
          existingByParent: new Map([[finalSiblingKey, finalSiblings]]),
          resolvedParentByIndex: new Map([[0, parentNodeId]]),
        }).removedCount > 0
      ) {
        continue;
      }

      const result = await createNodeAction({
        projectId,
        name: proposal.name,
        type: proposal.type,
        content: proposal.content ?? null,
        parentId: parentNodeId,
        status: "IDEA",
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.error ?? `Failed to create node “${proposal.name}”`,
        };
      }
      created.push({
        kind: "create_node",
        id: result.node.id,
        name: result.node.name,
        type: result.node.type,
        parentId: result.node.parentId,
      });
      finalSiblings.push(result.node.name);
      existingAtApply.set(finalSiblingKey, finalSiblings);
      if (proposal.clientKey) {
        clientKeyToId.set(proposal.clientKey, result.node.id);
      }
      // Domain follow-ups only for real roots — never on known slot folders,
      // and never on arbitrary FOLDER/IDEA children under a character.
      if (
        !isKnownProfileSlotName(result.node.name) &&
        hasDomainFollowUpTemplate(
          result.node.type,
          result.node.name,
          result.node.content,
          { userAskedCharacterProfile: askedCharacterProfile },
        )
      ) {
        followUpParents.push({
          id: result.node.id,
          name: result.node.name,
          type: result.node.type,
          content: result.node.content,
        });
      }
    } else if (proposal.kind === "update_node") {
      const existing = await prisma.node.findFirst({
        where: { id: proposal.nodeId, projectId },
        select: { id: true, name: true },
      });
      if (!existing) {
        return {
          ok: false,
          error: `Node not found for update (${proposal.nodeId})`,
        };
      }
      const inScope = await assertNodeInContextSubtree(
        projectId,
        proposal.nodeId,
        defaultParentId ?? null,
      );
      if (!inScope) {
        return {
          ok: false,
          error: `Node “${existing.name}” is outside the current chat folder scope`,
        };
      }
      const result = await updateNodeAction({
        id: proposal.nodeId,
        ...(proposal.name !== undefined ? { name: proposal.name } : {}),
        ...(proposal.type !== undefined ? { type: proposal.type } : {}),
        ...(proposal.content !== undefined ? { content: proposal.content } : {}),
        ...(proposal.status !== undefined ? { status: proposal.status } : {}),
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.error ?? `Failed to update node “${existing.name}”`,
        };
      }
      created.push({
        kind: "update_node",
        id: result.node.id,
        name: result.node.name,
        type: result.node.type,
      });
    } else {
      const result = await createDesignFocusAction({
        projectId,
        name: proposal.name,
        targetImportance: proposal.targetImportance,
        parentId: proposal.parentFocusId ?? null,
        isCustom: true,
        description: proposal.description ?? null,
        createIdeaNode: Boolean(proposal.description?.trim()),
      });
      if (!result.ok) {
        return {
          ok: false,
          error: result.error ?? `Failed to create focus “${proposal.name}”`,
        };
      }
      created.push({
        kind: "create_focus",
        id: result.focus.id,
        name: result.focus.name,
      });
    }
  }

  if (created.length === 0) {
    return {
      ok: false,
      error:
        skippedDuplicates > 0
          ? CHAT_ALL_DUPLICATES_FILTERED_MESSAGE
          : "No proposals to apply",
    };
  }

  const meta =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as Record<string, unknown>)
      : {};

  await prisma.chatMessage.update({
    where: { id: messageId },
    data: {
      metadata: {
        ...meta,
        appliedAt: new Date().toISOString(),
        appliedCount: created.length,
        appliedIds: created.map((c) => c.id),
      },
    },
  });

  const createdLabel = created
    .map((c) =>
      c.kind === "update_node" ? `updated ${c.name}` : c.name,
    )
    .join(", ");

  await prisma.chatMessage.create({
    data: {
      threadId: message.threadId,
      role: "system",
      content: `Accepted ${created.length} proposal(s): ${createdLabel}.`,
      metadata: {
        kind: "applied",
        created,
      },
    },
  });

  // Follow-up: domain-aware child slots (NPC templates only for characters).
  if (followUpParents.length > 0) {
    const intent = await prisma.projectIntentVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { content: true },
    });
    const existingUnderNew = await loadExistingChildNamesByParent(
      projectId,
      followUpParents.map((p) => p.id),
    );
    const followUps = buildProfileFollowUpProposals(followUpParents, {
      intentSnippet: intent?.content,
      existingChildrenByParentId: existingUnderNew,
      maxTotal: PROFILE_FOLLOW_UP_MAX,
      userAskedCharacterProfile: askedCharacterProfile,
    });
    if (followUps.length > 0) {
      await prisma.chatMessage.create({
        data: {
          threadId: message.threadId,
          role: "assistant",
          content: followUpAssistantMessage(followUpParents, {
            userAskedCharacterProfile: askedCharacterProfile,
          }),
          proposals: followUps,
          metadata: {
            kind: "profile_follow_up",
            advisoryOnly: true,
            parentIds: followUpParents.map((p) => p.id),
            proposalCount: followUps.length,
          },
        },
      });
    }
  }

  // Copy profile only for actual character/NPC parents that gained children.
  const parentIdsGainingChildren = [
    ...new Set(
      created
        .filter((c) => c.kind === "create_node" && c.parentId)
        .map((c) => c.parentId as string),
    ),
  ];
  let copyProfileSourceIds: string[] = [];
  if (parentIdsGainingChildren.length > 0) {
    const parents = await prisma.node.findMany({
      where: { projectId, id: { in: parentIdsGainingChildren } },
      select: {
        id: true,
        name: true,
        type: true,
        content: true,
        _count: { select: { children: true } },
      },
    });
    const copyTargets = parents.filter(
      (p) =>
        p._count.children > 0 &&
        isCharacterProfileNode(p.type, p.name, p.content, {
          userAskedCharacterProfile: askedCharacterProfile,
        }),
    );
    if (copyTargets.length > 0) {
      copyProfileSourceIds = copyTargets.map((p) => p.id);
      await prisma.chatMessage.create({
        data: {
          threadId: message.threadId,
          role: "system",
          content: `Profile structure ready for ${copyTargets.map((p) => p.name).join(", ")}. Use Copy profile to duplicate the child slots onto new names.`,
          metadata: {
            kind: "copy_profile_offer",
            copyProfileSourceIds,
            created: copyTargets.map((p) => ({
              id: p.id,
              name: p.name,
              kind: "profile",
            })),
          },
        },
      });
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/focus`);
  revalidatePath(`/projects/${projectId}/design-focus`);
  if (defaultParentId) {
    revalidatePath(`/projects/${projectId}/focus/${defaultParentId}`);
  }

  const dto = await loadThreadDTO(message.threadId, projectId);
  if (!dto) return { ok: false, error: "Could not load chat thread" };

  return {
    ok: true,
    created,
    message: `Applied ${created.length} item(s).`,
    thread: dto,
    copyProfileSourceIds,
  };
}

export async function clearGptAttachmentAction(
  raw: unknown,
): Promise<
  { ok: true; thread: ChatThreadDTO } | { ok: false; error: string }
> {
  const parsed = attachGptConversationSchema
    .pick({ projectId: true, threadId: true, contextNodeId: true })
    .safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, threadId, contextNodeId } = parsed.data;
  const thread = threadId
    ? await prisma.chatThread.findFirst({
        where: { id: threadId, projectId },
      })
    : await prisma.chatThread.findFirst({
        where: {
          projectId,
          contextNodeId: contextNodeId?.trim() || null,
        },
        orderBy: { updatedAt: "desc" },
      });

  if (!thread) return { ok: false, error: "Chat thread not found" };

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: {
      attachedGptText: null,
      attachedGptUrl: null,
      attachedGptSource: null,
    },
  });

  const dto = await loadThreadDTO(thread.id, projectId);
  if (!dto) return { ok: false, error: "Could not load chat thread" };
  return { ok: true, thread: dto };
}

type NodeCopyRow = {
  id: string;
  name: string;
  type: string;
  customTypeLabel: string | null;
  status: string;
  content: string | null;
  summary: string | null;
  parentId: string | null;
  designFocusId: string | null;
  gamePhase: string | null;
  sortOrder: number;
};

type NodeImageCopyRow = {
  nodeId: string;
  url: string;
  filename: string | null;
  mimeType: string | null;
  sortOrder: number;
};

async function loadSubtree(
  projectId: string,
  rootId: string,
): Promise<{ nodes: NodeCopyRow[]; imagesByNode: Map<string, NodeImageCopyRow[]> } | null> {
  const all = await prisma.node.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      type: true,
      customTypeLabel: true,
      status: true,
      content: true,
      summary: true,
      parentId: true,
      designFocusId: true,
      gamePhase: true,
      sortOrder: true,
    },
  });
  const byParent = new Map<string | null, NodeCopyRow[]>();
  for (const row of all) {
    const list = byParent.get(row.parentId) ?? [];
    list.push(row as NodeCopyRow);
    byParent.set(row.parentId, list);
  }
  const root = all.find((n) => n.id === rootId);
  if (!root) return null;

  const out: NodeCopyRow[] = [root as NodeCopyRow];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      out.push(child);
      stack.push(child.id);
    }
  }

  const imagesByNode = new Map<string, NodeImageCopyRow[]>();
  const nodeImage = (prisma as { nodeImage?: typeof prisma.nodeImage }).nodeImage;
  if (nodeImage && out.length > 0) {
    const images = await nodeImage.findMany({
      where: { projectId, nodeId: { in: out.map((n) => n.id) } },
      select: {
        nodeId: true,
        url: true,
        filename: true,
        mimeType: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    for (const img of images) {
      const list = imagesByNode.get(img.nodeId) ?? [];
      list.push(img);
      imagesByNode.set(img.nodeId, list);
    }
  }

  return { nodes: out, imagesByNode };
}

/** Duplicate NodeImage rows for a new node, reusing the same public file path. */
async function cloneNodeImagesForCopy(
  projectId: string,
  sourceNodeId: string,
  targetNodeId: string,
  imagesByNode: Map<string, NodeImageCopyRow[]>,
) {
  const sourceImages = imagesByNode.get(sourceNodeId);
  if (!sourceImages?.length) return;
  const nodeImage = (prisma as { nodeImage?: typeof prisma.nodeImage }).nodeImage;
  if (!nodeImage) return;

  await nodeImage.createMany({
    data: sourceImages.map((img) => ({
      projectId,
      nodeId: targetNodeId,
      url: img.url,
      filename: img.filename,
      mimeType: img.mimeType,
      sortOrder: img.sortOrder,
    })),
  });
}

/**
 * Deep-copy a node (+ descendants) under the same parent or an explicit paste target.
 * When clearContent is false, preserves note text, image content URLs, summaries,
 * and duplicates NodeImage rows pointing at the same public path.
 */
export async function copyNodeSubtreeAction(
  raw: unknown,
): Promise<
  | {
      ok: true;
      createdRoots: { id: string; name: string }[];
      message: string;
    }
  | { ok: false; error: string }
> {
  const parsed = copyNodeSubtreeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }

  const { projectId, sourceNodeId, names, clearContent, targetParentId } =
    parsed.data;
  const loaded = await loadSubtree(projectId, sourceNodeId);
  if (!loaded || loaded.nodes.length === 0) {
    return { ok: false, error: "Source node not found in this project" };
  }

  const { nodes: subtree, imagesByNode } = loaded;
  const root = subtree[0]!;
  const createdRoots: { id: string; name: string }[] = [];

  // Paste under an explicit parent when provided; otherwise keep source siblings.
  let pasteParentId: string | null = root.parentId;
  if (targetParentId !== undefined) {
    if (targetParentId === null) {
      pasteParentId = null;
    } else {
      const parentOk = await assertParentInProject(projectId, targetParentId);
      if (!parentOk) {
        return { ok: false, error: "Paste target parent not found in project" };
      }
      pasteParentId = targetParentId;
    }
  }

  // BFS from root so parents exist before children.
  const childrenOf = new Map<string, NodeCopyRow[]>();
  for (const row of subtree) {
    if (row.id === root.id) continue;
    if (!row.parentId) continue;
    const list = childrenOf.get(row.parentId) ?? [];
    list.push(row);
    childrenOf.set(row.parentId, list);
  }
  for (const [, list] of childrenOf) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }

  for (const newName of names) {
    const queue: { source: NodeCopyRow; parentId: string | null }[] = [
      { source: root, parentId: pasteParentId },
    ];

    while (queue.length) {
      const { source, parentId } = queue.shift()!;
      const isRoot = source.id === root.id;
      const result = await createNodeAction({
        projectId,
        parentId,
        name: isRoot ? newName : source.name,
        type: source.type,
        customTypeLabel: source.customTypeLabel,
        status: "IDEA",
        content: clearContent ? null : source.content,
        designFocusId: source.designFocusId,
      });
      if (!result.ok) {
        return {
          ok: false,
          error:
            createdRoots.length > 0
              ? `Created ${createdRoots.length} copy(ies), then failed: ${result.error}`
              : result.error ?? "Failed to copy node",
        };
      }

      if (!clearContent) {
        if (source.summary?.trim()) {
          await updateNodeAction({
            id: result.node.id,
            summary: source.summary,
          });
        }
        await cloneNodeImagesForCopy(
          projectId,
          source.id,
          result.node.id,
          imagesByNode,
        );
      }

      if (isRoot) {
        createdRoots.push({ id: result.node.id, name: result.node.name });
      }
      for (const child of childrenOf.get(source.id) ?? []) {
        queue.push({ source: child, parentId: result.node.id });
      }
    }
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/focus`);
  if (pasteParentId) {
    revalidatePath(`/projects/${projectId}/focus/${pasteParentId}`);
  }
  if (root.parentId && root.parentId !== pasteParentId) {
    revalidatePath(`/projects/${projectId}/focus/${root.parentId}`);
  }
  for (const r of createdRoots) {
    revalidatePath(`/projects/${projectId}/nodes/${r.id}`);
    revalidatePath(`/projects/${projectId}/focus/${r.id}`);
  }

  return {
    ok: true,
    createdRoots,
    message: clearContent
      ? `Copied profile into ${createdRoots.length} new node(s).`
      : `Copied ${createdRoots.length} node(s) with content.`,
  };
}

const cleanRecursiveProfileSlotsSchema = z.object({
  projectId: z.string().min(1),
  /** Character (or subtree root) to clean under — never the whole project silently. */
  nodeId: z.string().min(1),
  /** Must match the node name exactly (trim) — strong confirm. */
  confirmName: z.string().trim().min(1).max(160),
});

/**
 * Delete recursively nested duplicate profile-slot subtrees under a scoped node.
 * Only removes children of known slot folders that are themselves known slot names
 * (e.g. Appearance → Stats / Appearance → Appearance). Does not wipe the character
 * root or unique non-slot content.
 */
export async function cleanRecursiveProfileSlotsAction(
  raw: unknown,
): Promise<
  | { ok: true; deletedCount: number; message: string }
  | { ok: false; error: string }
> {
  const parsed = cleanRecursiveProfileSlotsSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid request",
    };
  }
  const { projectId, nodeId, confirmName } = parsed.data;

  const root = await prisma.node.findFirst({
    where: { id: nodeId, projectId },
    select: { id: true, name: true },
  });
  if (!root) return { ok: false, error: "Node not found" };
  if (root.name.trim() !== confirmName.trim()) {
    return {
      ok: false,
      error: `Type the exact name “${root.name}” to confirm cleanup`,
    };
  }

  const all = await prisma.node.findMany({
    where: { projectId },
    select: { id: true, parentId: true, name: true },
  });
  const byParent = new Map<string | null, typeof all>();
  for (const n of all) {
    const key = n.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }

  // Collect subtree under root (excluding root itself).
  const subtreeIds = new Set<string>();
  const stack = [root.id];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) ?? []) {
      if (subtreeIds.has(child.id)) continue;
      subtreeIds.add(child.id);
      stack.push(child.id);
    }
  }

  const byId = new Map(all.map((n) => [n.id, n]));
  const toDelete: string[] = [];
  for (const id of subtreeIds) {
    const node = byId.get(id);
    if (!node?.parentId) continue;
    if (!isKnownProfileSlotName(node.name)) continue;
    const parent = byId.get(node.parentId);
    if (!parent || !isKnownProfileSlotName(parent.name)) continue;
    // Only delete if parent is inside the scoped subtree or is the root scope.
    if (parent.id !== root.id && !subtreeIds.has(parent.id)) continue;
    toDelete.push(id);
  }

  // Delete deepest-first so cascade doesn't double-count; prisma cascade handles
  // descendants, so only delete top-most offending nodes among toDelete.
  const deleteSet = new Set(toDelete);
  const rootsToDelete = toDelete.filter((id) => {
    let cur = byId.get(id)?.parentId ?? null;
    while (cur) {
      if (deleteSet.has(cur)) return false;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return true;
  });

  if (rootsToDelete.length === 0) {
    return {
      ok: true,
      deletedCount: 0,
      message: `No nested duplicate profile slots found under “${root.name}”.`,
    };
  }

  // Count nodes that will be removed (roots + descendants still in subtree).
  let deletedCount = 0;
  for (const id of rootsToDelete) {
    const countStack = [id];
    const seen = new Set<string>();
    while (countStack.length) {
      const cur = countStack.pop()!;
      if (seen.has(cur)) continue;
      seen.add(cur);
      deletedCount += 1;
      for (const child of byParent.get(cur) ?? []) {
        countStack.push(child.id);
      }
    }
    await prisma.node.delete({ where: { id } });
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/focus`);
  revalidatePath(`/projects/${projectId}/focus/${nodeId}`);
  revalidatePath(`/projects/${projectId}/nodes/${nodeId}`);

  return {
    ok: true,
    deletedCount,
    message: `Removed ${deletedCount} nested duplicate profile-slot node(s) under “${root.name}”.`,
  };
}
