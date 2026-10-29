import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { checkRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { scrapeJobs } from "@/lib/apify";
import { scoreJob } from "@/lib/scoring";
import { geminiRescore, type ScoredJob } from "@/lib/ai";
import { apifyBudgetAvailable, recordApifySearch } from "@/lib/budget";
import type { Strategy } from "@/lib/strategy";
import { geocode, checkRadius, isBarePostcode, type GeoPoint } from "@/lib/geo";
import { normalizePostedWithinHours } from "@/lib/datePosted";

export const maxDuration = 300; // scraping can be slow

function fingerprint(title = "", company = "", location = ""): string {
  return createHash("sha1").update(`${title}|${company}|${location}`.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Two layers: a per-user cap (below) so one account can't spam the scrape, and
  // a per-IP cap (no userId in the key) so one network can't amplify cost by
  // rotating through disposable guest accounts.
  if (!(await checkRateLimit(req, "searchIp"))) {
    return NextResponse.json(
      { error: "Too many searches from your network. Please wait a few minutes before trying again." },
      { status: 429 }
    );
  }
  if (!(await checkRateLimit(req, "search", userId))) {
    return NextResponse.json(
      { error: "Search is rate-limited. Please wait a few minutes before trying again." },
      { status: 429 }
    );
  }

  // Per-user daily scrape cap: bounds total Apify actor runs an account can
  // trigger in a day (the sliding-window limit above only bounds burst rate).
  // Guards against a leaked/shared Apify key or runaway usage burning the user's
  // credit. Disabled unless APIFY_DAILY_SEARCH_BUDGET is set.
  if (!(await apifyBudgetAvailable(userId))) {
    return NextResponse.json(
      { error: "You've reached today's search limit. Please try again tomorrow." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { apifyKeyEnc: true } });
  const profile = await prisma.profile.findUnique({ where: { userId } });

  if (!user?.apifyKeyEnc) {
    return NextResponse.json({ error: "Add your Apify API key on the Profile page first." }, { status: 400 });
  }
  if (!profile?.strategy) {
    return NextResponse.json({ error: "Complete your profile (CV + questionnaire) first." }, { status: 400 });
  }

  const strategy = profile.strategy as unknown as Strategy;
  const token = decrypt(user.apifyKeyEnc);

  // How recent a posting must be, chosen on the dashboard. Defaults to 24 hours
  // when the body is absent or the value isn't one of the allowed options.
  const body = await req.json().catch(() => ({}));
  const postedWithinHours = normalizePostedWithinHours((body as Record<string, unknown>).postedWithinHours);

  // Build the search query from the user's target titles, falling back to
  // CV-derived phrases (searchKeywords) so a CV-only profile isn't scraped as a
  // generic "manager". Older stored strategies may predate searchKeywords.
  const queryTerms = strategy.searchKeywords?.length
    ? strategy.searchKeywords
    : strategy.titleKeywords;
  const titleGroup = queryTerms.length ? queryTerms.slice(0, 6).join(" OR ") : "manager";
  // Fold the user's explicit skills/industries into the query so the scrape is
  // biased toward their domain from the start, instead of pulling every job with
  // a matching title (e.g. every "Sales Manager" in the country) and leaving the
  // keyword + AI passes to reject the off-domain majority. These are appended as
  // extra relevance terms (job boards treat them as a soft ranking boost, not a
  // hard AND), so a thin domain vocabulary can't zero out the results.
  const domainTerms = (strategy.coreKeywords ?? []).slice(0, 3);
  const keywords = domainTerms.length ? `${titleGroup} ${domainTerms.join(" ")}` : titleGroup;
  // Scrape a single location only — one city or country. Extra locations are ignored.
  let location = strategy.locations[0] ?? "Remote";

  // Optional radius filter: resolve the user's suburb/postcode to a point first, so
  // a bad location fails fast before any Apify credit is spent. Job boards don't
  // understand postcodes or small suburbs, so the scrape uses the resolved city.
  let center: GeoPoint | null = null;
  // A remote-only search has no commute, so a radius doesn't apply to it.
  const radiusKm = strategy.remoteMode ? undefined : strategy.radiusKm;
  if (radiusKm) {
    const centerQuery = strategy.radiusCenter ?? strategy.locations[0];
    if (!centerQuery) {
      return NextResponse.json({ error: "Add a suburb or postcode on the Profile page to search by radius." }, { status: 400 });
    }
    if (isBarePostcode(centerQuery)) {
      return NextResponse.json(
        { error: `Add the country to your postcode (e.g. "${centerQuery} Australia") — the same postcode exists in many countries.` },
        { status: 400 }
      );
    }
    center = await geocode(centerQuery);
    if (!center) {
      return NextResponse.json(
        { error: `Couldn't find "${centerQuery}" on the map. Try adding the city or country (e.g. "Bangsar, Kuala Lumpur").` },
        { status: 400 }
      );
    }
    location = center.area;
  }
  // The country decides which local boards run alongside LinkedIn (SEEK for AU,
  // Bayt for the UAE, ...) and which remote roles the user may take ("remote,
  // Malaysia only"). Without a radius that needs one lookup of its own.
  const placeQuery = strategy.radiusCenter ?? strategy.locations[0];
  const place = center ?? (placeQuery ? await geocode(placeQuery) : null);

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
    console.error("[search] scrape failed:", e);
    return NextResponse.json(
      { error: "Scraping failed. Check that your Apify key is valid and try again." },
      { status: 502 }
    );
  }
  // Count this scrape against the user's daily budget only once the actor run(s)
  // actually happened (a failed scrape above returns early and isn't charged).
  await recordApifySearch(userId);

  // Score + drop excluded, then de-dupe within this batch.
  // With a radius, jobs outside it (or too vaguely located to tell) are dropped.
  //
  // The same vacancy is often on several boards with differently written
  // locations ("Sydney NSW" vs "Sydney, New South Wales, Australia"), so the
  // cross-board key is title + company only, and the copy with the fullest
  // description wins (it gives the scorer and the AI the most to read).
  raw.sort((a, b) => (b.description?.length ?? 0) - (a.description?.length ?? 0));
  const seen = new Set<string>();
  const sameJobKey = (t = "", c = "") => `${t}|${c}`.toLowerCase().replace(/[^\p{L}\p{N}|]+/gu, "");
  let scored: ScoredJob[] = [];
  let outsideRadius = 0;
  for (const job of raw) {
    // With a radius, the distance check below is the location test. The scorer's
    // text match ("does the job say 47800?") would wrongly dock -15 from jobs
    // inside the radius, so it's switched off for this search.
    const result = scoreJob(job, center ? { ...strategy, locations: [] } : strategy);
    if (result.excluded) continue;
    const fp = fingerprint(job.title, job.company ?? "", job.location ?? "");
    const key = sameJobKey(job.title, job.company);
    if (seen.has(fp) || seen.has(key)) continue;
    seen.add(fp);
    seen.add(key);
    if (center && radiusKm) {
      const verdict = await checkRadius(job.location, center, radiusKm, { remoteOk: strategy.remoteOk, coords: job.geo });
      if (!verdict.keep) {
        outsideRadius++;
        continue;
      }
      result.reasons = [...result.reasons, verdict.reason];
    }
    scored.push({ ...job, ...result });
  }

  // Gemini deep-read pass: reads the top keyword-scored JDs against the CV +
  // questionnaire and fills aiScore/aiSummary on them. No-op until GEMINI_API_KEY
  // is set (then keyword scores stand alone). Skipped entirely when the user chose
  // keyword-only matching — their CV is never sent to the model.
  const keywordMode = strategy.matchMode === "keywords";
  const rescore = keywordMode
    ? { jobs: scored, stats: { gated: 0, reviewed: 0, aiTokens: 0 } }
    : await geminiRescore(scored, strategy, profile.cvText ?? "");
  scored = rescore.jobs;

  // Upsert into the DB (skip ones this user already has).
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

  // Two-stage funnel telemetry.
  //
  // The headline saving is DETERMINISTIC and quota-proof: of `raw.length` scraped
  // jobs, only `gated` cleared the keyword gate and were shown to the model — the
  // rest were judged by zero-token code. filteredPct is that architectural filter
  // and does not depend on how many AI calls actually succeeded (rate limits can
  // suppress `aiReviewed` without changing what the architecture sends).
  const { gated, aiTokens } = rescore.stats;
  const filteredPct = raw.length > 0 ? Math.round((1 - gated / raw.length) * 100) : 0;
  // Measured per-successful-call cost — flat and independent of run size (the
  // whole point of stateless scoring). Averaged over calls that returned usage.
  const tokensPerJob = aiReviewed > 0 ? Math.round(aiTokens / aiReviewed) : 0;

  console.log(
    `[search] funnel: scraped=${raw.length} kept=${scored.length} outsideRadius=${outsideRadius} gated=${gated} ` +
      `filtered≈${filteredPct}% aiReviewed=${aiReviewed} aiTokens=${aiTokens} tokensPerJob≈${tokensPerJob}`
  );

  return NextResponse.json({
    ok: true,
    mode: keywordMode ? "keywords" : "ai",
    scraped: raw.length,
    kept: scored.length,
    outsideRadius,
    radiusKm: radiusKm ?? null,
    saved: added,
    gated,
    filteredPct,
    aiReviewed,
    strongFit,
    aiTokens,
    tokensPerJob,
  });
}
