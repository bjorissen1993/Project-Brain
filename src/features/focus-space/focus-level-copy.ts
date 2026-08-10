/**
 * Heuristic prose summaries for Focus Space / Design Focus title areas.
 * Prefers Project Intent text; no AI call required.
 */

export type FocusSummaryInput = {
  levelName: string;
  /** null = project root */
  focusId: string | null;
  projectName: string;
  intentText: string | null;
  genres: { name: string; role: "PRIMARY" | "SECONDARY" | string }[];
  childNames: string[];
  /** structure = Project Areas / nodes; design-focus = emphasis criteria */
  mode?: "structure" | "design-focus";
};

function firstSentences(text: string, max = 2, maxChars = 220): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const parts = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
  let out = "";
  for (const p of parts.slice(0, max)) {
    const next = out ? `${out} ${p}` : p;
    if (next.length > maxChars && out) break;
    out = next;
    if (out.length >= maxChars) break;
  }
  if (!out) out = cleaned.slice(0, maxChars);
  if (out.length < cleaned.length && !/[.!?]$/.test(out)) out = `${out}…`;
  return out;
}

function genrePhrase(
  genres: FocusSummaryInput["genres"],
): string | null {
  if (!genres.length) return null;
  const primary = genres.find((g) => g.role === "PRIMARY")?.name;
  const secondary = genres
    .filter((g) => g.role !== "PRIMARY")
    .map((g) => g.name);
  if (primary && secondary.length) {
    return `${primary} with ${secondary.slice(0, 2).join(" / ")} influences`;
  }
  if (primary) return primary;
  return genres.map((g) => g.name).slice(0, 2).join(" · ");
}

function joinChildNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/**
 * Auto-generated summary under the title.
 * Root: project intent (+ genres).
 * Nested: only this container — never quote full project intent.
 */
export function buildFocusLevelSummaryCopy(input: FocusSummaryInput): string {
  const {
    levelName,
    focusId,
    projectName,
    intentText,
    genres,
    childNames,
    mode = "structure",
  } = input;
  const intent = intentText?.trim() || null;
  const genreBit = genrePhrase(genres);
  const children = joinChildNames(childNames);
  const isStructure = mode === "structure";

  if (focusId == null) {
    if (intent) {
      const body = firstSentences(intent, 2, 240);
      if (genreBit) {
        return `${body} Framed as ${genreBit}.`;
      }
      return body;
    }
    if (genreBit) {
      return isStructure
        ? `${projectName} is shaping a ${genreBit} experience${
            children ? `, organized around ${children}` : ""
          }.`
        : `${projectName} is shaping a ${genreBit} experience${
            children ? `, emphasizing ${children}` : ""
          }.`;
    }
    if (children) {
      return isStructure
        ? `${projectName} currently organizes around ${children}.`
        : `${projectName} currently emphasizes ${children}.`;
    }
    return isStructure
      ? `${projectName} — add Project Areas to organize where ideas live.`
      : `${projectName} — add Design Focuses to define what the game emphasizes.`;
  }

  if (children) {
    return isStructure
      ? `${levelName} groups ${children} in the project structure.`
      : `${levelName} groups ${children} as design emphasis at this level.`;
  }

  return isStructure
    ? `${levelName} is a structure container. Add child nodes with +, or write the idea for this leaf below.`
    : `${levelName} is a Design Focus. Add child focuses with +, or review contributing ideas below.`;
}
