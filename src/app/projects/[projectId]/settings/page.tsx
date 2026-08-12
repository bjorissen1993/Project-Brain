import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { UserSettingsPanel } from "@/features/preferences/user-settings-panel";

export default async function UserSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) notFound();

  return <UserSettingsPanel projectId={projectId} />;
}
