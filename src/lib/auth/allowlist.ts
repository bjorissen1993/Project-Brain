/**
 * Single-user / invite allowlist for production.
 * Comma/semicolon/whitespace-separated env lists (case-insensitive).
 */

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function getAllowedEmails(): string[] {
  return parseList(process.env.ALLOWED_EMAILS);
}

export function getAllowedGithubUsers(): string[] {
  return parseList(process.env.ALLOWED_GITHUB_USERS);
}

export function hasAllowlistConfigured(): boolean {
  return getAllowedEmails().length > 0 || getAllowedGithubUsers().length > 0;
}

export function isAllowlisted(input: {
  email?: string | null;
  githubUsername?: string | null;
}): boolean {
  const emails = getAllowedEmails();
  const githubs = getAllowedGithubUsers();
  if (emails.length === 0 && githubs.length === 0) {
    return false;
  }
  const email = input.email?.trim().toLowerCase();
  if (email && emails.includes(email)) return true;
  const github = input.githubUsername?.trim().toLowerCase();
  if (github && githubs.includes(github)) return true;
  return false;
}

/** True when Auth.js can run (secret + at least one OAuth provider). */
export function isAuthEnabled(): boolean {
  if (!process.env.AUTH_SECRET?.trim()) return false;
  const google =
    Boolean(process.env.AUTH_GOOGLE_ID?.trim()) &&
    Boolean(process.env.AUTH_GOOGLE_SECRET?.trim());
  const github =
    Boolean(process.env.AUTH_GITHUB_ID?.trim()) &&
    Boolean(process.env.AUTH_GITHUB_SECRET?.trim());
  return google || github;
}

export function isGoogleAuthConfigured(): boolean {
  return (
    Boolean(process.env.AUTH_GOOGLE_ID?.trim()) &&
    Boolean(process.env.AUTH_GOOGLE_SECRET?.trim())
  );
}

export function isGithubAuthConfigured(): boolean {
  return (
    Boolean(process.env.AUTH_GITHUB_ID?.trim()) &&
    Boolean(process.env.AUTH_GITHUB_SECRET?.trim())
  );
}
