# Job Matcher (web edition)

A multi-user web app: each person uploads their CV, answers a short questionnaire,
and the app scrapes fresh jobs (via **their own Apify key**), scores them against
their profile with a keyword engine, and shows ranked matches with export to CSV /
Google Sheets / Excel.

This is the **hosted Gemini edition**, separate from the local Python/Claude tool.
It shares no code with that version.

- **Stack:** Next.js (App Router, TypeScript) + Tailwind + Prisma + Postgres
- **Hosting:** GitHub → Vercel
- **AI:** two-stage matching. A keyword engine scores every scraped job cheaply;
  when `GEMINI_API_KEY` is set, Gemini then deep-reads the **top** keyword-scored
  JDs against the CV + questionnaire and returns a 0–100 fit score plus a
  per-job summary (`src/lib/ai.ts → geminiRescore`).

## How matching works

1. **Keyword scorer** (`src/lib/scoring.ts`) — deterministic first pass over every
   scraped job. Drops hard exclusions, scores 0–100, and is the cheap gate that
   decides which jobs are worth a paid AI read. Runs with or without Gemini.
2. **Gemini deep read** (`src/lib/ai.ts`) — optional. Sends only the top
   keyword-scored roles' descriptions to Gemini together with the CV and
   questionnaire, and records a semantic `aiScore` (0–100, 85+ = strong fit) and a
   short `aiSummary` explaining the fit. Reviewed jobs surface first; the results
   view can filter to `aiScore >= 85`.

Without `GEMINI_API_KEY` the app runs fully on the keyword scorer — accounts,
CV parsing (PDF/DOCX/TXT), questionnaire, Apify scraping, ranked results with
reasons, status tracking, CSV export all work; the Gemini pass is simply skipped.

## Local development

1. Copy env and fill values:
   ```bash
   cp .env.example .env.local
   ```
   - `DATABASE_URL` — a Postgres URL. Easiest is a free Neon project (neon.tech).
   - `AUTH_SECRET` and `ENCRYPTION_KEY` — run `openssl rand -base64 32` for each.
2. Create the tables:
   ```bash
   npm run db:push
   ```
3. Run it:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000, sign up, then fill in your profile.

## Deploy to Vercel

1. Push this folder to a **new GitHub repo**.
2. In Vercel: **New Project → import the repo**.
3. Add a Postgres store: **Storage → Create → Neon** (Vercel sets `DATABASE_URL`
   automatically), or paste your own `DATABASE_URL`.
4. Add env vars in **Settings → Environment Variables**: `AUTH_SECRET`,
   `ENCRYPTION_KEY` (and later `GEMINI_API_KEY`).
5. Deploy. After the first deploy, push the schema once from your machine against
   the production DB:
   ```bash
   npm run db:push
   ```
   (or add a one-off `prisma migrate deploy` step).

## Per-user setup (each person who logs in)

1. Sign up with email + password.
2. Profile page → upload CV, answer the questionnaire, paste **their own Apify
   API key** (apify.com → Settings → API & Integrations). The key is encrypted
   at rest (AES-256-GCM).
3. Dashboard → **Run job search**.

## Enabling the Gemini pass

The integration is built (Vercel AI SDK + `@ai-sdk/google`). To turn it on:

1. Set `GEMINI_API_KEY` in Vercel (or `.env.local`). That alone enables the pass.
2. Optional tuning (env vars, all have defaults):
   - `GEMINI_MODEL` — default `gemini-2.5-flash`.
   - `GEMINI_REVIEW_MAX_JOBS` — how many top roles to deep-read per search (default `25`).
   - `GEMINI_REVIEW_MIN_SCORE` — minimum keyword score to qualify for a read (default `70`).

Cost/latency scale with `GEMINI_REVIEW_MAX_JOBS` — each reviewed job is one Gemini
call. If the pass errors for a job, that job keeps its keyword score and is left
un-reviewed (the app never fails a search because of Gemini).

## Documentation

Deeper docs live in [`docs/`](docs/):

- [User guide](docs/USER_GUIDE.md) — how to sign up, set up a profile, run a search,
  read results, and export.
- [Architecture](docs/ARCHITECTURE.md) — how the pieces fit together and why.
- [API reference](docs/API.md) — every endpoint, its inputs, and responses.
- [Data model](docs/ARCHITECTURE.md#data-model) — the database tables.
- [Deployment & operations](docs/DEPLOYMENT.md) — env vars, database, Vercel, secrets.
- [Contributing](docs/CONTRIBUTING.md) — project layout, conventions, tests.

## Testing

Unit tests use [Vitest](https://vitest.dev) and live next to the code they cover
(`src/lib/*.test.ts`):

```bash
npm test
```

## Notes

- Scoring logic lives in `src/lib/scoring.ts` and the per-user strategy in
  `src/lib/strategy.ts` — both are generalized for any job seeker.
- Apify sources are LinkedIn (worldwide) + JobStreet (MY/SG). Add more in
  `src/lib/apify.ts`.
- Remaining `npm audit` warnings are in Prisma's build-time CLI (mysql2 /
  deepmerge-ts), not in the deployed runtime.
"# job-matcher-web" 
