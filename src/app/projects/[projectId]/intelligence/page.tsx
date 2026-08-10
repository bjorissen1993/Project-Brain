import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { getIntelligenceOverview } from "@/features/intelligence/actions";
import { IntelligencePanel } from "@/features/intelligence/intelligence-panel";

export default async function IntelligencePage({
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

  const overview = await getIntelligenceOverview(projectId);
  return <IntelligencePanel projectId={projectId} overview={overview} />;
}
