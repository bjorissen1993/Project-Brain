"use client";

import { usePathname } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { Link2, Loader2, MessageSquare, Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { useOptionalFocusWorkspace } from "@/features/focus-space";
import { NODE_TYPE_OPTIONS } from "@/types";
import { cn } from "@/lib/utils";
import {
  applyChatProposalsAction,
  attachGptConversationAction,
  clearGptAttachmentAction,
  getOrCreateChatThreadAction,
  sendChatMessageAction,
  type ChatMessageDTO,
  type ChatThreadDTO,
} from "./actions";
import { useChatPanel } from "./chat-panel-context";
import { CopyProfileDialog } from "./copy-profile-dialog";
import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_PROPOSAL_INLINE,
  createProposalDepth,
  formatCreateParentLabel,
  GPT_TRANSCRIPT_MAX_CHARS,
  type ChatProposal,
} from "./schema";
import {
  SuggestionsModal,
  type SuggestionRow,
} from "./suggestions-modal";

/** Slightly above server OpenAI 90s so Thinking clears even if the action stalls. */
const CLIENT_SEND_TIMEOUT_MS = 100_000;

const SEND_NO_ASSISTANT_ERROR =
  "No AI reply was returned. Your message was saved — try again, or check the server logs.";

function formatCharCount(n: number): string {
  return n.toLocaleString("en-US");
}

function isOptimisticMessage(message: ChatMessageDTO): boolean {
  return (
    message.id.startsWith("optimistic-") ||
    (Boolean(message.metadata) &&
      typeof message.metadata === "object" &&
      (message.metadata as { optimistic?: boolean }).optimistic === true)
  );
}

function makeOptimisticUserMessage(content: string): ChatMessageDTO {
  return {
    id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    content,
    proposals: null,
    metadata: { optimistic: true },
    createdAt: new Date().toISOString(),
  };
}

