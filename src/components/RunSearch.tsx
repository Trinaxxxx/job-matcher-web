"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DATE_POSTED_OPTIONS, DEFAULT_POSTED_WITHIN_HOURS } from "@/lib/datePosted";

export default function RunSearch({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postedWithinHours, setPostedWithinHours] = useState<number>(DEFAULT_POSTED_WITHIN_HOURS);

  async function run() {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postedWithinHours }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Something went wrong while searching. Check your scraping key and try again.");
      return;
    }
    const radiusNote =
      data.radiusKm && data.outsideRadius
        ? ` ${data.outsideRadius} ${data.outsideRadius === 1 ? "job was" : "jobs were"} outside your ${data.radiusKm} km radius.`
        : "";
    setMsg(
      (data.saved === 0
        ? "No new matches this time — try again in a day or two."
        : `Found ${data.saved} new ${data.saved === 1 ? "match" : "matches"} for you.`) + radiusNote
    );
    router.refresh();
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
        {busy ? "Finding matches… this may take a moment" : "Search for jobs"}
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
