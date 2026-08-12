import { structureFocusHref } from "@/features/focus-space/structure-href";
import type { MessageKey, TranslateVars } from "@/features/i18n/messages";
import { isNodeContentEmpty } from "@/features/nodes/node-empty";
import type { NodeStatus, NodeType } from "@/types";

export type GuidanceKind =
  | "continue"
  | "fill_in"
  | "review"
  | "continue_structure";

export type GuidanceOpportunity = {
  id: string;
  kind: GuidanceKind;
  title: string;
  softTextKey: MessageKey;
  softTextVars?: TranslateVars;
  href: string;
  nodeId: string | null;
  rank: number;
};

type GuidanceNode = {
  id: string;
  name: string;
  parentId: string | null;
  type: NodeType;
  status: NodeStatus;
  content: string | null;
  updatedAt: Date;
  childCount: number;
};

type PendingProposal = {
  id: string;
  nodeId: string | null;
  updatedAt: Date;
};

const STRUCTURED_PARENT_TYPES = new Set<NodeType>([
  "FOLDER",
  "ACT",
  "SYSTEM",
  "QUEST",
  "LOCATION",
  "FACTION",
]);

function nodeHref(projectId: string, nodeId: string) {
  return `/projects/${projectId}/nodes/${nodeId}`;
}

function structureHref(projectId: string, nodeId: string | null) {
  return structureFocusHref(projectId, nodeId, "blobs");
}

/** Descendants of `rootId` including itself. */
function collectSubtreeIds(
  nodes: GuidanceNode[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string | null, string[]>();
  for (const n of nodes) {
    const key = n.parentId;
    const list = childrenByParent.get(key) ?? [];
    list.push(n.id);
    childrenByParent.set(key, list);
  }
  const ids = new Set<string>([rootId]);
  const walk = (id: string) => {
    for (const childId of childrenByParent.get(id) ?? []) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      walk(childId);
    }
  };
  walk(rootId);
  return ids;
}

type EmptyLeafGroup = {
  parentId: string | null;
  leaves: GuidanceNode[];
  latestUpdate: number;
};

/**
 * Deterministic next-action opportunities for the project Guidance dashboard.
 * No OpenAI — pure signals from stored project data.
 * When `focusNodeId` is set, recommendations are scoped to that Structure subtree.
 */
