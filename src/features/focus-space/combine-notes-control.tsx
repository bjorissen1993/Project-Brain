"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import {
  acceptCombinedNoteAction,
  combineNotesAction,
} from "@/features/nodes/combine-notes-actions";
import { isNoteLikeNode } from "@/features/nodes/image-node";
import { useFocusWorkspace } from "./focus-interaction-context";

/**
 * Multi-select note-like children + Merge with AI → review modal → Accept.
 * Parent can wire canvas clicks via controlled `selecting` / `selected`.
 */
export function CombineNotesControl({
  parentNodeId,
  className,
  selecting,
  onSelectingChange,
  selected,
  onSelectedChange,
}: {
  parentNodeId: string | null;
  className?: string;
  /** Controlled selection mode (canvas click integration). */
  selecting?: boolean;
  onSelectingChange?: (value: boolean) => void;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
}) {
  const router = useRouter();
  const { projectId, nodes, structureLevelFor } = useFocusWorkspace();
  const level = structureLevelFor(parentNodeId);
  const noteCandidates = useMemo(() => {
    const childIds = new Set(level.slices.map((s) => s.id));
    return nodes.filter((n) => {
      if (!childIds.has(n.id)) return false;
      const hasChildren = level.slices.find((s) => s.id === n.id)?.hasChildren;
      return isNoteLikeNode({
        type: n.type,
        customTypeLabel: n.customTypeLabel,
        content: n.content,
        hasChildren,
      });
    });
  }, [level.slices, nodes]);

  const [internalSelecting, setInternalSelecting] = useState(false);
  const [internalSelected, setInternalSelected] = useState<string[]>([]);
  const isSelecting = selecting ?? internalSelecting;
  const selectedIds = selected ?? internalSelected;

  const setSelecting = (value: boolean) => {
    onSelectingChange?.(value);
    if (selecting === undefined) setInternalSelecting(value);
  };
  const setSelected = (ids: string[] | ((prev: string[]) => string[])) => {
    const next =
      typeof ids === "function" ? ids(selectedIds) : ids;
    onSelectedChange?.(next);
    if (selected === undefined) setInternalSelected(next);
  };

  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [targetNodeId, setTargetNodeId] = useState<string>("");
  const [removeSourceNotes, setRemoveSourceNotes] = useState(false);
  const [pending, startTransition] = useTransition();

  const candidateIdSet = useMemo(
    () => new Set(noteCandidates.map((n) => n.id)),
    [noteCandidates],
  );
  // Ignore ids that are no longer note candidates (parent also clears on level change).
  const activeSelected = selectedIds.filter((id) => candidateIdSet.has(id));

  if (noteCandidates.length < 2) return null;

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const runCombine = () => {
    if (activeSelected.length < 2) {
      setError("Select at least two notes");
      return;
    }
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await combineNotesAction({
        projectId,
        parentNodeId,
        sourceNodeIds: activeSelected,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setTitle(result.title);
      setSummary(result.summary);
      setTargetNodeId("");
      setRemoveSourceNotes(false);
      setMessage(result.message);
      setDraftOpen(true);
    });
  };

  return (
    <div className={className}>
      {!isSelecting ? (
        <button
          type="button"
          onClick={() => {
            setSelecting(true);
            setSelected([]);
            setError(null);
          }}
          className="rounded-[var(--radius)] border border-border bg-panel/95 px-2.5 py-1.5 text-xs font-medium text-muted shadow-sm backdrop-blur transition-colors hover:border-nav/45 hover:text-nav"
        >
          Combine notes
        </button>
      ) : (
        <div className="max-w-xs rounded-[var(--radius)] border border-border bg-panel/95 p-2.5 text-xs shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <p className="font-medium text-foreground">
              Select notes
              {activeSelected.length > 0 ? (
                <span className="ml-1 font-normal text-muted">
                  ({activeSelected.length})
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className="text-muted hover:text-foreground"
              onClick={() => {
                setSelecting(false);
                setSelected([]);
              }}
              aria-label="Cancel selection"
            >
              <X size={14} />
            </button>
          </div>
          <p className="mt-1 text-[11px] text-muted">
            Click note blobs on the canvas or tick below. Need 2+.
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
            {noteCandidates.map((n) => (
              <li key={n.id}>
                <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 hover:bg-muted-bg">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[var(--accent)]"
                    checked={activeSelected.includes(n.id)}
                    onChange={() => toggle(n.id)}
                  />
                  <span className="truncate text-foreground">{n.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <FieldError>{error}</FieldError>
          <Button
            type="button"
            className="mt-2 w-full"
            disabled={pending || activeSelected.length < 2}
            onClick={runCombine}
          >
            {pending
              ? "Combining…"
              : activeSelected.length >= 2
                ? `Merge with AI (${activeSelected.length})`
                : "Merge with AI"}
          </Button>
        </div>
      )}

      {draftOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setDraftOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="combine-notes-title"
            className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  id="combine-notes-title"
                  className="font-display text-lg font-semibold"
                >
                  Combined story
                </p>
                <p className="mt-1 text-xs text-muted">
                  Review before saving. Accept is required — nothing is written
                  until then.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => setDraftOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </Button>
            </div>

            {message ? (
              <p className="mt-3 text-xs text-muted">{message}</p>
            ) : null}

            <div className="mt-4 space-y-3">
              <div>
                <Label htmlFor="combine-title">Title</Label>
                <Input
                  id="combine-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="combine-summary">Story / summary</Label>
                <Textarea
                  id="combine-summary"
                  rows={10}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="combine-target">Save as</Label>
                <Select
                  id="combine-target"
                  value={targetNodeId}
                  onChange={(e) => setTargetNodeId(e.target.value)}
                >
                  <option value="">New note at this level</option>
                  {noteCandidates
                    .filter((n) => activeSelected.includes(n.id))
                    .map((n) => (
                      <option key={n.id} value={n.id}>
                        Update “{n.name}”
                      </option>
                    ))}
                </Select>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-[var(--accent)]"
                  checked={removeSourceNotes}
                  onChange={(e) => setRemoveSourceNotes(e.target.checked)}
                />
                <span>
                  Also remove original notes after Accept
                  <span className="block text-[11px] text-muted">
                    Off by default. The update target is kept if you chose one.
                  </span>
                </span>
              </label>
              <FieldError>{error}</FieldError>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDraftOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={pending || !title.trim() || !summary.trim()}
                  onClick={() => {
                    setError(null);
                    startTransition(async () => {
                      const result = await acceptCombinedNoteAction({
                        projectId,
                        parentNodeId,
                        sourceNodeIds: activeSelected,
                        title: title.trim(),
                        summary: summary.trim(),
                        targetNodeId: targetNodeId || null,
                        removeSourceNotes,
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      setDraftOpen(false);
                      setSelecting(false);
                      setSelected([]);
                      router.refresh();
                    });
                  }}
                >
                  {pending ? "Saving…" : "Accept"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Whether a node id is a combine-eligible note at the current level. */
export function isCombineNoteCandidate(
  node: {
    id: string;
    type?: string | null;
    customTypeLabel?: string | null;
    content?: string | null;
  },
  levelSlices: { id: string; hasChildren?: boolean }[],
): boolean {
  const slice = levelSlices.find((s) => s.id === node.id);
  if (!slice) return false;
  return isNoteLikeNode({
    type: node.type,
    customTypeLabel: node.customTypeLabel,
    content: node.content,
    hasChildren: slice.hasChildren,
  });
}
