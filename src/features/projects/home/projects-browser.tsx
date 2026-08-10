"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HomeProjectItem } from "@/features/projects/actions";
import { FavoriteToggle } from "./favorite-toggle";
import { StructurePreview } from "./structure-preview";
import {
  previewBlobLimit,
  type ProjectViewMode,
  viewShowsStructurePreview,
} from "./view-mode";

function projectHref(project: HomeProjectItem) {
  return project.setupCompleted
    ? `/projects/${project.id}/focus`
    : `/projects/${project.id}/setup`;
}

function formatUpdated(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ProjectMark({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[var(--radius)] bg-nav-muted font-bold text-nav",
        className,
      )}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** Shared compact row chrome for list / details create + project items. */
const LIST_ROW =
  "flex w-full items-center gap-2.5 rounded-[var(--radius)] px-2.5 py-1.5 text-sm";

function CreateTile({
  mode,
  className,
}: {
  mode: ProjectViewMode;
  className?: string;
}) {
  const listLike = mode === "list" || mode === "details";
  const contentLike = mode === "content";
  const tilesLike = mode === "tiles";
  const rowLike = listLike || contentLike || tilesLike;

  return (
    <Link
      href="/projects/new"
      className={cn(
        "group border border-dashed border-border-strong bg-panel/40 text-muted transition hover:border-nav hover:bg-nav-muted/40 hover:text-foreground",
        listLike
          ? LIST_ROW
          : rowLike
            ? "flex items-center gap-3 rounded-[var(--radius)] px-3 py-2.5 text-left"
            : "flex flex-col items-center justify-center rounded-[var(--radius)] text-center",
        className,
      )}
    >
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-[var(--radius)] border border-dashed border-border-strong text-nav transition group-hover:border-nav",
          listLike
            ? "h-6 w-6"
            : contentLike
              ? "h-12 w-12"
              : tilesLike
                ? "h-10 w-10"
                : rowLike
                  ? "h-8 w-8"
                  : "mb-3 h-12 w-12",
        )}
      >
        <Plus
          className={
            listLike
              ? "h-3.5 w-3.5"
              : contentLike
                ? "h-5 w-5"
                : rowLike
                  ? "h-4 w-4"
                  : "h-5 w-5"
          }
        />
      </span>
      <span
        className={cn(
          "min-w-0 truncate font-semibold",
          listLike ? "font-medium" : null,
        )}
      >
        Create new project
      </span>
    </Link>
  );
}

function MetaLine({ project }: { project: HomeProjectItem }) {
  return (
    <span className="text-muted">
      {project.type}
      {project.primaryGenre ? ` · ${project.primaryGenre}` : ""}
      {!project.setupCompleted ? " · setup incomplete" : ""}
    </span>
  );
}

function EmptyFilterNotice({ message }: { message: string }) {
  return (
    <li className="col-span-full list-none">
      <p className="rounded-[var(--radius)] border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
        {message}
      </p>
    </li>
  );
}

