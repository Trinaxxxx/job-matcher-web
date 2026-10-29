// Keyword-mode setup via the user's own AI chatbot. The app never sends the CV
// anywhere in keyword mode; instead the user copies KEYWORD_PROMPT into ChatGPT /
// Claude / Gemini etc. along with their CV, answers its questions, and pastes the
// JSON reply back. parseKeywordImport() turns that reply into questionnaire
// Answers. Pure and dependency-light so it runs in the browser and in tests.
//
// SECURITY: the pasted text is untrusted (it may be a "keyword pack" from a
// stranger, or a chatbot steered by hidden text in a CV template). It is only
// ever JSON.parse'd — never evaluated — and only a fixed allowlist of fields is
// read out of it. Every value is cleaned to a plain-text character allowlist and
// capped, and the server re-validates with AnswersSchema regardless.

import type { Answers } from "./strategy";
import { currencyInfo, normalizeCurrency, parseSalaryFloor } from "./salary";

export { parseSalaryFloor };

export const KEYWORD_FORMAT = "job-matcher-keywords/v1";

export const KEYWORD_PROMPT = `You are helping me set up a job-matching app that does NOT use AI to read job ads. It only checks whether each job's title and description contain certain words. Your job is to choose those words well, from my CV and my answers.

HOW THE APP MATCHES (choose words with these rules in mind):
- Case-insensitive, whole words/phrases only: "sql" matches "SQL" but not "PostgreSQL"; "java" does not match "JavaScript".
- A phrase must appear exactly: "product manager" will NOT match "product management", and "month end close" will NOT match "month end closing". Add the common variants, synonyms, abbreviations and spelling differences recruiters use (e.g. "accounts payable", "ap/ar", "ifrs").
- includeAll: the job is DROPPED unless it contains EVERY word here. Use 0-2 items, only for true non-negotiables (e.g. a licence or core language). Each extra item removes many good jobs.
- includeAny: the job is DROPPED unless it contains AT LEAST ONE of these; more matches rank it higher. Use 10-30 specific skills, tools, domain terms and their variants from my CV.
- excludeAny: the job is DROPPED if it contains ANY of these ANYWHERE in the ad. Only use phrases that would never appear in a job I'd want (e.g. "commission only", "night shift", "internship"). Do NOT put industries I want to avoid here: ads often mention other industries in passing ("we serve manufacturing clients"), which would wrongly drop good jobs.
- Never use generic words found in almost every ad: team, communication, experience, skills, work, management (on its own), company, opportunity.
- targetTitles: 2-6 job titles. They become the job-board search query.

STEPS:
1. If I haven't shared my CV yet, ask me to paste it or attach it.
2. Read it, then ask me up to 7 short numbered questions in ONE message, e.g.: which roles I'm targeting; my location (one city or country) and whether remote is OK; seniority level; industries to target; hard dealbreakers; minimum salary, its currency, and whether that is per month or per year; skills I want to use more or stop using.
3. After my answers, reply with ONLY one code block in exactly this format (plain JSON, double quotes, lowercase keywords, no comments, leave a field as "" or [] if unknown, minSalary as a single number with no range, currency as a 3-letter code like MYR, AUD, EUR):

\`\`\`json
{
  "format": "${KEYWORD_FORMAT}",
  "targetTitles": ["...", "..."],
  "location": "city or country",
  "remoteOk": true,
  "excludeLocations": [],
  "seniority": "intern | junior | mid | senior | lead | director",
  "minSalary": "",
  "currency": "",
  "salaryPeriod": "month | year",
  "includeAll": [],
  "includeAny": ["...", "..."],
  "excludeAny": ["...", "..."]
}
\`\`\`

I will paste that code block back into the app.`;

// A ready-made message the user can send back to their chatbot when its reply
// couldn't be read.
export const KEYWORD_FIX_MESSAGE = `Please send your final answer again as ONE code block of plain JSON in exactly the format from my first message: double quotes, no comments, nothing cut off, and the field names spelled exactly as given (targetTitles, includeAll, includeAny, excludeAny).`;

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

