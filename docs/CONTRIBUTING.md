# Contributing / developer guide

A guide for anyone working on the code (including future me).

## Getting started

See the [README](../README.md) for local setup. In short:

```bash
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY
npm install
npm run db:push              # create tables
npm run dev                  # http://localhost:3000
```

Rate limiting (Upstash) can be left blank locally — it simply turns off.

## Project layout

```
src/
  app/
    page.tsx, layout.tsx, globals.css   # landing + shared shell
    login|signup|profile|dashboard|results/page.tsx   # screens
    api/*/route.ts                      # backend endpoints
  components/                           # reusable UI
  lib/                                  # business logic + tests (*.test.ts)
prisma/schema.prisma                    # database schema
docs/                                   # this documentation
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for what each `lib` module does and how a
request flows through the system.

## Conventions

- **Keep logic in `src/lib`, not in routes.** Route handlers should authenticate,
  rate-limit, validate, delegate to `lib`, and respond. This keeps the core
  behavior unit-testable. When you add a feature, put the real work in a `lib`
  module with a test beside it.
- **Every route follows the same shape:** `getUserId()` → `checkRateLimit()` →
  `zod` validation → work → JSON response. Match the existing routes.
- **Validate all input with `zod`.** Cap free-text lengths and strip unknown keys
  (see `AnswersSchema` in `strategy.ts`) so nothing unbounded reaches the DB.
- **Never log or return secrets.** The Apify key is encrypted at rest and only
  decrypted at search time; `GET /api/profile` returns booleans (`hasApifyKey`),
  not the value.
- **Scope every query by `userId`.** Reads filter by it; writes use
  `updateMany({ where: { id, userId } })` so a user can only touch their own rows.
- **TypeScript + Tailwind.** Follow the types already in `lib`; keep styling in
  Tailwind classes consistent with existing components.

## Testing

Unit tests use [Vitest](https://vitest.dev) and sit next to the code
(`src/lib/*.test.ts` — currently `auth`, `csv`, `cv`, `ratelimit`, `strategy`).

```bash
npm test          # run once
npx vitest        # watch mode
```

Add a test whenever you touch scoring, strategy building, parsing, auth, or the
CSV/rate-limit helpers — these are the parts most likely to break silently.

## Linting & build

```bash
npm run lint      # eslint (eslint-config-next)
npm run build     # prisma generate + next build — run before deploying
```

## Adding things

- **A job source:** add a mapper + Actor call in `src/lib/apify.ts` and include it
  in `scrapeJobs()`. Keep the output in the shared `RawJob` shape so scoring works
  unchanged.
- **A scoring signal:** adjust `scoreJob()` in `src/lib/scoring.ts` and update its
  reasons text. Update the scoring section in [ARCHITECTURE.md](ARCHITECTURE.md).
- **A questionnaire field:** update `Answers`, `AnswersSchema`, and `buildStrategy`
  in `src/lib/strategy.ts` (keep them in sync), the profile UI, and the
  [user guide](USER_GUIDE.md).
- **An endpoint:** create `src/app/api/<name>/route.ts` following the standard
  shape, then document it in [API.md](API.md).

## The Next.js note

This project pins a specific Next.js version and the repo's `AGENTS.md` warns that
its App Router conventions may differ from older knowledge. When in doubt, check the
bundled docs under `node_modules/next/dist/docs/` before writing route/rendering
code.

## Documentation

Update the relevant `docs/` file in the same change as the code. Docs that drift
from the code are worse than no docs. Open items and decisions still to make live in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).
