import { getAuthBootstrap } from "@/features/auth/actions";
import { MakerProfile } from "@/features/projects/home/maker-profile";

/** Server wrapper so MakerProfile knows which OAuth providers are live. */
export async function MakerProfileGate({ className }: { className?: string }) {
  const bootstrap = await getAuthBootstrap();
  return (
    <MakerProfile
      className={className}
      authEnabled={bootstrap.enabled}
      googleAvailable={bootstrap.googleAvailable}
      githubAvailable={bootstrap.githubAvailable}
      linkedProviders={bootstrap.linked}
    />
  );
}