// Zero-width and bidi-control characters: invisible, so a keyword carrying one
// silently never matches (and bidi overrides can disguise what's displayed).
const INVISIBLE = /[­​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// Control characters except \t \n \r (comment stripping needs the line breaks;
// keyword cleaning collapses all whitespace afterwards anyway).
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

// Plain-text allowlist for keywords/titles: letters and digits in any script,
// plus the punctuation real skill names use (c++, c#, node.js, ap/ar, r&d,
// month-end, women's, (acca)). Anything else becomes a space.
const KEYWORD_CHARS = /[^\p{L}\p{M}\p{N} &/+.#'()-]/gu;

const MAX_ITEM_CHARS = 60;
const MAX_ITEMS = 60;

function cleanText(s: string): string {
  return s.normalize("NFKC").replace(INVISIBLE, "").replace(CONTROL, " ");
}

function cleanKeyword(s: string): string {
  return cleanText(s).replace(KEYWORD_CHARS, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

type ListOutcome = { items: string[]; tooLong: number; overCount: number; overCap: number };

function cleanList(v: unknown, capChars: number): ListOutcome {
  const raw = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\n;]+/) : [];
  const seen = new Set<string>();
  const items: string[] = [];
  let tooLong = 0;
  let overCount = 0;
  let overCap = 0;
  for (const x of raw) {
    if (typeof x !== "string" && typeof x !== "number") continue;
    const k = cleanKeyword(String(x));
    if (!k || seen.has(k)) continue;
    seen.add(k);
    if (k.length > MAX_ITEM_CHARS) { tooLong++; continue; }
    if (items.length >= MAX_ITEMS) { overCount++; continue; }
    // Same total caps as AnswersSchema in strategy.ts, joined with ", ".
    if ([...items, k].join(", ").length > capChars) { overCap++; continue; }
    items.push(k);
  }
  return { items, tooLong, overCount, overCap };
}

const SENIORITY_WORDS: [RegExp, string][] = [
  [/\b(director|head|vp|vice president|chief|executive director)\b/, "director"],
  [/\b(lead|principal|staff)\b/, "lead"],
  [/\b(senior|sr|manager)\b/, "senior"],
  [/\b(mid|intermediate|experienced)\b/, "mid"],
  [/\b(junior|jr|entry|graduate|associate)\b/, "junior"],
  [/\b(intern|internship|trainee)\b/, "intern"],
];

function normalizeSeniority(v: unknown): string | undefined {
  const s = cleanText(String(v ?? "")).toLowerCase();
  for (const [re, level] of SENIORITY_WORDS) if (re.test(s)) return level;
  return undefined;
}

// ---------------------------------------------------------------------------
// Finding the JSON in a pasted reply
// ---------------------------------------------------------------------------

// Remove // line and /* block */ comments outside strings, so "http://x" in a
// string survives.
function stripComments(s: string): string {
  let out = "";
  let inStr: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      out += c;
      if (c === "\\") { out += s[++i] ?? ""; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"') { inStr = c; out += c; continue; }
    if (c === "/" && s[i + 1] === "/") { while (i < s.length && s[i] !== "\n") i++; out += "\n"; continue; }
    if (c === "/" && s[i + 1] === "*") { const end = s.indexOf("*/", i + 2); i = end < 0 ? s.length : end + 1; continue; }
    out += c;
  }
  return out;
}

// The span from the first "{" to its matching "}", counting braces outside
// strings. `cutOff` = a "{" was found but never closed (half-copied reply).
function objectSpan(s: string): { body?: string; cutOff: boolean } {
  const start = s.indexOf("{");
  if (start < 0) return { cutOff: false };
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return { body: s.slice(start, i + 1), cutOff: false };
  }
  return { cutOff: true };
}

function tryParse(candidate: string): { value?: unknown; cutOff: boolean } {
  let s = cleanText(candidate).replace(/[“”„″]/g, '"').replace(/[‘’]/g, "'");
  // Python-style dicts: only when there are no double quotes at all, so an
  // apostrophe inside a real JSON string ("women's") is never rewritten.
  if (!s.includes('"')) s = s.replace(/'/g, '"');
  s = stripComments(s);
  const { body, cutOff } = objectSpan(s);
  if (!body) return { cutOff };
  try {
    return { value: JSON.parse(body.replace(/,\s*([}\]])/g, "$1")), cutOff: false };
  } catch {
    return { cutOff: false };
  }
}

