export type ProjectExportFormat = "markdown" | "json";

/** Raw project row shape accepted by the export builder (project-scoped query). */
export type ProjectExportSource = {
  id: string;
  name: string;
  type: string;
  customTypeLabel: string | null;
  status: string;
  setupCompleted: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  gameProfile: {
    customGameType: string | null;
    notes: string | null;
  } | null;
  genres: {
    role: string;
    genre: { name: string; slug: string; templateKey: string };
  }[];
  intents: {
    id: string;
    version: number;
    content: string;
    isOriginal: boolean;
    reason: string | null;
    createdAt: Date | string;
  }[];
  designFocuses: {
    id: string;
    name: string;
    parentId: string | null;
    targetImportance: number;
    actualWeight: number;
    confidence: number;
    sortOrder: number;
    isCustom: boolean;
    templateSource: string | null;
  }[];
  nodes: {
    id: string;
    parentId: string | null;
    name: string;
    type: string;
    customTypeLabel: string | null;
    status: string;
    content: string | null;
    summary: string | null;
    projectImpact: string | null;
    designFocusId: string | null;
    gamePhase: string | null;
    sortOrder: number;
  }[];
  classifications: {
    id: string;
    nodeId: string;
    category: string;
    confidence: number | null;
    source: string;
    metadata: unknown;
  }[];
  nodeRelations: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    label: string | null;
    metadata: unknown;
  }[];
  classificationRules: {
    id: string;
    name: string;
    rule: unknown;
    isActive: boolean;
  }[];
  directionChecks: {
    id: string;
    nodeId: string | null;
    intentVersionId: string | null;
    status: string;
    result: unknown;
    createdAt: Date | string;
  }[];
  aiAnalyses: {
    id: string;
    nodeId: string | null;
    type: string;
    model: string | null;
    status: string;
    result: unknown;
    createdAt: Date | string;
  }[];
  improvementSuggestions: {
    id: string;
    nodeId: string | null;
    status: string;
    suggestion: unknown;
    createdAt: Date | string;
  }[];
};

export type ProjectExportPayload = {
  exportedAt: string;
  project: {
    id: string;
    name: string;
    type: string;
    customTypeLabel: string | null;
    status: string;
    setupCompleted: boolean;
    createdAt: string;
    updatedAt: string;
    customGameType: string | null;
    gameProfileNotes: string | null;
    genres: {
      role: string;
      name: string;
      slug: string;
      templateKey: string;
    }[];
  };
  intents: {
    id: string;
    version: number;
    content: string;
    isOriginal: boolean;
    reason: string | null;
    createdAt: string;
  }[];
  designFocuses: {
    id: string;
    name: string;
    parentId: string | null;
    targetImportance: number;
    actualWeight: number;
    confidence: number;
    sortOrder: number;
    isCustom: boolean;
    templateSource: string | null;
  }[];
  nodes: {
    id: string;
    parentId: string | null;
    name: string;
    type: string;
    customTypeLabel: string | null;
    status: string;
    content: string | null;
    summary: string | null;
    projectImpact: string | null;
    designFocusId: string | null;
    gamePhase: string | null;
    sortOrder: number;
  }[];
  classifications: {
    id: string;
    nodeId: string;
    category: string;
    confidence: number | null;
    source: string;
    metadata: unknown;
  }[];
  relations: {
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    type: string;
    label: string | null;
    metadata: unknown;
  }[];
  classificationRules: {
    id: string;
    name: string;
    rule: unknown;
    isActive: boolean;
  }[];
  directionChecks: {
    id: string;
    nodeId: string | null;
    intentVersionId: string | null;
    status: string;
    result: unknown;
    createdAt: string;
  }[];
  aiAnalyses: {
    id: string;
    nodeId: string | null;
    type: string;
    model: string | null;
    status: string;
    resultSummary: string | null;
    createdAt: string;
  }[];
  improvementSuggestions: {
    id: string;
    nodeId: string | null;
    status: string;
    suggestion: unknown;
    createdAt: string;
  }[];
};

type TreeNode<T extends { id: string; parentId: string | null; sortOrder: number }> =
  T & { children: TreeNode<T>[] };

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function pickNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function extractAiResultSummary(result: unknown): string | null {
  const record = asRecord(result);
  if (!record) return null;
  return (
    pickString(record.summary) ??
    pickString(record.question) ??
    pickString(record.notes) ??
    null
  );
}

