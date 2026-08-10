import { notFound } from "next/navigation";
import Link from "next/link";
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
        <div className="space-y-2">
          <BalanceAIPanel
            projectId={projectId}
            imbalance={imbalance}
            improvements={improvements}
          />
          <p className="text-xs text-muted">
            <Link
              href={`/projects/${projectId}/intelligence`}
              className="text-accent underline"
            >
              Open project intelligence
            </Link>{" "}
            for direction checks and full analysis.
          </p>
        </div>
      }
    />
  );
}
