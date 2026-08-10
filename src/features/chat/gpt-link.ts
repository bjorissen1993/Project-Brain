/**
 * Pragmatic ChatGPT conversation attachment helpers.
 *
 * Private chatgpt.com/c/... URLs are usually not fetchable without user auth.
 * Public chatgpt.com/share/... links may be partially readable server-side.
 * We never claim private ChatGPT history was synced automatically.
 */

const SHARE_HOSTS = new Set(["chatgpt.com", "www.chatgpt.com", "chat.openai.com"]);

export type GptLinkKind = "share" | "private" | "unknown" | "invalid";

export function classifyGptConversationUrl(raw: string): {
  kind: GptLinkKind;
  normalized: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "invalid", normalized: null };

  let url: URL;
  try {
    url = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return { kind: "invalid", normalized: null };
  }

  const host = url.hostname.toLowerCase();
  if (!SHARE_HOSTS.has(host)) {
    return { kind: "unknown", normalized: url.toString() };
  }

  const path = url.pathname;
  if (/\/share\//i.test(path)) {
    return { kind: "share", normalized: url.toString() };
  }
  if (/\/c\//i.test(path)) {
    return { kind: "private", normalized: url.toString() };
  }
  return { kind: "unknown", normalized: url.toString() };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) =>
      String.fromCodePoint(Number.parseInt(n, 10)),
    );
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function extractMetaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const alt = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    "i",
  );
  const m = html.match(re) ?? html.match(alt);
  return m?.[1] ? decodeHtmlEntities(m[1]) : null;
}

/** Best-effort extraction of readable conversation text from share-page HTML. */
export function extractReadableTextFromShareHtml(html: string): string | null {
  const chunks: string[] = [];

  const ogTitle = extractMetaContent(html, "og:title");
  const ogDesc = extractMetaContent(html, "og:description");
  const twitterDesc = extractMetaContent(html, "twitter:description");
  if (ogTitle) chunks.push(ogTitle);
  if (ogDesc) chunks.push(ogDesc);
  else if (twitterDesc) chunks.push(twitterDesc);

  // Some share pages embed JSON with message parts.
  const jsonBlocks = html.match(
    /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (jsonBlocks) {
    for (const block of jsonBlocks.slice(0, 6)) {
      const inner = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
      try {
        const data = JSON.parse(inner) as unknown;
        const walked = walkForMessageText(data);
        if (walked.length) chunks.push(...walked);
      } catch {
        // ignore
      }
    }
  }

  // Fallback: visible article/main text (often thin on share pages).
  const mainMatch =
    html.match(/<main[\s\S]*?<\/main>/i) ??
    html.match(/<article[\s\S]*?<\/article>/i);
  if (mainMatch) {
    const text = stripTags(mainMatch[0]);
    if (text.length > 80) chunks.push(text.slice(0, 12000));
  }

  const joined = chunks
    .map((c) => c.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (joined.length < 40) return null;
  return joined.slice(0, 80_000);
}

function walkForMessageText(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || out.length >= 40) return out;
  if (typeof value === "string") {
    const t = value.trim();
    // Cap matches generous paste/prompt limits; skip tiny/noise and URLs.
    if (t.length >= 40 && t.length <= 64_000 && !t.startsWith("http")) {
      out.push(t);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkForMessageText(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    // Prefer known ChatGPT-ish keys when present.
    for (const key of ["content", "text", "message", "parts", "title"]) {
      if (key in obj) walkForMessageText(obj[key], out, depth + 1);
    }
    for (const [k, v] of Object.entries(obj)) {
      if (["content", "text", "message", "parts", "title"].includes(k)) continue;
      walkForMessageText(v, out, depth + 1);
    }
  }
  return out;
}

export type FetchGptShareResult =
  | {
      ok: true;
      text: string;
      source: "share_fetch";
      url: string;
      warning?: string;
    }
  | {
      ok: false;
      reason: "private" | "fetch_failed" | "empty" | "invalid";
      message: string;
      url?: string;
      needsTranscript: true;
    };

/**
 * Attempt server-side fetch of a public ChatGPT share URL.
 * Private /c/ links always return needsTranscript.
 */
export async function fetchGptShareConversation(
  rawUrl: string,
): Promise<FetchGptShareResult> {
  const classified = classifyGptConversationUrl(rawUrl);
  if (classified.kind === "invalid" || !classified.normalized) {
    return {
      ok: false,
      reason: "invalid",
      message: "That doesn’t look like a ChatGPT conversation URL.",
      needsTranscript: true,
    };
  }

  if (classified.kind === "private") {
    return {
      ok: false,
      reason: "private",
      message:
        "Private ChatGPT links (chatgpt.com/c/…) can’t be read without your login. Paste a public share link or the transcript/export text instead.",
      url: classified.normalized,
      needsTranscript: true,
    };
  }

  if (classified.kind !== "share") {
    return {
      ok: false,
      reason: "fetch_failed",
      message:
        "Only ChatGPT share links can be fetched. Paste a chatgpt.com/share/… URL or the conversation transcript.",
      url: classified.normalized,
      needsTranscript: true,
    };
  }

  try {
    const response = await fetch(classified.normalized, {
      method: "GET",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "ProjectBrainBot/1.0 (+local; share-link extract)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: "fetch_failed",
        message: `Could not fetch the share page (HTTP ${response.status}). Paste the transcript instead.`,
        url: classified.normalized,
        needsTranscript: true,
      };
    }

    const html = await response.text();
    const text = extractReadableTextFromShareHtml(html);
    if (!text) {
      return {
        ok: false,
        reason: "empty",
        message:
          "The share page didn’t expose readable conversation text. Paste the transcript or export text below.",
        url: classified.normalized,
        needsTranscript: true,
      };
    }

    return {
      ok: true,
      text,
      source: "share_fetch",
      url: classified.normalized,
      warning:
        "Fetched from a public share page. Content may be partial — paste more transcript if needed.",
    };
  } catch {
    return {
      ok: false,
      reason: "fetch_failed",
      message:
        "Share link fetch failed (network or blocked). Paste the transcript or export text instead.",
      url: classified.normalized,
      needsTranscript: true,
    };
  }
}
