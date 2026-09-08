import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserId } from "@/lib/auth";

// CSV export — opens in Excel / Google Sheets. (Notion push can be added later.)
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const jobs = await prisma.job.findMany({
    where: { userId },
    orderBy: [{ score: "desc" }],
    take: 1000,
  });

  const headers = ["Score", "Tier", "Title", "Company", "Location", "Salary", "Status", "Source", "URL", "Posted"];
  const rows = jobs.map((j) =>
    [j.score, j.tier, j.title, j.company, j.location, j.salary, j.status, j.source, j.url, j.postedDate]
      .map(csvCell)
      .join(",")
  );
  const csv = [headers.map(csvCell).join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="job-matches.csv"`,
    },
  });
}
