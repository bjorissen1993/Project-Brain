import { notFound } from "next/navigation";
import { GameSetupWizard } from "@/features/game-profile/game-setup-wizard";
import { GenericSetupWizard } from "@/features/projects/generic-setup-wizard";
import { getProject } from "@/features/projects/actions";
import { isNonGameProjectType } from "@/features/projects/type-templates";

export default async function SetupPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  if (isNonGameProjectType(project.type)) {
    return (
      <GenericSetupWizard
        projectId={project.id}
        projectName={project.name}
        projectType={project.type}
      />
    );
  }

  return (
    <GameSetupWizard projectId={project.id} projectName={project.name} />
  );
}
