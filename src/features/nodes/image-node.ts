/** Marker for structure nodes that represent a resizable image blob. */
export const IMAGE_NODE_LABEL = "Image";

export function isImageNode(node: {
  type?: string | null;
  customTypeLabel?: string | null;
}): boolean {
  return node.type === "CUSTOM" && node.customTypeLabel === IMAGE_NODE_LABEL;
}

/** Content notes / idea-like nodes suitable for multi-select combine. */
export function isNoteLikeNode(node: {
  type?: string | null;
  customTypeLabel?: string | null;
  content?: string | null;
  hasChildren?: boolean;
}): boolean {
  if (isImageNode(node)) return false;
  if (node.type === "FOLDER") return false;
  if (node.hasChildren) return false;
  const content = node.content?.trim() ?? "";
  return (
    node.type === "IDEA" ||
    node.type === "STORY_BEAT" ||
    node.type === "TASK" ||
    content.length > 0
  );
}

/** Prefer explicit upload path stored in content; ignore markdown wrappers. */
export function imageUrlFromNodeContent(
  content: string | null | undefined,
): string | null {
  const raw = content?.trim() ?? "";
  if (!raw) return null;
  if (raw.startsWith("/uploads/")) return raw;
  const md = raw.match(/!\[[^\]]*]\((\/uploads\/[^)\s]+)\)/);
  return md?.[1] ?? null;
}

/** Short blurb for details / combine preview when no AI summary exists. */
export function blurbFromContent(
  content: string | null | undefined,
  max = 220,
): string {
  const text = (content ?? "")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/[#>*_`~\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}
