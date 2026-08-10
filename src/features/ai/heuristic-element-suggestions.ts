import type { ChildElementSuggestions } from "./element-suggestion-schema";
import type { NodeType, ProjectType } from "@/types";

type Rule = {
  type: NodeType;
  keywords: string[];
  defaultName: string;
  /** When set, only apply for these project types. */
  types?: ProjectType[];
};

const SHARED_RULES: Rule[] = [
  {
    type: "FOLDER",
    keywords: ["folder", "section", "area", "category", "pillar", "module"],
    defaultName: "Organizing folders",
  },
  {
    type: "SYSTEM",
    keywords: ["system", "pipeline", "architecture", "backend", "service"],
    defaultName: "Supporting systems",
  },
  {
    type: "UI_SCREEN",
    keywords: ["ui", "hud", "menu", "interface", "screen", "dashboard", "page"],
    defaultName: "UI screens",
  },
  {
    type: "TASK",
    keywords: ["todo", "task", "next step", "milestone"],
    defaultName: "Next steps",
  },
  {
    type: "IDEA",
    keywords: ["idea", "concept", "vision", "fantasy"],
    defaultName: "Core fantasy",
  },
];

const GAME_RULES: Rule[] = [
  {
    type: "CHARACTER",
    keywords: ["character", "protagonist", "hero", "npc", "villain", "companion"],
    defaultName: "Key characters",
    types: ["GAME"],
  },
  {
    type: "MECHANIC",
    keywords: ["mechanic", "gameplay", "combat", "crafting", "stealth", "puzzle"],
    defaultName: "Core mechanics",
    types: ["GAME"],
  },
  {
    type: "QUEST",
    keywords: ["quest", "mission", "objective", "goal"],
    defaultName: "Quests & objectives",
    types: ["GAME"],
  },
  {
    type: "LOCATION",
    keywords: ["location", "world", "biome", "dungeon", "town", "region", "map"],
    defaultName: "Locations",
    types: ["GAME", "CREATIVE"],
  },
  {
    type: "STORY_BEAT",
    keywords: ["story", "narrative", "plot", "act", "chapter", "beat"],
    defaultName: "Story beats",
    types: ["GAME", "CREATIVE"],
  },
  {
    type: "FACTION",
    keywords: ["faction", "guild", "tribe", "organization", "house"],
    defaultName: "Factions",
    types: ["GAME", "CREATIVE"],
  },
  {
    type: "ITEM",
    keywords: ["item", "weapon", "loot", "artifact", "equipment"],
    defaultName: "Items & rewards",
    types: ["GAME"],
  },
];

const SOFTWARE_RULES: Rule[] = [
  {
    type: "SYSTEM",
    keywords: ["api", "auth", "database", "data model", "integration"],
    defaultName: "Core services",
    types: ["SOFTWARE", "APP"],
  },
  {
    type: "FOLDER",
    keywords: ["feature", "workflow", "onboarding", "settings"],
    defaultName: "Feature areas",
    types: ["SOFTWARE", "APP", "OTHER", "CUSTOM"],
  },
  {
    type: "UI_SCREEN",
    keywords: ["flow", "wireframe", "view", "screen"],
    defaultName: "Key screens",
    types: ["SOFTWARE", "APP"],
  },
];

/**
 * Lightweight offline suggestions when OPENAI_API_KEY is missing.
 * Clearly labeled as heuristic — never auto-applied.
 * Avoids pushing combat/game templates when project type or intent is not game-like.
 */
export function buildHeuristicChildElementSuggestions(
  ideaText: string,
  existingChildNames: Set<string> = new Set(),
  options?: { projectType?: ProjectType },
): ChildElementSuggestions {
  const lower = ideaText.toLowerCase();
  const projectType = options?.projectType;
  const minimalIntent =
    /\b(minimal|simple|chill|cozy|non[- ]?combat|no combat|peaceful)\b/.test(
      lower,
    );
  const suggestions: ChildElementSuggestions["suggestions"] = [];

  const rules = [
    ...SHARED_RULES,
    ...(projectType === "GAME" || !projectType ? GAME_RULES : []),
    ...(projectType === "SOFTWARE" ||
    projectType === "APP" ||
    projectType === "OTHER" ||
    projectType === "CUSTOM"
      ? SOFTWARE_RULES
      : []),
    ...(projectType === "CREATIVE" ? GAME_RULES.filter((r) => r.type !== "MECHANIC") : []),
  ];

  for (const rule of rules) {
    if (suggestions.length >= 6) break;
    if (rule.types && projectType && !rule.types.includes(projectType)) continue;
    if (
      minimalIntent &&
      (rule.type === "MECHANIC" ||
        rule.keywords.some((k) => k === "combat" || k === "weapon"))
    ) {
      continue;
    }
    const hit = rule.keywords.find((k) => lower.includes(k));
    if (!hit) continue;
    // Don't suggest combat mechanics from a lone "combat" keyword when intent is minimal.
    if (minimalIntent && hit === "combat") continue;
    const name = rule.defaultName;
    // existingChildNames may be normalized keys (structure-suggest) or raw lowers.
    if (
      existingChildNames.has(name.toLowerCase()) ||
      existingChildNames.has(
        name
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      )
    ) {
      continue;
    }
    suggestions.push({
      name,
      type: rule.type,
      reasoning: `Keyword match (“${hit}”) — heuristic only`,
      selected: true,
    });
  }

  // Always offer a couple of generic structure starters if little matched.
  if (suggestions.length < 2) {
    const fallbacks =
      projectType === "SOFTWARE" || projectType === "APP"
        ? [
            {
              name: "Problem & users",
              type: "IDEA" as const,
              reasoning: "Clarify who this is for",
            },
            {
              name: "Feature areas",
              type: "FOLDER" as const,
              reasoning: "Group capabilities",
            },
            {
              name: "Open questions",
              type: "TASK" as const,
              reasoning: "Park unresolved decisions",
            },
          ]
        : [
            {
              name: "Core fantasy",
              type: "IDEA" as const,
              reasoning: "Capture the main experience in one place",
            },
            {
              name: "Open questions",
              type: "FOLDER" as const,
              reasoning: "Park unresolved design questions",
            },
            {
              name: "Next steps",
              type: "TASK" as const,
              reasoning: "Concrete follow-ups from this idea",
            },
          ];

    for (const fallback of fallbacks) {
      if (existingChildNames.has(fallback.name.toLowerCase())) continue;
      if (suggestions.some((s) => s.name.toLowerCase() === fallback.name.toLowerCase())) {
        continue;
      }
      suggestions.push({ ...fallback, selected: true });
      if (suggestions.length >= 3) break;
    }
  }

  return {
    suggestions: suggestions.slice(0, 8),
    notes:
      "Heuristic suggestions (no OPENAI_API_KEY). Review before adding — nothing is created automatically.",
  };
}
