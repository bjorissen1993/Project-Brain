import type { LocaleId } from "@/features/preferences";

/** Append to AI system prompts so new generations match UI locale. */
export function aiLocaleInstruction(locale?: LocaleId | string | null): string {
  if (locale === "nl") {
    return `

Language: Respond entirely in Dutch (Nederlands). All human-readable text fields (reasoning, hints, summaries, findings, descriptions, reply, observations) MUST be Dutch. Keep JSON keys, enum values, template keys, and ids in English.`;
  }
  return "";
}
