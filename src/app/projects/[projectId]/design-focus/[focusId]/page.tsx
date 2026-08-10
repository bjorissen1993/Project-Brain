import { notFound } from "next/navigation";
import { DesignFocusProgressDashboard } from "@/features/design-focus/design-focus-progress-dashboard";
import { getProject } from "@/features/projects/actions";

export default async function DesignFocusNodePage({
  params,
}: {
  params: Promise<{ projectId: string; focusId: string }>;
}) {
  const { projectId, focusId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const exists = project.designFocuses.some((f) => f.id === focusId);
  if (!exists) notFound();

  return <DesignFocusProgressDashboard focusId={focusId} />;
}
