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
  if (score >= 80) return "bg-success-soft text-success";
  if (score >= 65) return "bg-accent-soft text-accent";
  if (score >= 50) return "bg-[var(--warning)]/12 text-warning";
  return "bg-surface-2 text-muted";
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
    <label className="mt-6 inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
      <input
        type="checkbox"
        checked={strongOnly}
        onChange={(e) => setStrongOnly(e.target.checked)}
        className="accent-[var(--accent)]"
      />
      Strong fits only (AI score 85+)
    </label>
  ) : null;

  if (loading)
    return (
      <div className="card mt-6 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-subtle px-4 py-4 last:border-0">
            <div className="h-7 w-10 animate-pulse rounded bg-surface-2" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-1/3 animate-pulse rounded bg-surface-2" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-surface-2" />
            </div>
            <div className="h-7 w-24 animate-pulse rounded bg-surface-2" />
          </div>
        ))}
      </div>
    );
  if (!jobs.length)
    return (
      <>
        {controls}
        <div className="card mt-6 px-6 py-16 text-center">
          <div aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-muted">
            {strongOnly
              ? "No jobs scored 85+ yet. Uncheck the filter to see all matches."
              : "No matches yet. Run a search from the dashboard to get started."}
          </p>
        </div>
      </>
    );

  return (
    <>
    {controls}
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-subtle text-left">
          <tr className="text-xs font-medium uppercase tracking-wide text-muted-2">
            <th className="px-4 py-3 font-medium">Fit</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Location</th>
            <th className="px-4 py-3 font-medium">Source</th>
            <th className="px-4 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <Fragment key={j.id}>
              <tr className="border-b border-subtle align-top transition-colors last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3">
                  {j.aiScored && typeof j.aiScore === "number" ? (
                    <>
                      <span className={`badge ${scoreColor(j.aiScore)}`} title="Gemini fit score">{j.aiScore}</span>
                      <span className="ml-1 text-[10px] font-semibold text-accent" title="AI-reviewed">AI</span>
                      <div className="mt-1 text-[10px] text-muted-2 tnum" title="Keyword score">kw {j.score}</div>
                    </>
                  ) : (
                    <span className={`badge ${scoreColor(j.score)}`} title="Keyword score">{j.score}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="link decoration-transparent hover:decoration-current">{j.title}</a>
                    ) : j.title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {j.company}{j.salary ? ` · ${j.salary}` : ""}
                    {j.aiSummary || j.reasons?.length ? (
                      <button
                        onClick={() => setOpen(open === j.id ? null : j.id)}
                        className="ml-2 font-medium text-accent hover:underline"
                      >
                        {open === j.id ? "hide why" : "why?"}
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{j.location}</td>
                <td className="px-4 py-3 text-muted">{j.source}</td>
                <td className="px-4 py-3">
                  <select
                    value={j.status}
                    onChange={(e) => setStatus(j.id, e.target.value)}
                    className="field !w-auto !py-1.5 !text-sm"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
              </tr>
              {open === j.id && (j.aiSummary || j.reasons?.length) ? (
                <tr className="border-b border-subtle last:border-0">
                  <td colSpan={5} className="bg-surface-2 px-4 py-3 text-xs text-muted">
                    {j.aiSummary ? (
                      <p className="mb-2"><span className="font-semibold text-accent">AI: </span>{j.aiSummary}</p>
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
