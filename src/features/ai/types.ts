import type { NodeType } from "@/types";
import type { AIModelTier } from "./models";
import type { NodeAIAnalysis } from "./node-analysis-schema";
import type { ImbalanceAnalysis } from "./imbalance-schema";
import type { ImprovementSuggestions } from "./improvement-schema";
import type { DirectionCheckResult } from "./direction-check-schema";
import type { FullProjectAnalysis } from "./full-analysis-schema";

export type AIServiceResult<T> = {
  ok: boolean;
  stubbed: boolean;
  model?: string;
  data?: T;
  error?: string;
  message: string;
  inputHash?: string;
};

export type ClassifyNodeInput = {
  projectId: string;
  nodeId: string;
  content: string;
  availableCategories?: string[];
};

export type SummarizeNodeInput = {
  projectId: string;
  nodeId: string;
  content: string;
};

export type SummarizeParentInput = {
  projectId: string;
  parentNodeId: string;
  childSummaries: {
    nodeId: string;
    summary: string;
    projectImpact?: string;
  }[];
  intentText?: string;
};

export type AnalyzeReadyNodeInput = {
  projectId: string;
  nodeId: string;
};

export type AnalyzeImbalanceInput = {
  projectId: string;
  designFocusIds?: string[];
  /** Code-computed balance lines for the AI to narrate (not invent thresholds). */
  balanceLines?: {
    id: string;
    name: string;
    parentId: string | null;
    targetImportance: number;
    actualWeight: number;
    confidence: number;
    status?: string;
    difference?: number;
    directionLabel?: string;
  }[];
};

export type GenerateImprovementSuggestionsInput = {
  projectId: string;
  nodeId?: string;
  context?: string;
  balanceLines?: AnalyzeImbalanceInput["balanceLines"];
};

export type PerformDirectionCheckInput = {
  projectId: string;
  nodeId?: string;
  intentText?: string;
  content?: string;
  triggerReason?: string;
};

export type AnalyzeCustomGameProfileInput = {
  projectId: string;
  customGameType: string;
  intentText?: string;
};

export type QuickReanalysisInput = {
  projectId: string;
  scope?: "node" | "focus" | "project";
  targetId?: string;
  /** Significant balance shifts that may warrant a small AI pass. */
  balanceShifts?: {
    focusId: string;
    name: string;
    from: string;
    to: string;
  }[];
};

export type FullProjectAnalysisInput = {
  projectId: string;
  balanceLines?: AnalyzeImbalanceInput["balanceLines"];
};

export type SuggestSetupFromIntentInput = {
  projectId: string;
  intentText: string;
  /** When non-GAME, suggestions omit genres and use type templates. */
  projectType?: import("@/types").ProjectType;
};

export type SuggestChildElementsInput = {
  projectId: string;
  /** Parent container; null = project root (top-level structure). */
  nodeId: string | null;
  /** Idea text to analyze (usually node.content, or project intent at root). */
  content: string;
};

export type SuggestedChildElementData = {
  name: string;
  type: NodeType;
  content?: string;
  reasoning?: string;
  selected: boolean;
};

export type ChildElementSuggestionsData = {
  suggestions: SuggestedChildElementData[];
  notes?: string;
  source: "ai" | "heuristic";
};

export type SuggestedFocus = {
  name: string;
  parentName?: string;
  templateKey?: string;
  selected: boolean;
  targetImportance: number;
  reasoning?: string;
};

/** Structural Project Area — organization section, no importance. */
export type SuggestedProjectArea = {
  name: string;
  templateKey?: string;
  selected: boolean;
  reasoning?: string;
};

export type ExtractedIntentHints = {
  primaryExperiences?: string[];
  supportingSystems?: string[];
  minorSystems?: string[];
  thingsToAvoid?: string[];
};

/** Shared suggestion payload for areas + design focuses (game and generic). */
export type SetupSuggestionCore = {
  /** Where content is organized (→ top-level structural Nodes). */
  suggestedProjectAreas: SuggestedProjectArea[];
  /** What the project should emphasize (→ DesignFocus + targetImportance). */
  suggestedDesignFocuses: SuggestedFocus[];
  extractedIntentHints?: ExtractedIntentHints;
  /** How the suggestion was produced — never auto-committed to project data. */
  source: "ai" | "heuristic";
};

export type SetupSuggestionData = SetupSuggestionCore & {
  /** Present for GAME suggestions; omitted for generic project types. */
  primaryGenreKey?: string;
  secondaryGenreKeys?: string[];
  customGameType?: string;
};

export type ReadyNodeAnalysisData = NodeAIAnalysis & {
  isParent: boolean;
  deferred?: boolean;
};

export type AIServiceOptions = {
  modelTier?: AIModelTier;
  /** UI locale (`pb:locale`) — new AI text should match when set. */
  locale?: "en" | "nl";
};

export type {
  ImbalanceAnalysis,
  ImprovementSuggestions,
  DirectionCheckResult,
  FullProjectAnalysis,
};
