import { describe, it, expect } from "vitest";
import { parseKeywordImport, parseSalaryFloor, KEYWORD_PROMPT, KEYWORD_FORMAT } from "./keywordImport";
import { buildStrategy, AnswersSchema } from "./strategy";
import { scoreJob } from "./scoring";

// Verbatim final reply from a real two-turn chat (Gemini, fictional accountant
// CV) run with KEYWORD_PROMPT. Variants below mimic how other chatbots and
// copy-paste mangle it.
const REAL_REPLY = `\`\`\`json
{
  "format": "job-matcher-keywords/v1",
  "targetTitles": [
    "finance manager",
    "financial controller",
    "senior finance manager",
    "fp&a manager"
  ],
  "location": "Kuala Lumpur",
  "remoteOk": true,
  "excludeLocations": [],
  "seniority": "senior",
  "minSalary": "12000",
  "currency": "MYR",
  "includeAll": [],
  "includeAny": [
    "finance manager", "financial controller", "fp&a", "netsuite", "power bi", "excel vba", "mfrs", "ifrs",
    "consolidation", "month-end close", "month end close", "budgeting", "forecasting", "variance analysis",
    "fintech", "e-commerce", "ecommerce"
  ],
  "excludeAny": ["commission only", "night shift", "manufacturing", "oil and gas", "oil & gas"]
}
\`\`\``;
const BODY = REAL_REPLY.replace(/```json\n|```/g, "");

function ok(text: string) {
  const r = parseKeywordImport(text);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  // Whatever the importer produces must pass the server's own validation.
  expect(AnswersSchema.safeParse(r.answers).success).toBe(true);
  return r;
}

