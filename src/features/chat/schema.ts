import { z } from "zod";
import { nameConflictsExisting } from "@/features/ai/element-suggestion-schema";
import { nodeStatusSchema, nodeTypeSchema } from "@/lib/validation";

/** Hard caps for chat payloads (protect API cost / request size). */
export const CHAT_MESSAGE_MAX_CHARS = 64_000;
export const GPT_TRANSCRIPT_MAX_CHARS = 100_000;
/** Max proposals the AI may return / creator may accept in one batch. */
export const CHAT_PROPOSAL_MAX = 50;
/** Tighter cap when the batch is character/NPC profile structure. */
export const CHAT_CHARACTER_PROPOSAL_MAX = 24;
/** Inline preview count in the chat drawer; overflow opens a modal. */
export const CHAT_PROPOSAL_INLINE = 4;
/** Max nodes listed in the chat structure subtree outline. */
export const CHAT_CONTEXT_SUBTREE_MAX = 60;
/** Max depth (from context root) for the subtree outline. */
export const CHAT_CONTEXT_SUBTREE_DEPTH = 6;
/** Max direct children loaded per parent while building the outline (BFS). */
export const CHAT_CONTEXT_CHILDREN_PER_PARENT = 24;

export const chatProposalCreateNodeSchema = z.object({
  kind: z.literal("create_node"),
  name: z.string().trim().min(1).max(160),
  type: nodeTypeSchema.default("IDEA"),
  content: z.string().trim().max(4000).optional(),
  /** Optional parent node id when known from context. */
  parentNodeId: z.string().min(1).optional().nullable(),
  /**
   * Name path from the current context root (or project root) to the
   * intended parent. Missing intermediate folders are created on Accept.
   * Example: ["Mechanics", "Resource Systems", "Crows"]
   */
  parentPath: z.array(z.string().trim().min(1).max(160)).max(12).optional(),
  /**
   * Id path to the intended parent (last id is the parent). Prefer when
   * ids are listed in the structure subtree context.
   */
  parentPathIds: z.array(z.string().min(1)).max(12).optional(),
  /** Stable temp key so later creates in this batch can nest under this node. */
  clientKey: z.string().trim().min(1).max(64).optional(),
  /** Nest under another create_node in this batch (by its clientKey). */
  parentClientKey: z.string().trim().min(1).max(64).optional(),
  /** Optional ordering hint within the same parent (lower first). */
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  reasoning: z.string().trim().max(400).optional(),
});

export const chatProposalUpdateNodeSchema = z.object({
  kind: z.literal("update_node"),
  nodeId: z.string().min(1),
  name: z.string().trim().min(1).max(160).optional(),
  type: nodeTypeSchema.optional(),
  content: z.string().trim().max(4000).optional().nullable(),
  status: nodeStatusSchema.optional(),
  reasoning: z.string().trim().max(400).optional(),
});

export const chatProposalCreateFocusSchema = z.object({
  kind: z.literal("create_focus"),
  name: z.string().trim().min(1).max(120),
  targetImportance: z.number().min(0).max(100).default(50),
  parentFocusId: z.string().min(1).optional().nullable(),
  description: z.string().trim().max(4000).optional(),
  reasoning: z.string().trim().max(400).optional(),
});

export const chatProposalSchema = z.discriminatedUnion("kind", [
  chatProposalCreateNodeSchema,
  chatProposalUpdateNodeSchema,
  chatProposalCreateFocusSchema,
]);

/** Stable key for deduping applied / dismissed proposals across turns. */
export function chatProposalFingerprint(
  proposal: z.infer<typeof chatProposalSchema>,
): string {
  if (proposal.kind === "create_node") {
    const parent =
      proposal.parentClientKey
        ? `client:${proposal.parentClientKey}`
        : proposal.parentNodeId
          ? `id:${proposal.parentNodeId}`
          : proposal.parentPathIds?.length
            ? `id:${proposal.parentPathIds[proposal.parentPathIds.length - 1]}`
            : proposal.parentPath?.length
              ? `path:${proposal.parentPath.map((n) => n.toLowerCase()).join("/")}`
              : "root";
    return `create:${parent}:${proposal.name.trim().toLowerCase()}`;
  }
  if (proposal.kind === "update_node") {
    const name = proposal.name?.trim().toLowerCase() ?? "";
    return `update:${proposal.nodeId}:${name}`;
  }
  return `focus:${proposal.name.trim().toLowerCase()}`;
}

/**
 * Drop proposals that match fingerprints from earlier Accept / Dismiss actions.
 */
