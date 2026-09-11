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

const STATUSES = ["New", "Interested", "Applied", "Rejected", "Offer"];

function scoreColor(score: number) {
  if (score >= 80) return "bg-success-soft text-success";
  if (score >= 65) return "bg-accent-soft text-accent";
  if (score >= 50) return "bg-[var(--warning)]/12 text-warning";
  return "bg-surface-2 text-muted";
}

type LoadError = { kind: "auth" | "rate" | "generic"; message: string };

export default function ResultsTable({ initialStatus }: { initialStatus?: string }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<LoadError | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [strongOnly, setStrongOnly] = useState(false);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(
    initialStatus && STATUSES.includes(initialStatus) ? initialStatus : null
  );

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    const url = strongOnly ? "/api/jobs?minAiScore=85" : "/api/jobs";
    fetch(url, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const kind = r.status === 401 ? "auth" : r.status === 429 ? "rate" : "generic";
          const message =
            typeof body?.error === "string"
              ? body.error
              : r.status === 401
              ? "Your session has expired. Log in again to see your matches."
              : "We couldn’t load your matches. Please try again.";
          throw { kind, message } as LoadError;
        }
        return r.json();
      })
      .then((d) => {
        if (!active) return;
        setJobs(Array.isArray(d?.jobs) ? d.jobs : []);
        setLoading(false);
      })
      .catch((e) => {
        if (!active || controller.signal.aborted) return;
        setError(
          e && (e.kind === "auth" || e.kind === "rate" || e.kind === "generic")
            ? (e as LoadError)
            : { kind: "generic", message: "We couldn’t reach the server. Check your connection and try again." }
        );
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [strongOnly, reload]);

  const anyAi = jobs.some((j) => j.aiScored);
  const visible = statusFilter ? jobs.filter((j) => j.status === statusFilter) : jobs;

  async function setStatus(id: string, status: string) {
    const prev = jobs.find((j) => j.id === id)?.status;
    setSaveError(null);
    setSaving((s) => ({ ...s, [id]: true }));
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, status } : j)));
    try {
      const res = await fetch("/api/jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Roll the row back to where it was and tell the user it didn’t stick.
      if (prev !== undefined) setJobs((js) => js.map((j) => (j.id === id ? { ...j, status: prev } : j)));
      setSaveError("Couldn’t save that status change. Please try again.");
    } finally {
      setSaving((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
    }
  }

  const controls = (anyAi || strongOnly || statusFilter) ? (
    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
      {(anyAi || strongOnly) && (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={strongOnly}
            onChange={(e) => setStrongOnly(e.target.checked)}
            className="accent-[var(--accent)]"
          />
          Strong fits only (AI score 85+)
        </label>
      )}
      {statusFilter && (
        <button
          type="button"
          onClick={() => setStatusFilter(null)}
          className="badge bg-accent-soft text-accent transition-colors hover:bg-surface-2"
          title="Clear status filter"
        >
          {statusFilter}
          <span aria-hidden className="text-muted">✕</span>
          <span className="sr-only">— clear filter</span>
        </button>
      )}
    </div>
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

  if (error)
    return (
      <>
        {controls}
        <div className="card mt-6 px-6 py-16 text-center">
          <div aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[var(--danger)]/12 text-[var(--danger)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 8v5" />
              <path d="M12 16.5h.01" />
              <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3l-7.9-13.7a2 2 0 0 0-3.4 0Z" />
            </svg>
          </div>
          <p className="mx-auto mt-4 max-w-sm text-sm text-muted">{error.message}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {error.kind === "auth" ? (
              <a href="/login" className="btn btn-primary btn-sm">Log in</a>
            ) : (
              <button type="button" onClick={() => setReload((n) => n + 1)} className="btn btn-primary btn-sm">
                Try again
              </button>
            )}
          </div>
        </div>
      </>
    );

  if (!visible.length)
    return (
      <>
        {controls}
        <div className="card mt-6 px-6 py-16 text-center">
          <div aria-hidden className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </div>
          <p className="mt-4 text-sm text-muted">
            {statusFilter
              ? `No roles marked “${statusFilter}” yet. Clear the filter to see all matches.`
              : strongOnly
              ? "No jobs scored 85+ yet. Uncheck the filter to see all matches."
              : "No matches yet. Run a search from the dashboard to get started."}
          </p>
        </div>
      </>
    );

  return (
    <>
    {controls}
    {saveError ? (
      <div
        role="alert"
        className="mt-4 flex items-center gap-2 rounded-[10px] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
      >
        <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
        {saveError}
      </div>
    ) : null}
    <div className="card mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-subtle text-left">
          <tr className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
            <th className="px-4 py-3">Fit</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Location</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((j) => (
            <Fragment key={j.id}>
              <tr className="border-b border-subtle align-top transition-colors last:border-0 hover:bg-surface-2">
                <td className="whitespace-nowrap px-4 py-3">
                  {j.aiScored && typeof j.aiScore === "number" ? (
                    <>
                      <span className="flex items-center gap-1.5">
                        <span className={`badge font-mono ${scoreColor(j.aiScore)}`} title="Gemini fit score">{j.aiScore}</span>
                        <span className="badge bg-accent-soft text-accent" title="AI-reviewed">AI</span>
                      </span>
                      <div className="mt-1 font-mono text-[10px] text-muted tnum" title="Keyword score">kw {j.score}</div>
                    </>
                  ) : (
                    <span className={`badge font-mono ${scoreColor(j.score)}`} title="Keyword score">{j.score}</span>
                  )}
                </td>
                <td className="max-w-[24rem] px-4 py-3">
                  <div className="break-words font-medium">
                    {j.url ? (
                      <a href={j.url} target="_blank" rel="noopener noreferrer" className="link decoration-transparent hover:decoration-current">{j.title}</a>
                    ) : j.title}
                  </div>
                  <div className="mt-0.5 break-words text-xs text-muted">
                    {[j.company, j.salary].filter(Boolean).join(" · ")}
                    {j.aiSummary || j.reasons?.length ? (
                      <button
                        onClick={() => setOpen(open === j.id ? null : j.id)}
                        aria-expanded={open === j.id}
                        className="ml-2 whitespace-nowrap font-medium text-accent hover:underline"
                      >
                        {open === j.id ? "hide why" : "why?"}
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="max-w-[12rem] break-words px-4 py-3 text-muted">{j.location || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-muted">{j.source || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  <select
                    value={j.status}
                    onChange={(e) => setStatus(j.id, e.target.value)}
                    disabled={!!saving[j.id]}
                    aria-label={`Application status for ${j.title}`}
                    className="field !w-auto !py-1.5 !text-sm disabled:opacity-60"
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
