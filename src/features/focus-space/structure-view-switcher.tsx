"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT } from "@/features/i18n";
import {
  BLOB_VIEW_MAX_CHILDREN,
  structureFocusHref,
  type StructureViewMode,
} from "./structure-href";

/** View: [ Blobs ] [ Tree ] — Tree includes the details pane (merged Structure view). */
export function StructureViewSwitcher({
  projectId,
  nodeId,
  view,
  blobsDisabled = false,
  blobChildCount,
  className,
}: {
  projectId: string;
  nodeId: string | null;
  view: StructureViewMode;
  /** When true, Blobs cannot be selected (too many direct children at this level). */
  blobsDisabled?: boolean;
  /** Direct child count used in the disabled Blobs tooltip (siblings under focus parent). */
  blobChildCount?: number;
  className?: string;
}) {
  const t = useT();
  const blobsDisabledTitle =
    blobChildCount != null
      ? t("structure.blobsDisabled", {
          count: blobChildCount,
          max: BLOB_VIEW_MAX_CHILDREN,
        })
      : t("structure.blobsDisabledShort", { max: BLOB_VIEW_MAX_CHILDREN });

  const options = [
    { id: "blobs" as const, label: t("structure.blobs") },
    { id: "tree" as const, label: t("structure.tree") },
  ];

  return (
    <div className={cn("space-y-1.5", className)}>
      <div
        className="inline-flex w-full items-center gap-1 rounded-[var(--radius)] border border-border bg-panel p-0.5 text-xs"
        role="group"
        aria-label={t("structure.viewLabel")}
      >
        <span className="px-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("structure.view")}
        </span>
        {options.map((opt) => {
          const active = view === opt.id;
          const disabled = opt.id === "blobs" && blobsDisabled;

          if (disabled) {
            return (
              <span
                key={opt.id}
                role="link"
                aria-disabled="true"
                title={blobsDisabledTitle}
                className={cn(
                  "flex-1 cursor-not-allowed rounded-[calc(var(--radius)-2px)] px-2 py-1 text-center font-medium text-muted/55",
                  active && "bg-muted-bg",
                )}
              >
                {opt.label}
              </span>
            );
          }

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
      {blobsDisabled ? (
        <p className="px-0.5 text-[10px] leading-snug text-muted" role="status">
          {t("structure.blobsDisabledHint", {
            count: blobChildCount ?? "20+",
            max: BLOB_VIEW_MAX_CHILDREN,
          })}
        </p>
      ) : null}
    </div>
  );
}
