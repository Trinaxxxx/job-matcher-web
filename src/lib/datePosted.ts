// How recently a job must have been posted to be scraped. Expressed as a single
// canonical "within N hours" value that every board translates into its own
// native filter (see lib/apify.ts) — most boards only do day-level granularity,
// so the sub-day options (4h, 12h) are honoured precisely only where the board
// supports it (LinkedIn) and otherwise fall back to the narrowest day bucket.

export const DATE_POSTED_OPTIONS = [
  { value: 4, label: "Last 4 hours" },
  { value: 12, label: "Last 12 hours" },
  { value: 24, label: "Last 24 hours" },
  { value: 168, label: "Past week" },
  { value: 720, label: "Past month" },
] as const;

export const DEFAULT_POSTED_WITHIN_HOURS = 24;

const ALLOWED = new Set(DATE_POSTED_OPTIONS.map((o) => o.value as number));

// Coerce an untrusted value (query/body) to one of the allowed options, falling
// back to the default so a bad value can never widen or break the scrape.
export function normalizePostedWithinHours(value: unknown): number {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && ALLOWED.has(n) ? n : DEFAULT_POSTED_WITHIN_HOURS;
}
