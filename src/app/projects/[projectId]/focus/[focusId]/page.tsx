import { Suspense } from "react";
import { notFound } from "next/navigation";
import { FocusSpaceView } from "@/features/focus-space";
import { getProject } from "@/features/projects/actions";

/** Nested Project Structure level — `focusId` route param is a Node id. */
export default async function FocusSpaceNodePage({
  params,
}: {
  params: Promise<{ projectId: string; focusId: string }>;
}) {
  const { projectId, focusId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const exists = project.nodes.some((n) => n.id === focusId);
  if (!exists) notFound();

  return (
    <Suspense
      fallback={
        <div className="px-6 py-8 text-sm text-muted">Loading structure…</div>
      }
    >
      <FocusSpaceView nodeId={focusId} />
    </Suspense>
  );
}