export function buildGuidanceOpportunities(input: {
  projectId: string;
  nodes: GuidanceNode[];
  pendingProposals: PendingProposal[];
  /** Structure focus node — null/undefined = project-wide. */
  focusNodeId?: string | null;
}): GuidanceOpportunity[] {
  const { projectId, pendingProposals, focusNodeId } = input;
  const allNodes = input.nodes;
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  const scopeIds =
    focusNodeId && byId.has(focusNodeId)
      ? collectSubtreeIds(allNodes, focusNodeId)
      : null;
  const focusNode = focusNodeId ? (byId.get(focusNodeId) ?? null) : null;
  const nodes = scopeIds
    ? allNodes.filter((n) => scopeIds.has(n.id))
    : allNodes;
  const scopedProposals = scopeIds
    ? pendingProposals.filter((p) => p.nodeId != null && scopeIds.has(p.nodeId))
    : pendingProposals;

  const opportunities: GuidanceOpportunity[] = [];
  const seen = new Set<string>();

  const push = (op: GuidanceOpportunity) => {
    if (seen.has(op.id)) return;
    seen.add(op.id);
    opportunities.push(op);
  };

  // 1) Recent draft / in-progress work → Continue
  const recent = [...nodes]
    .filter((n) => n.status === "DRAFT" || n.status === "IN_PROGRESS")
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  for (const n of recent.slice(0, 3)) {
    push({
      id: `continue-${n.id}`,
      kind: "continue",
      title: n.name,
      softTextKey: "guidance.softContinue",
      softTextVars: { name: n.name },
      href: nodeHref(projectId, n.id),
      nodeId: n.id,
      rank: 10 + (n.status === "IN_PROGRESS" ? 0 : 1),
    });
  }

  // 2) Empty leaf notes → one Fill-in card per parent (not per note)
  const emptyLeaves = nodes.filter(
    (n) => isNodeContentEmpty(n.content) && n.childCount === 0,
  );
  const leafGroups = new Map<string | null, EmptyLeafGroup>();
  for (const leaf of emptyLeaves) {
    const key = leaf.parentId;
    const existing = leafGroups.get(key);
    const ts = leaf.updatedAt.getTime();
    if (existing) {
      existing.leaves.push(leaf);
      if (ts > existing.latestUpdate) existing.latestUpdate = ts;
    } else {
      leafGroups.set(key, {
        parentId: key,
        leaves: [leaf],
        latestUpdate: ts,
      });
    }
  }

  const fillParentsHandled = new Set<string>();
  const sortedLeafGroups = [...leafGroups.values()].sort(
    (a, b) => b.latestUpdate - a.latestUpdate,
  );

  for (const group of sortedLeafGroups.slice(0, 6)) {
    const count = group.leaves.length;
    if (group.parentId) {
      const parent = byId.get(group.parentId);
      if (!parent) continue;
      fillParentsHandled.add(parent.id);
      push({
        id: `fill-under-${parent.id}`,
        kind: "fill_in",
        title: parent.name,
        softTextKey: "guidance.softFillInUnder",
        softTextVars: { name: parent.name, count },
        href: structureHref(projectId, parent.id),
        nodeId: parent.id,
        rank: 20,
      });
      continue;
    }

    // Root-level empty leaves → one project / focus-scoped card
    const title = focusNode?.name ?? "Project";
    const targetId = focusNode?.id ?? null;
    push({
      id: targetId ? `fill-under-${targetId}` : "fill-root",
      kind: "fill_in",
      title,
      softTextKey: "guidance.softFillInUnder",
      softTextVars: { name: title, count },
      href: structureHref(projectId, targetId),
      nodeId: targetId,
      rank: 20,
    });
  }

  // Empty containers with no empty leaf children still get a single Fill-in
  const emptyContainers = nodes
    .filter(
      (n) =>
        isNodeContentEmpty(n.content) &&
        n.childCount > 0 &&
        !fillParentsHandled.has(n.id),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  for (const n of emptyContainers.slice(0, 3)) {
    push({
      id: `fill-${n.id}`,
      kind: "fill_in",
      title: n.name,
      softTextKey: "guidance.softFillIn",
      softTextVars: { name: n.name },
      href: structureHref(projectId, n.id),
      nodeId: n.id,
      rank: 21,
    });
  }

  // 3) Pending AI structure proposals → Review
  for (const p of scopedProposals) {
    if (!p.nodeId) continue;
    const n = byId.get(p.nodeId);
    const label = n?.name ?? "a node";
    push({
      id: `review-${p.id}`,
      kind: "review",
      title: label,
      softTextKey: "guidance.softReview",
      softTextVars: { name: label },
      href: nodeHref(projectId, p.nodeId),
      nodeId: p.nodeId,
      rank: 5,
    });
  }

  // 4) Structured / content-rich parents with no children → Continue structure
  const structureParents = nodes
    .filter(
      (n) =>
        n.childCount === 0 &&
        (STRUCTURED_PARENT_TYPES.has(n.type) ||
          (!isNodeContentEmpty(n.content) && n.content!.trim().length >= 40)),
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  for (const n of structureParents.slice(0, 6)) {
    push({
      id: `structure-${n.id}`,
      kind: "continue_structure",
      title: n.name,
      softTextKey: "guidance.softContinueStructure",
      softTextVars: { name: n.name },
      href: structureHref(projectId, n.id),
      nodeId: n.id,
      rank: 15,
    });
  }

  // Soft nudge when scope is empty / almost empty
  if (nodes.length === 0 && !focusNode) {
    push({
      id: "continue-root",
      kind: "continue",
      title: "Project structure",
      softTextKey: "guidance.softExploreStructure",
      href: structureHref(projectId, null),
      nodeId: null,
      rank: 1,
    });
  } else if (focusNode && nodes.length <= 1 && focusNode.childCount === 0) {
    push({
      id: `continue-focus-${focusNode.id}`,
      kind: "continue_structure",
      title: focusNode.name,
      softTextKey: "guidance.softStartStructuring",
      softTextVars: { name: focusNode.name },
      href: structureHref(projectId, focusNode.id),
      nodeId: focusNode.id,
      rank: 2,
    });
  }

  return opportunities.sort(
    (a, b) => a.rank - b.rank || a.title.localeCompare(b.title),
  );
}

export const GUIDANCE_VISIBLE = 3;
