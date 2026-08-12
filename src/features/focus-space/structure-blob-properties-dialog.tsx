"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { CopyProfileDialog } from "@/features/chat/copy-profile-dialog";
import { updateNodeAction } from "@/features/nodes/actions";
import type { ProjectNode } from "@/types";
import type { IconKey } from "@/lib/icons";
import { CleanProfileSlotsControl } from "./clean-profile-slots-control";
import {
  defaultFocusColor,
  FOCUS_COLOR_SWATCHES,
} from "./focus-blob-color";
import { useFocusWorkspace } from "./focus-interaction-context";
import { IconPicker } from "./icon-picker";
import { StructureBlobDeleteControl } from "./structure-blob-delete-control";
import {
  parseStructureView,
  structureNodeInfoHref,
} from "./structure-href";

/** Right-click properties modal for a Project Structure blob (Node). */
export function StructureBlobPropertiesDialog({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const structureView = parseStructureView(searchParams.get("view"));
  const { projectId, nodes, colorFor, setFocusColor, iconFor, setFocusIcon } =
    useFocusWorkspace();

  const node = useMemo(
    () => nodes.find((n: ProjectNode) => n.id === nodeId) ?? null,
    [nodes, nodeId],
  );

  if (!node) return null;

  return (
    <StructureBlobPropertiesForm
      key={nodeId}
      node={node}
      projectId={projectId}
      nodes={nodes}
      structureView={structureView}
      initialColor={colorFor(nodeId)}
      initialIcon={iconFor(nodeId)}
      setFocusColor={setFocusColor}
      setFocusIcon={setFocusIcon}
      onClose={onClose}
      onSaved={() => router.refresh()}
      onDeleted={() => {
        onClose();
        router.refresh();
      }}
    />
  );
}

function StructureBlobPropertiesForm({
  node,
  projectId,
  nodes,
  structureView,
  initialColor,
  initialIcon,
  setFocusColor,
  setFocusIcon,
  onClose,
  onSaved,
  onDeleted,
}: {
  node: ProjectNode;
  projectId: string;
  nodes: ProjectNode[];
  structureView: ReturnType<typeof parseStructureView>;
  initialColor: string;
  initialIcon: IconKey | null;
  setFocusColor: (id: string, color: string | null) => void;
  setFocusIcon: (id: string, icon: IconKey | null) => void;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(node.name);
  const [content, setContent] = useState(node.content ?? "");
  const [color, setColor] = useState(initialColor || defaultFocusColor(node.id));
  const [icon, setIcon] = useState<IconKey | null>(initialIcon);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [copyOpen, setCopyOpen] = useState(false);
  const childCount = nodes.filter((n) => n.parentId === node.id).length;

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

  // Portal to body so backdrop-blur / overflow chrome cannot trap fixed overlays.
  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 pb-[max(1rem,env(safe-area-inset-bottom,0px))] pl-[max(1rem,env(safe-area-inset-left,0px))] pr-[max(1rem,env(safe-area-inset-right,0px))] pt-[max(1rem,env(safe-area-inset-top,0px))] sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="structure-blob-props-title"
        className="max-h-[min(90dvh,calc(100dvh-2rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)))] w-full max-w-md overflow-y-auto rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
      >
        <p
          id="structure-blob-props-title"
          className="font-display text-lg font-semibold"
        >
          Structure properties
        </p>
        <p className="mt-1 text-xs text-muted">
          Structural node ({node.type}). Design Focus classifications are edited
          on the node detail page — not here.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateNodeAction({
                id: node.id,
                name: name.trim(),
                content: content.trim() || null,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFocusColor(node.id, color);
              setFocusIcon(node.id, icon);
              onSaved();
              onClose();
            });
          }}
        >
          <div>
            <Label htmlFor="structure-props-name">Name</Label>
            <Input
              id="structure-props-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <Label htmlFor="structure-props-content">Content</Label>
            <Textarea
              id="structure-props-content"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          <div>
            <Label>Blob color</Label>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {FOCUS_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: swatch }}
                  onClick={() => setColor(swatch)}
                  aria-label={`Color ${swatch}`}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-6 w-10 cursor-pointer rounded border border-border bg-transparent"
              />
            </div>
          </div>
          <IconPicker
            id="structure-props-icon"
            value={icon}
            onChange={setIcon}
          />
          <FieldError>{error}</FieldError>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Link
              href={structureNodeInfoHref(projectId, node.id, structureView)}
              className="text-xs font-medium text-nav hover:text-nav-hover"
            >
              Open node detail
            </Link>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </form>

        {childCount > 0 ? (
          <div className="mt-4 rounded-[var(--radius)] border border-border bg-panel-elevated/40 p-3">
            <p className="text-xs text-muted">
              This node has {childCount} child slot
              {childCount === 1 ? "" : "s"}. Copy the profile structure onto new
              siblings with empty content.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 text-xs"
              onClick={() => setCopyOpen(true)}
            >
              Copy profile
            </Button>
            <CopyProfileDialog
              open={copyOpen}
              projectId={projectId}
              sourceNodeId={node.id}
              sourceName={node.name}
              onClose={() => setCopyOpen(false)}
              onCopied={() => {
                onSaved();
              }}
            />
          </div>
        ) : null}

        <CleanProfileSlotsControl
          node={node}
          nodes={nodes}
          projectId={projectId}
          onCleaned={() => {
            onSaved();
          }}
        />

        <div className="mt-4">
          <StructureBlobDeleteControl
            node={node}
            projectId={projectId}
            nodes={nodes}
            onDeleted={onDeleted}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
