// Generalized keyword scorer. Given a job and a user's Strategy, returns a
// 0..100 score with a plain-English reasons list. No AI required — this is the
// deterministic first filter (the web equivalent of the local tool's scoring.py).

import type { Strategy } from "./strategy";

export type RawJob = {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  source?: string;
  description?: string;
  postedDate?: string;
};

export type ScoreResult = {
  score: number; // 0..100
  tier: string;
  reasons: string[];
  excluded: boolean;
  excludeReason?: string;
};

const SENIORITY_RANK: Record<string, number> = {
  intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, principal: 4, director: 5, head: 5, vp: 6,
};

const JUNIOR_TITLE_SIGNALS = ["intern", "internship", "graduate program", "fresh graduate", "entry level", "entry-level", "junior", "trainee"];

function has(text: string, needle: string): boolean {
  return text.includes(needle.toLowerCase());
}

function countHits(text: string, needles: string[]): { hits: string[] } {
  const hits: string[] = [];
  for (const n of needles) if (n && has(text, n)) hits.push(n);
  return { hits };
}

function parseSalaryNumber(salary?: string): number | null {
  if (!salary) return null;
  const nums = (salary.replace(/,/g, "").match(/\d{3,7}/g) || []).map(Number);
  if (!nums.length) return null;
  let amt = Math.max(...nums);
  if (amt > 60000) amt = Math.round(amt / 12); // looks annual -> monthly
  return amt;
}

function tierFor(score: number): string {
  if (score >= 80) return "Strong match";
  if (score >= 65) return "Good match";
  if (score >= 50) return "Possible";
  return "Weak";
}

export function scoreJob(job: RawJob, s: Strategy): ScoreResult {
  const title = (job.title || "").toLowerCase();
  const desc = (job.description || "").toLowerCase();
  const loc = (job.location || "").toLowerCase();
  const text = `${title}\n${desc}`;
  const reasons: string[] = [];

  // ---- Hard exclusions -------------------------------------------------
  // Dealbreaker keyword in the TITLE = exclude outright.
  for (const ex of s.excludeKeywords) {
    if (ex && has(title, ex)) {
      return { score: 0, tier: "Weak", reasons: [`Excluded: dealbreaker "${ex}" in title`], excluded: true, excludeReason: `Dealbreaker "${ex}" in title` };
    }
  }
  // Location the user wants to avoid.
  for (const ex of s.excludeLocations) {
    if (ex && (has(loc, ex) || has(title, ex))) {
      return { score: 0, tier: "Weak", reasons: [`Excluded: location "${ex}"`], excluded: true, excludeReason: `Excluded location "${ex}"` };
    }
  }
  // Seniority guard: user wants mid+ but this is clearly entry-level.
  const wantRank = s.seniority ? SENIORITY_RANK[s.seniority] ?? null : null;
  if (wantRank !== null && wantRank >= 2 && JUNIOR_TITLE_SIGNALS.some((k) => has(title, k))) {
    return { score: 0, tier: "Weak", reasons: ["Excluded: entry-level role, you want mid+"], excluded: true, excludeReason: "Entry-level vs desired seniority" };
  }

  // ---- Scoring ---------------------------------------------------------
  let score = 50;

  // Title match is the strongest signal.
  const titleInTitle = countHits(title, s.titleKeywords).hits;
  const titleInDesc = countHits(desc, s.titleKeywords).hits.filter((h) => !titleInTitle.includes(h));
  if (titleInTitle.length) {
    score += 22;
    reasons.push(`+22 target role in title (${titleInTitle.slice(0, 3).join(", ")})`);
  } else if (titleInDesc.length) {
    score += 8;
    reasons.push(`+8 target role mentioned in description`);
  } else if (s.titleKeywords.length) {
    score -= 8;
    reasons.push(`-8 no target-role keyword found`);
  }

  // Must-have skills / industries.
  const must = countHits(text, s.mustHaveKeywords).hits;
  if (must.length) {
    const pts = Math.min(24, must.length * 6);
    score += pts;
    reasons.push(`+${pts} key skills/industry match (${must.slice(0, 5).join(", ")})`);
  }

  // Nice-to-haves (CV-derived).
  const nice = countHits(text, s.niceToHaveKeywords).hits;
  if (nice.length) {
    const pts = Math.min(10, nice.length * 2);
    score += pts;
    reasons.push(`+${pts} related experience match`);
  }

  // Preferred location / remote.
  if (s.locations.length && s.locations.some((l) => has(loc, l) || has(desc, l))) {
    score += 8;
    reasons.push(`+8 preferred location`);
  }
  if (s.remoteOk && (has(text, "remote") || has(loc, "remote"))) {
    score += 4;
    reasons.push(`+4 remote available`);
  }

  // Dealbreaker keyword in DESCRIPTION (not title) = penalty, not exclusion.
  const softExcl = countHits(desc, s.excludeKeywords).hits;
  if (softExcl.length) {
    const pts = Math.min(20, softExcl.length * 10);
    score -= pts;
    reasons.push(`-${pts} dealbreaker term(s) in description (${softExcl.slice(0, 3).join(", ")})`);
  }

  // Salary floor.
  if (s.minSalary) {
    const amt = parseSalaryNumber(job.salary);
    if (amt !== null) {
      if (amt < s.minSalary) {
        score -= 12;
        reasons.push(`-12 salary ~${amt} below your floor ${s.minSalary}`);
      } else {
        score += 4;
        reasons.push(`+4 salary meets your floor`);
      }
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: tierFor(score), reasons, excluded: false };
}
