import { redirect } from "next/navigation";

/** Tree is part of the Structure workspace (`?view=tree`), not a separate destination. */
export default async function TreePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/focus?view=tree`);
}
