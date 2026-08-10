import { prisma } from "@/db/client";
import {
  CHAT_CONTEXT_CHILDREN_PER_PARENT,
  CHAT_CONTEXT_SUBTREE_DEPTH,
  CHAT_CONTEXT_SUBTREE_MAX,
  CHAT_PROPOSAL_MAX,
} from "./schema";

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type OutlineNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  parentId: string | null;
  content: string | null;
};

/**
 * Flattened selective subtree under a container (or project root).
 * BFS per level — never loads the entire project tree (important for large
 * polluted projects with thousands of nodes).
 */
export async function loadChatSubtreeOutline(
  projectId: string,
  rootParentId: string | null,
  opts?: {
    maxNodes?: number;
    maxDepth?: number;
    maxChildrenPerParent?: number;
  },
): Promise<OutlineNode[]> {
  const maxNodes = opts?.maxNodes ?? CHAT_CONTEXT_SUBTREE_MAX;
  const maxDepth = opts?.maxDepth ?? CHAT_CONTEXT_SUBTREE_DEPTH;
  const maxChildrenPerParent =
    opts?.maxChildrenPerParent ?? CHAT_CONTEXT_CHILDREN_PER_PARENT;

  const out: OutlineNode[] = [];
  let frontier: (string | null)[] = [rootParentId];

  for (
    let depth = 0;
    depth < maxDepth && frontier.length > 0 && out.length < maxNodes;
    depth++
  ) {
    const remaining = maxNodes - out.length;
    const perParent = Math.max(
      1,
      Math.min(
        maxChildrenPerParent,
        Math.ceil(remaining / Math.max(1, frontier.length)),
      ),
    );

    const childGroups = await Promise.all(
      frontier.map(async (parentId) => {
        const rows = await prisma.node.findMany({
          where: { projectId, parentId },
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            parentId: true,
          },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          take: perParent,
        });
        return rows.map((row) => ({
          ...row,
          // Titles/ids are enough for chat structure; skip heavy content blobs.
          content: null as string | null,
        }));
      }),
    );

    const nextFrontier: string[] = [];
    for (const children of childGroups) {
      for (const child of children) {
        if (out.length >= maxNodes) break;
        out.push(child);
        nextFrontier.push(child.id);
      }
      if (out.length >= maxNodes) break;
    }
    frontier = nextFrontier;
  }

  return out;
}

function formatSubtreeOutline(
  nodes: OutlineNode[],
  rootParentId: string | null,
): string {
  if (!nodes.length) return "(empty subtree)";

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const depthOf = (n: OutlineNode): number => {
    let d = 0;
    let cur: OutlineNode | undefined = n;
    const seen = new Set<string>();
    while (cur?.parentId && cur.parentId !== rootParentId) {
      if (seen.has(cur.id)) break;
      seen.add(cur.id);
      const parent = byId.get(cur.parentId);
      if (!parent) {
        // Parent outside the capped outline — count one extra level.
        d += 1;
        break;
      }
      d += 1;
      cur = parent;
    }
    return d;
  };

  return nodes
    .map((n) => {
      const indent = "  ".repeat(depthOf(n));
      const contentBit = n.content?.trim()
        ? ` — ${truncate(n.content, 80)}`
        : "";
      return `${indent}- [${n.id}] ${n.name} (${n.type}, ${n.status}) parentId=${n.parentId ?? "(root)"}${contentBit}`;
    })
    .join("\n");
}

/**
 * Selective project context for AI chat.
 * Includes intent, name/genres, current Structure container + descendant outline —
 * never a full project dump.
 */
