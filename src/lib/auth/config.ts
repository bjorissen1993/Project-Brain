import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import {
  hasAllowlistConfigured,
  isAllowlisted,
  isAuthEnabled,
  isGithubAuthConfigured,
  isGoogleAuthConfigured,
} from "./allowlist";

function githubLoginFromProfile(profile: unknown): string | undefined {
  if (!profile || typeof profile !== "object") return undefined;
  const login = (profile as { login?: unknown }).login;
  return typeof login === "string" && login.trim() ? login.trim() : undefined;
}

/**
 * Edge-safe Auth.js config (no Prisma). Used by middleware and merged into full auth.
 */
export const authConfig = {
  providers: [
    ...(isGoogleAuthConfigured()
      ? [
          Google({
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    ...(isGithubAuthConfigured()
      ? [
          GitHub({
            allowDangerousEmailAccountLinking: true,
            authorization: {
              params: { scope: "read:user user:email" },
            },
          }),
        ]
      : []),
  ],
  pages: {
    signIn: "/login",
    error: "/auth/denied",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    authorized({ auth, request }) {
      if (!isAuthEnabled()) return true;
      const { pathname } = request.nextUrl;
      if (
        pathname.startsWith("/login") ||
        pathname.startsWith("/auth/") ||
        pathname.startsWith("/api/auth")
      ) {
        return true;
      }
      return Boolean(auth?.user);
    },
    async signIn({ user, account, profile }) {
      if (!isAuthEnabled()) return false;
      if (!hasAllowlistConfigured()) {
        console.error(
          "[auth] ALLOWED_EMAILS / ALLOWED_GITHUB_USERS is empty — denying sign-in.",
        );
        return "/auth/denied?error=AllowlistEmpty";
      }

      const githubUsername =
        account?.provider === "github"
          ? githubLoginFromProfile(profile)
          : undefined;

      // Primary identity (email and/or GitHub login) must be allowlisted.
      // When linking a second provider while signed in, that provider's
      // email/login must also pass — put both in the allowlist env vars.
      if (
        isAllowlisted({
          email: user.email,
          githubUsername,
        })
      ) {
        return true;
      }

      return "/auth/denied?error=AccessDenied";
    },
    async jwt({ token, user, account, profile, trigger, session }) {
      if (user?.id) {
        token.sub = user.id;
      }
      if (account?.provider === "github") {
        const login = githubLoginFromProfile(profile);
        if (login) token.githubUsername = login;
      }
      if (trigger === "update" && session && typeof session === "object") {
        const next = session as { githubUsername?: string | null };
        if ("githubUsername" in next) {
          token.githubUsername = next.githubUsername ?? undefined;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.githubUsername =
          typeof token.githubUsername === "string"
            ? token.githubUsername
            : null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
