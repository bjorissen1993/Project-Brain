# Phase 5 — Advanced project intelligence

## What shipped

1. **Direction checks** (`performDirectionCheck`) — occasional triggers (same-purpose cluster, green→red, large folder Ready, distribution drift, act complete); free-text response → intent history
2. **Project Intent History UI** — versions with reason; direction responses append versions
3. **Recent Idea Analysis** — primary classification skew vs intent
4. **Game Phase Analysis** — Early/Mid/Late/Endgame on nodes
5. **Full Project Analysis** — manual, deep model, selective context

## Route

`/projects/[id]/intelligence`

## Schema

- `Node.gamePhase` enum
- `ProjectIntentVersion.reason`

## How to test

1. Tag nodes with game phases; create Ready mechanics
2. Open Intelligence — review skew + phase distribution
3. Run direction check → answer → confirm new intent version with reason `direction_check_response`
4. Run full project analysis (deep model)