export function filterAlreadyHandledProposals(
  proposals: z.infer<typeof chatProposalSchema>[],
  handledFingerprints: Iterable<string>,
): {
  proposals: z.infer<typeof chatProposalSchema>[];
  removedCount: number;
} {
  const blocked = new Set(
    [...handledFingerprints].map((f) => f.trim().toLowerCase()).filter(Boolean),
  );
  if (!blocked.size) return { proposals, removedCount: 0 };
  const kept: z.infer<typeof chatProposalSchema>[] = [];
  let removedCount = 0;
  for (const p of proposals) {
    const fp = chatProposalFingerprint(p).toLowerCase();
    if (blocked.has(fp)) {
      removedCount += 1;
      continue;
    }
    // Also block create_node by bare name if any applied create used that name
    // under any parent (covers parent-key mismatch across turns).
    if (p.kind === "create_node") {
      const bare = `create-name:${p.name.trim().toLowerCase()}`;
      if (blocked.has(bare)) {
        removedCount += 1;
        continue;
      }
    }
    kept.push(p);
  }
  return { proposals: kept, removedCount };
}

/** Fingerprints + bare create names to persist after Accept. */
export function fingerprintsForAppliedProposals(
  proposals: z.infer<typeof chatProposalSchema>[],
): string[] {
  const out = new Set<string>();
  for (const p of proposals) {
    out.add(chatProposalFingerprint(p));
    if (p.kind === "create_node") {
      out.add(`create-name:${p.name.trim().toLowerCase()}`);
    }
  }
  return [...out];
}
export const chatAiResponseSchema = z.object({
  reply: z.string().trim().min(1).max(12000),
  proposals: z.array(chatProposalSchema).max(CHAT_PROPOSAL_MAX).default([]),
});

export const sendChatMessageSchema = z.object({
  projectId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS),
  /** Structure Focus Space container id (null/omit = project root). */
  contextNodeId: z.string().min(1).optional().nullable(),
  /** Optional Structure focus summary from the client (selective). */
  focusSummary: z.string().trim().max(2000).optional().nullable(),
  /** UI locale so new AI replies match the interface language. */
  locale: z.enum(["en", "nl"]).optional(),
});

export const attachGptConversationSchema = z.object({
  projectId: z.string().min(1),
  threadId: z.string().min(1).optional(),
  contextNodeId: z.string().min(1).optional().nullable(),
  url: z.string().trim().max(2000).optional().nullable(),
  /** Pasted transcript / export text when share fetch is unavailable. */
  transcript: z.string().trim().max(GPT_TRANSCRIPT_MAX_CHARS).optional().nullable(),
});

export const applyChatProposalsSchema = z.object({
  projectId: z.string().min(1),
  messageId: z.string().min(1),
  proposals: z.array(chatProposalSchema).min(1).max(CHAT_PROPOSAL_MAX),
});

export const dismissChatProposalsSchema = z.object({
  projectId: z.string().min(1),
  messageId: z.string().min(1),
});

export const getOrCreateChatThreadSchema = z.object({
  projectId: z.string().min(1),
  /** Structure container; null/omit = project-root thread. */
  contextNodeId: z.string().min(1).optional().nullable(),
});

export const copyNodeSubtreeSchema = z.object({
  projectId: z.string().min(1),
  sourceNodeId: z.string().min(1),
  /** New sibling names under the same parent as the source (or targetParentId). */
  names: z.array(z.string().trim().min(1).max(160)).min(1).max(20),
  /**
   * When true, clear text content on copies (skeleton / Copy profile).
   * When false (context-menu paste), keep notes, image URLs, summaries, and NodeImage rows.
   */
  clearContent: z.boolean().default(true),
  /**
   * Optional paste target. When set, roots are created under this parent
   * (null = project root) instead of the source node's parent.
   */
  targetParentId: z.string().min(1).optional().nullable(),
});

export type ChatProposal = z.infer<typeof chatProposalSchema>;
export type ChatProposalCreateNode = Extract<
  ChatProposal,
  { kind: "create_node" }
>;
export type ChatAiResponse = z.infer<typeof chatAiResponseSchema>;

const ALLOWED_TYPES = new Set(nodeTypeSchema.options);
const ALLOWED_STATUSES = new Set(nodeStatusSchema.options);

function cleanOptionalString(value: string | null | undefined): string | undefined {
  const t = value?.trim();
  return t ? t : undefined;
}

