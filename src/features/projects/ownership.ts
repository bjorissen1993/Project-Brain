import { auth } from "@/auth";
import { prisma } from "@/db/client";
import {
  isAllowlisted,
  isAuthEnabled,
} from "@/lib/auth/allowlist";

export type SessionUser = {
  id: string;
  email?: string | null;
  githubUsername?: string | null;
};

/** Current Auth.js user when auth is enabled; null in anonymous mode. */
export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isAuthEnabled()) return null;
  const session = await auth();
  const user = session?.user;
  const id = user?.id?.trim();
  if (!user || !id) return null;
  return {
    id,
    email: user.email ?? null,
    githubUsername: user.githubUsername ?? null,
  };
}

export function sessionUserIsAllowlisted(user: SessionUser): boolean {
  return isAllowlisted({
    email: user.email,
    githubUsername: user.githubUsername,
  });
}

/**
 * When auth is on, require a signed-in user (for create / claim).
 * Anonymous mode returns null without error.
 */
export async function requireSessionUserWhenAuthEnabled(): Promise<
  | { ok: true; user: SessionUser | null }
  | { ok: false; error: string }
> {
  if (!isAuthEnabled()) {
    return { ok: true, user: null };
  }
  const user = await getSessionUser();
  if (!user) {
    return {
      ok: false,
      error: "Sign in required to create or claim projects.",
    };
  }
  return { ok: true, user };
}

/**
 * Access policy when auth is enabled:
 * - Owner can access
 * - Legacy orphans (userId null) remain reachable by URL until claimed
 * When auth is off, all projects are accessible.
 */
export function canAccessProject(
  project: { userId: string | null },
  user: SessionUser | null,
): boolean {
  if (!isAuthEnabled()) return true;
  if (!user) return false;
  if (project.userId == null) return true;
  return project.userId === user.id;
}

/** Count of projects with no owner (for settings / auto-claim). */
export async function countUnownedProjects(): Promise<number> {
  return prisma.project.count({ where: { userId: null } });
}
