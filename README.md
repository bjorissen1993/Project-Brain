# Project Brain

AI-assisted **Game Design Intelligence** workspace. The creator’s stated intention is the source of truth. AI analyzes, classifies, and suggests — it never silently changes authoritative project data.

## Stack

- Next.js App Router + TypeScript + React
- Tailwind CSS
- PostgreSQL + Prisma ORM 7
- Zod validation
- OpenAI (server-only) for setup suggestions + Ready-node analysis

## Quick start

### 1. Install

```bash
npm install
```

### 2. Environment

Copy `.env.example` to `.env`:

```bash
DATABASE_URL="postgresql://projectbrain:projectbrain@localhost:5432/projectbrain?schema=public"
OPENAI_API_KEY=""
OPENAI_MODEL_QUICK="gpt-4o-mini"
OPENAI_MODEL_STANDARD="gpt-4o"
OPENAI_MODEL_DEEP="gpt-4o"
```

`OPENAI_API_KEY` is server-only. Ready analysis requires it (otherwise deferred). Setup wizard falls back to labeled heuristics if unset.

### 3. Start PostgreSQL

Requires Docker Desktop running:

```bash
npm run db:up
```

### 4. Migrate + seed genres

```bash
npm run db:migrate
npm run db:seed
```

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Auth (optional locally)

Copy the Auth.js / allowlist keys from `.env.example` when you want Google + GitHub login.  
With `AUTH_SECRET` and at least one provider set, the app requires sign-in and enforces `ALLOWED_EMAILS` / `ALLOWED_GITHUB_USERS`.

Production checklist (DNS, OAuth apps, Coolify/Vercel, migrate): see [`docs/DEPLOY-brain.freakydev.com.md`](docs/DEPLOY-brain.freakydev.com.md).

## Phase status

| Phase | Status |
|-------|--------|
| 1 Structure / intent / tree | Done — see `docs/PHASE1.md` |
| 2 Basic AI (Ready analysis) | Done — see `docs/PHASE2.md` |
| 3 Balance math / charts | Not yet |
| 4 Improvements / rules pipeline | Not yet |
| 5 Direction / phase analysis | Not yet |
| 6 Graph / Timeline / Board | Not yet |

## Phase 2 highlights

- Mark a node **Ready** → selective OpenAI analysis (quick model)
- Summary + project impact + multi-focus classifications (weight %, confidence %)
- Suggested relations with Accept / Reject (never auto-created)
- Human classification corrections override AI
- Parent/folder Ready prefers child summaries

## Architecture

```
src/
├── app/                 # App Router pages
├── components/          # Shared UI + layout
├── features/
│   ├── projects/
│   ├── nodes/
│   ├── relations/
│   ├── game-profile/
│   ├── design-focus/
│   ├── analysis/        # Ready pipeline + AI panel
│   └── ai/              # AIService, OpenAI client, schemas, context builder
├── lib/
├── server/
├── types/
└── db/
```

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Generate Prisma client + production build |
| `npm run db:up` | Start Postgres via Docker Compose |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:seed` | Seed genre catalog from code templates |
| `npm run db:studio` | Prisma Studio |
