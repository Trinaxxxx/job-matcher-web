import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import Nav from "@/components/Nav";
import ResultsTable from "@/components/ResultsTable";

export default async function ResultsPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold">Job matches</h1>
          <a href="/api/export" className="btn btn-ghost btn-sm">
            Export CSV
          </a>
        </div>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Ranked by fit. Top roles get an AI read (score 85+ = strong fit) — open “why?” for its summary and the
          keyword reasons.
        </p>
        <ResultsTable />
      </main>
    </>
  );
}
