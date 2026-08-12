"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import { useLocale, useT, type MessageKey } from "@/features/i18n";
import { cn } from "@/lib/utils";
import {
  GAME_PHASE_OPTIONS,
  type GamePhase,
  type NodeStatus,
} from "@/types";

type TimelineNode = {
  id: string;
  name: string;
  type: string;
  status: NodeStatus;
  gamePhase: string | null;
  updatedAt: Date | string;
  createdAt: Date | string;
  parentId: string | null;
};

type SortKey = "updatedAt" | "createdAt";
type PhaseFilter = "ALL" | GamePhase;

/** Visible events per expanded day before "Show more". */
const DAY_PREVIEW_LIMIT = 7;

const PHASES = GAME_PHASE_OPTIONS.map((p) => p.value);

const PHASE_LABEL_KEY: Record<GamePhase, MessageKey> = {
  EARLY: "timeline.phaseEarly",
  MID: "timeline.phaseMid",
  LATE: "timeline.phaseLate",
  ENDGAME: "timeline.phaseEnd",
};

const PHASE_STYLE: Record<
  GamePhase,
  { band: string; dot: string; chip: string }
> = {
  EARLY: {
    band: "from-[color-mix(in_oklab,var(--nav)_18%,transparent)] to-transparent",
    dot: "bg-[var(--nav)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--nav)_28%,transparent)]",
    chip: "text-[var(--nav)] bg-[var(--nav-muted)]",
  },
  MID: {
    band: "from-[color-mix(in_oklab,var(--accent)_16%,transparent)] to-transparent",
    dot: "bg-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_28%,transparent)]",
    chip: "text-[var(--accent)] bg-[var(--accent-muted)]",
  },
  LATE: {
    band: "from-[color-mix(in_oklab,var(--warning)_16%,transparent)] to-transparent",
    dot: "bg-[var(--warning)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--warning)_28%,transparent)]",
    chip: "text-[var(--warning)] bg-[color-mix(in_oklab,var(--warning)_16%,transparent)]",
  },
  ENDGAME: {
    band: "from-[color-mix(in_oklab,var(--purple)_18%,transparent)] to-transparent",
    dot: "bg-[var(--purple)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--purple)_28%,transparent)]",
    chip: "text-[var(--purple)] bg-[color-mix(in_oklab,var(--purple)_18%,transparent)]",
  },
};

