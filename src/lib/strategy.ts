// Turns a user's CV text + questionnaire answers into a deterministic scoring
// "strategy". This is the generalized, per-user replacement for the hardcoded
// strategy.md in the local Python tool — it works for any job seeker.

import { z } from "zod";

export type Answers = {
  targetTitles?: string;     // e.g. "product manager, program manager"
  skills?: string;           // e.g. "SQL, roadmapping, stakeholder management"
  industries?: string;       // preferred industries / domains
  dealbreakers?: string;     // things to avoid (roles, industries, words)
  locations?: string;        // preferred locations
  excludeLocations?: string; // locations to avoid
  minSalary?: string;        // numeric, monthly or annual — free text
  currency?: string;         // e.g. RM, SGD, USD
  seniority?: string;        // "intern" | "junior" | "mid" | "senior" | "lead" | "director"
  remoteOk?: boolean;
  // --- Intent block: read only by the AI pass, not the keyword scorer. These
  // capture what the candidate WANTS next (which the CV can't state) so Gemini
  // can judge fit in the ambiguous mid-range, not just skill overlap.
  careerGoal?: string;       // why looking now + what they want their next role to be
  careerMove?: string;       // "same-field" | "change-industry" | "change-function" | "step-up" | "returning" | "first-role"
  priorities?: string;       // what matters most, ideally ranked (comp, growth, WLB, mission…)
  workStyle?: string;        // IC vs manager, company size, team/context preferences
};

export type Strategy = {
  titleKeywords: string[];
  mustHaveKeywords: string[];
  niceToHaveKeywords: string[];
  // Terms used to build the scrape query. Falls back to CV-derived phrases when
  // the user gave no target titles. Optional for back-compat with stored strategies.
  searchKeywords?: string[];
  excludeKeywords: string[];
  locations: string[];
  excludeLocations: string[];
  minSalary?: number;
  currency?: string;
  seniority?: string;
  remoteOk: boolean;
  // AI-only signals. The keyword scorer ignores these; strategyDigest() surfaces
  // them to Gemini as free-text intent so it can weigh fit beyond skill overlap.
  intent?: {
    careerGoal?: string;
    careerMove?: string;
    priorities?: string;
    workStyle?: string;
  };
};

// Human-readable labels for the career-move enum, used in the AI prompt.
const CAREER_MOVE_LABELS: Record<string, string> = {
  "same-field": "staying in their current field",
  "change-industry": "changing to a new industry",
  "change-function": "changing function/role type",
  "step-up": "stepping up in seniority",
  returning: "returning to work after a break",
  "first-role": "seeking a first role / new graduate",
};

// Validation for the questionnaire body (H). Unknown keys are stripped and every
// free-text field is length-capped so callers can't stuff unbounded / unexpected
// JSON into the DB (a stored-XSS and DB-bloat vector). Keep in sync with Answers.
const optStr = (max: number) => z.string().max(max).optional();
export const AnswersSchema = z
  .object({
    targetTitles: optStr(500),
    skills: optStr(1000),
    industries: optStr(500),
    dealbreakers: optStr(1000),
    locations: optStr(500),
    excludeLocations: optStr(500),
    minSalary: optStr(50),
    currency: optStr(20),
    seniority: optStr(50),
    remoteOk: z.boolean().optional(),
    careerGoal: optStr(1000),
    careerMove: optStr(50),
    priorities: optStr(500),
    workStyle: optStr(500),
  })
  .strip() satisfies z.ZodType<Answers>;

export const ProfileBodySchema = z.object({
  answers: AnswersSchema.optional(),
  apifyKey: z.string().max(500).optional(),
});

const STOPWORDS = new Set(
  ("a an and are as at be by for from has have i in is it its of on or that the to was were will with " +
    "my me we our you your they their he she his her this these those able experience work working years " +
    "role responsible team teams company companies including etc using used will across within also new")
    .split(" ")
);

