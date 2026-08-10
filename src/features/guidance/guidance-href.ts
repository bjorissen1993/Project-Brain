/** Project Guidance URL, optionally scoped to a Structure node subtree. */
export function guidanceHref(
  projectId: string,
  focusNodeId?: string | null,
): string {
  const base = `/projects/${projectId}`;
  if (!focusNodeId) return base;
  const params = new URLSearchParams({ nodeId: focusNodeId });
  return `${base}?${params.toString()}`;
}
