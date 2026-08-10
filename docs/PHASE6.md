# Phase 6 — Visual project tools

## What shipped

1. **Graph View** — SVG layout of nodes + `NodeRelation` edges (`/graph`)
2. **Timeline View** — acts, game-phase lanes, chronological updates (`/timeline`)
3. **Board View** — columns by status with manual moves (`/board`)
4. **Canvas View** — lightweight freeform positions saved as `Node.posX` / `posY` (`/canvas`) — not a full infinite editor
5. **Context builder** — shared `buildProjectIntelligenceContext` for Phases 2–5 AI
6. **Bottom nav** wired: Overview · Graph · Timeline · Board · Balance

## Schema

- `Node.posX`, `Node.posY` (nullable floats)

## How to test

1. Create nodes + relations → Graph
2. Set statuses → Board (change via dropdown)
3. Tag game phases / acts → Timeline
4. Canvas → drag cards → Save positions → reload

Without OpenAI: all views work.
