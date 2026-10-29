"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One-click demo entry: seeds a throwaway guest account with a sample profile
// and a ranked shortlist, then drops the visitor straight on the results page.
// No sign-up, no Apify key. See /api/demo.
export default function DemoButton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Couldn't start the demo. Please try again.");
      }
      // Session cookie is set; land on the ranked shortlist.
      router.push("/results");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <>
      <button type="button" onClick={start} disabled={loading} className={className}>
        {loading ? "Loading demo…" : children}
      </button>
      {error && <span className="ml-2 text-xs text-warning">{error}</span>}
    </>
  );
}
