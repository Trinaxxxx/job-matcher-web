// Generalized keyword scorer. Given a job and a user's Strategy, returns a
// 0..100 score with a plain-English reasons list. No AI required — this is the
// deterministic first filter (the web equivalent of the local tool's scoring.py).

import type { Strategy } from "./strategy";
import { INDUSTRY_TERMS } from "./strategy";

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

// Infer the seniority rank a JOB TITLE implies, for the ceiling guard. Returns
// null for titles that carry no clear level word (a plain "Manager"/"Analyst" is
// ambiguous — mid to senior depending on org — so we don't infer and don't
// penalize). Word-boundary anchored so "head" doesn't match "headcount", "lead"
// doesn't match "leader", etc. Highest signals are checked first.
function titleSeniorityRank(title: string): number | null {
  if (/\b(chief|ceo|cfo|coo|cto|cmo|cio|founder|co-founder|managing director|president)\b/.test(title)) return 6;
  if (/\b(vp|svp|evp|vice president)\b/.test(title)) return 6;
  if (/\b(head|director)\b/.test(title)) return 5;
  if (/\b(principal|staff|lead)\b/.test(title)) return 4;
  if (/\b(senior|sr)\b/.test(title)) return 3;
  if (/\b(junior|jr|associate|entry|graduate|intern|trainee)\b/.test(title)) return 1;
  return null;
}

function has(text: string, needle: string): boolean {
  return text.includes(needle.toLowerCase());
}

// Word-boundary-aware match for "wordish" skill keywords, so short tokens like
// "r", "go", "java" don't match inside "reporting", "good", "javascript".
// Symbol-bearing skills (c++, .net, node.js) keep plain substring matching, as a
// letter-boundary rule doesn't apply cleanly to them.
function hasWord(text: string, needle: string): boolean {
  const n = needle.toLowerCase();
  if (!/^[a-z0-9]([a-z0-9 ]*[a-z0-9])?$/.test(n)) return text.includes(n);
  const isLetter = (c: string) => c >= "a" && c <= "z";
  for (let from = 0; ; ) {
    const i = text.indexOf(n, from);
    if (i < 0) return false;
    const before = i === 0 ? "" : text[i - 1];
    const after = i + n.length >= text.length ? "" : text[i + n.length];
    if (!isLetter(before) && !isLetter(after)) return true;
    from = i + 1;
  }
}

function countHits(text: string, needles: string[], wordish = false): { hits: string[] } {
  const match = wordish ? hasWord : has;
  const hits: string[] = [];
  for (const n of needles) if (n && match(text, n)) hits.push(n);
  return { hits };
}

// Approximate full-time conversion factors, used to bring hourly/daily/weekly/
// annual pay onto a common MONTHLY basis for comparison with the user's floor.
const HOURS_PER_MONTH = (40 * 52) / 12; // 40h/week full-time ≈ 173.3h/month
const WORKDAYS_PER_MONTH = 260 / 12; // ~21.7 working days/month
const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.33

type SalaryBasis = "hourly" | "daily" | "weekly" | "monthly" | "annual";
type ParsedSalary = { monthly: number; approx: boolean; basis: SalaryBasis };

function detectBasis(s: string): SalaryBasis | null {
  if (/(per\s*hour|\/\s*h(ou)?r|hourly|an hour|p\/h)\b/.test(s) || /\bhr\b/.test(s)) return "hourly";
  if (/(per\s*day|\/\s*day|daily|a day)\b/.test(s)) return "daily";
  if (/(per\s*week|\/\s*w(ee)?k|weekly|a week|p\/w)\b/.test(s)) return "weekly";
  if (/(per\s*month|\/\s*mo(nth)?|monthly|a month|pcm|p\/m)\b/.test(s)) return "monthly";
  if (/(per\s*(year|annum)|\/\s*y(ea)?r|annually|annual|yearly|a year|p\.?a\.?)\b/.test(s)) return "annual";
  return null;
}

