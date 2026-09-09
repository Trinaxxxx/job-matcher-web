import { describe, it, expect } from "vitest";
import { buildStrategy, type Answers } from "./strategy";
import { scoreJob } from "./scoring";

const noAnswers = {} as Answers;

describe("CV-derived scoring signals", () => {
  it("captures multi-word skills as bigrams", () => {
    const cv =
      "Product management and machine learning. Product management again. Machine learning pipelines.";
    const s = buildStrategy(cv, noAnswers);
    const all = [...s.mustHaveKeywords, ...s.niceToHaveKeywords];
    expect(all).toContain("product management");
    expect(all).toContain("machine learning");
  });

  it("promotes strong CV phrases into must-haves (not just nice-to-have)", () => {
    const cv = "Built SQL pipelines. Optimized SQL queries. Python data models. Python automation scripts.";
    const s = buildStrategy(cv, noAnswers);
    expect(s.mustHaveKeywords.length).toBeGreaterThan(0);
    expect(s.mustHaveKeywords).toContain("sql");
  });

  it("a perfect CV-fit job now clears the AI-review gate (55 with CV present)", () => {
    const cv =
      "Senior data analyst. Built SQL pipelines and SQL reports. Python analysis and Python scripting. " +
      "Tableau dashboards and Tableau reporting. Revenue forecasting and demand forecasting.";
    const s = buildStrategy(cv, noAnswers);
    const r = scoreJob(
      { title: "Data Analyst", description: "SQL, Python, Tableau, forecasting, dashboards." },
      s
    );
    // Was 54 (nice-to-have only). Must now reach the CV-present gate of 55.
    expect(r.score).toBeGreaterThanOrEqual(55);
  });

  it("search keywords fall back to CV phrases when no target titles given", () => {
    const cv = "Registered nurse. Patient care patient care. Registered nurse in acute care.";
    const s = buildStrategy(cv, noAnswers);
    expect(s.searchKeywords && s.searchKeywords.length).toBeGreaterThan(0);
    // Should not be a generic fallback; should reflect the CV.
    expect(s.searchKeywords!.join(" ")).toMatch(/nurse|patient care|acute care/);
  });

  it("explicit target titles still drive the search query when provided", () => {
    const s = buildStrategy("some cv text repeated repeated words words", {
      targetTitles: "product manager, program manager",
    } as Answers);
    expect(s.searchKeywords).toEqual(["product manager", "program manager"]);
  });

  it("no CV + no answers still produces a usable (empty) strategy", () => {
    const s = buildStrategy("", noAnswers);
    expect(s.mustHaveKeywords).toEqual([]);
    expect(s.searchKeywords).toEqual([]);
  });
});

describe("CV-derived seniority floor (fix 4)", () => {
  it("infers a senior floor from an executive title and excludes junior roles", () => {
    const s = buildStrategy("Director of Engineering. Head of Product.", noAnswers);
    expect(s.seniority).toBe("director");
    const r = scoreJob({ title: "Junior Intern Trainee", description: "entry level" }, s);
    expect(r.excluded).toBe(true);
  });

  it("infers from stated years of experience", () => {
    expect(buildStrategy("Software engineer with 10 years of experience.", noAnswers).seniority).toBe("senior");
    expect(buildStrategy("Analyst, 4 years experience.", noAnswers).seniority).toBe("mid");
  });

  it("does NOT misfire on an entry-level CV (new grad)", () => {
    const cv = "Recent graduate. Completed senior year thesis. Was a club lead. 1 year internship.";
    const s = buildStrategy(cv, noAnswers);
    expect(s.seniority).toBeUndefined();
    // An intern role must still be allowed through for a new grad.
    const r = scoreJob({ title: "Graduate Intern", description: "entry level program" }, s);
    expect(r.excluded).toBe(false);
  });

  it("questionnaire seniority always wins over the CV inference", () => {
    const s = buildStrategy("Director of Engineering, 20 years.", { seniority: "junior" } as Answers);
    expect(s.seniority).toBe("junior");
  });
});
