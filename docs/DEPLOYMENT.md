# Deployment & operations

The app targets **Vercel** with a **Postgres** database (Neon works well) and
**Upstash Redis** for rate limiting. It's a standard Next.js App Router deploy —
no custom server.

## Environment variables

Set these in `.env.local` for local dev and in **Vercel → Project → Settings →
Environment Variables** for deployments. Template: [`.env.example`](../.env.example).

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | Postgres connection string. Neon on Vercel sets this automatically. |
| `DIRECT_URL` | if your host needs it | Direct (non-pooled) Postgres URL used by Prisma for schema pushes/migrations. |
| `AUTH_SECRET` | **yes** | Signs session cookies. Generate: `openssl rand -base64 32`. |
| `ENCRYPTION_KEY` | **yes** | Encrypts each user's Apify key at rest (AES-256-GCM), 32+ chars. Generate: `openssl rand -base64 32`. |
| `UPSTASH_REDIS_REST_URL` | prod: **yes** | Upstash Redis REST URL for rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | prod: **yes** | Upstash Redis REST token. |
| `GEMINI_API_KEY` | optional | Enables the Gemini deep-read pass (aiScore + summary on top roles). Blank = keyword scoring only. |
| `GEMINI_MODEL` | optional | Gemini model id. Default `gemini-2.5-flash`. |
| `GEMINI_REVIEW_MAX_JOBS` | optional | Top N keyword-scored roles deep-read per search. Default `25`. |
| `GEMINI_REVIEW_MIN_SCORE` | optional | Min keyword score to qualify for a Gemini read. Default `70`. |

> **Rate limiting is disabled when the Upstash vars are blank.** That's fine
> locally, but in production set them so login, signup, and search are protected
> against abuse.

> **Secrets are load-bearing.** If `AUTH_SECRET` changes, all existing sessions are
> invalidated (users must log in again). If `ENCRYPTION_KEY` changes, previously
> stored Apify keys can no longer be decrypted and users must re-enter them. Treat
> both as permanent once you have real users; rotate only with a migration plan.

## First deploy to Vercel

1. Push the repo to GitHub.
2. Vercel → **New Project** → import the repo.
3. Add a database: **Storage → Create → Neon** (sets `DATABASE_URL`), or paste your
   own connection string.
4. Add the env vars above (`AUTH_SECRET`, `ENCRYPTION_KEY`, and the Upstash pair).
5. Deploy.
6. **Create the tables** against the production database (once):
   ```bash
   DATABASE_URL="<prod url>" npm run db:push
   ```
   Or add a `prisma migrate deploy` step to the build if you switch to migrations.

The `build` script runs `prisma generate` before `next build`, and `postinstall`
also runs `prisma generate`, so the Prisma client is always in sync on Vercel.

## Database schema changes

**Decision:** move from `prisma db push` (no history) to **versioned migrations**
(`prisma migrate`), which records every change as a committed SQL file under
`prisma/migrations/`.

### One-time: adopt migrations on the existing database

Because the tables already exist (created via `db push`), baseline them so Prisma
treats the current schema as "migration #1, already applied":

```bash
# 1. Generate a baseline migration from the current schema (don't apply it).
mkdir -p prisma/migrations/0_init
npx prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql

# 2. Mark the baseline as already applied — run once PER existing database
#    (your dev DB and your production DB).
npx prisma migrate resolve --applied 0_init
```

Commit the `prisma/migrations/` folder.

> ⚠️ You must run `migrate resolve --applied 0_init` against **production** too,
> before the first `migrate deploy` there — otherwise it will try to recreate
> tables that already exist.

### Ongoing workflow (replaces `db:push`)

```bash
# Dev: edit prisma/schema.prisma, then create + apply a migration:
npx prisma migrate dev --name describe_the_change

# Prod / CI: apply any pending migrations:
npx prisma migrate deploy
```

Update the Vercel **build command** to run `prisma migrate deploy` (instead of
`db push`) so production stays in sync on every deploy.

## Operational notes

- **Function timeouts:** `POST /api/search` sets `maxDuration = 300` (scraping is
  slow); `POST /api/cv` sets `60`. Keep these within your Vercel plan's limits.
- **Scraping cost is per-user.** Each user brings their own Apify key, so scraping
  usage and cost land on their account, not yours.
- **Backups:** rely on your Postgres provider's backups (Neon has point-in-time
  restore). There is no app-level export/import of the full database.
- **Logs:** use `vercel logs` or the Vercel dashboard to inspect function runs,
  especially failed searches (Apify Actor errors are surfaced in the search route).
