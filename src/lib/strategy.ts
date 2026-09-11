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
  // The user's EXPLICITLY stated skills + industries only (no CV-derived phrases).
  // This is the strongest domain signal, so the keyword scorer penalizes jobs that
  // hit none of these. Kept separate from mustHaveKeywords, which also folds in
  // noisier CV keyphrases that shouldn't gate the domain guard. Optional for
  // back-compat with strategies stored before this field existed.
  coreKeywords?: string[];
  // The user's EXPLICITLY stated preferred industries only (a subset of
  // coreKeywords). Kept separate so the scorer can enforce INDUSTRY relevance
  // distinctly from skill overlap: a job may match a generic skill yet sit in a
  // plainly wrong sector. Optional for back-compat with strategies stored before
  // this field existed.
  industryKeywords?: string[];
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
  // The candidate's DEMONSTRATED seniority, inferred from the CV — distinct from
  // `seniority`, which is what they WANT (and may be aspirational). Used by the
  // scorer as the ceiling reference so a role far above what the CV evidences is
  // down-ranked even when the candidate's desired level is higher. Optional for
  // back-compat with strategies stored before this field existed.
  cvSeniority?: string;
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

// Nouns that typically end a job title. Used to pick out role-title phrases from
// CV keyphrases so a blank "target titles" answer can fall back to the role the
// candidate actually holds / is looking for.
const ROLE_NOUNS = new Set(
  ("manager engineer developer analyst designer consultant director lead leader specialist coordinator " +
    "administrator officer executive associate architect scientist nurse teacher accountant technician " +
    "supervisor strategist planner recruiter marketer writer editor researcher advisor controller auditor " +
    "buyer trader agent representative assistant clerk operator therapist practitioner")
    .split(" ")
);

function isRoleTitle(phrase: string): boolean {
  const words = phrase.split(" ");
  return ROLE_NOUNS.has(words[words.length - 1]);
}

// Geography — cities, countries, and regions that recur in a CV (three job
// locations here) and would otherwise surface as bogus "skills" or titles.
// A phrase is a geo if it exactly matches one of these; kept as a suggestion
// filter only, and the user has a dedicated Location field for the real thing.
const GEO_TERMS = new Set(
  ("kuala lumpur malaysia singapore penang selangor johor putrajaya dubai abu dhabi " +
    "uae emirates qatar saudi riyadh hong kong shanghai beijing shenzhen jakarta " +
    "bangkok manila hanoi vietnam thailand indonesia philippines cambodia myanmar " +
    "india mumbai bangalore delhi china japan tokyo korea seoul taiwan australia sydney " +
    "melbourne london europe germany france netherlands usa canada " +
    "asia apac sea emea anz")
    .split(" ")
);
// Multi-word geos would be shattered by the space split above; add them whole.
for (const g of ["kuala lumpur", "abu dhabi", "hong kong", "united states", "southeast asia", "south east asia", "middle east"]) {
  GEO_TERMS.add(g);
}

function isGeo(phrase: string): boolean {
  return GEO_TERMS.has(phrase.trim().toLowerCase());
}

// Contact-info fragments that glue onto real words when a CV line has no spaces
// between email/phone/section text (e.g. "…gmail.com…EXECUTIVE SUMMARY"). They
// must never become title qualifiers.
const CONTACT_FRAGMENTS = new Set(
  "com org net www gmail yahoo hotmail outlook http https tel mob mobile email phone fax".split(" ")
);

// A word that must not appear inside a suggested title: geography (it has its own
// field), a contact-info fragment, or a token carrying non-letters (digits, "+",
// "@") left over from glued email/phone text.
function badTitleWord(w: string): boolean {
  return isGeo(w) || CONTACT_FRAGMENTS.has(w) || !/^[a-z][a-z-]*$/.test(w);
}

