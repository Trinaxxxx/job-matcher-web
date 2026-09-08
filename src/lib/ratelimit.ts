import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";

// Distributed rate limiting backed by Upstash Redis (works across Vercel's
// serverless instances). If the Upstash env vars are absent — e.g. local dev
// without a Redis store — limiting is disabled and every request is allowed,
// so the app still runs. Set both vars in production to turn it on.
//
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

if (!redis && process.env.NODE_ENV === "production") {
  // Loud warning: production without limiting is a misconfiguration.
  console.warn(
    "[ratelimit] Upstash env vars are not set — rate limiting is DISABLED in production."
  );
}

function make(limiter: ReturnType<typeof Ratelimit.slidingWindow>, prefix: string) {
  if (!redis) return null;
  return new Ratelimit({ redis, limiter, prefix, analytics: false });
}

// Tight limit for credential endpoints (brute force / credential stuffing).
const authLimiter = make(Ratelimit.slidingWindow(10, "10 m"), "rl:auth");
// Very tight limit for the expensive scrape (each call spends the user's Apify
// quota and can run for minutes).
const searchLimiter = make(Ratelimit.slidingWindow(5, "10 m"), "rl:search");
// General limit for other authenticated but expensive endpoints (CV parsing,
// large exports) so a single account can't spam CPU/DB work.
const generalLimiter = make(Ratelimit.slidingWindow(30, "10 m"), "rl:general");

// Derive a client identifier for IP-based limiting.
//
// SECURITY: never trust the *leftmost* value of `x-forwarded-for` — it is
// client-supplied and can be spoofed (`X-Forwarded-For: 1.2.3.4`), letting an
// attacker mint a fresh limit bucket per request and defeat brute-force
// protection. On Vercel/most reverse proxies the platform sets `x-real-ip` to
// the verified peer address (overwriting anything the client sent), so prefer
// it. If only XFF is available, use the *rightmost* entry — the one appended
// by the trusted proxy nearest us — not the leftmost.
export function clientKey(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",").map((p) => p.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (last) return last;
  }
  return "unknown";
}

export type LimitKind = "auth" | "search" | "general";

// Returns true if the request is within the limit (or limiting is disabled),
// false if it should be rejected with 429.
export async function checkRateLimit(
  req: NextRequest,
  kind: LimitKind,
  extraKey?: string
): Promise<boolean> {
  const limiter =
    kind === "auth" ? authLimiter : kind === "search" ? searchLimiter : generalLimiter;
  if (!limiter) return true; // limiting disabled
  const id = extraKey ? `${clientKey(req)}:${extraKey}` : clientKey(req);
  const { success } = await limiter.limit(id);
  return success;
}
