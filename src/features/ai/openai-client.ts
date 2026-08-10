import { resolveAIModel, type AIModelTier } from "./models";

export function hasOpenAIApiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** Hard timeout so chat send never hangs indefinitely. */
const OPENAI_FETCH_TIMEOUT_MS = 90_000;

type ChatJsonResult =
  | { ok: true; model: string; content: string }
  | { ok: false; model: string; error: string };

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Minimal server-side OpenAI Chat Completions call.
 * No SDK dependency — keeps Phase 1 install light.
 */
async function openAIChatCompletions(params: {
  messages: OpenAIChatMessage[];
  modelTier?: AIModelTier;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<ChatJsonResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = resolveAIModel(params.modelTier ?? "quick");

  if (!apiKey) {
    return { ok: false, model, error: "OPENAI_API_KEY is not set" };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: params.temperature ?? 0.3,
        ...(params.jsonObject
          ? { response_format: { type: "json_object" } }
          : {}),
        messages: params.messages,
      }),
      signal: AbortSignal.timeout(OPENAI_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        ok: false,
        model,
        error: `OpenAI HTTP ${response.status}: ${body.slice(0, 240)}`,
      };
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      return { ok: false, model, error: "OpenAI returned empty content" };
    }

    return { ok: true, model, content };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    const raw = error instanceof Error ? error.message : "OpenAI request failed";
    const timedOut =
      name === "TimeoutError" ||
      name === "AbortError" ||
      /timed?\s*out/i.test(raw);
    return {
      ok: false,
      model,
      error: timedOut
        ? `OpenAI request timed out after ${OPENAI_FETCH_TIMEOUT_MS / 1000}s`
        : raw,
    };
  }
}

/**
 * Minimal server-side OpenAI Chat Completions call with JSON object response.
 */
export async function openAIChatJson(params: {
  system: string;
  user: string;
  modelTier?: AIModelTier;
  temperature?: number;
}): Promise<ChatJsonResult> {
  return openAIChatCompletions({
    messages: [
      { role: "system", content: params.system },
      { role: "user", content: params.user },
    ],
    modelTier: params.modelTier,
    temperature: params.temperature,
    jsonObject: true,
  });
}

/**
 * Multi-turn chat completions (JSON object response for structured chat replies).
 */
export async function openAIChatMessages(params: {
  messages: OpenAIChatMessage[];
  modelTier?: AIModelTier;
  temperature?: number;
  jsonObject?: boolean;
}): Promise<ChatJsonResult> {
  return openAIChatCompletions({
    messages: params.messages,
    modelTier: params.modelTier,
    temperature: params.temperature,
    jsonObject: params.jsonObject ?? true,
  });
}