// Field names chatbots use, normalized (lowercase, letters only) → our field.
const KEY_ALIASES: Record<string, keyof Fields> = {
  format: "format",
  targettitles: "targetTitles", titles: "targetTitles", jobtitles: "targetTitles", targetroles: "targetTitles",
  location: "location", locations: "location", city: "location",
  remoteok: "remoteOk", remote: "remoteOk",
  excludelocations: "excludeLocations", avoidlocations: "excludeLocations",
  seniority: "seniority", level: "seniority", senioritylevel: "seniority",
  minsalary: "minSalary", salary: "minSalary", minimumsalary: "minSalary",
  currency: "currency",
  salaryperiod: "salaryPeriod", period: "salaryPeriod", payperiod: "salaryPeriod",
  includeall: "includeAll", mustincludeall: "includeAll", required: "includeAll", requiredkeywords: "includeAll",
  includeany: "includeAny", mustincludeany: "includeAny", keywords: "includeAny", includekeywords: "includeAny",
  excludeany: "excludeAny", exclude: "excludeAny", excludekeywords: "excludeAny", dealbreakers: "excludeAny",
};

type Fields = {
  format: unknown; targetTitles: unknown; location: unknown; remoteOk: unknown; excludeLocations: unknown;
  seniority: unknown; minSalary: unknown; currency: unknown; salaryPeriod: unknown; includeAll: unknown; includeAny: unknown; excludeAny: unknown;
};

// Read only known fields (case/spelling-tolerant). If none are at the top level,
// look one level down for a wrapper like {"keywords": {...}} or {"config": {...}}.
function pickFields(v: unknown, depth = 0): Partial<Fields> | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const out: Partial<Fields> = {};
  let found = 0;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const field = KEY_ALIASES[k.toLowerCase().replace(/[^a-z]/g, "")];
    // A nested object under "keywords" is a wrapper, not the include list.
    if (!field || (val && typeof val === "object" && !Array.isArray(val))) continue;
    if (out[field] === undefined) { out[field] = val; found++; }
  }
  const hasKeywordData = ["targetTitles", "includeAll", "includeAny", "excludeAny"].some(
    (k) => out[k as keyof Fields] !== undefined
  );
  if (hasKeywordData || depth > 0) return found ? out : undefined;
  for (const val of Object.values(v as Record<string, unknown>)) {
    const inner = pickFields(val, depth + 1);
    if (inner) return inner;
  }
  return found ? out : undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type KeywordImportCounts = { includeAll: number; includeAny: number; excludeAny: number; titles: number };

export type KeywordImportError = { ok: false; kind: "not-found" | "cut-off" | "unreadable" | "empty"; error: string };

export type KeywordImportResult =
  | { ok: true; answers: Partial<Answers>; counts: KeywordImportCounts; warnings: string[] }
  | KeywordImportError;

