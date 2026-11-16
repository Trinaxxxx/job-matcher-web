import { timingSafeEqual } from "crypto";

// Helpers for the guest-account reaper cron (see
// src/app/api/cron/reap-guests/route.ts). Kept here, pure and dependency-light,
// so the TTL math and the bearer-secret guard can be unit-tested without a
// request or a database.

// How long a guest/demo account lives before it's eligible for reaping, unless
// GUEST_TTL_DAYS overrides it.
export const DEFAULT_GUEST_TTL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Resolve the guest TTL (in days) from GUEST_TTL_DAYS, falling back to the
// default when the env var is unset, empty, non-numeric, or non-positive.
export function guestTtlDays(
  raw: string | undefined = process.env.GUEST_TTL_DAYS
): number {
  if (raw == null || raw.trim() === "") return DEFAULT_GUEST_TTL_DAYS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_GUEST_TTL_DAYS;
  return n;
}

// The age cutoff for reaping: a guest created strictly before this instant is
// stale. `cutoff = now - ttlDays`.
export function guestCutoff(
  now: Date = new Date(),
  ttlDays: number = guestTtlDays()
): Date {
  return new Date(now.getTime() - ttlDays * MS_PER_DAY);
}

// Constant-time string compare that never throws and safely handles unequal
// lengths (a length difference is itself revealed, which is acceptable for a
// bearer-token guard).
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// Guard for the cron endpoint: accept only when a secret is configured AND the
// Authorization header is exactly `Bearer <secret>`. Fails closed — a missing
// header or an unset/empty CRON_SECRET is rejected, so the route is never
// callable when the deployment forgot to configure the secret.
export function isAuthorizedCron(
  authHeader: string | null | undefined,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!secret) return false;
  if (!authHeader) return false;
  return safeEqual(authHeader, `Bearer ${secret}`);
}
