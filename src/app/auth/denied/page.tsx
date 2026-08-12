import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";

export default async function AuthDeniedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message =
    error === "AllowlistEmpty"
      ? "The server allowlist is empty. Set ALLOWED_EMAILS and/or ALLOWED_GITHUB_USERS, then try again."
      : error === "AccessDenied" || !error
        ? "You signed in successfully, but this account is not on the allowlist. Only invited users can use Project Brain."
        : `Sign-in was rejected (${error}).`;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border px-6 py-4">
        <BrandMark variant="lockup" className="min-w-0" priority />
      </header>
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-12">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Access denied
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">{message}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-[var(--radius)] border border-border-strong bg-panel px-4 py-2 text-sm font-medium text-foreground transition hover:border-nav"
          >
            Try another account
          </Link>
          <Link
            href="/"
            className="rounded-[var(--radius)] px-4 py-2 text-sm text-muted transition hover:text-foreground"
          >
            Home
          </Link>
        </div>
      </main>
    </div>
  );
}
