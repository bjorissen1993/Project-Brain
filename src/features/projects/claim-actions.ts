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
