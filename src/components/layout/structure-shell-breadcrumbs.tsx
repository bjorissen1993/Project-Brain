"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useOptionalFocusWorkspace } from "@/features/focus-space";
import {
  parseStructureView,
  structureFocusHref,
  type StructureViewMode,
} from "@/features/focus-space/structure-href";
import { useT } from "@/features/i18n";

type Crumb = { id: string | null; name: string };

/** Max crumbs before collapsing the middle into an ellipsis menu. */
const COLLAPSE_AFTER = 4;
/** Always keep the first crumb + this many trailing crumbs visible when collapsed. */
const TRAILING_VISIBLE = 2;

/**
 * Parse Structure Focus Space routes only (`/focus`, `/focus/[nodeId]`).
 * Returns `undefined` when not on Structure Focus (e.g. Design Focus).
 */
function parseStructureFocusNodeId(
  pathname: string,
  projectId: string,
): string | null | undefined {
  const base = `/projects/${projectId}/focus`;
  if (pathname === base || pathname === `${base}/`) return null;
  if (!pathname.startsWith(`${base}/`)) return undefined;
  const segment = pathname.slice(base.length + 1).split("/")[0];
  if (!segment) return null;
  return segment;
}

function crumbHref(
  projectId: string,
  id: string | null,
  view: StructureViewMode = "blobs",
) {
  return structureFocusHref(projectId, id, view);
}

function CrumbChip({
  href,
  name,
  current,
}: {
  href: string;
  name: string;
  current?: boolean;
}) {
  if (current) {
    return (
      <span
        className="max-w-[10rem] truncate rounded-[var(--radius)] bg-muted-bg px-2 py-0.5 text-sm font-medium text-foreground"
        aria-current="page"
        title={name}
      >
        {name}
      </span>
    );
  }

  return (
    <Link
      href={href}
      className="max-w-[10rem] truncate rounded-[var(--radius)] px-2 py-0.5 text-sm font-medium text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
      title={name}
    >
      {name}
    </Link>
  );
}

function EllipsisMenu({
  projectId,
  crumbs,
  view,
}: {
  projectId: string;
  crumbs: Crumb[];
  view: StructureViewMode;
}) {
  const t = useT();
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
        aria-label={t("structure.hiddenPath")}
        onClick={() => setOpen((v) => !v)}
        className="rounded-[var(--radius)] px-2 py-0.5 text-sm font-medium text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
      >
        …
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-[10rem] max-w-[16rem] rounded-[var(--radius)] border border-border bg-panel-elevated py-1 shadow-lg"
        >
          {crumbs.map((crumb, i) => (
            <Link
              key={`${crumb.id ?? "root"}-hidden-${i}`}
              role="menuitem"
              href={crumbHref(projectId, crumb.id, view)}
              onClick={() => setOpen(false)}
              className="block truncate px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted-bg"
              title={crumb.name}
            >
              {crumb.name}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Primary Structure path next to the brand mark — clickable focus-route crumbs. */
export function StructureShellBreadcrumbs({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const t = useT();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const workspace = useOptionalFocusWorkspace();
  const structureNodeId = parseStructureFocusNodeId(pathname, projectId);
  const view: StructureViewMode = parseStructureView(
    searchParams.get("view"),
  );

  if (structureNodeId === undefined || !workspace) {
    return (
      <>
        <span className="text-border-strong" aria-hidden>
          /
        </span>
        <span className="truncate text-sm font-medium text-foreground">
          {projectName}
        </span>
      </>
    );
  }

  const crumbs = workspace.structureLevelFor(structureNodeId).breadcrumb;
  const collapse = crumbs.length > COLLAPSE_AFTER;
  const head = collapse ? crumbs.slice(0, 1) : [];
  const tail = collapse ? crumbs.slice(-TRAILING_VISIBLE) : [];
  const hidden = collapse
    ? crumbs.slice(1, Math.max(1, crumbs.length - TRAILING_VISIBLE))
    : [];

  return (
    <>
      <span className="text-border-strong" aria-hidden>
        /
      </span>
      <nav
        aria-label={t("structure.structurePath")}
        className="flex min-w-0 items-center gap-0.5 overflow-x-auto scrollbar-thin"
      >
        {collapse ? (
          <>
            {head.map((crumb, i) => (
              <span
                key={`${crumb.id ?? "root"}-${i}`}
                className="flex min-w-0 items-center gap-0.5"
              >
                {i > 0 ? (
                  <span className="text-border-strong" aria-hidden>
                    /
                  </span>
                ) : null}
                <CrumbChip
                  href={crumbHref(projectId, crumb.id, view)}
                  name={crumb.name}
                />
              </span>
            ))}
            <span className="flex items-center gap-0.5">
              <span className="text-border-strong" aria-hidden>
                /
              </span>
              <EllipsisMenu projectId={projectId} crumbs={hidden} view={view} />
            </span>
            {tail.map((crumb, i) => {
              const absoluteIndex = crumbs.length - TRAILING_VISIBLE + i;
              const last = absoluteIndex === crumbs.length - 1;
              return (
                <span
                  key={`${crumb.id ?? "root"}-tail-${i}`}
                  className="flex min-w-0 items-center gap-0.5"
                >
                  <span className="text-border-strong" aria-hidden>
                    /
                  </span>
                  <CrumbChip
                    href={crumbHref(projectId, crumb.id, view)}
                    name={crumb.name}
                    current={last}
                  />
                </span>
              );
            })}
          </>
        ) : (
          crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span
                key={`${crumb.id ?? "root"}-${i}`}
                className="flex min-w-0 items-center gap-0.5"
              >
                {i > 0 ? (
                  <span className="text-border-strong" aria-hidden>
                    /
                  </span>
                ) : null}
                <CrumbChip
                  href={crumbHref(projectId, crumb.id, view)}
                  name={crumb.name}
                  current={last}
                />
              </span>
            );
          })
        )}
      </nav>
    </>
  );
}
