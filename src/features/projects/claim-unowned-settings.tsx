"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  claimAllUnownedProjectsAction,
  claimUnownedProjectByKeyAction,
} from "@/features/projects/claim-actions";
import { useT } from "@/features/i18n";
import { cn } from "@/lib/utils";

export function ClaimUnownedSettings({
  unownedCount,
}: {
  unownedCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(unownedCount);
  const [projectKey, setProjectKey] = useState("");

  const runClaimAll = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await claimAllUnownedProjectsAction();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemaining(0);
      setMessage(t("settings.claimUnownedDone", { count: result.claimed }));
      router.refresh();
    });
  };

  const runClaimByKey = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await claimUnownedProjectByKeyAction(projectKey);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setRemaining((n) => Math.max(0, n - result.claimed));
      setProjectKey("");
      setMessage(t("settings.claimUnownedDone", { count: result.claimed }));
      router.refresh();
    });
  };

  return (
    <div className="space-y-3">
      {remaining > 0 ? (
        <>
          <p className="text-sm text-muted">
            {t("settings.claimUnownedDesc", { count: remaining })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={runClaimAll}
            className={cn(
              "rounded-[var(--radius)] border border-nav bg-nav-muted px-3 py-2 text-sm font-medium text-nav transition",
              "hover:border-nav hover:bg-nav/15 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {pending
              ? t("settings.claimUnownedPending")
              : t("settings.claimUnowned")}
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">{t("settings.claimNone")}</p>
          <p className="text-sm text-muted">{t("settings.claimNoneHint")}</p>
        </>
      )}

      <form
        className="space-y-2 border-t border-border pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          runClaimByKey();
        }}
      >
        <p className="text-sm text-muted">{t("settings.claimByKeyDesc")}</p>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={projectKey}
            onChange={(e) => setProjectKey(e.target.value)}
            placeholder={t("settings.claimByKeyPlaceholder")}
            disabled={pending}
            className="min-w-[12rem] flex-1 rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={pending || !projectKey.trim()}
            className={cn(
              "rounded-[var(--radius)] border border-nav bg-nav-muted px-3 py-2 text-sm font-medium text-nav transition",
              "hover:border-nav hover:bg-nav/15 disabled:cursor-not-allowed disabled:opacity-50",
            )}
          >
            {pending
              ? t("settings.claimUnownedPending")
              : t("settings.claimByKey")}
          </button>
        </div>
      </form>

      {message ? (
        <p className="text-sm text-nav" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
