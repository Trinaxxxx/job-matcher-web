import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPasswordConstantTime, createSession, normalizeEmail } from "@/lib/auth";
import { checkRateLimit } from "@/lib/ratelimit";

const schema = z.object({
  email: z.string().email().transform(normalizeEmail),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  if (!(await checkRateLimit(req, "auth"))) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Always run a bcrypt comparison (against a dummy hash when the user is
  // missing) so response timing doesn't reveal whether the email is registered.
  const ok = await verifyPasswordConstantTime(password, user?.passwordHash);
  if (!user || !ok) {
    return NextResponse.json({ error: "Wrong email or password" }, { status: 401 });
  }
  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
