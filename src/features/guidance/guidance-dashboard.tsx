"use client";

import Link from "next/link";
import { useState } from "react";
import { structureFocusHref } from "@/features/focus-space/structure-href";
import { iconKeyForGuidanceKind, PbIcon } from "@/lib/icons";
import {
  GUIDANCE_VISIBLE,
  type GuidanceKind,
  type GuidanceOpportunity,
} from "./build-guidance";
import { guidanceHref } from "./guidance-href";

const KIND_LABEL: Record<GuidanceKind, string> = {
  continue: "Continue",
  fill_in: "Fill in",
  review: "Review",
  continue_structure: "Continue structure",
};

export function GuidanceDashboard({
  projectId,
  projectName,
  opportunities,
  focusNodeId = null,
  focusNodeName = null,
}: {
  projectId: string;
  projectName: string;
  opportunities: GuidanceOpportunity[];
  focusNodeId?: string | null;
  focusNodeName?: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll
    ? opportunities
    : opportunities.slice(0, GUIDANCE_VISIBLE);
  const more = Math.max(0, opportunities.length - GUIDANCE_VISIBLE);
  const scoped = Boolean(focusNodeId && focusNodeName);

  return (
    <div className="relative mx-auto w-full max-w-[1600px] px-6 py-10">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 30% 0%, color-mix(in srgb, var(--nav) 12%, transparent), transparent 70%), radial-gradient(ellipse 50% 40% at 90% 30%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 65%)",
        }}
      />

      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        Guidance
        {scoped ? ` · ${focusNodeName}` : ""}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {scoped ? focusNodeName : projectName}
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {scoped
          ? `Calm next steps for “${focusNodeName}” and what’s nested under it — based on empty notes, drafts, and structure signals in this area.`
          : "A few calm next steps based on where your project already is. Nothing here requires AI — explore at your own pace."}
      </p>

      {scoped ? (
        <p className="mt-3 text-xs text-muted">
          Scoped to this Structure folder.{" "}
          <Link
            href={guidanceHref(projectId)}
            className="font-medium text-nav hover:text-nav-hover"
          >
            View project-wide guidance
          </Link>
        </p>
      ) : null}

      <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visible.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel/70 px-5 py-8 text-sm text-muted sm:col-span-2 xl:col-span-3">
            {scoped
              ? `Nothing pressing in “${focusNodeName}” right now. Explore the Structure workspace when you’re ready.`
              : "You’re in a good place. Explore the full project when you’re ready."}
          </div>
        ) : (
          visible.map((op) => (
            <Link
              key={op.id}
              href={op.href}
              className="group flex h-full min-h-[8.5rem] flex-col gap-3 rounded-[var(--radius)] border border-border bg-panel/85 p-4 shadow-sm transition-colors hover:border-nav/45 hover:bg-nav-muted/30"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] border border-border bg-panel-elevated text-muted transition-colors group-hover:border-nav/35 group-hover:text-nav md:h-12 md:w-12">
                  <PbIcon
                    icon={iconKeyForGuidanceKind(op.kind)}
                    size={28}
                    className="h-5 w-5 md:h-6 md:w-6"
                  />
                </span>
                <span className="rounded-[var(--radius)] border border-border/80 bg-panel-elevated/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {KIND_LABEL[op.kind]}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {op.title}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {op.softText}
                </p>
              </span>
            </Link>
          ))
        )}
      </section>

      {more > 0 && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-4 text-sm font-medium text-nav hover:text-nav-hover"
        >
          View {more} more opportunit{more === 1 ? "y" : "ies"}
        </button>
      ) : null}
      {showAll && more > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="mt-4 text-sm font-medium text-muted hover:text-foreground"
        >
          Show fewer
        </button>
      ) : null}

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={structureFocusHref(projectId, focusNodeId, "blobs")}
          className="inline-flex items-center rounded-[var(--radius)] border border-nav/40 bg-nav-muted px-4 py-2 text-sm font-medium text-nav transition-colors hover:border-nav/60 hover:bg-nav/15"
        >
          {scoped ? `Back to ${focusNodeName}` : "Explore Structure"}
        </Link>
        {!scoped ? (
          <Link
            href={structureFocusHref(projectId, null, "tree")}
            className="inline-flex items-center rounded-[var(--radius)] border border-border bg-panel px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Open tree in Structure
          </Link>
        ) : null}
      </div>
    </div>
  );
}
