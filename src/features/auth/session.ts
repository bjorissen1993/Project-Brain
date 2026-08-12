import type { AuthSession, AuthSignInOption, AuthStatus, AuthUser } from "./types";
import {
  DEFAULT_LOCAL_DISPLAY_NAME,
  readLocalDisplayName,
} from "./local-profile";

/**
 * Local-session helpers + static sign-in labels.
 * Provider availability is decided server-side (see getAuthBootstrap / MakerProfileGate).
 */
export const AUTH_SIGN_IN_OPTIONS: AuthSignInOption[] = [
  { id: "github", label: "Continue with GitHub", available: true },
  { id: "google", label: "Continue with Google", available: true },
];

/** Stable local user id until a real provider session exists. */
const LOCAL_USER_ID = "local-workspace";

export function getAuthStatus(): AuthStatus {
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

/** Placeholder session for local mode. */
export function getLocalSession(displayName?: string): AuthSession {
  return {
    user: getLocalAuthUser(displayName),
    expires: null,
    provider: "local",
  };
}
