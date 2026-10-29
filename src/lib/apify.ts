import type { RawJob } from "./scoring";
import type { RemoteMode } from "./strategy";
import { countryName, fetchRemoteJobs } from "./remote";

// Calls an Apify actor synchronously and returns its dataset items.
// Uses the USER's own Apify token (passed in), never a shared key.
//
// Sources run in parallel, so one slow board can't eat the whole request: the
// run is capped at ACTOR_TIMEOUT_SECS on Apify's side (so it also stops billing)
// and the fetch is abandoned a little after that.
const ACTOR_TIMEOUT_SECS = 150;

// Apify's free plan allows 5 runs at once. A search starts up to 4, so a second
// search running at the same time (another tab) gets 402s for the overflow,
// which are refused instantly. Wait for slots to free up and try again.
const BUSY_RETRIES = 2;
const BUSY_WAIT_MS = 8000;

async function runActor(actorId: string, token: string, input: unknown): Promise<Item[]> {
  // run-sync-get-dataset-items waits for the run and returns items in one call.
  const url =
    `https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items` +
    `?token=${encodeURIComponent(token)}&timeout=${ACTOR_TIMEOUT_SECS}`;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout((ACTOR_TIMEOUT_SECS + 20) * 1000),
    });
    if (res.ok) return res.json();
    const body = await res.text();
    if (res.status === 402 && attempt < BUSY_RETRIES) {
      await new Promise((r) => setTimeout(r, BUSY_WAIT_MS));
      continue;
    }
    throw new Error(`Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

type Item = Record<string, unknown>;

// First non-empty string among the candidates (actor schemas drift; mappers list
// the documented field first and older/alternative names after it).
function str(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

const obj = (v: unknown): Item => (v && typeof v === "object" ? (v as Item) : {});

function joinParts(...parts: unknown[]): string | undefined {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const s = str(p);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      out.push(s);
    }
  }
  return out.length ? out.join(", ") : undefined;
}

// "RM 8,000 – 10,000 /month" from min/max/currency fields, for boards that don't
// give a ready-made salary string.
function salaryRange(min: unknown, max: unknown, currency: unknown, period?: unknown): string | undefined {
  const lo = typeof min === "number" && min > 0 ? min.toLocaleString("en") : undefined;
  const hi = typeof max === "number" && max > 0 ? max.toLocaleString("en") : undefined;
  if (!lo && !hi) return undefined;
  const range = lo && hi && lo !== hi ? `${lo} – ${hi}` : (lo ?? hi);
  const per = str(period)?.toLowerCase();
  return [str(currency), range].filter(Boolean).join(" ") + (per ? ` /${per}` : "");
}

const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v !== 0;

// Map a raw LinkedIn scraper item to our common RawJob shape.
// Primary keys are the documented output fields of
// worldunboxer/rapid-linkedin-scraper (snake_case). The camelCase/other
// fallbacks are kept so the mapper degrades gracefully if the actor's schema
// shifts or a different LinkedIn actor is swapped in.
export function mapLinkedIn(item: Item): RawJob {
  return {
    title: str(item.job_title, item.title, item.jobTitle),
    company: str(item.company_name, item.companyName, item.company),
    location: str(item.location),
    salary: str(item.salary_range, item.salary, item.salaryInfo),
    url: str(item.job_url, item.apply_url, item.jobUrl, item.link, item.url),
    source: "LinkedIn",
    description: str(item.job_description, item.description, item.descriptionText),
    // posted_date is a real date; time_posted is "5 days ago".
    postedDate: str(item.posted_date, item.time_posted, item.postedAt, item.postedDate),
  };
}

// SEEK-family boards (SEEK AU/NZ, JobStreet MY/SG, JobsDB TH/HK) share one
// backend, and blackfalcondata's actors for them share one output shape.
function mapSeekFamily(source: string) {
  return (item: Item): RawJob => ({
    // The listing's "New" badge comes glued to the title: "Engineer (C++)New".
    title: str(item.title, item.jobTitle)?.replace(/(?<=\S)New$/, "").trim(),
    company: str(item.company, item.companyName),
    // Suburb + state is what the radius filter geocodes best; `location` alone is
    // often just "Sydney NSW".
    location: joinParts(item.locationSuburb, item.location, item.jobLocation) ?? undefined,
    salary: str(item.salaryText, item.salary) ?? salaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency, item.salaryType),
    url: str(item.canonicalUrl, item.applyUrl, item.sourceUrl, item.url, item.jobUrl),
    source,
    description: str(item.description, item.jobDescription, item.teaser),
    postedDate: str(item.postedDate, item.listingDate),
  });
}

// valig/indeed-jobs-scraper. Location is structured and carries coordinates; we
// only trust them as a job position when an address or postcode is listed —
// otherwise they're the city centroid and the radius filter should treat the job
// as city-level (see geo.checkRadius).
export function mapIndeed(item: Item): RawJob {
  const loc = obj(item.location);
  const salary = obj(item.baseSalary);
  const addressLevel = !!str(loc.streetAddress, loc.postalCode);
  return {
    title: str(item.title),
    company: str(obj(item.employer).name, item.company),
    location: joinParts(loc.city, loc.admin1Code, loc.countryName) ?? str(item.location),
    salary: salaryRange(salary.min, salary.max, salary.currencyCode, salary.unitOfWork),
    url: str(item.url, item.jobUrl),
    source: "Indeed",
    description: str(obj(item.description).text, item.description),
    // When it went up on Indeed: re-listed ads keep their original datePublished
    // (months old), and Indeed's own date filter goes by this one.
    postedDate: str(item.dateOnIndeed, item.datePublished),
    geo: addressLevel && finite(loc.latitude) && finite(loc.longitude)
      ? { lat: loc.latitude as number, lon: loc.longitude as number }
      : undefined,
  };
}

export function mapBayt(item: Item): RawJob {
  return {
    title: str(item.title),
    company: str(item.company, item.companyName),
    location: str(item.location),
    salary: str(item.salaryText) ?? salaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency, item.salaryPeriod),
    url: str(item.url, item.applyUrl),
    source: "Bayt",
    description: str(item.description),
    postedDate: str(item.postedDate),
  };
}

export function mapGulfTalent(item: Item): RawJob {
  return {
    title: str(item.title),
    company: str(item.company, item.hiringCompany),
    location: str(item.location),
    // When the employer hides the salary, GulfTalent still returns a placeholder
    // ("1000 - 1001 AED") with salaryDisclosed: false. Showing or scoring that
    // would be wrong, so it's dropped.
    salary: item.salaryDisclosed === false
      ? undefined
      : str(item.salaryText) ?? salaryRange(item.salaryUsdMin, item.salaryUsdMax, "USD", item.salaryUsdPeriod),
    url: str(item.canonicalUrl, item.url),
    source: "GulfTalent",
    description: str(item.description),
    postedDate: str(item.postedAt),
  };
}

export function mapStepStone(item: Item): RawJob {
  return {
    title: str(item.title),
    company: str(item.company),
    location: str(item.location),
    salary: str(item.salaryText) ?? salaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency, item.salaryPeriod),
    url: str(item.canonicalUrl, item.portalUrl, item.url),
    source: "StepStone",
    description: str(item.description, item.textSnippet),
    postedDate: str(item.datePosted),
  };
}

// Totaljobs listings carry a postcode and `geo`, so these get exact distances.
export function mapTotaljobs(item: Item): RawJob {
  const geo = obj(item.geo);
  const lat = geo.lat ?? geo.latitude;
  const lon = geo.lon ?? geo.lng ?? geo.longitude;
  return {
    title: str(item.title),
    company: str(item.company),
    location: joinParts(item.location, item.postCode),
    salary: salaryRange(item.salaryMin, item.salaryMax, "£"),
    url: str(item.url, item.portalUrl),
    source: "Totaljobs",
    description: str(item.description, item.textSnippetCleaned, item.textSnippet),
    postedDate: str(item.datePosted),
    geo: str(item.postCode) && finite(lat) && finite(lon) ? { lat: lat as number, lon: lon as number } : undefined,
  };
}

export function mapWttj(item: Item): RawJob {
  return {
    title: str(item.title),
    company: str(item.companyName, item.company),
    location: joinParts(item.city, item.countryCode) ?? str(item.location),
    salary: salaryRange(item.salaryMin, item.salaryMax, item.salaryCurrency),
    url: str(item.url, item.applyUrl),
    source: "Welcome to the Jungle",
    description: str(item.description, item.descriptionText),
    postedDate: str(item.postedDate),
  };
}

export type SearchParams = {
  keywords: string;   // what to search for (usually the target titles)
  location: string;   // "Kuala Lumpur, Malaysia"
  // Resolved place, when known (see lib/geo.ts). countryCode picks which local
  // boards run; city is the board-friendly place name; center + radiusKm are
  // passed to boards that can filter by distance themselves.
  countryCode?: string;
  city?: string;
  center?: { lat: number; lon: number };
  radiusKm?: number;
  // How recent a posting must be, as a canonical "within N hours" value
  // (see lib/datePosted.ts). Each source maps it to its own date filter.
  postedWithinHours: number;
  maxResults: number;
  // Remote searches. remoteOk adds remote roles open to the user's country (from
  // Himalayas, see lib/remote.ts); remoteMode makes the search remote-only.
  // titles are the plain target titles, for boards without OR-query support.
  remoteOk?: boolean;
  remoteMode?: RemoteMode;
  titles?: string[];
};

type Source = {
  name: string;
  actor: string;
  countries: readonly string[] | "all";
  input: (p: SearchParams, cc: string) => Record<string, unknown>;
  map: (item: Item) => RawJob;
};

// Indeed's actor uses "uk", not ISO "gb".
const INDEED_COUNTRIES = [
  "ar", "au", "at", "bh", "be", "br", "ca", "cl", "cn", "co", "cr", "cz", "dk", "ec", "eg", "fi", "fr", "de", "gr", "hk",
  "hu", "in", "id", "ie", "il", "it", "jp", "kw", "lu", "my", "mx", "ma", "nl", "nz", "ng", "no", "om", "pk", "pa", "pe",
  "ph", "pl", "pt", "qa", "ro", "sa", "sg", "za", "kr", "es", "se", "ch", "tw", "th", "tr", "ua", "ae", "gb", "us", "uy",
  "ve", "vn",
] as const;

const BAYT_COUNTRIES = ["ae", "sa", "eg", "kw", "qa", "bh", "jo", "lb", "om", "iq", "ma"] as const;

// Smallest allowed board radius that still covers the user's radius (the radius
// filter trims the excess afterwards), capped at the board's largest option.
function boardRadius(km: number, allowed: number[]): string {
  return String(allowed.find((a) => a >= km) ?? allowed[allowed.length - 1]);
}

const place = (p: SearchParams) => p.city || p.location;

// ---- Date-posted translation -------------------------------------------------
// Boards expose the "posted within" window differently. Each helper maps our
// canonical hours onto one board's filter, snapping sub-day windows (4h/12h) to
// the narrowest bucket the board supports — only LinkedIn can honour hours
// exactly (its filter is seconds-based).

// LinkedIn: coarse buckets use the documented `posted_within` string; sub-day
// windows use `job_post_time` (seconds) for an exact cutoff.
function linkedInPosted(hours: number): Record<string, unknown> {
  if (hours < 24) return { job_post_time: String(hours * 3600) }; // schema type is string
  if (hours <= 24) return { posted_within: "Past 24 hours" };
  if (hours <= 168) return { posted_within: "Past Week" };
  return { posted_within: "Past Month" };
}

// Pick the smallest option that still covers the requested window (day-level
// boards). `allowed` is ascending; values are days.
function daysBucket(hours: number, allowed: number[]): number {
  const days = hours / 24;
  return allowed.find((d) => d >= days) ?? allowed[allowed.length - 1];
}

// Bayt only offers these three windows.
function baytPosted(hours: number): string {
  if (hours <= 24) return "past-24h"; // the actor's enum value, not "past-24-hours"
  if (hours <= 168) return "past-week";
  return "past-month";
}

// Common blackfalcondata inputs: full descriptions (the scorer and AI read them),
// as plain text only. Sort order and the date window are set per source.
const DETAIL = { includeDetails: true, descriptionFormat: "text" } as const;

export const SOURCES: Source[] = [
  {
    name: "LinkedIn",
    actor: "worldunboxer/rapid-linkedin-scraper",
    countries: "all",
    // The actor renamed `job_title` → `jobs_titles` (a list, one search per entry)
    // and its `job_post_time` now takes seconds, so the old inputs were silently
    // ignored. One entry keeps the OR query as a single search, and cost flat.
    input: (p) => ({
      jobs_titles: [p.keywords],
      location: p.location,
      ...linkedInPosted(p.postedWithinHours),
      jobs_entries: Math.max(10, p.maxResults), // the actor rejects fewer than 10
    }),
    map: mapLinkedIn,
  },
  {
    name: "Indeed",
    actor: "valig/indeed-jobs-scraper",
    countries: INDEED_COUNTRIES,
    input: (p, cc) => ({
      title: p.keywords,
      location: place(p),
      country: cc === "gb" ? "uk" : cc,
      limit: p.maxResults,
      datePosted: String(daysBucket(p.postedWithinHours, [1, 3, 7, 14])),
    }),
    map: mapIndeed,
  },
  {
    name: "JobStreet",
    actor: "blackfalcondata/jobstreet-scraper",
    countries: ["my", "sg", "id", "ph"],
    // Pass the requested city/region too, so the scrape is constrained to the
    // user's location instead of returning the entire country (which is why a
    // "Kuala Lumpur" search surfaced Penang and Pahang roles).
    input: (p, cc) => ({ query: p.keywords, country: cc.toUpperCase(), location: place(p), maxResults: p.maxResults, sortMode: "date", dateRange: String(daysBucket(p.postedWithinHours, [1, 3, 7, 14, 31])), ...DETAIL }),
    map: mapSeekFamily("JobStreet"),
  },
  {
    name: "SEEK",
    actor: "blackfalcondata/seek-scraper",
    countries: ["au", "nz"],
    input: (p, cc) => ({ query: p.keywords, country: cc.toUpperCase(), location: place(p), maxResults: p.maxResults, sortMode: "date", dateRange: String(daysBucket(p.postedWithinHours, [1, 3, 7, 14, 31])), includeApplicantInsights: false, ...DETAIL }),
    map: mapSeekFamily("SEEK"),
  },
  {
    name: "JobsDB",
    actor: "blackfalcondata/jobsdb-scraper",
    countries: ["th", "hk"],
    input: (p, cc) => ({ query: p.keywords, country: cc.toUpperCase(), location: place(p), maxResults: p.maxResults, sortMode: "date", dateRange: String(daysBucket(p.postedWithinHours, [1, 3, 7, 14, 31])), ...DETAIL }),
    map: mapSeekFamily("JobsDB"),
  },
  {
    name: "Bayt",
    actor: "blackfalcondata/bayt-scraper",
    countries: BAYT_COUNTRIES,
    input: (p, cc) => ({
      query: p.keywords,
      country: cc.toUpperCase(),
      location: place(p),
      maxResults: p.maxResults,
      sortBy: "date",
      datePosted: baytPosted(p.postedWithinHours),
      // Bayt filters by distance itself when given a centre point.
      ...(p.radiusKm && p.center
        ? { searchRadiusKm: Math.ceil(p.radiusKm), searchLatitude: String(p.center.lat), searchLongitude: String(p.center.lon) }
        : {}),
      ...DETAIL,
    }),
    map: mapBayt,
  },
  {
    name: "GulfTalent",
    actor: "blackfalcondata/gulftalent-scraper",
    countries: ["ae", "sa", "qa", "kw", "bh", "om"],
    input: (p, cc) => ({
      query: p.keywords,
      country: cc.toUpperCase(),
      location: place(p),
      maxResults: p.maxResults,
      maxAgeMinutes: p.postedWithinHours * 60,
      // GulfTalent also filters by distance itself when given a centre point.
      ...(p.radiusKm && p.center
        ? { searchRadiusKm: Math.ceil(p.radiusKm), searchLatitude: p.center.lat, searchLongitude: p.center.lon }
        : {}),
      ...DETAIL,
    }),
    map: mapGulfTalent,
  },
  {
    name: "StepStone",
    actor: "blackfalcondata/stepstone-de-scraper",
    countries: ["de", "at", "be"],
    input: (p, cc) => ({
      query: p.keywords,
      country: cc,
      location: place(p),
      maxResults: p.maxResults,
      sort: "date",
      age: daysBucket(p.postedWithinHours, [1, 3, 7, 14, 30]),
      ...(p.radiusKm ? { radius: boardRadius(p.radiusKm, [5, 10, 20, 30, 40, 50, 75, 100, 150, 200]) } : {}),
      ...DETAIL,
    }),
    map: mapStepStone,
  },
  {
    name: "Totaljobs",
    actor: "blackfalcondata/totaljobs-scraper",
    countries: ["gb"],
    input: (p) => ({
      query: p.keywords,
      location: place(p),
      maxResults: p.maxResults,
      sort: "date",
      age: daysBucket(p.postedWithinHours, [1, 3, 7, 14, 30]),
      // Totaljobs searches in MILES and only honours up to 30.
      ...(p.radiusKm ? { radius: boardRadius(p.radiusKm / 1.609, [5, 10, 20, 30]) } : {}),
      ...DETAIL,
    }),
    map: mapTotaljobs,
  },
  {
    name: "Welcome to the Jungle",
    actor: "blackfalcondata/wttj-scraper",
    countries: ["fr"],
    input: (p) => ({ query: p.keywords, location: place(p), maxResults: p.maxResults, sortBy: "date", ...DETAIL }),
    map: mapWttj,
  },
];

// Best-effort country from free text when the location couldn't be geocoded —
// keeps the original MY/SG JobStreet routing working without a geocoder.
function guessCountry(location: string): string | undefined {
  if (/singapore|\bsg\b/i.test(location)) return "sg";
  if (/malaysia|kuala lumpur|\bmy\b/i.test(location)) return "my";
  return undefined;
}

// Which Apify sources run for a country: LinkedIn always; the rest only where
// they cover that market. Remote-only searches skip the local boards (they're
// mostly on-site and can't filter to remote): "remote" keeps Indeed, which
// searches remote roles within one country; "nomad" needs none — its roles come
// from Himalayas (lib/remote.ts), which is free and not an Apify actor.
export function sourcesFor(countryCode: string | undefined, remoteMode?: RemoteMode): Source[] {
  const cc = countryCode?.toLowerCase();
  const covers = (s: Source) => s.countries === "all" || (!!cc && (s.countries as readonly string[]).includes(cc));
  if (remoteMode === "nomad") return [];
  if (remoteMode === "remote") return SOURCES.filter((s) => s.name === "Indeed" && covers(s));
  return SOURCES.filter(covers);
}

// Runs the sources for the user's country in parallel with the user's token and
// returns a flat RawJob[]. A failing board is logged and skipped; the search only
// fails when every board does.
export async function scrapeJobs(token: string, params: SearchParams): Promise<RawJob[]> {
  const cc = params.countryCode?.toLowerCase() ?? guessCountry(params.location);
  const sources = sourcesFor(cc, params.remoteMode);
  // Remote-only: boards search "remote" within the user's country, not a city.
  const boardParams: SearchParams = params.remoteMode
    ? { ...params, location: "remote", city: "remote", radiusKm: undefined, center: undefined }
    : params;
  const remoteLabel = `Remote — ${countryName(cc) ?? "your country"}`;
  const runs = sources.map(async (s) => {
    const jobs = (await runActor(s.actor, token, s.input(boardParams, cc ?? ""))).map(s.map);
    // Mark them so the radius filter treats them as remote, not as a city.
    return params.remoteMode ? jobs.map((j) => (/\bremote\b/i.test(j.location ?? "") ? j : { ...j, location: remoteLabel, geo: undefined })) : jobs;
  });
  const remote =
    params.remoteOk || params.remoteMode
      ? fetchRemoteJobs({
          titles: params.titles?.length ? params.titles : [params.keywords],
          countryCode: cc,
          mode: params.remoteMode,
          postedWithinHours: params.postedWithinHours,
          maxResults: params.maxResults,
        })
      : Promise.resolve([]);
  const [settled, remoteJobs] = await Promise.all([Promise.allSettled(runs), remote]);

  const results: RawJob[] = [...remoteJobs];
  const errors: string[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") results.push(...r.value.filter((j) => j.title));
    else errors.push(`${sources[i].name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  if (errors.length) console.warn("[apify] some sources failed:", errors.join(" | "));
  console.log(
    `[apify] cc=${cc ?? "?"} remote=${params.remoteMode ?? (params.remoteOk ? "also" : "no")} ` +
      `sources=${sources.map((s) => s.name).join(",")} himalayas=${remoteJobs.length} jobs=${results.length}`
  );

  if (!results.length && errors.length) {
    throw new Error(errors.join(" | "));
  }
  return results;
}
