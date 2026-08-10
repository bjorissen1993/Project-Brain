"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { deleteNodeAction } from "@/features/nodes/actions";
import type { ProjectNode } from "@/types";
import { removeBlobPositions } from "./focus-blob-layout";

const LIST_CAP = 6;

type NestedInfo = {
  hasNested: boolean;
  /** Readable labels for nested containers (direct structural children + notable deeper). */
  labels: string[];
  extraCount: number;
};

function collectNestedContainers(
  nodeId: string,
  nodes: ProjectNode[],
): NestedInfo {
  const byParent = new Map<string | null, ProjectNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(n);
    byParent.set(key, list);
  }

  const direct = byParent.get(nodeId) ?? [];
  if (direct.length === 0) {
    return { hasNested: false, labels: [], extraCount: 0 };
  }

  const labels: string[] = [];
  for (const child of direct) {
    const grandchildren = byParent.get(child.id) ?? [];
    const suffix =
      grandchildren.length > 0
        ? ` (+${grandchildren.length} nested)`
        : child.type === "FOLDER" || child.type === "ACT"
          ? " (container)"
          : "";
    labels.push(`${child.name} · ${child.type}${suffix}`);
  }

  // Notable nested containers one level deeper (folders/acts under direct children).
  for (const child of direct) {
    for (const gc of byParent.get(child.id) ?? []) {
      if (gc.type === "FOLDER" || gc.type === "ACT" || (byParent.get(gc.id)?.length ?? 0) > 0) {
        const key = `${gc.name} · ${gc.type}`;
        if (!labels.some((l) => l.startsWith(`${gc.name} ·`))) {
          labels.push(`↳ ${key}`);
        }
      }
    }
  }

  const shown = labels.slice(0, LIST_CAP);
  return {
    hasNested: true,
    labels: shown,
    extraCount: Math.max(0, labels.length - shown.length),
  };
}

/**
 * Delete control for Structure blob properties.
 * Empty node: single confirm. Nested containers: two-step error-styled confirm.
 */
export function StructureBlobDeleteControl({
  node,
  projectId,
  nodes,
  onDeleted,
}: {
  node: ProjectNode;
  projectId: string;
  nodes: ProjectNode[];
  onDeleted: () => void;
}) {
  const nested = useMemo(
    () => collectNestedContainers(node.id, nodes),
    [node.id, nodes],
  );
  const [step, setStep] = useState<"idle" | "confirm" | "confirm2">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const runDelete = () => {
    setError(null);
    startTransition(async () => {
      const result = await deleteNodeAction(node.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Keep sibling sticky positions; drop the deleted blob id only.
      removeBlobPositions(projectId, node.parentId ?? null, [node.id]);
      onDeleted();
    });
  };

  if (step === "idle") {
    return (
      <div className="border-t border-border pt-3">
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() => setStep("confirm")}
        >
          Delete…
        </Button>
      </div>
    );
  }

  return (
    <div
      className={
        nested.hasNested
          ? "space-y-3 rounded-[var(--radius)] border border-danger/40 bg-danger/10 p-3"
          : "space-y-3 rounded-[var(--radius)] border border-border bg-muted-bg/60 p-3"
      }
    >
      {nested.hasNested ? (
        <>
          <p className="text-sm font-semibold text-danger">
            This node still contains nested containers
          </p>
          <p className="text-xs text-muted">
            Deleting{" "}
            <span className="font-medium text-foreground">{node.name}</span> will
            permanently remove it and all descendants.
          </p>
          <ul className="list-inside list-disc text-xs text-foreground/90">
            {nested.labels.map((label) => (
              <li key={label}>{label}</li>
            ))}
            {nested.extraCount > 0 ? (
              <li className="text-muted">+{nested.extraCount} more</li>
            ) : null}
          </ul>
        </>
      ) : (
        <p className="text-sm text-foreground">
          Delete{" "}
          <span className="font-semibold">{node.name}</span> permanently? This
          cannot be undone.
        </p>
      )}

      <FieldError>{error}</FieldError>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setStep("idle")}
        >
          Cancel
        </Button>

        {nested.hasNested && step === "confirm" ? (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => setStep("confirm2")}
          >
            I understand, continue
          </Button>
        ) : (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={runDelete}
          >
            {pending ? "Deleting…" : "Delete permanently"}
          </Button>
        )}
      </div>
    </div>
  );
}
