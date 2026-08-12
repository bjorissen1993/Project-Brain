"use client";

import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/features/i18n";
import type { RelationMode } from "./relation-strength";

const MODE_KEYS: {
  id: RelationMode;
  label: MessageKey;
  title: MessageKey;
}[] = [
  {
    id: "off",
    label: "structure.relOff",
    title: "structure.relOffTitle",
  },
  {
    id: "focused",
    label: "structure.relFocused",
    title: "structure.relFocusedTitle",
  },
  {
    id: "strong",
    label: "structure.relStrong",
    title: "structure.relStrongTitle",
  },
];

/** Compact Off | Focused | Strong control — Structure sidebar under View. */
export function FocusRelationsControl({
  mode,
  onChange,
  className,
}: {
  mode: RelationMode;
  onChange: (mode: RelationMode) => void;
  className?: string;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-[var(--radius)] border border-border bg-panel p-0.5 text-[11px]",
        className,
      )}
      role="group"
      aria-label={t("structure.relationsAria")}
    >
      <span className="px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        {t("structure.relations")}
      </span>
      {MODE_KEYS.map((m) => (
        <button
          key={m.id}
          type="button"
          title={t(m.title)}
          aria-pressed={mode === m.id}
          className={cn(
            "flex-1 rounded-[calc(var(--radius)-2px)] px-1.5 py-1 text-center font-medium transition-colors",
            mode === m.id
              ? "bg-nav-muted text-nav"
              : "text-muted hover:bg-muted-bg hover:text-foreground",
          )}
          onClick={() => onChange(m.id)}
        >
          {t(m.label)}
        </button>
      ))}
    </div>
  );
}
