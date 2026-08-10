"use client";

import { Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type ProjectListFilter = "all" | "favorites";

export function ProjectsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  resultCount,
  totalCount,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  filter: ProjectListFilter;
  onFilterChange: (value: ProjectListFilter) => void;
  resultCount: number;
  totalCount: number;
}) {
  const filtered =
    query.trim().length > 0 || filter === "favorites"
      ? `${resultCount} of ${totalCount}`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[12rem] flex-1 sm:max-w-md lg:max-w-xl">
        <span className="sr-only">Search projects</span>
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search by name…"
          className="w-full rounded-[var(--radius)] border border-border bg-panel py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-nav focus:ring-2 focus:ring-nav/30"
        />
      </label>

      <div
        className="inline-flex rounded-[var(--radius)] border border-border bg-panel p-0.5"
        role="group"
        aria-label="Filter projects"
      >
        <button
          type="button"
          onClick={() => onFilterChange("all")}
          className={cn(
            "rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs font-semibold transition",
            filter === "all"
              ? "bg-nav-muted text-nav"
              : "text-muted hover:text-foreground",
          )}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => onFilterChange("favorites")}
          className={cn(
            "inline-flex items-center gap-1 rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-xs font-semibold transition",
            filter === "favorites"
              ? "bg-warning/15 text-warning"
              : "text-muted hover:text-foreground",
          )}
        >
          <Star
            className={cn("h-3 w-3", filter === "favorites" && "fill-current")}
          />
          Favorites
        </button>
      </div>

      {filtered ? (
        <span className="text-xs text-muted">{filtered}</span>
      ) : null}
    </div>
  );
}
