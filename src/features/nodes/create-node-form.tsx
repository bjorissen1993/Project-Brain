"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { StatusSelect } from "@/components/ui/status-select";
import { createNodeAction } from "@/features/nodes/actions";
import { NODE_TYPE_OPTIONS, type NodeType } from "@/types";

export function CreateNodeForm({
  projectId,
  parentId,
  designFocusOptions = [],
}: {
  projectId: string;
  parentId?: string | null;
  designFocusOptions?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<NodeType>("IDEA");

  return (
    <form
      className="surface-card space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const formEl = e.currentTarget;
        const form = new FormData(formEl);
        setError(null);
        startTransition(async () => {
          const result = await createNodeAction({
            projectId,
            parentId: parentId ?? null,
            name: String(form.get("name") ?? ""),
            type,
            customTypeLabel: String(form.get("customTypeLabel") ?? "") || null,
            status: String(form.get("status") ?? "IDEA"),
            content: String(form.get("content") ?? "") || null,
            designFocusId: String(form.get("designFocusId") ?? "") || null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          formEl.reset();
          setType("IDEA");
          router.push(`/projects/${projectId}/nodes/${result.node.id}`);
          router.refresh();
        });
      }}
    >
      <div>
        <h3 className="font-display text-lg">New content node</h3>
        <p className="mt-1 text-xs text-muted">
          Write an idea or system component. Optionally link it to a Design Focus
          so it shows up in Structure composition. Identity is preserved —
          create once, refine over time.
        </p>
      </div>

      <div>
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="e.g. Stamina system" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="type">Type</Label>
          <Select
            id="type"
            name="type"
            value={type}
            onChange={(e) => setType(e.target.value as NodeType)}
          >
            {NODE_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <StatusSelect
            id="status"
            name="status"
            defaultValue="IDEA"
            className="w-full"
          />
        </div>
      </div>

      {type === "CUSTOM" ? (
        <div>
          <Label htmlFor="customTypeLabel">Custom type label</Label>
          <Input id="customTypeLabel" name="customTypeLabel" placeholder="e.g. Lore Entry" />
        </div>
      ) : null}

      {designFocusOptions.length > 0 ? (
        <div>
          <Label htmlFor="designFocusId">Design focus (optional)</Label>
          <Select id="designFocusId" name="designFocusId" defaultValue="">
            <option value="">None</option>
            {designFocusOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div>
        <Label htmlFor="content">Content</Label>
        <Textarea
          id="content"
          name="content"
          rows={4}
          placeholder="Describe the component, constraints, and intention…"
        />
      </div>

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create node"}
      </Button>
    </form>
  );
}