function buildTree<T extends { id: string; parentId: string | null; sortOrder: number }>(
  rows: T[],
): TreeNode<T>[] {
  const map = new Map<string, TreeNode<T>>();
  for (const row of rows) {
    map.set(row.id, { ...row, children: [] });
  }

  const roots: TreeNode<T>[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: TreeNode<T>[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
    for (const node of nodes) {
      if (node.children.length) sortRecursive(node.children);
    }
  };
  sortRecursive(roots);
  return roots;
}

/** Build a serializable, project-scoped export payload from a full Prisma project row. */
export function buildProjectExportPayload(
  project: ProjectExportSource,
): ProjectExportPayload {
  return {
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      name: project.name,
      type: project.type,
      customTypeLabel: project.customTypeLabel,
      status: project.status,
      setupCompleted: project.setupCompleted,
      createdAt: toIso(project.createdAt),
      updatedAt: toIso(project.updatedAt),
      customGameType: project.gameProfile?.customGameType ?? null,
      gameProfileNotes: project.gameProfile?.notes ?? null,
      genres: project.genres
        .slice()
        .sort((a, b) => a.role.localeCompare(b.role))
        .map((row) => ({
          role: row.role,
          name: row.genre.name,
          slug: row.genre.slug,
          templateKey: row.genre.templateKey,
        })),
    },
    intents: project.intents
      .slice()
      .sort((a, b) => a.version - b.version)
      .map((intent) => ({
        id: intent.id,
        version: intent.version,
        content: intent.content,
        isOriginal: intent.isOriginal,
        reason: intent.reason,
        createdAt: toIso(intent.createdAt),
      })),
    designFocuses: project.designFocuses
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )
      .map((focus) => ({
        id: focus.id,
        name: focus.name,
        parentId: focus.parentId,
        targetImportance: focus.targetImportance,
        actualWeight: focus.actualWeight,
        confidence: focus.confidence,
        sortOrder: focus.sortOrder,
        isCustom: focus.isCustom,
        templateSource: focus.templateSource,
      })),
    nodes: project.nodes
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )
      .map((node) => ({
        id: node.id,
        parentId: node.parentId,
        name: node.name,
        type: node.type,
        customTypeLabel: node.customTypeLabel,
        status: node.status,
        content: node.content,
        summary: node.summary,
        projectImpact: node.projectImpact,
        designFocusId: node.designFocusId,
        gamePhase: node.gamePhase,
        sortOrder: node.sortOrder,
      })),
    classifications: project.classifications.map((row) => ({
      id: row.id,
      nodeId: row.nodeId,
      category: row.category,
      confidence: row.confidence,
      source: row.source,
      metadata: row.metadata,
    })),
    relations: project.nodeRelations.map((row) => ({
      id: row.id,
      sourceNodeId: row.sourceNodeId,
      targetNodeId: row.targetNodeId,
      type: row.type,
      label: row.label,
      metadata: row.metadata,
    })),
    classificationRules: project.classificationRules.map((row) => ({
      id: row.id,
      name: row.name,
      rule: row.rule,
      isActive: row.isActive,
    })),
    directionChecks: project.directionChecks
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        intentVersionId: row.intentVersionId,
        status: row.status,
        result: row.result,
        createdAt: toIso(row.createdAt),
      })),
    aiAnalyses: project.aiAnalyses
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        type: row.type,
        model: row.model,
        status: row.status,
        resultSummary: extractAiResultSummary(row.result),
        createdAt: toIso(row.createdAt),
      })),
    improvementSuggestions: project.improvementSuggestions
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((row) => ({
        id: row.id,
        nodeId: row.nodeId,
        status: row.status,
        suggestion: row.suggestion,
        createdAt: toIso(row.createdAt),
      })),
  };
}

export function slugifyForFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "project";
}

export function projectExportFilename(
  projectName: string,
  format: ProjectExportFormat,
  exportedAt = new Date(),
): string {
  const date = exportedAt.toISOString().slice(0, 10);
  const ext = format === "json" ? "json" : "md";
  return `${slugifyForFilename(projectName)}-export-${date}.${ext}`;
}

