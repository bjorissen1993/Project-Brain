"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { claimAllUnownedProjectsAction } from "@/features/projects/claim-actions";
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

  if (remaining <= 0 && !message) {
    return (
      <p className="text-sm text-muted">{t("settings.claimNone")}</p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {t("settings.claimUnownedDesc", { count: remaining })}
      </p>
      <button
        type="button"
        disabled={pending || remaining <= 0}
        onClick={() => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await claimAllUnownedProjectsAction();
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setRemaining(0);
            setMessage(
              t("settings.claimUnownedDone", { count: result.claimed }),
            );
            router.refresh();
          });
        }}
        className={cn(
          "rounded-[var(--radius)] border border-nav bg-nav-muted px-3 py-2 text-sm font-medium text-nav transition",
          "hover:border-nav hover:bg-nav/15 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {pending ? t("settings.claimUnownedPending") : t("settings.claimUnowned")}
      </button>
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
