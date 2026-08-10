"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/field";
import { createNodeAction } from "@/features/nodes/actions";
import { NODE_TYPE_OPTIONS, type NodeType } from "@/types";

/** Manual + Add section — always available; never depends on AI. */
export function AddChildSection({
  projectId,
  parentId,
}: {
  projectId: string;
  parentId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("IDEA");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        + Add section
      </Button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-[var(--radius)] border border-border bg-panel-elevated/40 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await createNodeAction({
            projectId,
            parentId,
            name: name.trim(),
            type,
            status: "IDEA",
            content: null,
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setName("");
          setType("IDEA");
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="add-section-name">Section name</Label>
        <Input
          id="add-section-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="e.g. Resource loops"
        />
      </div>
      <div>
        <Label htmlFor="add-section-type">Type</Label>
        <Select
          id="add-section-type"
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
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add section"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
