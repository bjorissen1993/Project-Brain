import { BrandMark } from "@/components/brand/brand-mark";
import { MakerProfileGate } from "@/features/auth/maker-profile-gate";
import { getOwnershipSettingsBootstrap } from "@/features/projects/claim-actions";
import { UserSettingsPanel } from "@/features/preferences/user-settings-panel";

export default async function GlobalSettingsPage() {
  const ownership = await getOwnershipSettingsBootstrap();
  return (
    <div className="min-h-dvh bg-background">
      <header className="landing-topbar sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-border bg-background/90 px-6 py-4 backdrop-blur-md">
        <BrandMark variant="lockup" className="min-w-0" priority />
        <MakerProfileGate />
      </header>
      <UserSettingsPanel
        showClaimUnowned={
          ownership.authEnabled &&
          ownership.signedIn &&
          ownership.allowlisted
        }
        unownedCount={ownership.unownedCount}
      />
    </div>
  );
}
