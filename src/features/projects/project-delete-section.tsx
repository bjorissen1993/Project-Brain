"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { deleteProjectAction } from "@/features/projects/actions";

/** Danger-zone delete for the current project (Profile). Requires typing the name. */
export function ProjectDeleteSection({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [confirmName, setConfirmName] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nameMatches =
    confirmName.trim().localeCompare(projectName.trim(), undefined, {
      sensitivity: "base",
    }) === 0;

  return (
    <section
      id="danger"
      className="scroll-mt-8 space-y-3 rounded-[var(--radius)] border border-danger/35 bg-danger/5 p-5"
    >
      <div>
        <h2 className="font-display text-xl text-danger">Delete project</h2>
        <p className="mt-1 text-sm text-muted">
          Permanently remove{" "}
          <span className="font-medium text-foreground">{projectName}</span> and
          all of its structure, design focuses, analyses, and related data. This
          cannot be undone.
        </p>
      </div>

      {!expanded ? (
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            setExpanded(true);
            setError(null);
            setConfirmName("");
          }}
        >
          Delete this project…
        </Button>
      ) : (
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="delete-project-confirm"
              className="normal-case tracking-normal"
            >
              Type{" "}
              <span className="font-semibold text-foreground">
                &ldquo;{projectName}&rdquo;
              </span>{" "}
              to confirm
            </Label>
            <Input
              id="delete-project-confirm"
              value={confirmName}
              onChange={(e) => setConfirmName(e.target.value)}
              autoComplete="off"
              placeholder={projectName}
              className="mt-1"
            />
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setExpanded(false);
                setConfirmName("");
                setError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending || !nameMatches}
              onClick={() => {
                if (!nameMatches) return;
                if (
                  !confirm(
                    `Delete project “${projectName}” permanently? All related data will be removed.`,
                  )
                ) {
                  return;
                }
                setError(null);
                startTransition(async () => {
                  const result = await deleteProjectAction({
                    projectId,
                    confirmName,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  router.push("/");
                  router.refresh();
                });
              }}
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
