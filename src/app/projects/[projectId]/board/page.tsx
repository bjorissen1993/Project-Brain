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
    select: { id: true, name: true, type: true, status: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return <BoardView projectId={projectId} nodes={nodes} />;
}
