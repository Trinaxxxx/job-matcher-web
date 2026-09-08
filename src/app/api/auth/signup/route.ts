import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSession, normalizeEmail } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(req, "auth"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Anti-enumeration (B): don't reveal whether the email is already registered.
  // Attempt to create atomically and rely on the DB unique constraint (this also
  // closes the check-then-create race). On a duplicate, return the SAME 200
  // body as a fresh signup but WITHOUT a session — the existing account is left
  // untouched, and a returning user simply lands on login. (The residual signal
  // is the presence/absence of the Set-Cookie header; fully closing that needs
  // an email-verification step, which this app doesn't have yet.)
  try {
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password) },
    });
    await createSession(user.id);
  } catch (e) {
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) {
      throw e; // not a unique-constraint violation — a real error
    }
    // Duplicate email: fall through to the identical generic response.
  }
  return NextResponse.json({ ok: true });
}
