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

// Pull supplementary keywords from CV text: frequent, meaningful multi-char tokens.
function keywordsFromCv(cvText: string, limit = 20): string[] {
  if (!cvText) return [];
  const counts = new Map<string, number>();
  const tokens = cvText.toLowerCase().match(/[a-z][a-z+.#-]{2,}/g) || [];
  for (const t of tokens) {
    if (STOPWORDS.has(t)) continue;
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

export function buildStrategy(cvText: string, answers: Answers): Strategy {
  const titleKeywords = splitList(answers.targetTitles);
  const skills = splitList(answers.skills);
  const industries = splitList(answers.industries);
  const cvKeywords = keywordsFromCv(cvText);

  // must-haves: explicit skills + industries (strong signal from the user).
  const mustHaveKeywords = Array.from(new Set([...skills, ...industries]));

  // nice-to-haves: CV-derived terms not already listed explicitly.
  const niceToHaveKeywords = cvKeywords.filter(
    (k) => !mustHaveKeywords.includes(k) && !titleKeywords.includes(k)
  );

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
    excludeKeywords: splitList(answers.dealbreakers),
    locations: splitList(answers.locations),
    excludeLocations: splitList(answers.excludeLocations),
    minSalary: Number.isFinite(minSalary as number) ? minSalary : undefined,
    currency: answers.currency?.trim() || undefined,
    seniority: answers.seniority?.trim().toLowerCase() || undefined,
    remoteOk: !!answers.remoteOk,
    intent,
  };
}
