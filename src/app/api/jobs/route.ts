import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(req, "general", userId))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  // Optional ?minAiScore=85 filter for the "strong fit" view. Only affects
  // AI-reviewed jobs; unreviewed jobs (aiScore null) are excluded when set.
  const minAiRaw = req.nextUrl.searchParams.get("minAiScore");
  const minAiScore = minAiRaw !== null ? Number(minAiRaw) : null;
  const where =
    minAiScore !== null && Number.isFinite(minAiScore)
      ? { userId, aiScore: { gte: minAiScore } }
      : { userId };

  const jobs = await prisma.job.findMany({
    where,
    // AI-reviewed jobs first (by AI score), then the rest by keyword score.
    orderBy: [{ aiScore: { sort: "desc", nulls: "last" } }, { score: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ jobs });
}

const patch = z.object({
  id: z.string(),
  status: z.enum(["New", "Interested", "Applied", "Rejected"]),
});

export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(req, "general", userId))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const parsed = patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // updateMany with userId guard ensures a user can only touch their own rows.
  const { count } = await prisma.job.updateMany({
    where: { id: parsed.data.id, userId },
    data: { status: parsed.data.status },
  });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
