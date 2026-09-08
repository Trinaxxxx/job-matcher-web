import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  return NextResponse.json({ jobs });
}

const patch = z.object({
  id: z.string(),
  status: z.enum(["New", "Interested", "Applied", "Rejected"]),
});

export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patch.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  // updateMany with userId guard ensures a user can only touch their own rows.
  const { count } = await prisma.job.updateMany({
    where: { id: parsed.data.id, userId },
    data: { status: parsed.data.status },
  });
  if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
