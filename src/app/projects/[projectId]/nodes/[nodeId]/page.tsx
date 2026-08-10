import { notFound } from "next/navigation";
import { getNodeAnalysisView } from "@/features/analysis/actions";
import { NodeDetail } from "@/features/nodes/node-detail";
import { getNode } from "@/features/nodes/actions";
import { getProject } from "@/features/projects/actions";
import { prisma } from "@/db/client";

export default async function NodePage({
  params,
}: {
  params: Promise<{ projectId: string; nodeId: string }>;
}) {
  const { projectId, nodeId } = await params;
  const [project, node, analysis, classifications] = await Promise.all([
    getProject(projectId),
    getNode(nodeId),
    getNodeAnalysisView(nodeId),
    prisma.nodeClassification.findMany({
      where: { projectId, nodeId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        category: true,
        confidence: true,
        source: true,
      },
      take: 20,
    }),
  ]);

  if (!project || !node || node.projectId !== projectId) notFound();

  const focusNameById = new Map(
    project.designFocuses.map((f) => [f.id, f.name]),
  );

  return (
    <NodeDetail
      projectId={projectId}
      node={{
        id: node.id,
        name: node.name,
        type: node.type,
        customTypeLabel: node.customTypeLabel,
        status: node.status,
        content: node.content,
        summary: node.summary,
        parentId: node.parentId,
        designFocusId: node.designFocusId,
        gamePhase: node.gamePhase,
        childCount: node.children.length,
      }}
      designFocusOptions={project.designFocuses.map((f) => ({
        id: f.id,
        name: f.name,
      }))}
      allNodes={project.nodes.map((n) => ({
        id: n.id,
        name: n.name,
        parentId: n.parentId ?? null,
      }))}
      outgoing={node.sourceRelations.map((rel) => ({
        id: rel.id,
        type: rel.type,
        label: rel.label,
        other: rel.targetNode,
      }))}
      incoming={node.targetRelations.map((rel) => ({
        id: rel.id,
        type: rel.type,
        label: rel.label,
        other: rel.sourceNode,
      }))}
      analysis={analysis}
      childNodes={node.children.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
      }))}
      classifications={classifications.map((c) => ({
        id: c.id,
        category: focusNameById.get(c.category) ?? c.category,
        confidence: c.confidence,
        source: c.source,
      }))}
    />
  );
}
