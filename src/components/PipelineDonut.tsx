"use client";
import Link from "next/link";
import { useState } from "react";

export type PipelineSegment = {
  status: string;
  count: number;
  color: string; // any CSS color (we pass design-token var() strings)
};

const RADIUS = 42;
const STROKE = 16;

/**
 * Pipeline funnel donut. Each segment (and its legend row) links to the
 * matching status filter on /results. Hovering either the arc or the legend
 * row emphasises that segment and dims the rest, so the chart is a control,
 * not just a picture.
 */
export default function PipelineDonut({
  segments,
  total,
}: {
  segments: PipelineSegment[];
  total: number;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  // Empty state: a quiet ring with a nudge to run a search.
  if (!total) {
    return (
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <svg viewBox="0 0 120 120" className="h-36 w-36 shrink-0" aria-hidden>
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={STROKE}
          />
        </svg>
        <p className="text-sm text-muted">
          No roles yet. Run a search, then track each one from New through to an
          Offer — your pipeline will fill in here.
        </p>
      </div>
    );
  }

  // Build arcs. pathLength=100 lets us use percentages directly for dasharray.
  // Each arc's offset is the running total of the percentages before it, computed
  // with reduce so no render-scope variable is reassigned.
  const arcs = segments
    .filter((s) => s.count > 0)
    .reduce<Array<PipelineSegment & { pct: number; offset: number }>>((acc, s) => {
      const pct = (s.count / total) * 100;
      const offset = acc.length ? acc[acc.length - 1].offset + acc[acc.length - 1].pct : 0;
      acc.push({ ...s, pct, offset });
      return acc;
    }, []);

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
          {arcs.map((a) => {
            const dim = hovered !== null && hovered !== a.status;
            return (
              <a
                key={a.status}
                href={`/results?status=${encodeURIComponent(a.status)}`}
                onMouseEnter={() => setHovered(a.status)}
                onMouseLeave={() => setHovered(null)}
              >
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  fill="none"
                  stroke={a.color}
                  strokeWidth={hovered === a.status ? STROKE + 3 : STROKE}
                  pathLength={100}
                  strokeDasharray={`${a.pct} ${100 - a.pct}`}
                  strokeDashoffset={-a.offset}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                  style={{ opacity: dim ? 0.35 : 1 }}
                >
                  <title>{`${a.status}: ${a.count} (${Math.round(a.pct)}%)`}</title>
                </circle>
              </a>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-3xl font-semibold tracking-tight tnum">{total}</span>
          <span className="text-xs text-muted">{total === 1 ? "role" : "roles"}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-0.5">
        {segments.map((s) => {
          const dim = hovered !== null && hovered !== s.status;
          return (
            <li key={s.status}>
              <Link
                href={`/results?status=${encodeURIComponent(s.status)}`}
                onMouseEnter={() => setHovered(s.status)}
                onMouseLeave={() => setHovered(null)}
                className="group flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
                style={{ opacity: dim ? 0.5 : 1 }}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="flex-1 text-sm">{s.status}</span>
                <span className="font-mono text-sm text-muted tnum">{s.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
