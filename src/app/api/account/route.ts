import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId, destroySession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

// DELETE /api/account — erase the signed-in user and everything they own
// (GDPR/CCPA right to erasure; SECURITY_ASSESSMENT finding #15).
//
// Profile and Job rows carry `onDelete: Cascade` on their user relation (see
// prisma/schema.prisma), so a single `user.delete` removes all owned rows at the
// DB level — we deliberately don't hand-delete children. Then the session cookie
// is cleared so the now-orphaned token can't linger.
export async function DELETE(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Same cap as other mutating authenticated endpoints.
  if (!(await checkRateLimit(req, "general", userId))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (e) {
    // P2025 = record already gone (e.g. a double-submit). The user's data is
    // deleted either way, so fall through to clearing the session. Anything else
    // is a real failure: log server-side, return a generic error.
    const code = (e as { code?: string } | null)?.code;
    if (code !== "P2025") {
      console.error("[account] delete failed:", e);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 }
      );
    }
  }

  await destroySession();
  return NextResponse.json({ ok: true });
}
