"use client";

import { signIn } from "next-auth/react";

export type OAuthProviderId = "google" | "github";

export type ClientSignInResult =
  | { ok: true }
  | { ok: false; error: string; code?: "insecure_origin" | "provider" | "unknown" };

/**
 * Relative path only — absolute http(s) URLs can disagree with AUTH_URL
 * (e.g. user on http:// while AUTH_URL is https://) and break the OAuth round-trip.
 */
export function safeAuthCallbackUrl(preferred?: string | null): string {
  if (preferred?.startsWith("/") && !preferred.startsWith("//")) {
    return preferred;
  }
  if (typeof window === "undefined") return "/";
  const path = `${window.location.pathname}${window.location.search}` || "/";
  return path.startsWith("/") ? path : "/";
}

/** Google (and most OAuth) reject non-HTTPS production origins; localhost is exempt. */
export function isInsecureNonLocalOrigin(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.protocol !== "http:") return false;
  const host = window.location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

/**
 * Start Auth.js OAuth. Surfaces failures instead of a silent no-op.
 * Uses redirect: false so we can show errors, then navigates to the provider URL.
 */
export async function startOAuthSignIn(
  provider: OAuthProviderId,
  callbackUrl?: string | null,
): Promise<ClientSignInResult> {
  if (isInsecureNonLocalOrigin()) {
    return {
      ok: false,
      code: "insecure_origin",
      error:
        "This site is served over HTTP. Google/GitHub OAuth requires HTTPS in production. Open https://brain.freakydev.com (enable TLS on the host) and set AUTH_URL to that HTTPS URL.",
    };
  }

  try {
    const result = await signIn(provider, {
      callbackUrl: safeAuthCallbackUrl(callbackUrl),
      redirect: false,
    });

    if (!result) {
      return {
        ok: false,
        code: "unknown",
        error: "Sign-in returned no result. Is Auth.js configured on the server?",
      };
    }

    if (result.error) {
      return {
        ok: false,
        code: "provider",
        error:
          result.error === "Configuration"
            ? "Auth is misconfigured (missing AUTH_SECRET or provider secrets)."
            : result.error === "AccessDenied"
              ? "Access denied (not on allowlist)."
              : result.error,
      };
    }

    if (result.url) {
      window.location.assign(result.url);
      return { ok: true };
    }

    return {
      ok: false,
      code: "provider",
      error: "Sign-in did not return a provider URL.",
    };
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : "Sign-in failed. Check AUTH_URL, OAuth redirect URIs, and provider secrets.";
    return { ok: false, code: "unknown", error: message };
  }
}
