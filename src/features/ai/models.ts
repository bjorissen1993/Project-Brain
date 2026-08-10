/**
 * Model configuration abstraction for Phase 2+.
 * Values are read from server env only — never expose keys to the client.
 */
export const AI_MODELS = {
  quick: process.env.OPENAI_MODEL_QUICK,
  standard: process.env.OPENAI_MODEL_STANDARD,
  deep: process.env.OPENAI_MODEL_DEEP,
} as const;

export type AIModelTier = keyof typeof AI_MODELS;

export function resolveAIModel(tier: AIModelTier = "standard"): string {
  return AI_MODELS[tier] ?? "gpt-4o";
}
