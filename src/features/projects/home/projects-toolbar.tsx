"use client";

import { Search, Star } from "lucide-react";
import { useT, type MessageKey } from "@/features/i18n";
import { cn } from "@/lib/utils";
import { PROJECT_TYPE_OPTIONS } from "@/types";

export type ProjectListFilter = "all" | "favorites";

export type ProjectTypeFilter = "all" | string;

const TYPE_LABEL_KEYS: Record<string, MessageKey> = {
  GAME: "landing.typeGame",
  SOFTWARE: "landing.typeSoftware",
  APP: "landing.typeApp",
  CREATIVE: "landing.typeCreative",
  OTHER: "landing.typeOther",
  CUSTOM: "landing.typeCustom",
};

export function ProjectsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  typeFilter,
  onTypeFilterChange,
  availableTypes,
  resultCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: ProjectListFilter;
  onFilterChange: (value: ProjectListFilter) => void;
  typeFilter: ProjectTypeFilter;
  onTypeFilterChange: (value: ProjectTypeFilter) => void;
  availableTypes: string[];
  resultCount: number;
  totalCount: number;
}) {
  const t = useT();
  const isFiltered =
    query.trim().length > 0 ||
    filter === "favorites" ||
    typeFilter !== "all";
  const filtered = isFiltered
    ? t("common.of", { count: resultCount, total: totalCount })
    : null;

  function typeLabel(type: string): string {
    const key = TYPE_LABEL_KEYS[type];
    if (key) return t(key);
    return (
      PROJECT_TYPE_OPTIONS.find((opt) => opt.value === type)?.label ?? type
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
      <label className="relative min-w-0 w-full flex-1 sm:min-w-[12rem] sm:max-w-md lg:max-w-xl">
        <span className="sr-only">{t("landing.searchLabel")}</span>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={t("landing.searchPlaceholder")}
          className="min-h-11 w-full rounded-[var(--radius)] border border-border bg-panel py-2 pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-nav focus:ring-2 focus:ring-nav/30 focus-visible:ring-2 focus-visible:ring-nav/30 sm:min-h-0 sm:py-1.5"
        />
      </label>

      <div
        className="inline-flex min-h-11 rounded-[var(--radius)] border border-border/80 bg-panel p-0.5 sm:min-h-0"
        role="group"
        aria-label={t("landing.filterProjects")}
      >
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className={cn(
            "min-h-10 flex-1 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:flex-none sm:px-2.5 sm:py-1",
            filter === "all"
              ? "bg-nav-muted text-nav"
              : "text-muted hover:text-foreground",
          )}
        >
          {t("landing.all")}
        </button>
        <button
          type="button"
          onClick={() => onFilterChange("favorites")}
          className={cn(
            "inline-flex min-h-10 flex-1 items-center justify-center gap-1 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:flex-none sm:px-2.5 sm:py-1",
            filter === "favorites"
              ? "bg-warning/15 text-warning"
              : "text-muted hover:text-foreground",
          )}
        >
          <Star
            className={cn("h-3.5 w-3.5", filter === "favorites" && "fill-current")}
          />
          {t("landing.favorites")}
        </button>
      </div>

      {availableTypes.length > 0 ? (
        <div
          className="flex flex-wrap gap-1 rounded-[var(--radius)] border border-border/80 bg-panel p-1 sm:gap-0.5 sm:p-0.5"
          role="group"
          aria-label={t("landing.filterByType")}
        >
          <button
            type="button"
            onClick={() => onTypeFilterChange("all")}
            className={cn(
              "min-h-10 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:px-2.5 sm:py-1",
              typeFilter === "all"
                ? "bg-nav-muted text-nav"
                : "text-muted hover:text-foreground",
            )}
          >
            {t("landing.allTypes")}
          </button>
          {availableTypes.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => onTypeFilterChange(type)}
              className={cn(
                "min-h-10 rounded-[calc(var(--radius)-2px)] px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:px-2.5 sm:py-1",
                typeFilter === type
                  ? "bg-nav-muted text-nav"
                  : "text-muted hover:text-foreground",
              )}
            >
              {typeLabel(type)}
            </button>
          ))}
        </div>
      ) : null}

      {filtered ? (
        <span className="text-xs text-muted">{filtered}</span>
      ) : null}
    </div>
  );
}
