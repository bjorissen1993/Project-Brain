import { createHash } from "node:crypto";
import { prisma } from "@/db/client";

export type ReadyAnalysisContext = {
  projectId: string;
  nodeId: string;
  isParent: boolean;
  inputHash: string;
  promptUser: string;
  validDesignFocusIds: Set<string>;
  validNodeIds: Set<string>;
  focusNameById: Map<string, string>;
  nodeNameById: Map<string, string>;
};

type FocusRow = {
  id: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
};

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildFocusTreeLines(
  focuses: FocusRow[],
  relevantIds: Set<string>,
): string[] {
  const relevant = focuses.filter((f) => relevantIds.has(f.id));
  const byParent = new Map<string | null, FocusRow[]>();
  for (const f of relevant) {
    const parentIncluded =
      f.parentId != null && relevantIds.has(f.parentId) ? f.parentId : null;
    const list = byParent.get(parentIncluded) ?? [];
    list.push(f);
    byParent.set(parentIncluded, list);
  }

  const lines: string[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const child of byParent.get(parentId) ?? []) {
      lines.push(
        `${"  ".repeat(depth)}- ${child.name} [id=${child.id}] targetImportance=${child.targetImportance}`,
      );
      walk(child.id, depth + 1);
    }
  };
  walk(null, 0);
  return lines;
}

/**
 * Selective Ready-analysis context. Never dumps the entire project.
 * Includes: latest intent, node (+ parent), relevant Design Focus subtree,
 * connected nodes, classification rules, child summaries when parent/folder.
 */
