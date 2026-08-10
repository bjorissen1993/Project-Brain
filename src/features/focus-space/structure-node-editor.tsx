"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Label, Textarea } from "@/components/ui/field";
import { updateNodeAction } from "@/features/nodes/actions";
import { isNodeContentEmpty } from "@/features/nodes/node-empty";
import { NodeEmptyState } from "@/features/nodes/node-empty-state";
import { useFocusWorkspace } from "./focus-interaction-context";
import { SuggestElementsPanel } from "./suggest-elements-panel";

/** Write panel for a leaf structure node (no children). */
export function StructureNodeEditor({
  nodeId,
  nodeName,
}: {
  nodeId: string;
  nodeName: string;
}) {
  const router = useRouter();
  const { projectId, nodes } = useFocusWorkspace();
  const node = useMemo(
    () => nodes.find((n) => n.id === nodeId) ?? null,
    [nodes, nodeId],
  );
  const [content, setContent] = useState(node?.content ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedFlash, setSavedFlash] = useState(false);
  const [manualMode, setManualMode] = useState(
    () => !isNodeContentEmpty(node?.content),
  );
  const [suggestTrigger, setSuggestTrigger] = useState(0);

  if (!node) return null;

  const saveContent = (): Promise<boolean> =>
    new Promise((resolve) => {
      setError(null);
      startTransition(async () => {
        const result = await updateNodeAction({
          id: nodeId,
          content: content.trim() || null,
        });
        if (!result.ok) {
          setError(result.error);
          resolve(false);
          return;
        }
        setSavedFlash(true);
        router.refresh();
        window.setTimeout(() => setSavedFlash(false), 1600);
        resolve(true);
      });
    });

  const showEmpty = !manualMode && isNodeContentEmpty(content);

  return (
    <section className="mt-4 rounded-[var(--radius)] border border-border bg-panel/80 p-4 shadow-sm">
      {showEmpty ? (
        <NodeEmptyState
          projectId={projectId}
          nodeId={nodeId}
          idea={content}
          onIdeaChange={setContent}
          onSaveIdea={saveContent}
          onHelpStructure={() => {
            setManualMode(true);
            setSuggestTrigger((n) => n + 1);
          }}
          onStartManually={() => setManualMode(true)}
          structuring={pending}
          saving={pending}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                Overview / Notes
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold">
                {nodeName}
              </h2>
              <p className="mt-1 text-xs text-muted">
                Capture the idea here. Structure suggestions add children — they
                do not replace these notes.
              </p>
            </div>
            <Link
              href={`/projects/${projectId}/nodes/${nodeId}`}
              className="text-xs font-medium text-nav hover:text-nav-hover"
            >
              Open full editor
            </Link>
          </div>
          <div className="mt-3">
            <Label htmlFor="structure-node-content">Notes</Label>
            <Textarea
              id="structure-node-content"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="mt-1"
            />
          </div>
          <FieldError>{error}</FieldError>
          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                void saveContent();
              }}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            {savedFlash ? (
              <span className="text-xs text-accent">Saved</span>
            ) : null}
          </div>
        </>
      )}

      {!showEmpty ? (
        <SuggestElementsPanel
          projectId={projectId}
          nodeId={nodeId}
          content={content}
          onContentShouldSave={saveContent}
          suggestTrigger={suggestTrigger}
        />
      ) : null}
    </section>
  );
}
