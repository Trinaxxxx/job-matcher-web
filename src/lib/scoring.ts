// Generalized keyword scorer. Given a job and a user's Strategy, returns a
// 0..100 score with a plain-English reasons list. No AI required — this is the
// deterministic first filter (the web equivalent of the local tool's scoring.py).

import type { Strategy } from "./strategy";
import { INDUSTRY_TERMS } from "./strategy";
import { compareSalary, type PayPeriod } from "./salary";

export type RawJob = {
  title?: string;
  company?: string;
  location?: string;
  salary?: string;
  url?: string;
  source?: string;
  description?: string;
  postedDate?: string;
  // Coordinates when the board gives an address-level position (not just a city
  // centroid). Lets the radius filter skip geocoding and measure exactly.
  geo?: { lat: number; lon: number };
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

const BASIS: Record<PayPeriod, string> = { hour: "hourly", day: "daily", week: "weekly", fortnight: "fortnightly", semimonth: "semi-monthly", month: "monthly", year: "annual" };

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
  // Keyword mode: the user's own word lists are HARD filters on title + body
  // (no AI pass will rescue a near-miss, so these decide what the user sees).
  // Word-boundary matching so "java" doesn't pass a "javascript" job.
  const kf = s.matchMode === "keywords" ? s.keywordFilter : undefined;
  let anyHits: string[] = [];
  if (kf) {
    const banned = countHits(text, kf.excludeAny, true).hits;
    if (banned.length) {
      return { score: 0, tier: "Weak", reasons: [`Excluded: contains "${banned[0]}"`], excluded: true, excludeReason: `Contains excluded word "${banned[0]}"` };
    }
    const missing = kf.includeAll.filter((k) => !hasWord(text, k));
    if (missing.length) {
      return { score: 0, tier: "Weak", reasons: [`Excluded: missing required "${missing[0]}"`], excluded: true, excludeReason: `Missing required word "${missing[0]}"` };
    }
    anyHits = countHits(text, kf.includeAny, true).hits;
    if (kf.includeAny.length && !anyHits.length) {
      return { score: 0, tier: "Weak", reasons: ["Excluded: none of your keywords found"], excluded: true, excludeReason: "None of your keywords found" };
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

  // Keyword mode ranking: more of the user's keywords present = closer fit.
  if (kf) {
    const matched = [...kf.includeAll, ...anyHits];
    if (matched.length) {
      const pts = Math.min(24, matched.length * 4);
      score += pts;
      reasons.push(`+${pts} matched your keywords (${matched.slice(0, 5).join(", ")})`);
    }
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

  // Salary floor. Job pay is parsed in its local format (see lib/salary.ts) and
  // converted to the floor's period (month or year). A job in a DIFFERENT
  // currency is never compared — a stale or wrong conversion would silently hide
  // good jobs — and a job only slightly under the floor after a month↔year
  // conversion is kept (13th/14th-month pay, varying hours).
  if (s.minSalary) {
    const floorPeriod = s.salaryPeriod ?? "month";
    const v = compareSalary(job.salary, { amount: s.minSalary, period: floorPeriod, currency: s.currency });
    if (v.kind === "unclear") {
      // Pay is stated but can't be read reliably (no period, implausible as a
      // monthly/yearly figure) — keep the job and let the role match decide.
      reasons.push(`pay "${job.salary}" is unclear (no pay period stated), so it wasn't used to filter`);
    } else if (v.kind === "meets" || v.kind === "near" || v.kind === "below") {
      const per = floorPeriod === "year" ? "yr" : "mo";
      const cur = v.currency ? `${v.currency} ` : "";
      const tag = v.approx ? ` (~approx, ${BASIS[v.jobPeriod]})` : "";
      const pay = `${cur}~${v.jobAmount}/${per}${tag}`;
      if (v.kind === "below") {
        // A stated salary below the user's floor is a hard disqualifier — exclude
        // it outright rather than merely docking points (a docked below-floor job
        // could still clear the AI-review gate and occupy the results). Jobs with
        // no parseable salary are NOT excluded: absent pay data is unknown, not
        // below-floor, so we leave them to the rest of the scoring.
        const msg = `salary ${pay} below your floor ${s.minSalary}/${per}`;
        return { score: 0, tier: "Weak", reasons: [...reasons, `Excluded: ${msg}`], excluded: true, excludeReason: msg };
      }
      if (v.kind === "near") {
        reasons.push(
          v.jobAmount >= v.floor * 0.9
            ? `salary ${pay} is within 10% of your floor ${s.minSalary}/${per}`
            : `salary ${pay} is close to your floor ${s.minSalary}/${per} (may include 13th/14th-month pay)`
        );
      } else {
        score += 4;
        reasons.push(`+4 salary ${pay} meets your floor`);
      }
    } else if (v.kind === "other-currency") {
      reasons.push(`salary is in ${v.jobCurrency}, not compared with your ${v.floorCurrency} floor`);
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, tier: tierFor(score), reasons, excluded: false };
}
