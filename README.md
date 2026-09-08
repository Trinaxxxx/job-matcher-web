# Job Matcher (web edition)

A multi-user web app: each person uploads their CV, answers a short questionnaire,
and the app scrapes fresh jobs (via **their own Apify key**), scores them against
their profile with a keyword engine, and shows ranked matches with export to CSV /
Google Sheets / Excel.

This is the **hosted Gemini edition**, separate from the local Python/Claude tool.
It shares no code with that version.

- **Stack:** Next.js (App Router, TypeScript) + Tailwind + Prisma + Postgres
- **Hosting:** GitHub → Vercel
- **AI:** works fully on keyword scoring today. Gemini is optional and drops into
  one function (`src/lib/ai.ts → geminiRescore`) when you add `GEMINI_API_KEY`.

## What works without Gemini

Everything: accounts, CV parsing (PDF/DOCX/TXT), questionnaire, per-user scoring
strategy, Apify scraping, ranked results with reasons, status tracking, CSV export.
The only thing waiting on Gemini is a nuance "read each description" re-rank pass —
stubbed as a no-op so nothing breaks.

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

## Enabling Gemini later

1. `npm install @google/generative-ai`
2. Implement `geminiRescore` in `src/lib/ai.ts` (send CV + strategy + each job
   description, ask for a 0–100 fit score + one-line reason, merge into the score).
3. Set `GEMINI_API_KEY` in Vercel. No other changes needed.

## Notes

- Scoring logic lives in `src/lib/scoring.ts` and the per-user strategy in
  `src/lib/strategy.ts` — both are generalized for any job seeker.
- Apify sources are LinkedIn (worldwide) + JobStreet (MY/SG). Add more in
  `src/lib/apify.ts`.
- Remaining `npm audit` warnings are in Prisma's build-time CLI (mysql2 /
  deepmerge-ts), not in the deployed runtime.
