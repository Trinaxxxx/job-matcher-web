import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Strategy } from "./strategy";
import type { RawJob, ScoreResult } from "./scoring";
import { geminiBudgetAvailable, recordGeminiSpend } from "./budget";

// ---------------------------------------------------------------------------
// AI MATCHING PASS — the semantic re-read that keyword scoring can't do.
//
// Two-stage funnel (see /api/search):
//   1. scoreJob() keyword-scores every scraped job cheaply and drops exclusions.
//   2. geminiRescore() sends ONLY the top keyword-scored roles' JDs to Gemini,
//      which reads each JD against the CV + questionnaire and returns a 0..100
//      fit score plus a one-paragraph summary. The keyword pass is the cheap
//      gate that decides who is worth the (paid) Gemini read.
//
// If GEMINI_API_KEY is not set, this is a no-op and the app runs on keyword
// scoring alone — nothing else has to change.
// ---------------------------------------------------------------------------

// How many of the top keyword-scored jobs to send to Gemini, and the minimum
// keyword score a job needs before it is worth a (paid) deep read. Tunable via
// env without a redeploy of logic.
const REVIEW_MAX_JOBS = Number(process.env.GEMINI_REVIEW_MAX_JOBS ?? 25);
const REVIEW_MIN_SCORE = Number(process.env.GEMINI_REVIEW_MIN_SCORE ?? 70);
// When a CV is present the semantic read is far more valuable, and keyword
// scores understate CV-only fits — so lower the gate so those jobs aren't
// starved of the AI pass.
const REVIEW_MIN_SCORE_WITH_CV = Number(process.env.GEMINI_REVIEW_MIN_SCORE_CV ?? 55);
// Default to 3.5 Flash Lite: 3× the free-tier RPM (15 vs 5), and the task —
// reading one JD to emit a score + short summary — is squarely in Lite's lane.
// Override with GEMINI_MODEL to use a heavier model (e.g. "gemini-3.6-flash").
const MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
// Cap JD text sent to the model to keep token cost/latency bounded.
const MAX_JD_CHARS = 6000;
const MAX_CV_CHARS = 8000;

// Collapse the messy whitespace that scraped JDs carry — repeated blank lines,
// tab-indented bullets, trailing spaces — so the model sees the same content in
// fewer tokens (typically 15–25% savings). CV text is already normalised at
// parse time (lib/cv.ts); JDs arrive raw from the scraper so clean them here.
function compactText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "")
    .trim();
}

// Bound how many Gemini requests are in flight at once. The free tier allows only
// ~5 requests/minute, so an unbounded Promise.all fan-out (up to REVIEW_MAX_JOBS
// at once) instantly trips the RPM limit and most calls 429 — the AI pass then
// silently degrades to keyword-only. A small pool paces requests, and 429-aware
// backoff retries the ones that still hit the limit instead of dropping them.
// Raise CONCURRENCY on a paid tier (much higher RPM); keep it low on free tier.
const CONCURRENCY = Math.max(1, Number(process.env.GEMINI_CONCURRENCY ?? 4));
// Extra attempts per job specifically for rate-limit (429 / RESOURCE_EXHAUSTED)
// errors. Other errors are not retried.
const MAX_RETRIES = Math.max(0, Number(process.env.GEMINI_MAX_RETRIES ?? 2));

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  // The AI SDK surfaces provider errors as text; Gemini rate limits read as
  // "429" / "RESOURCE_EXHAUSTED" / quota messages.
  return /429|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(msg);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Run `task` over `items` with at most `limit` in flight. A fixed pool of workers
