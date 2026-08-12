import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import { prisma } from "@/db/client";
import { authConfig } from "@/lib/auth/config";

/**
 * Full Auth.js instance (Node): Prisma adapter for User/Account linking + JWT sessions.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Custom Prisma client output path — adapter types expect @prisma/client.
  adapter: PrismaAdapter(prisma as never),
  events: {
    async linkAccount({ user, profile, account }) {
      if (account.provider !== "github") return;
      const login =
        profile &&
        typeof profile === "object" &&
        "login" in profile &&
        typeof (profile as { login?: unknown }).login === "string"
          ? (profile as { login: string }).login.trim()
          : undefined;
      if (!login || !user.id) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { githubUsername: login },
      });
    },
  },
});