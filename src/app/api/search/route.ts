import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/ratelimit";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { apifyBudgetAvailable } from "@/lib/budget";
import { precheckSearch, SearchError } from "@/lib/pipeline";
import { inngest } from "@/lib/inngest";
import { normalizePostedWithinHours } from "@/lib/datePosted";

// Enqueue a background search. The heavy scrape→score→rescore→persist work runs
// in the Inngest worker (see lib/inngest.ts + api/inngest); this route only does
// the cheap, synchronous guards and returns a runId the UI polls.
export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Two layers: a per-user cap (below) so one account can't spam the scrape, and
  // a per-IP cap so one network can't amplify cost by rotating guest accounts.
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

  // Per-user daily scrape cap. The scrape itself is recorded in the worker only
  // after it succeeds, so a failed run still isn't charged; we check availability
  // here so a budgeted-out user gets instant feedback instead of a failed run.
  if (!(await apifyBudgetAvailable(userId))) {
    return NextResponse.json(
      { error: "You've reached today's search limit. Please try again tomorrow." },
      { status: 429 }
    );
  }

  // Cheap validation (has key, has strategy, postcode sanity) so a bad request
  // fails fast with a 400 instead of spawning a run that just fails.
  try {
    await precheckSearch(userId);
  } catch (e) {
    if (e instanceof SearchError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const body = await req.json().catch(() => ({}));
  const postedWithinHours = normalizePostedWithinHours((body as Record<string, unknown>).postedWithinHours);
  const params = { postedWithinHours };

  const run = await prisma.searchRun.create({
    data: { userId, status: "queued", params },
    select: { id: true },
  });

  await inngest.send({ name: "search/requested", data: { runId: run.id, userId, params } });

  return NextResponse.json({ runId: run.id, status: "queued" }, { status: 202 });
}
