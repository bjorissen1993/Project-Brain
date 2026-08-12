"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateNodeAction } from "@/features/nodes/actions";
import { isNodeContentEmpty } from "@/features/nodes/node-empty";
import { NodeEmptyState } from "@/features/nodes/node-empty-state";
import { useFocusWorkspace } from "./focus-interaction-context";

function EmptyNodeNotesForm({
  nodeId,
  nodeName,
  initialContent,
  onClose,
}: {
  nodeId: string;
  nodeName: string;
  initialContent: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { projectId } = useFocusWorkspace();
  const [content, setContent] = useState(initialContent);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const saveContent = (): Promise<boolean> =>
    new Promise((resolve) => {
      startTransition(async () => {
        const result = await updateNodeAction({
          id: nodeId,
          content: content.trim() || null,
        });
        if (!result.ok) {
          resolve(false);
          return;
        }
        router.refresh();
        resolve(true);
      });
    });

  // Portal to body so Structure chrome (backdrop-blur) cannot trap fixed overlays.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="empty-node-notes-title"
        className="max-h-[min(90dvh,calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] w-full max-w-xl overflow-y-auto rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl sm:p-6"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p
              id="empty-node-notes-title"
              className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted"
            >
              {nodeName}
            </p>
            <p className="mt-1 text-xs text-muted">
              This level has no children yet. Capture the idea first — you can
              add structure anytime.
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

        <NodeEmptyState
          projectId={projectId}
          nodeId={nodeId}
          idea={content}
          onIdeaChange={setContent}
          onSaveIdea={saveContent}
          onHelpStructure={() => {
            void saveContent().then((ok) => {
              if (ok) onClose();
            });
          }}
          onStartManually={() => {
            void saveContent().then((ok) => {
              if (ok) onClose();
            });
          }}
          structuring={pending}
          saving={pending}
        />

        {!isNodeContentEmpty(content) ? (
          <div className="mt-4 flex justify-end">
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                void saveContent().then((ok) => {
                  if (ok) onClose();
                });
              }}
            >
              {pending ? "Saving…" : "Save & continue"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Calm overlay when drilling into an empty Structure container from Blobs.
 * Lets the creator establish why the node exists before filling children.
 */
export function EmptyNodeNotesModal({
  nodeId,
  nodeName,
  open,
  onClose,
}: {
  nodeId: string;
  nodeName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { nodes } = useFocusWorkspace();
  const node = useMemo(
    () => nodes.find((n) => n.id === nodeId) ?? null,
    [nodes, nodeId],
  );

  if (!open || !node) return null;

  return (
    <EmptyNodeNotesForm
      key={nodeId}
      nodeId={nodeId}
      nodeName={nodeName}
      initialContent={node.content ?? ""}
      onClose={onClose}
    />
  );
}