// pulls from a shared cursor, so requests are paced instead of bursting all at once.
async function mapPool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      await task(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

export function aiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export type ScoredJob = RawJob &
  ScoreResult & {
    aiScored?: boolean;
    aiScore?: number;
    aiSummary?: string;
  };

const FitSchema = z.object({
  // reasoning comes FIRST so the model writes out its analysis before committing
  // to a number — this is a lightweight chain-of-thought that improves scoring
  // accuracy (the model can't anchor on a score then rationalize; it must reason
  // its way to the number). Not stored — only score + summary go to the DB.
  reasoning: z.string().max(1500).describe(
    "Internal step-by-step analysis: list the key CV strengths that match the JD, " +
    "the gaps or mismatches, how the candidate's stated intent/priorities align or conflict, " +
    "and your seniority/location/salary assessment. This drives the score."
  ),
  score: z.number().int().min(0).max(100),
  summary: z.string().max(800),
});

function strategyDigest(s: Strategy): string {
  const parts: string[] = [];
  if (s.titleKeywords.length) parts.push(`Target roles: ${s.titleKeywords.join(", ")}`);
  if (s.mustHaveKeywords.length) parts.push(`Must-have skills/industries: ${s.mustHaveKeywords.join(", ")}`);
  if (s.niceToHaveKeywords.length) parts.push(`Nice-to-have: ${s.niceToHaveKeywords.slice(0, 15).join(", ")}`);
  if (s.excludeKeywords.length) parts.push(`Dealbreakers: ${s.excludeKeywords.join(", ")}`);
  if (s.locations.length) parts.push(`Preferred locations: ${s.locations.join(", ")}`);
  if (s.seniority) parts.push(`Desired seniority: ${s.seniority}`);
  if (s.minSalary) parts.push(`Minimum salary: ${s.minSalary}${s.currency ? " " + s.currency : ""}`);
  if (s.remoteOk) parts.push(`Open to remote.`);
  // Intent block — what the candidate wants next, which the CV alone can't state.
  // This is the strongest signal for judging fit in the ambiguous mid-range.
  const it = s.intent;
  if (it) {
    if (it.careerMove) parts.push(`Career move: ${it.careerMove}.`);
    if (it.careerGoal) parts.push(`What they want next: ${it.careerGoal}`);
    if (it.priorities) parts.push(`What matters most (ranked): ${it.priorities}`);
    if (it.workStyle) parts.push(`Preferred work style: ${it.workStyle}`);
  }
  return parts.join("\n");
}

// Funnel + token accounting for one search, so the two-stage saving is
// measurable rather than assumed. gated = jobs that cleared the keyword gate and
// were sent to the model (deterministic — the true architectural filter, not
// affected by rate limits); reviewed = calls that actually succeeded;
// aiTokens = total tokens Gemini reported across the successful calls.
export type RescoreStats = { gated: number; reviewed: number; aiTokens: number };

/**
 * Re-rank/annotate the top keyword-scored jobs using Gemini's reading of each
 * JD against the CV + questionnaire strategy. Jobs not sent to Gemini are
 * returned unchanged (keyword score only, aiScored = false). Returns the jobs
 * plus funnel/token stats for the caller to log.
 */
export async function geminiRescore(
  jobs: ScoredJob[],
  strategy: Strategy,
  cvText: string
): Promise<{ jobs: ScoredJob[]; stats: RescoreStats }> {
  if (!aiEnabled()) return { jobs, stats: { gated: 0, reviewed: 0, aiTokens: 0 } }; // keyword-only mode

  // Global daily spend cap on the shared Gemini key. If today's budget is used
  // up, fall back to keyword-only for this search (same graceful path as AI-off)
  // rather than adding to the bill.
  if (!(await geminiBudgetAvailable())) {
    console.warn("[ai] daily Gemini budget reached — skipping AI pass (keyword-only for this search).");
    return { jobs, stats: { gated: 0, reviewed: 0, aiTokens: 0 } };
  }

  // Pick the top roles the cheap keyword pass already rates highly — those are
  // the only ones worth a paid deep read. With a CV on file, lower the bar so
  // strong CV-fits the keyword pass underrates still get read.
  const minScore = (cvText || "").trim() ? REVIEW_MIN_SCORE_WITH_CV : REVIEW_MIN_SCORE;
  const hasDesc = (j: ScoredJob) => (j.description ?? "").trim().length > 0;
  const candidates = jobs
    .filter((j) => j.score >= minScore)
    .sort((a, b) => {
      // Primary: keyword relevance (now domain-aware — see scoreJob's domain guard).
      if (b.score !== a.score) return b.score - a.score;
      // Tie-break: prefer jobs that carry JD text (a richer, more reliable read).
      // But description-less postings are NOT excluded — a relevant role must not be
      // starved of the AI pass just because the scraper returned no description
      // (title + company + location still inform the model). This previously
      // silently dropped strong matches whenever the source returned no JD body.
      return Number(hasDesc(b)) - Number(hasDesc(a));
    })
    .slice(0, REVIEW_MAX_JOBS);

  if (!candidates.length) return { jobs, stats: { gated: 0, reviewed: 0, aiTokens: 0 } };

  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = google(MODEL);
  const cv = (cvText || "").slice(0, MAX_CV_CHARS);
  const profile = strategyDigest(strategy);

  let aiTokens = 0;
  let reviewed = 0;
  await mapPool(candidates, CONCURRENCY, async (job) => {
    const descText = compactText(
      (job.description ?? "").slice(0, MAX_JD_CHARS + 2000) // slice generously, then compact shrinks it
    ).slice(0, MAX_JD_CHARS);
    const jd = `${job.title ?? ""}\n${job.company ?? ""} — ${job.location ?? ""}\n\n${
      descText || "(No job description was available; assess fit from the title, company, and location.)"
    }`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { object, usage } = await generateObject({
          model,
          schema: FitSchema,
          system:
            "You assess how well a specific job posting fits a specific candidate. " +
            "Base your judgement ONLY on the candidate's CV, their stated preferences, and the job description provided. " +
            "The candidate's stated intent (their career move, what they want next, ranked priorities, and preferred work style) " +
            "reflects what they WANT and outweighs raw CV/skill overlap: a role the CV qualifies them for but that runs against their " +
            "stated goal or dealbreaks a top priority is NOT a strong fit and must score lower. " +
            "Score 0-100, where 85+ means a strong, apply-worthy fit (role, seniority, skills, AND stated intent all align). " +
            "Be strict: reserve 85+ for genuinely aligned roles. " +
            "The summary is 2-3 sentences addressed to the candidate explaining why this role does or does not fit them, " +
            "citing concrete overlaps and gaps against both their background and their stated intent.",
          prompt:
            `CANDIDATE PREFERENCES\n${profile}\n\n` +
            `CANDIDATE CV\n${cv}\n\n` +
            `JOB POSTING\n${jd}`,
        });
        job.aiScore = object.score;
        job.aiSummary = object.summary;
        job.aiScored = true;
        reviewed++;
        // Log the chain-of-thought reasoning in dev so you can inspect WHY the
        // model scored the way it did. Not stored in the DB (only score + summary
        // are persisted). Set GEMINI_LOG_REASONING=1 to see it in production logs.
        if (process.env.NODE_ENV === "development" || process.env.GEMINI_LOG_REASONING) {
          console.log(
            `[ai] "${job.title}" @ ${job.company ?? "?"} → ${object.score}/100\n` +
            `  reasoning: ${object.reasoning}\n` +
            `  summary: ${object.summary}`
          );
        }
        // usage field names vary across AI SDK versions; take whichever exists.
        aiTokens += usage?.totalTokens ?? (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
        return;
      } catch (e) {
        // Rate-limited and retries left: back off (2s, 4s, …) to let the
        // per-minute window drain, then try this job again.
        if (isRateLimitError(e) && attempt < MAX_RETRIES) {
          await sleep(1000 * 2 ** (attempt + 1));
          continue;
        }
        // Out of retries or a non-rate-limit error: degrade gracefully — keep the
        // keyword score, leave AI fields unset.
        console.error(`[ai] rescore failed for "${job.title}":`, e instanceof Error ? e.message : e);
        return;
      }
    }
  });

  // Record this pass's spend against today's global budget (best-effort).
  await recordGeminiSpend(aiTokens);

  return { jobs, stats: { gated: candidates.length, reviewed, aiTokens } };
}
