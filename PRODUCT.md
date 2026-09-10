# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Global job seekers actively running a job hunt who want to stop manually sifting
job boards. A user uploads their CV, answers a short questionnaire about the roles,
skills, locations, and pay they want, and supplies their own Apify API key so the
app can scrape fresh listings on their behalf.

Today the real audience is a small, known group (this is a portfolio piece and a
tool for a handful of people), with the possibility of growing into a wider public
sign-up base. Worldwide is the intended reach; the Malaysia/Singapore specifics in
the code and docs (JobStreet, RM/SGD, Kuala Lumpur examples) are illustrative, not
a market boundary.

## Product Purpose

Finds fresh job listings (scraped from the last 7 days), scores each one against the
user's *own* background — CV plus questionnaire — and presents a ranked shortlist
with a plain-English reason for every score. The user can then track application
status (New / Interested / Applied / Rejected) and export the list to CSV / Google
Sheets / Excel.

It exists to cut the manual effort of trawling job boards: instead of reading
hundreds of postings, the user sees a short ranked list of genuinely relevant, recent
roles and understands *why* each one ranked where it did. Success is the user
quickly reaching a trustworthy shortlist they can act on and track.

## Positioning

Two-stage matching with a deterministic gate. A keyword scorer runs first over every
scraped job (0–100, tiered, cheap, no AI required) and decides which roles are worth
a paid AI read. Only the top keyword-scored roles are then sent to an optional Gemini
deep-read (`geminiRescore`) that returns a semantic fit score (`aiScore`) and a short
"why this fits you" summary (`aiSummary`).

The copy-resistant part is the discipline around that pipeline:

- **Bring-your-own Apify key** — scraping runs on each user's own account and quota,
  never a shared key; the key is encrypted at rest (AES-256-GCM) and decrypted only
  at search time.
- **Never broken by AI** — the app runs fully on the keyword scorer alone; a missing
  `GEMINI_API_KEY`, or a Gemini failure on any single job, silently degrades that job
  to its keyword score. A search never fails because of the AI stage.

## Operating Context

The end-to-end path a user follows:

1. **Sign up** (email + password; guest accounts also supported).
2. **Profile** — upload a CV (PDF / DOCX / TXT, up to 5 MB), answer the questionnaire
   (target titles, skills, industries, dealbreakers, locations, exclude-locations,
   minimum salary + currency, seniority, remote OK), and paste their own Apify API
   key. Saving rebuilds the derived scoring strategy. A first-run onboarding wizard
   guides this setup.
3. **Dashboard** — kick off a job search.
4. **Results** — ranked matches (AI-reviewed jobs first by `aiScore`, then the rest by
   keyword score), with a filter to the strong-fit set (`aiScore >= 85`), per-job
   status tracking, and export.

Scraping sources are LinkedIn (worldwide) and JobStreet (MY/SG); jobs are limited to
the last 7 days. New sources/regions are added in `src/lib/apify.ts`.

## Capabilities and Constraints

Confirmed functionality:

- Multi-user accounts: email + password, signed-JWT sessions (`jose`), bcrypt hashing,
  constant-time verification, signup anti-enumeration, plus guest accounts.
- CV text extraction from PDF / DOCX / TXT (`unpdf`, `mammoth`).
- Deterministic keyword scoring (`scoring.ts`): 0–100 score, tier (Strong ≥80 / Good
  ≥65 / Possible ≥50 / Weak <50), and plain-English reasons; strategy derived from the
  questionnaire and frequent meaningful CV terms (`strategy.ts`).
- Optional Gemini re-rank (`ai.ts`): enabled solely by setting `GEMINI_API_KEY`; tunable
  via `GEMINI_MODEL` (default `gemini-2.5-flash`), `GEMINI_REVIEW_MAX_JOBS` (default 25),
  `GEMINI_REVIEW_MIN_SCORE` (default 70).
- Per-user job dedupe via a `fingerprint` hash of title|company|location.
- Rate limiting scoped by IP and user (Upstash Redis).
- CSV export with formula/CSV-injection escaping.
- Persistence: Postgres via Prisma, three tables (User, Profile, Job).

Constraints:

- Requires the user's own Apify key to scrape anything; there is no shared scraping key.
- The Gemini stage is optional and cost/latency scale with `GEMINI_REVIEW_MAX_JOBS`
  (one call per reviewed job).
- Coverage is bounded by the configured Apify Actors (LinkedIn worldwide, JobStreet
  MY/SG); other boards/regions require code changes.

Terminology to preserve: **Strategy** (derived scoring config), **tier**, **fingerprint**
(dedupe key), **aiScore** / **aiSummary** (Gemini outputs).

## Brand Commitments

The name **"Job Matcher"** is a working placeholder, open to renaming/rebranding.
Voice is plain, practical, and jargon-free — it explains scores in plain English and
avoids hype. No committed logo or identity assets exist yet; the files in `public/`
are default Next.js/Vercel placeholder SVGs, not brand assets.

## Evidence on Hand

- A working, documented application: `README.md` and `docs/` (USER_GUIDE, ARCHITECTURE,
  API, DEPLOYMENT, CONTRIBUTING, OPEN_QUESTIONS, handover notes).
- A two-stage AI funnel token-savings measurement exists in the history (commit
  `b81bbcc`).
- An untracked `CASE_STUDY.md` (portfolio framing).
- No real testimonials, named customers, benchmarks, pricing, licensing, or press
  exist — future work must not fabricate any of these.

## Product Principles

1. **Deterministic first, AI second.** The cheap keyword scorer is the gate; paid AI
   reads only the roles that clear it. AI enhances the ranking, it never gates access
   to the product.
2. **Never broken by AI.** A missing key or a per-job AI failure always degrades to the
   keyword score. A search must never fail because the AI stage is absent or errored.
3. **Bring-your-own-key, secrets encrypted.** Each user's scraping runs on their own
   Apify account; the key is encrypted at rest and decrypted only when a search runs.
4. **Explainable matches.** Every score carries plain-English reasons; a user should be
   able to see why a job ranked where it did.
5. **Security by default.** Password hashing, constant-time login, anti-enumeration,
   encrypted secrets, rate limiting, and injection-safe export are baseline behavior,
   not later add-ons.
