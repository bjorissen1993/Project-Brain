import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { BoardView } from "@/features/views";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) notFound();

  const nodes = await prisma.node.findMany({
    where: { projectId },
    select: { id: true, name: true, type: true, status: true, parentId: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));

  function parentFolderPath(nodeId: string): string {
    const chain: string[] = [];
    const self = byId.get(nodeId);
    let cur = self?.parentId ? byId.get(self.parentId) : undefined;
    let guard = 0;
    while (cur && guard < 40) {
      chain.push(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      guard += 1;
    }
    chain.reverse();
    // Always a non-empty breadcrumb so Board cards never omit the path row.
    return chain.length > 0 ? chain.join(" / ") : "Project root";
  }

  const boardNodes = nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    status: n.status,
    parentPath: parentFolderPath(n.id),
  }));

  return <BoardView projectId={projectId} nodes={boardNodes} />;
}
