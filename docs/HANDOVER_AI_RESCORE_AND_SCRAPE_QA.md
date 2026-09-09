# Handover — Gemini re-rank test + scrape/results QA

_Date: 2026-09-09 · Branch: `security/harden-abcH`_

Covers two things: (1) a review of the new `src/lib/ai.test.ts` and what it does/doesn't
cover, and (2) root-cause analysis of the three defects seen while running a real scrape in
the web app (results ignoring the profile/filter, missing job titles, non-clickable links).

---

## Part 1 — Test review: `src/lib/ai.test.ts`

### Status
`npm test` (vitest 2.1.9) → **3/3 passing.** Runs in the no-key path only.

### What it covers
| Test | Asserts | Path exercised |
|---|---|---|
| `aiEnabled reflects … GEMINI_API_KEY` | `aiEnabled()` is false without the key, true with it | env gate |
| `is a no-op … when no key is set` | same array reference returned; `aiScored`/`aiScore` unset | early return (line 70) |
| `never mutates the keyword score/tier fields` | `score`/`tier` unchanged | early return (line 70) |

The tests correctly `delete`/restore `process.env.GEMINI_API_KEY` around each case, so they
don't leak state.

### Coverage gaps (the important part)
**Every test runs the `!aiEnabled()` early-return branch. The entire Gemini path is
untested.** Nothing exercises `geminiRescore` with a key set, because that would call
`@ai-sdk/google` for real and there is no mock. Untested logic:

- **Candidate selection** — `score >= REVIEW_MIN_SCORE` (70), non-empty description,
  sort desc, `slice(0, REVIEW_MAX_JOBS)` (25). None verified.
- **Merge** — that `aiScore`/`aiSummary`/`aiScored=true` land on the right jobs, and that
  jobs *not* sent to Gemini are returned untouched.
- **Graceful degradation** — the `try/catch` (ai.ts:109) that keeps the keyword score when a
  single `generateObject` call throws. This is the resilience guarantee and it has no test.
- **`strategyDigest`** — string assembly, including the optional fields.
- Test 3's name ("never mutates the keyword score/tier fields") implies a *general*
  guarantee, but it only proves it for the no-key path. The enabled path also must not
  overwrite `score`/`tier` — currently unproven.

### Recommended next tests (mock the model)
Mock `ai`'s `generateObject` (e.g. `vi.mock("ai", …)`) and set a fake key, then assert:
1. only jobs with `score >= 70` and a description are sent (spy on call count/args);
2. at most `REVIEW_MAX_JOBS` calls;
3. `aiScore`/`aiSummary`/`aiScored` merged onto the correct jobs; others unchanged;
4. a thrown call leaves that job's keyword `score`/`tier` intact and `aiScored` falsy;
5. `score`/`tier` are never mutated in the enabled path.

---

## Part 2 — Defects observed in a live scrape

Three issues reported from using the app. Two share one root cause; the third is partly
by-design + partly missing enforcement.

### A. Missing job titles  &  B. Links not clickable  → **same root cause**

**Symptom:** listings show no title (or "(untitled)") and the role text is plain text, not a
link to the ad.

**These are data problems, not rendering problems.** The rendering is correct:
- `ResultsTable.tsx:105–107` renders `<a href={j.url}>` **only when `j.url` is present**;
  otherwise it falls back to plain text. No URL → no link.
- `search/route.ts:86` saves `title: job.title ?? "(untitled)"`. No title → "(untitled)".

So both fields are arriving **undefined from the scraper**. The cause is in the field
mapping in [`src/lib/apify.ts`](../src/lib/apify.ts):

```ts
// mapLinkedIn
title: item.title || item.jobTitle,
url:   item.jobUrl || item.link || item.url,
```

These are **guesses** at the actor's output schema (the stacked `||` fallbacks are the tell
that the author wasn't sure). The configured actor is `worldunboxer/rapid-linkedin-scraper`.
If it returns the title under, say, `positionName`/`jobPosition`/`name`, or the URL under
`jobPostingUrl`/`applyUrl`/`jobLink`, then `title` and `url` map to `undefined` and you get
exactly the two symptoms seen — together, which matches the report.

