# Phase 4 — AI design analysis

## What shipped

1. **`analyzeImbalance`** (standard model) — narrates code-computed balance; respects intent
2. **`generateImprovementSuggestions`** — ADD/REMOVE/MERGE/SIMPLIFY/AUTOMATE/REPOSITION/CONNECT/REPURPOSE; Accept/Reject only
3. **Quick reanalysis** after corrections: recalc balance → parents → only small AI pass if significant threshold shifts (quick model)
4. **Classification rules** — corrections can save positive/negative rules; passed into AI context
5. **Outdated detection** — content / intent / rules / taxonomy fingerprint → banner + Quick reanalyse

## UI

Balance page: **Analyze imbalance** + **Suggest improvements** panels.

## How to test

1. Set `OPENAI_API_KEY`
2. Ensure Ready classifications + some orange/red balance rows
3. Balance → Analyze imbalance / Suggest improvements
4. Accept or Reject a suggestion
5. Correct a classification that flips green↔red → check for quick_reanalysis AIAnalysis row
6. Edit intent or design-focus targets → node shows Analysis outdated

Without API key: actions defer gracefully (same Phase 2 pattern).
