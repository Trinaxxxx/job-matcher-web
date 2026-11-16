import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

// Poll a search run's status. The UI calls this every couple of seconds after
// enqueuing a search. Scoped to the owning user so runs aren't readable across
// accounts.
export async function GET(_req: Request, { params }: { params: Promise<{ runId: string }> }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { runId } = await params;
  const run = await prisma.searchRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    runId: run.id,
    status: run.status,
    error: run.error,
    scraped: run.scraped,
    kept: run.kept,
    outsideRadius: run.outsideRadius,
    gated: run.gated,
    aiReviewed: run.aiReviewed,
    strongFit: run.strongFit,
    aiTokens: run.aiTokens,
    saved: run.saved,
  });
}
