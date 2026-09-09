import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { aiEnabled, geminiRescore, type ScoredJob } from "./ai";
import type { Strategy } from "./strategy";

const strategy: Strategy = {
  titleKeywords: ["product manager"],
  mustHaveKeywords: ["sql"],
  niceToHaveKeywords: [],
  excludeKeywords: [],
  locations: [],
  excludeLocations: [],
  remoteOk: false,
};

function job(overrides: Partial<ScoredJob> = {}): ScoredJob {
  return {
    title: "Product Manager",
    description: "Own the roadmap. SQL required.",
    score: 90,
    tier: "Strong match",
    reasons: [],
    excluded: false,
    ...overrides,
  };
}

describe("geminiRescore (AI gating)", () => {
  const prevKey = process.env.GEMINI_API_KEY;
  beforeEach(() => {
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  });

  it("aiEnabled reflects the presence of GEMINI_API_KEY", () => {
    expect(aiEnabled()).toBe(false);
    process.env.GEMINI_API_KEY = "test-key";
    expect(aiEnabled()).toBe(true);
  });

  it("is a no-op (returns jobs unchanged) when no key is set", async () => {
    const jobs = [job()];
    const { jobs: out, stats } = await geminiRescore(jobs, strategy, "cv text");
    expect(out).toBe(jobs);
    expect(out[0].aiScored).toBeUndefined();
    expect(out[0].aiScore).toBeUndefined();
    expect(stats).toEqual({ gated: 0, reviewed: 0, aiTokens: 0 });
  });

  it("never mutates the keyword score/tier fields", async () => {
    const { jobs: out } = await geminiRescore([job({ score: 42, tier: "Possible" })], strategy, "cv");
    expect(out[0].score).toBe(42);
    expect(out[0].tier).toBe("Possible");
  });
});
