"use client";

import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { blurbFromContent, isImageNode } from "@/features/nodes/image-node";
import { useFocusWorkspace } from "./focus-interaction-context";
import { structureFocusHref } from "./structure-href";

/** List view of direct children at the current Structure level. */
export function StructureDetailsPanel({
  focusNodeId,
}: {
  focusNodeId: string | null;
}) {
  const { projectId, nodes, structureLevelFor } = useFocusWorkspace();
  const level = structureLevelFor(focusNodeId);
  const byId = new Map(nodes.map((n) => [n.id, n]));

  if (level.slices.length === 0) {
    return (
      <div className="flex h-full min-h-[18rem] items-center justify-center px-6 text-center">
        <p className="max-w-sm text-sm text-muted">
          No child elements at this level yet. Use Add to create a node, note, or
          image.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[18rem] overflow-y-auto">
      <ul className="space-y-2 p-1 sm:p-2">
        {level.slices.map((slice) => {
          const node = byId.get(slice.id);
          const summary =
            node?.summary?.trim() ||
            blurbFromContent(node?.content, 160) ||
            (isImageNode(node ?? {}) ? "Image" : "No summary yet");
          return (
            <li key={slice.id}>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius)] border border-border/80 bg-panel/80 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={structureFocusHref(projectId, slice.id, "blobs")}
                      className="font-medium text-foreground hover:text-nav"
                    >
                      {slice.name}
                    </Link>
                    {node ? <StatusBadge status={node.status} /> : null}
                    {isImageNode(node ?? {}) ? (
                      <span className="text-[10px] uppercase tracking-wide text-muted">
                        Image
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {summary}
                  </p>
                </div>
                <Link
                  href={`/projects/${projectId}/nodes/${slice.id}`}
                  className="shrink-0 text-xs font-medium text-nav hover:text-nav-hover"
                >
                  Info
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