// Title nouns that BEGIN a title when followed by "of" ("head of business
// development", "director of sales", "chief of staff").
const TITLE_LEADING = new Set(["head", "director", "chief", "vice", "vp", "president"]);
// Title nouns that END a title ("investment manager", "solutions architect",
// "chief revenue officer"). Superset of ROLE_NOUNS with a few C-suite endings.
const TITLE_TRAILING = new Set([...ROLE_NOUNS, "president", "founder", "principal", "officer"]);

// Pull one-off JOB TITLES out of a CV. Unlike keyphrasesFromCv (which needs a
// term to RECUR to be confident), titles appear once each — in headings and the
// summary — so recurrence can't find them. Instead we scan each punctuation-
// delimited segment for two shapes: a leading anchor + "of" ("head of business
// development") and a trailing role noun with up to two preceding qualifiers
// ("investment operations manager"), stopping at stopword/geo boundaries so
// phrases don't bleed across unrelated words. First-appearance order is kept.
function titlesFromCv(cvText: string, limit = 6): string[] {
  if (!cvText) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (phrase: string) => {
    const p = phrase.trim();
    // Require ≥2 words (drops bare "manager"), ≤4 words, and no geography.
    const wc = p.split(" ").length;
    if (wc < 2 || wc > 4 || isGeo(p) || seen.has(p)) return;
    seen.add(p);
    out.push(p);
  };
  // Split on the same delimiters as keyphrasesFromCv, plus "&" so
  // "Trading & Investment Operations Manager" splits into its two titles.
  const segments = cvText.toLowerCase().split(/[.,\n;:|/•\t()[\]&]+/);
  for (const seg of segments) {
    // 2+ chars (unlike keyphrasesFromCv's 3+) so the "of" in "head of X" survives
    // tokenizing; it's a stopword, so it never becomes a title qualifier itself.
    const words = seg.match(/[a-z][a-z+.#-]+/g) || [];
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      // Leading anchor: "head of X [Y]" — take up to 3 words after "of".
      if (TITLE_LEADING.has(w) && words[i + 1] === "of") {
        const tail: string[] = [];
        for (let j = i + 2; j < words.length && tail.length < 3; j++) {
          if (STOPWORDS.has(words[j]) || badTitleWord(words[j])) break;
          tail.push(words[j]);
        }
        if (tail.length) add(`${w} of ${tail.join(" ")}`);
      }
      // Trailing role noun: take up to 2 preceding non-stopword qualifiers,
      // stopping at the first stopword so we don't cross clause boundaries.
      if (TITLE_TRAILING.has(w)) {
        const pre: string[] = [];
        for (let j = i - 1; j >= 0 && pre.length < 2; j--) {
          if (STOPWORDS.has(words[j]) || badTitleWord(words[j])) break;
          pre.unshift(words[j]);
        }
        if (pre.length) add(`${pre.join(" ")} ${w}`);
      }
      if (out.length >= limit) return out;
    }
  }
  return out;
}

// Many CVs open with "Name" then a professional headline/tagline line right
// underneath it ("Enterprise Sales & Partnerships | Payments, E-Invoicing & ERP
// Ecosystems") before any contact info or section heading — this is the
// candidate's own framing of their role and often the single strongest title
// signal, but it won't match ROLE_NOUNS (no "manager"/"director" etc.) and
// won't recur, so neither keyphrasesFromCv nor titlesFromCv can find it. Scan
// the first few non-empty lines (skipping the name line) for one that reads
// like a headline rather than contact info, and take its first clause.
function headlineTitleFromCv(cvText: string): string | undefined {
  if (!cvText) return undefined;
  const lines = cvText.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5);
  for (const line of lines.slice(1, 4)) {
    if (/[@]|\d{3,}/.test(line)) continue; // an email or phone/address line, not a headline
    const clause = line.split(/[|•\-–]/)[0].trim();
    const words = (clause.toLowerCase().match(/[a-z][a-z-]*/g) || []).filter(
      (w) => !STOPWORDS.has(w) && !badTitleWord(w)
    );
    if (words.length >= 2 && words.length <= 5) return words.slice(0, 4).join(" ");
  }
  return undefined;
}

