"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { cleanRecursiveProfileSlotsAction } from "@/features/chat/actions";
import { isKnownProfileSlotName } from "@/features/chat/profile-templates";
import type { ProjectNode } from "@/types";

/**
 * Scoped cleanup for recursively nested duplicate profile slots
 * (e.g. Appearance → Stats / Appearance → Appearance).
 * Requires typing the node name — never wipes the whole project.
 */
export function CleanProfileSlotsControl({
  node,
  nodes,
  projectId,
  onCleaned,
}: {
  node: ProjectNode;
  nodes: ProjectNode[];
  projectId: string;
  onCleaned: () => void;
}) {
  const nestedSlotCount = useMemo(() => {
    const byParent = new Map<string | null, ProjectNode[]>();
    for (const n of nodes) {
      const key = n.parentId ?? null;
      const list = byParent.get(key) ?? [];
      list.push(n);
      byParent.set(key, list);
    }
    const subtree = new Set<string>();
    const stack = [node.id];
    while (stack.length) {
      const id = stack.pop()!;
      for (const child of byParent.get(id) ?? []) {
        if (subtree.has(child.id)) continue;
        subtree.add(child.id);
        stack.push(child.id);
      }
    }
    let count = 0;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const id of subtree) {
      const n = byId.get(id);
      if (!n?.parentId || !isKnownProfileSlotName(n.name)) continue;
      const parent = byId.get(n.parentId);
      if (!parent || !isKnownProfileSlotName(parent.name)) continue;
      if (parent.id !== node.id && !subtree.has(parent.id)) continue;
      count += 1;
    }
    return count;
  }, [node.id, nodes]);

  const [open, setOpen] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (nestedSlotCount === 0) return null;

  if (!open) {
    return (
      <div className="mt-3 rounded-[var(--radius)] border border-border bg-panel-elevated/40 p-3">
        <p className="text-xs text-muted">
          Detected ~{nestedSlotCount} nested duplicate profile slot
          {nestedSlotCount === 1 ? "" : "s"} under this node (slot folders
          containing Stats / Backstory / Appearance / … again).
        </p>
        <Button
          type="button"
          variant="secondary"
          className="mt-2 text-xs"
          onClick={() => {
            setOpen(true);
            setError(null);
            setMessage(null);
            setConfirmName("");
          }}
        >
          Clean recursive profile slots…
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius)] border border-danger/40 bg-danger/10 p-3">
      <p className="text-sm font-semibold text-danger">
        Clean recursive profile slots
      </p>
      <p className="text-xs text-muted">
        Removes only known profile-slot folders that sit under other known
        slot folders under “{node.name}”. Unique notes and the character root
        stay. This cannot be undone.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="clean-profile-confirm">
          Type <span className="font-medium text-foreground">{node.name}</span>{" "}
          to confirm
        </Label>
        <Input
          id="clean-profile-confirm"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
          disabled={pending}
        />
      </div>
      <FieldError>{error}</FieldError>
      {message ? <p className="text-xs text-foreground">{message}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending || confirmName.trim() !== node.name.trim()}
          onClick={() => {
            setError(null);
            setMessage(null);
            startTransition(async () => {
              const result = await cleanRecursiveProfileSlotsAction({
                projectId,
                nodeId: node.id,
                confirmName,
              });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setMessage(result.message);
              if (result.deletedCount > 0) {
                onCleaned();
              }
            });
          }}
        >
          {pending ? "Cleaning…" : "Remove nested slots"}
        </Button>
      </div>
    </div>
  );
}