export async function buildReadyAnalysisContext(
  nodeId: string,
): Promise<ReadyAnalysisContext | null> {
  const node = await prisma.node.findUnique({
    where: { id: nodeId },
    include: {
      parent: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          summary: true,
          content: true,
        },
      },
      children: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          summary: true,
          projectImpact: true,
          content: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        take: 40,
      },
      sourceRelations: {
        include: {
          targetNode: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              summary: true,
            },
          },
        },
        take: 20,
      },
      targetRelations: {
        include: {
          sourceNode: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
              summary: true,
            },
          },
        },
        take: 20,
      },
      classifications: {
        where: { source: "user" },
        take: 20,
      },
      designFocus: { select: { id: true, name: true, parentId: true } },
    },
  });

  if (!node) return null;

  const [intent, focuses, rules, siblingSample] = await Promise.all([
    prisma.projectIntentVersion.findFirst({
      where: { projectId: node.projectId },
      orderBy: { version: "desc" },
      select: { content: true, version: true },
    }),
    prisma.designFocus.findMany({
      where: { projectId: node.projectId },
      select: {
        id: true,
        name: true,
        parentId: true,
        targetImportance: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    prisma.projectClassificationRule.findMany({
      where: { projectId: node.projectId, isActive: true },
      select: { id: true, name: true, rule: true },
      take: 30,
    }),
    // Nearby nodes for relation suggestions (not full project dump).
    prisma.node.findMany({
      where: {
        projectId: node.projectId,
        id: { not: node.id },
        OR: [
          { parentId: node.parentId },
          { parentId: node.id },
          ...(node.parentId ? [{ id: node.parentId }] : []),
        ],
      },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        summary: true,
      },
      take: 25,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const focusById = new Map(focuses.map((f) => [f.id, f]));
  const relevantFocusIds = new Set<string>();

  const addFocusWithAncestors = (id: string | null | undefined) => {
    let current = id ?? null;
    while (current) {
      if (relevantFocusIds.has(current)) break;
      relevantFocusIds.add(current);
      current = focusById.get(current)?.parentId ?? null;
    }
  };

  if (node.designFocusId) addFocusWithAncestors(node.designFocusId);
  for (const c of node.classifications) {
    addFocusWithAncestors(c.category);
  }
  // Always include top-level focuses so AI has the project vocabulary.
  for (const f of focuses) {
    if (!f.parentId) relevantFocusIds.add(f.id);
  }
  // Cap subtree: if few focuses, include all; else top-level + assigned lineage.
  if (focuses.length <= 24) {
    for (const f of focuses) relevantFocusIds.add(f.id);
  } else {
    for (const f of focuses) {
      if (f.parentId && relevantFocusIds.has(f.parentId)) {
        relevantFocusIds.add(f.id);
      }
    }
  }

  const isParent =
    node.type === "FOLDER" ||
    node.children.length > 0 ||
    node.type === "ACT";

  const connected = [
    ...node.sourceRelations.map((r) => ({
      direction: "out" as const,
      type: r.type,
      other: r.targetNode,
    })),
    ...node.targetRelations.map((r) => ({
      direction: "in" as const,
      type: r.type,
      other: r.sourceNode,
    })),
  ];

  const candidateNodes = new Map<string, (typeof siblingSample)[number]>();
  for (const n of siblingSample) candidateNodes.set(n.id, n);
  for (const c of connected) {
    candidateNodes.set(c.other.id, {
      id: c.other.id,
      name: c.other.name,
      type: c.other.type,
      status: c.other.status,
      summary: c.other.summary,
    });
  }
  for (const child of node.children) {
    candidateNodes.set(child.id, {
      id: child.id,
      name: child.name,
      type: child.type,
      status: child.status,
      summary: child.summary,
    });
  }

  const validDesignFocusIds = new Set(focuses.map((f) => f.id));
  const projectNodeIds = await prisma.node.findMany({
    where: { projectId: node.projectId },
    select: { id: true, name: true },
  });
  const validNodeIds = new Set(projectNodeIds.map((n) => n.id));
  const nodeNameById = new Map(projectNodeIds.map((n) => [n.id, n.name]));
  const focusNameById = new Map(focuses.map((f) => [f.id, f.name]));

  const sections: string[] = [];

  sections.push(
    `## Project intent (latest v${intent?.version ?? "?"})\n${truncate(intent?.content ?? "(no intent set)", 3500)}`,
  );

  sections.push(
    `## Node under analysis\nid=${node.id}\nname=${node.name}\ntype=${node.type}\nstatus=${node.status}\nprimaryDesignFocusId=${node.designFocusId ?? "none"}\ncontent:\n${truncate(node.content ?? "(empty)", isParent ? 2500 : 6000)}`,
  );

  if (node.parent) {
    sections.push(
      `## Parent node\nid=${node.parent.id}\nname=${node.parent.name}\ntype=${node.parent.type}\nsummary=${truncate(node.parent.summary ?? node.parent.content ?? "(none)", 800)}`,
    );
  }

  if (isParent && node.children.length > 0) {
    const childBlocks = node.children.map((child) => {
      const summary =
        child.summary?.trim() ||
        truncate(child.content ?? "", 400) ||
        "(no summary yet)";
      const impact = child.projectImpact?.trim() || "(none)";
      return `- [${child.id}] ${child.name} (${child.type}, ${child.status})\n  summary: ${truncate(summary, 500)}\n  projectImpact: ${truncate(impact, 300)}`;
    });
    sections.push(
      `## Child nodes (prefer these summaries over full docs)\n${childBlocks.join("\n")}`,
    );

    const childIds = node.children.map((c) => c.id);
    const childClassificationsRaw = await prisma.nodeClassification.findMany({
      where: { nodeId: { in: childIds } },
      select: {
        nodeId: true,
        category: true,
        confidence: true,
        source: true,
        metadata: true,
      },
      take: 80,
    });
    const childClassifications = childClassificationsRaw.filter((c) => {
      const status = (c.metadata as { status?: string } | null)?.status;
      return status !== "rejected";
    });
    if (childClassifications.length) {
      sections.push(
        `## Child classifications\n${childClassifications
          .map((c) => {
            const meta = c.metadata as { weight?: number } | null;
            return `- node=${c.nodeId} focus=${c.category} weight=${meta?.weight ?? "?"} confidence=${c.confidence ?? "?"} source=${c.source}`;
          })
          .join("\n")}`,
      );
    }
  }

  const focusLines = buildFocusTreeLines(focuses, relevantFocusIds);
  sections.push(
    `## Relevant design focuses (use these ids only for classifications)\n${focusLines.join("\n") || "(none)"}`,
  );

  if (connected.length) {
    sections.push(
      `## Existing relations\n${connected
        .map(
          (c) =>
            `- ${c.direction} ${c.type} ↔ [${c.other.id}] ${c.other.name} (${c.other.type}) summary=${truncate(c.other.summary ?? "", 200)}`,
        )
        .join("\n")}`,
    );
  }

  if (candidateNodes.size) {
    sections.push(
      `## Nearby / connected candidate nodes for suggestedRelations\n${[...candidateNodes.values()]
        .map(
          (n) =>
            `- [${n.id}] ${n.name} (${n.type}, ${n.status}) ${n.summary ? `summary=${truncate(n.summary, 160)}` : ""}`,
        )
        .join("\n")}`,
    );
  }

  if (node.classifications.length) {
    sections.push(
      `## Creator classification corrections (always respect / do not contradict)\n${node.classifications
        .map((c) => {
          const meta = c.metadata as {
            weight?: number;
            correctionReason?: string;
            status?: string;
          } | null;
          return `- focus=${c.category} confidence=${c.confidence ?? "?"} weight=${meta?.weight ?? "?"} status=${meta?.status ?? "corrected"} reason=${meta?.correctionReason ?? ""}`;
        })
        .join("\n")}`,
    );
  }

  if (rules.length) {
    sections.push(
      `## Project classification rules\n${rules
        .map((r) => `- ${r.name}: ${truncate(JSON.stringify(r.rule), 400)}`)
        .join("\n")}`,
    );
  }

  const promptUser = sections.join("\n\n");
  const inputHash = createHash("sha256")
    .update(
      [
        intent?.content ?? "",
        node.content ?? "",
        node.name,
        node.status,
        isParent ? "parent" : "leaf",
        [...relevantFocusIds].sort().join(","),
        node.children.map((c) => `${c.id}:${c.summary ?? ""}`).join("|"),
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 32);

  return {
    projectId: node.projectId,
    nodeId: node.id,
    isParent,
    inputHash,
    promptUser,
    validDesignFocusIds,
    validNodeIds,
    focusNameById,
    nodeNameById,
  };
}

export type ProjectIntelligenceContext = {
  projectId: string;
  inputHash: string;
  promptUser: string;
  validDesignFocusIds: Set<string>;
  validNodeIds: Set<string>;
  focusNameById: Map<string, string>;
  nodeNameById: Map<string, string>;
};

type BalanceLine = {
  id: string;
  name: string;
  parentId: string | null;
  targetImportance: number;
  actualWeight: number;
  confidence: number;
  status?: string;
  difference?: number;
  directionLabel?: string;
};

/**
 * Shared selective context for project-level AI (imbalance, improvements,
 * direction checks, full analysis). Never dumps full node documents.
 */
export async function buildProjectIntelligenceContext(
  projectId: string,
  opts?: {
    mode:
      | "imbalance"
      | "improvements"
      | "direction"
      | "full"
      | "quick_reanalysis";
    focusIds?: string[];
    nodeId?: string;
    balanceLines?: BalanceLine[];
    extraNotes?: string;
  },
): Promise<ProjectIntelligenceContext | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (!project) return null;

  const mode = opts?.mode ?? "imbalance";

  const [intent, focuses, rules, readyNodes, recentNodes, relations, phases] =
    await Promise.all([
      prisma.projectIntentVersion.findFirst({
        where: { projectId },
        orderBy: { version: "desc" },
        select: { content: true, version: true },
      }),
      prisma.designFocus.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          parentId: true,
          targetImportance: true,
          actualWeight: true,
          confidence: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.projectClassificationRule.findMany({
        where: { projectId, isActive: true },
        select: { name: true, rule: true },
        take: 40,
      }),
      prisma.node.findMany({
        where: { projectId, status: "READY" },
        select: {
          id: true,
          name: true,
          type: true,
          summary: true,
          projectImpact: true,
          gamePhase: true,
          parentId: true,
        },
        orderBy: { updatedAt: "desc" },
        take: mode === "full" ? 60 : 35,
      }),
      prisma.node.findMany({
        where: { projectId },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
          summary: true,
          gamePhase: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      prisma.nodeRelation.findMany({
        where: { projectId },
        select: {
          sourceNodeId: true,
          targetNodeId: true,
          type: true,
        },
        take: 80,
      }),
      prisma.node.groupBy({
        by: ["gamePhase"],
        where: { projectId, gamePhase: { not: null } },
        _count: { _all: true },
      }),
    ]);

  const focusIds =
    opts?.focusIds && opts.focusIds.length
      ? new Set(opts.focusIds)
      : new Set(focuses.map((f) => f.id));

  const focusLines = focuses
    .filter((f) => focusIds.has(f.id) || !f.parentId)
    .map((f) => {
      const bal = opts?.balanceLines?.find((b) => b.id === f.id);
      const statusBit = bal
        ? ` status=${bal.status ?? "?"} diff=${bal.difference ?? "?"} (${bal.directionLabel ?? ""})`
        : "";
      return `- [${f.id}] ${f.name} parent=${f.parentId ?? "root"} target=${f.targetImportance} actual=${f.actualWeight} confidence=${f.confidence}${statusBit}`;
    });

  const readyBlock = readyNodes.map((n) => {
    return `- [${n.id}] ${n.name} (${n.type}${n.gamePhase ? `, phase=${n.gamePhase}` : ""})\n  summary: ${truncate(n.summary ?? "", 280)}\n  impact: ${truncate(n.projectImpact ?? "", 200)}`;
  });

  const recentBlock = recentNodes.map(
    (n) =>
      `- [${n.id}] ${n.name} (${n.type}, ${n.status}) updated=${n.updatedAt.toISOString()}`,
  );

  const phaseBlock = phases
    .filter((p) => p.gamePhase)
    .map((p) => `- ${p.gamePhase}: ${p._count._all}`)
    .join("\n");

  const sections: string[] = [];
  sections.push(`## Project\nname=${project.name}\nid=${project.id}`);
  sections.push(
    `## Project intent (latest v${intent?.version ?? "?"})\n${truncate(intent?.content ?? "(none)", mode === "full" ? 5000 : 3200)}`,
  );
  sections.push(
    `## Design focuses (selective)\n${focusLines.join("\n") || "(none)"}`,
  );

  if (opts?.balanceLines?.length) {
    sections.push(
      `## Balance snapshot (code-computed; respect intent — do not flag intentional high targets as "too much")\n${opts.balanceLines
        .map(
          (b) =>
            `- [${b.id}] ${b.name}: actual=${b.actualWeight} targetNorm≈${b.targetImportance} status=${b.status} ${b.directionLabel ?? ""}`,
        )
        .join("\n")}`,
    );
  }

  sections.push(
    `## Ready nodes (summaries only)\n${readyBlock.join("\n") || "(none)"}`,
  );
  sections.push(`## Recent nodes\n${recentBlock.join("\n") || "(none)"}`);

  if (phaseBlock) {
    sections.push(`## Game phase distribution\n${phaseBlock}`);
  }

  if (relations.length) {
    sections.push(
      `## Relations (sample)\n${relations
        .slice(0, 40)
        .map((r) => `- ${r.sourceNodeId} -[${r.type}]-> ${r.targetNodeId}`)
        .join("\n")}`,
    );
  }

  if (rules.length) {
    sections.push(
      `## Classification rules\n${rules
        .map((r) => `- ${r.name}: ${truncate(JSON.stringify(r.rule), 350)}`)
        .join("\n")}`,
    );
  }

  if (opts?.nodeId) {
    const node = await prisma.node.findUnique({
      where: { id: opts.nodeId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        summary: true,
        projectImpact: true,
        content: true,
      },
    });
    if (node) {
      sections.push(
        `## Focus node\nid=${node.id}\nname=${node.name}\ntype=${node.type}\nstatus=${node.status}\nsummary=${truncate(node.summary ?? "", 500)}\ncontent=${truncate(node.content ?? "", 1500)}`,
      );
    }
  }

  if (opts?.extraNotes) {
    sections.push(`## Extra notes\n${truncate(opts.extraNotes, 2000)}`);
  }

  sections.push(
    `## Mode\n${mode}\nCreator intent is source of truth. Suggestions are advisory — never auto-apply.`,
  );

  const promptUser = sections.join("\n\n");
  const inputHash = createHash("sha256")
    .update(
      [
        mode,
        intent?.content ?? "",
        focuses.map((f) => `${f.id}:${f.targetImportance}:${f.actualWeight}`).join("|"),
        readyNodes.map((n) => `${n.id}:${n.summary ?? ""}`).join("|"),
        rules.map((r) => r.name).join(","),
        opts?.extraNotes ?? "",
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 32);

  return {
    projectId,
    inputHash,
    promptUser,
    validDesignFocusIds: new Set(focuses.map((f) => f.id)),
    validNodeIds: new Set([
      ...readyNodes.map((n) => n.id),
      ...recentNodes.map((n) => n.id),
    ]),
    focusNameById: new Map(focuses.map((f) => [f.id, f.name])),
    nodeNameById: new Map([
      ...readyNodes.map((n) => [n.id, n.name] as const),
      ...recentNodes.map((n) => [n.id, n.name] as const),
    ]),
  };
}
