import {
  GENRE_TEMPLATES,
  getGenreProjectAreas,
  getGenreTemplate,
} from "@/features/game-profile/genre-templates";
import {
  getProjectTypeAreas,
  getProjectTypeFocusTemplates,
} from "@/features/projects/type-templates";
import type { ProjectType } from "@/types";
import type { SetupSuggestionData, SuggestedProjectArea } from "./types";

type KeywordRule = {
  genreKey: string;
  keywords: string[];
  weight?: number;
};

/**
 * Lightweight offline matcher — keyword hits against genre/focus vocabulary.
 * Used when OPENAI_API_KEY is missing or the AI call fails.
 */
const GENRE_KEYWORD_RULES: KeywordRule[] = [
  {
    genreKey: "cozy",
    keywords: [
      "cozy",
      "wholesome",
      "relaxing",
      "comfort",
      "gentle",
      "village",
      "restore",
      "restoration",
      "farming",
      "gardening",
      "low pressure",
      "low-pressure",
      "cozy life",
    ],
    weight: 1.2,
  },
  {
    genreKey: "soulslike",
    keywords: [
      "souls",
      "soulslike",
      "elden",
      "dark souls",
      "boss fight",
      "punishing",
      "death loop",
      "stamina combat",
      "mastery through failure",
    ],
    weight: 1.3,
  },
  {
    genreKey: "action-rpg",
    keywords: [
      "action rpg",
      "action-rpg",
      "hack and slash",
      "real-time combat",
      "loot",
      "character growth",
      "open world combat",
    ],
  },
  {
    genreKey: "narrative-adventure",
    keywords: [
      "narrative",
      "story-driven",
      "story driven",
      "storytelling",
      "character drama",
      "branching story",
      "player choice",
      "dialogue",
      "themes",
    ],
  },
  {
    genreKey: "survival",
    keywords: [
      "survival",
      "scarcity",
      "hunger",
      "craft to survive",
      "environmental threat",
      "shelter",
      "harsh world",
    ],
  },
  {
    genreKey: "resource-management",
    keywords: [
      "resource management",
      "resources",
      "economy",
      "allocation",
      "bottleneck",
      "conversion",
      "supply chain",
      "efficiency",
      "trade-off",
    ],
  },
  {
    genreKey: "management",
    keywords: [
      "management",
      "facility",
      "staff",
      "throughput",
      "tycoon",
      "oversight",
      "schedule",
    ],
  },
  {
    genreKey: "simulation",
    keywords: [
      "simulation",
      "sim ",
      "emergent",
      "systems sim",
      "sandbox sim",
      "model",
      "observe",
    ],
  },
  {
    genreKey: "roguelike",
    keywords: [
      "roguelike",
      "roguelite",
      "run-based",
      "run based",
      "procedural",
      "permadeath",
      "meta progression",
    ],
  },
  {
    genreKey: "metroidvania",
    keywords: [
      "metroidvania",
      "ability gating",
      "interconnected map",
      "backtracking",
      "exploration gated",
    ],
  },
  {
    genreKey: "strategy",
    keywords: [
      "strategy",
      "tactical",
      "4x",
      "faction",
      "tech tree",
      "grand strategy",
      "turn-based strategy",
    ],
  },
  {
    genreKey: "puzzle",
    keywords: [
      "puzzle",
      "puzzles",
      "logic",
      "aha moment",
      "rule clarity",
      "brain teaser",
    ],
  },
  {
    genreKey: "shooter",
    keywords: [
      "shooter",
      "fps",
      "tps",
      "gunplay",
      "aim",
      "weapons",
      "firefight",
    ],
  },
  {
    genreKey: "party-game",
    keywords: [
      "party game",
      "multiplayer party",
      "local multiplayer",
      "minigame",
      "social fun",
      "couch co-op",
    ],
  },
  {
    genreKey: "sandbox",
    keywords: [
      "sandbox",
      "creative tools",
      "player-authored",
      "build anything",
      "freeform",
    ],
  },
  {
    genreKey: "rpg",
    keywords: [
      " rpg",
      "role-playing",
      "role playing",
      "party based",
      "party-based",
      "character identity",
      "quest",
      "level up",
    ],
  },
];

