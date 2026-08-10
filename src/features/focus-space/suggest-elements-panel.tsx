"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Select } from "@/components/ui/field";
import { ELEMENT_SUGGESTION_INLINE } from "@/features/ai/element-suggestion-schema";
import {
  SuggestionsModal,
  type SuggestionRow,
} from "@/features/chat/suggestions-modal";
import {
  applyChildElementSuggestionsAction,
  ignoreChildElementSuggestionsAction,
  suggestChildElementsAction,
} from "@/features/nodes/suggest-elements-actions";
import type { SuggestedChildElementData } from "@/features/ai/types";
import { NODE_TYPE_OPTIONS, type NodeType } from "@/types";
import { allocateUniqueFocusColors } from "./focus-blob-color";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";

type Row = SuggestedChildElementData & { id: string };

function toSuggestionRows(rows: Row[]): SuggestionRow[] {
  return rows.map((r) => ({
    key: r.id,
    kind: "create_node" as const,
    name: r.name,
    type: r.type,
    content: r.content,
    reasoning: r.reasoning,
    selected: r.selected,
  }));
}

/**
 * Ask-before-create structure proposals (Help me structure this).
 * Never auto-creates nodes.
 */
export function SuggestElementsPanel({
  projectId,
  nodeId,
  content,
  onContentShouldSave,
  autoLabel = "Help me structure this",
  className,
  /** Hide the AI / Suggestions intro block (e.g. when embedded in a modal). */
  hideIntro = false,
  /** Increment to trigger suggest from empty-state CTAs. */
  suggestTrigger = 0,
}: {
  projectId: string;
  /** Parent container; null = project root (top-level structure). */
  nodeId: string | null;
  content: string;
  /** Called before suggest so unsaved editor text can be persisted. */
  onContentShouldSave?: () => Promise<boolean>;
  autoLabel?: string;
  className?: string;
  hideIntro?: boolean;
  suggestTrigger?: number;
}) {
  const router = useRouter();
  const workspace = useOptionalFocusWorkspace();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<"ai" | "heuristic" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  const [adding, startAddTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customType, setCustomType] = useState<NodeType>("IDEA");

  const selected = rows?.filter((r) => r.selected) ?? [];
  const overflow = rows
    ? Math.max(0, rows.length - ELEMENT_SUGGESTION_INLINE)
    : 0;
  const inlineRows = rows?.slice(0, ELEMENT_SUGGESTION_INLINE) ?? [];

  const runSuggest = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      if (onContentShouldSave) {
        const saved = await onContentShouldSave();
        if (!saved) return;
      }
      const result = await suggestChildElementsAction({
        projectId,
        nodeId,
        content: content.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        setRows(null);
        setSource(null);
        setAnalysisId(undefined);
        return;
      }
      setSource(result.source);
      setMessage(result.message);
      setAnalysisId(result.analysisId);
      setRows(
        result.data.suggestions.map((s, i) => ({
          ...s,
          id: `${s.name}-${i}`,
        })),
      );
      if (result.data.suggestions.length === 0) {
        setError(null);
        // Keep message visible; avoid an empty Accept UI.
      }
    });
  };

  const lastSuggestTrigger = useRef(0);
  useEffect(() => {
    if (suggestTrigger <= 0 || suggestTrigger === lastSuggestTrigger.current) {
      return;
    }
    lastSuggestTrigger.current = suggestTrigger;
    const timer = window.setTimeout(() => {
      runSuggest();
    }, 0);
    return () => window.clearTimeout(timer);
    // Intentionally only re-run when parent bumps suggestTrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestTrigger]);

  const applySelected = (items: Row[]) => {
    setError(null);
    startAddTransition(async () => {
      const result = await applyChildElementSuggestionsAction({
        projectId,
        parentNodeId: nodeId,
        analysisId,
        items: items.map((s) => ({
          name: s.name,
          type: s.type,
          content: null,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (workspace) {
        const siblingColors = workspace
          .structureLevelFor(nodeId)
          .slices.map((s) => workspace.colorFor(s.id));
        const colors = allocateUniqueFocusColors(
          siblingColors,
          result.createdIds.length,
        );
        result.createdIds.forEach((id, i) => {
          const color = colors[i];
          if (color) workspace.setFocusColor(id, color);
        });
      }
      setRows(null);
      setMessage(result.message);
      setSource(null);
      setAnalysisId(undefined);
      setModalOpen(false);
      router.refresh();
    });
  };

  const dismiss = () => {
    startTransition(async () => {
      if (analysisId) {
        await ignoreChildElementSuggestionsAction({
          projectId,
          nodeId,
          analysisId,
        });
      }
      setRows(null);
      setSource(null);
      setMessage(null);
      setAnalysisId(undefined);
      setModalOpen(false);
    });
  };

  return (
    <div
      className={
        className ??
        "mt-4 space-y-3 rounded-[var(--radius)] border border-border bg-panel-elevated/50 p-3"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {!hideIntro ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              AI / Suggestions
            </p>
            <p className="mt-1 text-xs text-muted">
              Propose child sections from this idea. Nothing is added until you
              accept. Your notes stay on this node.
            </p>
          </div>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="secondary"
          disabled={pending || adding || content.trim().length < 20}
          onClick={runSuggest}
        >
          {pending ? "Suggesting…" : autoLabel}
        </Button>
      </div>

      {content.trim().length > 0 && content.trim().length < 20 ? (
        <p className="text-xs text-muted">
          Add a bit more text (about a short paragraph) to unlock suggestions.
        </p>
      ) : null}

      <FieldError>{error}</FieldError>

      {rows && rows.length === 0 && message ? (
        <p className="rounded-[var(--radius)] border border-border bg-muted-bg px-2.5 py-2 text-xs text-muted">
          {message}
        </p>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="space-y-2">
          {source === "heuristic" ? (
            <p className="rounded-[var(--radius)] border border-border bg-muted-bg px-2.5 py-1.5 text-xs text-muted">
              Heuristic suggestions (no OPENAI_API_KEY or AI fallback). Labeled
              clearly — review before adding. Manual work is never blocked.
            </p>
          ) : null}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            {message && source === "ai" ? (
              <p className="text-xs text-muted">{message}</p>
            ) : (
              <span />
            )}
            <p className="text-[11px] text-muted">
              {rows.length} suggestion{rows.length === 1 ? "" : "s"} total
            </p>
          </div>

          <ul className="space-y-2">
            {inlineRows.map((row) => (
              <li
                key={row.id}
                className="space-y-2 rounded-[var(--radius)] border border-border/80 bg-panel px-2.5 py-2"
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-2 accent-[var(--accent)]"
                    checked={row.selected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRows((prev) =>
                        prev
                          ? prev.map((r) =>
                              r.id === row.id ? { ...r, selected: checked } : r,
                            )
                          : prev,
                      );
                    }}
                    aria-label={`Select ${row.name}`}
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Input
                      value={row.name}
                      onChange={(e) => {
                        const name = e.target.value;
                        setRows((prev) =>
                          prev
                            ? prev.map((r) =>
                                r.id === row.id ? { ...r, name } : r,
                              )
                            : prev,
                        );
                      }}
                      aria-label="Suggestion name"
                    />
                    <Select
                      value={row.type}
                      onChange={(e) => {
                        const type = e.target.value as NodeType;
                        setRows((prev) =>
                          prev
                            ? prev.map((r) =>
                                r.id === row.id ? { ...r, type } : r,
                              )
                            : prev,
                        );
                      }}
                      aria-label="Suggestion type"
                    >
                      {NODE_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </Select>
                    {row.reasoning ? (
                      <p className="text-xs text-muted">{row.reasoning}</p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    disabled={adding}
                    onClick={() =>
                      setRows((prev) =>
                        prev ? prev.filter((r) => r.id !== row.id) : prev,
                      )
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
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

          <div className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-dashed border-border px-2.5 py-2">
            <div className="min-w-[10rem] flex-1">
              <Input
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Add your own section…"
                aria-label="Custom section name"
              />
            </div>
            <Select
              value={customType}
              onChange={(e) => setCustomType(e.target.value as NodeType)}
              aria-label="Custom section type"
              className="w-36"
            >
              {NODE_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              disabled={!customName.trim()}
              onClick={() => {
                const name = customName.trim();
                if (!name) return;
                setRows((prev) => [
                  ...(prev ?? []),
                  {
                    id: `custom-${Date.now()}`,
                    name,
                    type: customType,
                    selected: true,
                    reasoning: "Added by you",
                  },
                ]);
                setCustomName("");
              }}
            >
              Add own item
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              disabled={adding || selected.length === 0}
              onClick={() => applySelected(selected)}
            >
              {adding
                ? "Adding…"
                : `Accept selected (${selected.length})`}
            </Button>
            {overflow > 0 ? (
              <Button
                type="button"
                variant="secondary"
                disabled={adding}
                onClick={() => setModalOpen(true)}
              >
                Open all
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              disabled={adding}
              onClick={dismiss}
            >
              Ignore
            </Button>
          </div>

          <SuggestionsModal
            open={modalOpen}
            title="All structure suggestions"
            subtitle={
              nodeId
                ? "Multi-select what to add under this idea. Rename in the list above."
                : "Multi-select what to add at the project root. Rename in the list above."
            }
            rows={toSuggestionRows(rows)}
            error={error}
            pending={adding}
            onClose={() => setModalOpen(false)}
            onToggle={(key) =>
              setRows((prev) =>
                prev
                  ? prev.map((r) =>
                      r.id === key ? { ...r, selected: !r.selected } : r,
                    )
                  : prev,
              )
            }
            onReject={(key) =>
              setRows((prev) =>
                prev ? prev.filter((r) => r.id !== key) : prev,
              )
            }
            onSelectAll={() =>
              setRows((prev) =>
                prev ? prev.map((r) => ({ ...r, selected: true })) : prev,
              )
            }
            onClearSelection={() =>
              setRows((prev) =>
                prev ? prev.map((r) => ({ ...r, selected: false })) : prev,
              )
            }
            onAccept={() => applySelected(rows.filter((r) => r.selected))}
            onDismissAll={dismiss}
          />
        </div>
      ) : rows && rows.length === 0 ? (
        <p className="text-xs text-muted">No suggestions this time.</p>
      ) : null}
    </div>
  );
}
