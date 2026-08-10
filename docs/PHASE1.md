# Phase 1 implementation plan

**Starting point:** empty git repository (no app code).

## Plan

1. Scaffold Next.js 16 (App Router) + TypeScript + Tailwind 4
2. Add Prisma 7 + PostgreSQL (Docker Compose) + Zod
3. Define schema for Phase 1 + forward-compatible AI models
4. Feature modules under `src/features/*` with server actions
5. Ship Game-only wizard → genres/templates → intent → design focus → node tree
6. AI as interfaces/stubs only (no OpenAI calls)

## Status

Phase 1 foundation is implemented. See root `README.md` for run instructions.

## Architecture check — multi-focus node classifications

**Verdict: already supported. No schema change required.**

- `Node.classifications` is 1:N (`NodeClassification`); there is no uniqueness constraint limiting a node to one row.
- Each row has `category` (DesignFocus id/key), first-class `confidence`, `source` (`ai` | `user` | `rule`), and `metadata` Json for contribution `weight`, status (`proposed` / `accepted` / `rejected` / `corrected`), correction reason, and reasoning.
- Optional `Node.designFocusId` is a Phase 1 organizational/primary link only; multi-focus contribution weights live on `NodeClassification` rows in Phase 2+.
- Creator correction/rejection of individual rows is trivially ready via per-row updates (`source` + `metadata`); AI never auto-mutates authoritative node fields.

Phase 2 Ready analysis is documented in [`PHASE2.md`](./PHASE2.md).
