import { prisma } from "@/db/client";
import { getBalanceSnapshot } from "@/features/design-focus/balance-engine";

export type RecentSkewObservation = {
  sampleSize: number;
  primaryFocusCounts: { focusId: string; name: string; count: number; share: number }[];
  skewed: boolean;
  observation: string | null;
  topFocusShare: number;
  intentHint?: string;
};

/**
 * Last N Ready/created mechanics by primary classification — flag skew vs intent.
 */
export async function analyzeRecentIdeaSkew(
  projectId: string,
  n = 12,
): Promise<RecentSkewObservation> {
  const nodes = await prisma.node.findMany({
    where: {
      projectId,
      OR: [{ status: "READY" }, { type: "MECHANIC" }, { type: "IDEA" }],
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: n,
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      classifications: {
        select: { category: true, confidence: true, metadata: true, source: true },
      },
    },
  });

  const focuses = await prisma.designFocus.findMany({
    where: { projectId },
    select: { id: true, name: true, targetImportance: true, parentId: true },
  });
  const focusName = new Map(focuses.map((f) => [f.id, f.name]));
  const rootTargets = focuses.filter((f) => !f.parentId);
  const targetTotal = rootTargets.reduce(
    (a, f) => a + Math.max(0, f.targetImportance),
    0,
  );

  const counts = new Map<string, number>();
  for (const node of nodes) {
    const active = node.classifications.filter((c) => {
      const st = (c.metadata as { status?: string } | null)?.status;
      return st !== "rejected";
    });
    if (!active.length) continue;
    // Primary = highest confidence, then weight.
    const primary = [...active].sort((a, b) => {
      const cw = (b.confidence ?? 0) - (a.confidence ?? 0);
      if (cw !== 0) return cw;
      const aw = (a.metadata as { weight?: number } | null)?.weight ?? 0;
      const bw = (b.metadata as { weight?: number } | null)?.weight ?? 0;
      return bw - aw;
    })[0];
    if (!primary) continue;
    counts.set(primary.category, (counts.get(primary.category) ?? 0) + 1);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const primaryFocusCounts = [...counts.entries()]
    .map(([focusId, count]) => ({
      focusId,
      name: focusName.get(focusId) ?? focusId,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const top = primaryFocusCounts[0];
  const topFocusShare = top?.share ?? 0;

  // Skew if top primary share is high AND normalized intent target for that root is much lower.
  let skewed = false;
  let observation: string | null = null;
  if (top && total >= 4 && topFocusShare >= 50) {
    const focus = focuses.find((f) => f.id === top.focusId);
    let rootId = focus?.id;
    let walk = focus;
    while (walk?.parentId) {
      rootId = walk.parentId;
      walk = focuses.find((f) => f.id === walk!.parentId);
    }
    const root = focuses.find((f) => f.id === rootId);
    const normTarget =
      root && targetTotal > 0
        ? (root.targetImportance / targetTotal) * 100
        : 0;
    if (normTarget > 0 && topFocusShare - normTarget >= 25) {
      skewed = true;
      observation = `Recent ideas skew toward "${top.name}" (${topFocusShare}% of last ${total} classified) vs ~${Math.round(normTarget)}% normalized intent target. Worth a conscious check — not automatically wrong.`;
    } else if (!root || normTarget === 0) {
      skewed = topFocusShare >= 60;
      observation = skewed
        ? `Recent ideas cluster on "${top.name}" (${topFocusShare}%). Compare against your stated intent.`
        : null;
    }
  }

  return {
    sampleSize: nodes.length,
    primaryFocusCounts,
    skewed,
    observation,
    topFocusShare,
  };
}

export type GamePhaseAnalysis = {
  counts: { phase: string; count: number; share: number }[];
  untagged: number;
  observation: string | null;
};

export async function analyzeGamePhaseDistribution(
  projectId: string,
): Promise<GamePhaseAnalysis> {
  const nodes = await prisma.node.findMany({
    where: { projectId, type: { not: "FOLDER" } },
    select: { gamePhase: true },
  });
  const countsMap = new Map<string, number>();
  let untagged = 0;
  for (const n of nodes) {
    if (!n.gamePhase) {
      untagged++;
      continue;
    }
    countsMap.set(n.gamePhase, (countsMap.get(n.gamePhase) ?? 0) + 1);
  }
  const tagged = nodes.length - untagged;
  const order = ["EARLY", "MID", "LATE", "ENDGAME"];
  const counts = order.map((phase) => {
    const count = countsMap.get(phase) ?? 0;
    return {
      phase,
      count,
      share: tagged > 0 ? Math.round((count / tagged) * 100) : 0,
    };
  });

  let observation: string | null = null;
  if (tagged >= 4) {
    const early = counts.find((c) => c.phase === "EARLY")?.share ?? 0;
    const late =
      (counts.find((c) => c.phase === "LATE")?.share ?? 0) +
      (counts.find((c) => c.phase === "ENDGAME")?.share ?? 0);
    if (early >= 70) {
      observation =
        "Most tagged content sits in Early game — Mid/Late may be underdeveloped relative to a full progression arc.";
    } else if (late >= 60 && early <= 15) {
      observation =
        "Content skews Late/Endgame with little Early scaffolding — check onboarding / early-loop intent.";
    }
  } else if (nodes.length > 0 && tagged === 0) {
    observation =
      "No game phases tagged yet. Set Early/Mid/Late/Endgame on nodes to enable progression analysis.";
  }

  return { counts, untagged, observation };
}

export type DirectionTrigger = {
  shouldTrigger: boolean;
  reasons: string[];
};

/**
 * Occasional direction-check triggers (not constant).
 */
export async function shouldTriggerDirectionCheck(
  projectId: string,
): Promise<DirectionTrigger> {
  const reasons: string[] = [];
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 14);

  const recentSamePurpose = await prisma.node.findMany({
    where: {
      projectId,
      type: "MECHANIC",
      updatedAt: { gte: since },
    },
    select: {
      id: true,
      classifications: {
        select: { category: true, metadata: true, confidence: true },
      },
    },
    take: 30,
  });

  const purposeCounts = new Map<string, number>();
  for (const n of recentSamePurpose) {
    const active = n.classifications.filter(
      (c) => (c.metadata as { status?: string } | null)?.status !== "rejected",
    );
    const primary = [...active].sort(
      (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
    )[0];
    if (primary) {
      purposeCounts.set(
        primary.category,
        (purposeCounts.get(primary.category) ?? 0) + 1,
      );
    }
  }
  for (const [, count] of purposeCounts) {
    if (count >= 5) {
      reasons.push("many_recent_mechanics_same_purpose");
      break;
    }
  }

  const snapshot = await getBalanceSnapshot(projectId);
  const flat: { status: string; name: string }[] = [];
  const walk = (nodes: typeof snapshot.roots) => {
    for (const n of nodes) {
      flat.push({ status: n.status, name: n.name });
      walk(n.children);
    }
  };
  walk(snapshot.roots);
  if (flat.some((f) => f.status === "red")) {
    // Only trigger if we also had a recent green→red signal via quick_reanalysis meta.
    const recentShift = await prisma.aIAnalysis.findFirst({
      where: {
        projectId,
        type: "quick_reanalysis",
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
    });
    const shifts =
      (recentShift?.metadata as { balanceShifts?: { from: string; to: string }[] } | null)
        ?.balanceShifts ?? [];
    if (shifts.some((s) => s.from === "green" && s.to === "red")) {
      reasons.push("category_green_to_red");
    }
  }

  const largeFolder = await prisma.node.findFirst({
    where: {
      projectId,
      status: "READY",
      type: { in: ["FOLDER", "ACT"] },
      updatedAt: { gte: since },
      children: { some: {} },
    },
    select: {
      id: true,
      name: true,
      _count: { select: { children: true } },
    },
  });
  if (largeFolder && largeFolder._count.children >= 5) {
    reasons.push("large_folder_ready");
  }

  const skew = await analyzeRecentIdeaSkew(projectId);
  if (skew.skewed) {
    reasons.push("distribution_drifting_from_intent");
  }

  const completedAct = await prisma.node.findFirst({
    where: {
      projectId,
      type: "ACT",
      status: "READY",
      updatedAt: { gte: since },
    },
    select: { id: true },
  });
  if (completedAct) {
    reasons.push("milestone_act_complete");
  }

  // Don't nag: suppress if a direction check was answered recently.
  const recentAnswer = await prisma.directionCheck.findFirst({
    where: {
      projectId,
      status: { in: ["answered", "awaiting_response"] },
      createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7) },
    },
  });
  if (recentAnswer) {
    return { shouldTrigger: false, reasons };
  }

  return {
    shouldTrigger: reasons.length > 0,
    reasons,
  };
}
