import { redirect } from "next/navigation";

export default async function IntentPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/projects/${projectId}/profile#intent`);
}