const STATUS_DOT: Record<NodeStatus, string> = {
  IDEA: "bg-[var(--idea)]",
  DRAFT: "bg-[var(--draft)]",
  IN_PROGRESS: "bg-[var(--in-progress)]",
  REVIEW: "bg-[var(--review)]",
  READY: "bg-[var(--ready)]",
};

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(date: Date, locale: string) {
  return date.toLocaleDateString(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date, locale: string) {
  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}

function isBeforeToday(date: Date, today = new Date()) {
  return dayKey(date) < dayKey(today);
}

type TimelineEntry =
  | { kind: "today"; id: string; at: Date }
  | { kind: "node"; id: string; at: Date; node: TimelineNode };

export function TimelineView({
  projectId,
  nodes,
}: {
  projectId: string;
  nodes: TimelineNode[];
}) {
  const t = useT();
  const locale = useLocale();
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("ALL");
  /** Session overrides: past days default collapsed; today/future default expanded. */
  const [expandedByDay, setExpandedByDay] = useState<Record<string, boolean>>(
    {},
  );
  /** Session overrides: expanded days show first DAY_PREVIEW_LIMIT items by default. */
  const [showAllByDay, setShowAllByDay] = useState<Record<string, boolean>>({});

  const hasPhases = nodes.some((n) => n.gamePhase);

  const phaseCounts = useMemo(() => {
    const counts: Record<GamePhase, number> = {
      EARLY: 0,
      MID: 0,
      LATE: 0,
      ENDGAME: 0,
    };
    for (const n of nodes) {
      if (n.gamePhase && n.gamePhase in counts) {
        counts[n.gamePhase as GamePhase] += 1;
      }
    }
    return counts;
  }, [nodes]);

  const filtered = useMemo(() => {
    if (phaseFilter === "ALL") return nodes;
    return nodes.filter((n) => n.gamePhase === phaseFilter);
  }, [nodes, phaseFilter]);

  const entries = useMemo(() => {
    const sorted = [...filtered].sort(
      (a, b) => toDate(a[sortKey]).getTime() - toDate(b[sortKey]).getTime(),
    );

    const now = new Date();
    const result: TimelineEntry[] = [];
    let todayInserted = false;

    for (const node of sorted) {
      const at = toDate(node[sortKey]);
      if (!todayInserted && at.getTime() > now.getTime()) {
        result.push({ kind: "today", id: "today-marker", at: now });
        todayInserted = true;
      }
      result.push({ kind: "node", id: node.id, at, node });
    }

    if (!todayInserted && sorted.length > 0) {
      result.push({ kind: "today", id: "today-marker", at: now });
    }

    return result;
  }, [filtered, sortKey]);

  const dayGroups = useMemo(() => {
    const groups: {
      key: string;
      label: string;
      date: Date;
      items: TimelineEntry[];
    }[] = [];
    for (const entry of entries) {
      const key = dayKey(entry.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.items.push(entry);
      } else {
        groups.push({
          key,
          label: formatDayLabel(entry.at, locale),
          date: entry.at,
          items: [entry],
        });
      }
    }
    return groups;
  }, [entries, locale]);

  const unphasedCount = nodes.filter((n) => !n.gamePhase).length;

  function isDayExpanded(key: string, date: Date) {
    if (key in expandedByDay) return expandedByDay[key]!;
    return !isBeforeToday(date);
  }

  function toggleDayExpanded(key: string, date: Date) {
    setExpandedByDay((prev) => ({
      ...prev,
      [key]: !isDayExpanded(key, date),
    }));
  }

  function isDayShowingAll(key: string) {
    return Boolean(showAllByDay[key]);
  }

  function toggleDayShowAll(key: string) {
    setShowAllByDay((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-3xl">{t("timeline.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {t("timeline.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex rounded-[var(--radius)] border border-border bg-panel p-0.5"
            role="group"
            aria-label={t("timeline.sortBy")}
          >
            {(
              [
                { key: "updatedAt" as const, label: t("timeline.updated") },
                { key: "createdAt" as const, label: t("timeline.created") },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSortKey(opt.key)}
                className={cn(
                  "rounded-[calc(var(--radius)-2px)] px-3 py-1.5 text-xs font-semibold transition-colors",
                  sortKey === opt.key
                    ? "bg-panel-elevated text-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted tabular-nums">
            {t("timeline.nodesCount", {
              shown: filtered.length,
              total: nodes.length,
            })}
          </p>
        </div>
      </header>

      {hasPhases ? (
        <section
          className="overflow-hidden rounded-[var(--radius)] border border-border bg-panel"
          aria-label={t("timeline.gamePhaseOverview")}
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t("timeline.phaseBands")}
            </p>
            <p className="text-[11px] text-muted">
              {unphasedCount
                ? t("timeline.untagged", { count: unphasedCount })
                : t("timeline.allTagged")}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4">
            {PHASES.map((phase) => {
              const style = PHASE_STYLE[phase];
              const active = phaseFilter === phase;
              return (
                <button
                  key={phase}
                  type="button"
                  onClick={() =>
                    setPhaseFilter((prev) => (prev === phase ? "ALL" : phase))
                  }
                  className={cn(
                    "relative border-border px-3 py-3 text-left transition-colors",
                    "border-t sm:border-t-0 sm:border-l first:border-l-0 first:border-t-0",
                    "bg-gradient-to-b",
                    style.band,
                    active
                      ? "ring-1 ring-inset ring-[color-mix(in_oklab,var(--foreground)_18%,transparent)]"
                      : "hover:bg-panel-elevated",
                  )}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {t(PHASE_LABEL_KEY[phase])}
                  </p>
                  <p className="mt-1 font-display text-2xl tabular-nums">
                    {phaseCounts[phase]}
                  </p>
                </button>
              );
            })}
          </div>
          {phaseFilter !== "ALL" ? (
            <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
              <p className="text-xs text-muted">
                {t("timeline.filteredTo")}{" "}
                <span
                  className={cn(
                    "font-semibold",
                    PHASE_STYLE[phaseFilter].chip,
                    "rounded px-1.5 py-0.5",
                  )}
                >
                  {t(PHASE_LABEL_KEY[phaseFilter])}
                </span>
              </p>
              <button
                type="button"
                onClick={() => setPhaseFilter("ALL")}
                className="text-xs font-semibold text-nav hover:text-nav-hover"
              >
                {t("timeline.clearFilter")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {!nodes.length ? (
        <div className="surface-card px-4 py-10 text-center text-sm text-muted">
          {t("timeline.empty")}
        </div>
      ) : !filtered.length ? (
        <div className="surface-card px-4 py-10 text-center text-sm text-muted">
          {t("timeline.emptyFiltered")}
        </div>
      ) : (
        <div className="relative">
          {/* Axis rail */}
          <div
            aria-hidden
            className="absolute bottom-2 left-[1.15rem] top-2 w-px bg-gradient-to-b from-border via-border-strong to-border sm:left-[7.25rem]"
          />

          <ol className="space-y-8">
            {dayGroups.map((group) => {
              const now = new Date();
              const isToday = isSameDay(group.date, now);
              const expanded = isDayExpanded(group.key, group.date);
              const eventCount = group.items.filter(
                (i) => i.kind === "node",
              ).length;
              const showingAll = isDayShowingAll(group.key);
              const hasOverflow = group.items.length > DAY_PREVIEW_LIMIT;
              const visibleItems =
                expanded && !showingAll && hasOverflow
                  ? group.items.slice(0, DAY_PREVIEW_LIMIT)
                  : group.items;
              const hiddenCount = group.items.length - visibleItems.length;

              return (
                <li key={group.key} className="relative">
                  <div className="mb-3 flex items-center gap-3 sm:gap-4">
                    <div className="hidden w-24 shrink-0 text-right sm:block">
                      <p
                        className={cn(
                          "text-[11px] font-semibold uppercase tracking-wide",
                          isToday ? "text-accent" : "text-muted",
                        )}
                      >
                        {group.date.toLocaleDateString(locale, {
                          month: "short",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-[10px] text-muted">
                        {group.date.getFullYear()}
                      </p>
                    </div>
                    <span
                      aria-hidden
                      className={cn(
                        "relative z-10 mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-background",
                        isToday
                          ? "bg-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_30%,transparent)]"
                          : "bg-border-strong",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => toggleDayExpanded(group.key, group.date)}
                      aria-expanded={expanded}
                      className={cn(
                        "flex min-w-0 flex-1 items-baseline gap-2 text-left transition-colors",
                        "rounded-[var(--radius)] -ml-1 px-1 py-0.5 hover:bg-panel-elevated/60",
                        isToday ? "text-accent" : "text-foreground",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "inline-block w-3 shrink-0 text-[10px] text-muted transition-transform",
                          expanded ? "rotate-90" : "rotate-0",
                        )}
                      >
                        ▸
                      </span>
                      <span className="text-xs font-semibold sm:text-sm">
                        <span className="sm:hidden">{group.label}</span>
                        <span className="hidden sm:inline">
                          {isToday ? t("timeline.today") : group.label}
                        </span>
                        <span className="ml-2 text-[10px] font-normal text-muted">
                          {t("timeline.events", { count: eventCount })}
                          {!expanded ? ` ${t("timeline.collapsed")}` : ""}
                        </span>
                      </span>
                    </button>
                  </div>

                  {expanded ? (
                    <ul className="space-y-3">
                      {visibleItems.map((entry) => {
                        if (entry.kind === "today") {
                          return (
                            <li
                              key={entry.id}
                              className="relative flex items-stretch gap-3 sm:gap-4"
                            >
                              <div className="hidden w-24 shrink-0 sm:block" />
                              <div className="relative z-10 flex w-2.5 shrink-0 justify-center">
                                <span className="mt-2 h-3 w-3 rotate-45 rounded-[2px] bg-accent shadow-[0_0_0_3px_color-mix(in_oklab,var(--accent)_25%,transparent)]" />
                              </div>
                              <div className="flex min-w-0 flex-1 items-center gap-3 py-1">
                                <div className="h-px flex-1 bg-gradient-to-r from-accent/70 to-transparent" />
                                <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">
                                  {t("timeline.today")}
                                </p>
                                <div className="h-px w-8 bg-accent/40" />
                              </div>
                            </li>
                          );
                        }

                        const { node, at } = entry;
                        const phase =
                          (node.gamePhase as GamePhase | null) ?? null;
                        const phaseStyle = phase ? PHASE_STYLE[phase] : null;
                        const isAct = node.type === "ACT";

                        return (
                          <li
                            key={node.id}
                            className="relative flex items-stretch gap-3 sm:gap-4"
                          >
                            <div className="hidden w-24 shrink-0 pt-3 text-right sm:block">
                              <p className="text-[11px] tabular-nums text-muted">
                                {formatTime(at, locale)}
                              </p>
                            </div>

                            <div className="relative z-10 flex w-2.5 shrink-0 justify-center pt-3.5">
                              <span
                                aria-hidden
                                className={cn(
                                  "h-2.5 w-2.5 rounded-full",
                                  isAct
                                    ? "h-3 w-3 rotate-45 rounded-[2px] bg-nav shadow-[0_0_0_3px_var(--nav-muted)]"
                                    : phaseStyle
                                      ? phaseStyle.dot
                                      : cn(
                                          STATUS_DOT[node.status],
                                          "shadow-[0_0_0_3px_color-mix(in_oklab,var(--border-strong)_55%,transparent)]",
                                        ),
                                )}
                              />
                            </div>

                            <article
                              className={cn(
                                "min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-panel px-3 py-3 shadow-[var(--shadow)] transition-colors hover:border-border-strong hover:bg-panel-elevated",
                                phaseStyle && "bg-gradient-to-r",
                                phaseStyle?.band,
                                isAct &&
                                  "border-[color-mix(in_oklab,var(--nav)_45%,var(--border))]",
                              )}
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    {isAct ? (
                                      <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-nav bg-[var(--nav-muted)]">
                                        {t("timeline.milestoneAct")}
                                      </span>
                                    ) : null}
                                    {phaseStyle && phase ? (
                                      <span
                                        className={cn(
                                          "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                          phaseStyle.chip,
                                        )}
                                      >
                                        {t(PHASE_LABEL_KEY[phase])}
                                      </span>
                                    ) : null}
                                    <span className="text-[10px] uppercase tracking-wide text-muted">
                                      {node.type.replaceAll("_", " ")}
                                    </span>
                                    <span className="text-[10px] tabular-nums text-muted sm:hidden">
                                      {formatTime(at, locale)}
                                    </span>
                                  </div>
                                  <Link
                                    href={`/projects/${projectId}/nodes/${node.id}`}
                                    className="mt-1 block font-semibold hover:text-accent"
                                  >
                                    {node.name}
                                  </Link>
                                </div>
                                <StatusBadge status={node.status} />
                              </div>
                              <p className="mt-2 text-[11px] text-muted">
                                {sortKey === "updatedAt"
                                  ? t("timeline.updated")
                                  : t("timeline.created")}{" "}
                                {at.toLocaleString(locale)}
                                {sortKey === "updatedAt" ? (
                                  <>
                                    {" · "}
                                    {t("timeline.created")}{" "}
                                    {toDate(node.createdAt).toLocaleDateString(
                                      locale,
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {" · "}
                                    {t("timeline.updated")}{" "}
                                    {toDate(node.updatedAt).toLocaleDateString(
                                      locale,
                                    )}
                                  </>
                                )}
                              </p>
                            </article>
                          </li>
                        );
                      })}

                      {hasOverflow ? (
                        <li className="relative flex items-stretch gap-3 sm:gap-4">
                          <div className="hidden w-24 shrink-0 sm:block" />
                          <div className="relative z-10 flex w-2.5 shrink-0 justify-center" />
                          <div className="min-w-0 flex-1 pl-0">
                            <button
                              type="button"
                              onClick={() => toggleDayShowAll(group.key)}
                              className="text-xs font-semibold text-nav hover:text-nav-hover"
                            >
                              {showingAll
                                ? t("timeline.showLess")
                                : t("timeline.showMore", {
                                    count: hiddenCount,
                                  })}
                            </button>
                          </div>
                        </li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}