**Fix (needs one real actor run to confirm field names):**
1. Run the actor once and inspect a dataset item — via the Apify console, or
   `GET https://api.apify.com/v2/datasets/{datasetId}/items` after a run, or the actor README.
2. Update `mapLinkedIn` / `mapJobStreet` to the actual keys.
3. Consider dropping items with no resolvable `url` (an ad with no link isn't actionable),
   rather than saving them link-less.

> Confidence: **high** that this is a mapping mismatch — the downstream code handles `title`
> and `url` correctly when they exist. The exact correct keys must be verified against a real
> run; I could not run the actor here (no Apify key / network to Apify).

### C. Results don't comply with the profile / filter

**This is expected behaviour of the current design, not a single bug** — the keyword scorer
is a **ranker, not a filter**. Contributing factors, in priority order:

1. **No score floor before save/display.** `scoreJob` (scoring.ts) starts every job at
   **50** and only *hard-excludes* on: dealbreaker keyword in title, an excluded location, or
   entry-level-vs-desired-seniority. Everything else is a ±score nudge. `search/route.ts:62–69`
   then saves **every non-excluded job**, and `jobs/route.ts` returns them all (ordered, not
   filtered). So loosely-related roles (~42–50) still show up → reads as "ignores my filter."
2. **Location isn't enforced post-scrape.** Preferred location only adds `+8`
   (scoring.ts:118); it never drops an off-location job (only `excludeLocations` does). And
   `search/route.ts:46` builds the actor query as `strategy.locations.join(" ")` — a
   space-joined string — with no verification that returned jobs match.
3. **Query semantics unverified.** `keywords = titleKeywords.slice(0,6).join(" OR ")` is
   passed as `job_title` to the LinkedIn actor. If that actor doesn't parse boolean `OR`, it
   may match loosely or literally, pulling in unrelated roles.
4. **If `GEMINI_API_KEY` is unset there is no semantic filter at all** — you're seeing raw
   keyword ranking with no minimum bar.

**Fix options (product decision):**
- Add a **minimum keep-score** before upsert (e.g. drop `score < 50`), or a UI default that
  hides "Weak"/"Possible" tiers — cheapest, biggest perceived win.
- **Enforce preferred location** post-scrape (drop jobs whose `location`/description don't
  match any `strategy.locations`) unless `remoteOk`.
- Verify the actor's `job_title`/query semantics and adjust how the query is built.
- Longer term, the Gemini pass is the real relevance filter — but it only *annotates* today
  (`aiScore`), it doesn't drop anything, and it only runs on `score >= 70` candidates.

---

## Cross-cutting things to verify

- **AI SDK versions:** `package.json` pins `@ai-sdk/google@^4.0.65` with `ai@^7.0.94`. Confirm
  `generateObject`/`createGoogleGenerativeAI` are API-compatible across that pairing. If the
  enabled path throws at runtime, the `catch` in ai.ts silently swallows it and **every job
  falls back to keyword-only** — which would look like "AI never ran" with no error surfaced.
- **Error visibility:** scraper mapping failures and AI failures both degrade silently
  (empty fields / console.error). Consider surfacing "N jobs had no link" style diagnostics in
  the `/api/search` response (it already returns `scraped`/`kept`/`saved`).

## Suggested order of work
1. Fix the actor field mapping (A/B) — confirm keys from one real run. _Biggest, most concrete win._
2. Add a keep-score floor and/or location enforcement (C).
3. Add mocked-model tests for the Gemini enabled path (Part 1 gaps).
4. Verify AI SDK version compatibility.

## Key files
- [`src/lib/ai.ts`](../src/lib/ai.ts) · [`src/lib/ai.test.ts`](../src/lib/ai.test.ts)
- [`src/lib/apify.ts`](../src/lib/apify.ts) — field mapping (root cause of A/B)
- [`src/lib/scoring.ts`](../src/lib/scoring.ts) — ranker, not filter (C)
- [`src/app/api/search/route.ts`](../src/app/api/search/route.ts) — no score floor; query build
- [`src/components/ResultsTable.tsx`](../src/components/ResultsTable.tsx) — rendering (correct)
- [`src/app/api/jobs/route.ts`](../src/app/api/jobs/route.ts) — returns all jobs, ordered