export function parseKeywordImport(pasted: string): KeywordImportResult {
  // Try every fenced block, LAST first (chatbots often show an example before
  // the final answer), then the whole paste for replies without fences.
  const fenced = [...pasted.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)].map((m) => m[1]).reverse();
  let sawCutOff = false;
  let sawObject = false;
  let fields: Partial<Fields> | undefined;
  for (const candidate of [...fenced, pasted]) {
    const { value, cutOff } = tryParse(candidate);
    sawCutOff ||= cutOff;
    if (value === undefined) continue;
    sawObject = true;
    fields = pickFields(value);
    if (fields) break;
  }

  if (!fields) {
    if (sawObject) {
      return { ok: false, kind: "empty", error: "The reply was readable, but none of the expected fields (targetTitles, includeAny, includeAll, excludeAny) were in it." };
    }
    if (sawCutOff) {
      return { ok: false, kind: "cut-off", error: "The reply looks cut off — the closing } is missing. Copy the whole code block, from { to }." };
    }
    if (/[{}]/.test(pasted)) {
      return { ok: false, kind: "unreadable", error: "Found a code block, but it isn't valid JSON (it may have a typo or extra text inside it)." };
    }
    return { ok: false, kind: "not-found", error: "Couldn't find a code block in what you pasted. Paste your AI chat's final reply, including the part from { to }." };
  }

  const warnings: string[] = [];
  const answers: Partial<Answers> = { matchMode: "keywords" };

  const format = typeof fields.format === "string" ? fields.format.trim() : "";
  if (format && format !== KEYWORD_FORMAT) {
    warnings.push("This reply was made with a different version of the prompt. Check the fields carefully before applying.");
  }

  const caps = { targetTitles: 500, excludeLocations: 500, includeAll: 500, includeAny: 2000, excludeAny: 1000 } as const;
  let tooLong = 0;
  let trimmed = 0;
  for (const k of Object.keys(caps) as (keyof typeof caps)[]) {
    if (fields[k] === undefined) continue;
    const r = cleanList(fields[k], caps[k]);
    answers[k] = r.items.join(", ");
    tooLong += r.tooLong;
    trimmed += r.overCount + r.overCap;
  }
  if (tooLong) warnings.push(`${tooLong} ${tooLong === 1 ? "keyword was" : "keywords were"} longer than ${MAX_ITEM_CHARS} characters and left out.`);
  if (trimmed) warnings.push(`${trimmed} extra ${trimmed === 1 ? "keyword was" : "keywords were"} left out to fit the length limit.`);

  if (fields.location !== undefined) {
    const loc = cleanText(String(fields.location)).replace(/[^\p{L}\p{M}\p{N} ,.'()-]/gu, " ").replace(/\s+/g, " ").trim();
    if (loc) answers.locations = loc.slice(0, 500);
  }
  if (fields.remoteOk !== undefined) {
    answers.remoteOk = fields.remoteOk === true || /^(true|yes|y|hybrid|remote)$/i.test(String(fields.remoteOk).trim());
  }
  if (fields.seniority !== undefined && String(fields.seniority).trim()) {
    const level = normalizeSeniority(fields.seniority);
    if (level) answers.seniority = level;
    else warnings.push(`Seniority "${cleanKeyword(String(fields.seniority)).slice(0, 40)}" wasn't recognised, so it was left unchanged. Pick it under Search preferences.`);
  }
  if (fields.minSalary !== undefined && String(fields.minSalary).trim()) {
    const floor = parseSalaryFloor(fields.minSalary);
    if (floor) answers.minSalary = String(floor);
    else warnings.push("The minimum salary couldn't be read, so it was left unchanged.");
  }
  if (fields.currency !== undefined && String(fields.currency).trim()) {
    const code = normalizeCurrency(cleanText(String(fields.currency)));
    if (code) answers.currency = code;
    else warnings.push("The currency wasn't recognised, so it was left unchanged. Pick it under Search preferences.");
  }
  if (fields.salaryPeriod !== undefined && String(fields.salaryPeriod).trim()) {
    const p = String(fields.salaryPeriod).toLowerCase();
    if (/year|annual|annum/.test(p)) answers.salaryPeriod = "year";
    else if (/month/.test(p)) answers.salaryPeriod = "month";
  }
  // No period given: assume how salaries are usually quoted in that currency.
  if (answers.minSalary && !answers.salaryPeriod) {
    answers.salaryPeriod = currencyInfo(answers.currency)?.period ?? "month";
  }

  const count = (s?: string) => (s ? s.split(",").filter((x) => x.trim()).length : 0);
  const counts = {
    includeAll: count(answers.includeAll),
    includeAny: count(answers.includeAny),
    excludeAny: count(answers.excludeAny),
    titles: count(answers.targetTitles),
  };
  if (!counts.includeAll && !counts.includeAny && !counts.excludeAny && !counts.titles) {
    return { ok: false, kind: "empty", error: "The reply had no keywords in it. Ask your AI chat to fill in the lists." };
  }
  if (counts.includeAll > 2) {
    warnings.push(`${counts.includeAll} "must contain all" words is very strict — a job missing any one is dropped. Consider moving some to "at least one".`);
  }
  if (!counts.includeAny && !counts.includeAll) {
    warnings.push(`No words to look for, so every job that passes your other filters will be kept.`);
  }
  return { ok: true, answers, counts, warnings };
}
