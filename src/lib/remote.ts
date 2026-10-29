// Remote roles: who can actually take them.
//
// A "remote" ad is rarely open to everyone — most are "remote, US only" or
// "remote within Europe". This module fetches remote roles from Himalayas, whose
// free public API states each job's allowed countries (empty = worldwide), and
// keeps only the ones the user can take from where they live.
//
// Himalayas' API terms (himalayas.app/api): free, no key; the Apply link must be
// the job's `applicationLink` unchanged and Himalayas must be shown as the source
// (we store it as the job URL and source). Its own `country` filter is unreliable
// (for some countries it returns unfiltered results), so eligibility is always
// re-checked here from `locationRestrictions`.

import type { RawJob } from "./scoring";
import type { RemoteMode } from "./strategy";

export const REMOTE_MODE_OPTIONS: { value: "" | RemoteMode; label: string }[] = [
  { value: "", label: "Local jobs + remote roles open to my country" },
  { value: "remote", label: "Remote only — roles open to my country" },
  { value: "nomad", label: "Worldwide remote only (digital nomad)" },
];

const API = "https://himalayas.app/jobs/api/search";
const USER_AGENT = process.env.GEOCODER_USER_AGENT || "job-matcher-web/0.1";

// English country name for an ISO alpha-2 code ("my" → "Malaysia"), the form
// Himalayas uses in locationRestrictions.
export function countryName(cc: string | undefined): string | undefined {
  if (!cc) return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc.toUpperCase());
  } catch {
    return undefined;
  }
}

// Names a country also goes by in job ads.
const ALIASES: Record<string, string[]> = {
  us: ["united states", "usa", "us"],
  gb: ["united kingdom", "uk", "great britain", "england"],
  ae: ["united arab emirates", "uae"],
  kr: ["south korea", "korea"],
  ru: ["russia", "russian federation"],
  cz: ["czechia", "czech republic"],
  nl: ["netherlands", "the netherlands", "holland"],
};

// Can someone living in `cc` take a remote job restricted to `restrictions`?
// Empty = open worldwide. In nomad mode only worldwide roles qualify.
export function remoteEligible(restrictions: string[], cc: string | undefined, mode?: RemoteMode): boolean {
  if (!restrictions.length) return true;
  if (mode === "nomad" || !cc) return false;
  const names = new Set([...(ALIASES[cc.toLowerCase()] ?? []), countryName(cc)?.toLowerCase()].filter(Boolean));
  return restrictions.some((r) => names.has(r.trim().toLowerCase()));
}

// "Worldwide", "Anywhere", "Remote — Global": the only free-text locations that
// mean work-from-anywhere (used for remote ads from boards without structured
// restrictions, in nomad mode).
export const isWorldwideText = (s: string | undefined) => /\b(?:worldwide|anywhere|global(?:ly)?|world)\b/i.test(s ?? "");

const stripHtml = (html: string) =>
  html
    .replace(/<(?:br|\/p|\/li|\/h\d)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

type HimalayasJob = {
  title?: string;
  companyName?: string;
  minSalary?: number | null;
  maxSalary?: number | null;
  currency?: string | null;
  salaryPeriod?: string | null;
  locationRestrictions?: (string | { name?: string })[];
  description?: string;
  excerpt?: string;
  pubDate?: number;
  applicationLink?: string;
  guid?: string;
};

const restrictionNames = (job: HimalayasJob) =>
  (job.locationRestrictions ?? []).map((r) => (typeof r === "string" ? r : r?.name ?? "")).filter(Boolean);

export function mapHimalayas(job: HimalayasJob): RawJob {
  const where = restrictionNames(job);
  const lo = job.minSalary ? job.minSalary.toLocaleString("en") : undefined;
  const hi = job.maxSalary ? job.maxSalary.toLocaleString("en") : undefined;
  const range = lo && hi && lo !== hi ? `${lo} – ${hi}` : (lo ?? hi);
  return {
    title: job.title,
    company: job.companyName,
    // "Remote" keeps the radius filter from trying to place it on a map.
    location: where.length ? `Remote — ${where.join(", ")}` : "Remote — Worldwide",
    salary: range ? [job.currency, range].filter(Boolean).join(" ") + (job.salaryPeriod ? ` /${job.salaryPeriod}` : "") : undefined,
    url: job.applicationLink ?? job.guid,
    source: "Himalayas",
    description: job.description ? stripHtml(job.description) : job.excerpt,
    postedDate: job.pubDate ? new Date(job.pubDate * 1000).toISOString() : undefined,
  };
}

async function search(params: Record<string, string>): Promise<HimalayasJob[]> {
  const res = await fetch(`${API}?${new URLSearchParams(params)}`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Himalayas failed (${res.status})`);
  const body = (await res.json()) as { jobs?: HimalayasJob[] };
  return body.jobs ?? [];
}

// Remote roles for the user's titles that they can take from `countryCode`
// (or worldwide-only in nomad mode), posted within the window. Free; never
// throws — a failure just means no remote roles from this source.
export async function fetchRemoteJobs(opts: {
  titles: string[];
  countryCode?: string;
  mode?: RemoteMode;
  postedWithinHours: number;
  maxResults: number;
}): Promise<RawJob[]> {
  const cc = opts.countryCode?.toLowerCase();
  const since = Date.now() / 1000 - opts.postedWithinHours * 3600;
  const seen = new Set<string>();
  const out: RawJob[] = [];
  try {
    for (const q of opts.titles.slice(0, 3)) {
      // Worldwide roles, plus (outside nomad mode) roles restricted to the user's
      // country. Sorted newest first so the date window cuts cleanly.
      const queries: Record<string, string>[] = [{ q, worldwide: "true", sort: "recent" }];
      if (opts.mode !== "nomad" && cc) queries.push({ q, country: cc.toUpperCase(), exclude_worldwide: "true", sort: "recent" });
      for (const params of queries) {
        for (const job of await search(params)) {
          const key = job.guid ?? job.applicationLink ?? `${job.title}|${job.companyName}`;
          if (seen.has(key) || (job.pubDate ?? 0) < since) continue;
          if (!remoteEligible(restrictionNames(job), cc, opts.mode)) continue;
          seen.add(key);
          out.push(mapHimalayas(job));
        }
      }
      if (out.length >= opts.maxResults) break;
    }
  } catch (e) {
    console.warn("[remote] Himalayas lookup failed:", e);
  }
  return out.slice(0, opts.maxResults);
}
