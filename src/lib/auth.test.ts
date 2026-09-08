import { describe, it, expect } from "vitest";
import bcrypt from "bcryptjs";
import {
  normalizeEmail,
  verifyPasswordConstantTime,
  DUMMY_PASSWORD_HASH,
} from "./auth";

describe("normalizeEmail (B — case/whitespace-insensitive accounts)", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
  });
  it("is idempotent", () => {
    const once = normalizeEmail("A@B.com");
    expect(normalizeEmail(once)).toBe(once);
  });
});

describe("verifyPasswordConstantTime (C — login timing side-channel)", () => {
  it("returns true for the correct password", async () => {
    const hash = await bcrypt.hash("correct horse", 10);
    expect(await verifyPasswordConstantTime("correct horse", hash)).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const hash = await bcrypt.hash("correct horse", 10);
    expect(await verifyPasswordConstantTime("battery staple", hash)).toBe(false);
  });

  it("returns false when the user is missing (null/undefined hash)", async () => {
    expect(await verifyPasswordConstantTime("anything", null)).toBe(false);
    expect(await verifyPasswordConstantTime("anything", undefined)).toBe(false);
  });

  it("ships a valid bcrypt dummy hash to compare against", async () => {
    // Must be a well-formed hash so the missing-user path does real bcrypt work.
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare("x", DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
