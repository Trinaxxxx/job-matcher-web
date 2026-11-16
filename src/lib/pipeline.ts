import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/crypto";
import { scrapeJobs } from "@/lib/apify";
import { scoreJob } from "@/lib/scoring";
import { geminiRescore, type ScoredJob } from "@/lib/ai";
import { recordApifySearch } from "@/lib/budget";
import type { Strategy } from "@/lib/strategy";
import { geocode, checkRadius, isBarePostcode, type GeoPoint } from "@/lib/geo";

// ---------------------------------------------------------------------------
// SEARCH PIPELINE
//
// The scrape → score → rescore → persist orchestration, extracted from the
// /api/search route so it can run in a background queue worker AND (later) from
// a scheduled job, with one code path. The route now just validates + enqueues;
// this module does the work and reports progress via `onProgress` so the caller
// can persist run status.
//
// Behaviour is unchanged from the original synchronous route — only the shell
// around it (who calls it, how progress is surfaced) is new.
// ---------------------------------------------------------------------------

export interface SearchParams {
  postedWithinHours: number;
}

export interface SearchStats {
  scraped: number;
  kept: number;
  outsideRadius: number;
  radiusKm: number | null;
  gated: number;
  filteredPct: number;
  aiReviewed: number;
  strongFit: number;
  aiTokens: number;
  tokensPerJob: number;
  saved: number;
  mode: "keywords" | "ai";
}

export type SearchStage = "scraping" | "scoring" | "reviewing" | "persisting";

export type ProgressFn = (
  stage: SearchStage,
  partial?: Partial<SearchStats>
) => void | Promise<void>;

// A failure the user should see verbatim (bad postcode, missing config). The
// worker records the message on the run; the enqueue path can also throw these
// for its own cheap pre-checks.
export class SearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchError";
  }
}

function fingerprint(title = "", company = "", location = ""): string {
  return createHash("sha1").update(`${title}|${company}|${location}`.toLowerCase()).digest("hex");
}

// Cheap, synchronous-ish validation the enqueue path runs so a bad request fails
// fast with a 400 instead of spawning a background run that just fails. Returns
// the loaded strategy + decrypted token so the caller doesn't re-fetch.
export async function precheckSearch(
  userId: string
): Promise<{ strategy: Strategy; token: string; cvText: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { apifyKeyEnc: true } });
  const profile = await prisma.profile.findUnique({ where: { userId } });

  if (!user?.apifyKeyEnc) {
    throw new SearchError("Add your Apify API key on the Profile page first.");
  }
  if (!profile?.strategy) {
    throw new SearchError("Complete your profile (CV + questionnaire) first.");
  }

  const strategy = profile.strategy as unknown as Strategy;
  const radiusKm = strategy.remoteMode ? undefined : strategy.radiusKm;
  if (radiusKm) {
    const centerQuery = strategy.radiusCenter ?? strategy.locations[0];
    if (!centerQuery) {
      throw new SearchError("Add a suburb or postcode on the Profile page to search by radius.");
    }
    if (isBarePostcode(centerQuery)) {
      throw new SearchError(
        `Add the country to your postcode (e.g. "${centerQuery} Australia") — the same postcode exists in many countries.`
      );
    }
  }

  return { strategy, token: decrypt(user.apifyKeyEnc), cvText: profile.cvText ?? "" };
}

/**
 * Run the full search pipeline for a user and return the funnel stats. Throws
 * SearchError for user-facing failures; any other throw is an unexpected error.
 */
