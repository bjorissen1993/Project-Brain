# Project migrate (JSON export / import)

Application-level migration of **Project Brain** data between databases (e.g. local Docker Postgres → Railway). Prefer this over raw `pg_dump` when the target already has auth users or when circular FKs (`Node.parentId`, `DesignFocus.parentId`) make dump/restore awkward.

Imported projects always have `userId: null` so the existing claim flow works (Settings → claim, or `npm run db:claim-orphans`).

Auth tables (`User`, `Account`, `Session`, `VerificationToken`) are **not** exported.

---

## What is included

Per project (stable IDs preserved):

| Model | Notes |
|--------|--------|
| `Project` | `userId` forced to `null` on import |
| `ProjectIntentVersion` | |
| `GameProfile` | notes / AI meta |
| `Genre` + `ProjectGenre` | Genres matched by **slug** on target (create if missing) |
| `DesignFocus` | Hierarchy restored in a second pass |
| `Node` | Tree + sticky/note content fields, canvas `posX`/`posY` |
| `NodeImage` | URL metadata only — copy `public/uploads` separately if needed |
| `NodeRelation` | |
| `NodeClassification` | |
| `AIAnalysis` | |
| `ProjectClassificationRule` | |
| `DirectionCheck` | |
| `ImprovementSuggestion` | |
| `ChatThread` + `ChatMessage` | Project-scoped AI chat |

---

## Conflict policy

| Flag | Behavior |
|------|----------|
| *(default)* / `--skip-existing` | If project **id** already exists on target → **skip** that project (no overwrite) |
| `--fail-on-conflict` | Abort with a clear error if any project id already exists |
| `--dry-run` | Zod-validate + list CREATE vs SKIP; **no DB writes** |

The import never wipes or resets the target database.

---

## PowerShell — local export → Railway import

### 1) Export from local DB

```powershell
cd C:\Users\bowie\WebstormProjects\Github\Project-Brain
npm run db:up
# Uses DATABASE_URL from .env (local Docker)
npm run db:export-projects -- --out=brain-projects.json
# Optional: one project by name or id
# npm run db:export-projects -- --out=valorush.json --project=Valorush
```

### 2) Dry-run against Railway (no writes)

```powershell
# Set Railway Postgres URL for this shell only (do not commit secrets)
$env:DATABASE_URL = "<RAILWAY_DATABASE_URL>"
npm run db:import-projects -- brain-projects.json --dry-run
```

### 3) Real import into Railway

```powershell
# Schema must already be applied on Railway:
# $env:DATABASE_URL = "<RAILWAY_DATABASE_URL>"
# npx prisma migrate deploy

$env:DATABASE_URL = "<RAILWAY_DATABASE_URL>"
npm run db:import-projects -- brain-projects.json
# Optional: abort instead of skipping conflicts
# npm run db:import-projects -- brain-projects.json --fail-on-conflict
```

### 4) Claim unowned projects on production

```powershell
$env:DATABASE_URL = "<RAILWAY_DATABASE_URL>"
# Sign in once on the site first so your User row exists
npm run db:claim-orphans -- --email=you@example.com
# Or: Settings → Alle ongeclaimde projecten claimen
```

---

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run db:export-projects` | Export projects → JSON (`--out=`, `--project=`) |
| `npm run db:import-projects -- <file>` | Import JSON (`--dry-run`, `--fail-on-conflict`) |

See also: [DEPLOY-brain.freakydev.com.md](./DEPLOY-brain.freakydev.com.md) (claim flow + deploy checklist).
