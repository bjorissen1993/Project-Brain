"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/db/client";
import { isAuthEnabled } from "@/lib/auth/allowlist";
import {
  countUnownedProjects,
  getSessionUser,
  requireSessionUserWhenAuthEnabled,
  sessionUserIsAllowlisted,
} from "./ownership";

export type ClaimResult =
  | { ok: true; claimed: number }
  | { ok: false; error: string };

/**
 * Claim specific unowned projects (from localStorage orphan list after login).
 * Only rows with userId null are updated.
 */
export async function claimProjectsByIdsAction(
  projectIds: string[],
): Promise<ClaimResult> {
  const gate = await requireSessionUserWhenAuthEnabled();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.user) {
    return { ok: false, error: "Sign in required to claim projects." };
  }

  const ids = [
    ...new Set(
      projectIds
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);

  if (ids.length === 0) {
    return { ok: true, claimed: 0 };
  }

  const result = await prisma.project.updateMany({
    where: { id: { in: ids }, userId: null },
    data: { userId: gate.user.id },
  });

  if (result.count > 0) {
    revalidatePath("/");
  }
  return { ok: true, claimed: result.count };
}

/**
 * Allowlisted users: claim every project with null userId (legacy data).
 */
export async function claimAllUnownedProjectsAction(): Promise<ClaimResult> {
  const gate = await requireSessionUserWhenAuthEnabled();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.user) {
    return { ok: false, error: "Sign in required to claim projects." };
  }
  if (!sessionUserIsAllowlisted(gate.user)) {
    return {
      ok: false,
      error: "Only allowlisted accounts can claim all unowned projects.",
    };
  }

  const result = await prisma.project.updateMany({
    where: { userId: null },
    data: { userId: gate.user.id },
  });

  if (result.count > 0) {
    revalidatePath("/");
    revalidatePath("/settings");
  }
  return { ok: true, claimed: result.count };
}

/**
 * Allowlisted users: claim one unowned project by id or exact name.
 * Only touches rows already in this server's database with userId null.
 */
export async function claimUnownedProjectByKeyAction(
  key: string,
): Promise<ClaimResult> {
  const gate = await requireSessionUserWhenAuthEnabled();
  if (!gate.ok) return { ok: false, error: gate.error };
  if (!gate.user) {
    return { ok: false, error: "Sign in required to claim projects." };
  }
  if (!sessionUserIsAllowlisted(gate.user)) {
    return {
      ok: false,
      error: "Only allowlisted accounts can claim projects by name or id.",
    };
  }

  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a project name or id." };
  }

  const byId = await prisma.project.findFirst({
    where: { id: trimmed, userId: null },
  });
  const matches = byId
    ? [byId]
    : await prisma.project.findMany({
        where: { name: trimmed, userId: null },
        take: 5,
      });

  if (matches.length === 0) {
    return {
      ok: false,
      error:
        "No unowned project with that name or id on this server. Migrate the local database first if the project only exists on localhost.",
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: `Multiple unowned projects named "${trimmed}". Use the project id instead.`,
    };
  }

  await prisma.project.update({
    where: { id: matches[0].id },
    data: { userId: gate.user.id },
  });
  revalidatePath("/");
  revalidatePath("/settings");
  return { ok: true, claimed: 1 };
}

/**
 * Post-login sync:
 * 1) Claim browser-orphan ids
 * 2) If allowlisted and this is the only user in the DB, claim all remaining orphans
 */
export async function syncOwnershipAfterLoginAction(
  orphanIds: string[],
): Promise<
  | { ok: true; claimedByIds: number; claimedAll: number }
  | { ok: false; error: string }
> {
  if (!isAuthEnabled()) {
    return { ok: true, claimedByIds: 0, claimedAll: 0 };
  }

  const byIds = await claimProjectsByIdsAction(orphanIds);
  if (!byIds.ok) return byIds;

  let claimedAll = 0;
  const user = await getSessionUser();
  if (user && sessionUserIsAllowlisted(user)) {
    const userCount = await prisma.user.count();
    const unowned = await countUnownedProjects();
    if (userCount === 1 && unowned > 0) {
      const all = await claimAllUnownedProjectsAction();
      if (all.ok) claimedAll = all.claimed;
    }
  }

  return {
    ok: true,
    claimedByIds: byIds.claimed,
    claimedAll,
  };
}

export async function getOwnershipSettingsBootstrap(): Promise<{
  authEnabled: boolean;
  signedIn: boolean;
  allowlisted: boolean;
  unownedCount: number;
}> {
  const authEnabled = isAuthEnabled();
  if (!authEnabled) {
    return {
      authEnabled: false,
      signedIn: false,
      allowlisted: false,
      unownedCount: 0,
    };
  }
  const user = await getSessionUser();
  if (!user) {
    return {
      authEnabled: true,
      signedIn: false,
      allowlisted: false,
      unownedCount: 0,
    };
  }
  const allowlisted = sessionUserIsAllowlisted(user);
  const unownedCount = allowlisted ? await countUnownedProjects() : 0;
  return {
    authEnabled: true,
    signedIn: true,
    allowlisted,
    unownedCount,
  };
}
