export type ProjectType =
  | "GAME"
  | "SOFTWARE"
  | "APP"
  | "CREATIVE"
  | "OTHER"
  | "CUSTOM";

export type ProjectStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type GenreRole = "PRIMARY" | "SECONDARY";

export type NodeType =
  | "FOLDER"
  | "MECHANIC"
  | "CHARACTER"
  | "QUEST"
  | "LOCATION"
  | "STORY_BEAT"
  | "SYSTEM"
  | "ITEM"
  | "FACTION"
  | "UI_SCREEN"
  | "IDEA"
  | "TASK"
  | "ACT"
  | "CUSTOM";

export type NodeStatus =
  | "IDEA"
  | "DRAFT"
  | "IN_PROGRESS"
  | "REVIEW"
  | "READY";

export type GamePhase = "EARLY" | "MID" | "LATE" | "ENDGAME";

export type DesignFocus = {
  id: string;
  projectId: string;
  name: string;
  parentId?: string | null;
  targetImportance: number;
  actualWeight: number;
  confidence: number;
  sortOrder?: number;
  isCustom?: boolean;
  templateSource?: string | null;
  children?: DesignFocus[];
};

export type NodeRelation = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: string;
  label?: string | null;
  metadata?: unknown;
};

export type ProjectNode = {
  id: string;
  projectId: string;
  parentId?: string | null;
  name: string;
  type: NodeType;
  customTypeLabel?: string | null;
  status: NodeStatus;
  content?: string | null;
  summary?: string | null;
  designFocusId?: string | null;
  sortOrder: number;
  children?: ProjectNode[];
};

export type GenreTemplateFocus = {
  name: string;
  description?: string;
  defaultImportance?: number;
  children?: GenreTemplateFocus[];
};

export type GenreTemplate = {
  key: string;
  name: string;
  description: string;
  /** Design Focus criteria (with targetImportance in setup). */
  focuses: GenreTemplateFocus[];
  /**
   * Structural Project Areas (organization sections).
   * Not Design Focuses — no importance. Created as top-level Nodes.
   */
  areas?: string[];
};

export type WorkspaceView =
  | "overview"
  | "focus"
  | "tree"
  | "graph"
  | "timeline"
  | "board"
  | "balance";

/** Setup depth: Game keeps genre templates; other types use the general wizard. */
export type ProjectSetupTier = "full" | "general";

export const PROJECT_TYPE_OPTIONS: {
  value: ProjectType;
  label: string;
  description: string;
  mvpSupported: boolean;
  setupTier: ProjectSetupTier;
}[] = [
  {
    value: "GAME",
    label: "Game",
    description: "Interactive games with design focus, balance, and systems thinking.",
    mvpSupported: true,
    setupTier: "full",
  },
  {
    value: "SOFTWARE",
    label: "Software",
    description: "Tools, platforms, and product systems.",
    mvpSupported: true,
    setupTier: "general",
  },
  {
    value: "APP",
    label: "App",
    description: "Mobile or web applications.",
    mvpSupported: true,
    setupTier: "general",
  },
  {
    value: "CREATIVE",
    label: "Creative Project",
    description: "Narrative, film, art, or other creative work.",
    mvpSupported: true,
    setupTier: "general",
  },
  {
    value: "OTHER",
    label: "Other",
    description: "Anything that does not fit the categories above.",
    mvpSupported: true,
    setupTier: "general",
  },
  {
    value: "CUSTOM",
    label: "Custom",
    description: "Define your own project type label.",
    mvpSupported: true,
    setupTier: "general",
  },
];

export const NODE_TYPE_OPTIONS: { value: NodeType; label: string }[] = [
  { value: "FOLDER", label: "Folder" },
  { value: "MECHANIC", label: "Mechanic" },
  { value: "CHARACTER", label: "Character" },
  { value: "QUEST", label: "Quest" },
  { value: "LOCATION", label: "Location" },
  { value: "STORY_BEAT", label: "Story Beat" },
  { value: "SYSTEM", label: "System" },
  { value: "ITEM", label: "Item" },
  { value: "FACTION", label: "Faction" },
  { value: "UI_SCREEN", label: "UI Screen" },
  { value: "IDEA", label: "Idea" },
  { value: "TASK", label: "Task" },
  { value: "ACT", label: "Act" },
  { value: "CUSTOM", label: "Custom" },
];

export const NODE_STATUS_OPTIONS: { value: NodeStatus; label: string }[] = [
  { value: "IDEA", label: "Idea" },
  { value: "DRAFT", label: "Draft" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "REVIEW", label: "Review" },
  { value: "READY", label: "Ready" },
];

/** Delivery / priority phase tags (not game-only wording). */
export const GAME_PHASE_OPTIONS: { value: GamePhase; label: string }[] = [
  { value: "EARLY", label: "Early" },
  { value: "MID", label: "Mid" },
  { value: "LATE", label: "Late" },
  { value: "ENDGAME", label: "End" },
];
