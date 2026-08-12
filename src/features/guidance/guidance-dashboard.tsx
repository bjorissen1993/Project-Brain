"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { structureFocusHref } from "@/features/focus-space/structure-href";
import { useT, type MessageKey } from "@/features/i18n";
import { iconKeyForGuidanceKind, PbIcon } from "@/lib/icons";
import {
  GUIDANCE_VISIBLE,
  type GuidanceKind,
  type GuidanceOpportunity,
} from "./build-guidance";
import { guidanceHref } from "./guidance-href";

const KIND_KEYS: Record<GuidanceKind, MessageKey> = {
  continue: "guidance.kindContinue",
  fill_in: "guidance.kindFillIn",
  review: "guidance.kindReview",
  continue_structure: "guidance.kindContinueStructure",
};

function OpportunityCard({ op }: { op: GuidanceOpportunity }) {
  const t = useT();
  return (
    <Link
      href={op.href}
      className="group flex h-full min-h-[12rem] flex-col gap-4 rounded-[var(--radius)] border border-border bg-panel/85 p-5 shadow-sm transition-colors hover:border-nav/45 hover:bg-nav-muted/30 md:p-6"
    >
      <span className="flex items-start justify-between gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius)] border border-border bg-panel-elevated text-muted transition-colors group-hover:border-nav/35 group-hover:text-nav md:h-14 md:w-14">
          <PbIcon
            icon={iconKeyForGuidanceKind(op.kind)}
            size={32}
            className="h-6 w-6 md:h-7 md:w-7"
          />
        </span>
        <span className="rounded-[var(--radius)] border border-border/80 bg-panel-elevated/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t(KIND_KEYS[op.kind])}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <p className="text-base font-semibold leading-snug text-foreground">
          {op.title}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {t(op.softTextKey, op.softTextVars)}
        </p>
      </span>
    </Link>
  );
}

function OpportunitiesModal({
  open,
  opportunities,
  onClose,
}: {
  open: boolean;
  opportunities: GuidanceOpportunity[];
  onClose: () => void;
}) {
  const t = useT();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/55 p-3 sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(90dvh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-panel shadow-xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p
              id={titleId}
              className="font-display text-lg font-semibold tracking-tight"
            >
              {t("guidance.allOpportunities")}
            </p>
            <p className="mt-1 text-sm text-muted">
              {t("guidance.suggestionCount", { count: opportunities.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius)] text-muted transition hover:bg-muted-bg hover:text-foreground"
            aria-label={t("common.close")}
          >
            <X size={18} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {opportunities.map((op) => (
              <OpportunityCard key={op.id} op={op} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const t = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const visible = opportunities.slice(0, GUIDANCE_VISIBLE);
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
        {t("guidance.title")}
        {scoped ? ` · ${focusNodeName}` : ""}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {scoped ? focusNodeName : projectName}
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {scoped
          ? t("guidance.introScoped", { name: focusNodeName! })
          : t("guidance.intro")}
      </p>

      {scoped ? (
        <p className="mt-3 text-xs text-muted">
          {t("guidance.scopedHint")}{" "}
          <Link
            href={guidanceHref(projectId)}
            className="font-medium text-nav hover:text-nav-hover"
          >
            {t("guidance.viewProjectWide")}
          </Link>
        </p>
      ) : null}

      <section className="mt-8 grid gap-5 sm:grid-cols-1 lg:grid-cols-3">
        {visible.length === 0 ? (
          <div className="rounded-[var(--radius)] border border-border bg-panel/70 px-5 py-8 text-sm text-muted lg:col-span-3">
            {scoped
              ? t("guidance.emptyScoped", { name: focusNodeName! })
              : t("guidance.empty")}
          </div>
        ) : (
          visible.map((op) => <OpportunityCard key={op.id} op={op} />)
        )}
      </section>

      {more > 0 ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="mt-5 text-sm font-medium text-nav hover:text-nav-hover"
        >
          {t("guidance.viewMore", { count: more })}
        </button>
      ) : null}

      <OpportunitiesModal
        open={modalOpen}
        opportunities={opportunities}
        onClose={() => setModalOpen(false)}
      />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href={structureFocusHref(projectId, focusNodeId, "blobs")}
          className="inline-flex items-center rounded-[var(--radius)] border border-nav/40 bg-nav-muted px-4 py-2 text-sm font-medium text-nav transition-colors hover:border-nav/60 hover:bg-nav/15"
        >
          {scoped
            ? t("guidance.backTo", { name: focusNodeName! })
            : t("guidance.exploreStructure")}
        </Link>
        {!scoped ? (
          <Link
            href={structureFocusHref(projectId, null, "tree")}
            className="inline-flex items-center rounded-[var(--radius)] border border-border bg-panel px-4 py-2 text-sm font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            {t("guidance.openTree")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
