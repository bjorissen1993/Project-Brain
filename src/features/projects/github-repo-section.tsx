"use client";

import { useState, useTransition } from "react";
import { ExternalLink } from "lucide-react";
import { useT } from "@/features/i18n";
import { updateProjectGithubRepoAction } from "@/features/projects/actions";
import { ProfileSection } from "@/features/projects/profile-section";

export function GithubRepoSection({
  projectId,
  githubRepo,
}: {
  projectId: string;
  githubRepo: string | null;
}) {
  const t = useT();
  const [draft, setDraft] = useState(githubRepo ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await updateProjectGithubRepoAction({
        projectId,
        githubRepo: draft,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setDraft(result.githubRepo ?? "");
      setMessage(t("profile.githubSaved"));
    });
  }

  function onClear() {
    setMessage(null);
    startTransition(async () => {
      const result = await updateProjectGithubRepoAction({
        projectId,
        githubRepo: "",
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setDraft("");
      setMessage(t("profile.githubCleared"));
    });
  }

  const href =
    githubRepo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(githubRepo)
      ? `https://github.com/${githubRepo}`
      : null;

  return (
    <ProfileSection
      id="github-repo"
      title={t("profile.githubTitle")}
      description={t("profile.githubDesc")}
      defaultOpen={Boolean(githubRepo)}
      className="border-t border-border pt-8"
    >
      <form onSubmit={onSave} className="space-y-3">
        <label className="block text-sm">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            {t("profile.githubLabel")}
          </span>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="owner/repository"
            autoComplete="off"
            spellCheck={false}
            className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-nav"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-[var(--radius)] border border-border-strong bg-panel px-3 py-1.5 text-sm font-medium text-foreground transition hover:border-nav disabled:opacity-60"
          >
            {pending ? t("common.loading") : t("common.save")}
          </button>
          {githubRepo ? (
            <button
              type="button"
              disabled={pending}
              onClick={onClear}
              className="rounded-[var(--radius)] px-3 py-1.5 text-sm text-muted transition hover:text-foreground disabled:opacity-60"
            >
              {t("profile.githubUnlink")}
            </button>
          ) : null}
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-sm text-nav transition hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t("profile.githubOpen")}
            </a>
          ) : null}
        </div>
        {message ? (
          <p className="text-sm text-muted" role="status">
            {message}
          </p>
        ) : null}
      </form>
    </ProfileSection>
  );
}
