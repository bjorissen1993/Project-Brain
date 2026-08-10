/**
 * In-memory + sessionStorage clipboard for Structure blob copy/paste.
 * Works for folders, leaf nodes, notes, and image blobs — paste deep-copies
 * with content preserved (see copyNodeSubtreeAction clearContent: false).
 */

export type StructureNodeClipboard = {
  projectId: string;
  sourceNodeId: string;
  sourceName: string;
  copiedAt: number;
};

const STORAGE_KEY = "pb:structure-node-clipboard:v1";

let memoryClipboard: StructureNodeClipboard | null = null;

export function setStructureNodeClipboard(entry: StructureNodeClipboard) {
  memoryClipboard = entry;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // ignore quota / private mode
  }
}

export function getStructureNodeClipboard(
  projectId?: string,
): StructureNodeClipboard | null {
  if (
    memoryClipboard &&
    (!projectId || memoryClipboard.projectId === projectId)
  ) {
    return memoryClipboard;
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StructureNodeClipboard;
    if (
      !parsed?.projectId ||
      !parsed?.sourceNodeId ||
      !parsed?.sourceName
    ) {
      return null;
    }
    memoryClipboard = parsed;
    if (projectId && parsed.projectId !== projectId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStructureNodeClipboard() {
  memoryClipboard = null;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
