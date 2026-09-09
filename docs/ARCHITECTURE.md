# Architecture

## The big picture

```
Browser (React pages)  ──HTTP──▶  Next.js API routes  ──▶  Prisma  ──▶  Postgres
  src/app/*/page.tsx               src/app/api/*/route.ts       src/lib/db.ts
  src/components/*                  src/lib/* (business logic)         │
                                            │                         │
                                            ▼                         │
                                   Apify (job scraping) ◀── user's own API key
                                   Upstash Redis (rate limiting)
                                   Gemini (optional re-rank)
```

This is a standard Next.js **App Router** application: the same project serves both
the UI (React Server/Client Components) and the backend (API route handlers). There
is no separate backend service — Next.js runs both, and on Vercel each API route
becomes a serverless function.

## Layers

### Pages — `src/app/*/page.tsx`
The screens a user sees. Each folder is a route:

| Route | File | Purpose |
|---|---|---|
| `/` | `page.tsx` | Landing page. |
| `/login` | `login/page.tsx` | Log in. |
| `/signup` | `signup/page.tsx` | Create an account. |
| `/profile` | `profile/page.tsx` | Upload CV, answer the questionnaire, save Apify key. |
| `/dashboard` | `dashboard/page.tsx` | Kick off a job search. |
| `/results` | `results/page.tsx` | Ranked matches, status tracking, export. |

`layout.tsx` wraps every page (shared nav, fonts, global styles in `globals.css`).

### Components — `src/components`
Reusable UI, kept out of the page files: `AuthForm`, `ProfileForm`, `ResultsTable`,
`RunSearch`, `Nav`, `LogoutButton`.

### API routes — `src/app/api/*/route.ts`
The backend. Every handler follows the same shape:

1. **Authenticate** — `getUserId()` reads the session cookie; no session → `401`.
2. **Rate-limit** — `checkRateLimit()` guards abuse; over limit → `429`.
3. **Validate** — `zod` parses the body/query; bad input → `400`.
4. **Do the work** — call into `src/lib`, read/write via Prisma.
5. **Respond** — JSON (or CSV for export).

See the [API reference](API.md) for each endpoint.

### Business logic — `src/lib`
Deliberately separated from the routes so it can be unit-tested without HTTP:

| Module | Responsibility |
|---|---|
| `auth.ts` | Sessions (signed JWT via `jose`), password hashing (`bcryptjs`), constant-time verify, email normalization. |
| `crypto.ts` | AES-256-GCM encrypt/decrypt of the user's Apify key at rest. |
| `cv.ts` | Extract plain text from an uploaded PDF / DOCX / TXT (`unpdf`, `mammoth`). |
| `strategy.ts` | Turn CV text + questionnaire answers into a deterministic scoring `Strategy`. Also holds the `zod` schemas for the questionnaire. |
| `scoring.ts` | Score one job against a `Strategy` → 0–100, a tier, and plain-English reasons. |
| `apify.ts` | Run the job-scraper Actors with the user's token and normalize results. |
| `ai.ts` | Optional Gemini deep-read pass (`geminiRescore`): sends the top keyword-scored JDs + CV + questionnaire to Gemini for a semantic `aiScore` + `aiSummary`. No-op unless `GEMINI_API_KEY` is set. |
| `csv.ts` | Escape CSV cells (guards against CSV/formula injection). |
| `ratelimit.ts` | IP- and user-scoped rate limiting (Upstash Redis). |
| `db.ts` | The shared Prisma client (one instance, reused across requests). |

## How a job search flows end to end

1. User completes their **profile**: uploads a CV (`POST /api/cv`) and saves the
   questionnaire + Apify key (`POST /api/profile`). Both rebuild the `strategy`.
2. User clicks **Run search** → `POST /api/search`.
3. The route decrypts the user's Apify key and calls `scrapeJobs()` (`apify.ts`),
   which runs the LinkedIn and (for MY/SG) JobStreet Actors — last 7 days.
4. Each scraped job is scored by `scoreJob()` (`scoring.ts`) and deduped per user
   by a `fingerprint` hash of title|company|location.
