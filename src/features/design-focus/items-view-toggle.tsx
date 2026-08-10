"use client";

import { useSyncExternalStore } from "react";
import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  readItemsViewMode,
  saveItemsViewMode,
  subscribeItemsViewMode,
  type ItemsViewMode,
} from "./items-view-mode";

/** Cards | List switcher — preference stored in localStorage. */
export function ItemsViewToggle({
  className,
  mode: controlledMode,
  onChange,
}: {
  className?: string;
  /** Optional controlled mode; defaults to shared localStorage preference. */
  mode?: ItemsViewMode;
  onChange?: (mode: ItemsViewMode) => void;
}) {
  const stored = useSyncExternalStore(
    subscribeItemsViewMode,
    readItemsViewMode,
    () => "list" as ItemsViewMode,
  );
  const mode = controlledMode ?? stored;

  const setMode = (next: ItemsViewMode) => {
    if (onChange) onChange(next);
    else saveItemsViewMode(next);
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-[var(--radius)] border border-border bg-panel p-0.5",
        className,
      )}
      role="group"
      aria-label="Item display"
    >
      {(
        [
          { id: "list" as const, label: "List", Icon: List },
          { id: "cards" as const, label: "Cards", Icon: LayoutGrid },
        ] as const
      ).map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-nav-muted text-nav"
                : "text-muted hover:text-foreground",
            )}
            aria-pressed={active}
          >
            <Icon size={14} aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
