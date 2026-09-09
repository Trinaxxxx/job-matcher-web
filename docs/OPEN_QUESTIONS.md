# Open questions & decisions to make

Things the documentation can't answer from the code alone — decisions that shape
where the app goes next. Written for a small multi-user product heading toward
production. Resolve these, then fold the answers into the relevant doc and delete
the item.

## Decided (to build)

- **Access model: guest demo + invite-only accounts.** Anyone can view a read-only
  demo (pre-seeded sample profile + results) to see how scoring/tiers/reasons look;
  every write action (CV upload, save key, run search) prompts sign-up. Creating an
  account requires an **invite code**. Guests can't run real searches (that needs
  the user's own Apify key), so guest mode is a demo, not a trial. — _not built yet_
- **Geographic scope: worldwide, APAC-heavy.** LinkedIn stays the worldwide
  baseline. Broaden APAC coverage by expanding the JobStreet trigger to its other
  markets (PH, ID, TH, VN) and adding one or two more APAC boards in
  `src/lib/apify.ts` (same `RawJob` shape → no scoring changes). — _not built yet_
- **Database: adopt Prisma migrations.** Move off `prisma db push` to versioned
  migrations. See [DEPLOYMENT.md → Database schema changes](DEPLOYMENT.md#database-schema-changes)
  for the baseline procedure. — _not built yet_
- **Gemini re-rank: built.** `geminiRescore` in `src/lib/ai.ts` deep-reads the top
  keyword-scored JDs against the CV + questionnaire and records an `aiScore` (0–100,
  85+ = strong fit) and a per-job `aiSummary`. Off unless `GEMINI_API_KEY` is set.
  See [README → How matching works](../README.md#how-matching-works). _Remaining tuning
  question: what `GEMINI_REVIEW_MIN_SCORE` / `GEMINI_REVIEW_MAX_JOBS` values give the
  best cost/quality trade-off in real use?_

## Product / direction

- [ ] **Free-form vs guided questionnaire.** Answers are free text today. Would
      dropdowns/tags (esp. seniority, currency) reduce bad input and improve
      scoring?

## Accounts & data

- [ ] **Email verification.** Not implemented. The signup anti-enumeration note in
      the code says the residual signal can only be fully closed with verification.
      Needed before a truly public launch?
- [ ] **Password reset.** There is no "forgot password" flow. Required before real
      users rely on the app.
- [ ] **Account deletion / data export.** Users can't delete their account or export
      their data from the UI. If this serves real users, a delete path (and the
      privacy expectation behind it) should be a first-class feature.
- [ ] **Data retention.** Do scraped jobs accumulate forever? Consider pruning old
      `Job` rows per user.

## Operations

- [ ] **Rate-limit tiers.** The `auth`, `general`, and `search` limits exist but
      their exact thresholds should be reviewed against expected real usage.
- [ ] **Error surfacing.** Apify Actor failures throw inside `/api/search`. Confirm
      users see a helpful message (not a raw error) and that failures are logged.
- [ ] **Monitoring.** No error tracking (e.g. Sentry) or uptime monitoring is wired
      up. Add before production if uptime matters.

## Feature backlog (already stubbed / hinted in code)

- [ ] **Notion / Google Sheets push.** The export route comments mention Notion push
      "can be added later." Still wanted, or is CSV enough?
- [ ] **More job sources.** Add boards in `src/lib/apify.ts` per the scope decision
      above.

## Testing & quality

- [ ] **Route/integration tests.** Unit tests cover `lib`; there are no tests for
      the API routes themselves. Worth adding for auth and search happy/sad paths.
- [ ] **Accessibility & responsive pass.** No documented a11y or mobile-layout
      review of the pages yet.