export async function runSearchPipeline(
  userId: string,
  params: SearchParams,
  onProgress: ProgressFn = () => {}
): Promise<SearchStats> {
  const { strategy, token, cvText } = await precheckSearch(userId);
  const { postedWithinHours } = params;

  // Build the search query from the user's target titles, falling back to
  // CV-derived phrases (searchKeywords) so a CV-only profile isn't scraped as a
  // generic "manager". Older stored strategies may predate searchKeywords.
  const queryTerms = strategy.searchKeywords?.length ? strategy.searchKeywords : strategy.titleKeywords;
  const titleGroup = queryTerms.length ? queryTerms.slice(0, 6).join(" OR ") : "manager";
  const domainTerms = (strategy.coreKeywords ?? []).slice(0, 3);
  const keywords = domainTerms.length ? `${titleGroup} ${domainTerms.join(" ")}` : titleGroup;
  let location = strategy.locations[0] ?? "Remote";

  // Optional radius filter: resolve the user's suburb/postcode to a point first.
  let center: GeoPoint | null = null;
  const radiusKm = strategy.remoteMode ? undefined : strategy.radiusKm;
  if (radiusKm) {
    const centerQuery = strategy.radiusCenter ?? strategy.locations[0];
    // precheckSearch already guaranteed centerQuery exists and isn't a bare postcode.
    center = await geocode(centerQuery!);
    if (!center) {
      throw new SearchError(
        `Couldn't find "${centerQuery}" on the map. Try adding the city or country (e.g. "Bangsar, Kuala Lumpur").`
      );
    }
    location = center.area;
  }
  const placeQuery = strategy.radiusCenter ?? strategy.locations[0];
  const place = center ?? (placeQuery ? await geocode(placeQuery) : null);

  // ---- scrape --------------------------------------------------------------
  await onProgress("scraping");
  let raw;
  try {
    raw = await scrapeJobs(token, {
      keywords,
      location,
      countryCode: place?.countryCode,
      city: place?.city,
      center: center ?? undefined,
      radiusKm,
      postedWithinHours,
      maxResults: 20,
      remoteOk: strategy.remoteOk,
      remoteMode: strategy.remoteMode,
      titles: queryTerms.slice(0, 3),
    });
  } catch (e) {
    console.error("[pipeline] scrape failed:", e);
    throw new SearchError("Scraping failed. Check that your Apify key is valid and try again.");
  }
  // Count this scrape against the user's daily budget only once it actually happened.
  await recordApifySearch(userId);

  // ---- score + dedupe + radius --------------------------------------------
  await onProgress("scoring", { scraped: raw.length });
  raw.sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0));
  const seen = new Set<string>();
  const sameJobKey = (t = "", c = "") => `${t}|${c}`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, "");
  let scored: ScoredJob[] = [];
  let outsideRadius = 0;
  for (const job of raw) {
    const result = scoreJob(job, center ? { ...strategy, locations: [] } : strategy);
    if (result.excluded) continue;
    const fp = fingerprint(job.title, job.company ?? "", job.location ?? "");
    const key = sameJobKey(job.title, job.company);
    if (seen.has(fp) || seen.has(key)) continue;
    seen.add(fp);
    seen.add(key);
    if (center && radiusKm) {
      const verdict = await checkRadius(job.location, center, radiusKm, {
        remoteOk: strategy.remoteOk,
        coords: job.geo,
      });
      if (!verdict.keep) {
        outsideRadius++;
        continue;
      }
      result.reasons = [...result.reasons, verdict.reason];
    }
    scored.push({ ...job, ...result });
  }

  // ---- AI deep-read pass ---------------------------------------------------
  const keywordMode = strategy.matchMode === "keywords";
  await onProgress("reviewing", { kept: scored.length, outsideRadius });
  const rescore = keywordMode
    ? { jobs: scored, stats: { gated: 0, reviewed: 0, aiTokens: 0 } }
    : await geminiRescore(scored, strategy, cvText);
  scored = rescore.jobs;

  // ---- persist -------------------------------------------------------------
  await onProgress("persisting");
  let added = 0;
  for (const job of scored) {
    const fp = fingerprint(job.title, job.company ?? "", job.location ?? "");
    try {
      await prisma.job.upsert({
        where: { userId_fingerprint: { userId, fingerprint: fp } },
        create: {
          userId,
          fingerprint: fp,
          title: job.title ?? "(untitled)",
          company: job.company,
          location: job.location,
          salary: job.salary,
          url: job.url,
          source: job.source,
          description: job.description,
          postedDate: job.postedDate,
          score: job.score,
          tier: job.tier,
          reasons: job.reasons,
          aiScored: job.aiScored ?? false,
          aiScore: job.aiScore ?? null,
          aiSummary: job.aiSummary ?? null,
        },
        update: {
          score: job.score,
          tier: job.tier,
          reasons: job.reasons,
          aiScored: job.aiScored ?? false,
          aiScore: job.aiScore ?? null,
          aiSummary: job.aiSummary ?? null,
        },
      });
      added++;
    } catch {
      /* ignore individual write errors */
    }
  }

  const aiReviewed = scored.filter((j) => j.aiScored).length;
  const strongFit = scored.filter((j) => (j.aiScore ?? -1) >= 85).length;
  const { gated, aiTokens } = rescore.stats;
  const filteredPct = raw.length > 0 ? Math.round((1 - gated / raw.length) * 100) : 0;
  const tokensPerJob = aiReviewed > 0 ? Math.round(aiTokens / aiReviewed) : 0;

  console.log(
    `[pipeline] funnel: scraped=${raw.length} kept=${scored.length} outsideRadius=${outsideRadius} gated=${gated} ` +
      `filtered≈${filteredPct}% aiReviewed=${aiReviewed} aiTokens=${aiTokens} tokensPerJob≈${tokensPerJob}`
  );

  return {
    mode: keywordMode ? "keywords" : "ai",
    scraped: raw.length,
    kept: scored.length,
    outsideRadius,
    radiusKm: radiusKm ?? null,
    gated,
    filteredPct,
    aiReviewed,
    strongFit,
    aiTokens,
    tokensPerJob,
    saved: added,
  };
}
