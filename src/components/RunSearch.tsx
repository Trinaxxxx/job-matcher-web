"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RunSearch({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await fetch("/api/search", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Search failed");
      return;
    }
    setMsg(`Scraped ${data.scraped}, kept ${data.kept}, saved ${data.saved}.`);
    router.refresh();
  }

  return (
    <div>
      <button onClick={run} disabled={disabled || busy} className="btn btn-primary py-2.5">
        {busy && (
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent-fg)]/40 border-t-[var(--accent-fg)]"
          />
        )}
        {busy ? "Searching… this can take a minute" : "Run job search"}
      </button>
      {msg && (
        <p className="mt-3 rounded-lg bg-success-soft px-3 py-2 text-sm text-success">
          {msg} <a href="/results" className="link font-medium">View results →</a>
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
