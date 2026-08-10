import type { AuthSession, AuthSignInOption, AuthStatus, AuthUser } from "./types";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  readLocalDisplayName,
} from "./local-profile";

/**
 * Session shell for future Auth.js / NextAuth wiring.
 * Today: local anonymous workspace identity only — no network auth.
 */

export const AUTH_SIGN_IN_OPTIONS: AuthSignInOption[] = [
  { id: "github", label: "Continue with GitHub", available: false },
  { id: "google", label: "Continue with Google", available: false },
];

/** Stable local user id until a real provider session exists. */
const LOCAL_USER_ID = "local-workspace";

export function getAuthStatus(): AuthStatus {
  // Reserved for Auth.js: "loading" | "authenticated" | "unauthenticated"
  return "unauthenticated";
}

export function getLocalAuthUser(displayName?: string): AuthUser {
  const name =
    displayName?.trim() ||
    (typeof window !== "undefined" ? readLocalDisplayName() : DEFAULT_LOCAL_DISPLAY_NAME);
  return {
    id: LOCAL_USER_ID,
    name,
    email: null,
    image: null,
  };
}

/** Placeholder session for local mode — swap for `auth()` / `useSession()` later. */
export function getLocalSession(displayName?: string): AuthSession {
  return {
    user: getLocalAuthUser(displayName),
    expires: null,
    provider: "local",
  };
}

/** No-op stubs — replace with Auth.js signIn / signOut. */
export async function signInWithProvider(
  provider: AuthSignInOption["id"],
): Promise<{ ok: false; reason: "not_configured"; provider: AuthSignInOption["id"] }> {
  return { ok: false, reason: "not_configured", provider };
}

export async function signOut(): Promise<{ ok: false; reason: "not_configured" }> {
  return { ok: false, reason: "not_configured" };
}
