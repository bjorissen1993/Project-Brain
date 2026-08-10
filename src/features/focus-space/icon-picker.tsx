"use client";

import { PbIcon, PICKER_ICON_KEYS, type IconKey } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/field";

/** Compact Lucide icon grid for blob / node properties (CORONA-muted). */
export function IconPicker({
  value,
  onChange,
  id = "blob-icon",
  label = "Icon",
  allowClear = true,
}: {
  value: IconKey | null;
  onChange: (icon: IconKey | null) => void;
  id?: string;
  label?: string;
  allowClear?: boolean;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label htmlFor={id} className="mb-0">
          {label}
        </Label>
        {allowClear && value ? (
          <button
            type="button"
            className="text-[11px] text-muted hover:text-foreground"
            onClick={() => onChange(null)}
          >
            Clear custom
          </button>
        ) : null}
      </div>
      <div
        id={id}
        className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto rounded-[var(--radius)] border border-border bg-panel-elevated/40 p-1.5 sm:grid-cols-10"
        role="listbox"
        aria-label={label}
      >
        {PICKER_ICON_KEYS.map((key) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={active}
              aria-label={key}
              title={key}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded border transition",
                active
                  ? "border-nav bg-nav-muted text-nav"
                  : "border-transparent text-muted hover:border-border hover:bg-panel hover:text-foreground",
              )}
              onClick={() => onChange(active ? null : key)}
            >
              <PbIcon icon={key} size={16} />
            </button>
          );
        })}
      </div>
      {value ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          <PbIcon icon={value} size={14} className="text-nav" />
          <span className="capitalize">{value.replace(/-/g, " ")}</span>
        </p>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted">
          Default from name / type when unset.
        </p>
      )}
    </div>
  );
}
