"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateNodePositionsAction } from "@/features/views/actions";
import { cn } from "@/lib/utils";

type CanvasNode = {
  id: string;
  name: string;
  type: string;
  status: string;
  posX: number | null;
  posY: number | null;
};

export function CanvasView({
  projectId,
  nodes,
}: {
  projectId: string;
  nodes: CanvasNode[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [local, setLocal] = useState(() =>
    Object.fromEntries(
      nodes.map((n, i) => [
        n.id,
        {
          x: n.posX ?? 40 + (i % 5) * 140,
          y: n.posY ?? 40 + Math.floor(i / 5) * 90,
        },
      ]),
    ),
  );

  const dirty = useMemo(() => {
    return nodes.some((n) => {
      const p = local[n.id];
      if (!p) return false;
      return p.x !== (n.posX ?? null) && n.posX != null
        ? Math.abs(p.x - (n.posX ?? 0)) > 0.5 ||
            Math.abs(p.y - (n.posY ?? 0)) > 0.5
        : true;
    });
  }, [local, nodes]);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-4 px-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Canvas</h1>
          <p className="mt-2 text-sm text-muted">
            Lightweight spatial layout with saved positions. Full freeform editor
            is out of scope — drag cards and save.
          </p>
        </div>
        <Button
          disabled={pending || !dirty}
          onClick={() => {
            startTransition(async () => {
              await updateNodePositionsAction({
                projectId,
                positions: Object.entries(local).map(([id, p]) => ({
                  id,
                  posX: p.x,
                  posY: p.y,
                })),
              });
              router.refresh();
            });
          }}
        >
          {pending ? "Saving…" : "Save positions"}
        </Button>
      </div>

      <div
        className="relative h-[520px] overflow-hidden rounded-[var(--radius)] border border-border bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] [background-size:24px_24px]"
        onMouseMove={(e) => {
          if (!dragId) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - 60;
          const y = e.clientY - rect.top - 20;
          setLocal((prev) => ({
            ...prev,
            [dragId]: {
              x: Math.max(8, Math.min(rect.width - 140, x)),
              y: Math.max(8, Math.min(rect.height - 60, y)),
            },
          }));
        }}
        onMouseUp={() => setDragId(null)}
        onMouseLeave={() => setDragId(null)}
      >
        {nodes.map((n) => {
          const p = local[n.id] ?? { x: 40, y: 40 };
          return (
            <div
              key={n.id}
              className={cn(
                "absolute w-[120px] cursor-grab rounded-[var(--radius)] border border-border bg-panel px-2 py-2 text-xs shadow active:cursor-grabbing",
                dragId === n.id && "border-nav",
              )}
              style={{ left: p.x, top: p.y }}
              onMouseDown={(e) => {
                e.preventDefault();
                setDragId(n.id);
              }}
            >
              <Link
                href={`/projects/${projectId}/nodes/${n.id}`}
                className="font-semibold hover:text-accent"
                onClick={(e) => {
                  if (dragId) e.preventDefault();
                }}
              >
                {n.name}
              </Link>
              <p className="mt-0.5 text-[10px] text-muted">
                {n.type} · {n.status}
              </p>
            </div>
          );
        })}
        {!nodes.length ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            No nodes yet.
          </p>
        ) : null}
      </div>
    </div>
  );
}
