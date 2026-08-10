import { notFound } from "next/navigation";
import { listDesignFocusTree } from "@/features/design-focus/actions";
import { getProject } from "@/features/projects/actions";
import { ProjectProfile } from "@/features/projects/project-profile";

export default async function ProjectProfilePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const tree = await listDesignFocusTree(projectId);

  return (
    <ProjectProfile
      projectId={projectId}
      projectName={project.name}
      projectType={project.type}
      createdAt={project.createdAt}
      genres={project.genres.map((row) => ({
        role: row.role,
        genre: {
          name: row.genre.name,
          slug: row.genre.slug,
          templateKey: row.genre.templateKey,
        },
      }))}
      customGameType={project.gameProfile?.customGameType ?? null}
      intentVersions={project.intents.map((intent) => ({
        id: intent.id,
        version: intent.version,
        content: intent.content,
        isOriginal: intent.isOriginal,
        reason: intent.reason,
        createdAt: intent.createdAt,
      }))}
      focusTree={tree}
      focusOptions={project.designFocuses.map((f) => ({
        id: f.id,
        name: f.name,
      }))}
    />
  );
}
