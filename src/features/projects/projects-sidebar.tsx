import Link from "next/link";
import { cn } from "@/lib/utils";

export type ProjectListItem = {
  id: string;
  name: string;
  type: string;
  setupCompleted: boolean;
  genres: { role: string; genre: { name: string } }[];
  _count: { nodes: number; designFocuses: number };
};

export function ProjectsSidebar({
  projects,
  currentProjectId,
}: {
  projects: ProjectListItem[];
  currentProjectId: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Projects</h2>
          <Link
            href="/projects/new"
            className="rounded-[var(--radius)] px-2 py-1 text-xs font-medium text-nav hover:bg-nav-muted"
          >
            New
          </Link>
        </div>
        <p className="mt-1 text-xs text-muted">Global project navigation</p>
      </div>

      <ul className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-2">
        {projects.map((project) => {
          const active = project.id === currentProjectId;
          const primary = project.genres.find((g) => g.role === "PRIMARY")?.genre;
          const href = project.setupCompleted
            ? `/projects/${project.id}/focus`
            : `/projects/${project.id}/setup`;

          return (
            <li key={project.id}>
              <Link
                href={href}
                className={cn(
                  "flex items-start gap-2.5 rounded-[var(--radius)] px-2.5 py-2.5 transition-colors",
                  active
                    ? "bg-nav-muted text-foreground"
                    : "text-muted hover:bg-muted-bg hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-[11px] font-bold",
                    active ? "bg-nav text-white" : "bg-muted-bg text-nav",
                  )}
                  aria-hidden
                >
                  {project.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {project.name}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px]">
                    {project.type}
                    {primary ? ` · ${primary.name}` : ""}
                    {!project.setupCompleted ? " · setup" : ""}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-border p-3">
        <Link
          href="/"
          className="block rounded-[var(--radius)] px-2 py-1.5 text-xs text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
        >
          All projects
        </Link>
      </div>
    </div>
  );
}
