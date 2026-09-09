import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { hashPassword, createSession } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

// Guest access: create a throwaway account and sign a normal session for it.
// Profiles and jobs are owned via a real userId FK, so a guest needs a real
// User row rather than a special "anonymous" token. The account is disposable —
// a random, unguessable email and an unusable random password (no way to log
// back in), so a guest session is only ever reachable via this fresh cookie.
export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(req, "auth"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  const user = await prisma.user.create({
    data: {
      email: `guest_${randomUUID()}@guest.local`,
      passwordHash: await hashPassword(randomUUID()),
      isGuest: true,
    },
  });
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
