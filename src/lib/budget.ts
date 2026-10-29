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

// ---------------------------------------------------------------------------
// PER-USER APIFY SCRAPE CAP
//
// The Apify key belongs to the user, so cost is theirs — but "theirs" still
// includes a leaked/shared key or a curious user hammering the scrape, either of
// which can burn their Apify credit fast. The sliding-window rate limit
// (lib/ratelimit.ts) bounds burst rate (5 / 10 min); this bounds the DAILY total
// per user, a ceiling the rate limit alone never imposes (5 every 10 min is 720 a
// day). One search fans out to up to two actor runs, so this is a direct lid on
// actor invocations per account per day. Keyed by userId, not IP, so it follows
// the account that owns the key. Disabled when unset/0 or when Redis is absent.
// ---------------------------------------------------------------------------
const APIFY_DAILY_SEARCH_BUDGET = Number(process.env.APIFY_DAILY_SEARCH_BUDGET ?? 0);

// Per-user UTC day bucket, e.g. "budget:apify:<userId>:2026-09-12".
function apifyDayKey(userId: string): string {
  return `budget:apify:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

// True if this user has searches left in today's budget (or the guard is disabled
// / Redis is absent). Checked once before the scrape. Like the Gemini guard this
// is a safety cap, not exact accounting — recording happens after the scrape, so
// concurrent searches can overshoot by roughly the concurrency count.
export async function apifyBudgetAvailable(userId: string): Promise<boolean> {
  if (!redis || APIFY_DAILY_SEARCH_BUDGET <= 0) return true;
  try {
    const used = Number((await redis.get<number>(apifyDayKey(userId))) ?? 0);
    return used < APIFY_DAILY_SEARCH_BUDGET;
  } catch (e) {
    // Fail open: a Redis blip must not take search offline. The user's own Apify
    // account limits / billing cap are the backstop.
    console.error("[budget] apify budget check failed, allowing:", e instanceof Error ? e.message : e);
    return true;
  }
}

// Record one scrape against this user's daily bucket. Best-effort; key expires
// after 48h so old days clean themselves up.
export async function recordApifySearch(userId: string): Promise<void> {
  if (!redis || APIFY_DAILY_SEARCH_BUDGET <= 0) return;
  try {
    const key = apifyDayKey(userId);
    await redis.incr(key);
    await redis.expire(key, 60 * 60 * 48);
  } catch (e) {
    console.error("[budget] failed to record apify search:", e instanceof Error ? e.message : e);
  }
}
