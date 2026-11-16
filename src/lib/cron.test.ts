import { describe, it, expect } from "vitest";
import {
  DEFAULT_GUEST_TTL_DAYS,
  guestTtlDays,
  guestCutoff,
  isAuthorizedCron,
} from "./cron";

describe("guestTtlDays", () => {
  it("defaults when unset", () => {
    expect(guestTtlDays(undefined)).toBe(DEFAULT_GUEST_TTL_DAYS);
  });

  it("defaults when empty / whitespace", () => {
    expect(guestTtlDays("")).toBe(DEFAULT_GUEST_TTL_DAYS);
    expect(guestTtlDays("   ")).toBe(DEFAULT_GUEST_TTL_DAYS);
  });

  it("defaults when non-numeric or non-positive", () => {
    expect(guestTtlDays("abc")).toBe(DEFAULT_GUEST_TTL_DAYS);
    expect(guestTtlDays("0")).toBe(DEFAULT_GUEST_TTL_DAYS);
    expect(guestTtlDays("-3")).toBe(DEFAULT_GUEST_TTL_DAYS);
  });

  it("parses a valid override", () => {
    expect(guestTtlDays("14")).toBe(14);
    expect(guestTtlDays("1")).toBe(1);
    expect(guestTtlDays("0.5")).toBe(0.5);
  });
});

describe("guestCutoff (TTL cutoff math)", () => {
  it("subtracts the given TTL in days from `now`", () => {
    const now = new Date("2026-11-17T00:00:00.000Z");
    const cutoff = guestCutoff(now, 7);
    expect(cutoff.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });

  it("uses the default TTL when none is passed", () => {
    const now = new Date("2026-11-17T12:00:00.000Z");
    const cutoff = guestCutoff(now, DEFAULT_GUEST_TTL_DAYS);
    const expected = new Date(
      now.getTime() - DEFAULT_GUEST_TTL_DAYS * 24 * 60 * 60 * 1000
    );
    expect(cutoff.toISOString()).toBe(expected.toISOString());
  });

  it("is always in the past relative to `now`", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    expect(guestCutoff(now, 1).getTime()).toBeLessThan(now.getTime());
  });

  it("handles fractional days", () => {
    const now = new Date("2026-11-17T00:00:00.000Z");
    // Half a day = 12 hours.
    expect(guestCutoff(now, 0.5).toISOString()).toBe(
      "2026-11-16T12:00:00.000Z"
    );
  });
});

describe("isAuthorizedCron (bearer-secret guard)", () => {
  const SECRET = "s3cr3t-token";

  it("accepts an exact `Bearer <secret>` match", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(isAuthorizedCron("Bearer wrong", SECRET)).toBe(false);
  });

  it("rejects a missing / empty header", () => {
    expect(isAuthorizedCron(null, SECRET)).toBe(false);
    expect(isAuthorizedCron(undefined, SECRET)).toBe(false);
    expect(isAuthorizedCron("", SECRET)).toBe(false);
  });

  it("rejects the bare secret without the `Bearer ` scheme", () => {
    expect(isAuthorizedCron(SECRET, SECRET)).toBe(false);
  });

  it("rejects the wrong scheme", () => {
    expect(isAuthorizedCron(`Basic ${SECRET}`, SECRET)).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(isAuthorizedCron(`Bearer ${SECRET}`, undefined)).toBe(false);
    expect(isAuthorizedCron("Bearer anything", "")).toBe(false);
    expect(isAuthorizedCron("", "")).toBe(false);
  });
});