export function ProjectsBrowser({
  projects,
  mode,
  onFavoriteChange,
  emptyFilterMessage = null,
}: {
  projects: HomeProjectItem[];
  mode: ProjectViewMode;
  onFavoriteChange?: (projectId: string, next: boolean) => void;
  emptyFilterMessage?: string | null;
}) {
  const showPreview = viewShowsStructurePreview(mode);
  const blobLimit = previewBlobLimit(mode);

  if (mode === "details") {
    return (
      <div className="overflow-x-auto rounded-[var(--radius)] border border-border bg-panel">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="w-10 px-2 py-2.5 font-medium" aria-label="Favorite" />
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Type</th>
              <th className="px-3 py-2.5 font-medium">Genre</th>
              <th className="px-3 py-2.5 font-medium">Nodes</th>
              <th className="px-3 py-2.5 font-medium">Focuses</th>
              <th className="px-3 py-2.5 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-panel-elevated">
              <td colSpan={7} className="p-2">
                <CreateTile mode={mode} className="w-full" />
              </td>
            </tr>
            {emptyFilterMessage ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-sm text-muted">
                  {emptyFilterMessage}
                </td>
              </tr>
            ) : null}
            {projects.map((project) => (
              <tr
                key={project.id}
                className="border-b border-border/70 transition hover:bg-panel-elevated"
              >
                <td className="px-2 py-2.5">
                  <FavoriteToggle
                    projectId={project.id}
                    isFavorite={project.isFavorite}
                    onOptimisticChange={(next) =>
                      onFavoriteChange?.(project.id, next)
                    }
                    className="h-7 w-7"
                  />
                </td>
                <td className="px-3 py-2.5">
                  <Link
                    href={projectHref(project)}
                    className="inline-flex items-center gap-2 font-medium hover:text-nav"
                  >
                    <ProjectMark name={project.name} className="h-7 w-7 text-xs" />
                    {project.name}
                    {!project.setupCompleted ? (
                      <span className="text-xs font-normal text-warning">setup</span>
                    ) : null}
                  </Link>
                </td>
                <td className="px-3 py-2.5 text-muted">{project.type}</td>
                <td className="px-3 py-2.5 text-muted">{project.primaryGenre ?? "—"}</td>
                <td className="px-3 py-2.5 text-muted">{project.nodeCount}</td>
                <td className="px-3 py-2.5 text-muted">{project.focusCount}</td>
                <td className="px-3 py-2.5 text-muted">{formatUpdated(project.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (mode === "list") {
    return (
      <ul className="grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
        <li className="min-w-0">
          <CreateTile mode={mode} />
        </li>
        {emptyFilterMessage ? (
          <EmptyFilterNotice message={emptyFilterMessage} />
        ) : null}
        {projects.map((project) => (
          <li key={project.id} className="min-w-0">
            <div
              className={cn(
                LIST_ROW,
                "border border-transparent bg-panel/40 transition hover:border-border hover:bg-panel",
              )}
            >
              <FavoriteToggle
                projectId={project.id}
                isFavorite={project.isFavorite}
                onOptimisticChange={(next) =>
                  onFavoriteChange?.(project.id, next)
                }
                className="h-6 w-6"
              />
              <Link
                href={projectHref(project)}
                className="flex min-w-0 flex-1 items-center gap-2.5"
              >
                <ProjectMark name={project.name} className="h-6 w-6 text-[10px]" />
                <span className="min-w-0 truncate font-medium">{project.name}</span>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (mode === "content") {
    return (
      <ul className="grid gap-2 lg:grid-cols-2">
        <li>
          <CreateTile
            mode={mode}
            className="min-h-[4.5rem] items-center gap-4 px-4 py-3"
          />
        </li>
        {emptyFilterMessage ? (
          <EmptyFilterNotice message={emptyFilterMessage} />
        ) : null}
        {projects.map((project) => (
          <li key={project.id}>
            <div className="surface-card flex min-h-[4.5rem] items-start gap-3 px-4 py-3 transition hover:border-border-strong hover:bg-panel-elevated">
              <FavoriteToggle
                projectId={project.id}
                isFavorite={project.isFavorite}
                onOptimisticChange={(next) =>
                  onFavoriteChange?.(project.id, next)
                }
                className="mt-1 h-8 w-8"
              />
              <Link
                href={projectHref(project)}
                className="flex min-w-0 flex-1 items-start gap-4"
              >
                <ProjectMark name={project.name} className="mt-0.5 h-12 w-12 text-base" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{project.name}</h3>
                    <span className="text-xs text-muted">{formatUpdated(project.updatedAt)}</span>
                  </div>
                  <p className="mt-1 text-sm">
                    <MetaLine project={project} />
                  </p>
                  {project.rootStructure.length > 0 ? (
                    <StructurePreview
                      blobs={project.rootStructure}
                      projectId={project.id}
                      limit={4}
                      size="sm"
                      showLabels
                      className="mt-2"
                    />
                  ) : null}
                </div>
                <div className="shrink-0 text-right text-xs text-muted">
                  <div>{project.nodeCount} nodes</div>
                  <div>{project.focusCount} focuses</div>
                </div>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (mode === "tiles") {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <li>
          <CreateTile mode={mode} className="h-full min-h-[5.5rem]" />
        </li>
        {emptyFilterMessage ? (
          <EmptyFilterNotice message={emptyFilterMessage} />
        ) : null}
        {projects.map((project) => (
          <li key={project.id}>
            <div className="surface-card relative flex h-full items-start gap-3 px-3 py-3 transition hover:border-border-strong hover:bg-panel-elevated">
              <FavoriteToggle
                projectId={project.id}
                isFavorite={project.isFavorite}
                onOptimisticChange={(next) =>
                  onFavoriteChange?.(project.id, next)
                }
                className="absolute right-2 top-2 h-7 w-7"
              />
              <Link
                href={projectHref(project)}
                className="flex min-w-0 flex-1 items-start gap-3 pr-7"
              >
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-[var(--radius)] bg-muted-bg/60 p-1.5">
                  {showPreview && project.rootStructure.length > 0 ? (
                    <StructurePreview
                      blobs={project.rootStructure}
                      projectId={project.id}
                      limit={blobLimit}
                      size="sm"
                      className="justify-center"
                    />
                  ) : (
                    <ProjectMark name={project.name} className="h-10 w-10 text-sm" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{project.name}</h3>
                  <p className="mt-0.5 truncate text-xs">
                    <MetaLine project={project} />
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {project.nodeCount} nodes · {project.focusCount} focuses
                  </p>
                </div>
              </Link>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  const gridClass =
    mode === "extra-large"
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      : mode === "large"
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"
        : mode === "small"
          ? "grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10"
          : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6";

  const cardPad =
    mode === "extra-large"
      ? "p-5 min-h-[14rem]"
      : mode === "large"
        ? "p-4 min-h-[11rem]"
        : mode === "small"
          ? "p-2 min-h-[5.5rem]"
          : "p-3 min-h-[8.5rem]";

  const markSize =
    mode === "extra-large"
      ? "h-14 w-14 text-xl"
      : mode === "large"
        ? "h-12 w-12 text-lg"
        : mode === "small"
          ? "h-8 w-8 text-xs"
          : "h-10 w-10 text-sm";

  return (
    <ul className={cn("grid gap-3", gridClass)}>
      <li>
        <CreateTile
          mode={mode}
          className={cn("h-full", cardPad, mode === "small" ? "min-h-[5.5rem]" : null)}
        />
      </li>
      {emptyFilterMessage ? (
        <EmptyFilterNotice message={emptyFilterMessage} />
      ) : null}
      {projects.map((project) => (
        <li key={project.id}>
          <div
            className={cn(
              "surface-card group relative flex h-full flex-col transition hover:border-border-strong hover:bg-panel-elevated",
              cardPad,
              mode === "small" ? "items-center text-center" : "items-stretch",
            )}
          >
            <FavoriteToggle
              projectId={project.id}
              isFavorite={project.isFavorite}
              onOptimisticChange={(next) =>
                onFavoriteChange?.(project.id, next)
              }
              className={cn(
                "absolute z-10 h-7 w-7",
                mode === "small" ? "right-1 top-1" : "right-2 top-2",
              )}
            />
            <Link
              href={projectHref(project)}
              className={cn(
                "flex h-full min-w-0 flex-col",
                mode === "small" ? "items-center text-center" : "items-stretch",
              )}
            >
              {showPreview ? (
                <div
                  className={cn(
                    "mb-3 flex flex-1 items-center justify-center rounded-[var(--radius)] bg-background/50",
                    mode === "extra-large" ? "min-h-[6.5rem] p-3" : "min-h-[4.5rem] p-2",
                  )}
                >
                  {project.rootStructure.length > 0 ? (
                    <StructurePreview
                      blobs={project.rootStructure}
                      projectId={project.id}
                      limit={blobLimit}
                      size={mode === "extra-large" ? "lg" : "md"}
                      showLabels={mode === "extra-large"}
                      className="justify-center"
                    />
                  ) : (
                    <ProjectMark name={project.name} className={markSize} />
                  )}
                </div>
              ) : (
                <div
                  className={cn(
                    "mb-2 flex",
                    mode === "small" ? "justify-center" : "justify-start",
                  )}
                >
                  <ProjectMark name={project.name} className={markSize} />
                </div>
              )}

              <h3
                className={cn(
                  "truncate font-semibold",
                  mode === "small" ? "text-xs" : "text-sm",
                )}
              >
                {project.name}
              </h3>
              {mode !== "small" ? (
                <>
                  <p className="mt-1 truncate text-xs">
                    <MetaLine project={project} />
                  </p>
                  <p className="mt-auto pt-2 text-xs text-muted">
                    {project.nodeCount} nodes · {project.focusCount} focuses
                  </p>
                </>
              ) : null}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
