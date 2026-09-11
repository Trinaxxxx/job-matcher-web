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

describe("salary floor as a hard filter", () => {
  it("excludes a job whose stated salary is below the floor", () => {
    const r = scoreJob({ title: "Sales Manager", salary: "RM 5,500 – RM 6,500 per month" }, strat({ minSalary: 10000 }));
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/below your floor/);
  });

  it("keeps a job that meets the floor", () => {
    const r = scoreJob({ title: "Sales Manager", salary: "RM 12,000 per month" }, strat({ minSalary: 10000 }));
    expect(r.excluded).toBe(false);
  });

  it("does not exclude when the salary is absent/unparseable (unknown ≠ below-floor)", () => {
    expect(scoreJob({ title: "Sales Manager", salary: "Negotiable" }, strat({ minSalary: 10000 })).excluded).toBe(false);
    expect(scoreJob({ title: "Sales Manager" }, strat({ minSalary: 10000 })).excluded).toBe(false);
  });
});

describe("location as a strong signal", () => {
  const s = strat({ titleKeywords: ["sales manager"], locations: ["kuala lumpur"] });

  it("docks a job outside the preferred location", () => {
    const r = scoreJob({ title: "Sales Manager", location: "Penang Island, Penang" }, s);
    expect(r.reasons.join(" ")).toMatch(/outside your preferred location/);
    expect(r.tier).not.toBe("Strong match");
  });

  it("rewards a job in the preferred location", () => {
    const r = scoreJob({ title: "Sales Manager", location: "Kuala Lumpur" }, s);
    expect(r.reasons.join(" ")).toMatch(/\+8 preferred location/);
  });

  it("does not dock a remote role when the user is open to remote", () => {
    const remote = strat({ titleKeywords: ["sales manager"], locations: ["kuala lumpur"], remoteOk: true });
    const r = scoreJob({ title: "Sales Manager", location: "Remote", description: "Fully remote position." }, remote);
    expect(r.reasons.join(" ")).not.toMatch(/outside your preferred location/);
  });
});

describe("avoid-location matches the company name", () => {
  it("excludes when an avoid-term appears in the company (not just the location)", () => {
    const r = scoreJob(
      { title: "Area Sales Manager", company: "Tempsens Instruments (India) Limited", location: "Kuala Lumpur" },
      strat({ excludeLocations: ["india"] })
    );
    expect(r.excluded).toBe(true);
    expect(r.excludeReason).toMatch(/india/i);
  });
});

describe("domain-mismatch guard (explicit skills/industries)", () => {
  const core = { titleKeywords: ["sales manager"], coreKeywords: ["saas", "isv"], locations: ["kuala lumpur"] };

  it("penalizes a title+location match that hits none of the user's core skills/industries", () => {
    const r = scoreJob(
      { title: "Sales Manager", location: "Kuala Lumpur", description: "Hotel wedding and social events sales." },
      strat(core)
    );
    expect(r.reasons.join(" ")).toMatch(/off-domain/);
    expect(r.tier).not.toBe("Strong match");
  });

  it("does not penalize when a core skill/industry is present", () => {
    const r = scoreJob(
      { title: "Sales Manager", location: "Kuala Lumpur", description: "Sell our SaaS platform to enterprises." },
      strat(core)
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-domain/);
  });

  it("no core keywords set → no domain penalty (back-compat with older strategies)", () => {
    const r = scoreJob(
      { title: "Sales Manager", location: "Kuala Lumpur", description: "anything at all" },
      strat({ titleKeywords: ["sales manager"], locations: ["kuala lumpur"] })
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-domain/);
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

describe("industry guard (positively-wrong sector vs unknown)", () => {
  const s = strat({ industryKeywords: ["fintech", "saas", "banking"] });

  it("penalizes a job that names a DIFFERENT recognized industry", () => {
    const r = scoreJob(
      { title: "Finance Manager", company: "Acme Manufacturing", description: "Product costing for our automotive plant." },
      s
    );
    expect(r.reasons.join(" ")).toMatch(/off-industry/);
    expect(r.score).toBeLessThan(50);
  });

  it("does NOT penalize a job that names no industry at all (unknown != wrong)", () => {
    const r = scoreJob(
      { title: "Finance Manager", company: "Private Advertiser", description: "Own budgeting and forecasting." },
      s
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-industry/);
  });

  it("does NOT penalize a job in one of the user's target industries", () => {
    const r = scoreJob(
      { title: "Finance Manager", company: "PayCo", description: "A fast-growing fintech scaling its finance team." },
      s
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-industry/);
  });

  it("word-boundary safe: 'media' does not match inside 'immediate'", () => {
    const r = scoreJob(
      { title: "Finance Manager", company: "PayCo", description: "Immediate start; fintech scale-up." },
      s
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-industry/);
  });

  it("no industry preference stated → guard is inert", () => {
    const r = scoreJob(
      { title: "Finance Manager", company: "Acme Manufacturing", description: "Automotive plant costing." },
      strat({})
    );
    expect(r.reasons.join(" ")).not.toMatch(/off-industry/);
  });
});

describe("seniority-ceiling guard (over-reach vs demonstrated level)", () => {
  it("docks a role 2+ levels above demonstrated seniority", () => {
    // CV shows mid level; a VP role is a 4-rank reach.
    const r = scoreJob({ title: "VP of Finance" }, strat({ cvSeniority: "mid" }));
    expect(r.reasons.join(" ")).toMatch(/levels above your demonstrated seniority/);
  });

  it("does NOT dock a one-level stretch", () => {
    // senior (3) → lead/principal (4) is a single-level stretch, allowed.
    const r = scoreJob({ title: "Principal Analyst" }, strat({ cvSeniority: "senior" }));
    expect(r.reasons.join(" ")).not.toMatch(/levels above/);
  });

  it("references demonstrated level, not desired: head-level CV is not docked for a head role", () => {
    // A candidate whose CV reads at head/director rank is not over-reaching for a
    // Head role — seniority alone doesn't flag it (function/industry guards do).
    const r = scoreJob({ title: "Head of FP&A" }, strat({ cvSeniority: "director", seniority: "director" }));
    expect(r.reasons.join(" ")).not.toMatch(/levels above/);
  });

  it("ignores titles with no clear level word (plain Manager)", () => {
    const r = scoreJob({ title: "Finance Manager" }, strat({ cvSeniority: "mid" }));
    expect(r.reasons.join(" ")).not.toMatch(/levels above/);
  });

  it("word-boundary safe: 'head' does not match 'headcount'", () => {
    const r = scoreJob({ title: "Headcount Planning Analyst" }, strat({ cvSeniority: "mid" }));
    expect(r.reasons.join(" ")).not.toMatch(/levels above/);
  });

  it("inert when cvSeniority is unknown", () => {
    const r = scoreJob({ title: "VP of Finance" }, strat({}));
    expect(r.reasons.join(" ")).not.toMatch(/levels above/);
  });
});