5. If `GEMINI_API_KEY` is set, `geminiRescore()` (`ai.ts`) sends the top
   keyword-scored JDs (plus the CV + questionnaire) to Gemini, which returns an
   `aiScore` (0–100) and `aiSummary` per reviewed job. Skipped otherwise.
6. Results are upserted into the `Job` table.
7. `GET /api/jobs` / the results page show them ranked — AI-reviewed jobs by
   `aiScore` first, then the rest by keyword score; `?minAiScore=85` filters to the
   strong-fit set. The user updates `status` (`PATCH /api/jobs`) or exports to CSV.

## The scoring model

Scoring is **deterministic keyword matching** (no AI required) — see `scoring.ts`.
Every job starts at **50** and is adjusted:

- **Hard exclusions** (score → 0): a dealbreaker keyword in the *title*, an
  excluded location, or an entry-level title when the user wants mid+ seniority.
- **Positive signals**: target role in title (+22) or description (+8); must-have
  skills/industries (up to +24); CV-derived related terms (up to +10); preferred
  location (+8); remote available (+4); salary meets floor (+4).
- **Penalties**: no target-role keyword (−8); dealbreaker term in the *description*
  (up to −20); salary below floor (−12).

Final score is clamped to 0–100 and mapped to a tier:

| Score | Tier |
|---|---|
| ≥ 80 | Strong match |
| ≥ 65 | Good match |
| ≥ 50 | Possible |
| < 50 | Weak |

The `Strategy` itself is built in `strategy.ts`: explicit questionnaire answers
become title/must-have/exclude keywords; frequent meaningful terms in the CV become
"nice-to-have" keywords.

## Data model

Three tables — see [`prisma/schema.prisma`](../prisma/schema.prisma).

### User
| Field | Notes |
|---|---|
| `id` | cuid, primary key |
| `email` | unique |
| `passwordHash` | bcrypt |
| `apifyKeyEnc` | user's Apify key, AES-256-GCM encrypted, nullable |
| `createdAt` | |

Has one `Profile` and many `Job`s.

### Profile (one per user)
| Field | Notes |
|---|---|
| `userId` | unique FK → User, cascade delete |
| `cvText`, `cvFileName` | parsed CV text + original filename |
| `answers` | questionnaire answers (JSON) |
| `strategy` | derived scoring strategy (JSON) |
| `createdAt`, `updatedAt` | |

### Job (owned by one user)
| Field | Notes |
|---|---|
| `userId` | FK → User, cascade delete |
| `fingerprint` | dedupe key = hash(title\|company\|location) |
| `title`, `company`, `location`, `salary`, `url`, `source`, `description`, `postedDate` | scraped fields |
| `score` | 0–100 |
| `tier` | e.g. "Strong match" |
| `reasons` | JSON string[] explaining the score |
| `aiScored` | whether the optional Gemini pass reviewed this job |
| `aiScore` | 0–100 semantic fit from Gemini (CV + questionnaire + JD); null if not reviewed |
| `aiSummary` | one-paragraph "why this fits you" from Gemini; null if not reviewed |
| `status` | New / Interested / Applied / Rejected |

Constraints: `@@unique([userId, fingerprint])` (no duplicate jobs per user),
`@@index([userId, score])` (fast ranked reads).

## Notable design decisions

- **Bring-your-own Apify key.** Each user supplies their own scraping key; the app
  never uses a shared key. The key is encrypted at rest and only decrypted at
  search time. This keeps scraping cost and rate limits per-user.
- **Deterministic scoring first, AI as a second stage.** The keyword scorer works
  fully on its own and acts as the cheap gate: only the top keyword-scored roles are
  sent to Gemini for a paid semantic read, bounding cost/latency. A missing key,
  or a Gemini error on any single job, degrades to the keyword score — the app is
  never broken by the AI being absent or failing.
- **Logic out of routes.** Everything in `src/lib` is plain functions, so the core
  behavior is unit-testable without spinning up HTTP or a database.
- **Security by default.** Password hashing, constant-time login, signup
  anti-enumeration, encrypted secrets, rate limiting, and CSV-injection escaping
  are all in place — see the commit history and [DEPLOYMENT.md](DEPLOYMENT.md).
