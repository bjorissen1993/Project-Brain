# Deploy: brain.freakydev.com

Project Brain is ready for Auth.js (Google + GitHub), allowlist access, and a linked GitHub repo per project.  
In this repo there is **no Valorush deploy config** — treat hosting like your other freakydev apps (often Coolify / Docker / nginx on a VPS).

Production URL target: **`https://brain.freakydev.com`** (HTTPS verplicht voor Google/GitHub OAuth)

> **Belangrijk:** `http://brain.freakydev.com` werkt **niet** voor Google login.
> Google weigert productie-OAuth zonder HTTPS. Als de browser “Not secure” / HTTP toont,
> eerst TLS aanzetten (Coolify/Cloudflare/Let’s Encrypt), daarna pas OAuth testen.

---

## Wat er al in de repo zit

- Auth.js v5 (`next-auth`) met Google + GitHub
- Account linking (zelfde user kan beide providers koppelen)
- Allowlist via `ALLOWED_EMAILS` / `ALLOWED_GITHUB_USERS`
- Login-pagina `/login`, denial-pagina `/auth/denied`
- Prisma-modellen: `User`, `Account`, `Session`, `VerificationToken`
- Projectveld `githubRepo` (`owner/name`) + UI op Project Profile
- Project-eigendom: `Project.userId` (nullable voor legacy). Met auth aan: inloggen verplicht om te maken; lijst toont alleen jouw projecten.
- Na login: browser-orphans (`localStorage` `pb:orphan-project-ids`) worden gekoppeld; als jij de enige user bent (allowlist) worden alle `userId: null` projecten automatisch geclaimd. Handmatig: **Instellingen → Alle ongeclaimde projecten claimen** (of op naam/id). CLI: `npm run db:claim-orphans -- --email=…`. Claimen ziet alleen rijen in **deze** server-DB — niet localhost.
- `.env.example` met productie-placeholders

Zonder `AUTH_SECRET` + provider-secrets blijft lokale anonieme mode werken.

---

## Jij moet nog (checklist)

### 1. DNS

1. Maak een record voor `brain.freakydev.com` (zelfde aanpak als Valorush):
   - **CNAME** naar je Coolify/host-doel, of
   - **A/AAAA** naar je VPS-IP
2. Wacht tot DNS propageert; zet daarna TLS aan (Let’s Encrypt via Coolify/Cloudflare/nginx).

### 2. Hosting / deploy

Spiegel je Valorush-setup, bijvoorbeeld:

**Coolify (veelgebruikt voor `*.freakydev.com`)**

1. Nieuwe resource → deze Git-repo
2. Build: Node / Nixpacks of Dockerfile (deze repo heeft geen Dockerfile; Nixpacks/`npm run build` is prima)
3. Start command: `npm run start` (poort `3000`, of wat Coolify expose’t)
4. Zet env vars (stap 4)
5. Domain: `brain.freakydev.com` + HTTPS
6. **Post-deploy migrate:**  
   `npx prisma migrate deploy`  
   (eenmalig of als release-step vóór/na start)

**Vercel (alternatief)**

1. Import repo → Project
2. Env vars zetten
3. Domain `brain.freakydev.com` koppelen
4. Build command blijft `prisma generate && next build` (`npm run build`)
5. Migrate: run `prisma migrate deploy` in CI of een one-off job tegen productie-`DATABASE_URL`

**nginx reverse proxy (VPS)**

- Proxy `https://brain.freakydev.com` → `http://127.0.0.1:3000`
- Zet `AUTH_TRUST_HOST=true` en `AUTH_URL=https://brain.freakydev.com`

### 3. Database

1. Provision Postgres (Coolify Postgres, managed Neon/Prisma Postgres, of je bestaande DB)
2. Zet `DATABASE_URL` op de productie-connectiestring
3. Run: `npx prisma migrate deploy`
4. Optioneel: `npm run db:seed` (genre-catalogus)

### 4. OAuth apps

**Google Cloud Console**

1. APIs & Services → Credentials → OAuth 2.0 Client ID (Web application)
2. Authorized JavaScript origins: `https://brain.freakydev.com`
3. Authorized redirect URIs: `https://brain.freakydev.com/api/auth/callback/google`
4. Kopieer Client ID / Secret → `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`

**GitHub → Settings → Developer settings → OAuth Apps**

1. Homepage URL: `https://brain.freakydev.com`
2. Authorization callback URL: `https://brain.freakydev.com/api/auth/callback/github`
3. Kopieer Client ID / Secret → `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`

