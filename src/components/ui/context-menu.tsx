"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type ContextMenuItem = {
  id: string;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
};

/**
 * Lightweight fixed-position context menu (no external menu dependency).
 */
export function ContextMenu({
  x,
  y,
  items,
  onSelect,
  onClose,
}: {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onPointer = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - pad) {
      left = Math.max(pad, window.innerWidth - rect.width - pad);
    }
    if (top + rect.height > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - rect.height - pad);
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }, [x, y, items]);

  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[80] min-w-[11rem] rounded-[var(--radius)] border border-border bg-panel py-1 shadow-xl"
      style={{ left: x, top: y }}
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.separatorBefore ? (
            <div className="my-1 border-t border-border" role="separator" />
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={cn(
              "flex w-full px-3 py-1.5 text-left text-sm transition-colors",
              item.disabled
                ? "cursor-not-allowed text-muted/50"
                : item.danger
                  ? "text-danger hover:bg-danger/10"
                  : "text-foreground hover:bg-muted-bg",
            )}
            onClick={() => {
              if (item.disabled) return;
              onSelect(item.id);
              onClose();
            }}
          >
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
