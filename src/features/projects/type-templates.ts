import type { GenreTemplateFocus, ProjectType } from "@/types";

/**
 * Suggested structural Project Areas per non-game project type.
 * Become top-level FOLDER nodes — no importance (same as game areas).
 */
export const PROJECT_TYPE_AREAS: Record<
  Exclude<ProjectType, "GAME">,
  readonly string[]
> = {
  SOFTWARE: ["Features", "Architecture", "UX", "Backend", "Infrastructure"],
  APP: ["Screens", "Flows", "Components", "Data", "Platform"],
  CREATIVE: ["Concepts", "Chapters", "Characters", "Visuals", "Themes"],
  OTHER: ["Core", "Research", "Deliverables", "Notes"],
  CUSTOM: ["Core", "Structure", "Details", "Notes"],
};

/**
 * Generic Design Focus pillars (emphasis criteria with targetImportance).
 * Type-specific, not game genres.
 */
export const PROJECT_TYPE_FOCUS_TEMPLATES: Record<
  Exclude<ProjectType, "GAME">,
  GenreTemplateFocus[]
> = {
  SOFTWARE: [
    {
      name: "Usability",
      description: "Clarity of workflows and ease of accomplishing goals.",
      defaultImportance: 70,
    },
    {
      name: "Reliability",
      description: "Correctness, stability, and trust under real use.",
      defaultImportance: 65,
    },
    {
      name: "Maintainability",
      description: "How easy the system is to change and reason about.",
      defaultImportance: 60,
    },
    {
      name: "Performance",
      description: "Responsiveness and efficient use of resources.",
      defaultImportance: 55,
    },
    {
      name: "Extensibility",
      description: "Room to grow features without rewriting the core.",
      defaultImportance: 50,
    },
  ],
  APP: [
    {
      name: "User Experience",
      description: "End-to-end feel of using the product day to day.",
      defaultImportance: 75,
    },
    {
      name: "Clarity",
      description: "Obvious navigation, labels, and next actions.",
      defaultImportance: 65,
    },
    {
      name: "Retention",
      description: "Reasons people return and keep using the app.",
      defaultImportance: 55,
    },
    {
      name: "Accessibility",
      description: "Usable across abilities, devices, and contexts.",
      defaultImportance: 50,
    },
    {
      name: "Performance",
      description: "Snappy loads and smooth interactions.",
      defaultImportance: 55,
    },
  ],
  CREATIVE: [
    {
      name: "Theme",
      description: "The central idea or message the work explores.",
      defaultImportance: 70,
    },
    {
      name: "Emotional Impact",
      description: "What the audience should feel and remember.",
      defaultImportance: 65,
    },
    {
      name: "Pacing",
      description: "Rhythm of reveals, tension, and quiet moments.",
      defaultImportance: 55,
    },
    {
      name: "Craft",
      description: "Quality of execution in the chosen medium.",
      defaultImportance: 60,
    },
    {
      name: "Originality",
      description: "Distinctive voice, structure, or perspective.",
      defaultImportance: 50,
    },
  ],
  OTHER: [
    {
      name: "Clarity",
      description: "How clearly the project communicates its purpose.",
      defaultImportance: 60,
    },
    {
      name: "Coherence",
      description: "Parts fit together without contradicting the intent.",
      defaultImportance: 60,
    },
    {
      name: "Impact",
      description: "Meaningful outcome for the intended audience.",
      defaultImportance: 55,
    },
    {
      name: "Feasibility",
      description: "Realistic scope given constraints and resources.",
      defaultImportance: 50,
    },
  ],
  CUSTOM: [
    {
      name: "Clarity",
      description: "How clearly the project communicates its purpose.",
      defaultImportance: 60,
    },
    {
      name: "Coherence",
      description: "Parts fit together without contradicting the intent.",
      defaultImportance: 60,
    },
    {
      name: "Impact",
      description: "Meaningful outcome for the intended audience.",
      defaultImportance: 55,
    },
    {
      name: "Feasibility",
      description: "Realistic scope given constraints and resources.",
      defaultImportance: 50,
    },
  ],
};

export function getProjectTypeAreas(type: ProjectType): string[] {
  if (type === "GAME") return ["Story", "Mechanics", "Characters", "World"];
  return [...PROJECT_TYPE_AREAS[type]];
}

export function getProjectTypeFocusTemplates(
  type: ProjectType,
): GenreTemplateFocus[] {
  if (type === "GAME") return [];
  return PROJECT_TYPE_FOCUS_TEMPLATES[type];
}

export function isGameProjectType(type: ProjectType): type is "GAME" {
  return type === "GAME";
}

export function isNonGameProjectType(
  type: ProjectType,
): type is Exclude<ProjectType, "GAME"> {
  return type !== "GAME";
}

/** Human label for setup UI copy. */
export function projectTypeSetupLabel(type: ProjectType): string {
  switch (type) {
    case "GAME":
      return "game";
    case "SOFTWARE":
      return "software";
    case "APP":
      return "app";
    case "CREATIVE":
      return "creative";
    case "CUSTOM":
      return "custom";
    default:
      return "project";
  }
}