Lokaal testen: voeg ook `http://localhost:3000/api/auth/callback/...` toe (aparte OAuth clients mag).

### 5. Secrets / env op de host

Minimaal:

```bash
DATABASE_URL="postgresql://..."
AUTH_SECRET="<lang random secret, bv. openssl rand -base64 32>"
AUTH_URL="https://brain.freakydev.com"
AUTH_TRUST_HOST="true"
AUTH_GOOGLE_ID="..."
AUTH_GOOGLE_SECRET="..."
AUTH_GITHUB_ID="..."
AUTH_GITHUB_SECRET="..."
ALLOWED_EMAILS="jouw@email.com"
ALLOWED_GITHUB_USERS="jouw-github-username"
OPENAI_API_KEY="..."   # optioneel maar nodig voor AI-features
```

- Commit **nooit** echte secrets.
- Allowlist leeg = **iedereen geweigerd** (fail-closed).

### 6. Eerste login

1. Open **`https://brain.freakydev.com`** (niet `http://`)
2. Log in met Google of GitHub (account moet op de allowlist staan)
3. In het profielmenu: koppel de andere provider terwijl je ingelogd bent
4. **Bestaande projecten (Chimera e.d.):** na `prisma migrate deploy` → ga naar **Instellingen** → klik **Alle ongeclaimde projecten claimen** (of wacht op auto-claim als jij de enige user bent)
5. Open een project → Profile → **GitHub repository** → sla `owner/name` op

### 7. Smoke checks

- [ ] Niet-allowlisted account → `/auth/denied`
- [ ] Uitloggen → opnieuw `/login`
- [ ] Beide providers gekoppeld aan één user (database: één `User`, twee `Account`-rijen)
- [ ] `githubRepo` zichtbaar na refresh op Profile
- [ ] Nieuw project krijgt `userId` van de ingelogde user; lijst toont alleen eigen projecten
- [ ] Instellingen → claim ongeclaimde projecten werkt voor allowlisted account

### 8. Google login werkt niet — checklist

1. **HTTPS** — Adresbalk moet `https://brain.freakydev.com` tonen (slotje). Alleen HTTP = Google OAuth faalt.
2. **Env op de host** — `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_URL=https://brain.freakydev.com`, `AUTH_TRUST_HOST=true`. Na wijzigen: herstarten/redeployen.
3. **Google Console** — Authorized JavaScript origins: `https://brain.freakydev.com`  
   Authorized redirect URI (exact): `https://brain.freakydev.com/api/auth/callback/google`
4. **Allowlist** — `ALLOWED_EMAILS` moet het Google-account-e-mailadres bevatten (anders `/auth/denied`).
5. **AUTH_URL** — moet exact de publieke HTTPS-URL zijn (geen trailing slash, geen `http://`).

In de UI: bij HTTP of misconfiguratie toont “Doorgaan met Google” nu een foutmelding i.p.v. stil niets te doen.

---

## Lokale data → productie (Valorush / Chimera)

### Waarom “Claimen” offline/lokaal gemaakte projecten niet ziet

**Claimen werkt alleen op projecten die al in de database van de server staan waarop je bent ingelogd.**

- Projecten gemaakt op `localhost` staan in je **lokale** Postgres.
- `https://brain.freakydev.com` heeft een **andere** database.
- De claim-knop (of auto-claim na login) kan **niets van een andere machine ophalen**. Zonder export→import (of dump→restore) blijft de productielijst leeg / zonder jouw lokale projecten.

Daarna claimen (of auto-claim) koppelt rijen met `userId = null` aan jouw account op **die** server.

### Optie 1 — JSON export/import (aanbevolen voor Railway)

Veilig op app-niveau: behoudt project/node-IDs, herstelt circulaire FKs (`Node.parentId`, `DesignFocus.parentId`) in meerdere passes, overschrijft bestaande projecten **niet**, en zet `userId = null` zodat claimen werkt. Geen `pg_dump` nodig.

Volledige PowerShell-stappen: **[PROJECT-MIGRATE.md](./PROJECT-MIGRATE.md)**.

```powershell
# Lokaal exporteren (.env → lokale DATABASE_URL)
npm run db:up
npm run db:export-projects -- --out=brain-projects.json

# Dry-run tegen Railway (geen writes)
$env:DATABASE_URL = "<RAILWAY_DATABASE_URL>"
npm run db:import-projects -- brain-projects.json --dry-run

# Echte import
npm run db:import-projects -- brain-projects.json

# Claimen
npm run db:claim-orphans -- --email=jij@voorbeeld.com
```

Lokale Postgres (Docker Compose):

