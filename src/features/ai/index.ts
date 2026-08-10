export { AI_MODELS, resolveAIModel } from "./models";
export type { AIModelTier } from "./models";
export {
  getAIService,
  ProjectBrainAIService,
  StubAIService,
  type AIService,
} from "./ai-service";
export { hasOpenAIApiKey, openAIChatMessages } from "./openai-client";
export type { OpenAIChatMessage } from "./openai-client";
export {
  buildHeuristicSetupSuggestion,
  buildHeuristicGenericSetupSuggestion,
} from "./heuristic-setup-suggestions";
export { buildHeuristicChildElementSuggestions } from "./heuristic-element-suggestions";
export {
  setupSuggestionSchema,
  genericSetupSuggestionSchema,
  suggestSetupFromIntentInputSchema,
  normalizeSetupSuggestion,
  normalizeGenericSetupSuggestion,
} from "./setup-suggestion-schema";
export {
  childElementSuggestionsSchema,
  suggestChildElementsInputSchema,
  applyChildElementSuggestionsSchema,
  ignoreChildElementSuggestionsSchema,
  normalizeChildElementSuggestions,
  normalizeSuggestionName,
  isNearDuplicateName,
  nameConflictsExisting,
  ELEMENT_SUGGESTION_MAX,
  ELEMENT_SUGGESTION_INLINE,
} from "./element-suggestion-schema";
export {
  nodeAIAnalysisSchema,
  normalizeNodeAIAnalysis,
  LOW_CONFIDENCE_THRESHOLD,
} from "./node-analysis-schema";
export type {
  NodeAIAnalysis,
  NodeClassificationResult,
  SuggestedRelation,
  ClassificationMetadata,
} from "./node-analysis-schema";
export {
  buildReadyAnalysisContext,
  buildProjectIntelligenceContext,
} from "./context-builder";
export {
  imbalanceAnalysisSchema,
  normalizeImbalanceAnalysis,
} from "./imbalance-schema";
export {
  improvementSuggestionsSchema,
  normalizeImprovementSuggestions,
  improvementCategorySchema,
} from "./improvement-schema";
export {
  directionCheckResultSchema,
  normalizeDirectionCheckResult,
} from "./direction-check-schema";
export {
  genreIntentAlignmentSchema,
  checkGenreIntentAlignmentInputSchema,
  assessGenreIntentAlignment,
  normalizeGenreIntentAlignment,
} from "./genre-intent-alignment-schema";
export type { GenreIntentAlignment } from "./genre-intent-alignment-schema";
export {
  fullProjectAnalysisSchema,
  normalizeFullProjectAnalysis,
} from "./full-analysis-schema";
export type * from "./types";
