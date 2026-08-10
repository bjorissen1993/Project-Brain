"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { FileText, ImageIcon, Plus, SquareStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { createNodeAction, updateNodeAction } from "@/features/nodes/actions";
import { uploadNodeImageAction } from "@/features/nodes/image-actions";
import { IMAGE_NODE_LABEL } from "@/features/nodes/image-node";
import type { IconKey } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FOCUS_PALETTE, pickUnusedFocusColor } from "./focus-blob-color";
import { useOptionalFocusWorkspace } from "./focus-interaction-context";
import { IconPicker } from "./icon-picker";

type CreateKind = "chooser" | "node" | "note" | "image";

/** Bottom-right + control — create a structural child (node, note, or image). */
export function AddStructureBlobControl({
  projectId,
  parentNodeId,
  className,
  /** Increment to open the create dialog from context menus / empty-state CTAs. */
  openRequestId = 0,
}: {
  projectId: string;
  /** Current structure container; null = project root. */
  parentNodeId: string | null;
  className?: string;
  openRequestId?: number;
}) {
  const router = useRouter();
  const workspace = useOptionalFocusWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<CreateKind | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [asFolder, setAsFolder] = useState(parentNodeId == null);
  const [color, setColor] = useState<string>(FOCUS_PALETTE[0]!);
  const [icon, setIcon] = useState<IconKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const suggestColor = () => {
    if (!workspace) return FOCUS_PALETTE[0]!;
    const siblings = workspace
      .structureLevelFor(parentNodeId)
      .slices.map((s) => workspace.colorFor(s.id));
    return pickUnusedFocusColor(siblings);
  };

  const openChooser = () => {
    setError(null);
    setColor(suggestColor());
    setStep("chooser");
  };

  useEffect(() => {
    if (openRequestId <= 0) return;
    const t = window.setTimeout(() => openChooser(), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open only on external signal
  }, [openRequestId]);

  const close = () => {
    setStep(null);
    setName("");
    setDescription("");
    setAsFolder(parentNodeId == null);
    setColor(FOCUS_PALETTE[0]!);
    setIcon(null);
    setError(null);
  };

  const title =
    step === "note"
      ? "New note"
      : step === "node"
        ? "New node"
        : step === "image"
          ? "Add image"
          : "Add to this level";

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={openChooser}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-panel-elevated text-foreground shadow-md transition hover:border-nav/50 hover:bg-nav-muted hover:text-nav"
        aria-label="Add node, note, or image"
        title="Add node, note, or image"
      >
        <Plus size={20} strokeWidth={2.25} aria-hidden />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setError(null);
          startTransition(async () => {
            const baseName = file.name.replace(/\.[^.]+$/, "").slice(0, 120);
            const created = await createNodeAction({
              projectId,
              parentId: parentNodeId,
              name: baseName || "Image",
              type: "CUSTOM",
              customTypeLabel: IMAGE_NODE_LABEL,
              status: "IDEA",
              content: null,
            });
            if (!created.ok) {
              setError(created.error);
              return;
            }
            const fd = new FormData();
            fd.set("projectId", projectId);
            fd.set("nodeId", created.node.id);
            fd.set("file", file);
            const uploaded = await uploadNodeImageAction(fd);
            if (!uploaded.ok) {
              setError(uploaded.error);
              return;
            }
            // Persist public URL on the node so Focus Space can render the blob.
            await updateNodeAction({
              id: created.node.id,
              content: uploaded.image.url,
            });
            workspace?.setFocusColor(created.node.id, suggestColor());
            close();
            router.refresh();
          });
        }}
      />

      {step ? (
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
            aria-labelledby="add-structure-blob-title"
            className="w-full max-w-md rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
          >
            <p
              id="add-structure-blob-title"
              className="font-display text-lg font-semibold"
            >
              {title}
            </p>

            {step === "chooser" ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  Choose what to add at this Structure level.
                </p>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-panel-elevated/40 px-3 py-3 text-left transition-colors hover:border-nav/45 hover:bg-nav-muted/40"
                    onClick={() => setStep("node")}
                  >
                    <SquareStack
                      className="mt-0.5 shrink-0 text-nav"
                      size={18}
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">Node</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Folder or structural section for organizing the tree.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-panel-elevated/40 px-3 py-3 text-left transition-colors hover:border-nav/45 hover:bg-nav-muted/40"
                    onClick={() => {
                      setAsFolder(false);
                      setStep("note");
                    }}
                  >
                    <FileText
                      className="mt-0.5 shrink-0 text-nav"
                      size={18}
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">Note</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Content idea with written notes at this level.
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="flex items-start gap-3 rounded-[var(--radius)] border border-border bg-panel-elevated/40 px-3 py-3 text-left transition-colors hover:border-nav/45 hover:bg-nav-muted/40"
                    onClick={() => {
                      setStep("image");
                      window.setTimeout(() => fileRef.current?.click(), 0);
                    }}
                  >
                    <ImageIcon
                      className="mt-0.5 shrink-0 text-nav"
                      size={18}
                      aria-hidden
                    />
                    <span>
                      <span className="block text-sm font-medium">Image</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        Appears as a resizable blob on the Focus Space canvas.
                      </span>
                    </span>
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="button" variant="ghost" onClick={close}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : step === "image" ? (
              <>
                <p className="mt-1 text-xs text-muted">
                  {pending
                    ? "Uploading image…"
                    : "Pick an image file, or cancel and choose again."}
                </p>
                <FieldError>{error}</FieldError>
                <div className="mt-4 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setStep("chooser")}
                    disabled={pending}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() => fileRef.current?.click()}
                  >
                    {pending ? "Uploading…" : "Choose file"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-1 text-xs text-muted">
                  {step === "note"
                    ? "Adds a content note as a blob at this level."
                    : "Adds a structural node. Folders organize children; ideas hold content."}
                </p>
                <form
                  className="mt-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    setError(null);
                    startTransition(async () => {
                      const result = await createNodeAction({
                        projectId,
                        name: name.trim(),
                        parentId: parentNodeId,
                        type:
                          step === "note"
                            ? "IDEA"
                            : asFolder
                              ? "FOLDER"
                              : "IDEA",
                        status: "IDEA",
                        content: description.trim() || null,
                      });
                      if (!result.ok) {
                        setError(result.error);
                        return;
                      }
                      workspace?.setFocusColor(result.node.id, color);
                      if (icon) workspace?.setFocusIcon(result.node.id, icon);
                      close();
                      router.refresh();
                    });
                  }}
                >
                  <div>
                    <Label htmlFor="structure-blob-name">Name</Label>
                    <Input
                      id="structure-blob-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={
                        step === "note"
                          ? "e.g. Core loop sketch"
                          : parentNodeId == null
                            ? "e.g. Mechanics"
                            : "e.g. Resource Systems"
                      }
                      required
                      autoFocus
                    />
                  </div>
                  <div>
                    <Label htmlFor="structure-blob-desc">
                      {step === "note" ? "Notes" : "Idea / notes (optional)"}
                    </Label>
                    <Textarea
                      id="structure-blob-desc"
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder={
                        step === "note"
                          ? "What is this note about?"
                          : "Optional starting notes for this node"
                      }
                    />
                  </div>
                  {step === "node" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={asFolder}
                        onChange={(e) => setAsFolder(e.target.checked)}
                      />
                      <span>
                        Folder / area container
                        {parentNodeId == null ? " (recommended at root)" : ""}
                      </span>
                    </label>
                  ) : null}
                  <div>
                    <Label htmlFor="structure-blob-color">Blob color</Label>
                    <input
                      id="structure-blob-color"
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="mt-1 h-9 w-full cursor-pointer rounded border border-border bg-transparent"
                    />
                  </div>
                  <IconPicker
                    id="structure-blob-icon"
                    value={icon}
                    onChange={setIcon}
                  />
                  <FieldError>{error}</FieldError>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setStep("chooser")}
                    >
                      Back
                    </Button>
                    <Button type="submit" disabled={pending || !name.trim()}>
                      {pending ? "Creating…" : "Create"}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
