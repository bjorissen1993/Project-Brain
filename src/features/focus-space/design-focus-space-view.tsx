"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ArrowUp } from "lucide-react";
import { updateDesignFocusAction } from "@/features/design-focus/actions";
import { AddFocusBlobControl } from "./add-focus-blob-control";
import { FocusBlobPropertiesDialog } from "./focus-blob-properties-dialog";
import { FocusBlobs } from "./focus-blobs";
import { FocusIdeaEditor } from "./focus-idea-editor";
import { useFocusWorkspace } from "./focus-interaction-context";
import { buildFocusLevelSummaryCopy } from "./focus-level-copy";

/**
 * Design Focus view — blobs are Design Focuses (emphasis criteria).
 * Separate from Project Structure Focus Space.
 */
export function DesignFocusSpaceView({ focusId }: { focusId: string | null }) {
  const router = useRouter();
  const {
    projectId,
    projectName,
    hoveredId,
    hoverSource,
    setHoveredId,
    designFocusLevelFor,
    focuses,
    colorFor,
    iconFor,
    intentText,
    genres,
  } = useFocusWorkspace();
  const level = designFocusLevelFor(focusId);
  const [propertiesFocusId, setPropertiesFocusId] = useState<string | null>(
    null,
  );

  const navigateTo = (id: string) => {
    router.push(`/projects/${projectId}/design-focus/${id}`);
  };

  const parentHref =
    level.parentId != null
      ? `/projects/${projectId}/design-focus/${level.parentId}`
      : focusId != null
        ? `/projects/${projectId}/design-focus`
        : null;

  const canExtract = focusId != null;
  const extractToParentId = level.parentId;

  const onReparent = useCallback(
    async (id: string, newParentId: string | null) => {
      const result = await updateDesignFocusAction({
        id,
        parentId: newParentId,
      });
      if (result.ok) {
        router.refresh();
        return { ok: true as const };
      }
      return {
        ok: false as const,
        error: result.error ?? "Could not reparent focus",
      };
    },
    [router],
  );

  const contextCopy = buildFocusLevelSummaryCopy({
    levelName: level.name,
    focusId: level.focusId,
    projectName,
    intentText,
    genres,
    childNames: level.slices.map((s) => s.name),
    mode: "design-focus",
  });

  const isLeafLevel = focusId != null && level.slices.length === 0;

  return (
    <div className="relative flex h-full min-h-[calc(100dvh-8rem)] flex-col">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% 40%, color-mix(in srgb, var(--nav) 10%, transparent), transparent 70%), radial-gradient(ellipse 60% 40% at 70% 80%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 65%)",
        }}
      />

      <div className="relative z-[1] flex flex-1 flex-col px-5 py-5 sm:px-8">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <nav
              aria-label="Design Focus breadcrumb"
              className="flex flex-wrap items-center gap-1 text-xs text-muted"
            >
              {level.breadcrumb.map((crumb, i) => {
                const last = i === level.breadcrumb.length - 1;
                const href =
                  crumb.id == null
                    ? `/projects/${projectId}/design-focus`
                    : `/projects/${projectId}/design-focus/${crumb.id}`;
                return (
                  <span
                    key={`${crumb.id ?? "root"}-${i}`}
                    className="flex items-center gap-1"
                  >
                    {i > 0 ? (
                      <span className="text-border-strong">/</span>
                    ) : null}
                    {last ? (
                      <span className="text-foreground">{crumb.name}</span>
                    ) : (
                      <Link href={href} className="hover:text-nav">
                        {crumb.name}
                      </Link>
                    )}
                  </span>
                );
              })}
            </nav>

            {parentHref ? (
              <Link
                href={parentHref}
                className="mt-2.5 inline-flex items-center gap-2 rounded-[var(--radius)] border border-nav/35 bg-nav-muted px-3 py-1.5 text-sm font-medium text-nav shadow-sm transition-colors hover:border-nav/55 hover:bg-nav/15 hover:text-nav-hover"
              >
                <ArrowUp size={16} strokeWidth={2.25} aria-hidden />
                Up one level
              </Link>
            ) : null}
          </div>

          <div className="max-w-md shrink-0 text-right">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              Design Focus
            </p>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight sm:text-3xl">
              {level.name}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              What is the project focusing on? Blobs are Design Focuses — not
              Project Structure.{" "}
              {level.slices.length > 0
                ? "Drill in, adjust importance via properties, or add with +."
                : focusId
                  ? "Add child focuses with +, or review contributing ideas below."
                  : "Add Design Focuses with + to map emphasis criteria."}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted/90">
              {contextCopy}
            </p>
          </div>
        </div>

        <div className="relative mt-4 min-h-0 flex-1">
          <FocusBlobs
            key={`${projectId}:design-focus:${focusId ?? "root"}`}
            slices={level.slices}
            hoveredId={hoveredId}
            hoverSource={hoverSource}
            onHover={(id) => setHoveredId(id, "blob")}
            onSelect={navigateTo}
            onBlobContextMenu={(id) => setPropertiesFocusId(id)}
            projectId={projectId}
            levelFocusId={focusId}
            canExtract={canExtract}
            extractToParentId={extractToParentId}
            focuses={focuses}
            onReparent={onReparent}
            colorFor={colorFor}
            iconFor={iconFor}
          />
          <AddFocusBlobControl
            projectId={projectId}
            parentFocusId={focusId}
            className="absolute bottom-3 left-3 z-30"
          />
        </div>

        {isLeafLevel && focusId ? (
          <FocusIdeaEditor focusId={focusId} focusName={level.name} />
        ) : null}

        <div className="relative mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/80 pt-4 text-xs text-muted">
          <span>
            {level.slices.length} direct child
            {level.slices.length === 1 ? "" : "ren"}
            {level.totalContainedNodes > 0
              ? ` · ${level.totalContainedNodes} contributing nodes`
              : ""}
            {" · "}
            target importance via properties
          </span>
          <Link
            href={`/projects/${projectId}/focus`}
            className="font-medium text-nav hover:text-nav-hover"
          >
            Project Structure
          </Link>
        </div>
      </div>

      {propertiesFocusId ? (
        <FocusBlobPropertiesDialog
          focusId={propertiesFocusId}
          onClose={() => setPropertiesFocusId(null)}
        />
      ) : null}
    </div>
  );
}
