"use client";

import { useMemo, useSyncExternalStore } from "react";
import { DesignFocusEditor } from "@/features/design-focus/design-focus-editor";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  readLocalDisplayName,
  subscribeLocalDisplayName,
} from "@/features/auth/local-profile";
import { useLocale, useT } from "@/features/i18n";
import { GenreEditor } from "@/features/projects/genre-editor";
import { IntentEditor } from "@/features/projects/intent-editor";
import { ProfileSection } from "@/features/projects/profile-section";
import { GithubRepoSection } from "@/features/projects/github-repo-section";
import { ProjectDeleteSection } from "@/features/projects/project-delete-section";
import { ProjectExportSection } from "@/features/projects/project-export-section";
import type { DesignFocus } from "@/types";

type GenreRow = {
  role: string;
  genre: { name: string; slug?: string; templateKey?: string };
};

type IntentVersion = {
  id: string;
  version: number;
  content: string;
  isOriginal: boolean;
  reason?: string | null;
  createdAt: string | Date;
};

function composeEffectiveIntent(versions: IntentVersion[]): string {
  if (versions.length === 0) return "";
  const latest = versions[versions.length - 1];
  return latest?.content ?? "";
}

function condenseIntent(text: string, max = 220): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}…`;
}

export function ProjectProfile({
  projectId,
  projectName,
  projectType,
  createdAt,
  genres,
  customGameType,
  intentVersions,
  focusTree,
  focusOptions,
  githubRepo = null,
}: {
  projectId: string;
  projectName: string;
  projectType: string;
  createdAt: string | Date;
  genres: GenreRow[];
  customGameType?: string | null;
  intentVersions: IntentVersion[];
  focusTree: DesignFocus[];
  focusOptions: { id: string; name: string }[];
  githubRepo?: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const isGame = projectType === "GAME";
  const makerName = useSyncExternalStore(
    subscribeLocalDisplayName,
    readLocalDisplayName,
    () => DEFAULT_LOCAL_DISPLAY_NAME,
  );
  const effectiveIntent = useMemo(
    () => composeEffectiveIntent(intentVersions),
    [intentVersions],
  );
  const intentSummary = effectiveIntent
    ? condenseIntent(effectiveIntent)
    : t("profile.noIntent");

  const genreNames = genres.map((g) => g.genre.name).filter(Boolean);

  function formatCreatedAt(value: string | Date): string {
    const d = typeof value === "string" ? new Date(value) : value;
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 px-6 py-8">
      <header className="max-w-prose">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
          {t("profile.eyebrow")}
        </p>
        <h1 className="mt-1 font-display text-3xl">{projectName}</h1>
        <p className="mt-2 text-sm text-muted">{t("profile.overview")}</p>
      </header>

      <section
        aria-label={t("profile.basicsAria")}
        className="rounded-[var(--radius)] border border-border bg-panel/90 px-5 py-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
              {t("profile.basics")}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight">
              {projectName}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-foreground/90">
              {intentSummary}
            </p>
            {isGame && genreNames.length > 0 ? (
              <ul className="mt-3 flex flex-wrap gap-2">
                {genreNames.map((name) => (
                  <li
                    key={name}
                    className="rounded-[var(--radius)] border border-border bg-panel-elevated px-2.5 py-1 text-xs font-medium text-muted"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ) : null}
            {isGame && customGameType?.trim() ? (
              <p className="mt-2 text-xs text-muted">
                {t("profile.customType", { label: customGameType.trim() })}
              </p>
            ) : null}
          </div>
          <dl className="shrink-0 space-y-2 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                {t("profile.created")}
              </dt>
              <dd className="mt-0.5 text-foreground">
                {formatCreatedAt(createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                {t("profile.createdBy")}
              </dt>
              <dd className="mt-0.5 text-foreground">{makerName}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid gap-8 border-t border-border pt-8 lg:grid-cols-2 lg:items-start">
        <ProfileSection
          id="intent"
          title={t("profile.intent")}
          description={t("profile.intentDesc")}
          defaultOpen={false}
        >
          <IntentEditor
            projectId={projectId}
            versions={intentVersions}
            embedded
          />
        </ProfileSection>

        {isGame ? (
          <ProfileSection
            id="genres"
            title={t("profile.genres")}
            description={t("profile.genresDesc")}
            defaultOpen={false}
          >
            <GenreEditor
              projectId={projectId}
              genres={genres}
              customGameType={customGameType}
            />
          </ProfileSection>
        ) : (
          <ProfileSection
            id="design-focus"
            title={t("profile.designFocus")}
            description={t("profile.designFocusDesc")}
            defaultOpen={false}
          >
            <DesignFocusEditor
              projectId={projectId}
              tree={focusTree}
              flatOptions={focusOptions}
              embedded
            />
          </ProfileSection>
        )}
      </div>

      {isGame ? (
        <ProfileSection
          id="design-focus"
          title={t("profile.designFocus")}
          description={t("profile.designFocusDescGame")}
          defaultOpen={false}
          className="border-t border-border pt-8"
        >
          <DesignFocusEditor
            projectId={projectId}
            tree={focusTree}
            flatOptions={focusOptions}
            embedded
          />
        </ProfileSection>
      ) : null}

      <GithubRepoSection projectId={projectId} githubRepo={githubRepo} />

      <div className="grid gap-8 border-t border-border pt-8 lg:grid-cols-2 lg:items-start">
        <ProjectExportSection projectId={projectId} />
        <ProjectDeleteSection
          projectId={projectId}
          projectName={projectName}
        />
      </div>
    </div>
  );
}
