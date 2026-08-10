"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Textarea } from "@/components/ui/field";
import { uploadNodeImageAction } from "@/features/nodes/image-actions";

/**
 * Calm onboarding for nodes without notes yet.
 * Manual work is never blocked — AI is optional.
 */
export function NodeEmptyState({
  projectId,
  nodeId,
  idea,
  onIdeaChange,
  onSaveIdea,
  onHelpStructure,
  onStartManually,
  structuring = false,
  saving = false,
  imagesReady = true,
}: {
  projectId: string;
  nodeId: string;
  idea: string;
  onIdeaChange: (value: string) => void;
  onSaveIdea: () => Promise<boolean>;
  onHelpStructure: () => void;
  onStartManually: () => void;
  structuring?: boolean;
  saving?: boolean;
  imagesReady?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingImage, startImage] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-[var(--radius)] border border-border/80 bg-panel/60 px-5 py-8 sm:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        New idea
      </p>
      <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
        What is your idea?
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Write freely — a sentence or a page. You can structure it later, ask for
        suggestions, or just keep notes. Nothing is created until you choose.
      </p>

      <Textarea
        aria-label="What is your idea?"
        rows={8}
        value={idea}
        onChange={(e) => onIdeaChange(e.target.value)}
        placeholder="Describe the idea in your own words…"
        className="mt-5 min-h-[12rem] text-base leading-relaxed"
      />

      <FieldError>{error}</FieldError>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={structuring || saving || idea.trim().length < 20}
          onClick={() => {
            void (async () => {
              setError(null);
              const saved = await onSaveIdea();
              if (!saved) return;
              onHelpStructure();
            })();
          }}
        >
          {structuring ? "Suggesting…" : "Help me structure this"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving}
          onClick={onStartManually}
        >
          Start manually
        </Button>
        {imagesReady ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setError(null);
                startImage(async () => {
                  const fd = new FormData();
                  fd.set("projectId", projectId);
                  fd.set("nodeId", nodeId);
                  fd.set("file", file);
                  const result = await uploadNodeImageAction(fd);
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  onStartManually();
                });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              disabled={pendingImage}
              onClick={() => inputRef.current?.click()}
            >
              {pendingImage ? "Uploading…" : "Add reference image"}
            </Button>
          </>
        ) : null}
      </div>
      {idea.trim().length > 0 && idea.trim().length < 20 ? (
        <p className="mt-3 text-xs text-muted">
          A bit more text unlocks structure suggestions (about a short
          paragraph).
        </p>
      ) : null}
    </section>
  );
}
