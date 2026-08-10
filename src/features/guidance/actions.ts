"use server";

import { prisma } from "@/db/client";
import {
  buildGuidanceOpportunities,
  type GuidanceOpportunity,
} from "./build-guidance";

export async function getProjectGuidance(
  projectId: string,
  focusNodeId?: string | null,
): Promise<GuidanceOpportunity[]> {
  const [nodes, pendingProposals] = await Promise.all([
    prisma.node.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        parentId: true,
        type: true,
        status: true,
        content: true,
        updatedAt: true,
        _count: { select: { children: true } },
      },
      orderBy: [{ updatedAt: "desc" }],
    }),
    prisma.aIAnalysis.findMany({
      where: {
        projectId,
        type: "suggest_child_elements",
        status: "pending",
      },
      select: { id: true, nodeId: true, updatedAt: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 12,
    }),
  ]);

  return buildGuidanceOpportunities({
    projectId,
    focusNodeId,
    nodes: nodes.map((n) => ({
      id: n.id,
      name: n.name,
      parentId: n.parentId,
      type: n.type,
      status: n.status,
      content: n.content,
      updatedAt: n.updatedAt,
      childCount: n._count.children,
    })),
    pendingProposals,
  });
}