function cleanStringArray(values: string[] | undefined): string[] | undefined {
  if (!values?.length) return undefined;
  const cleaned = values.map((v) => v.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

const KIND_ALIASES: Record<string, ChatProposal["kind"]> = {
  create_node: "create_node",
  createNode: "create_node",
  create: "create_node",
  CREATE_NODE: "create_node",
  node: "create_node",
  update_node: "update_node",
  updateNode: "update_node",
  update: "update_node",
  UPDATE_NODE: "update_node",
  create_focus: "create_focus",
  createFocus: "create_focus",
  focus: "create_focus",
  CREATE_FOCUS: "create_focus",
};

function coerceNodeType(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (ALLOWED_TYPES.has(upper as z.infer<typeof nodeTypeSchema>)) {
    return upper;
  }
  return undefined;
}

/**
 * Best-effort reshape of a single model proposal before Zod.
 * Keeps legitimate structure suggestions even when the model uses
 * aliases / wrong casing (which used to wipe the entire proposals array).
 */
export function coerceChatProposalRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const obj = { ...(raw as Record<string, unknown>) };

  if (typeof obj.kind !== "string" && typeof obj.action === "string") {
    obj.kind = obj.action;
  }
  if (typeof obj.kind === "string") {
    const mapped = KIND_ALIASES[obj.kind] ?? KIND_ALIASES[obj.kind.trim()];
    if (mapped) obj.kind = mapped;
    else if (obj.kind !== obj.kind.toLowerCase()) {
      const lower = KIND_ALIASES[obj.kind.toLowerCase()];
      if (lower) obj.kind = lower;
    }
  }

  if (typeof obj.name !== "string" && typeof obj.title === "string") {
    obj.name = obj.title;
  }

  if (obj.type !== undefined) {
    const coerced = coerceNodeType(obj.type);
    if (coerced) obj.type = coerced;
    else delete obj.type; // let schema default to IDEA instead of failing the item
  }

  if (obj.status !== undefined && typeof obj.status === "string") {
    const status = obj.status.trim().toUpperCase().replace(/[\s-]+/g, "_");
    if (ALLOWED_STATUSES.has(status as z.infer<typeof nodeStatusSchema>)) {
      obj.status = status;
    }
  }

  return obj;
}

function extractReplyText(incoming: unknown): string | null {
  if (!incoming || typeof incoming !== "object") return null;
  const obj = incoming as Record<string, unknown>;
  if (typeof obj.reply === "string" && obj.reply.trim()) {
    return obj.reply.trim().slice(0, 12000);
  }
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message.trim().slice(0, 12000);
  }
  return null;
}

function extractRawProposalList(incoming: unknown): unknown[] {
  if (!incoming || typeof incoming !== "object") return [];
  const obj = incoming as Record<string, unknown>;
  if (Array.isArray(obj.proposals)) return obj.proposals;
  if (Array.isArray(obj.actions)) return obj.actions;
  if (Array.isArray(obj.suggestions)) return obj.suggestions;
  if (Array.isArray(obj.items)) return obj.items;
  return [];
}

function finalizeProposal(p: ChatProposal): ChatProposal | null {
  if (p.kind === "create_node") {
    const type = ALLOWED_TYPES.has(p.type) ? p.type : "IDEA";
    return {
      ...p,
      type,
      name: p.name.trim(),
      content: cleanOptionalString(p.content),
      reasoning: cleanOptionalString(p.reasoning),
      parentNodeId:
        cleanOptionalString(p.parentNodeId ?? undefined) ?? undefined,
      parentPath: cleanStringArray(p.parentPath),
      parentPathIds: cleanStringArray(p.parentPathIds),
      clientKey: cleanOptionalString(p.clientKey),
      parentClientKey: cleanOptionalString(p.parentClientKey),
      sortOrder: p.sortOrder,
    };
  }
  if (p.kind === "update_node") {
    const type = p.type && ALLOWED_TYPES.has(p.type) ? p.type : undefined;
    const status =
      p.status && ALLOWED_STATUSES.has(p.status) ? p.status : undefined;
    if (
      !p.name?.trim() &&
      type === undefined &&
      p.content === undefined &&
      status === undefined
    ) {
      return null;
    }
    return {
      kind: "update_node",
      nodeId: p.nodeId,
      name: p.name?.trim() || undefined,
      type,
      content: p.content === null ? null : p.content?.trim() || undefined,
      status,
      reasoning: p.reasoning?.trim() || undefined,
    };
  }
  return {
    ...p,
    name: p.name.trim(),
    description: p.description?.trim() || undefined,
    reasoning: p.reasoning?.trim() || undefined,
    parentFocusId: p.parentFocusId || undefined,
  };
}

export type NormalizeChatAiResult = ChatAiResponse & {
  /** Raw proposal objects that failed per-item Zod after coercion. */
  droppedInvalidCount: number;
  /** Raw proposals beyond CHAT_PROPOSAL_MAX (not validated). */
  truncatedCount: number;
};

