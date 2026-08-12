import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { GraphView } from "@/features/views";

export default async function GraphPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) notFound();

  const [nodes, relations] = await Promise.all([
    prisma.node.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        parentId: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.nodeRelation.findMany({
      where: { projectId },
      select: {
        id: true,
        sourceNodeId: true,
        targetNodeId: true,
        type: true,
        label: true,
      },
    }),
  ]);

  return (
    <GraphView
      projectId={projectId}
      projectName={project.name}
      nodes={nodes}
      relations={relations}
    />
  );
}
