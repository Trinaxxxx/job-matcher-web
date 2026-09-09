import { describe, it, expect } from "vitest";
import { scoreJob, type RawJob } from "./scoring";
import type { Strategy } from "./strategy";

function strat(over: Partial<Strategy> = {}): Strategy {
  return {
    titleKeywords: [],
    mustHaveKeywords: [],
    niceToHaveKeywords: [],
    excludeKeywords: [],
    locations: [],
    excludeLocations: [],
    remoteOk: false,
    ...over,
  };
}

function salaryReason(job: RawJob, minSalary: number): string {
  const r = scoreJob(job, strat({ minSalary }));
  return r.reasons.find((x) => x.includes("salary")) ?? "";
}

describe("salary normalization (monthly/annual/hourly/etc.)", () => {
  it("annual posting is normalized to monthly before comparing", () => {
    // 120000/year ≈ 10000/month, which meets a 9000 monthly floor.
    expect(salaryReason({ salary: "USD 120,000 per year" }, 9000)).toMatch(/meets your floor/);
    expect(salaryReason({ salary: "USD 120,000 per year" }, 9000)).toMatch(/~10000\/mo/);
    expect(salaryReason({ salary: "USD 120,000 per year" }, 9000)).toMatch(/approx, annual/);
  });

  it("hourly posting is annualized to full-time monthly and flagged approx", () => {
    // $50/hr × 173.3h ≈ 8667/month, meets a 7000 floor.
    const reason = salaryReason({ salary: "$50/hour" }, 7000);
    expect(reason).toMatch(/meets your floor/);
    expect(reason).toMatch(/approx, hourly/);
  });

  it("k suffix is honored (120k = 120000, not 120)", () => {
    // 120k with no period and >= 30000 → treated annual → 10000/mo.
    expect(salaryReason({ salary: "120k" }, 9000)).toMatch(/~10000\/mo/);
  });

  it("m suffix is honored (1.2m annual → 100000/mo)", () => {
    expect(salaryReason({ salary: "1.2m per year" }, 50000)).toMatch(/~100000\/mo/);
  });

  it("explicit monthly is not marked approx", () => {
    const reason = salaryReason({ salary: "RM 8,000 per month" }, 7000);
    expect(reason).toMatch(/meets your floor/);
    expect(reason).not.toMatch(/approx/);
  });

  it("no off-by-one cliff around 60000 (both read as monthly with a stated period)", () => {
    expect(salaryReason({ salary: "60000 per month" }, 7000)).toMatch(/~60000\/mo/);
    expect(salaryReason({ salary: "60001 per month" }, 7000)).toMatch(/~60001\/mo/);
  });

  it("unparseable salary yields no salary reason", () => {
    expect(salaryReason({ salary: "Negotiable" }, 7000)).toBe("");
  });
});

describe("word-boundary skill matching", () => {
  it("short skills do not match inside larger words", () => {
    const s = strat({ mustHaveKeywords: ["r", "go", "java"] });
    const r = scoreJob(
      { title: "Reporting Lead", description: "We use JavaScript. Good governance. No true match here." },
      s
    );
    expect(r.reasons.join(" ")).not.toMatch(/key skills/);
  });

  it("real skill tokens still match", () => {
    const s = strat({ mustHaveKeywords: ["java", "sql"] });
    const r = scoreJob({ title: "Engineer", description: "Strong Java and SQL experience." }, s);
    expect(r.reasons.join(" ")).toMatch(/key skills/);
  });

  it("symbol-bearing skills keep substring matching", () => {
    const s = strat({ mustHaveKeywords: ["c++", "node.js"] });
    const r = scoreJob({ title: "Dev", description: "We use c++ and node.js daily." }, s);
    expect(r.reasons.join(" ")).toMatch(/key skills/);
  });
});
