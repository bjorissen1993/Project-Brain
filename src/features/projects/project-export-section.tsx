"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/field";
import { exportProjectAction } from "@/features/projects/actions";
import type { ProjectExportFormat } from "@/features/projects/export-project";

function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Profile export: download the full recorded project as Markdown or JSON. */
export function ProjectExportSection({ projectId }: { projectId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [pendingFormat, setPendingFormat] =
    useState<ProjectExportFormat | null>(null);

  const runExport = (format: ProjectExportFormat) => {
    setError(null);
    setPendingFormat(format);
    startTransition(async () => {
      const result = await exportProjectAction({ projectId, format });
      setPendingFormat(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      downloadTextFile(
        result.content,
        result.filename,
        format === "json"
          ? "application/json;charset=utf-8"
          : "text/markdown;charset=utf-8",
      );
    });
  };

  return (
    <section id="export" className="scroll-mt-8 space-y-3">
      <div>
        <h2 className="font-display text-xl">Export</h2>
        <p className="mt-1 text-sm text-muted">
          Download the whole idea as recorded: intent history, design focus,
          structure with content, classifications, relations, rules, direction
          checks, and related notes. Assembled from the database — no AI call.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={() => runExport("markdown")}
        >
          {pending && pendingFormat === "markdown"
            ? "Preparing Markdown…"
            : "Export Markdown"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => runExport("json")}
        >
          {pending && pendingFormat === "json"
            ? "Preparing JSON…"
            : "Export JSON"}
        </Button>
      </div>
      <FieldError>{error}</FieldError>
    </section>
  );
}
