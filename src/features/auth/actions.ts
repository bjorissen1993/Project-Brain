"use server";

import { auth } from "@/auth";
import { prisma } from "@/db/client";
import {
  isAuthEnabled,
  isGithubAuthConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth/allowlist";

export type LinkedProvider = "google" | "github";

export async function getAuthBootstrap() {
  const enabled = isAuthEnabled();
  const session = enabled ? await auth() : null;
  let linked: LinkedProvider[] = [];

  if (session?.user?.id) {
    try {
      const accounts = await prisma.account.findMany({
        where: { userId: session.user.id },
        select: { provider: true },
      });
      linked = accounts
        .map((a) => a.provider)
        .filter((p): p is LinkedProvider => p === "google" || p === "github");
    } catch {
      linked = [];
    }
  }

  return {
    enabled,
    googleAvailable: isGoogleAuthConfigured(),
    githubAvailable: isGithubAuthConfigured(),
    linked,
    user: session?.user
      ? {
          id: session.user.id,
          name: session.user.name ?? null,
          email: session.user.email ?? null,
          image: session.user.image ?? null,
          githubUsername: session.user.githubUsername ?? null,
        }
      : null,
  };
}