function escapeMd(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function indentBlock(text: string, prefix = "> "): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function formatGenreLine(
  genres: ProjectExportPayload["project"]["genres"],
): string {
  if (!genres.length) return "_None_";
  const primary = genres.filter((g) => g.role === "PRIMARY").map((g) => g.name);
  const secondary = genres
    .filter((g) => g.role === "SECONDARY")
    .map((g) => g.name);
  const parts: string[] = [];
  if (primary.length) parts.push(`Primary: ${primary.join(", ")}`);
  if (secondary.length) parts.push(`Secondary: ${secondary.join(", ")}`);
  return parts.join(" · ") || genres.map((g) => g.name).join(", ");
}

function formatFocusTreeMarkdown(
  focuses: ProjectExportPayload["designFocuses"],
): string {
  if (!focuses.length) return "_No design focuses recorded._";

  const tree = buildTree(focuses);
  const lines: string[] = [];

  const walk = (nodes: typeof tree, depth: number) => {
    for (const focus of nodes) {
      const pad = "  ".repeat(depth);
      const custom = focus.isCustom ? ", custom" : "";
      const source = focus.templateSource
        ? `, template=${focus.templateSource}`
        : "";
      lines.push(
        `${pad}- **${focus.name}** — targetImportance: ${focus.targetImportance}, actualWeight: ${focus.actualWeight}, confidence: ${focus.confidence}${custom}${source}`,
      );
      if (focus.children.length) walk(focus.children, depth + 1);
    }
  };
  walk(tree, 0);
  return lines.join("\n");
}

function formatNodeTreeMarkdown(
  payload: ProjectExportPayload,
): string {
  const { nodes, designFocuses } = payload;
  if (!nodes.length) return "_No structure nodes recorded._";

  const focusNameById = new Map(designFocuses.map((f) => [f.id, f.name]));
  const tree = buildTree(nodes);
  const sections: string[] = [];

  const walk = (nodeList: typeof tree, depth: number) => {
    for (const node of nodeList) {
      const headingLevel = Math.min(6, 3 + depth);
      const hashes = "#".repeat(headingLevel);
      const typeLabel = node.customTypeLabel
        ? `${node.type} / ${node.customTypeLabel}`
        : node.type;
      const phase = node.gamePhase ? `, phase=${node.gamePhase}` : "";
      const focus =
        node.designFocusId && focusNameById.has(node.designFocusId)
          ? `, focus=${focusNameById.get(node.designFocusId)}`
          : "";

      sections.push(
        `${hashes} ${node.name}\n\n_${typeLabel} · ${node.status}${phase}${focus}_`,
      );

      if (node.content?.trim()) {
        sections.push(`**Content**\n\n${escapeMd(node.content.trim())}`);
      }
      if (node.summary?.trim()) {
        sections.push(`**Summary**\n\n${escapeMd(node.summary.trim())}`);
      }
      if (node.projectImpact?.trim()) {
        sections.push(
          `**Project impact**\n\n${escapeMd(node.projectImpact.trim())}`,
        );
      }

      if (node.children.length) walk(node.children, depth + 1);
    }
  };

  walk(tree, 0);
  return sections.join("\n\n");
}

function formatClassificationsMarkdown(
  payload: ProjectExportPayload,
): string {
  const { classifications, nodes, designFocuses } = payload;
  if (!classifications.length) return "_No classifications recorded._";

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));
  const focusNameById = new Map(designFocuses.map((f) => [f.id, f.name]));

  const byNode = new Map<string, typeof classifications>();
  for (const row of classifications) {
    const list = byNode.get(row.nodeId) ?? [];
    list.push(row);
    byNode.set(row.nodeId, list);
  }

  const lines: string[] = [];
  for (const [nodeId, rows] of byNode) {
    const nodeName = nodeNameById.get(nodeId) ?? nodeId;
    lines.push(`### ${nodeName}`);
    for (const row of rows) {
      const meta = asRecord(row.metadata);
      const focusId =
        pickString(meta?.designFocusId) ??
        (focusNameById.has(row.category) ? row.category : null);
      const focusName =
        pickString(meta?.focusName) ??
        (focusId ? focusNameById.get(focusId) : null) ??
        (focusNameById.get(row.category) ?? row.category);
      const weight = pickNumber(meta?.weight);
      const status = pickString(meta?.status);
      const conf =
        row.confidence != null ? `${Math.round(row.confidence)}%` : "—";
      const weightBit = weight != null ? `, weight=${Math.round(weight)}%` : "";
      const statusBit = status ? `, status=${status}` : "";
      lines.push(
        `- **${focusName}** — confidence=${conf}${weightBit}${statusBit} (source=${row.source})`,
      );
      const reasoning = pickString(meta?.reasoning);
      if (reasoning) lines.push(`  - ${reasoning}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

function formatRelationsMarkdown(payload: ProjectExportPayload): string {
  const { relations, nodes } = payload;
  if (!relations.length) return "_No relations recorded._";

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));
  return relations
    .map((rel) => {
      const source = nodeNameById.get(rel.sourceNodeId) ?? rel.sourceNodeId;
      const target = nodeNameById.get(rel.targetNodeId) ?? rel.targetNodeId;
      const label = rel.label ? ` — ${rel.label}` : "";
      return `- **${source}** → **${target}** (${rel.type})${label}`;
    })
    .join("\n");
}

function formatRulesMarkdown(
  rules: ProjectExportPayload["classificationRules"],
): string {
  if (!rules.length) return "_No classification rules recorded._";
  return rules
    .map((rule) => {
      const active = rule.isActive ? "active" : "inactive";
      const body = JSON.stringify(rule.rule, null, 2);
      return `### ${rule.name} (${active})\n\n\`\`\`json\n${body}\n\`\`\``;
    })
    .join("\n\n");
}

