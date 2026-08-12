/**
 * Auth UI types — Auth.js session when configured; local profile otherwise.
 */

export type AuthProviderId = "github" | "google" | "credentials" | "local";

export type AuthUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  githubUsername?: string | null;
};

export type AuthSession = {
  user: AuthUser;
  /** ISO expiry when a real session exists; null for local-only. */
  expires: string | null;
  provider: AuthProviderId;
};

export type AuthStatus = "authenticated" | "unauthenticated" | "loading";

export type AuthSignInOption = {
  id: "github" | "google";
  label: string;
  available: boolean;
};
