"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { ExternalLink } from "lucide-react";
import { blurbFromContent, isNoteLikeNode } from "@/features/nodes/image-node";
import { cn } from "@/lib/utils";
import type { FocusPieSlice } from "./focus-pie-adapter";

export function isNoteBlobSlice(slice: FocusPieSlice): boolean {
  return isNoteLikeNode({
    type: slice.nodeType,
    customTypeLabel: slice.customTypeLabel,
    content: slice.content,
    hasChildren: slice.hasChildren,
  });
}

/** Inline note body + edit surface — fills the sticky-note shell. */
export function NoteBlobFace({
  slice,
  width,
  height,
  editing,
  draft,
  onDraftChange,
  onCancelEdit,
  onSave,
  onOpen,
  iconSlot,
}: {
  slice: FocusPieSlice;
  width: number;
  height: number;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onCancelEdit: () => void;
  onSave: (value: string) => Promise<{ ok: boolean; error?: string }>;
  onOpen: () => void;
  iconSlot?: ReactNode;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const ignoreBlurRef = useRef(false);
  const savingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const shortSide = Math.min(width, height);
  const compact = shortSide < 140 || height < 130;
  const tight = shortSide < 120 || height < 110;
  const previewMax = height < 130 ? 72 : height < 200 ? 160 : 320;
  const preview = blurbFromContent(slice.content, previewMax);
  const titleClass = tight
    ? "text-[11px]"
    : width < 170
      ? "text-xs"
      : width < 240
        ? "text-sm"
        : "text-base";
  const bodyClass = tight
    ? "text-[9px] leading-[1.45]"
    : width < 180
      ? "text-[10px] leading-[1.5]"
      : "text-[11px] leading-[1.5]";

  useEffect(() => {
    if (!editing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, [editing]);

  const commit = () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      savingRef.current = false;
      if (!result.ok) {
        setError(result.error ?? "Could not save note");
        return;
      }
      ignoreBlurRef.current = true;
      onCancelEdit();
    });
  };

  return (
    <span
      className={cn(
        "focus-note-face relative z-[1] flex h-full w-full min-h-0 min-w-0 flex-col overflow-hidden text-left",
        compact ? "gap-0.5 px-2.5 py-2" : "gap-1 px-3 py-2.5",
      )}
    >
      <span className="relative z-[1] flex shrink-0 items-start gap-1">
        <span className="min-w-0 flex-1">
          {!compact && iconSlot ? (
            <span className="mb-0.5 inline-flex scale-90 origin-top-left">
              {iconSlot}
            </span>
          ) : null}
          <span
            className={cn(
              "block truncate font-display font-semibold leading-snug text-foreground",
              titleClass,
            )}
          >
            {slice.name}
          </span>
          <span className="mt-0.5 block text-[9px] uppercase tracking-wide text-muted/75">
            Note
          </span>
        </span>
        <span
          role="button"
          tabIndex={0}
          data-note-open
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border/50 bg-black/[0.04] text-muted transition-colors hover:border-nav/45 hover:bg-nav-muted hover:text-nav"
          title="Open details"
          aria-label={`Open details for ${slice.name}`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onOpen();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOpen();
            }
          }}
        >
          <ExternalLink size={10} strokeWidth={2.25} aria-hidden />
        </span>
      </span>

      {editing ? (
        <span
          data-note-editor
          className="relative z-[1] mt-0.5 flex min-h-0 flex-1 flex-col overflow-hidden"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={textareaRef}
            value={draft}
            disabled={pending}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") {
                e.preventDefault();
                ignoreBlurRef.current = true;
                onCancelEdit();
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            onBlur={() => {
              if (ignoreBlurRef.current) {
                ignoreBlurRef.current = false;
                return;
              }
              commit();
            }}
            placeholder="Write your note…"
            className={cn(
              "min-h-0 w-full flex-1 resize-none overflow-y-auto bg-transparent px-0 py-0 text-foreground outline-none",
              bodyClass,
            )}
            aria-label={`Edit note ${slice.name}`}
          />
          {error ? (
            <span className="mt-0.5 block shrink-0 text-[9px] text-danger">
              {error}
            </span>
          ) : (
            <span className="mt-0.5 block shrink-0 text-[8px] text-muted/65">
              Blur or ⌘/Ctrl+Enter to save · Esc to cancel
            </span>
          )}
        </span>
      ) : (
        <span
          className={cn(
            "relative z-[1] mt-0.5 min-h-0 flex-1 overflow-y-auto overscroll-contain text-foreground/90",
            bodyClass,
          )}
        >
          {preview ? (
            <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
              {preview}
            </span>
          ) : (
            <span className="block italic text-muted/80">Click to write…</span>
          )}
        </span>
      )}
    </span>
  );
}
