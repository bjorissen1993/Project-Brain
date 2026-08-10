# Phase 2 — Basic AI

Extends Phase 1. Creator intent remains the source of truth. AI analyzes and suggests; it never silently mutates authoritative project data (genres, focuses, intent, or relations).

## What shipped

1. **OpenAI Ready analysis** via modular `AIService.analyzeReadyNode` (also powers `classifyNode` / `summarizeNode` / `summarizeParent`)
2. **Selective context builder** — latest intent, node (+ parent), relevant Design Focus tree, connected/nearby nodes, classification rules, child summaries for folders/parents
3. **Trigger on Ready** — when status transitions to `READY` (or create-as-Ready)
4. **Persistence** — `Node.summary` / `Node.projectImpact`, multi-row `NodeClassification` (weight + confidence in metadata, `source=ai`), `AIAnalysis` record
5. **Suggested relations** — Accept / Reject in UI only (never auto-created)
6. **Classification corrections** — keep / reject (+ optional reason + save-as-rule) / edit weight·confidence / move category (`source=user`)
7. **Outdated banner** — content/intent fingerprint mismatch → Quick reanalyse

## Env vars

```bash
OPENAI_API_KEY=""                 # required for Ready analysis
OPENAI_MODEL_QUICK="gpt-4o-mini"  # used for Ready analysis
OPENAI_MODEL_STANDARD="gpt-4o"
OPENAI_MODEL_DEEP="gpt-4o"
```

- API key is **server-only**. Never expose to the client.
- If `OPENAI_API_KEY` is missing, Ready analysis is **deferred** (`AIAnalysis.status=deferred`) with message: `Analysis pending — configure OPENAI_API_KEY`. No fake “AI” results.
- Setup wizard still falls back to labeled heuristics when the key is missing.

## How Ready analysis works

1. Creator sets node status to **Ready** and saves.
2. Backend detects `status` transition → `READY`.
3. `buildReadyAnalysisContext(nodeId)` gathers a **selective** prompt (not the whole project).
4. OpenAI (`quick` model) returns structured JSON → Zod `nodeAIAnalysisSchema` → normalize against real Design Focus / node ids.
5. Persist advisory fields + classifications + `AIAnalysis`; suggested relations stay pending until Accept.
6. Parent/folder Ready prefers **child summaries / impacts / classifications** over full child documents.

Manual **Quick reanalyse** on the node detail page re-runs the same pipeline.

## Classification metadata

`NodeClassification.metadata` (Phase 2 convention):

```json
{
  "designFocusId": "...",
  "focusName": "...",
  "weight": 65,
  "reasoning": "...",
  "status": "proposed|accepted|rejected|corrected",
  "correctionReason": "optional"
}
```

`confidence` remains a first-class column (0–100). Human corrections set `source=user` and are preserved across reanalysis.

## Schema changes

- `Node.summary` (Text, nullable)
- `Node.projectImpact` (Text, nullable)

Migration: `prisma/migrations/20260807220000_phase2_node_summary`

## How to test

1. `npm run db:migrate` (apply summary columns)
2. Set `OPENAI_API_KEY` in `.env`
3. `npm run dev`
4. Open a project → node detail → set status **Ready** → Save
5. Confirm Summary, Project Impact, Classifications, Suggested connections
6. Reject a classification with a reason; Accept a suggested relation
7. Edit node content → see **Analysis outdated** → Quick reanalyse

Without an API key: Ready still saves, analysis shows deferred pending message.

## Later phases

See [PHASE3.md](./PHASE3.md) – [PHASE6.md](./PHASE6.md).
