"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, LogOut, Settings } from "lucide-react";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  initialsFromDisplayName,
  readLocalDisplayName,
  subscribeLocalDisplayName,
  writeLocalDisplayName,
} from "@/features/auth";
import { useT } from "@/features/i18n";
import { cn } from "@/lib/utils";

type ProviderId = "github" | "google";

export function MakerProfile({
  className,
  authEnabled = false,
  googleAvailable = false,
  githubAvailable = false,
  linkedProviders = [],
}: {
  className?: string;
  authEnabled?: boolean;
  googleAvailable?: boolean;
  githubAvailable?: boolean;
  linkedProviders?: ProviderId[];
}) {
  const t = useT();
  const inputId = useId();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: session, status } = useSession();
  const localName = useSyncExternalStore(
    subscribeLocalDisplayName,
    readLocalDisplayName,
    () => DEFAULT_LOCAL_DISPLAY_NAME,
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_LOCAL_DISPLAY_NAME);
  const [authPending, setAuthPending] = useState<ProviderId | "signout" | null>(
    null,
  );

  const authenticated = authEnabled && status === "authenticated" && session?.user;
  const name = authenticated
    ? session.user.name?.trim() ||
      session.user.email?.trim() ||
      localName
    : localName;
  const email = authenticated ? session.user.email : null;
  const image = authenticated ? session.user.image : null;
  const linked = new Set(linkedProviders);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setEditing(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setEditing(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function startEditing() {
    if (authenticated) return;
    setDraft(name);
    setEditing(true);
    queueMicrotask(() => inputRef.current?.focus());
  }

  function commit(next: string) {
    const cleaned = next.trim() || DEFAULT_LOCAL_DISPLAY_NAME;
    writeLocalDisplayName(cleaned);
    setDraft(cleaned);
    setEditing(false);
  }

  async function onSignIn(provider: ProviderId) {
    setAuthPending(provider);
    try {
      await signIn(provider, { callbackUrl: window.location.href });
    } finally {
      setAuthPending(null);
    }
  }

  async function onSignOut() {
    setAuthPending("signout");
    try {
      await signOut({ callbackUrl: "/login" });
    } finally {
      setAuthPending(null);
    }
  }

  const initials = initialsFromDisplayName(name);
  const options: { id: ProviderId; label: string; available: boolean }[] = [
    {
      id: "github",
      label: t("landing.continueGithub"),
      available: githubAvailable,
    },
    {
      id: "google",
      label: t("landing.continueGoogle"),
      available: googleAvailable,
    },
  ];

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-panel/80 px-3 py-2 backdrop-blur-sm transition hover:border-border-strong hover:bg-panel"
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nav-muted text-xs font-bold tracking-wide text-nav"
            aria-hidden
          >
            {initials}
          </span>
        )}
        <div className="min-w-0 text-left">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {t("landing.yourWorkspace")}
          </p>
          <p className="mt-0.5 max-w-[12rem] truncate text-sm font-semibold text-foreground">
            {name}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition",
            open ? "rotate-180" : null,
          )}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t("nav.profile")}
          className="absolute right-0 z-40 mt-1.5 w-[17.5rem] overflow-hidden rounded-[var(--radius)] border border-border-strong bg-[#1a1a1a] shadow-lg"
        >
          <div className="flex items-center gap-3 border-b border-border px-3.5 py-3">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image}
                alt=""
                className="h-11 w-11 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-nav-muted text-sm font-bold tracking-wide text-nav"
                aria-hidden
              >
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {authenticated ? t("landing.signedInAs") : t("landing.displayName")}
              </p>
              {editing && !authenticated ? (
                <form
                  className="mt-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    commit(draft);
                  }}
                >
                  <label htmlFor={inputId} className="sr-only">
                    {t("landing.displayName")}
                  </label>
                  <input
                    ref={inputRef}
                    id={inputId}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => commit(draft)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.stopPropagation();
                        setDraft(name);
                        setEditing(false);
                      }
                    }}
                    maxLength={48}
                    className="w-full rounded border border-border-strong bg-background px-2 py-1 text-sm font-semibold text-foreground outline-none focus:border-nav"
                  />
                </form>
              ) : (
                <button
                  type="button"
                  onClick={startEditing}
                  className="mt-0.5 block w-full truncate text-left text-sm font-semibold text-foreground hover:text-nav"
                  title={
                    authenticated
                      ? undefined
                      : t("landing.editDisplayName")
                  }
                >
                  {name}
                </button>
              )}
              <p className="mt-1 truncate text-[11px] text-muted">
                {authenticated
                  ? email || t("landing.signedInWorkspace")
                  : t("landing.localWorkspace")}
              </p>
            </div>
          </div>

          <div className="border-b border-border px-2 py-1.5">
            <Link
              href="/settings"
              onClick={() => {
                setOpen(false);
                setEditing(false);
              }}
              className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] text-foreground transition hover:bg-panel hover:text-nav"
            >
              <Settings className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{t("landing.profileSettings")}</span>
            </Link>
          </div>

          {authEnabled ? (
            <div className="px-3.5 py-3">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {authenticated ? t("landing.linkAccounts") : t("landing.signIn")}
              </p>
              <div className="space-y-1.5">
                {options.map((option) => {
                  const isLinked = linked.has(option.id);
                  const disabled =
                    !option.available ||
                    authPending !== null ||
                    (authenticated && isLinked);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={disabled}
                      title={
                        !option.available
                          ? t("landing.providerNotConfigured")
                          : isLinked
                            ? t("landing.providerLinked")
                            : undefined
                      }
                      onClick={() => onSignIn(option.id)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-[var(--radius)] border px-3 py-2 text-left text-[13px] transition",
                        disabled
                          ? "border-border bg-panel/60 text-muted opacity-70"
                          : "border-border bg-panel/60 text-foreground hover:border-nav hover:bg-panel",
                      )}
                    >
                      <span className="inline-flex items-center gap-2.5">
                        <ProviderGlyph provider={option.id} />
                        <span>{option.label}</span>
                      </span>
                      {isLinked ? (
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-nav">
                          {t("landing.linked")}
                        </span>
                      ) : authPending === option.id ? (
                        <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted">
                          …
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2 px-3.5 py-3">
              <p className="text-[11px] text-muted">
                {t("landing.authDisabledHint")}
              </p>
              <Link
                href="/login"
                onClick={() => {
                  setOpen(false);
                  setEditing(false);
                }}
                className="inline-flex text-[12px] font-medium text-nav transition hover:underline"
              >
                {t("landing.signIn")}
              </Link>
            </div>
          )}

          <div className="border-t border-border px-2 py-1.5">
            <button
              type="button"
              disabled={!authenticated || authPending !== null}
              onClick={onSignOut}
              title={
                authenticated ? undefined : t("landing.signOutNeedsSession")
              }
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-[13px] transition",
                authenticated
                  ? "text-foreground hover:bg-panel hover:text-nav"
                  : "text-muted opacity-60",
              )}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden />
              <span>{t("landing.signOut")}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProviderGlyph({ provider }: { provider: ProviderId }) {
  if (provider === "github") {
    return (
      <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="#EA4335"
        d="M8 3.2c1.2 0 2.27.42 3.12 1.24l2.33-2.33C12.17.78 10.22 0 8 0 4.87 0 2.16 1.8.96 4.42l2.7 2.1C4.28 4.4 5.98 3.2 8 3.2z"
      />
      <path
        fill="#4285F4"
        d="M15.64 8.18c0-.55-.05-1.08-.14-1.59H8v3.01h4.28a3.66 3.66 0 0 1-1.59 2.4l2.57 2c1.5-1.39 2.38-3.43 2.38-5.82z"
      />
      <path
        fill="#FBBC05"
        d="M3.66 9.52A4.8 4.8 0 0 1 3.4 8c0-.53.09-1.04.25-1.52l-2.7-2.1A7.97 7.97 0 0 0 0 8c0 1.29.31 2.51.85 3.59l2.81-2.07z"
      />
      <path
        fill="#34A853"
        d="M8 16c2.16 0 3.97-.71 5.3-1.94l-2.57-2A4.78 4.78 0 0 1 8 12.8c-2.02 0-3.72-1.2-4.34-2.88l-2.7 2.1C2.16 14.2 4.87 16 8 16z"
      />
    </svg>
  );
}
