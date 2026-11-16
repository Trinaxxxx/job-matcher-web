import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron, guestCutoff } from "@/lib/cron";

// GET /api/cron/reap-guests — scheduled cleanup of stale guest/demo accounts
// (SECURITY_ASSESSMENT finding #15: guests are created on every demo/guest visit
// and never reaped, so PII accumulates without bound).
//
// Guarded by a bearer check against CRON_SECRET — Vercel Cron attaches
// `Authorization: Bearer <CRON_SECRET>` automatically when that env is set (see
// vercel.json). The guard fails closed: unset/empty secret or any mismatch => 401.
//
// Deletes every guest older than the TTL. Owned Profile/Job rows cascade at the
// DB level (prisma/schema.prisma), so deleteMany cleans them up too.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cutoff = guestCutoff();
  try {
    const { count } = await prisma.user.deleteMany({
      where: { isGuest: true, createdAt: { lt: cutoff } },
    });
    console.log(
      `[reap-guests] deleted ${count} stale guest account(s) created before ${cutoff.toISOString()}`
    );
    return NextResponse.json({ ok: true, deleted: count });
  } catch (e) {
    console.error("[reap-guests] failed:", e);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}