function scoreGenres(text: string): { key: string; score: number }[] {
  const scores = new Map<string, number>();

  for (const rule of GENRE_KEYWORD_RULES) {
    let score = 0;
    for (const keyword of rule.keywords) {
      if (text.includes(keyword)) {
        score += (rule.weight ?? 1) * (keyword.includes(" ") ? 2 : 1);
      }
    }
    // Also score against template name / description tokens
    const template = getGenreTemplate(rule.genreKey);
    if (template) {
      const name = template.name.toLowerCase();
      if (text.includes(name) || text.includes(rule.genreKey.replace(/-/g, " "))) {
        score += 2.5;
      }
      for (const focus of template.focuses) {
        const focusName = focus.name.toLowerCase();
        if (focusName.length > 4 && text.includes(focusName)) {
          score += 0.75;
        }
      }
    }
    if (score > 0) scores.set(rule.genreKey, score);
  }

  return [...scores.entries()]
    .map(([key, score]) => ({ key, score }))
    .sort((a, b) => b.score - a.score);
}

function extractHints(text: string): SetupSuggestionData["extractedIntentHints"] {
  const primaryExperiences: string[] = [];
  const supportingSystems: string[] = [];
  const thingsToAvoid: string[] = [];

  const avoidMatch = text.match(
    /(?:avoid|not|don't|do not|without)\s+([^.!?\n]{3,60})/gi,
  );
  if (avoidMatch) {
    for (const m of avoidMatch.slice(0, 4)) {
      thingsToAvoid.push(m.replace(/^(?:avoid|not|don't|do not|without)\s+/i, "").trim());
    }
  }

  if (/(feel|experience|fantasy|mood|tone)/i.test(text)) {
    primaryExperiences.push("Stated player experience / fantasy");
  }
  if (/(system|loop|mechanic|craft|combat|quest|explore)/i.test(text)) {
    supportingSystems.push("Mentioned gameplay systems");
  }

  return {
    primaryExperiences: primaryExperiences.length ? primaryExperiences : undefined,
    supportingSystems: supportingSystems.length ? supportingSystems : undefined,
    thingsToAvoid: thingsToAvoid.length ? thingsToAvoid : undefined,
  };
}

/** Nudge default importance from keyword hits in the intent (all genres). */
function adjustImportanceFromIntent(
  text: string,
  focusName: string,
  defaultImportance: number,
  avoidHit: boolean,
): { importance: number; mentioned: boolean; avoided: boolean } {
  const focusLower = focusName.toLowerCase();
  const tokens = focusLower
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3);
  const mentioned =
    text.includes(focusLower) ||
    tokens.some((t) => text.includes(t));
  let importance = defaultImportance;
  if (avoidHit) {
    importance = Math.max(10, defaultImportance - 25);
  } else if (mentioned) {
    importance = Math.min(100, defaultImportance + 15);
  }
  return { importance, mentioned, avoided: avoidHit };
}

function focusLooksAvoided(text: string, focusName: string): boolean {
  const focusLower = focusName.toLowerCase();
  const avoidWindow =
    /(?:avoid|not|don't|do not|without|no)\s+([^.!?\n]{0,80})/gi;
  let match: RegExpExecArray | null;
  while ((match = avoidWindow.exec(text)) !== null) {
    const window = (match[1] ?? "").toLowerCase();
    if (window.includes(focusLower)) return true;
    const tokens = focusLower.split(/[^a-z0-9]+/).filter((t) => t.length > 3);
    if (tokens.some((t) => window.includes(t))) return true;
  }
  return false;
}

export function buildHeuristicSetupSuggestion(
  intentText: string,
): SetupSuggestionData {
  const text = intentText.toLowerCase();
  const ranked = scoreGenres(text);

  const primaryGenreKey = ranked[0]?.key ?? "custom";
  // Prefer at least one secondary when a second genre scored; keep up to 3.
  const secondaryGenreKeys = ranked
    .slice(1, 4)
    .filter((r, index) => r.score >= (index === 0 ? 1.0 : 1.5))
    .map((r) => r.key);

  const genreKeys = [primaryGenreKey, ...secondaryGenreKeys];
  const suggestedDesignFocuses: SetupSuggestionData["suggestedDesignFocuses"] =
    [];
  const areaByName = new Map<string, SuggestedProjectArea>();

  for (const genreKey of genreKeys) {
    const template = getGenreTemplate(genreKey);
    if (!template) continue;
    const isPrimary = genreKey === primaryGenreKey;

    for (const areaName of getGenreProjectAreas(genreKey)) {
      const existing = areaByName.get(areaName.toLowerCase());
      if (existing) {
        if (isPrimary) {
          existing.selected = true;
          existing.templateKey = genreKey;
          existing.reasoning = "Core area from the suggested primary genre";
        }
        continue;
      }
      const mentioned =
        text.includes(areaName.toLowerCase()) ||
        areaName
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length > 3)
          .some((t) => text.includes(t));
      areaByName.set(areaName.toLowerCase(), {
        name: areaName,
        templateKey: genreKey,
        selected: isPrimary || mentioned,
        reasoning: mentioned
          ? "Matched language in your intent"
          : isPrimary
            ? "Core area from the suggested primary genre"
            : "From a secondary genre influence",
      });
    }

    for (const focus of template.focuses) {
      const defaultImportance = focus.defaultImportance ?? 50;
      const avoided = focusLooksAvoided(text, focus.name);
      const { importance, mentioned } = adjustImportanceFromIntent(
        text,
        focus.name,
        defaultImportance,
        avoided,
      );
      // Include secondary focuses too — select when relevant or core to that genre.
      const selected =
        !avoided &&
        (isPrimary ||
          mentioned ||
          importance >= 55 ||
          defaultImportance >= 65);

      suggestedDesignFocuses.push({
        name: focus.name,
        templateKey: genreKey,
        selected,
        targetImportance: importance,
        reasoning: avoided
          ? "Lowered — looks avoided in your intent"
          : mentioned
            ? "Raised — matched language in your intent"
            : isPrimary
              ? "Core focus from the suggested primary genre"
              : "From a secondary genre influence — slider adjusted for your intent",
      });

      for (const child of focus.children ?? []) {
        const childDefault = child.defaultImportance ?? 50;
        const childAvoided = focusLooksAvoided(text, child.name);
        const childAdj = adjustImportanceFromIntent(
          text,
          child.name,
          childDefault,
          childAvoided,
        );
        suggestedDesignFocuses.push({
          name: child.name,
          parentName: focus.name,
          templateKey: genreKey,
          selected:
            selected &&
            !childAvoided &&
            (childAdj.mentioned || childAdj.importance >= 55),
          targetImportance: childAdj.importance,
          reasoning: childAvoided
            ? "Lowered — looks avoided in your intent"
            : childAdj.mentioned
              ? "Matched a detail in your intent"
              : undefined,
        });
      }
    }
  }

  const customGameType =
    primaryGenreKey === "custom"
      ? intentText.trim().slice(0, 80)
      : undefined;

  return {
    primaryGenreKey,
    secondaryGenreKeys,
    customGameType,
    suggestedProjectAreas: [...areaByName.values()],
    suggestedDesignFocuses,
    extractedIntentHints: extractHints(text),
    source: "heuristic",
  };
}

export function genreCatalogForPrompt(): string {
  return GENRE_TEMPLATES.map((g) => {
    const areas = getGenreProjectAreas(g.key).join(", ");
    const focuses = g.focuses
      .map((f) => {
        const children =
          f.children?.map((c) => `${c.name} (default ${c.defaultImportance ?? 50})`).join(", ") ??
          "";
        return children
          ? `- ${f.name} (default ${f.defaultImportance ?? 50}); children: ${children}`
          : `- ${f.name} (default ${f.defaultImportance ?? 50})`;
      })
      .join("\n");
    return `## ${g.key} — ${g.name}\n${g.description}\nProject Areas (structure): ${areas || "(none)"}\nDesign Focuses (emphasis):\n${focuses || "(none — custom)"}`;
  }).join("\n\n");
}

/**
 * Offline matcher for non-game types — type template areas/focuses + intent keywords.
 * No genres. Creator must confirm in the wizard.
 */
export function buildHeuristicGenericSetupSuggestion(
  intentText: string,
  projectType: Exclude<ProjectType, "GAME">,
): SetupSuggestionData {
  const text = intentText.toLowerCase();
  const typeKey = projectType;
  const areaByName = new Map<string, SuggestedProjectArea>();
  const suggestedDesignFocuses: SetupSuggestionData["suggestedDesignFocuses"] =
    [];

  for (const areaName of getProjectTypeAreas(typeKey)) {
    const mentioned =
      text.includes(areaName.toLowerCase()) ||
      areaName
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length > 3)
        .some((t) => text.includes(t));
    areaByName.set(areaName.toLowerCase(), {
      name: areaName,
      templateKey: typeKey,
      selected: true,
      reasoning: mentioned
        ? "Matched language in your intent"
        : "Suggested structural area for this project type",
    });
  }

  for (const focus of getProjectTypeFocusTemplates(typeKey)) {
    const defaultImportance = focus.defaultImportance ?? 50;
    const avoided = focusLooksAvoided(text, focus.name);
    const { importance, mentioned } = adjustImportanceFromIntent(
      text,
      focus.name,
      defaultImportance,
      avoided,
    );
    suggestedDesignFocuses.push({
      name: focus.name,
      templateKey: typeKey,
      selected: !avoided,
      targetImportance: importance,
      reasoning: avoided
        ? "Lowered — looks avoided in your intent"
        : mentioned
          ? "Raised — matched language in your intent"
          : "Core emphasis pillar for this project type",
    });

    for (const child of focus.children ?? []) {
      const childDefault = child.defaultImportance ?? 50;
      const childAvoided = focusLooksAvoided(text, child.name);
      const childAdj = adjustImportanceFromIntent(
        text,
        child.name,
        childDefault,
        childAvoided,
      );
      suggestedDesignFocuses.push({
        name: child.name,
        parentName: focus.name,
        templateKey: typeKey,
        selected:
          !avoided &&
          !childAvoided &&
          (childAdj.mentioned || childAdj.importance >= 55),
        targetImportance: childAdj.importance,
        reasoning: childAvoided
          ? "Lowered — looks avoided in your intent"
          : childAdj.mentioned
            ? "Matched a detail in your intent"
            : undefined,
      });
    }
  }

  return {
    suggestedProjectAreas: [...areaByName.values()],
    suggestedDesignFocuses,
    extractedIntentHints: extractHints(text),
    source: "heuristic",
  };
}

export function projectTypeCatalogForPrompt(
  projectType: Exclude<ProjectType, "GAME">,
): string {
  const areas = getProjectTypeAreas(projectType).join(", ");
  const focuses = getProjectTypeFocusTemplates(projectType)
    .map((f) => {
      const children =
        f.children
          ?.map(
            (c) => `${c.name} (default ${c.defaultImportance ?? 50})`,
          )
          .join(", ") ?? "";
      return children
        ? `- ${f.name} (default ${f.defaultImportance ?? 50}); children: ${children}`
        : `- ${f.name} (default ${f.defaultImportance ?? 50}): ${f.description ?? ""}`;
    })
    .join("\n");
  return `Project type: ${projectType}\nProject Areas (structure): ${areas}\nDesign Focuses (emphasis):\n${focuses}`;
}