| | |
|---|---|
| Service | `db` (`docker-compose.yml`) |
| Poort | `5432` → host |
| DB / user / wachtwoord | `projectbrain` / `projectbrain` / `projectbrain` |
| Connectie | zie `.env.example` → `DATABASE_URL` (niet committen met echte secrets) |

Start lokaal: `npm run db:up` (of `docker compose up -d`).

### Optie 2 — `pg_dump` / restore (alleen lege/wegwerp-DB)

Meest “ruw” compleet, maar riskant bij circulaire FKs en **niet** geschikt als de target al users/auth heeft die je wilt behouden. Restore **niet** over een DB die je al wilt bewaren — `--clean` wist bestaande objecten.

**Vooraf op productie:** schema klaar via `npx prisma migrate deploy` tegen productie-`DATABASE_URL`.

#### Windows (PowerShell) — kort pad

```powershell
# 1) Lokale DB draaien + dump
npm run db:up
docker compose exec -T db pg_dump -U projectbrain -d projectbrain --no-owner --no-acl > brain-local.sql

# 2) Restore naar productie (PRODUCTIE-URL zelf zetten; secrets niet committen/chatten)
# Vereist: psql op PATH, of uitvoeren op de host/Coolify one-off
$env:DATABASE_URL = "<PRODUCTION_DATABASE_URL>"
psql $env:DATABASE_URL -f brain-local.sql

# 3a) Claim via de site (allowlist): Instellingen → Alle ongeclaimde projecten claimen
#     of één project op naam/id claimen in hetzelfde scherm

# 3b) Of one-shot script tegen productie-DB (eerst één keer inloggen zodat je User-rij bestaat):
$env:DATABASE_URL = "<PRODUCTION_DATABASE_URL>"
npm run db:claim-orphans -- --email=jij@voorbeeld.com
# optioneel één project: --project=Valorush   of --project=<cuid>
```

**Dump lokaal (PowerShell, via Docker):**

```powershell
npm run db:up
docker compose exec -T db pg_dump -U projectbrain -d projectbrain --no-owner --no-acl > brain-local.sql
```

**Restore naar productie** (zet `PRODUCTION_DATABASE_URL` zelf; plak secrets niet in chat/docs):

```powershell
# Vereist: psql op je PATH, of voer dit uit op de host/Coolify one-off
$env:PGPASSWORD = "..."   # alleen als nodig; liever connection string
psql "$env:PRODUCTION_DATABASE_URL" -f brain-local.sql
```

Of vanuit een container die bij productie-Postgres kan:

```bash
psql "$PRODUCTION_DATABASE_URL" -f brain-local.sql
```

**Na restore:**

1. Open `https://brain.freakydev.com` en log in (allowlist).
2. Projecten met `userId = null` (typisch na lokale anonieme mode): **Instellingen → Alle ongeclaimde projecten claimen**, of claim op naam/id, of `npm run db:claim-orphans -- --email=…` tegen productie-`DATABASE_URL`. Auto-claim-all gebeurt alleen als jij de **enige** user in die DB bent.
3. Controleer Valorush + Chimera in de projectlijst.

**Als claimen na restore nog faalt / niets toont:**

| Oorzaak | Wat te checken |
|---|---|
| Allowlist | `ALLOWED_EMAILS` / `ALLOWED_GITHUB_USERS` bevat jouw account; anders geen claim-sectie |
| Al een `userId` | Project hoort al bij een andere (of oude) user → niet “unowned” |
| Verkeerde DB | Dump/restore ging naar een andere URL dan de app gebruikt |
| Sessies | Uitloggen/inloggen opnieuw; claim-UI alleen voor ingelogde allowlist-users |
| Meerdere users | Auto-claim-all alleen bij precies 1 user; gebruik dan handmatig claimen of `db:claim-orphans` |

### Optie 3 — UI Export JSON/Markdown (geen migratie)

Op **Project Profile** kun je Markdown of JSON **downloaden**. Dat is **geen** DB-import: gebruik `db:export-projects` / `db:import-projects` voor migratie (optie 1).

### Optie 4 — Productie tijdelijk op dezelfde DB

Niet doen voor de lange termijn: lokale Docker is niet je productiebron, en één gedeelde DB koppelt env/secrets/latency/risico onnodig.

---

## Lokale ontwikkeling

```bash
cp .env.example .env
# AUTH_* leeg laten → anonieme lokale workspace
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Om OAuth lokaal te testen: vul `AUTH_*` + allowlist in, zet `AUTH_URL=http://localhost:3000`, en registreer localhost-callbacks bij Google/GitHub.