// Parse a free-text salary into an approximate monthly figure. Handles k/m
// suffixes ("120k" → 120000, "1.2m" → 1_200_000), thousands commas, ranges (uses
// the top of the range), and hourly/daily/weekly/annual periods. Returns null
// when no usable number is present (e.g. "Negotiable").
function parseSalary(salary?: string): ParsedSalary | null {
  if (!salary) return null;
  const s = salary.toLowerCase().replace(/(\d),(\d)/g, "$1$2"); // strip thousands commas
  const nums: number[] = [];
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*([km])?/g)) {
    let v = parseFloat(m[1]);
    if (!Number.isFinite(v)) continue;
    if (m[2] === "k") v *= 1_000;
    else if (m[2] === "m") v *= 1_000_000;
    nums.push(v);
  }
  if (!nums.length) return null;
  const amt = Math.max(...nums);

  let basis = detectBasis(s);
  if (!basis) basis = amt >= 30_000 ? "annual" : "monthly"; // no period stated: infer by magnitude

  switch (basis) {
    case "hourly":
      return { monthly: amt * HOURS_PER_MONTH, approx: true, basis };
    case "daily":
      return { monthly: amt * WORKDAYS_PER_MONTH, approx: true, basis };
    case "weekly":
      return { monthly: amt * WEEKS_PER_MONTH, approx: true, basis };
    case "annual":
      return { monthly: amt / 12, approx: true, basis };
    default:
      return { monthly: amt, approx: false, basis: "monthly" };
  }
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
  const company = (job.company || "").toLowerCase();
  const text = `${title}\n${desc}`;
  const reasons: string[] = [];

  // ---- Hard exclusions -------------------------------------------------
  // Dealbreaker keyword in the TITLE = exclude outright.
  for (const ex of s.excludeKeywords) {
    if (ex && has(title, ex)) {
      return { score: 0, tier: "Weak", reasons: [`Excluded: dealbreaker "${ex}" in title`], excluded: true, excludeReason: `Dealbreaker "${ex}" in title` };
    }
  }
  // Location the user wants to avoid. Also match the COMPANY name: an avoid-term
  // like "India" often identifies the employer's base (e.g. "Tempsens Instruments
  // (India) Limited" posting a KL role) rather than the job's location field, and
  // checking only location/title let those through.
  for (const ex of s.excludeLocations) {
    if (ex && (has(loc, ex) || has(title, ex) || has(company, ex))) {
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
  const must = countHits(text, s.mustHaveKeywords, true).hits;
  if (must.length) {
    const pts = Math.min(24, must.length * 6);
    score += pts;
    reasons.push(`+${pts} key skills/industry match (${must.slice(0, 5).join(", ")})`);
  }

  // Domain guard. The user named explicit skills/industries (coreKeywords) — their
  // strongest domain signal — and this job hits NONE of them in title or body.
  // Without this, a title + location match alone reaches "Strong match" (base 50
  // +22 title +8 location = 80) regardless of sector, which is why hotel,
  // industrial, and automotive "Sales Manager" roles scored as strong matches for
  // a fintech/SaaS candidate and crowded out the AI-review budget. Penalize rather
  // than exclude — the AI pass may still catch nuance a keyword can't. Fires only
  // when coreKeywords is present, so strategies stored before this field keep the
  // previous behavior.
  if (s.coreKeywords?.length) {
    const core = countHits(text, s.coreKeywords, true).hits;
    if (!core.length) {
      score -= 20;
      reasons.push(`-20 none of your key skills/industries (${s.coreKeywords.slice(0, 5).join(", ")}) found — likely off-domain`);
    }
  }

  // Industry guard. Distinct from the domain guard above: that one fires when a
  // job hits NONE of the user's skills+industries; this one enforces INDUSTRY fit
  // specifically, because a job can match a generic skill ("financial modelling")
  // yet sit in a plainly wrong sector (a fintech/SaaS candidate matched to a
  // manufacturing or automotive finance role). We only penalize a POSITIVELY wrong
  // industry — the JD/company names a recognized sector that is NOT one the user
  // wants — not merely an unstated one: many JDs never name their industry, and
  // "unknown" must not be treated as "wrong" or relevant roles get starved. Uses
  // word-boundary matching so terms like "media"/"mining"/"energy" don't match
  // inside "immediate"/"examining"/"synergy". Fires only when the user stated
  // industries, so strategies stored before this field keep prior behavior.
  if (s.industryKeywords?.length) {
    const industryText = `${text}\n${company}`;
    const wantedHit = countHits(industryText, s.industryKeywords, true).hits;
    if (!wantedHit.length) {
      const foreign = INDUSTRY_TERMS.filter(
        (t) => !s.industryKeywords!.includes(t) && hasWord(industryText, t)
      );
      if (foreign.length) {
        score -= 18;
        reasons.push(
          `-18 off-industry: role is in ${foreign.slice(0, 2).join("/")}, not your target ${s.industryKeywords.slice(0, 3).join(", ")}`
        );
      }
    }
  }

  // Seniority-ceiling guard. The exclusion above guards the FLOOR (entry-level
  // roles for a mid+ candidate); this guards the CEILING — a role whose title
  // sits well above what the CV actually demonstrates. It references cvSeniority
  // (DEMONSTRATED level), never the desired `seniority`, so an aspirational target
  // can't raise the ceiling and let over-reach roles through. Only a gap of 2+
  // ranks is docked: a one-level stretch (e.g. senior → lead) is normal and stays
  // unpenalized, and titles with no clear level word (plain "Manager") return null
  // and are left alone. Fires only when cvSeniority is known, so strategies stored
  // before this field keep prior behavior.
  if (s.cvSeniority) {
    const candRank = SENIORITY_RANK[s.cvSeniority];
    const jobRank = titleSeniorityRank(title);
    if (candRank !== undefined && jobRank !== null && jobRank - candRank >= 2) {
      score -= 15;
      reasons.push(
        `-15 role sits ${jobRank - candRank} levels above your demonstrated seniority (${s.cvSeniority}) — likely a reach`
      );
    }
  }

  // Nice-to-haves (CV-derived).
  const nice = countHits(text, s.niceToHaveKeywords, true).hits;
  if (nice.length) {
    const pts = Math.min(10, nice.length * 2);
    score += pts;
    reasons.push(`+${pts} related experience match`);
  }

  // Preferred location / remote.
  const remoteMatch = has(text, "remote") || has(loc, "remote");
  if (s.locations.length) {
    const locMatch = s.locations.some((l) => has(loc, l) || has(desc, l));
    if (locMatch) {
      score += 8;
      reasons.push(`+8 preferred location`);
    } else if (!(s.remoteOk && remoteMatch)) {
      // A preferred location was given, but this job is neither in it nor a remote
      // role the user accepts. Previously such jobs merely forfeited the +8 yet
      // still reached "Strong match" on title alone — so roles in a different
      // state or country ranked as top matches. Dock heavily instead. (Not an
      // outright exclusion: metro naming varies — "Petaling Jaya" won't literally
      // contain "Kuala Lumpur" — so we keep near-region roles visible but ranked
      // below true in-location ones.)
      score -= 15;
      reasons.push(`-15 outside your preferred location (${s.locations.slice(0, 2).join(", ")})`);
    }
  }
  if (s.remoteOk && remoteMatch) {
    score += 4;
    reasons.push(`+4 remote available`);
  }

  // Dealbreaker keyword in DESCRIPTION (not title) = penalty, not exclusion.
  const softExcl = countHits(desc, s.excludeKeywords, true).hits;
  if (softExcl.length) {
    const pts = Math.min(20, softExcl.length * 10);
    score -= pts;
    reasons.push(`-${pts} dealbreaker term(s) in description (${softExcl.slice(0, 3).join(", ")})`);
  }

  // Salary floor. Job pay is normalized to an approximate MONTHLY figure so
  // hourly/annual/etc. postings compare fairly against the user's monthly floor.
  if (s.minSalary) {
    const parsed = parseSalary(job.salary);
    if (parsed !== null) {
      const amt = Math.round(parsed.monthly);
      const tag = parsed.approx ? ` (~approx, ${parsed.basis})` : "";
      if (amt < s.minSalary) {
        // A stated salary below the user's floor is a hard disqualifier — exclude
        // it outright rather than merely docking points (a docked below-floor job
        // could still clear the AI-review gate and occupy the results). Jobs with
        // no parseable salary are NOT excluded: absent pay data is unknown, not
        // below-floor, so we leave them to the rest of the scoring.
        const msg = `salary ~${amt}/mo${tag} below your floor ${s.minSalary}`;
        return { score: 0, tier: "Weak", reasons: [...reasons, `Excluded: ${msg}`], excluded: true, excludeReason: msg };
      }
      score += 4;
      reasons.push(`+4 salary ~${amt}/mo${tag} meets your floor`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: tierFor(score), reasons, excluded: false };
}
