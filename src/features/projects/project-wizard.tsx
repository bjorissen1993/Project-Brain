"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FieldError, Input, Label } from "@/components/ui/field";
import { useT, type MessageKey } from "@/features/i18n";
import { createProjectAction } from "@/features/projects/actions";
import { rememberOrphanProjectId } from "@/features/projects/orphan-projects";
import { iconKeyForProjectType, PbIcon } from "@/lib/icons";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL_KEY: Record<ProjectType, MessageKey> = {
  GAME: "landing.typeGame",
  SOFTWARE: "landing.typeSoftware",
  APP: "landing.typeApp",
  CREATIVE: "landing.typeCreative",
  OTHER: "landing.typeOther",
  CUSTOM: "landing.typeCustom",
};

const TYPE_DESC_KEY: Record<ProjectType, MessageKey> = {
  GAME: "setup.typeGameDesc",
  SOFTWARE: "setup.typeSoftwareDesc",
  APP: "setup.typeAppDesc",
  CREATIVE: "setup.typeCreativeDesc",
  OTHER: "setup.typeOtherDesc",
  CUSTOM: "setup.typeCustomDesc",
};

export function ProjectWizard() {
  const t = useT();
  const router = useRouter();
  const [type, setType] = useState<ProjectType | null>(null);
  const [name, setName] = useState("");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = PROJECT_TYPE_OPTIONS.find((o) => o.value === type);
  const hasUnsavedInput =
    type != null || name.trim().length > 0 || customTypeLabel.trim().length > 0;

  function requestCancel() {
    if (hasUnsavedInput) {
      setLeaveOpen(true);
      return;
    }
    router.push("/");
  }

  const continueLabel =
    selected?.setupTier === "full"
      ? t("setup.continueGame")
      : t("setup.continueProject");

  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">
          {t("setup.eyebrow")}
        </p>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={requestCancel}
          className="text-xs"
        >
          {t("setup.cancelHome")}
        </Button>
      </div>
      <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight">
        {t("setup.whatType")}
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-muted">
        {t("setup.intro")}
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {PROJECT_TYPE_OPTIONS.map((option) => {
          const active = type === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setType(option.value);
                setError(null);
              }}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-4 text-left transition",
                active
                  ? "border-nav bg-nav-muted"
                  : "border-border bg-panel hover:border-border-strong",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] border md:h-12 md:w-12",
                      active
                        ? "border-nav/40 bg-nav/10 text-nav"
                        : "border-border bg-panel-elevated text-muted",
                    )}
                  >
                    <PbIcon
                      icon={iconKeyForProjectType(option.value)}
                      size={32}
                      className="h-5 w-5 md:h-8 md:w-8"
                    />
                  </span>
                  <span className="font-medium">
                    {t(TYPE_LABEL_KEY[option.value])}
                  </span>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[10px] uppercase tracking-wide",
                    option.setupTier === "full" ? "text-accent" : "text-muted",
                  )}
                >
                  {option.setupTier === "full"
                    ? t("setup.badgeFull")
                    : t("setup.badgeGeneral")}
                </span>
              </div>
              <p className="mt-2 text-sm text-muted">
                {t(TYPE_DESC_KEY[option.value])}
              </p>
            </button>
          );
        })}
      </div>

      {type ? (
        <div className="mt-10 max-w-2xl space-y-4 border-t border-border pt-8">
          {selected?.setupTier === "general" ? (
            <div className="surface-card p-4 text-sm text-muted">
              {t("setup.generalInfo", { game: t("landing.typeGame") })}
            </div>
          ) : null}

          <div>
            <Label htmlFor="projectName">{t("setup.projectName")}</Label>
            <Input
              id="projectName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("setup.namePlaceholder")}
            />
          </div>

          {type === "CUSTOM" ? (
            <div>
              <Label htmlFor="customType">{t("setup.customTypeLabel")}</Label>
              <Input
                id="customType"
                value={customTypeLabel}
                onChange={(e) => setCustomTypeLabel(e.target.value)}
                placeholder={t("setup.customTypePlaceholder")}
              />
            </div>
          ) : null}

          <FieldError>{error}</FieldError>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              disabled={
                pending ||
                !name.trim() ||
                (type === "CUSTOM" && !customTypeLabel.trim())
              }
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await createProjectAction({
                    name,
                    type,
                    customTypeLabel: customTypeLabel || undefined,
                  });
                  if (!result || !result.ok) {
                    setError(result?.error ?? t("setup.createFailed"));
                    return;
                  }
                  if (result.orphan) {
                    rememberOrphanProjectId(result.projectId);
                  }
                  router.push(`/projects/${result.projectId}/setup`);
                });
              }}
            >
              {pending ? t("setup.creating") : continueLabel}
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={leaveOpen}
        title={t("setup.leaveTitle")}
        message={t("setup.leaveMessage")}
        cancelLabel={t("setup.stay")}
        confirmLabel={t("setup.leave")}
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          router.push("/");
        }}
      />
    </div>
  );
}
