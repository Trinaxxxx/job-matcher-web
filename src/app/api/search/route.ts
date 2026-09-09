import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { checkRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { scrapeJobs } from "@/lib/apify";
import { scoreJob } from "@/lib/scoring";
import { geminiRescore, type ScoredJob } from "@/lib/ai";
import type { Strategy } from "@/lib/strategy";

export const maxDuration = 300; // scraping can be slow

function fingerprint(title = "", company = "", location = ""): string {
  return createHash("sha1").update(`${title}|${company}|${location}`.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(req, "search", userId))) {
    return NextResponse.json(
      { error: "Search is rate-limited. Please wait a few minutes before trying again." },
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

  // Build the search query from the user's target titles, falling back to
  // CV-derived phrases (searchKeywords) so a CV-only profile isn't scraped as a
  // generic "manager". Older stored strategies may predate searchKeywords.
  const queryTerms = strategy.searchKeywords?.length
    ? strategy.searchKeywords
    : strategy.titleKeywords;
  const keywords = queryTerms.length ? queryTerms.slice(0, 6).join(" OR ") : "manager";
  // Scrape a single location only — one city or country. Extra locations are ignored.
  const location = strategy.locations[0] ?? "Remote";

  let raw;
  try {
    raw = await scrapeJobs(token, { keywords, location, maxResults: 20 });
  } catch (e) {
    console.error("[search] scrape failed:", e);
    return NextResponse.json(
      { error: "Scraping failed. Check that your Apify key is valid and try again." },
      { status: 502 }
    );
  }

  // Score + drop excluded, then de-dupe within this batch.
  const seen = new Set<string>();
  let scored: ScoredJob[] = [];
  for (const job of raw) {
    const result = scoreJob(job, strategy);
    if (result.excluded) continue;
    const fp = fingerprint(job.title, job.company ?? "", job.location ?? "");
    if (seen.has(fp)) continue;
    seen.add(fp);
    scored.push({ ...job, ...result });
  }

  // Gemini deep-read pass: reads the top keyword-scored JDs against the CV +
  // questionnaire and fills aiScore/aiSummary on them. No-op until GEMINI_API_KEY
  // is set (then keyword scores stand alone).
  const rescore = await geminiRescore(scored, strategy, profile.cvText ?? "");
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
    `[search] funnel: scraped=${raw.length} kept=${scored.length} gated=${gated} ` +
      `filtered≈${filteredPct}% aiReviewed=${aiReviewed} aiTokens=${aiTokens} tokensPerJob≈${tokensPerJob}`
  );

  return NextResponse.json({
    ok: true,
    scraped: raw.length,
    kept: scored.length,
    saved: added,
    gated,
    filteredPct,
    aiReviewed,
    strongFit,
    aiTokens,
    tokensPerJob,
  });
}
