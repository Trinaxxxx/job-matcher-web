import { NextResponse } from "next/server";
import { createHash } from "crypto";
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

export async function POST() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const location = strategy.locations.length ? strategy.locations.join(" ") : "Remote";

  let raw;
  try {
    raw = await scrapeJobs(token, { keywords, location, maxResults: 50 });
  } catch (e) {
    return NextResponse.json(
      { error: `Scraping failed: ${e instanceof Error ? e.message : String(e)}` },
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

  // Optional Gemini pass (no-op until GEMINI_API_KEY is set).
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
        },
        update: { score: job.score, tier: job.tier, reasons: job.reasons },
      });
      added++;
    } catch {
      /* ignore individual write errors */
    }
  }

  return NextResponse.json({ ok: true, scraped: raw.length, kept: scored.length, saved: added });
}
