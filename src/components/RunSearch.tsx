"use client";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DATE_POSTED_OPTIONS, DEFAULT_POSTED_WITHIN_HOURS } from "@/lib/datePosted";

// How the worker's run status maps to progress copy shown under the button.
const STAGE_LABEL: Record<string, string> = {
  queued: "Queued…",
  scraping: "Searching job boards…",
  scoring: "Scoring matches…",
  reviewing: "Reading matches against your CV…",
  persisting: "Saving your matches…",
};

const POLL_MS = 2000;
const POLL_CEILING_MS = 5 * 60 * 1000; // stop polling after 5 min

export default function RunSearch({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postedWithinHours, setPostedWithinHours] = useState<number>(DEFAULT_POSTED_WITHIN_HOURS);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clean up any pending poll if the component unmounts mid-run.
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function finish(next: { msg?: string; error?: string }) {
    setBusy(false);
    setStage(null);
    if (next.msg) setMsg(next.msg);
    if (next.error) setError(next.error);
    if (next.msg) router.refresh();
  }

  async function poll(runId: string, startedAt: number) {
    if (Date.now() - startedAt > POLL_CEILING_MS) {
      finish({ msg: "Still running — check back on your Results in a moment." });
      return;
    }
    let data: Record<string, unknown> = {};
    try {
      const res = await fetch(`/api/search/${runId}`);
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        finish({ error: (data.error as string) || "Couldn't check your search status." });
        return;
      }
    } catch {
      // Transient network blip — keep polling.
      timer.current = setTimeout(() => poll(runId, startedAt), POLL_MS);
      return;
    }

    if (data.status === "done") {
      const saved = Number(data.saved ?? 0);
      const outside = Number(data.outsideRadius ?? 0);
      const radiusNote = outside
        ? ` ${outside} ${outside === 1 ? "job was" : "jobs were"} outside your radius.`
        : "";
      finish({
        msg:
          (saved === 0
            ? "No new matches this time — try again in a day or two."
            : `Found ${saved} new ${saved === 1 ? "match" : "matches"} for you.`) + radiusNote,
      });
      return;
    }
    if (data.status === "failed") {
      finish({ error: (data.error as string) || "Something went wrong while searching." });
      return;
    }

    setStage(typeof data.status === "string" ? data.status : "queued");
    timer.current = setTimeout(() => poll(runId, startedAt), POLL_MS);
  }

  async function run() {
    setBusy(true);
    setMsg(null);
    setError(null);
    setStage("queued");

    let data: Record<string, unknown> = {};
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postedWithinHours }),
      });
      data = await res.json().catch(() => ({}));
      if (!res.ok) {
        finish({
          error:
            (data.error as string) ||
            "Something went wrong while searching. Check your scraping key and try again.",
        });
        return;
      }
    } catch {
      finish({ error: "Couldn't start your search. Please try again." });
      return;
    }

    poll(data.runId as string, Date.now());
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <span>Date posted</span>
          <select
            aria-label="Date posted"
            className="field w-auto"
            value={postedWithinHours}
            onChange={(e) => setPostedWithinHours(Number(e.target.value))}
            disabled={disabled || busy}
          >
            {DATE_POSTED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button onClick={run} disabled={disabled || busy} className="btn btn-primary mt-4 py-2.5">
        {busy && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-fg)]/40 border-t-[var(--accent-fg)]"
          />
        )}
        {busy ? (stage && STAGE_LABEL[stage]) || "Finding matches…" : "Search for jobs"}
      </button>
      {msg && (
        <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {msg} <a href="/results" className="link font-medium">See your matches →</a>
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