function formatDirectionChecksMarkdown(
  payload: ProjectExportPayload,
): string {
  const { directionChecks, nodes, intents } = payload;
  if (!directionChecks.length) return "_No direction checks recorded._";

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));
  const intentById = new Map(intents.map((i) => [i.id, i]));

  return directionChecks
    .map((check) => {
      const nodeLabel = check.nodeId
        ? nodeNameById.get(check.nodeId) ?? check.nodeId
        : "project";
      const intent = check.intentVersionId
        ? intentById.get(check.intentVersionId)
        : null;
      const intentBit = intent ? `, intent v${intent.version}` : "";
      const result = asRecord(check.result);
      const lines = [
        `### ${nodeLabel} — ${check.status}${intentBit}`,
        `_Checked ${check.createdAt}_`,
      ];
      if (result) {
        if (typeof result.aligned === "boolean") {
          lines.push(`Aligned: ${result.aligned ? "yes" : "no"}`);
        }
        const question = pickString(result.question);
        if (question) lines.push(`**Question:** ${question}`);
        const observations = Array.isArray(result.observations)
          ? result.observations.filter(
              (o): o is string => typeof o === "string" && !!o.trim(),
            )
          : [];
        if (observations.length) {
          lines.push("**Observations:**");
          for (const obs of observations) lines.push(`- ${obs}`);
        }
        const notes = Array.isArray(result.notes)
          ? result.notes.filter(
              (n): n is string => typeof n === "string" && !!n.trim(),
            )
          : [];
        if (notes.length) {
          lines.push("**Notes:**");
          for (const note of notes) lines.push(`- ${note}`);
        }
        const drift = Array.isArray(result.driftSignals)
          ? result.driftSignals
          : [];
        if (drift.length) {
          lines.push("**Drift signals:**");
          for (const signal of drift) {
            const rec = asRecord(signal);
            if (!rec) continue;
            const type = pickString(rec.type) ?? "other";
            const description = pickString(rec.description) ?? "";
            lines.push(`- (${type}) ${description}`);
          }
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

function formatAiAnalysesMarkdown(
  payload: ProjectExportPayload,
): string {
  const { aiAnalyses, nodes } = payload;
  if (!aiAnalyses.length) return "_No AI analyses recorded._";

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));
  // Condensed: keep newest per type+node, cap list for readability.
  const seen = new Set<string>();
  const condensed: typeof aiAnalyses = [];
  for (const row of aiAnalyses) {
    const key = `${row.type}:${row.nodeId ?? "project"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    condensed.push(row);
    if (condensed.length >= 40) break;
  }

  return condensed
    .map((row) => {
      const scope = row.nodeId
        ? nodeNameById.get(row.nodeId) ?? row.nodeId
        : "project";
      const model = row.model ? `, model=${row.model}` : "";
      const lines = [
        `- **${row.type}** on ${scope} — ${row.status}${model} (${row.createdAt})`,
      ];
      if (row.resultSummary) {
        lines.push(indentBlock(row.resultSummary));
      }
      return lines.join("\n");
    })
    .join("\n");
}

function formatImprovementsMarkdown(
  payload: ProjectExportPayload,
): string {
  const { improvementSuggestions, nodes } = payload;
  if (!improvementSuggestions.length) {
    return "_No improvement suggestions recorded._";
  }

  const nodeNameById = new Map(nodes.map((n) => [n.id, n.name]));

  return improvementSuggestions
    .map((row) => {
      const scope = row.nodeId
        ? nodeNameById.get(row.nodeId) ?? row.nodeId
        : "project";
      const suggestion = asRecord(row.suggestion);
      const lines = [
        `### ${scope} — ${row.status}`,
        `_Recorded ${row.createdAt}_`,
      ];

      if (suggestion) {
        const summary = pickString(suggestion.summary);
        if (summary) lines.push(`**Summary:** ${summary}`);

        const items = Array.isArray(suggestion.suggestions)
          ? suggestion.suggestions
          : Array.isArray(suggestion.items)
            ? suggestion.items
            : null;

        if (items) {
          for (const item of items) {
            const rec = asRecord(item);
            if (!rec) continue;
            const title =
              pickString(rec.title) ?? pickString(rec.category) ?? "Suggestion";
            const category = pickString(rec.category);
            const priority = pickString(rec.priority);
            const description = pickString(rec.description);
            const rationale = pickString(rec.rationale);
            const meta = [category, priority].filter(Boolean).join(", ");
            lines.push(`- **${title}**${meta ? ` (${meta})` : ""}`);
            if (description) lines.push(`  - ${description}`);
            if (rationale) lines.push(`  - _Why:_ ${rationale}`);
          }
        } else {
          const title = pickString(suggestion.title);
          const description = pickString(suggestion.description);
          if (title) lines.push(`**${title}**`);
          if (description) lines.push(description);
        }
      }

      return lines.join("\n");
    })
    .join("\n\n");
}

