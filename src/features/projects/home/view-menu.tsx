"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PROJECT_VIEW_LABELS,
  PROJECT_VIEW_MODES,
  type ProjectViewMode,
} from "./view-mode";

function ViewGlyph({ mode, className }: { mode: ProjectViewMode; className?: string }) {
  const common = cn("text-foreground", className);
  switch (mode) {
    case "extra-large":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="2" y="2" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
    case "large":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="3.5" y="3.5" width="9" height="9" rx="1.25" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
    case "medium":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="4.5" y="4.5" width="7" height="7" rx="1" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      );
    case "small":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="2.5" y="2.5" width="4" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <rect x="9.5" y="2.5" width="4" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <rect x="2.5" y="9.5" width="4" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <rect x="9.5" y="9.5" width="4" height="4" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
        </svg>
      );
    case "list":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <path d="M2 4h3M7 4h7M2 8h3M7 8h7M2 12h3M7 12h7" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case "details":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <path d="M2 3.5h12M2 6.5h12M2 9.5h12M2 12.5h12" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        </svg>
      );
    case "tiles":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="2" y="2.5" width="4" height="4" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M8 3.5h6M8 5.5h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
          <rect x="2" y="9.5" width="4" height="4" rx="0.6" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M8 10.5h6M8 12.5h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
        </svg>
      );
    case "content":
      return (
        <svg viewBox="0 0 16 16" className={cn("h-4 w-4", common)} aria-hidden>
          <rect x="2" y="2" width="3.5" height="3.5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M7.5 3h6.5M7.5 4.5h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <rect x="2" y="6.25" width="3.5" height="3.5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M7.5 7.25h6.5M7.5 8.75h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          <rect x="2" y="10.5" width="3.5" height="3.5" rx="0.5" fill="none" stroke="currentColor" strokeWidth="1.1" />
          <path d="M7.5 11.5h6.5M7.5 13h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        </svg>
      );
  }
}

export function ProjectViewMenu({
  value,
  onChange,
}: {
  value: ProjectViewMode;
  onChange: (mode: ProjectViewMode) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-panel px-3 py-1.5 text-sm text-foreground transition hover:border-border-strong hover:bg-panel-elevated"
      >
        <LayoutGrid className="h-4 w-4 text-muted" aria-hidden />
        <span>View</span>
        <span className="hidden text-muted sm:inline">· {PROJECT_VIEW_LABELS[value]}</span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="View"
          className="absolute right-0 z-30 mt-1.5 min-w-[13.5rem] overflow-hidden rounded-[var(--radius)] border border-border-strong bg-[#202020] py-1 shadow-lg"
        >
          {PROJECT_VIEW_MODES.map((mode) => {
            const selected = mode === value;
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => {
                  onChange(mode);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-2.5 py-1.5 text-left text-[13px] text-white transition",
                  selected ? "bg-white/10" : "hover:bg-white/8",
                )}
              >
                <span className="inline-flex w-3.5 shrink-0 justify-center">
                  {selected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
                </span>
                <ViewGlyph mode={mode} />
                <span>{PROJECT_VIEW_LABELS[mode]}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
