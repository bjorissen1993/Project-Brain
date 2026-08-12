/**
 * Browser-local list of project ids created while unsigned / anonymous.
 * After login, ClaimOrphansOnLogin attaches these to the signed-in user.
 */

export const ORPHAN_PROJECT_IDS_KEY = "pb:orphan-project-ids";

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function readOrphanProjectIds(): string[] {
  if (!canUseStorage()) return [];
  try {
    const raw = localStorage.getItem(ORPHAN_PROJECT_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        ),
      ),
    ];
  } catch {
    return [];
  }
}

export function rememberOrphanProjectId(projectId: string): void {
  if (!canUseStorage()) return;
  const id = projectId.trim();
  if (!id) return;
  const next = [...new Set([...readOrphanProjectIds(), id])];
  localStorage.setItem(ORPHAN_PROJECT_IDS_KEY, JSON.stringify(next));
}

export function clearOrphanProjectIds(): void {
  if (!canUseStorage()) return;
  localStorage.removeItem(ORPHAN_PROJECT_IDS_KEY);
}

export function removeOrphanProjectIds(ids: string[]): void {
  if (!canUseStorage() || ids.length === 0) return;
  const drop = new Set(ids);
  const next = readOrphanProjectIds().filter((id) => !drop.has(id));
  if (next.length === 0) {
    localStorage.removeItem(ORPHAN_PROJECT_IDS_KEY);
    return;
  }
  localStorage.setItem(ORPHAN_PROJECT_IDS_KEY, JSON.stringify(next));
}