/** True when the thread includes a real assistant/system reply after the sent user text. */
function threadHasReplyAfterUser(
  thread: ChatThreadDTO,
  userContent: string,
): boolean {
  const messages = thread.messages;
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (
      m.role === "user" &&
      m.content === userContent &&
      !isOptimisticMessage(m)
    ) {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return false;
  return messages
    .slice(lastUserIdx + 1)
    .some(
      (m) =>
        (m.role === "assistant" || m.role === "system") &&
        m.content.trim().length > 0 &&
        !isOptimisticMessage(m),
    );
}

function placeholderThread(
  projectId: string,
  contextNodeId: string | null,
  contextNodeName: string | null,
  message: ChatMessageDTO,
): ChatThreadDTO {
  return {
    id: "",
    projectId,
    contextNodeId,
    contextNodeName,
    title: null,
    attachedGptText: null,
    attachedGptUrl: null,
    attachedGptSource: null,
    messages: [message],
    aiAvailable: true,
  };
}

/** Keep in-flight optimistic user bubbles when a background load finishes. */
function mergeThreadPreservingOptimistic(
  incoming: ChatThreadDTO,
  previous: ChatThreadDTO | null,
): ChatThreadDTO {
  if (!previous) return incoming;
  const optimistic = previous.messages.filter(isOptimisticMessage);
  if (!optimistic.length) return incoming;

  const serverHasContent = (content: string) =>
    incoming.messages.some(
      (m) => m.role === "user" && m.content === content && !isOptimisticMessage(m),
    );

  const stillPending = optimistic.filter((m) => !serverHasContent(m.content));
  if (!stillPending.length) return incoming;
  return {
    ...incoming,
    messages: [...incoming.messages, ...stillPending],
  };
}

function withClientTimeout<T>(
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

function typeLabel(type: string) {
  return NODE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

function resolveContextNodeId(
  pathname: string,
  workspace: ReturnType<typeof useOptionalFocusWorkspace>,
): string | null {
  if (!workspace) return null;
  const structureMatch = pathname.match(/\/focus\/([^/]+)/);
  const id = structureMatch?.[1] ?? null;
  if (!id) return null;
  return workspace.nodes.some((n) => n.id === id) ? id : null;
}

function buildFocusSummary(
  pathname: string,
  workspace: ReturnType<typeof useOptionalFocusWorkspace>,
): string | null {
  if (!workspace) return null;
  const structureMatch = pathname.match(/\/focus\/([^/]+)/);
  const designMatch = pathname.match(/\/design-focus\/([^/]+)/);
  const id = structureMatch?.[1] ?? designMatch?.[1] ?? null;
  if (!id) {
    const roots = workspace.nodes.filter((n) => !n.parentId).slice(0, 6);
    if (!roots.length) return null;
    return `Viewing Structure root. Top areas: ${roots.map((n) => n.name).join(", ")}.`;
  }

  if (structureMatch) {
    const node = workspace.nodes.find((n) => n.id === id);
    if (!node) return null;
    const level = workspace.structureLevelFor(id);
    const childNames = level.slices.map((c) => c.name).slice(0, 12);
    const contentPreview = node.content?.trim().slice(0, 400);
    // Shallow descendant outline for client summary (server sends fuller subtree).
    const byParent = new Map<string | null, typeof workspace.nodes>();
    for (const n of workspace.nodes) {
      const key = n.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push(n);
      byParent.set(key, list);
    }
    const deepLines: string[] = [];
    const walk = (parentId: string, depth: number) => {
      if (depth > 3 || deepLines.length >= 40) return;
      for (const child of byParent.get(parentId) ?? []) {
        if (deepLines.length >= 40) break;
        deepLines.push(
          `${"  ".repeat(depth)}- [${child.id}] ${child.name} (${child.type})`,
        );
        walk(child.id, depth + 1);
      }
    };
    walk(id, 0);
    return [
      `Structure focus: [${node.id}] ${node.name} (${node.type}, ${node.status})`,
      contentPreview ? `content: ${contentPreview}` : null,
      childNames.length
        ? `children (${level.slices.length}): ${childNames.join(", ")}`
        : "children: (none)",
      deepLines.length
        ? `subtree outline:\n${deepLines.join("\n")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const focus = workspace.focuses.find((f) => f.id === id);
  if (!focus) return null;
  return `Design Focus: [${focus.id}] ${focus.name} (target=${focus.targetImportance})`;
}

function nodePathLabel(
  nodeId: string | null | undefined,
  workspace: ReturnType<typeof useOptionalFocusWorkspace>,
): string | null {
  if (!nodeId || !workspace) return null;
  const byId = new Map(workspace.nodes.map((n) => [n.id, n]));
  const parts: string[] = [];
  let cur = byId.get(nodeId);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return parts.length ? parts.join(" → ") : null;
}

function ProposalCard({
  proposal,
  selected,
  onToggle,
  onReject,
  depth = 0,
  pathLabel,
  allProposals,
}: {
  proposal: ChatProposal;
  selected: boolean;
  onToggle: () => void;
  onReject: () => void;
  depth?: number;
  pathLabel?: string | null;
  allProposals?: ChatProposal[];
}) {
  const workspace = useOptionalFocusWorkspace();
  const title =
    proposal.kind === "update_node"
      ? proposal.name?.trim() ||
        nodePathLabel(proposal.nodeId, workspace) ||
        `Update ${proposal.nodeId.slice(0, 8)}…`
      : proposal.name;
  const kindLabel =
    proposal.kind === "create_node"
      ? typeLabel(proposal.type)
      : proposal.kind === "update_node"
        ? "Update"
        : "Design Focus";
  const body =
    proposal.kind === "create_node"
      ? proposal.content
      : proposal.kind === "create_focus"
        ? proposal.description
        : proposal.content ?? null;

  let hierarchyLabel = pathLabel ?? null;
  if (!hierarchyLabel && proposal.kind === "create_node") {
    hierarchyLabel =
      formatCreateParentLabel(proposal) ||
      nodePathLabel(proposal.parentNodeId, workspace);
  }
  if (!hierarchyLabel && proposal.kind === "update_node") {
    hierarchyLabel = nodePathLabel(proposal.nodeId, workspace);
  }
  const nestDepth =
    proposal.kind === "create_node" && allProposals
      ? Math.max(depth, createProposalDepth(proposal, allProposals))
      : depth;

  return (
    <li
      className="rounded-[var(--radius)] border border-border bg-panel px-2.5 py-2"
      style={nestDepth > 0 ? { marginLeft: Math.min(nestDepth, 6) * 12 } : undefined}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${title}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {title}
            <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-muted">
              {kindLabel}
            </span>
          </p>
          {hierarchyLabel ? (
            <p className="mt-0.5 text-[11px] text-muted">
              {proposal.kind === "update_node" ? "Target: " : "Under: "}
              {hierarchyLabel}
            </p>
          ) : null}
          {body ? (
            <p className="mt-1 text-xs text-muted line-clamp-3">{body}</p>
          ) : null}
          {proposal.reasoning ? (
            <p className="mt-1 text-[11px] text-muted">{proposal.reasoning}</p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="shrink-0 px-2 py-1 text-xs"
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
    </li>
  );
}

function toChatProposal(row: SuggestionRow): ChatProposal {
  if (row.kind === "create_node") {
    return {
      kind: "create_node",
      name: row.name,
      type: row.type,
      content: row.content,
      parentNodeId: row.parentNodeId,
      parentPath: row.parentPath,
      parentPathIds: row.parentPathIds,
      clientKey: row.clientKey,
      parentClientKey: row.parentClientKey,
      sortOrder: row.sortOrder,
      reasoning: row.reasoning,
    };
  }
  if (row.kind === "update_node") {
    return {
      kind: "update_node",
      nodeId: row.nodeId,
      name: row.name,
      type: row.type,
      content: row.content,
      status: row.status,
      reasoning: row.reasoning,
    };
  }
  return {
    kind: "create_focus",
    name: row.name,
    targetImportance: row.targetImportance,
    parentFocusId: row.parentFocusId,
    description: row.description,
    reasoning: row.reasoning,
  };
}

function MessageBubble({
  message,
  projectId,
  onThreadUpdate,
}: {
  message: ChatMessageDTO;
  projectId: string;
  onThreadUpdate: (thread: ChatThreadDTO) => void;
}) {
  const proposals = message.proposals;
  const meta =
    message.metadata && typeof message.metadata === "object"
      ? (message.metadata as {
          appliedAt?: string;
          copyProfileSourceIds?: string[];
          created?: { id: string; name: string }[];
        })
      : null;
  const applied = Boolean(meta?.appliedAt);
  const copyTargets = (meta?.copyProfileSourceIds ?? []).map((id) => ({
    id,
    name: meta?.created?.find((c) => c.id === id)?.name ?? "profile",
  }));

  const [rows, setRows] = useState<SuggestionRow[]>(() =>
    (proposals ?? []).map((p, i) => ({
      ...p,
      key: `${message.id}-${i}`,
      selected: true,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (message.role === "system") {
    return (
      <div className="space-y-2">
        <div className="rounded-[var(--radius)] border border-border bg-muted-bg/60 px-3 py-2 text-xs text-muted">
          {message.content}
        </div>
        {copyTargets.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {copyTargets.map((target) => (
              <Button
                key={target.id}
                type="button"
                variant="secondary"
                className="text-xs"
                onClick={() => setCopySource(target)}
              >
                Copy profile: {target.name}
              </Button>
            ))}
            {copySource ? (
              <CopyProfileDialog
                open
                projectId={projectId}
                sourceNodeId={copySource.id}
                sourceName={copySource.name}
                onClose={() => setCopySource(null)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  const isUser = message.role === "user";
  const overflow = Math.max(0, rows.length - CHAT_PROPOSAL_INLINE);
  const inlineRows = rows.slice(0, CHAT_PROPOSAL_INLINE);

  const applySelected = (selected: SuggestionRow[]) => {
    setError(null);
    startTransition(async () => {
      const result = await applyChatProposalsAction({
        projectId,
        messageId: message.id,
        proposals: selected.map(toChatProposal),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setModalOpen(false);
      onThreadUpdate(result.thread);
    });
  };

  return (
    <div
      className={cn(
        "max-w-[95%] space-y-2 rounded-[var(--radius)] px-3 py-2.5 text-sm",
        isUser
          ? "ml-auto bg-nav/20 text-foreground"
          : "mr-auto border border-border bg-panel-elevated text-foreground",
      )}
    >
      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>

      {!isUser && (proposals?.length ?? 0) > 0 && rows.length > 0 ? (
        <div className="mt-2 space-y-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Suggested actions — accept to apply
            </p>
            <p className="text-[11px] text-muted">
              {rows.length} suggestion{rows.length === 1 ? "" : "s"} total
            </p>
          </div>
          {applied ? (
            <p className="text-xs text-accent">Already applied.</p>
          ) : (
            <>
              <ul className="space-y-2">
                {inlineRows.map((row) => (
                  <ProposalCard
                    key={row.key}
                    proposal={row}
                    selected={row.selected}
                    allProposals={rows}
                    onToggle={() =>
                      setRows((prev) =>
                        prev.map((r) =>
                          r.key === row.key
                            ? { ...r, selected: !r.selected }
                            : r,
                        ),
                      )
                    }
                    onReject={() =>
                      setRows((prev) => prev.filter((r) => r.key !== row.key))
                    }
                  />
                ))}
              </ul>
              {overflow > 0 ? (
                <button
                  type="button"
                  className="text-xs font-medium text-nav hover:text-nav-hover"
                  onClick={() => setModalOpen(true)}
                >
                  +{overflow} more — view all {rows.length} suggestions
                </button>
              ) : null}
              <FieldError>{error}</FieldError>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  className="text-xs"
                  disabled={pending || !rows.some((r) => r.selected)}
                  onClick={() => applySelected(rows.filter((r) => r.selected))}
                >
                  {pending ? "Applying…" : "Accept selected"}
                </Button>
                {rows.length > CHAT_PROPOSAL_INLINE ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="text-xs"
                    disabled={pending}
                    onClick={() => setModalOpen(true)}
                  >
                    Open all
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  disabled={pending}
                  onClick={() => setRows([])}
                >
                  Dismiss
                </Button>
              </div>
              <SuggestionsModal
                open={modalOpen}
                title="All suggested actions"
                subtitle="Multi-select what to apply. Nothing changes until you accept."
                rows={rows}
                error={error}
                pending={pending}
                onClose={() => setModalOpen(false)}
                onToggle={(key) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.key === key ? { ...r, selected: !r.selected } : r,
                    ),
                  )
                }
                onReject={(key) =>
                  setRows((prev) => prev.filter((r) => r.key !== key))
                }
                onSelectAll={() =>
                  setRows((prev) => prev.map((r) => ({ ...r, selected: true })))
                }
                onClearSelection={() =>
                  setRows((prev) =>
                    prev.map((r) => ({ ...r, selected: false })),
                  )
                }
                onAccept={() => applySelected(rows.filter((r) => r.selected))}
                onDismissAll={() => {
                  setRows([]);
                  setModalOpen(false);
                }}
              />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ChatDrawer({ projectId }: { projectId: string }) {
  const { open, setOpen } = useChatPanel();
  const workspace = useOptionalFocusWorkspace();
  const pathname = usePathname() ?? "";
  const contextNodeId = useMemo(
    () => resolveContextNodeId(pathname, workspace),
    [pathname, workspace],
  );
  const [thread, setThread] = useState<ChatThreadDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [attachInfo, setAttachInfo] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [gptUrl, setGptUrl] = useState("");
  const [gptTranscript, setGptTranscript] = useState("");
  const [showAttach, setShowAttach] = useState(false);
  const [loading, startLoad] = useTransition();
  const [sending, startSend] = useTransition();
  const [attaching, startAttach] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendGenerationRef = useRef(0);
  const threadRef = useRef<ChatThreadDTO | null>(null);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    startLoad(async () => {
      try {
        const result = await getOrCreateChatThreadAction({
          projectId,
          contextNodeId,
        });
        if (cancelled) return;
        if (!result.ok) {
          setLoadError(result.error);
          return;
        }
        setLoadError(null);
        setThread((prev) =>
          mergeThreadPreservingOptimistic(result.thread, prev),
        );
        if (result.thread.attachedGptUrl) {
          setGptUrl(result.thread.attachedGptUrl);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("[chat] failed to load thread", error);
        setLoadError("Chat is temporarily unavailable");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, contextNodeId]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [open, thread?.messages.length, sending, sendError]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  const reloadThreadQuietly = async () => {
    try {
      const result = await getOrCreateChatThreadAction({
        projectId,
        contextNodeId,
      });
      if (!result.ok) return;
      setThread((prev) => mergeThreadPreservingOptimistic(result.thread, prev));
      if (result.thread.attachedGptUrl) {
        setGptUrl(result.thread.attachedGptUrl);
      }
    } catch (error) {
      console.error("[chat] reload after send failed", error);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setSendError(null);
    setInput("");

    const optimistic = makeOptimisticUserMessage(text);
    const contextName =
      thread?.contextNodeName ??
      (contextNodeId
        ? workspace?.nodes.find((n) => n.id === contextNodeId)?.name ?? null
        : null);

    setThread((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, optimistic] }
        : placeholderThread(projectId, contextNodeId, contextName, optimistic),
    );

    const generation = ++sendGenerationRef.current;
    const threadIdAtSend = threadRef.current?.id || undefined;

    const applySuccessfulThread = (next: ChatThreadDTO): boolean => {
      if (!threadHasReplyAfterUser(next, text)) {
        console.error(
          "[chat] ok:true but thread has no assistant reply after user message",
        );
        setThread(next);
        setSendError(SEND_NO_ASSISTANT_ERROR);
        return false;
      }
      setThread(next);
      setSendError(null);
      return true;
    };

    startSend(async () => {
      const focusSummary = buildFocusSummary(pathname, workspace);
      const actionPromise = sendChatMessageAction({
        projectId,
        threadId: threadIdAtSend,
        message: text,
        contextNodeId,
        focusSummary,
      });

      // Keep applying a late success even after the client timeout cleared Thinking.
      void actionPromise
        .then((late) => {
          if (generation !== sendGenerationRef.current) return;
          if (late.ok) {
            applySuccessfulThread(late.thread);
          } else if (late.error) {
            setSendError(late.error);
          }
        })
        .catch(() => {
          /* surfaced by the timed race below */
        });

      try {
        const result = await withClientTimeout(
          actionPromise,
          CLIENT_SEND_TIMEOUT_MS,
          "Chat reply",
        );
        if (generation !== sendGenerationRef.current) return;
        if (!result.ok) {
          setSendError(result.error);
          // User message may already be persisted — reload; keep optimistic if not.
          await reloadThreadQuietly();
          return;
        }
        if (!applySuccessfulThread(result.thread)) {
          await reloadThreadQuietly();
        }
      } catch (error) {
        if (generation !== sendGenerationRef.current) return;
        console.error("[chat] send failed", error);
        const message =
          error instanceof Error
            ? error.message
            : "Chat is temporarily unavailable";
        setSendError(
          /timed out/i.test(message)
            ? `${message}. Your message was saved — try a shorter question or retry.`
            : message,
        );
        // Keep the optimistic user bubble visible; pick up any saved server messages.
        await reloadThreadQuietly();
      }
    });
  };

  if (!open) return null;

  const contextLabel =
    thread?.contextNodeName ??
    (contextNodeId
      ? workspace?.nodes.find((n) => n.id === contextNodeId)?.name
      : null);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Project AI chat">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Close chat"
        onClick={() => setOpen(false)}
      />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-border bg-panel shadow-2xl sm:max-w-lg">
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-display text-sm font-semibold tracking-wide">
              <MessageSquare size={16} className="text-nav" aria-hidden />
              Project Chat
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {contextLabel
                ? `Scoped to “${contextLabel}” — accept to apply changes.`
                : "Project root — advisory until you accept."}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={18} />
          </Button>
        </header>

        {!thread?.aiAvailable ? (
          <div className="mx-4 mt-3 rounded-[var(--radius)] border border-border bg-muted-bg px-3 py-2 text-xs text-muted">
            Chat replies are pending — configure{" "}
            <code className="text-foreground">OPENAI_API_KEY</code> on the
            server. Messages still save to this project.
          </div>
        ) : null}

        {thread?.attachedGptText || thread?.attachedGptSource === "failed_share" ? (
          <div className="mx-4 mt-3 flex items-start justify-between gap-2 rounded-[var(--radius)] border border-border bg-panel-elevated/60 px-3 py-2 text-xs text-muted">
            <div className="min-w-0">
              <p className="font-medium text-foreground">
                GPT conversation attached
              </p>
              <p className="mt-0.5">
                Source:{" "}
                {thread.attachedGptSource === "share_fetch"
                  ? "public share link (may be partial)"
                  : thread.attachedGptSource === "paste"
                    ? "pasted transcript"
                    : "link only — paste transcript needed"}
                . Private ChatGPT history is never synced automatically.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              className="shrink-0 px-2 py-1 text-xs"
              onClick={() => {
                startAttach(async () => {
                  const result = await clearGptAttachmentAction({
                    projectId,
                    threadId: thread.id,
                    contextNodeId,
                  });
                  if (result.ok) {
                    setThread(result.thread);
                    setAttachInfo(null);
                    setGptTranscript("");
                  }
                });
              }}
            >
              Clear
            </Button>
          </div>
        ) : null}

        <div className="scrollbar-thin flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {loading && !thread ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading chat…
            </p>
          ) : null}
          <FieldError>{loadError}</FieldError>
          {thread?.messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              projectId={projectId}
              onThreadUpdate={setThread}
            />
          ))}
          {sending ? (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" /> Thinking…
            </p>
          ) : null}
          {!sending && sendError ? (
            <div
              className="mr-auto max-w-[95%] rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger"
              role="alert"
            >
              {sendError}
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-border px-4 py-3">
          <button
            type="button"
            className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted hover:text-foreground"
            onClick={() => setShowAttach((v) => !v)}
          >
            <Paperclip size={12} aria-hidden />
            Attach GPT conversation link
          </button>

          {showAttach ? (
            <div className="mb-3 space-y-2 rounded-[var(--radius)] border border-border bg-panel-elevated/40 p-3">
              <p className="text-xs text-muted">
                Use a public <strong className="font-medium text-foreground">share</strong>{" "}
                link (<code className="text-[11px]">chatgpt.com/share/…</code>)
                or paste the transcript. Private{" "}
                <code className="text-[11px]">/c/…</code> links cannot be fetched.
              </p>
              <div>
                <Label htmlFor="gpt-url">Share link</Label>
                <Input
                  id="gpt-url"
                  value={gptUrl}
                  onChange={(e) => setGptUrl(e.target.value)}
                  placeholder="https://chatgpt.com/share/…"
                  disabled={attaching}
                />
              </div>
              <div>
                <Label htmlFor="gpt-transcript">Paste transcript / export</Label>
                <Textarea
                  id="gpt-transcript"
                  value={gptTranscript}
                  onChange={(e) =>
                    setGptTranscript(
                      e.target.value.slice(0, GPT_TRANSCRIPT_MAX_CHARS),
                    )
                  }
                  rows={4}
                  maxLength={GPT_TRANSCRIPT_MAX_CHARS}
                  placeholder="Paste conversation text if the share link isn’t readable…"
                  disabled={attaching}
                />
                <p className="mt-1 text-right text-[11px] text-muted">
                  {formatCharCount(gptTranscript.length)} /{" "}
                  {formatCharCount(GPT_TRANSCRIPT_MAX_CHARS)}
                </p>
              </div>
              <FieldError>{attachError}</FieldError>
              {attachInfo ? (
                <p className="text-xs text-muted">{attachInfo}</p>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                className="text-xs"
                disabled={attaching || (!gptUrl.trim() && !gptTranscript.trim())}
                onClick={() => {
                  setAttachError(null);
                  setAttachInfo(null);
                  startAttach(async () => {
                    const result = await attachGptConversationAction({
                      projectId,
                      threadId: thread?.id,
                      contextNodeId,
                      url: gptUrl.trim() || null,
                      transcript: gptTranscript.trim() || null,
                    });
                    if (!result.ok) {
                      setAttachError(result.error);
                      if (result.needsTranscript) setShowAttach(true);
                      return;
                    }
                    setThread(result.thread);
                    setAttachInfo(result.message);
                    if (!result.needsTranscript) setGptTranscript("");
                  });
                }}
              >
                <Link2 size={14} aria-hidden />
                {attaching ? "Attaching…" : "Attach"}
              </Button>
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-2">
            <Textarea
              value={input}
              onChange={(e) =>
                setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS))
              }
              rows={3}
              maxLength={CHAT_MESSAGE_MAX_CHARS}
              placeholder={
                contextLabel
                  ? `Ask about ${contextLabel}, or propose nodes…`
                  : "Ask about intent, structure, balance…"
              }
              disabled={sending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onSubmit(e);
                }
              }}
            />
            <p
              className={cn(
                "text-right text-[11px] text-muted",
                input.length >= CHAT_MESSAGE_MAX_CHARS && "text-danger",
              )}
            >
              {formatCharCount(input.length)} /{" "}
              {formatCharCount(CHAT_MESSAGE_MAX_CHARS)}
            </p>
            <FieldError>{sendError}</FieldError>
            <div className="flex justify-end">
              <Button type="submit" disabled={sending || !input.trim()}>
                {sending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        </div>
      </aside>
    </div>
  );
}
