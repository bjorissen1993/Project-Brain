import type { LocaleId } from "@/features/preferences";
import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

export type MessageTree = typeof en;

const catalogs: Record<LocaleId, MessageTree> = {
  en,
  nl: nl as MessageTree,
};

export type MessageKey = {
  [K in keyof MessageTree]: {
    [P in keyof MessageTree[K] & string]: `${K & string}.${P}`;
  }[keyof MessageTree[K] & string];
}[keyof MessageTree];

export type TranslateVars = Record<string, string | number>;

function getLeaf(
  tree: MessageTree,
  key: string,
): string | undefined {
  const [ns, leaf] = key.split(".", 2);
  if (!ns || !leaf) return undefined;
  const section = tree[ns as keyof MessageTree];
  if (!section || typeof section !== "object") return undefined;
  const value = (section as Record<string, string>)[leaf];
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v == null ? `{${name}}` : String(v);
  });
}

/** Resolve plural variant: `key_other` when count !== 1 and that key exists. */
function resolvePluralKey(
  tree: MessageTree,
  key: MessageKey,
  vars?: TranslateVars,
): string {
  const count = vars?.count;
  if (typeof count === "number" && count !== 1) {
    const otherKey = `${key}_other`;
    const other = getLeaf(tree, otherKey);
    if (other) return other;
  }
  return getLeaf(tree, key) ?? getLeaf(catalogs.en, key) ?? key;
}

export function translate(
  locale: LocaleId,
  key: MessageKey,
  vars?: TranslateVars,
): string {
  const tree = catalogs[locale] ?? catalogs.en;
  return interpolate(resolvePluralKey(tree, key, vars), vars);
}

export function getMessages(locale: LocaleId): MessageTree {
  return catalogs[locale] ?? catalogs.en;
}
