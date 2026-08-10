"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  structureFocusHref,
  type StructureViewMode,
} from "./structure-href";

/** View: [ Blobs ] [ Tree ] [ Details ] — same Structure workspace location. */
export function StructureViewSwitcher({
  projectId,
  nodeId,
  view,
  className,
}: {
  projectId: string;
  nodeId: string | null;
  view: StructureViewMode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex w-full items-center gap-1 rounded-[var(--radius)] border border-border bg-panel p-0.5 text-xs",
        className,
      )}
      role="group"
      aria-label="Structure view"
    >
      <span className="px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        View
      </span>
      {(
        [
          { id: "blobs" as const, label: "Blobs" },
          { id: "tree" as const, label: "Tree" },
          { id: "details" as const, label: "Details" },
        ] as const
      ).map((opt) => {
        const active = view === opt.id;
        return (
          <Link
            key={opt.id}
            href={structureFocusHref(projectId, nodeId, opt.id)}
            className={cn(
              "flex-1 rounded-[calc(var(--radius)-2px)] px-2 py-1 text-center font-medium transition-colors",
              active
                ? "bg-nav-muted text-nav"
                : "text-muted hover:bg-muted-bg hover:text-foreground",
            )}
            aria-current={active ? "true" : undefined}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
