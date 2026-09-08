import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { encrypt } from "@/lib/crypto";
import { buildStrategy, type Answers } from "@/lib/strategy";

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
  });
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const answers: Answers = body.answers ?? {};
  const apifyKey: string | undefined = body.apifyKey?.trim() || undefined;

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
