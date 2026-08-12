"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react";
import { ContextMenu } from "@/components/ui/context-menu";
import { updateNodeAction } from "@/features/nodes/actions";
import { boardNodeMenuItems } from "@/features/focus-space/structure-context-menu";
import { useT } from "@/features/i18n";
import { NODE_STATUS_OPTIONS, type NodeStatus } from "@/types";
import { cn } from "@/lib/utils";

type BoardNode = {
  id: string;
  name: string;
  type: string;
  status: NodeStatus;
  /** Breadcrumb of parent folders, e.g. "Characters / Berwynn". */
  parentPath: string;
};

const COLUMNS = NODE_STATUS_OPTIONS;
const DRAG_MIME = "application/x-board-node-id";

export function BoardView({
  projectId,
  nodes,
}: {
  projectId: string;
  nodes: BoardNode[];
}) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [optimisticNodes, setOptimisticStatus] = useOptimistic(
    nodes,
    (state, update: { id: string; status: NodeStatus }) =>
      state.map((n) => (n.id === update.id ? { ...n, status: update.status } : n)),
  );
  const [dragOverStatus, setDragOverStatus] = useState<NodeStatus | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const draggingIdRef = useRef<string | null>(null);

  const byStatus = (status: NodeStatus) =>
    optimisticNodes.filter((n) => n.status === status);

  function moveNode(nodeId: string, status: NodeStatus) {
    const current = optimisticNodes.find((n) => n.id === nodeId);
    if (!current || current.status === status) return;

    startTransition(async () => {
      setOptimisticStatus({ id: nodeId, status });
      const result = await updateNodeAction({ id: nodeId, status });
      if (!result.ok) return;
      router.refresh();
    });
  }

  function onCardDragStart(event: DragEvent<HTMLLIElement>, node: BoardNode) {
    suppressClickRef.current = false;
    event.dataTransfer.setData(DRAG_MIME, node.id);
    event.dataTransfer.setData("text/plain", node.id);
    event.dataTransfer.effectAllowed = "move";
    draggingIdRef.current = node.id;
    setDraggingId(node.id);
  }

  function onCardDragEnd() {
    suppressClickRef.current = true;
    draggingIdRef.current = null;
    setDraggingId(null);
    setDragOverStatus(null);
    // Clear after the synthetic click that browsers may fire post-drag.
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function isBoardDrag(event: DragEvent) {
    const types = Array.from(event.dataTransfer.types);
    return (
      draggingIdRef.current != null ||
      types.includes(DRAG_MIME) ||
      types.includes("text/plain")
    );
  }

  function onColumnDragOver(event: DragEvent<HTMLDivElement>, status: NodeStatus) {
    if (!isBoardDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (dragOverStatus !== status) setDragOverStatus(status);
  }

  function onColumnDrop(event: DragEvent<HTMLDivElement>, status: NodeStatus) {
    event.preventDefault();
    const nodeId =
      event.dataTransfer.getData(DRAG_MIME) ||
      event.dataTransfer.getData("text/plain") ||
      draggingIdRef.current ||
      "";
    draggingIdRef.current = null;
    setDragOverStatus(null);
    setDraggingId(null);
    if (!nodeId) return;
    moveNode(nodeId, status);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-4 sm:px-4 sm:py-5 lg:px-6">
      <div className="mx-auto w-full max-w-[1600px] shrink-0">
        <h1 className="font-display text-2xl sm:text-3xl">{t("board.title")}</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {t("board.intro")}
        </p>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 gap-3 overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch]">
        {COLUMNS.map((col) => {
          const cards = byStatus(col.value);
          const isDropTarget = dragOverStatus === col.value && draggingId != null;
          return (
            <div
              key={col.value}
              onDragOver={(event) => onColumnDragOver(event, col.value)}
              onDragLeave={(event) => {
                const next = event.relatedTarget as Node | null;
                if (!event.currentTarget.contains(next)) {
                  setDragOverStatus((current) =>
                    current === col.value ? null : current,
                  );
                }
              }}
              onDrop={(event) => onColumnDrop(event, col.value)}
              className={cn(
                "flex h-full min-h-0 min-w-[13.5rem] flex-1 basis-0 flex-col overflow-hidden rounded-[var(--radius)] border bg-panel transition-colors",
                isDropTarget
                  ? "border-accent bg-accent-muted"
                  : "border-border",
              )}
            >
              <div className="shrink-0 border-b border-border px-3 py-2.5">
                <p className="text-xs font-semibold uppercase tracking-wide">
                  {col.label}
                </p>
                <p className="text-[10px] text-muted">{cards.length}</p>
              </div>
              <ul className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
                {cards.map((n) => {
                  const path =
                    n.parentPath.trim().length > 0
                      ? n.parentPath
                      : t("board.projectRoot");
                  return (
                    <li
                      key={n.id}
                      draggable
                      onDragStart={(event) => onCardDragStart(event, n)}
                      onDragEnd={onCardDragEnd}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        setMenu({
                          nodeId: n.id,
                          x: event.clientX,
                          y: event.clientY,
                        });
                      }}
                      className={cn(
                        "flex min-h-[8.75rem] cursor-grab flex-col rounded-[var(--radius)] border border-border bg-panel-elevated px-3.5 py-3.5 active:cursor-grabbing",
                        draggingId === n.id && "opacity-50",
                      )}
                    >
                      <p
                        className="line-clamp-2 min-h-[2.25rem] text-[11px] leading-snug text-muted"
                        title={path}
                      >
                        {path}
                      </p>
                      <Link
                        href={`/projects/${projectId}/nodes/${n.id}`}
                        draggable={false}
                        onClick={(event) => {
                          if (suppressClickRef.current) {
                            event.preventDefault();
                            suppressClickRef.current = false;
                          }
                        }}
                        className="mt-2 block text-base font-semibold leading-snug hover:text-accent"
                      >
                        {n.name}
                      </Link>
                      <p className="mt-auto pt-3 text-[11px] uppercase tracking-wide text-muted">
                        {n.type}
                      </p>
                    </li>
                  );
                })}
                {!cards.length ? (
                  <li className="pointer-events-none px-2 py-6 text-center text-xs text-muted">
                    Empty
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={boardNodeMenuItems()}
          onSelect={(action) => {
            const href = `/projects/${projectId}/nodes/${menu.nodeId}`;
            if (action === "open" || action === "info") {
              router.push(href);
            }
          }}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