// People commonly name their CV file after the role they're applying for
// ("Dinesshwaran_Yoogan_Senior Sales Manager.pdf"), which is often a stronger,
// more current signal than anything inside the document (a CV body describes
// past jobs; the filename states the one they're targeting NOW). Split on the
// separators used to join filename parts and return the first segment that
// reads like a title (ends in — or contains — a recognized role noun) rather
// than a person's name.
function titleFromFileName(fileName?: string): string | undefined {
  if (!fileName) return undefined;
  const base = fileName.replace(/\.[a-z0-9]+$/i, ""); // strip extension
  const segments = base.split(/[_\-]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const words = (seg.toLowerCase().match(/[a-z][a-z-]*/g) || []).filter((w) => !badTitleWord(w));
    if (words.length < 2 || words.length > 5) continue;
    if (words.some((w) => TITLE_TRAILING.has(w))) return words.join(" ");
  }
  return undefined;
}

// Neutralize prompt-injection / jailbreak content in user free-text before it is
// ever concatenated into the Gemini prompt or the Apify scrape query. The length
// caps in AnswersSchema stop bulk stuffing; this strips the *shape* of an attack:
// conversational role markers ("system:", "assistant:"), markdown/code fences the
// model might treat as instruction blocks, and control characters. It is
// deliberately conservative — it removes structural injection tokens, not ordinary
// words, so a genuine answer like "manage assistant onboarding" is untouched.
// This does NOT make the text trusted; ai.ts still fences it as untrusted data.
export function sanitizeUserText(s?: string): string {
  if (!s) return "";
  return s
    // Strip control chars (except \n and \t) that can smuggle hidden instructions.
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, " ")
    // Drop markdown/code fences and HTML-ish angle brackets used to frame blocks.
    .replace(/```+/g, " ")
    .replace(/[<>]/g, " ")
    // Defang line-leading role markers used to fake a new turn in the transcript.
    .replace(/^\s*(system|assistant|user|developer|tool)\s*:/gim, "$1 -")
    // Collapse the classic "ignore/disregard previous instructions" lead-in so it
    // reads as inert words rather than a directive.
    .replace(/\b(ignore|disregard|forget|override)\b(\s+(all|any|the|previous|prior|above|these|those|earlier))+/gi, "[redacted]")
    .replace(/[^\S\n]+/g, " ")
    .trim();
}

function splitList(s?: string): string[] {
  if (!s) return [];
  return sanitizeUserText(s)
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

// Common industry/domain terms to look for in a CV. Industries are hard to
// derive from raw keyphrase counts (they rarely repeat as tidy phrases the way
// skills do), so instead we scan for these known terms. Multi-word entries are
// matched as substrings, so "supply chain" or "oil and gas" hit too. This is a
// suggestion aid only — the user picks which ones actually apply.
export const INDUSTRY_TERMS = [
  "fintech", "banking", "insurance", "healthcare", "pharmaceutical", "biotech",
  "medical", "saas", "software", "e-commerce", "ecommerce", "retail", "logistics",
  "supply chain", "manufacturing", "automotive", "aerospace", "telecommunications",
  "telecom", "media", "advertising", "marketing", "gaming", "education", "edtech",
  "government", "public sector", "nonprofit", "energy", "oil and gas", "renewable",
  "construction", "real estate", "property", "hospitality", "travel", "tourism",
  "food and beverage", "fmcg", "consulting", "legal", "agriculture", "mining",
  "transportation", "aviation", "cybersecurity", "blockchain", "crypto",
];

// Keyword suggestions pulled from a CV to prefill the questionnaire — the same
// deterministic extraction buildStrategy() uses, exposed for the UI so a user
// can click to add rather than type from scratch. Nothing here is committed on
// the user's behalf; it only powers the "from your CV" chips.
export type CvSuggestions = { titles: string[]; skills: string[]; industries: string[] };

export function suggestFromCv(cvText: string, fileName?: string): CvSuggestions {
  const phrases = keyphrasesFromCv(cvText, 40);
  // Titles, most confident signal first: the role stated in the FILE NAME (a CV
  // body describes past jobs; a filename like "Jane_Doe_Senior Sales Manager.pdf"
  // states the role the candidate is targeting right now — the strongest signal
  // available), then the candidate's own headline/tagline (if the CV has one),
  // then one-off titles stated in headings/summary, then any recurring
  // role-title bigrams the keyphrase pass also found. Geos are already excluded
  // by titleFromFileName/titlesFromCv/headlineTitleFromCv; also guard the
  // recurring set.
  const fileTitle = titleFromFileName(fileName);
  const headline = headlineTitleFromCv(cvText);
  const titles = Array.from(
    new Set([
      ...(fileTitle ? [fileTitle] : []),
      ...(headline ? [headline] : []),
      ...titlesFromCv(cvText, 6),
      ...phrases.filter((k) => isRoleTitle(k) && !isGeo(k)),
    ])
  ).slice(0, 6);
  const titleSet = new Set(titles);
  const lower = (cvText || "").toLowerCase();
  const industries = INDUSTRY_TERMS.filter((t) => lower.includes(t)).slice(0, 8);
  const industrySet = new Set(industries);

  // Skills: the remaining keyphrases, bigrams first (they read like concrete
  // skills/tools). Drop titles, industry terms, and geography (offered under
  // their own fields, or not a skill at all), and drop any unigram already
  // covered by a kept bigram so we don't show "stakeholder" and "management"
  // next to "stakeholder management".
  const skills: string[] = [];
  const covered = new Set<string>();
  const bigramFirst = [...phrases].sort((a, b) => Number(b.includes(" ")) - Number(a.includes(" ")));
  for (const k of bigramFirst) {
    if (titleSet.has(k) || industrySet.has(k) || isGeo(k)) continue;
    if (!k.includes(" ") && covered.has(k)) continue;
    skills.push(k);
    if (k.includes(" ")) for (const w of k.split(" ")) covered.add(w);
    if (skills.length >= 12) break;
  }
  return { titles, skills, industries };
}

export function buildStrategy(cvText: string, answers: Answers): Strategy {
  const skills = splitList(answers.skills);
  const industries = splitList(answers.industries);
  const cvPhrases = keyphrasesFromCv(cvText);

  // Target titles: use the user's answer, else fall back to the role-title
  // phrases in the CV (the role they hold / are looking for), most salient first.
  const explicitTitles = splitList(answers.targetTitles);
  const cvRoleTitles = cvPhrases.filter(isRoleTitle);
  const titleKeywords = explicitTitles.length ? explicitTitles : cvRoleTitles.slice(0, 3);

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

  // The intent free-text fields go straight into the Gemini prompt (via
  // strategyDigest) without passing through splitList, so sanitize them here to
  // strip injection shapes. careerMove is a closed enum mapped to a fixed label,
  // so it needs no sanitizing.
  const careerMove = answers.careerMove?.trim();
  const intentEntries = {
    careerGoal: sanitizeUserText(answers.careerGoal) || undefined,
    careerMove: (careerMove && CAREER_MOVE_LABELS[careerMove]) || undefined,
    priorities: sanitizeUserText(answers.priorities) || undefined,
    workStyle: sanitizeUserText(answers.workStyle) || undefined,
  };
  const intent = Object.values(intentEntries).some(Boolean) ? intentEntries : undefined;

  return {
    titleKeywords,
    mustHaveKeywords,
    coreKeywords: explicitMust,
    industryKeywords: industries,
    niceToHaveKeywords,
    searchKeywords,
    excludeKeywords: splitList(answers.dealbreakers),
    locations: splitList(answers.locations),
    excludeLocations: splitList(answers.excludeLocations),
    minSalary: Number.isFinite(minSalary as number) ? minSalary : undefined,
    currency: answers.currency?.trim() || undefined,
    seniority: answers.seniority?.trim().toLowerCase() || seniorityFromCv(cvText) || undefined,
    remoteOk: !!answers.remoteOk,
    cvSeniority: seniorityFromCv(cvText),
    intent,
  };
}
