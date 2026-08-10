import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { TimelineView } from "@/features/views";

export default async function TimelinePage({
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
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      gamePhase: true,
      updatedAt: true,
      createdAt: true,
      parentId: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return <TimelineView projectId={projectId} nodes={nodes} />;
}
