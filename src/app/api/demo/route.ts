import { NextRequest, NextResponse } from "next/server";
import { randomUUID, createHash } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";
import { buildStrategy } from "@/lib/strategy";
import { scoreJob } from "@/lib/scoring";
import { DEMO_CV_TEXT, DEMO_ANSWERS, DEMO_JOBS, DEMO_AI } from "@/lib/demoData";

// ---------------------------------------------------------------------------
// ONE-CLICK DEMO
//
// Seeds a throwaway guest account with a sample profile and a ranked shortlist,
// so a reviewer can see real output without signing up, paying, or supplying an
// Apify/Gemini key. The jobs are a fixed synthetic fixture (see lib/demoData),
// but they are scored by the REAL keyword engine against a REAL strategy derived
// from the sample CV + answers — only the AI column is pre-baked. This exercises
// the genuine scoring path; nothing here is a mock of our own logic.
// ---------------------------------------------------------------------------

function fingerprint(title = "", company = "", location = ""): string {
  return createHash("sha1").update(`${title}|${company}|${location}`.toLowerCase()).digest("hex");
}

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(req, "auth"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  // Build a real strategy from the sample CV + answers (same code path as a real
  // user completing onboarding).
  const strategy = buildStrategy(DEMO_CV_TEXT, DEMO_ANSWERS);

  // Throwaway guest, same shape as /api/auth/guest: unguessable email, unusable
  // password. Reachable only via the session cookie we sign below.
  const user = await prisma.user.create({
    data: {
      email: `demo_${randomUUID()}@guest.local`,
      passwordHash: await hashPassword(randomUUID()),
      isGuest: true,
      profile: {
        create: {
          cvText: DEMO_CV_TEXT,
          cvFileName: "alex-rivera-cv.txt",
          answers: DEMO_ANSWERS as unknown as object,
          strategy: strategy as unknown as object,
        },
      },
    },
  });

  // Score every fixture job with the real engine, drop exclusions, then attach
  // the pre-baked AI read to the roles that carry one.
  for (const job of DEMO_JOBS) {
    const result = scoreJob(job, strategy);
    if (result.excluded) continue;
    const ai = DEMO_AI[job.title ?? ""];
    try {
      await prisma.job.create({
        data: {
          userId: user.id,
          fingerprint: fingerprint(job.title, job.company ?? "", job.location ?? ""),
          title: job.title ?? "(untitled)",
          company: job.company,
          location: job.location,
          salary: job.salary,
          url: job.url,
          source: job.source,
          description: job.description,
          postedDate: job.postedDate,
          score: result.score,
          tier: result.tier,
          reasons: result.reasons,
          aiScored: !!ai,
          aiScore: ai?.aiScore ?? null,
          aiSummary: ai?.aiSummary ?? null,
        },
      });
    } catch {
      /* ignore individual write errors */
    }
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
