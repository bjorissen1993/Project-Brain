"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LOCALE,
  readLocale,
  subscribeUserPrefs,
  type LocaleId,
} from "@/features/preferences";
import {
  translate,
  type MessageKey,
  type TranslateVars,
} from "./messages";

export function useLocale(): LocaleId {
  return useSyncExternalStore(
    subscribeUserPrefs,
    readLocale,
    () => DEFAULT_LOCALE,
  );
}

export function useTranslations() {
  const locale = useLocale();
  const t = useCallback(
    (key: MessageKey, vars?: TranslateVars) => translate(locale, key, vars),
    [locale],
  );
  return { locale, t };
}

/** Shorthand — most call sites only need `t`. */
export function useT() {
  return useTranslations().t;
}
