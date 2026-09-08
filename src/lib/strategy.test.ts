import { describe, it, expect } from "vitest";
import { ProfileBodySchema, AnswersSchema } from "./strategy";

describe("ProfileBodySchema / AnswersSchema (H — input validation)", () => {
  it("accepts a well-formed body", () => {
    const r = ProfileBodySchema.safeParse({
      answers: { targetTitles: "product manager", remoteOk: true },
      apifyKey: "apify_api_xyz",
    });
    expect(r.success).toBe(true);
  });

  it("strips unknown keys instead of storing arbitrary JSON", () => {
    const r = AnswersSchema.safeParse({
      targetTitles: "pm",
      evil: "<script>alert(1)</script>",
      nested: { a: 1 },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect("evil" in r.data).toBe(false);
      expect("nested" in r.data).toBe(false);
    }
  });

  it("rejects over-long free-text fields (DB-bloat guard)", () => {
    const r = AnswersSchema.safeParse({ skills: "x".repeat(1001) });
    expect(r.success).toBe(false);
  });

  it("rejects wrong types", () => {
    expect(AnswersSchema.safeParse({ targetTitles: 123 }).success).toBe(false);
    expect(AnswersSchema.safeParse({ remoteOk: "yes" }).success).toBe(false);
  });

  it("treats an empty body as valid (all fields optional)", () => {
    expect(ProfileBodySchema.safeParse({}).success).toBe(true);
  });
});
