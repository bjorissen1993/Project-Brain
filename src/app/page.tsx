import { getAuthBootstrap } from "@/features/auth/actions";
import { listProjectsForHome } from "@/features/projects/actions";
import { ProjectsLanding } from "@/features/projects/home/projects-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let projects: Awaited<ReturnType<typeof listProjectsForHome>> = [];
  let dbError: string | null = null;
  let auth: Awaited<ReturnType<typeof getAuthBootstrap>> = {
    enabled: false,
    googleAvailable: false,
    githubAvailable: false,
    linked: [],
    user: null,
  };

  try {
    auth = await getAuthBootstrap();
  } catch {
    // Auth bootstrap is best-effort when the DB is down and auth is off.
  }

  try {
    projects = await listProjectsForHome();
  } catch (error) {
    dbError =
      error instanceof Error
        ? error.message
        : "Database unavailable. Start Postgres and run migrations.";
  }

  return (
    <ProjectsLanding
      projects={projects}
      dbError={dbError}
      authEnabled={auth.enabled}
      googleAvailable={auth.googleAvailable}
      githubAvailable={auth.githubAvailable}
      linkedProviders={auth.linked}
    />
  );
}
