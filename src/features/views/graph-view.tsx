"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type GraphNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  parentId: string | null;
};

type GraphEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  label: string | null;
};

export function GraphView({
  projectId,
  nodes,
  relations,
}: {
  projectId: string;
  nodes: GraphNode[];
  relations: GraphEdge[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const layout = useMemo(() => {
    const width = 1400;
    const height = 720;
    const byParent = new Map<string | null, GraphNode[]>();
    for (const n of nodes) {
      const list = byParent.get(n.parentId) ?? [];
      list.push(n);
      byParent.set(n.parentId, list);
    }

    const positions = new Map<string, { x: number; y: number }>();
    const roots = byParent.get(null) ?? [];
    const levels: GraphNode[][] = [];

    const queue: { node: GraphNode; depth: number }[] = roots.map((n) => ({
      node: n,
      depth: 0,
    }));
    const seen = new Set<string>();
    while (queue.length) {
      const { node, depth } = queue.shift()!;
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push(node);
      for (const child of byParent.get(node.id) ?? []) {
        queue.push({ node: child, depth: depth + 1 });
      }
    }

    // Orphans / disconnected
    for (const n of nodes) {
      if (!seen.has(n.id)) {
        if (!levels[0]) levels[0] = [];
        levels[0].push(n);
      }
    }

    const depthCount = Math.max(levels.length, 1);
    levels.forEach((row, depth) => {
      const y = ((depth + 0.5) / depthCount) * (height - 40) + 20;
      row.forEach((n, i) => {
        const x = ((i + 0.5) / Math.max(row.length, 1)) * (width - 40) + 20;
        positions.set(n.id, { x, y });
      });
    });

    return { width, height, positions };
  }, [nodes]);

  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const related = selected
    ? relations.filter(
        (r) =>
          r.sourceNodeId === selected.id || r.targetNodeId === selected.id,
      )
    : [];

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col space-y-4 px-6 py-8">
      <div>
        <h1 className="font-display text-3xl">Graph</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Nodes and relations. Tree hierarchy as layout; edges show{" "}
          <code className="text-xs">NodeRelation</code> links.{" "}
          <Link
            href={`/projects/${projectId}/canvas`}
            className="text-accent underline"
          >
            Open canvas
          </Link>{" "}
          for freeform positions.
        </p>
      </div>

      <div className="surface-card min-h-0 flex-1 overflow-hidden p-3">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-[min(70vh,720px)] w-full"
          role="img"
          aria-label="Project graph"
        >
          {relations.map((r) => {
            const a = layout.positions.get(r.sourceNodeId);
            const b = layout.positions.get(r.targetNodeId);
            if (!a || !b) return null;
            const active =
              selectedId &&
              (r.sourceNodeId === selectedId || r.targetNodeId === selectedId);
            return (
              <g key={r.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={active ? "var(--nav)" : "var(--border-strong)"}
                  strokeWidth={active ? 2 : 1}
                />
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = layout.positions.get(n.id);
            if (!p) return null;
            const active = n.id === selectedId;
            return (
              <g
                key={n.id}
                transform={`translate(${p.x}, ${p.y})`}
                className="cursor-pointer"
                onClick={() => setSelectedId(n.id)}
              >
                <circle
                  r={active ? 16 : 12}
                  fill={
                    n.status === "READY"
                      ? "var(--accent)"
                      : active
                        ? "var(--nav)"
                        : "var(--panel-elevated)"
                  }
                  stroke="var(--border-strong)"
                  strokeWidth={1.5}
                />
                <text
                  y={28}
                  textAnchor="middle"
                  fill="var(--foreground)"
                  fontSize={10}
                  className="pointer-events-none"
                >
                  {n.name.length > 18 ? `${n.name.slice(0, 17)}…` : n.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {selected ? (
        <div className="surface-card px-4 py-3 text-sm">
          <p className="font-semibold">{selected.name}</p>
          <p className="text-xs text-muted">
            {selected.type} · {selected.status}
          </p>
          <p className="mt-2 text-xs text-muted">
            {related.length} relation(s)
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            {related.map((r) => (
              <li key={r.id}>
                {r.sourceNodeId === selected.id ? "→" : "←"} {r.type}
                {r.label ? ` (${r.label})` : ""}
              </li>
            ))}
          </ul>
          <Link
            href={`/projects/${projectId}/nodes/${selected.id}`}
            className={cn("mt-3 inline-block text-accent underline")}
          >
            Open node
          </Link>
        </div>
      ) : (
        <p className="text-xs text-muted">Click a node to inspect relations.</p>
      )}
    </div>
  );
}
