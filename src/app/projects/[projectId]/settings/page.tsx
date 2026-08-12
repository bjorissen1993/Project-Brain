import { notFound } from "next/navigation";
import { prisma } from "@/db/client";
import { getOwnershipSettingsBootstrap } from "@/features/projects/claim-actions";
import { canAccessProject, getSessionUser } from "@/features/projects/ownership";
import { UserSettingsPanel } from "@/features/preferences/user-settings-panel";

export default async function UserSettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  });
  if (!project) notFound();
  const user = await getSessionUser();
  if (!canAccessProject(project, user)) notFound();

  const ownership = await getOwnershipSettingsBootstrap();

  return (
    <UserSettingsPanel
      projectId={projectId}
      showClaimUnowned={
        ownership.authEnabled &&
        ownership.signedIn &&
        ownership.allowlisted
      }
      unownedCount={ownership.unownedCount}
    />
  );
}
