import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { clientKey, checkRateLimit } from "./ratelimit";

// Minimal NextRequest stand-in: clientKey only reads request headers.
function reqWith(headers: Record<string, string>): NextRequest {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe("clientKey (A — IP spoofing resistance)", () => {
  it("prefers the platform-set x-real-ip over client-supplied x-forwarded-for", () => {
    const req = reqWith({
      "x-forwarded-for": "1.2.3.4, 9.9.9.9",
      "x-real-ip": "203.0.113.7",
    });
    expect(clientKey(req)).toBe("203.0.113.7");
  });

  it("ignores a spoofed leftmost x-forwarded-for and uses the rightmost (trusted) entry", () => {
    // Attacker sends "X-Forwarded-For: 1.2.3.4"; the proxy appends the real IP.
    const req = reqWith({ "x-forwarded-for": "1.2.3.4, 198.51.100.23" });
    expect(clientKey(req)).toBe("198.51.100.23");
  });

  it("does not let the attacker rotate the key via the leftmost value", () => {
    const a = reqWith({ "x-forwarded-for": "1.1.1.1, 198.51.100.23" });
    const b = reqWith({ "x-forwarded-for": "2.2.2.2, 198.51.100.23" });
    // Same real client => same bucket, regardless of spoofed leftmost value.
    expect(clientKey(a)).toBe(clientKey(b));
  });

  it("falls back to 'unknown' when no IP headers are present", () => {
    expect(clientKey(reqWith({}))).toBe("unknown");
  });
});

describe("checkRateLimit (F — general kind)", () => {
  it("accepts the 'general' kind and allows requests when limiting is disabled", async () => {
    // No Upstash env vars in the test env => limiter is null => allow.
    const req = reqWith({ "x-real-ip": "203.0.113.7" });
    await expect(checkRateLimit(req, "general", "user-1")).resolves.toBe(true);
  });
});
