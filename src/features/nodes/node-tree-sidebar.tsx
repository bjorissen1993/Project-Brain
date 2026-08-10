"use client";

import { usePathname } from "next/navigation";
import { NodeTree } from "@/features/nodes/node-tree";
import type { ProjectNode } from "@/types";

export function NodeTreeSidebar({
  projectId,
  nodes,
}: {
  projectId: string;
  nodes: ProjectNode[];
}) {
  const pathname = usePathname();
  const match = pathname?.match(/\/nodes\/([^/]+)/);
  const selectedId = match?.[1];

  return (
    <NodeTree projectId={projectId} nodes={nodes} selectedId={selectedId} />
  );
}
