# Spec: Background queue for search

Status: Draft · Owner: Trina · Date: 2026-11-16

## 1. Why

Today `POST /api/search` ([src/app/api/search/route.ts](../src/app/api/search/route.ts)) does
everything inline inside one request: scrape (Apify, up to two actor runs) → keyword
score + de-dupe → optional radius geocoding per job → Gemini deep-read → upsert each job →
return funnel stats. The route sets `maxDuration = 300`, and the UI
([RunSearch.tsx](../src/components/RunSearch.tsx)) holds a single `fetch` open for the whole
run showing "Finding matches… this may take a moment".

Problems this causes:

- **Timeout cliff.** One scrape + a batch of Gemini calls + N geocodes can brush the 300s
  function limit. When it trips, the user gets a dead request and a half-written result set
  (jobs upsert one at a time, so a mid-run death leaves a partial batch and no stats).
- **No retries.** A transient Apify 502 or Gemini rate-limit kills the entire search; the
  user just sees "Scraping failed, try again."
- **Blocking UX.** The tab is pinned to an open connection for 1–2 minutes with no progress.
- **Can't schedule.** Recurring/saved searches are impossible while the only trigger is a
  human holding a request open.

Moving the pipeline behind a durable queue removes the timeout risk, adds automatic
step-level retries, frees the UI to poll, and gives us a single code path that a future
scheduled job can call. This is the unlock for saved/scheduled searches later.

## 2. Goals / non-goals

**Goals**
- `POST /api/search` returns in <1s with a `runId`; work happens in a background worker.
- Each pipeline stage retries independently without redoing the whole search.
- UI polls run status and shows real progress (scraping → scoring → reviewing → done).
- One reusable `runSearchPipeline()` callable from both the queue worker and (later) a cron.
- No change to scoring logic, AI logic, dedupe, radius handling, or the funnel stats shape.

**Non-goals (this spec)**
- Building saved searches or scheduling. We only make them *possible*.
- Provider-agnostic AI, score-breakdown UI, structured CV parsing (separate specs).
- Changing the Apify BYO-key or budget model.

## 3. Queue choice

Recommendation: **Inngest**. Secondary option kept open: **Vercel Workflow**.

| | Inngest (recommended) | Vercel Workflow / Queues |
|---|---|---|
| Maturity | GA, widely used | Workflow + Queues still beta |
| Model | `step.run()` durable steps, built-in retries, concurrency/throttle keys | Durable steps (Workflow) on Fluid Compute |
| Local dev | `npx inngest-cli dev` — full local dashboard, replay | Runs on Fluid Compute; thinner local story today |
| Lock-in | Portable, works on any host | Vercel-native |
| Setup cost | One route handler + SDK | Native, but beta surface |

