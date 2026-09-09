"use client";
import { Fragment, useEffect, useState } from "react";

type Job = {
  id: string;
  title: string;
  company?: string | null;
  location?: string | null;
  salary?: string | null;
  url?: string | null;
  source?: string | null;
  score: number;
  tier?: string | null;
  reasons?: string[] | null;
  status: string;
  aiScored: boolean;
  aiScore?: number | null;
  aiSummary?: string | null;
};

const STATUSES = ["New", "Interested", "Applied", "Rejected"];

function scoreColor(score: number) {
  if (score >= 80) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (score >= 65) return "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300";
  if (score >= 50) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
}

export default function ResultsTable() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [strongOnly, setStrongOnly] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = strongOnly ? "/api/jobs?minAiScore=85" : "/api/jobs";
    fetch(url).then((r) => r.json()).then((d) => {
      setJobs(d.jobs ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [strongOnly]);

  const anyAi = jobs.some((j) => j.aiScored);

  async function setStatus(id: string, status: string) {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status } : j)));
    await fetch("/api/jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  const controls = (anyAi || strongOnly) ? (
    <label className="mt-4 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
      <input type="checkbox" checked={strongOnly} onChange={(e) => setStrongOnly(e.target.checked)} />
      Strong fits only (AI score 85+)
    </label>
  ) : null;

  if (loading) return <><p className="mt-8 text-sm text-zinc-500">Loading…</p></>;
  if (!jobs.length)
    return (
      <>
        {controls}
        <p className="mt-8 text-sm text-zinc-500">
          {strongOnly ? "No jobs scored 85+ yet. Uncheck the filter to see all matches." : "No matches yet. Run a search from the dashboard."}
        </p>
      </>
    );

  return (
    <>
    {controls}
    <div className="mt-6 overflow-x-auto rounded-lg border border-black/10 dark:border-white/15">
      <table className="w-full text-sm">
        <thead className="border-b border-black/10 bg-black/[.02] text-left dark:border-white/15 dark:bg-white/[.03]">
          <tr>
            <th className="px-3 py-2">Fit</th>
            <th className="px-3 py-2">Role</th>
            <th className="px-3 py-2">Location</th>
            <th className="px-3 py-2">Source</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <Fragment key={j.id}>
              <tr className="border-b border-black/5 align-top dark:border-white/10">
                <td className="px-3 py-2">
                  {j.aiScored && typeof j.aiScore === "number" ? (
                    <>
                      <span className={`inline-block rounded px-2 py-0.5 font-semibold ${scoreColor(j.aiScore)}`} title="Gemini fit score">{j.aiScore}</span>
                      <span className="ml-1 text-[10px] text-purple-500" title="AI-reviewed">AI</span>
                      <div className="mt-0.5 text-[10px] text-zinc-400" title="Keyword score">kw {j.score}</div>
                    </>
                  ) : (
                    <span className={`inline-block rounded px-2 py-0.5 font-semibold ${scoreColor(j.score)}`} title="Keyword score">{j.score}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{j.title}</a>
                    ) : j.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {j.company}{j.salary ? ` · ${j.salary}` : ""}
                    {j.aiSummary || j.reasons?.length ? (
                      <button onClick={() => setOpen(open === j.id ? null : j.id)} className="ml-2 underline">
                        {open === j.id ? "hide why" : "why?"}
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{j.location}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{j.source}</td>
                <td className="px-3 py-2">
                  <select
                    value={j.status}
                    onChange={(e) => setStatus(j.id, e.target.value)}
                    className="rounded border border-black/15 px-2 py-1 dark:border-white/20 dark:bg-transparent"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
              {open === j.id && (j.aiSummary || j.reasons?.length) ? (
                <tr className="border-b border-black/5 dark:border-white/10">
                  <td colSpan={5} className="bg-black/[.02] px-3 py-2 text-xs text-zinc-600 dark:bg-white/[.03] dark:text-zinc-400">
                    {j.aiSummary ? (
                      <p className="mb-2"><span className="font-semibold text-purple-500">AI: </span>{j.aiSummary}</p>
                    ) : null}
                    {j.reasons?.length ? (
                      <ul className="list-disc pl-5">{j.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                    ) : null}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
