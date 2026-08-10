/** Empty / new node: no written notes yet (children alone do not count as content). */
export function isNodeContentEmpty(content: string | null | undefined): boolean {
  return !content?.trim();
}
