"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { copyNodeSubtreeAction } from "./actions";

/**
 * Confirm new names, then deep-copy a node + child template under the same parent.
 */
export function CopyProfileDialog({
  open,
  projectId,
  sourceNodeId,
  sourceName,
  onClose,
  onCopied,
}: {
  open: boolean;
  projectId: string;
  sourceNodeId: string;
  sourceName: string;
  onClose: () => void;
  onCopied?: (created: { id: string; name: string }[]) => void;
}) {
  const [namesText, setNamesText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  const names = namesText
    .split(/[\n,]+/)
    .map((n) => n.trim())
    .filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-profile-title"
        className="w-full max-w-md rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <p
              id="copy-profile-title"
              className="font-display text-lg font-semibold"
            >
              Copy profile
            </p>
            <p className="mt-1 text-xs text-muted">
              Duplicate “{sourceName}” and its child slots under the same parent.
              Content is cleared so you get an empty skeleton.
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
        </div>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!names.length) {
              setError("Enter at least one new name.");
              return;
            }
            setError(null);
            startTransition(async () => {
              const result = await copyNodeSubtreeAction({
                projectId,
                sourceNodeId,
                names,
                clearContent: true,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              onCopied?.(result.createdRoots);
              setNamesText("");
              onClose();
            });
          }}
        >
          <div>
            <Label htmlFor="copy-profile-names">
              New names (comma or line separated)
            </Label>
            <Input
              id="copy-profile-names"
              value={namesText}
              onChange={(e) => setNamesText(e.target.value)}
              placeholder="NPC A, NPC B, NPC C"
              disabled={pending}
              autoFocus
            />
            <p className="mt-1 text-[11px] text-muted">
              {names.length
                ? `${names.length} copy${names.length === 1 ? "" : "ies"} ready`
                : "Example: Mira, Toren, Sable"}
            </p>
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || names.length === 0}>
              {pending ? "Copying…" : `Copy ${names.length || ""}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
