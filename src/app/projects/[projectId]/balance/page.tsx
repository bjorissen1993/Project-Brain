import { notFound } from "next/navigation";
import { getProject } from "@/features/projects/actions";
import { getBalanceSnapshot } from "@/features/design-focus/balance-engine";
import { BalanceDashboard } from "@/features/design-focus/balance-dashboard";
import { BalanceAIPanel } from "@/features/analysis/balance-ai-panel";
import {
  getLatestImbalanceAnalysis,
  listPendingImprovements,
} from "@/features/analysis/project-analysis-actions";

export default async function BalancePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const [snapshot, imbalance, improvements] = await Promise.all([
    getBalanceSnapshot(projectId),
    getLatestImbalanceAnalysis(projectId),
    listPendingImprovements(projectId),
  ]);

  return (
    <BalanceDashboard
      projectId={projectId}
      snapshot={snapshot}
      aiSlot={
        <BalanceAIPanel
          projectId={projectId}
          imbalance={imbalance}
          improvements={improvements}
        />
      }
    />
  );
}
