import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { buildStrategy, suggestFromCv, ProfileBodySchema } from "@/lib/strategy";
import { checkRateLimit } from "@/lib/ratelimit";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [profile, user] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { apifyKeyEnc: true } }),
  ]);

  return NextResponse.json({
    answers: profile?.answers ?? null,
    cvFileName: profile?.cvFileName ?? null,
    hasCvText: !!profile?.cvText,
    hasApifyKey: !!user?.apifyKeyEnc,
    hasStrategy: !!profile?.strategy,
    // Keyword chips derived from the CV already on file, so the questionnaire can
    // offer them on load — not only right after a fresh upload.
    suggestions: profile?.cvText ? suggestFromCv(profile.cvText, profile.cvFileName ?? undefined) : null,
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(req, "general", userId))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = ProfileBodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile data" }, { status: 400 });
  }
  const answers = parsed.data.answers ?? {};
  const apifyKey: string | undefined = parsed.data.apifyKey?.trim() || undefined;

  const existing = await prisma.profile.findUnique({ where: { userId } });
  const cvText = existing?.cvText ?? "";
  const strategy = buildStrategy(cvText, answers);

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, answers, strategy },
    update: { answers, strategy },
  });

  if (apifyKey) {
    await prisma.user.update({ where: { id: userId }, data: { apifyKeyEnc: encrypt(apifyKey) } });
  }

  return NextResponse.json({ ok: true, strategy });
}
