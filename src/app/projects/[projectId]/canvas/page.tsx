import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { CanvasView } from "@/features/views";

export default async function CanvasPage({
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
      posX: true,
      posY: true,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    take: 80,
  });

  return <CanvasView projectId={projectId} nodes={nodes} />;
}
