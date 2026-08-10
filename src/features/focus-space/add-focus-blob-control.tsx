"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { createDesignFocusAction } from "@/features/design-focus/actions";
import { IMPORTANCE_SLIDER_FALLBACK } from "@/features/game-profile/genre-templates";
import { cn } from "@/lib/utils";
import { FOCUS_PALETTE, pickUnusedFocusColor } from "./focus-blob-color";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";

/** Bottom-left + control — full create dialog for a child Design Focus (+ linked Idea). */
export function AddFocusBlobControl({
  projectId,
  parentFocusId,
  className,
}: {
  projectId: string;
  /** Current Focus Space container; null = project root. */
  parentFocusId: string | null;
  className?: string;
}) {
  const router = useRouter();
  const workspace = useOptionalFocusWorkspace();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetImportance, setTargetImportance] = useState(50);
  const [color, setColor] = useState<string>(FOCUS_PALETTE[0]!);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestColor = () => {
    if (!workspace) return FOCUS_PALETTE[0]!;
    const siblings = workspace
      .designFocusLevelFor(parentFocusId)
      .slices.map((s) => workspace.colorFor(s.id));
    return pickUnusedFocusColor(siblings);
  };

  const close = () => {
    setOpen(false);
    setName("");
    setDescription("");
    setTargetImportance(50);
    setColor(FOCUS_PALETTE[0]!);
    setError(null);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => {
          setColor(suggestColor());
          setOpen(true);
        }}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel-elevated text-foreground shadow-md transition hover:border-nav/50 hover:bg-nav-muted hover:text-nav"
        aria-label="Create design focus element"
        title="Create element — name, idea, importance"
      >
        <Plus size={20} strokeWidth={2.25} aria-hidden />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-focus-blob-title"
            className="w-full max-w-md rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
          >
            <p
              id="add-focus-blob-title"
              className="font-display text-lg font-semibold"
            >
              Create element
            </p>
            <p className="mt-1 text-xs text-muted">
              Adds a Design Focus (emphasis criterion) at this level — not a
              Project Structure folder. Optional notes save on a linked Idea
              without changing structure blobs.
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                setError(null);
                startTransition(async () => {
                  const result = await createDesignFocusAction({
                    projectId,
                    name: name.trim(),
                    parentId: parentFocusId,
                    targetImportance,
                    isCustom: true,
                    description: description.trim() || null,
                    createIdeaNode: true,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  workspace?.setFocusColor(result.focus.id, color);
                  close();
                  router.refresh();
                });
              }}
            >
              <div>
                <Label htmlFor="add-focus-blob-name">Name</Label>
                <Input
                  id="add-focus-blob-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Combat Feel"
                  autoFocus
                  required
                />
              </div>
              <div>
                <Label htmlFor="add-focus-blob-desc">Idea / description</Label>
                <Textarea
                  id="add-focus-blob-desc"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Explain the idea — what should this element do for the experience?"
                />
              </div>
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <Label htmlFor="add-focus-blob-importance" className="mb-0">
                    Target importance
                  </Label>
                  <span className="tabular-nums">{targetImportance}</span>
                </div>
                <input
                  id="add-focus-blob-importance"
                  type="range"
                  min={0}
                  max={100}
                  value={targetImportance}
                  onChange={(e) => setTargetImportance(Number(e.target.value))}
                  className="w-full accent-[var(--accent)]"
                />
                <p className="mt-1 text-[11px] leading-snug text-muted">
                  {IMPORTANCE_SLIDER_FALLBACK}
                </p>
              </div>
              <div>
                <Label htmlFor="add-focus-blob-color">Color</Label>
                <input
                  id="add-focus-blob-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-16 cursor-pointer rounded border border-border bg-panel-elevated"
                />
              </div>
              <FieldError>{error}</FieldError>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={close}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !name.trim()}>
                  {pending ? "Creating…" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
