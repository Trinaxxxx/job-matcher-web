import { describe, it, expect } from "vitest";
import { geminiBudgetAvailable, recordGeminiSpend } from "./budget";

// In the test env neither Upstash nor GEMINI_DAILY_TOKEN_BUDGET is configured, so
// the guard is disabled: it must fail open (always allow) and recording spend must
// be a harmless no-op. This is the same graceful-degradation contract as the rate
// limiter — the app runs fully without Redis.
describe("gemini budget guard (disabled / no Upstash)", () => {
  it("reports budget available when the guard is disabled", async () => {
    await expect(geminiBudgetAvailable()).resolves.toBe(true);
  });

  it("records spend without throwing when the guard is disabled", async () => {
    await expect(recordGeminiSpend(12345)).resolves.toBeUndefined();
  });
});
