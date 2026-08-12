"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncOwnershipAfterLoginAction } from "@/features/projects/claim-actions";
import {
  clearOrphanProjectIds,
  readOrphanProjectIds,
} from "@/features/projects/orphan-projects";

/**
 * After OAuth sign-in: attach browser-orphan project ids, and (solo allowlisted
 * user) claim all remaining unowned projects once.
 */
export function ClaimOrphansOnLogin() {
  const { status } = useSession();
  const router = useRouter();
  const ranForSession = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      ranForSession.current = false;
      return;
    }
    if (ranForSession.current) return;
    ranForSession.current = true;

    const orphanIds = readOrphanProjectIds();
    void (async () => {
      try {
        const result = await syncOwnershipAfterLoginAction(orphanIds);
        if (!result.ok) return;
        if (orphanIds.length > 0) {
          clearOrphanProjectIds();
        }
        if (result.claimedByIds > 0 || result.claimedAll > 0) {
          router.refresh();
        }
      } catch {
        // Non-blocking; settings still offers manual claim.
      }
    })();
  }, [status, router]);

  return null;
}
