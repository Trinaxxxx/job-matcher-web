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
      <button
        onClick={run}
        disabled={disabled || busy}
        className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-40 dark:bg-white dark:text-black"
      >
        {busy ? "Searching… (can take a minute)" : "Run job search"}
      </button>
      {msg && <p className="mt-2 text-sm text-green-600">{msg} <a href="/results" className="underline">View →</a></p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