function splitList(s?: string): string[] {
  if (!s) return [];
  return s
    .split(/[,\n;/|]+/)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

// Extract confident keyphrases from CV text, most salient first. Unlike plain
// token counting, this also captures adjacent-word BIGRAMS ("product management",
// "machine learning", "data analysis") that single-token counting shattered into
// generic fragments. Bigrams are weighted higher (more specific), and a unigram
// already covered by a kept bigram is dropped to avoid double-counting.
function keyphrasesFromCv(cvText: string, limit = 24): string[] {
  if (!cvText) return [];
  const raw = new Map<string, number>(); // raw occurrence counts
  // Split on punctuation/newlines so bigrams don't span unrelated fragments.
  const segments = cvText.toLowerCase().split(/[.,\n;:|/•\t()[\]]+/);
  for (const seg of segments) {
    const words = (seg.match(/[a-z][a-z+.#-]{2,}/g) || []).filter((w) => !STOPWORDS.has(w));
    for (let i = 0; i < words.length; i++) {
      raw.set(words[i], (raw.get(words[i]) || 0) + 1);
      const next = words[i + 1];
      if (next && next !== words[i] && !STOPWORDS.has(next)) {
        const bigram = `${words[i]} ${next}`;
        raw.set(bigram, (raw.get(bigram) || 0) + 1);
      }
    }
  }
  // Require ≥2 occurrences for confidence (a term a real CV leans on recurs), and
  // rank by a bigram-weighted score so specific multi-word phrases surface first.
  const weight = (k: string, n: number) => n * (k.includes(" ") ? 2 : 1);
  return [...raw.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => weight(b[0], b[1]) - weight(a[0], a[1]))
    .slice(0, limit)
    .map(([k]) => k);
}

// Infer a seniority FLOOR from CV text, used only when the questionnaire leaves
// seniority blank. Deliberately conservative: it exists to stop clearly-senior
// candidates being shown intern/junior roles, and must NOT misfire on entry-level
// CVs. So it keys off unambiguous executive titles (unlikely in a junior CV) and
// otherwise stated years of experience — never soft words like "senior" or "lead"
// that appear innocently in a new grad's CV ("senior year", "club lead").
function seniorityFromCv(cvText: string): string | undefined {
  if (!cvText) return undefined;
  const t = cvText.toLowerCase();
  if (/\b(chief|c-level|vice president|vp|head of|director|principal)\b/.test(t)) return "director";
  let maxYears = 0;
  for (const m of t.matchAll(/(\d{1,2})\s*\+?\s*years?/g)) {
    const y = parseInt(m[1], 10);
    if (y > maxYears && y <= 50) maxYears = y;
  }
  if (maxYears >= 8) return "senior";
  if (maxYears >= 3) return "mid";
  return undefined;
}

export function buildStrategy(cvText: string, answers: Answers): Strategy {
  const titleKeywords = splitList(answers.targetTitles);
  const skills = splitList(answers.skills);
  const industries = splitList(answers.industries);
  const cvPhrases = keyphrasesFromCv(cvText);

  // Explicit questionnaire skills + industries are always primary must-haves.
  const explicitMust = Array.from(new Set([...skills, ...industries]));

  // Promote the strongest CV-derived phrases to must-have so the CV can actually
  // lift a matching job — previously the CV only fed nice-to-haves (max +10),
  // which couldn't clear the AI-review gate. The remainder stay nice-to-have.
  const cvMust = cvPhrases
    .filter((k) => !explicitMust.includes(k) && !titleKeywords.includes(k))
    .slice(0, 8);
  const mustHaveKeywords = Array.from(new Set([...explicitMust, ...cvMust]));

  const niceToHaveKeywords = cvPhrases.filter(
    (k) => !mustHaveKeywords.includes(k) && !titleKeywords.includes(k)
  );

  // Terms that drive the actual job scrape. Prefer the user's target titles;
  // otherwise fall back to the CV (bigrams first — they read like role names /
  // concrete skills) so a CV-only user isn't searched as a generic "manager".
  const cvBigrams = cvPhrases.filter((k) => k.includes(" "));
  const searchKeywords = titleKeywords.length
    ? titleKeywords
    : (cvBigrams.length ? cvBigrams : cvPhrases).slice(0, 6);

  const minSalary = answers.minSalary ? parseInt(answers.minSalary.replace(/[^\d]/g, ""), 10) : undefined;

  const careerMove = answers.careerMove?.trim();
  const intentEntries = {
    careerGoal: answers.careerGoal?.trim() || undefined,
    careerMove: (careerMove && CAREER_MOVE_LABELS[careerMove]) || undefined,
    priorities: answers.priorities?.trim() || undefined,
    workStyle: answers.workStyle?.trim() || undefined,
  };
  const intent = Object.values(intentEntries).some(Boolean) ? intentEntries : undefined;

  return {
    titleKeywords,
    mustHaveKeywords,
    niceToHaveKeywords,
    searchKeywords,
    excludeKeywords: splitList(answers.dealbreakers),
    locations: splitList(answers.locations),
    excludeLocations: splitList(answers.excludeLocations),
    minSalary: Number.isFinite(minSalary as number) ? minSalary : undefined,
    currency: answers.currency?.trim() || undefined,
    seniority: answers.seniority?.trim().toLowerCase() || seniorityFromCv(cvText) || undefined,
    remoteOk: !!answers.remoteOk,
    intent,
  };
}
