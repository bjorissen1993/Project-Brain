/**
 * Auth foundation types — local profile today; Auth.js / NextAuth later.
 * Keep UI against these shapes so OAuth providers can plug in without redesign.
 */

export type AuthProviderId = "github" | "google" | "credentials" | "local";

export type AuthUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type AuthSession = {
  user: AuthUser;
  /** ISO expiry when a real session exists; null for local-only. */
  expires: string | null;
  provider: AuthProviderId;
};

export type AuthStatus = "authenticated" | "unauthenticated" | "loading";

/** Planned OAuth entry points — UI stubs until Auth.js is wired. */
export type AuthSignInOption = {
  id: "github" | "google";
  label: string;
  available: boolean;
};