/** Human-readable Markdown document of the full recorded project idea. */
export function formatProjectExportMarkdown(
  payload: ProjectExportPayload,
): string {
  const { project, intents } = payload;
  const latest = intents.length ? intents[intents.length - 1]! : null;
  const typeLabel = project.customTypeLabel
    ? `${project.type} (${project.customTypeLabel})`
    : project.type;

  const parts: string[] = [
    `# ${project.name}`,
    "",
    `Exported ${payload.exportedAt}`,
    "",
    "## Overview",
    "",
    `- **Type:** ${typeLabel}`,
    `- **Status:** ${project.status}`,
    `- **Setup completed:** ${project.setupCompleted ? "yes" : "no"}`,
  ];

  if (project.type === "GAME" || project.genres.length > 0) {
    parts.push(`- **Genres:** ${formatGenreLine(project.genres)}`);
  }
  if (project.customGameType) {
    parts.push(`- **Custom game type:** ${project.customGameType}`);
  }
  if (project.gameProfileNotes?.trim()) {
    parts.push(`- **Game profile notes:** ${project.gameProfileNotes.trim()}`);
  }

  parts.push("", "## Intent", "");
  if (!latest) {
    parts.push("_No intent recorded._");
  } else {
    parts.push(
      `### Effective intent (v${latest.version})`,
      "",
      escapeMd(latest.content.trim()),
      "",
      "### Intent history",
      "",
    );
    for (const intent of intents) {
      const flags = [
        intent.isOriginal ? "original" : null,
        intent.reason ? `reason=${intent.reason}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      parts.push(
        `#### Version ${intent.version}${flags ? ` (${flags})` : ""}`,
        "",
        `_${intent.createdAt}_`,
        "",
        escapeMd(intent.content.trim()),
        "",
      );
    }
  }

  parts.push(
    "## Design Focus",
    "",
    formatFocusTreeMarkdown(payload.designFocuses),
    "",
    "## Project Structure",
    "",
    formatNodeTreeMarkdown(payload),
    "",
    "## Classifications",
    "",
    formatClassificationsMarkdown(payload),
    "",
    "## Relations",
    "",
    formatRelationsMarkdown(payload),
    "",
    "## Classification rules",
    "",
    formatRulesMarkdown(payload.classificationRules),
    "",
    "## Direction checks",
    "",
    formatDirectionChecksMarkdown(payload),
    "",
    "## AI analyses",
    "",
    "_Condensed summaries of recorded analyses (newest per type/scope)._",
    "",
    formatAiAnalysesMarkdown(payload),
    "",
    "## Improvement suggestions",
    "",
    formatImprovementsMarkdown(payload),
    "",
  );

  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

export function serializeProjectExportJson(
  payload: ProjectExportPayload,
): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
