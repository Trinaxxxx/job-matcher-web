import { Redis } from "@upstash/redis";

// Global spend guard for the SHARED Gemini key.
//
// Unlike the Apify key (which each user brings themselves), GEMINI_API_KEY is a
// single key the app owner pays for. Rate limiting caps how often one identity
// can trigger a search; this caps the TOTAL model spend across all users per day,
// so a burst of cheap disposable accounts — or a leaked key — can't run up an
// unbounded bill. It's the app-side complement to a hard billing cap set in the
// Google Cloud / AI Studio console.
//
// Backed by the same Upstash Redis used for rate limiting. If Upstash isn't
// configured (e.g. local dev), the guard is a no-op and the AI pass always runs,
// matching lib/ratelimit.ts.

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

// Hard ceiling on Gemini tokens spent per UTC day, across all users. 0 or unset
// disables the guard (the AI pass always runs). Set it in production to bound
// spend on the shared key.
const DAILY_TOKEN_BUDGET = Number(process.env.GEMINI_DAILY_TOKEN_BUDGET ?? 0);

if (!redis && DAILY_TOKEN_BUDGET > 0 && process.env.NODE_ENV === "production") {
  console.warn(
    "[budget] GEMINI_DAILY_TOKEN_BUDGET is set but Upstash Redis is not configured — " +
      "the Gemini daily budget cap is NOT enforced."
  );
}

// UTC day bucket, e.g. "budget:gemini:2026-09-10".
function dayKey(): string {
  return `budget:gemini:${new Date().toISOString().slice(0, 10)}`;
}

// True if there is budget left to run the AI pass today (or the guard is disabled
// / Redis is absent). Checked once before the paid pass. This is a safety cap,
// not exact accounting: because spend is recorded after each pass completes,
// concurrent searches can overshoot the cap by roughly one batch — acceptable for
// a guard whose job is to bound worst-case cost, not bill to the token.
export async function geminiBudgetAvailable(): Promise<boolean> {
  if (!redis || DAILY_TOKEN_BUDGET <= 0) return true;
  try {
    const spent = Number((await redis.get<number>(dayKey())) ?? 0);
    return spent < DAILY_TOKEN_BUDGET;
  } catch (e) {
    // Fail open: a Redis blip must not take the whole search offline. The hard
    // billing cap in the provider console is the backstop.
    console.error("[budget] budget check failed, allowing:", e instanceof Error ? e.message : e);
    return true;
  }
}

// Record tokens spent by a completed AI pass against today's bucket. Best-effort:
// a failure here must never break a search. The key expires after 48h so old days
// clean themselves up.
export async function recordGeminiSpend(tokens: number): Promise<void> {
  if (!redis || DAILY_TOKEN_BUDGET <= 0 || tokens <= 0) return;
  try {
    const key = dayKey();
    await redis.incrby(key, tokens);
    await redis.expire(key, 60 * 60 * 48);
  } catch (e) {
    console.error("[budget] failed to record Gemini spend:", e instanceof Error ? e.message : e);
  }
}
