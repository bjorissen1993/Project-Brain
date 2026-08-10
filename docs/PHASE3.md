# Phase 3 — Balance engine

## What shipped

1. **Normalize targets** among siblings (scores need not sum to 100)
2. **`actualWeight`** from Ready-node classification weights, hierarchical roll-up
3. **Independent balance at every Design Focus level** — green parent can have red children
4. **Code thresholds**: |diff| ≤5 green, ≤10 orange, >10 red; direction labels (`+8% over target`)
5. **Confidence** rolled up separately (not balance color)
6. **Balance dashboard** with horizontal bars + drill-down
7. **Recalc wired** after Ready analysis, classification corrections, and target edits

## Core module

`src/features/design-focus/balance-engine.ts` — pure math + persist to `DesignFocus.actualWeight` / `confidence`.

## How to test

1. `npm run db:migrate` (Phase 3–6 migration)
2. Mark several nodes Ready with classifications across focuses
3. Open **Balance** — bars, colors, drill-down
4. Correct a classification weight/category → balance updates
5. Raise a focus targetImportance → sibling normalized targets shift

Without `OPENAI_API_KEY`: balance still works (no AI narration required).
