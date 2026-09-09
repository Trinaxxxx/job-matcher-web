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

  // Build the search query from the user's target titles + preferred locations.
  const keywords = strategy.titleKeywords.length
    ? strategy.titleKeywords.slice(0, 6).join(" OR ")
    : "manager";
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
  scored = await geminiRescore(scored, strategy, profile.cvText ?? "");

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
  return NextResponse.json({
    ok: true,
    scraped: raw.length,
    kept: scored.length,
    saved: added,
    aiReviewed,
    strongFit,
  });
}