/**
 * Normalize AI chat JSON into reply + validated proposals.
 * Salvages each proposal individually — one bad item must never wipe the batch
 * (previously safeParse on the whole object dropped every proposal while
 * keeping teaser reply text like "Hier zijn enkele voorstellen:").
 */
export function normalizeChatAiResponse(
  raw: unknown,
): NormalizeChatAiResult | null {
  let incoming = raw;
  if (typeof raw === "string") {
    try {
      incoming = JSON.parse(raw) as unknown;
    } catch {
      return {
        reply: raw.trim().slice(0, 12000) || "Empty reply.",
        proposals: [],
        droppedInvalidCount: 0,
        truncatedCount: 0,
      };
    }
  }

  const reply =
    extractReplyText(incoming) ??
    (typeof incoming === "string" ? incoming.trim().slice(0, 12000) : null);
  if (!reply) return null;

  const rawList = extractRawProposalList(incoming);
  const truncatedCount = Math.max(0, rawList.length - CHAT_PROPOSAL_MAX);
  const capped = rawList.slice(0, CHAT_PROPOSAL_MAX);

  const proposals: ChatProposal[] = [];
  let droppedInvalidCount = 0;

  for (const item of capped) {
    const coerced = coerceChatProposalRaw(item);
    const parsed = chatProposalSchema.safeParse(coerced);
    if (!parsed.success) {
      droppedInvalidCount += 1;
      continue;
    }
    const finalized = finalizeProposal(parsed.data);
    if (!finalized) {
      droppedInvalidCount += 1;
      continue;
    }
    proposals.push(finalized);
  }

  return {
    reply,
    proposals,
    droppedInvalidCount,
    truncatedCount,
  };
}

/** Reply text that claims proposals follow, but the proposals array is empty. */
export function replyPromisesStructuredProposals(reply: string): boolean {
  const t = reply.trim();
  if (!t) return false;
  // Trailing colon / Dutch+EN teasers that imply a following list/UI.
  if (/:\s*$/.test(t) && /\b(voorstellen|proposals?|suggestions?|suggesties)\b/i.test(t)) {
    return true;
  }
  return (
    /\b(hier zijn|here (are|is)|following are|below are)\b.{0,80}\b(voorstellen|proposals?|suggestions?|suggesties)\b/i.test(
      t,
    ) ||
    /\b(voorstellen|proposals?|suggestions?)\b.{0,40}:\s*$/i.test(t)
  );
}

/** Parent key for sibling maps: node id, or "" for project root. */
export function chatParentKey(parentId: string | null | undefined): string {
  return parentId?.trim() || "";
}

/**
 * Stable key for the intended parent of a create_node (for sibling dedupe).
 * Uses client keys / paths when the real parent id is not known yet.
 */
export function intendedCreateParentKey(
  proposal: ChatProposalCreateNode,
  defaultParentId: string | null,
  resolvedParentId?: string | null,
): string {
  if (resolvedParentId !== undefined) {
    return chatParentKey(resolvedParentId);
  }
  if (proposal.parentClientKey) {
    return `client:${proposal.parentClientKey}`;
  }
  if (proposal.parentNodeId) {
    return chatParentKey(proposal.parentNodeId);
  }
  if (proposal.parentPathIds?.length) {
    return chatParentKey(proposal.parentPathIds[proposal.parentPathIds.length - 1]);
  }
  if (proposal.parentPath?.length) {
    return `path:${proposal.parentPath.map((n) => n.toLowerCase()).join("\0")}`;
  }
  return chatParentKey(defaultParentId);
}

/**
 * Drop create_node proposals that duplicate / near-duplicate an existing sibling
 * under the intended parent (same rules as structure suggest).
 * Also dedupes within the batch per parent.
 */
export function filterDuplicateCreateNodeProposals(
  proposals: ChatProposal[],
  opts: {
    defaultParentId: string | null;
    existingByParent: Map<string, string[]>;
    /** Optional pre-resolved parent ids keyed by proposal index (or clientKey). */
    resolvedParentByIndex?: Map<number, string | null>;
  },
): { proposals: ChatProposal[]; removedCount: number } {
  const acceptedByParent = new Map<string, string[]>();
  const kept: ChatProposal[] = [];
  let removedCount = 0;

  proposals.forEach((p, index) => {
    if (p.kind !== "create_node") {
      kept.push(p);
      return;
    }
    const resolved = opts.resolvedParentByIndex?.get(index);
    const parentKey = intendedCreateParentKey(
      p,
      opts.defaultParentId,
      resolved,
    );
    const existing = [
      ...(opts.existingByParent.get(parentKey) ?? []),
      ...(acceptedByParent.get(parentKey) ?? []),
    ];
    if (nameConflictsExisting(p.name, existing)) {
      removedCount += 1;
      return;
    }
    const list = acceptedByParent.get(parentKey) ?? [];
    list.push(p.name);
    acceptedByParent.set(parentKey, list);
    kept.push(p);
  });

  return { proposals: kept, removedCount };
}

