"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/field";
import { updateFocusElementAction } from "@/features/design-focus/actions";
import {
  findGenreFocusDescription,
  IMPORTANCE_SLIDER_FALLBACK,
} from "@/features/game-profile/genre-templates";
import type { IconKey } from "@/lib/icons";
import type { DesignFocus, ProjectNode } from "@/types";
import {
  defaultFocusColor,
  FOCUS_COLOR_SWATCHES,
} from "./focus-blob-color";
import { useFocusWorkspace } from "./focus-interaction-context";
import { IconPicker } from "./icon-picker";

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

/** Right-click properties modal for a Focus Space blob. */
export function FocusBlobPropertiesDialog({
  focusId,
  onClose,
}: {
  focusId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const {
    projectId,
    focuses,
    nodes,
    colorFor,
    setFocusColor,
    iconFor,
    setFocusIcon,
  } = useFocusWorkspace();

  const focus = useMemo(
    () => focuses.find((f: DesignFocus) => f.id === focusId) ?? null,
    [focuses, focusId],
  );
  const idea = useMemo(
    () => pickIdeaNode(nodes, focusId),
    [nodes, focusId],
  );

  if (!focus) return null;

  return (
    <FocusBlobPropertiesForm
      key={`${focusId}:${idea?.id ?? "none"}`}
      focus={focus}
      idea={idea}
      projectId={projectId}
      initialColor={colorFor(focusId)}
      initialIcon={iconFor(focusId)}
      setFocusColor={setFocusColor}
      setFocusIcon={setFocusIcon}
      onClose={onClose}
      onSaved={() => router.refresh()}
    />
  );
}

function FocusBlobPropertiesForm({
  focus,
  idea,
  projectId,
  initialColor,
  initialIcon,
  setFocusColor,
  setFocusIcon,
  onClose,
  onSaved,
}: {
  focus: DesignFocus;
  idea: ProjectNode | null;
  projectId: string;
  initialColor: string;
  initialIcon: IconKey | null;
  setFocusColor: (focusId: string, color: string | null) => void;
  setFocusIcon: (focusId: string, icon: IconKey | null) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(focus.name);
  const [targetImportance, setTargetImportance] = useState(
    focus.targetImportance,
  );
  const [description, setDescription] = useState(idea?.content ?? "");
  const [color, setColor] = useState(initialColor);
  const [icon, setIcon] = useState<IconKey | null>(initialIcon);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const pillarDescription = findGenreFocusDescription(
    focus.templateSource,
    focus.name,
  );

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
        aria-labelledby="focus-blob-props-title"
        className="w-full max-w-md rounded-[var(--radius)] border border-border bg-panel p-5 shadow-xl"
        onContextMenu={(e) => e.preventDefault()}
      >
        <p
          id="focus-blob-props-title"
          className="font-display text-lg font-semibold"
        >
          Focus properties
        </p>
        <p className="mt-1 text-xs text-muted">
          Edit this Design Focus. Idea text lives on a linked content node.
        </p>

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              const result = await updateFocusElementAction({
                id: focus.id,
                name: name.trim(),
                targetImportance,
                description,
                ideaNodeId: idea?.id ?? null,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setFocusColor(focus.id, color);
              setFocusIcon(focus.id, icon);
              onClose();
              onSaved();
            });
          }}
        >
          <div>
            <Label htmlFor="focus-props-name">Name</Label>
            <Input
              id="focus-props-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="focus-props-color">Color</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="focus-props-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-16 cursor-pointer rounded border border-border bg-panel-elevated"
              />
              {FOCUS_COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Use color ${swatch}`}
                  className="h-6 w-6 rounded-full border border-border"
                  style={{ background: swatch }}
                  onClick={() => setColor(swatch)}
                />
              ))}
              <button
                type="button"
                className="text-xs text-muted hover:text-foreground"
                onClick={() => {
                  setFocusColor(focus.id, null);
                  setColor(defaultFocusColor(focus.id));
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <IconPicker
            id="focus-props-icon"
            value={icon}
            onChange={setIcon}
          />

          <div>
            <div className="mb-1 flex justify-between text-xs text-muted">
              <Label htmlFor="focus-props-importance" className="mb-0">
                Target importance
              </Label>
              <span className="tabular-nums">{targetImportance}</span>
            </div>
            <input
              id="focus-props-importance"
              type="range"
              min={0}
              max={100}
              value={targetImportance}
              onChange={(e) => setTargetImportance(Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <p className="mt-1 text-[11px] leading-snug text-muted">
              {pillarDescription ?? IMPORTANCE_SLIDER_FALLBACK}
            </p>
          </div>

          <div>
            <Label htmlFor="focus-props-desc">Notes / idea</Label>
            <Textarea
              id="focus-props-desc"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Write or refine the idea for this focus…"
            />
          </div>

          <FieldError>{error}</FieldError>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {idea ? (
              <Link
                href={`/projects/${projectId}/nodes/${idea.id}`}
                className="text-xs font-medium text-nav hover:text-nav-hover"
                onClick={onClose}
              >
                Open idea details →
              </Link>
            ) : (
              <span className="text-xs text-muted">
                Save to create a linked Idea node
              </span>
            )}
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
      </div>
    </div>
  );
}