export async function buildProjectChatContext(
  projectId: string,
  opts?: {
    contextNodeId?: string | null;
    focusSummary?: string | null;
    attachedGptText?: string | null;
    attachedGptSource?: string | null;
    attachedGptUrl?: string | null;
  },
): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      type: true,
      genres: {
        select: {
          role: true,
          genre: { select: { name: true } },
        },
      },
    },
  });
  if (!project) return null;

  const [intent, topFocuses, rootNodes] = await Promise.all([
    prisma.projectIntentVersion.findFirst({
      where: { projectId },
      orderBy: { version: "desc" },
      select: { content: true, version: true },
    }),
    prisma.designFocus.findMany({
      where: { projectId, parentId: null },
      select: { id: true, name: true, targetImportance: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 12,
    }),
    prisma.node.findMany({
      where: { projectId, parentId: null },
      select: { id: true, name: true, type: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 16,
    }),
  ]);

  const genres = project.genres
    .map((g) => `${g.genre.name} (${g.role})`)
    .join(", ");

  const sections: string[] = [];
  sections.push(
    `## Project\nname=${project.name}\ntype=${project.type}\ngenres=${genres || "(none)"}`,
  );
  sections.push(
    `## Project intent (effective / latest v${intent?.version ?? "?"})\n${truncate(intent?.content ?? "(no intent set)", 3200)}`,
  );

  if (topFocuses.length) {
    sections.push(
      `## Top design focuses\n${topFocuses
        .map((f) => `- [${f.id}] ${f.name} (target=${f.targetImportance})`)
        .join("\n")}`,
    );
  }

  if (rootNodes.length) {
    sections.push(
      `## Top structure areas (ids for parentNodeId when proposing nodes)\n${rootNodes
        .map((n) => `- [${n.id}] ${n.name} (${n.type})`)
        .join("\n")}`,
    );
  }

  const contextNodeId = opts?.contextNodeId?.trim() || null;
  if (contextNodeId) {
    const contextNode = await prisma.node.findFirst({
      where: { id: contextNodeId, projectId },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        content: true,
        parentId: true,
      },
    });
    if (contextNode) {
      const subtree = await loadChatSubtreeOutline(projectId, contextNode.id);
      const directChildren = subtree.filter((n) => n.parentId === contextNode.id);

      sections.push(
        [
          `## Current Structure context (PRIMARY scope)`,
          `You are chatting inside this container — prefer creating/updating under its subtree.`,
          `node: [${contextNode.id}] ${contextNode.name} (${contextNode.type}, ${contextNode.status})`,
          contextNode.parentId
            ? `parentId=${contextNode.parentId}`
            : "parentId=(root)",
          `content: ${truncate(contextNode.content ?? "(empty)", 1200)}`,
          directChildren.length
            ? `direct children (${directChildren.length}) — EXISTING titles; do NOT propose create_node with the same or near-duplicate names under the same parent:\n${directChildren
                .map(
                  (c) =>
                    `- [${c.id}] ${c.name} (${c.type}, ${c.status})`,
                )
                .join("\n")}`
            : "direct children: (none yet)",
          `Default parentNodeId for new children: ${contextNode.id}`,
          `parentPath names are relative to this container (do not repeat “${contextNode.name}” as the first segment).`,
        ].join("\n"),
      );

      sections.push(
        [
          `## Structure subtree under context (selective; max ${CHAT_CONTEXT_SUBTREE_MAX} nodes, depth ${CHAT_CONTEXT_SUBTREE_DEPTH})`,
          `Use these ids for parentNodeId / parentPathIds / update_node.nodeId. Indent shows nesting.`,
          formatSubtreeOutline(subtree, contextNode.id),
          subtree.length >= CHAT_CONTEXT_SUBTREE_MAX
            ? `(truncated at ${CHAT_CONTEXT_SUBTREE_MAX} nodes — prefer ids from this list; use parentPath for deeper missing folders)`
            : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    }
  } else {
    const subtree = await loadChatSubtreeOutline(projectId, null);
    sections.push(
      [
        `## Current Structure context`,
        `Project root (no container drill-in). You may reshape multi-level structure under the project.`,
        `Default parentNodeId: null (project root) unless you target a listed area.`,
        `parentPath names are relative to the project root.`,
      ].join("\n"),
    );
    sections.push(
      [
        `## Structure subtree (selective; max ${CHAT_CONTEXT_SUBTREE_MAX} nodes, depth ${CHAT_CONTEXT_SUBTREE_DEPTH})`,
        `Use these ids for parentNodeId / parentPathIds / update_node.nodeId. Indent shows nesting.`,
        formatSubtreeOutline(subtree, null),
        subtree.length >= CHAT_CONTEXT_SUBTREE_MAX
          ? `(truncated at ${CHAT_CONTEXT_SUBTREE_MAX} nodes)`
          : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  if (opts?.focusSummary?.trim()) {
    sections.push(
      `## Current Structure / Focus summary (client-selected)\n${truncate(opts.focusSummary, 2000)}`,
    );
  }

  if (opts?.attachedGptText?.trim()) {
    const src = opts.attachedGptSource ?? "unknown";
    const urlBit = opts.attachedGptUrl ? `\nsourceUrl=${opts.attachedGptUrl}` : "";
    sections.push(
      // Truncate for model context; users may paste up to GPT_TRANSCRIPT_MAX_CHARS.
      `## Attached GPT conversation (${src})${urlBit}\nNote: This is user-provided or share-fetched text — not a live private ChatGPT sync.\n${truncate(opts.attachedGptText, 48_000)}`,
    );
  }

  sections.push(
    [
      "## Rules",
      "Creator intent is source of truth. Reply helpfully in plain language.",
      "Scope actions to the current Structure context subtree when set (including deep descendants).",
      "Match suggestions to the current folder purpose and existing node titles/types — do not drift into unrelated domains.",
      "Never propose create_node names that duplicate or near-duplicate an existing sibling under the same intended parent (case-insensitive).",
      "Never invent NPC/character profile structure (Stats, Backstory, Relationships, Quests, Dialogue, Appearance) unless the current context is clearly about characters/NPCs or the creator explicitly asked for that.",
      "For one NPC/character: suggest a concise flat section list directly under that character only (one level). Never nest the same profile template (Stats/Backstory/Relationships/Quests/Dialogue notes/Appearance) inside those sections or inside each other.",
      "If you propose creating/updating structure nodes or design focuses, put them in proposals — never claim they were created/updated. Proposals are advisory until the creator accepts.",
      "Never say “here are proposals/voorstellen” unless the proposals array is non-empty with those items. Empty proposals + teaser text is a bug.",
      "For deep creates: prefer parentNodeId / parentPathIds from the subtree list; or parentPath name segments; or clientKey + parentClientKey for a new tree in one batch.",
    ].join("\n"),
  );

  return sections.join("\n\n");
}

export const CHAT_SYSTEM_PROMPT = `You are Project Brain's project co-pilot for game/software design workspaces.

Respond with a single JSON object:
{
  "reply": "string — your conversational answer to the creator",
  "proposals": [
    {
      "kind": "create_node",
      "name": "string",
      "type": "FOLDER|MECHANIC|CHARACTER|QUEST|LOCATION|STORY_BEAT|SYSTEM|ITEM|FACTION|UI_SCREEN|IDEA|TASK|ACT|CUSTOM",
      "content": "optional short content",
      "parentNodeId": "optional existing node id from context",
      "parentPath": ["optional", "name", "path", "to", "parent"],
      "parentPathIds": ["optional", "id", "path", "ending", "at", "parent"],
      "clientKey": "optional stable temp key for this create (e.g. folder_systems)",
      "parentClientKey": "optional clientKey of another create_node in this batch",
      "sortOrder": 0,
      "reasoning": "optional short why"
    },
    {
      "kind": "update_node",
      "nodeId": "existing node id from context subtree",
      "name": "optional new title",
      "type": "optional NodeType",
      "content": "optional new content",
      "status": "optional IDEA|DRAFT|IN_PROGRESS|REVIEW|READY",
      "reasoning": "optional short why"
    },
    {
      "kind": "create_focus",
      "name": "string",
      "targetImportance": 50,
      "parentFocusId": "optional design focus id",
      "description": "optional",
      "reasoning": "optional"
    }
  ]
}

Rules:
- Always include "reply". Use "proposals" when you concretely suggest creating/updating nodes or focuses (0–${CHAT_PROPOSAL_MAX} items; scale with request complexity; deep multi-level trees may use more).
- CRITICAL: Never write teaser copy like "here are some proposals:" / "hier zijn enkele voorstellen:" unless the "proposals" array contains those items. If you have nothing concrete to propose, say so in reply and set "proposals": [].
- Put every concrete create/update suggestion ONLY in the "proposals" array — never as a markdown/bullet list inside "reply". The UI renders Accept/Reject cards from "proposals", not from reply text.
- Use exact enum strings for "kind" (create_node|update_node|create_focus) and "type" (FOLDER, SYSTEM, … uppercase). Prefer short English node names.
- When a Current Structure context container is set, default parentNodeId to that container id for new children/folders unless the creator names another valid parent from context.
- You MAY create/update nodes deep in the subtree — not only direct children. Prefer parentNodeId or parentPathIds from the Structure subtree list.
- For nested creates in one batch: give parents a clientKey and set children's parentClientKey to that key (parents first via sortOrder). Example: create FOLDER "Resource Systems" with clientKey "rs", then create children with parentClientKey "rs".
- parentPath is a name path from the context root (or project root) to the intended parent. Missing intermediate folders are created on Accept as FOLDER nodes. Do not include the context container's own name as the first segment when chatting inside it.
- update_node must use a nodeId listed in context (context node or any descendant in the subtree outline). Prefer id over guessing by name.
- Suggestions MUST match the current folder's purpose and titles: UI/screens → screens/flows/components; systems/process → mechanics/rules/pipeline; features → software-style sections; characters/NPCs only → personality/appearance/relationships-style slots.
- NEVER invent NPC/character profile structure (Stats, Backstory, Relationships, Quests, Dialogue notes, Appearance) unless the context node or request is clearly about characters/NPCs, or the creator explicitly asked for character profiles.
- For one NPC: propose a concise flat section list under that character only (typically ≤8 direct children). NEVER nest Stats/Backstory/Relationships/Quests/Dialogue notes/Appearance/Personality inside each other or inside other profile sections. Prefer type CHARACTER for the NPC root.
- NEVER propose a create_node that duplicates or near-duplicates an existing sibling under the same parent (see children / subtree listed in Project context). Prefer new useful names only.
- Use FOLDER for grouping structures. Use CHARACTER only for named NPCs/characters — not for systems, UI screens, or process overviews.
- Do not invent ids; only use parentNodeId / parentPathIds / parentFocusId / nodeId from provided context. parentPath uses existing or new folder names (not invented ids).
- Never say you already created or mutated project data.
- Prefer concise, practical design advice grounded in the project intent and current container.
- If an attached GPT conversation is present, use it as background context; do not claim you synced private ChatGPT history.`;