Why Inngest first: the pipeline is naturally a sequence of retriable steps with a
**per-user concurrency limit** (don't let one account run three scrapes at once) and
**throttling** — Inngest expresses both declaratively, has a mature local dev loop, and
isn't a beta API. We're on Vercel, so Vercel Workflow is a legitimate native alternative;
if you'd rather stay on-platform, the architecture below is identical — only the
trigger/worker glue in §6 changes. **Decision needed before build** (see §12).

Everything downstream of §3 is queue-agnostic.

## 4. Data model

Add a `SearchRun` to track each background run. This replaces "the HTTP response is the
result" with a durable record the UI polls and a future cron can inspect.

```prisma
model SearchRun {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  status    String   @default("queued") // queued | scraping | scoring | reviewing | done | failed
  // Inputs captured at enqueue time, so the worker is self-contained and a run is replayable.
  params    Json                         // { postedWithinHours, ... } the snapshot of what was asked

  // Funnel stats — same shape the route returns today, filled as stages complete.
  scraped     Int?
  kept        Int?
  outsideRadius Int?
  gated       Int?
  aiReviewed  Int?
  strongFit   Int?
  aiTokens    Int?
  saved       Int?

  error     String?  @db.Text          // user-facing message when status = failed
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([userId, createdAt])
}
```

Add `searchRuns SearchRun[]` to `User`. No change to `Job`.

(Optional, deferred) a `trigger` field — `"manual" | "scheduled"` — so later scheduling is a
one-line addition. Mentioned, not required now.

## 5. Pipeline extraction

Pull the orchestration out of the route into `src/lib/pipeline.ts`:

```ts
export interface SearchParams { postedWithinHours: number; }
export interface SearchStats { scraped: number; kept: number; outsideRadius: number;
  gated: number; aiReviewed: number; strongFit: number; aiTokens: number; saved: number; }

// Pure orchestration. Takes userId + params, does scrape→score→rescore→persist,
// reports progress via the callback, returns the funnel stats.
export async function runSearchPipeline(
  userId: string,
  params: SearchParams,
  onProgress?: (status: string, partial?: Partial<SearchStats>) => Promise<void>,
): Promise<SearchStats>;
```

It does exactly what route.ts lines 52–249 do today, unchanged, split so each queue step
maps to a stage:

1. **load** — user key, profile, strategy, decrypt token, build query, geocode center/place.
2. **scrape** — `scrapeJobs(...)` then `recordApifySearch(userId)`.
3. **score** — keyword score + dedupe + radius (`checkRadius`).
4. **review** — `geminiRescore(...)` (or keyword-only short-circuit).
5. **persist** — upsert jobs, compute funnel stats.

Steps call `onProgress("scraping")`, `onProgress("reviewing", { gated })`, etc., which the
worker writes to the `SearchRun` row. The validation/early-return cases (no Apify key, no
profile, bad postcode) move to **enqueue time** (§6) so they still return a clean 400
synchronously rather than failing a background run.

This module is directly unit-testable (mock `scrapeJobs`/`geminiRescore`) — today that logic
is untestable because it's welded to a route handler.

## 6. API changes

### `POST /api/search` — now an enqueue

Keeps all the cheap, synchronous guards so bad requests still fail fast with the same
messages:

1. Auth (`getUserId`).
2. Rate limits (`searchIp`, `search`) — unchanged.
3. `apifyBudgetAvailable(userId)` — unchanged (checked here, *not* in the worker, so a
   budgeted-out user is told immediately).
4. Validate: has Apify key, has strategy, postcode sanity. (These move out of the pipeline.)
5. Create `SearchRun { status: "queued", params }`.
6. Send the queue event (`inngest.send({ name: "search/requested", data: { runId, userId } })`).
7. Return `{ runId }` with 202.

Note: the Apify daily budget is currently recorded *after* a successful scrape (route.ts:144).
That stays — `recordApifySearch` runs in the worker's scrape step, so a failed scrape still
isn't charged. The *availability check* stays at enqueue so the user gets instant feedback.

### `GET /api/search/[runId]` — status (new)

Returns the `SearchRun` row (scoped to `userId`). The UI polls this. Shape mirrors today's
response plus `status`/`error`, so the frontend's success/error handling barely changes.

### `/api/inngest` (new) — the worker

Standard Inngest serve route. One function `search/requested`:

- `concurrency: { key: "event.data.userId", limit: 1 }` — serialize a user's runs.
- `retries: 3` — step-level; a failed scrape retries just the scrape.
- Loads the `SearchRun`, calls `runSearchPipeline(userId, params, onProgress)`.
- On success: `status = "done"` + stats. On terminal failure: `status = "failed"` + message.
- `maxDuration` can rise (Vercel default is now 300s; Fluid Compute + step retries mean no
  single step needs to be long).

## 7. Frontend changes

`RunSearch.tsx` changes from "await one response" to "enqueue then poll":

1. `POST /api/search` → get `runId`.
2. Poll `GET /api/search/[runId]` every ~2s.
3. Map `status` to progress copy: queued → "Queued…", scraping → "Searching job boards…",
   reviewing → "Reading matches against your CV…", done → the existing
   `Found N new matches` message (built from the same stat fields), failed → `error`.
4. `router.refresh()` on `done`.

Polling (not websockets) keeps it simple and serverless-friendly. Stop polling after a
sensible ceiling (e.g. 5 min) and show "still running — check back on Results".

## 8. Cross-cutting concerns

- **Idempotency.** Use `runId` as the Inngest event idempotency key so a double-send
  doesn't double-scrape (and double-charge Apify). Job upserts are already idempotent by
  `userId_fingerprint`.
- **Concurrency.** Per-user limit 1 (above) replaces the implicit "one request at a time"
  the blocking UI gave us for free.
- **Partial failure.** Because persist is the last step and upserts are idempotent, a retry
  re-runs safely. A run that dies after scrape but before persist shows `failed`; the Apify
  charge already recorded is correct (the scrape did happen).
- **Orphaned runs.** A run stuck in a non-terminal status past a TTL should be swept to
  `failed` (cron or a lazy check in the GET handler). Minor; note for build.
- **Budget race.** Unchanged from today — the availability check can overshoot by ~one
  batch under concurrency, which §3 budget comments already accept.

## 9. Rollout plan

Phase-gated so each step ships independently:

1. **Extract pipeline** — `src/lib/pipeline.ts`, route.ts calls it synchronously. No
   behavior change, now unit-tested. *Ship + verify alone.*
2. **Add `SearchRun`** — migration + model. Route still synchronous but writes a run row
   and its stats. Gives us the status surface with no queue yet.
3. **Add queue** — Inngest route + function, flip `POST` to enqueue, add `GET [runId]`.
4. **Frontend polling** — switch `RunSearch` to enqueue+poll.
5. **(Later, separate)** scheduled/saved searches reuse `runSearchPipeline`.

A feature flag (`SEARCH_ASYNC`) can gate phases 3–4 so you can fall back to synchronous.

## 10. Testing

- Unit: `runSearchPipeline` with mocked `scrapeJobs`/`geminiRescore`/`prisma` — assert stats
  and that `recordApifySearch` fires only after a successful scrape.
- Unit: enqueue guards (no key, no strategy, bad postcode, budgeted-out) return the right
  status codes without creating a run.
- Integration: Inngest local dev — trigger an event, assert the `SearchRun` transitions
  queued → … → done and jobs land.
- Retry: force a scrape throw, assert step retries and the Apify budget isn't charged twice.

## 11. New env / deps

- Dep: `inngest` (+ `inngest-cli` for local dev) — or nothing new if Vercel Workflow.
- Env: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (prod). Local dev needs neither.

## 12a. Prototype status (2026-11-16)

A working prototype of phases 1–4 is in the tree (Inngest chosen):

- `src/lib/pipeline.ts` — extracted `runSearchPipeline()` + `precheckSearch()` + `SearchError`.
- `prisma/schema.prisma` — `SearchRun` model + `User.searchRuns`. **Run `npm run db:push`
  to create the table** (not yet applied — needs your Neon `DATABASE_URL`).
- `src/lib/inngest.ts` — Inngest client + `searchWorker` (per-user concurrency 1, retries 1,
  idempotent on `runId`).
- `src/app/api/inngest/route.ts` — Inngest serve endpoint.
- `src/app/api/search/route.ts` — now validates + enqueues, returns `{ runId }` (202).
- `src/app/api/search/[runId]/route.ts` — status polling endpoint.
- `src/components/RunSearch.tsx` — enqueue + poll with per-stage progress copy.

Verified: `tsc --noEmit` clean, `eslint` clean, `vitest` 291/291 pass. **Not yet run
end-to-end** — that needs `npm run db:push`, then two terminals: `npm run dev` and
`npx inngest-cli dev -u http://localhost:3000/api/inngest`, plus a valid Apify key.

Known prototype shortcuts (follow-ups):
- The pipeline runs as one unit, so a worker retry re-runs the scrape (re-charges Apify).
  Decompose into `step.run()` stages for granular retry.
- No orphaned-run sweeper yet (§8).
- `inngest` install added 7 npm advisories (5 moderate, 2 high) — audit before shipping,
  since the recent commits had cleared the tree.

## 12. Open questions

1. **Inngest vs Vercel Workflow** — decide before phase 3. Recommendation: Inngest.
2. Do we keep a synchronous fallback behind `SEARCH_ASYNC`, or cut over fully?
3. Retain `SearchRun` history (useful for the funnel dashboard idea) or prune after N days?
4. Should enqueue also debounce — reject a new run while one is already `queued`/running
   for the user (vs. the concurrency=1 queueing behavior)?
```
