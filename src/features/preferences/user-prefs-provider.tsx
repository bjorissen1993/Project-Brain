"use client";

import { useEffect } from "react";
import { applyDocumentPrefs } from "./user-prefs";

/** Restores theme / locale / font scale after hydration. */
export function UserPrefsProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyDocumentPrefs();
  }, []);
  return children;
}
