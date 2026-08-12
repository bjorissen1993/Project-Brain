"use client";

import { useState } from "react";
import { startOAuthSignIn } from "@/features/auth/client-sign-in";

export function LoginForm({
  callbackUrl,
  googleAvailable,
  githubAvailable,
  error,
}: {
  callbackUrl: string;
  googleAvailable: boolean;
  githubAvailable: boolean;
  error?: string;
}) {
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  async function onProvider(provider: "google" | "github") {
    setClientError(null);
    setPending(provider);
    try {
      const result = await startOAuthSignIn(provider, callbackUrl);
      if (!result.ok) {
        setClientError(result.error);
      }
    } finally {
      setPending(null);
    }
  }

  const errorMessage =
    clientError ||
    (error === "AccessDenied" || error === "Configuration"
      ? "Access denied. Your account is not on the allowlist, or auth is misconfigured."
      : error === "AllowlistEmpty"
        ? "Allowlist is empty on the server. Ask the owner to set ALLOWED_EMAILS / ALLOWED_GITHUB_USERS."
        : error
          ? `Sign-in error: ${error}`
          : null);

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <p
          className="rounded-[var(--radius)] border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      {githubAvailable ? (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => onProvider("github")}
          className="flex w-full items-center justify-center gap-2.5 rounded-[var(--radius)] border border-border-strong bg-panel px-4 py-3 text-sm font-medium text-foreground transition hover:border-nav hover:bg-panel-elevated disabled:opacity-60"
        >
          <GitHubGlyph />
          {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
        </button>
      ) : null}

      {googleAvailable ? (
        <button
          type="button"
          disabled={pending !== null}
          onClick={() => onProvider("google")}
          className="flex w-full items-center justify-center gap-2.5 rounded-[var(--radius)] border border-border-strong bg-panel px-4 py-3 text-sm font-medium text-foreground transition hover:border-nav hover:bg-panel-elevated disabled:opacity-60"
        >
          <GoogleGlyph />
          {pending === "google" ? "Redirecting…" : "Continue with Google"}
        </button>
      ) : null}

      {!githubAvailable && !googleAvailable ? (
        <p className="text-sm text-muted">
          No OAuth providers configured. Set AUTH_GITHUB_* and/or AUTH_GOOGLE_*
          env vars.
        </p>
      ) : null}
    </div>
  );
}

function GitHubGlyph() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function GoogleGlyph() {
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