/**
 * Order proposals so batch nesting works: creates with parentClientKey come
 * after their parent create; optional sortOrder breaks ties.
 */
export function sortChatProposalsForApply(
  proposals: ChatProposal[],
): ChatProposal[] {
  const creates = proposals.filter(
    (p): p is ChatProposalCreateNode => p.kind === "create_node",
  );
  const others = proposals.filter((p) => p.kind !== "create_node");

  if (creates.length <= 1) {
    return [...creates, ...others];
  }

  const byKey = new Map<string, ChatProposalCreateNode>();
  for (const c of creates) {
    if (c.clientKey) byKey.set(c.clientKey, c);
  }

  const depthMemo = new Map<ChatProposalCreateNode, number>();
  const visiting = new Set<ChatProposalCreateNode>();

  function depthOf(c: ChatProposalCreateNode): number {
    const cached = depthMemo.get(c);
    if (cached !== undefined) return cached;
    if (!c.parentClientKey || !byKey.has(c.parentClientKey)) {
      depthMemo.set(c, 0);
      return 0;
    }
    if (visiting.has(c)) {
      depthMemo.set(c, 0);
      return 0;
    }
    visiting.add(c);
    const parent = byKey.get(c.parentClientKey)!;
    const d = depthOf(parent) + 1;
    visiting.delete(c);
    depthMemo.set(c, d);
    return d;
  }

  const sortedCreates = [...creates].sort((a, b) => {
    const da = depthOf(a);
    const db = depthOf(b);
    if (da !== db) return da - db;
    const sa = a.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const sb = b.sortOrder ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return creates.indexOf(a) - creates.indexOf(b);
  });

  // Keep non-creates after creates so nested structure lands first, then updates.
  return [...sortedCreates, ...others];
}

/** Human-readable parent path label for Accept UI. */
export function formatCreateParentLabel(
  proposal: ChatProposalCreateNode,
): string | null {
  if (proposal.parentPath?.length) {
    return proposal.parentPath.join(" → ");
  }
  if (proposal.parentClientKey) {
    return `under draft “${proposal.parentClientKey}”`;
  }
  if (proposal.parentPathIds?.length) {
    const last = proposal.parentPathIds[proposal.parentPathIds.length - 1]!;
    return `parent id ${last.slice(0, 8)}…`;
  }
  if (proposal.parentNodeId) {
    return `parent id ${proposal.parentNodeId.slice(0, 8)}…`;
  }
  return null;
}

/** Nesting depth hint for Accept UI indentation (clientKey trees). */
export function createProposalDepth(
  proposal: ChatProposalCreateNode,
  all: ChatProposal[],
): number {
  if (proposal.parentPath?.length) return proposal.parentPath.length;
  if (!proposal.parentClientKey) return 0;
  const byKey = new Map<string, ChatProposalCreateNode>();
  for (const p of all) {
    if (p.kind === "create_node" && p.clientKey) {
      byKey.set(p.clientKey, p);
    }
  }
  let depth = 0;
  let key: string | undefined = proposal.parentClientKey;
  const seen = new Set<string>();
  while (key && byKey.has(key) && !seen.has(key)) {
    seen.add(key);
    depth += 1;
    key = byKey.get(key)?.parentClientKey;
  }
  return depth;
}

export const CHAT_ALL_DUPLICATES_FILTERED_MESSAGE =
  "All suggested structure items already exist under this folder (or are near-duplicates of existing children). Nothing new to accept — open an existing child or suggest a different name.";

/** Soft-fail copy when filters remove every proposal (duplicates and/or nested slots). */
export const CHAT_ALL_PROPOSALS_FILTERED_MESSAGE =
  "Suggested structure items were filtered out (duplicates or invalid nested profile slots). Nothing new to accept — try a more specific request or different names.";

/** Soft-fail when the model teases proposals in reply text but the proposals array is empty. */
export const CHAT_EMPTY_PROPOSALS_TEASER_MESSAGE =
  "No actionable proposals were returned (structured suggestions missing or invalid). Ask again to propose specific create/update items — Accept/Reject cards only appear when the proposals array has valid entries.";
