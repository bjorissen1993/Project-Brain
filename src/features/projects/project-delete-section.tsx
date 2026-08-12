"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { useT } from "@/features/i18n";
import { deleteProjectAction } from "@/features/projects/actions";

/** Danger-zone delete for the current project (Profile). Requires typing the name. */
export function ProjectDeleteSection({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const t = useT();
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
        <h2 className="font-display text-xl text-danger">
          {t("profile.deleteTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {t("profile.deleteDesc", { name: projectName })}
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
          {t("profile.deleteExpand")}
        </Button>
      ) : (
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="delete-project-confirm"
              className="normal-case tracking-normal"
            >
              {t("profile.deleteConfirmLabel", { name: projectName })}
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
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending || !nameMatches}
              onClick={() => {
                if (!nameMatches) return;
                if (
                  !confirm(
                    t("profile.deleteConfirmPrompt", { name: projectName }),
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
              {pending
                ? t("profile.deleting")
                : t("profile.deletePermanently")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
