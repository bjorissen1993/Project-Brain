import { listProjectsForHome } from "@/features/projects/actions";
import { ProjectsLanding } from "@/features/projects/home/projects-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let projects: Awaited<ReturnType<typeof listProjectsForHome>> = [];
  let dbError: string | null = null;

  try {
    projects = await listProjectsForHome();
  } catch (error) {
    dbError =
      error instanceof Error
        ? error.message
        : "Database unavailable. Start Postgres and run migrations.";
  }

  return <ProjectsLanding projects={projects} dbError={dbError} />;
}
