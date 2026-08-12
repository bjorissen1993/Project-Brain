import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";
import { isAuthEnabled } from "@/lib/auth/allowlist";

/**
 * Edge-safe gate: when OAuth is configured, require a session for app routes.
 * Local/dev without AUTH_* secrets keeps the anonymous workspace.
 *
 * Next.js 16 prefers `proxy.ts` for Node, but Auth.js JWT checks stay on
 * `middleware` (Edge). See next/dist/docs upgrading guide.
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (!isAuthEnabled()) return;

  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth")
  ) {
    return;
  }

  if (!req.auth) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return Response.redirect(url);
  }
});

export const config = {
  matcher: [
    /*
     * Protect app pages; skip static assets and Next internals.
     */
    "/((?!_next/static|_next/image|favicon.ico|uploads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
