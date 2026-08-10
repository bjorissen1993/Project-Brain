"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { updateFocusElementAction } from "@/features/design-focus/actions";
import type { ProjectNode } from "@/types";
import { useFocusWorkspace } from "./focus-interaction-context";

function pickIdeaNode(
  nodes: ProjectNode[],
  focusId: string,
): ProjectNode | null {
  const linked = nodes.filter((n) => n.designFocusId === focusId);
  if (!linked.length) return null;
  return (
    linked.find((n) => n.type === "IDEA") ??
    linked.slice().sort((a, b) => a.sortOrder - b.sortOrder)[0] ??
    null
  );
}

/**
 * Simple “write the idea” panel for a leaf Focus Space level
 * (no child focuses — content lives on linked Nodes).
 */
export function FocusIdeaEditor({
  focusId,
  focusName,
}: {
  focusId: string;
  focusName: string;
}) {
  const { nodes } = useFocusWorkspace();
  const idea = useMemo(
    () => pickIdeaNode(nodes, focusId),
    [nodes, focusId],
  );

  return (
    <FocusIdeaEditorForm
      key={`${focusId}:${idea?.id ?? "new"}`}
      focusId={focusId}
      focusName={focusName}
      idea={idea}
    />
  );
}

function FocusIdeaEditorForm({
  focusId,
  focusName,
  idea,
}: {
  focusId: string;
  focusName: string;
  idea: ProjectNode | null;
}) {
  const router = useRouter();
  const { projectId } = useFocusWorkspace();
  const [content, setContent] = useState(idea?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);

  return (
    <section className="mt-4 rounded-[var(--radius)] border border-border bg-panel/80 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
            Write the idea
          </p>
          <h2 className="mt-1 font-display text-lg font-semibold">
            {focusName}
          </h2>
          <p className="mt-1 text-xs text-muted">
            This Design Focus has no children yet. Capture linked idea notes
            here, or use + above to add child focuses. Structure lives in the
            Structure view — classifications connect ideas to Design Focuses.
          </p>
        </div>
        {idea ? (
          <Link
            href={`/projects/${projectId}/nodes/${idea.id}`}
            className="text-xs font-medium text-nav hover:text-nav-hover"
          >
            Open full node →
          </Link>
        ) : null}
      </div>

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await updateFocusElementAction({
              id: focusId,
              description: content,
              ideaNodeId: idea?.id ?? null,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 1600);
            router.refresh();
          });
        }}
      >
        <Label htmlFor="focus-idea-content">Idea text</Label>
        <Textarea
          id="focus-idea-content"
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Describe what this focus should deliver for the player experience…"
        />
        <FieldError>{error}</FieldError>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : idea ? "Save idea" : "Create & save idea"}
          </Button>
          {savedFlash ? (
            <span className="text-xs text-nav">Saved</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}
