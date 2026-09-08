import type { Strategy } from "./strategy";
import type { RawJob, ScoreResult } from "./scoring";

// ---------------------------------------------------------------------------
// AI MATCHING PASS — the ONLY part that needs Gemini. It is optional.
//
// v1 ships WITHOUT Gemini: if GEMINI_API_KEY is not set, this is a no-op and
// the app runs entirely on the keyword scorer. When you add the key later,
// fill in `geminiRescore` below and the app starts using it automatically —
// no other code changes needed.
// ---------------------------------------------------------------------------

export function aiEnabled(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export type ScoredJob = RawJob & ScoreResult & { aiScored?: boolean };

/**
 * Optionally re-rank/annotate the keyword-scored jobs using Gemini's reading of
 * each description against the CV + strategy. Currently a pass-through.
 *
 * To enable later:
 *   1. npm install @google/generative-ai
 *   2. Implement the call below (send cvText + strategy + each JD, ask for a
 *      0..100 fit score + one-line reason; merge into the job's score/reasons).
 *   3. Set aiScored = true on jobs it touched.
 */
export async function geminiRescore(
  jobs: ScoredJob[],
  _strategy: Strategy,
  _cvText: string
): Promise<ScoredJob[]> {
  if (!aiEnabled()) return jobs; // keyword-only mode
  // TODO: implement Gemini call. For now, behave as a no-op even if a key exists
  // so the build is stable until the integration is written.
  return jobs;
}
