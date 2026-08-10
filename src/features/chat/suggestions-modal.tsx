"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { useOptionalFocusWorkspace } from "@/features/focus-space";
import { NODE_TYPE_OPTIONS } from "@/types";
import { cn } from "@/lib/utils";
import {
  createProposalDepth,
  formatCreateParentLabel,
  type ChatProposal,
} from "./schema";

function typeLabel(type: string) {
  return NODE_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
}

export type SuggestionRow = ChatProposal & {
  key: string;
  selected: boolean;
};

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

function proposalKindLabel(p: ChatProposal): string {
  if (p.kind === "create_node") return typeLabel(p.type);
  if (p.kind === "update_node") return "Update";
  return "Design Focus";
}

function proposalTitle(
  p: ChatProposal,
  workspace: ReturnType<typeof useOptionalFocusWorkspace>,
): string {
  if (p.kind === "update_node") {
    return (
      p.name?.trim() ||
      nodePathLabel(p.nodeId, workspace) ||
      `Update node ${p.nodeId.slice(0, 8)}…`
    );
  }
  return p.name;
}

function proposalHierarchy(
  p: ChatProposal,
  workspace: ReturnType<typeof useOptionalFocusWorkspace>,
): string | null {
  if (p.kind === "create_node") {
    return (
      formatCreateParentLabel(p) || nodePathLabel(p.parentNodeId, workspace)
    );
  }
  if (p.kind === "update_node") {
    return nodePathLabel(p.nodeId, workspace);
  }
  return null;
}

function proposalBody(p: ChatProposal): string | null {
  if (p.kind === "create_node") return p.content ?? null;
  if (p.kind === "create_focus") return p.description ?? null;
  if (p.kind === "update_node") {
    const bits = [
      p.name ? `name → ${p.name}` : null,
      p.type ? `type → ${p.type}` : null,
      p.status ? `status → ${p.status}` : null,
      p.content !== undefined && p.content !== null
        ? `content → ${p.content.slice(0, 120)}`
        : null,
    ].filter(Boolean);
    return bits.length ? bits.join(" · ") : null;
  }
  return null;
}

export function SuggestionsModal({
  open,
  title,
  subtitle,
  rows,
  error,
  pending,
  onClose,
  onToggle,
  onReject,
  onSelectAll,
  onClearSelection,
  onAccept,
  onDismissAll,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  rows: SuggestionRow[];
  error?: string | null;
  pending?: boolean;
  onClose: () => void;
  onToggle: (key: string) => void;
  onReject: (key: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onAccept: () => void;
  onDismissAll: () => void;
}) {
  const workspace = useOptionalFocusWorkspace();
  if (!open) return null;

  const selectedCount = rows.filter((r) => r.selected).length;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-panel shadow-xl"
      >
        <header className="flex items-start justify-between gap-2 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-display text-base font-semibold">{title}</p>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-muted">{subtitle}</p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted">
              {rows.length} suggestion{rows.length === 1 ? "" : "s"} ·{" "}
              {selectedCount} selected
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-8 shrink-0 p-0"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </Button>
        </header>

        <ul className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {rows.map((row) => {
            const depth =
              row.kind === "create_node"
                ? createProposalDepth(row, rows)
                : 0;
            const hierarchy = proposalHierarchy(row, workspace);
            return (
              <li
                key={row.key}
                className={cn(
                  "rounded-[var(--radius)] border border-border bg-panel-elevated/50 px-2.5 py-2",
                )}
                style={
                  depth > 0
                    ? { marginLeft: Math.min(depth, 6) * 12 }
                    : undefined
                }
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={row.selected}
                    onChange={() => onToggle(row.key)}
                    aria-label={`Select ${proposalTitle(row, workspace)}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {proposalTitle(row, workspace)}
                      <span className="ml-2 text-[11px] font-normal uppercase tracking-wide text-muted">
                        {proposalKindLabel(row)}
                      </span>
                    </p>
                    {hierarchy ? (
                      <p className="mt-0.5 text-[11px] text-muted">
                        {row.kind === "update_node" ? "Target: " : "Under: "}
                        {hierarchy}
                      </p>
                    ) : null}
                    {proposalBody(row) ? (
                      <p className="mt-1 text-xs text-muted line-clamp-3">
                        {proposalBody(row)}
                      </p>
                    ) : null}
                    {row.reasoning ? (
                      <p className="mt-1 text-[11px] text-muted">
                        {row.reasoning}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="shrink-0 px-2 py-1 text-xs"
                    onClick={() => onReject(row.key)}
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        <footer className="space-y-2 border-t border-border px-4 py-3">
          <FieldError>{error}</FieldError>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              className="text-xs"
              disabled={pending}
              onClick={onSelectAll}
            >
              Select all
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-xs"
              disabled={pending}
              onClick={onClearSelection}
            >
              Clear
            </Button>
            <div className="flex-1" />
            <Button
              type="button"
              variant="ghost"
              className="text-xs"
              disabled={pending}
              onClick={onDismissAll}
            >
              Dismiss all
            </Button>
            <Button
              type="button"
              variant="primary"
              className="text-xs"
              disabled={pending || selectedCount === 0}
              onClick={onAccept}
            >
              {pending
                ? "Adding…"
                : `Add selected (${selectedCount})`}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
