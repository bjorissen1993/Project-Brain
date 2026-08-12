import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { BrandMark } from "@/components/brand/brand-mark";
import { LoginForm } from "@/features/auth/login-form";
import {
  hasAllowlistConfigured,
  isAuthEnabled,
  isGithubAuthConfigured,
  isGoogleAuthConfigured,
} from "@/lib/auth/allowlist";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const authEnabled = isAuthEnabled();

  if (authEnabled) {
    const session = await auth();
    if (session?.user) {
      redirect(params.callbackUrl?.startsWith("/") ? params.callbackUrl : "/");
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <BrandMark variant="lockup" className="min-w-0" priority />
        <Link
          href="/"
          className="text-sm text-muted transition hover:text-foreground"
        >
          Home
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Sign in
        </h1>
        {!authEnabled ? (
          <p
            className="mt-4 rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-sm text-muted"
            role="status"
          >
            Auth is not configured on this server. Set{" "}
            <code className="text-foreground">AUTH_SECRET</code> and at least
            one OAuth provider (
            <code className="text-foreground">AUTH_GOOGLE_*</code> and/or{" "}
            <code className="text-foreground">AUTH_GITHUB_*</code>
            ), then redeploy.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted">
              Project Brain is private. Sign in with Google or GitHub. You can
              link both accounts to the same user.
            </p>
            {!hasAllowlistConfigured() ? (
              <p
                className="mt-4 rounded-[var(--radius)] border border-border bg-panel px-3 py-2 text-sm text-muted"
                role="status"
              >
                Server allowlist is empty. Set{" "}
                <code className="text-foreground">ALLOWED_EMAILS</code> and/or{" "}
                <code className="text-foreground">ALLOWED_GITHUB_USERS</code>{" "}
                before anyone can sign in.
              </p>
            ) : null}
            <div className="mt-8">
              <LoginForm
                callbackUrl={
                  params.callbackUrl?.startsWith("/")
                    ? params.callbackUrl
                    : "/"
                }
                googleAvailable={isGoogleAuthConfigured()}
                githubAvailable={isGithubAuthConfigured()}
                error={params.error}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
