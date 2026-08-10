import { redirect } from "next/navigation";
import { GuidanceDashboard } from "@/features/guidance";
import { getProjectGuidance } from "@/features/guidance/actions";
import { getProject } from "@/features/projects/actions";
import { prisma } from "@/db/client";

export default async function ProjectIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ nodeId?: string }>;
}) {
  const { projectId } = await params;
  const { nodeId: rawNodeId } = await searchParams;
  const project = await getProject(projectId);
  if (!project) redirect("/");
  if (!project.setupCompleted) {
    redirect(`/projects/${projectId}/setup`);
  }

  const focusNodeId = rawNodeId?.trim() || null;
  let focusNodeName: string | null = null;
  if (focusNodeId) {
    const node = await prisma.node.findFirst({
      where: { id: focusNodeId, projectId },
      select: { id: true, name: true },
    });
    if (node) {
      focusNodeName = node.name;
    }
  }

  const opportunities = await getProjectGuidance(
    projectId,
    focusNodeName ? focusNodeId : null,
  );

  return (
    <GuidanceDashboard
      projectId={project.id}
      projectName={project.name}
      opportunities={opportunities}
      focusNodeId={focusNodeName ? focusNodeId : null}
      focusNodeName={focusNodeName}
    />
  );
}
