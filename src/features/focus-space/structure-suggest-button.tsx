"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";
import { BRAND_ASSET_VERSION } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/field";
import { updateNodeAction } from "@/features/nodes/actions";
import { useFocusWorkspace } from "./focus-interaction-context";
import { SuggestElementsPanel } from "./suggest-elements-panel";

/**
 * Compact Project Brain logo control — opens structure suggestions in a modal.
 * Works at project root (nodeId null) and inside nested containers.
 */
export function StructureSuggestButton({
  nodeId,
  className,
}: {
  nodeId: string | null;
  className?: string;
}) {
  const { projectId, projectName, nodes, intentText } = useFocusWorkspace();
  const node = useMemo(
    () => (nodeId ? (nodes.find((n) => n.id === nodeId) ?? null) : null),
    [nodes, nodeId],
  );
  const isRoot = nodeId == null;
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState(
    () => (isRoot ? (intentText ?? "") : (node?.content ?? "")),
  );
  const [, startTransition] = useTransition();

  // Nested: hide if the focus node vanished. Root always available.
  if (!isRoot && !node) return null;

  const seedContent = isRoot ? (intentText ?? "") : (node?.content ?? "");

  const saveContent = (): Promise<boolean> =>
    new Promise((resolve) => {
      if (isRoot || !nodeId) {
        resolve(true);
        return;
      }
      startTransition(async () => {
        const result = await updateNodeAction({
          id: nodeId,
          content: content.trim() || null,
        });
        resolve(result.ok);
      });
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setContent(seedContent);
          setOpen(true);
        }}
        className={
          className ??
          "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-panel shadow-sm transition hover:border-nav/45 hover:bg-nav-muted"
        }
        title="Structure suggestions"
        aria-label="Open structure suggestions"
      >
        <Image
          src={`/brand/project-brain-logo.png?v=${BRAND_ASSET_VERSION}`}
          alt=""
          width={28}
          height={20}
          unoptimized
          className="h-5 w-auto mix-blend-screen"
        />
      </button>

      {open ? (
        <StructureSuggestModal
          projectId={projectId}
          projectName={projectName}
          nodeId={nodeId}
          nodeName={node?.name ?? projectName}
          isRoot={isRoot}
          content={content}
          onContentChange={setContent}
          onContentShouldSave={isRoot ? undefined : saveContent}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function StructureSuggestModal({
  projectId,
  projectName,
  nodeId,
  nodeName,
  isRoot,
  content,
  onContentChange,
  onContentShouldSave,
  onClose,
}: {
  projectId: string;
  projectName: string;
  nodeId: string | null;
  nodeName: string;
  isRoot: boolean;
  content: string;
  onContentChange: (value: string) => void;
  onContentShouldSave?: () => Promise<boolean>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="structure-suggest-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-[var(--radius)] border border-border bg-panel p-4 shadow-xl sm:p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p
              id="structure-suggest-title"
              className="font-display text-lg font-semibold"
            >
              Structure suggestions
            </p>
            <p className="mt-1 text-xs text-muted">
              {isRoot
                ? `Propose top-level sections for “${projectName}”. Nothing is added until you accept.`
                : `Propose child sections for “${nodeName}”. Nothing is added until you accept.`}
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
        {isRoot ? (
          <div className="mb-3">
            <Label htmlFor="structure-suggest-root-seed">Seed notes</Label>
            <Textarea
              id="structure-suggest-root-seed"
              rows={4}
              value={content}
              onChange={(e) => onContentChange(e.target.value)}
              className="mt-1"
              placeholder="Describe the project so suggestions can propose top-level structure…"
            />
          </div>
        ) : null}
        <SuggestElementsPanel
          projectId={projectId}
          nodeId={nodeId}
          content={content}
          onContentShouldSave={onContentShouldSave}
          autoLabel="Suggest structure"
          hideIntro
          className="space-y-3"
        />
      </div>
    </div>
  );
}
