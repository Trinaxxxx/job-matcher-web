// Turns a user's CV text + questionnaire answers into a deterministic scoring
// "strategy". This is the generalized, per-user replacement for the hardcoded
// strategy.md in the local Python tool — it works for any job seeker.

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
};

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
  };
}
