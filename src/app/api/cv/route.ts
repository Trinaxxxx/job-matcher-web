import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { parseCv } from "@/lib/cv";
import { buildStrategy, type Answers } from "@/lib/strategy";
import { checkRateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(req, "general", userId))) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 }
    );
  }

  const form = await req.formData();
  const file = form.get("cv");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  }

  const buffer = await file.arrayBuffer();
  const cvText = await parseCv(file.name, buffer);
  if (!cvText) {
    return NextResponse.json(
      { error: "Could not read text from that file. Use a PDF, DOCX, or TXT." },
      { status: 400 }
    );
  }

  const existing = await prisma.profile.findUnique({ where: { userId } });
  const answers: Answers = (existing?.answers as Answers) ?? {};
  const strategy = buildStrategy(cvText, answers);

  await prisma.profile.upsert({
    where: { userId },
    create: { userId, cvText, cvFileName: file.name, strategy },
    update: { cvText, cvFileName: file.name, strategy },
  });

  return NextResponse.json({ ok: true, chars: cvText.length, fileName: file.name });
}
