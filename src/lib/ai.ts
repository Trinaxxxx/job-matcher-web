import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import type { Strategy } from "./strategy";
import type { RawJob, ScoreResult } from "./scoring";

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
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
// Cap JD text sent to the model to keep token cost/latency bounded.
const MAX_JD_CHARS = 6000;
const MAX_CV_CHARS = 8000;

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

/**
 * Re-rank/annotate the top keyword-scored jobs using Gemini's reading of each
 * JD against the CV + questionnaire strategy. Jobs not sent to Gemini are
 * returned unchanged (keyword score only, aiScored = false).
 */
export async function geminiRescore(
  jobs: ScoredJob[],
  strategy: Strategy,
  cvText: string
): Promise<ScoredJob[]> {
  if (!aiEnabled()) return jobs; // keyword-only mode

  // Pick the top roles the cheap keyword pass already rates highly — those are
  // the only ones worth a paid deep read.
  const candidates = jobs
    .filter((j) => j.score >= REVIEW_MIN_SCORE && (j.description ?? "").trim().length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, REVIEW_MAX_JOBS);

  if (!candidates.length) return jobs;

  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
  const model = google(MODEL);
  const cv = (cvText || "").slice(0, MAX_CV_CHARS);
  const profile = strategyDigest(strategy);

  await Promise.all(
    candidates.map(async (job) => {
      const jd = `${job.title ?? ""}\n${job.company ?? ""} — ${job.location ?? ""}\n\n${(
        job.description ?? ""
      ).slice(0, MAX_JD_CHARS)}`;
      try {
        const { object } = await generateObject({
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
      } catch (e) {
        // Degrade gracefully: keep the keyword score, leave AI fields unset.
        console.error(`[ai] rescore failed for "${job.title}":`, e instanceof Error ? e.message : e);
      }
    })
  );

  return jobs;
}
