"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_STATUS_OPTIONS, type NodeStatus } from "@/types";

export const STATUS_TRIGGER_STYLE: Record<NodeStatus, string> = {
  IDEA: "border-[var(--idea)] text-[var(--idea)] bg-[color-mix(in_oklab,var(--idea)_14%,transparent)]",
  DRAFT:
    "border-[var(--draft)] text-[var(--draft)] bg-[color-mix(in_oklab,var(--draft)_14%,transparent)]",
  IN_PROGRESS:
    "border-[var(--in-progress)] text-[var(--in-progress)] bg-[color-mix(in_oklab,var(--in-progress)_14%,transparent)]",
  REVIEW:
    "border-[var(--review)] text-[var(--review)] bg-[color-mix(in_oklab,var(--review)_14%,transparent)]",
  READY:
    "border-[var(--ready)] text-[var(--ready)] bg-[color-mix(in_oklab,var(--ready)_14%,transparent)]",
};

const STATUS_OPTION_STYLE: Record<NodeStatus, string> = {
  IDEA: "text-[var(--idea)]",
  DRAFT: "text-[var(--draft)]",
  IN_PROGRESS: "text-[var(--in-progress)]",
  REVIEW: "text-[var(--review)]",
  READY: "text-[var(--ready)]",
};

export const STATUS_DOT: Record<NodeStatus, string> = {
  IDEA: "bg-[var(--idea)]",
  DRAFT: "bg-[var(--draft)]",
  IN_PROGRESS: "bg-[var(--in-progress)]",
  REVIEW: "bg-[var(--review)]",
  READY: "bg-[var(--ready)]",
};

type StatusSelectProps = {
  value?: NodeStatus;
  defaultValue?: NodeStatus;
  onChange?: (status: NodeStatus) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  /** Compact trigger for board cards */
  size?: "default" | "compact";
  "aria-label"?: string;
};

export function StatusSelect({
  value: valueProp,
  defaultValue = "IDEA",
  onChange,
  name,
  id,
  disabled,
  className,
  size = "default",
  "aria-label": ariaLabel = "Status",
}: StatusSelectProps) {
  const [uncontrolled, setUncontrolled] = useState<NodeStatus>(defaultValue);
  const value = valueProp ?? uncontrolled;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const generatedId = useId();
  const triggerId = id ?? generatedId;

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

  const label =
    NODE_STATUS_OPTIONS.find((o) => o.value === value)?.label ?? value;

  function selectStatus(next: NodeStatus) {
    if (valueProp === undefined) setUncontrolled(next);
    onChange?.(next);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block", className)}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <button
        type="button"
        id={triggerId}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex w-full items-center justify-between gap-1.5 rounded-[var(--radius)] border font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-nav/40 disabled:opacity-50",
          size === "compact"
            ? "px-1.5 py-1 text-xs"
            : "min-w-[8.5rem] px-3 py-1.5 text-sm",
          STATUS_TRIGGER_STYLE[value],
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          size={size === "compact" ? 12 : 14}
          className={cn(
            "shrink-0 opacity-80 transition",
            open ? "rotate-180" : null,
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <ul
          id={menuId}
          role="listbox"
          aria-labelledby={triggerId}
          className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-[var(--radius)] border border-border bg-panel-elevated py-1 shadow-lg"
        >
          {NODE_STATUS_OPTIONS.map((opt) => {
            const selected = opt.value === value;
            return (
              <li key={opt.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => selectStatus(opt.value)}
                  className={cn(
                    "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm font-semibold transition-colors",
                    STATUS_OPTION_STYLE[opt.value],
                    selected
                      ? "bg-muted-bg"
                      : "hover:bg-[color-mix(in_oklab,var(--foreground)_6%,transparent)]",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      STATUS_DOT[opt.value],
                    )}
                    aria-hidden
                  />
                  <span className="flex-1">{opt.label}</span>
                  {selected ? (
                    <Check size={14} className="shrink-0 opacity-80" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
