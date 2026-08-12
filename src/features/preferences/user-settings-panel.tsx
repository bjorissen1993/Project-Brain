"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  initialsFromDisplayName,
  readLocalDisplayName,
  subscribeLocalDisplayName,
  writeLocalDisplayName,
} from "@/features/auth";
import { useTranslations } from "@/features/i18n";
import {
  DEFAULT_FONT_SCALE,
  DEFAULT_THEME,
  LOCALE_OPTIONS,
  readFontScale,
  readTheme,
  subscribeUserPrefs,
  writeFontScale,
  writeLocale,
  writeTheme,
  type FontScaleId,
  type LocaleId,
  type ThemeId,
} from "@/features/preferences";
import { ClaimUnownedSettings } from "@/features/projects/claim-unowned-settings";
import { cn } from "@/lib/utils";

function PrefSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius)] border border-border bg-panel/85 p-5">
      <h2 className="font-display text-lg font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function UserSettingsPanel({
  projectId,
  showClaimUnowned = false,
  unownedCount = 0,
}: {
  projectId?: string;
  showClaimUnowned?: boolean;
  unownedCount?: number;
}) {
  const router = useRouter();
  const { locale, t } = useTranslations();
  const nameId = useId();
  const name = useSyncExternalStore(
    subscribeLocalDisplayName,
    readLocalDisplayName,
    () => DEFAULT_LOCAL_DISPLAY_NAME,
  );
  const theme = useSyncExternalStore(
    subscribeUserPrefs,
    readTheme,
    () => DEFAULT_THEME,
  );
  const fontScale = useSyncExternalStore(
    subscribeUserPrefs,
    readFontScale,
    () => DEFAULT_FONT_SCALE,
  );
  const [draftName, setDraftName] = useState<string | null>(null);
  const nameValue = draftName ?? name;

  const fontLabels = {
    sm: t("settings.fontSm"),
    md: t("settings.fontMd"),
    lg: t("settings.fontLg"),
  } as const;

  const themeMeta: Record<
    ThemeId,
    { label: string; description: string }
  > = {
    dark: {
      label: t("settings.themeDark"),
      description: t("settings.themeDarkDesc"),
    },
    light: {
      label: t("settings.themeLight"),
      description: t("settings.themeLightDesc"),
    },
    mono: {
      label: t("settings.themeMono"),
      description: t("settings.themeMonoDesc"),
    },
    slate: {
      label: t("settings.themeSlate"),
      description: t("settings.themeSlateDesc"),
    },
    charcoal: {
      label: t("settings.themeCharcoal"),
      description: t("settings.themeCharcoalDesc"),
    },
    phosphor: {
      label: t("settings.themePhosphor"),
      description: t("settings.themePhosphorDesc"),
    },
  };

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/");
  }

  return (
    <div className="relative mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <button
        type="button"
        onClick={handleBack}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-nav hover:text-nav-hover sm:min-h-0"
      >
        <ArrowLeft size={14} strokeWidth={2.25} aria-hidden />
        {t("common.back")}
      </button>
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
        {t("settings.account")}
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {t("settings.title")}
      </h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
        {t("settings.intro")}
        {projectId ? (
          <>
            {" "}
            {t("settings.projectSettingsLive")}{" "}
            <Link
              href={`/projects/${projectId}/profile`}
              className="font-medium text-nav hover:text-nav-hover"
            >
              {t("settings.profileLink")}
            </Link>
            .
          </>
        ) : null}
      </p>

      <div className="mt-8 space-y-4">
        {showClaimUnowned ? (
          <PrefSection
            title={t("settings.claimUnownedTitle")}
            description={t("settings.claimUnownedIntro")}
          >
            <ClaimUnownedSettings unownedCount={unownedCount} />
          </PrefSection>
        ) : null}

        <PrefSection
          title={t("settings.displayName")}
          description={t("settings.displayNameDesc")}
        >
          <div className="flex items-center gap-4">
            <span
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-nav-muted text-sm font-bold tracking-wide text-nav"
              aria-hidden
            >
              {initialsFromDisplayName(nameValue)}
            </span>
            <form
              className="min-w-0 flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                writeLocalDisplayName(nameValue);
                setDraftName(null);
              }}
            >
              <label htmlFor={nameId} className="sr-only">
                {t("settings.displayName")}
              </label>
              <input
                id={nameId}
                value={nameValue}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => {
                  writeLocalDisplayName(nameValue);
                  setDraftName(null);
                }}
                maxLength={48}
                className="w-full rounded-[var(--radius)] border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none focus:border-nav"
              />
            </form>
          </div>
        </PrefSection>

        <PrefSection
          title={t("settings.language")}
          description={t("settings.languageDesc")}
        >
          <div className="flex flex-wrap gap-2">
            {LOCALE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                aria-pressed={locale === opt.id}
                onClick={() => writeLocale(opt.id as LocaleId)}
                className={cn(
                  "rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition",
                  locale === opt.id
                    ? "border-nav bg-nav-muted text-nav"
                    : "border-border bg-panel-elevated text-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {locale === "nl" ? (
            <p className="mt-3 text-xs text-muted">
              {t("settings.languageActiveNl")}
            </p>
          ) : null}
        </PrefSection>

        <PrefSection
          title={t("settings.fontSize")}
          description={t("settings.fontSizeDesc")}
        >
          <div className="flex flex-wrap gap-2">
            {(["sm", "md", "lg"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={fontScale === id}
                onClick={() => writeFontScale(id as FontScaleId)}
                className={cn(
                  "rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition",
                  fontScale === id
                    ? "border-nav bg-nav-muted text-nav"
                    : "border-border bg-panel-elevated text-muted hover:border-border-strong hover:text-foreground",
                )}
              >
                {fontLabels[id]}
              </button>
            ))}
          </div>
        </PrefSection>

        <PrefSection
          title={t("settings.theme")}
          description={t("settings.themeDesc")}
        >
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                "dark",
                "light",
                "mono",
                "slate",
                "charcoal",
                "phosphor",
              ] as const
            ).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={theme === id}
                onClick={() => writeTheme(id as ThemeId)}
                className={cn(
                  "rounded-[var(--radius)] border px-3 py-3 text-left transition",
                  theme === id
                    ? "border-nav bg-nav-muted"
                    : "border-border bg-panel-elevated hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "block text-sm font-semibold",
                    theme === id ? "text-nav" : "text-foreground",
                  )}
                >
                  {themeMeta[id].label}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {themeMeta[id].description}
                </span>
              </button>
            ))}
          </div>
        </PrefSection>
      </div>
    </div>
  );
}
