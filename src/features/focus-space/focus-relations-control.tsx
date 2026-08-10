"use client";

import { cn } from "@/lib/utils";
import type { RelationMode } from "./relation-strength";

const MODES: { id: RelationMode; label: string; title: string }[] = [
  { id: "off", label: "Off", title: "Hide relation curves" },
  {
    id: "focused",
    label: "Focused",
    title: "Show connections for the hovered blob",
  },
  {
    id: "strong",
    label: "Strong",
    title: "Show only stronger relations",
  },
  {
    id: "all",
    label: "All",
    title: "Show all relations above the visibility threshold",
  },
];

/** Compact Off | Focused | Strong | All control — Structure sidebar under View. */
export function FocusRelationsControl({
  mode,
  onChange,
  className,
}: {
  mode: RelationMode;
  onChange: (mode: RelationMode) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-[var(--radius)] border border-border bg-panel p-0.5 text-[11px]",
        className,
      )}
      role="group"
      aria-label="Relation visibility"
    >
      <span className="px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        Relations
      </span>
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          title={m.title}
          aria-pressed={mode === m.id}
          className={cn(
            "flex-1 rounded-[calc(var(--radius)-2px)] px-1.5 py-1 text-center font-medium transition-colors",
            mode === m.id
              ? "bg-nav-muted text-nav"
              : "text-muted hover:bg-muted-bg hover:text-foreground",
          )}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
