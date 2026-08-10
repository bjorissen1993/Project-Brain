import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ContextPanel } from "@/features/analysis/context-panel";
import { getBalanceSnapshot } from "@/features/design-focus/balance-engine";
import {
  FocusWorkspaceProvider,
  WorkspaceContextRail,
} from "@/features/focus-space";
import { extractAiRelationEvidence } from "@/features/focus-space/ai-relation-evidence";
import { analyzeRecentIdeaSkew } from "@/features/intelligence/heuristics";
import { ProjectsSidebar } from "@/features/projects/projects-sidebar";
import { getProject, listProjects } from "@/features/projects/actions";
import type { DesignFocus, ProjectNode } from "@/types";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  // Keep the setup wizard uncluttered until configuration is complete.
  if (!project.setupCompleted) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  const [projects, balance, skew] = await Promise.all([
    listProjects(),
    getBalanceSnapshot(projectId),
    analyzeRecentIdeaSkew(projectId).catch(() => null),
  ]);

  const primary = project.genres.find((g) => g.role === "PRIMARY")?.genre;
  const focuses = project.designFocuses as DesignFocus[];
  const nodes = project.nodes as ProjectNode[];
  const classifications = project.classifications.map((c) => ({
    id: c.id,
    nodeId: c.nodeId,
    category: c.category,
    confidence: c.confidence,
    source: c.source,
    metadata: c.metadata,
  }));
  const relations = project.nodeRelations.map((r) => ({
    id: r.id,
    sourceNodeId: r.sourceNodeId,
    targetNodeId: r.targetNodeId,
    type: r.type,
    label: r.label,
    metadata: r.metadata,
  }));
  const aiRelationEvidence = extractAiRelationEvidence(project.aiAnalyses);
  const latestIntent =
    project.intents.length > 0
      ? project.intents[project.intents.length - 1]!.content
      : null;
  const genreInfo = project.genres.map((g) => ({
    name: g.genre.name,
    role: g.role,
  }));

  const observations: string[] = [];
  if (skew?.observation) observations.push(skew.observation);

  const fallbackContext = (
    <ContextPanel projectId={project.id}>
      <div className="surface-card px-3 py-3">
        <p className="text-xs uppercase tracking-wide text-muted">Project</p>
        <p className="mt-1 font-semibold">{project.name}</p>
        <p className="mt-1 text-xs text-muted">
          {project.type}
          {primary ? ` · ${primary.name}` : ""}
        </p>
        <p className="mt-3 text-xs text-muted">
          {project.nodes.length} structure nodes ·{" "}
          {project.designFocuses.length} design focuses
        </p>
      </div>
    </ContextPanel>
  );

  return (
    <FocusWorkspaceProvider
      projectId={project.id}
      projectName={project.name}
      focuses={focuses}
      nodes={nodes}
      classifications={classifications}
      relations={relations}
      aiRelationEvidence={aiRelationEvidence}
      balanceRoots={balance.roots}
      observations={observations}
      intentText={latestIntent}
      genres={genreInfo}
    >
      <WorkspaceShell
        projectId={project.id}
        projectName={project.name}
        sidebar={
          <ProjectsSidebar
            projects={projects}
            currentProjectId={project.id}
          />
        }
        context={<WorkspaceContextRail fallback={fallbackContext} />}
      >
        {children}
      </WorkspaceShell>
    </FocusWorkspaceProvider>
  );
}
