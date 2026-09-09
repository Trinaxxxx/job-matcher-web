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
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Job matches</h1>
          <a href="/api/export" className="rounded border border-black/15 px-3 py-1.5 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10">
            Export CSV
          </a>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Ranked by fit. Top roles get an AI read (score 85+ = strong fit) — open “why?” for its summary and the keyword reasons.</p>
        <ResultsTable />
      </main>
    </>
  );
}