describe("parseKeywordImport: real chatbot reply", () => {
  it("imports every field", () => {
    const r = ok(REAL_REPLY);
    expect(r.answers).toMatchObject({
      matchMode: "keywords",
      targetTitles: "finance manager, financial controller, senior finance manager, fp&a manager",
      locations: "Kuala Lumpur",
      remoteOk: true,
      seniority: "senior",
      minSalary: "12000",
      currency: "MYR",
      salaryPeriod: "month", // not in the reply: MYR salaries are quoted monthly
      includeAll: "",
      excludeAny: "commission only, night shift, manufacturing, oil and gas, oil & gas",
    });
    expect(r.counts).toEqual({ includeAll: 0, includeAny: 17, excludeAny: 5, titles: 4 });
    expect(r.warnings).toEqual([]);
  });

  it.each([
    ["prose around the block (ChatGPT style)", `Perfect! Here you go:\n\n${REAL_REPLY}\n\nGood luck!`],
    ["no code fences (Copilot style)", BODY],
    ["smart quotes (pasted via Notes/Word)", BODY.replace(/"/g, (_m, i: number) => (i % 2 ? "“" : "”"))],
    ["// and /* */ comments", BODY.replace('"includeAll": [],', '"includeAll": [], // keep empty\n /* note */')],
    ["Python-style single quotes", BODY.replace(/"/g, "'")],
    ["wrong key casing", BODY.replace('"includeAny"', '"IncludeAny"').replace('"excludeAny"', '"exclude_any"')],
    ["wrapped in another object", `{"keywords": ${BODY}}`],
    ["an example block before the final one", '```json\n{"includeAny": ["example"]}\n```\nFinal:\n' + REAL_REPLY],
    ["zero-width characters", BODY.replace('"ifrs"', '"if​rs"')],
  ])("tolerates %s", (_name, text) => {
    const r = ok(text);
    expect(r.counts.includeAny).toBe(17);
    expect(r.answers.includeAny).toContain("ifrs");
    expect(r.answers.excludeAny).toContain("night shift");
  });
});

describe("parseKeywordImport: values", () => {
  it.each([
    ["12000", 12000],
    ["RM 12,000 - 15,000", 12000],
    ["RM12k", 12000],
    ["12k-15k per month", 12000],
    ["1.2m", 1200000],
    ["12 000", 12000],
    [12000, 12000],
    ["negotiable", undefined],
  ])("salary %s → %s", (input, expected) => {
    expect(parseSalaryFloor(input)).toBe(expected);
  });

  it("warns, rather than guessing, on an unreadable salary", () => {
    const r = ok(BODY.replace('"12000"', '"negotiable"'));
    expect(r.answers.minSalary).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/salary couldn't be read/);
  });

  it("maps seniority phrasing to a level, and warns on nonsense", () => {
    expect(ok(BODY.replace('"senior"', '"Senior Manager"')).answers.seniority).toBe("senior");
    expect(ok(BODY.replace('"senior"', '"Head of Finance"')).answers.seniority).toBe("director");
    const r = ok(BODY.replace('"senior"', '"ninja"'));
    expect(r.answers.seniority).toBeUndefined();
    expect(r.warnings.join(" ")).toMatch(/Seniority "ninja" wasn't recognised/);
  });

  it("accepts comma-separated strings and de-duplicates", () => {
    expect(ok(`{"includeAny": "Python, sql, SQL"}`).answers.includeAny).toBe("python, sql");
  });

  it("trims over-long lists to the server cap and says so", () => {
    const many = Array.from({ length: 400 }, (_, i) => `keyword number ${i}`);
    const r = ok(JSON.stringify({ includeAny: many }));
    expect(r.counts.includeAny).toBeLessThanOrEqual(60);
    expect(r.warnings.join(" ")).toMatch(/left out to fit/);
  });

  it("drops over-long single keywords", () => {
    const r = ok(JSON.stringify({ includeAny: ["sql", "x".repeat(80)] }));
    expect(r.answers.includeAny).toBe("sql");
    expect(r.warnings.join(" ")).toMatch(/longer than 60 characters/);
  });

  it("warns about a strict includeAll list, an empty search list, and a foreign format", () => {
    expect(ok(JSON.stringify({ includeAll: ["a", "b", "c"] })).warnings.join(" ")).toMatch(/very strict/);
    expect(ok(JSON.stringify({ excludeAny: ["night shift"] })).warnings.join(" ")).toMatch(/every job/);
    expect(ok(JSON.stringify({ format: "other/v9", includeAny: ["x"] })).warnings.join(" ")).toMatch(/different version/);
  });
});

describe("parseKeywordImport: failures explain what went wrong", () => {
  it.each([
    ["not-found", "sure, what roles are you after?"],
    ["cut-off", BODY.slice(0, BODY.length / 2)],
    ["unreadable", '{"includeAny": ["a" "b"]}'],
    ["empty", '{"includeAny": [], "excludeAny": []}'],
    ["empty", '{"hello": "world"}'],
  ])("%s", (kind, text) => {
    expect(parseKeywordImport(text)).toMatchObject({ ok: false, kind });
  });
});

describe("parseKeywordImport: untrusted input", () => {
  it("reads only allowlisted fields (no prototype pollution, no account fields)", () => {
    const r = ok(BODY.replace("{", '{"__proto__": {"polluted": true}, "apifyKey": "x", "cvText": "x", "matchMode": "ai",'));
    expect(Object.keys(r.answers).sort()).toEqual(
      ["currency", "excludeAny", "excludeLocations", "includeAll", "includeAny", "locations", "matchMode", "minSalary", "remoteOk", "salaryPeriod", "seniority", "targetTitles"]
    );
    expect(r.answers.matchMode).toBe("keywords");
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("strips markup, formula and control characters from keywords", () => {
    const r = ok(JSON.stringify({ includeAny: ["<script>alert(1)</script>", '=HYPERLINK("http://x")', "c++", "c#", "node.js", "r&d"] }));
    expect(r.answers.includeAny).not.toMatch(/[<>="]/);
    expect(r.answers.includeAny).toContain("c++, c#, node.js, r&d");
  });

  it("strips bidi overrides from text fields", () => {
    expect(ok(JSON.stringify({ includeAny: ["x"], location: "Kuala‮ Lumpur" })).answers.locations).toBe("Kuala Lumpur");
  });

  it("the prompt asks the chatbot for exactly the fields the parser reads", () => {
    for (const key of ["targetTitles", "location", "includeAll", "includeAny", "excludeAny", KEYWORD_FORMAT]) {
      expect(KEYWORD_PROMPT).toContain(key);
    }
  });
});

describe("keyword-only matching", () => {
  const strategy = buildStrategy("", {
    matchMode: "keywords",
    includeAll: "ifrs",
    includeAny: "month-end close, ap/ar, sap",
    excludeAny: "commission only",
  });

  it("builds the filter, keeping slash terms whole", () => {
    expect(strategy.matchMode).toBe("keywords");
    expect(strategy.keywordFilter).toEqual({
      includeAll: ["ifrs"],
      includeAny: ["month-end close", "ap/ar", "sap"],
      excludeAny: ["commission only"],
    });
    // No titles given: the scrape falls back to the user's own keywords.
    expect(strategy.searchKeywords).toEqual(["ifrs", "month-end close", "ap/ar", "sap"]);
  });

  it("keeps jobs with the required words and ranks by keyword hits", () => {
    const one = scoreJob({ title: "Accountant", description: "IFRS reporting, SAP." }, strategy);
    const two = scoreJob({ title: "Accountant", description: "IFRS reporting, SAP, AP/AR and month-end close." }, strategy);
    expect(one.excluded).toBe(false);
    expect(two.excluded).toBe(false);
    expect(two.score).toBeGreaterThan(one.score);
    expect(two.reasons.join(" ")).toMatch(/matched your keywords/);
  });

  it("drops jobs missing an includeAll word", () => {
    const r = scoreJob({ title: "Accountant", description: "SAP and month-end close." }, strategy);
    expect(r).toMatchObject({ excluded: true, excludeReason: 'Missing required word "ifrs"' });
  });

  it("drops jobs with none of the includeAny words (whole-word match)", () => {
    // "sapling" must not count as "sap".
    const r = scoreJob({ title: "Accountant", description: "IFRS at a sapling nursery." }, strategy);
    expect(r).toMatchObject({ excluded: true, excludeReason: "None of your keywords found" });
  });

  it("drops jobs containing an excludeAny word anywhere", () => {
    const r = scoreJob({ title: "Accountant", description: "IFRS, SAP. Commission only." }, strategy);
    expect(r).toMatchObject({ excluded: true, excludeReason: 'Contains excluded word "commission only"' });
  });

  it("does not apply the word lists in AI mode", () => {
    const ai = buildStrategy("", { includeAll: "ifrs", excludeAny: "sap" });
    expect(ai.matchMode).toBe("ai");
    expect(scoreJob({ title: "Accountant", description: "SAP" }, ai).excluded).toBe(false);
  });
});
