"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/features/i18n";
import type { BalanceFocusNode, BalanceSnapshot } from "./balance-engine";
import {
  readItemsViewMode,
  subscribeItemsViewMode,
  type ItemsViewMode,
} from "./items-view-mode";
import { ItemsViewToggle } from "./items-view-toggle";

function statusColor(status: BalanceFocusNode["status"]) {
  switch (status) {
    case "green":
      return "bg-accent";
    case "orange":
      return "bg-warning";
    case "red":
      return "bg-danger";
    default:
      return "bg-muted";
  }
}

function statusText(status: BalanceFocusNode["status"]) {
  switch (status) {
    case "green":
      return "text-accent";
    case "orange":
      return "text-warning";
    case "red":
      return "text-danger";
    default:
      return "text-muted";
  }
}

const STATUS_LABEL: Record<
  BalanceFocusNode["status"],
  MessageKey
> = {
  green: "balance.green",
  orange: "balance.orange",
  red: "balance.red",
  neutral: "balance.neutral",
};

function BalanceRow({
  node,
  depth,
  expanded,
  onToggle,
  viewMode,
}: {
  node: BalanceFocusNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  viewMode: ItemsViewMode;
}) {
  const t = useT();
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const barActual = Math.min(100, Math.max(0, node.actualWeight));
  const barTarget = Math.min(100, Math.max(0, node.normalizedTargetWeight));
  const isCards = viewMode === "cards";

  const children =
    hasChildren && isOpen
      ? node.children.map((child) => (
          <BalanceRow
            key={child.id}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            viewMode={viewMode}
          />
        ))
      : null;

  return (
    <div className={cn(isCards ? "flex h-full flex-col gap-2" : "space-y-1")}>
      <div
        className={cn(
          "surface-card",
          isCards ? "flex h-full flex-col px-4 py-4 shadow-sm" : "px-3 py-2.5",
        )}
        style={isCards ? undefined : { marginLeft: depth * 12 }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => onToggle(node.id)}
                className="rounded px-1.5 py-0.5 text-xs font-semibold text-muted hover:bg-muted-bg hover:text-foreground"
                aria-expanded={isOpen}
              >
                {isOpen ? "▾" : "▸"}
              </button>
            ) : (
              <span className="w-5" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold">{node.name}</p>
              <p className="text-xs text-muted">
                {isCards
                  ? t("balance.actualTarget", {
                      actual: node.actualWeight,
                      target: node.normalizedTargetWeight,
                    })
                  : t("balance.listMeta", {
                      target: node.normalizedTargetWeight,
                      raw: node.targetImportance,
                      ready: node.contributingNodeCount,
                    })}
              </p>
            </div>
          </div>
          <div className="text-right text-xs">
            <p className={cn("font-semibold uppercase", statusText(node.status))}>
              {t(STATUS_LABEL[node.status])}
            </p>
            <p className="text-muted">{node.directionLabel}</p>
            {!isCards ? (
              <p className="text-muted">
                {t("balance.confidence", { value: node.confidence })}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-muted-bg">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full opacity-90 transition-all",
              statusColor(node.status),
            )}
            style={{ width: `${barActual}%` }}
            title={t("balance.actualPct", { value: node.actualWeight })}
          />
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground/80"
            style={{ left: `calc(${barTarget}% - 1px)` }}
            title={t("balance.normTarget", {
              value: node.normalizedTargetWeight,
            })}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted">
          <span>{t("balance.actualPct", { value: node.actualWeight })}</span>
          <span>
            {isCards
              ? t("balance.confShort", { value: node.confidence })
              : t("balance.normTarget", {
                  value: node.normalizedTargetWeight,
                })}
          </span>
        </div>
      </div>

      {children ? (
        isCards ? (
          <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        ) : (
          children
        )
      ) : null}
    </div>
  );
}

export function BalanceDashboard({
  projectId,
  snapshot,
  aiSlot,
}: {
  projectId: string;
  snapshot: BalanceSnapshot;
  aiSlot?: React.ReactNode;
}) {
  const t = useT();
  const viewMode = useSyncExternalStore(
    subscribeItemsViewMode,
    readItemsViewMode,
    () => "list" as ItemsViewMode,
  );
  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    for (const r of snapshot.roots) set.add(r.id);
    return set;
  }, [snapshot.roots]);
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded);

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{t("balance.title")}</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">
            {t("balance.intro")}
          </p>
        </div>
        <ItemsViewToggle className="shrink-0" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["green", snapshot.summary.green],
            ["orange", snapshot.summary.orange],
            ["red", snapshot.summary.red],
            ["neutral", snapshot.summary.neutral],
          ] as const
        ).map(([key, count]) => (
          <div key={key} className="surface-card px-3 py-3 text-center">
            <p className={cn("text-2xl font-semibold", statusText(key))}>
              {count}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted">
              {t(STATUS_LABEL[key])}
            </p>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted">
        {t("balance.readyNodes", {
          ready: snapshot.readyNodeCount,
          classifications: snapshot.classificationCount,
        })}{" "}
        <Link
          href={`/projects/${projectId}/profile#design-focus`}
          className="text-accent underline"
        >
          {t("balance.editTargets")}
        </Link>
      </p>

      {aiSlot}

      <div
        className={cn(
          snapshot.roots.length === 0
            ? undefined
            : viewMode === "cards"
              ? "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
              : "space-y-2",
        )}
      >
        {snapshot.roots.length === 0 ? (
          <div className="surface-card border-dashed px-4 py-6 text-sm text-muted">
            {t("balance.empty")}
          </div>
        ) : (
          snapshot.roots.map((node) => (
            <BalanceRow
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              onToggle={onToggle}
              viewMode={viewMode}
            />
          ))
        )}
      </div>
    </div>
  );
}
