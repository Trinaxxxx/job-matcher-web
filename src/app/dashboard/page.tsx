import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Nav from "@/components/Nav";
import RunSearch from "@/components/RunSearch";
import PipelineDonut, { type PipelineSegment } from "@/components/PipelineDonut";
import { encouragement } from "@/lib/encouragement";

// Pipeline stages, in funnel order, with a design-token colour each.
const STAGES: { status: string; color: string }[] = [
  { status: "New", color: "var(--muted-2)" },
  { status: "Interested", color: "var(--accent)" },
  { status: "Applied", color: "var(--highlight)" },
  { status: "Offer", color: "var(--success)" },
  { status: "Rejected", color: "var(--danger)" },
];

export default async function Dashboard() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const [profile, user, jobCount, byStatus, strongCount] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { apifyKeyEnc: true, email: true } }),
    prisma.job.count({ where: { userId } }),
    prisma.job.groupBy({ by: ["status"], where: { userId }, _count: { _all: true } }),
    prisma.job.count({ where: { userId, aiScore: { gte: 85 } } }),
  ]);

  const hasCv = !!profile?.cvText;
  const hasAnswers = !!profile?.answers;
  const hasApify = !!user?.apifyKeyEnc;
  // Keyword-only matching never reads the CV, so it isn't required to search.
  const kwAnswers = profile?.answers as { matchMode?: string; includeAll?: string; includeAny?: string } | null;
  const keywordMode = kwAnswers?.matchMode === "keywords";
  const hasKeywords = !!(kwAnswers?.includeAll?.trim() || kwAnswers?.includeAny?.trim());
  const ready = (hasCv || keywordMode) && hasAnswers && hasApify;

  // Count per status (default 0), preserving the funnel order above.
  const counts: Record<string, number> = Object.fromEntries(STAGES.map((s) => [s.status, 0]));
  for (const row of byStatus) {
    if (row.status in counts) counts[row.status] = row._count._all;
    else counts[row.status] = (counts[row.status] ?? 0) + row._count._all; // any legacy status
  }

  const segments: PipelineSegment[] = STAGES.map((s) => ({
    status: s.status,
    color: s.color,
    count: counts[s.status] ?? 0,
  }));

  const applied = counts["Applied"] ?? 0;
  const offers = counts["Offer"] ?? 0;
  const neu = counts["New"] ?? 0;

  const message = encouragement({ total: jobCount, neu, applied, offers });

  const responseLine =
    applied > 0
      ? `${offers} offer${offers === 1 ? "" : "s"} from ${applied} application${applied === 1 ? "" : "s"}`
      : "Set a status on a role to start tracking your funnel.";

  const steps = [
    keywordMode
      ? { ok: hasKeywords, label: "Choose your keywords", hint: "Words a job must contain, and words that rule it out." }
      : { ok: hasCv, label: "Upload your CV", hint: "Your experience shapes how roles are ranked." },
    { ok: hasAnswers, label: "Set your preferences", hint: "Target titles, skills, locations, and salary." },
    { ok: hasApify, label: "Connect a scraping key", hint: "An Apify API key lets the app fetch live listings for you." },
  ];
  const done = steps.filter((s) => s.ok).length;

  const Check = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li>
      <Link
        href="/profile"
        className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <span
          aria-hidden="true"
          className={
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full " +
            (ok
              ? "bg-success text-white"
              : "border border-subtle-strong text-muted-2 group-hover:border-accent group-hover:text-accent")
          }
        >
          {ok ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 4.5 4.5L19 7" />
            </svg>
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-40" />
          )}
        </span>
        <span>
          <span className={"block text-sm font-medium " + (ok ? "text-muted line-through" : "")}>{label}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <span className="sr-only">{ok ? "(done)" : "(to do)"}</span>
      </Link>
    </li>
  );

  const Stat = ({
    label,
    value,
    href,
    hint,
    accent,
  }: {
    label: string;
    value: number;
    href: string;
    hint: string;
    accent?: boolean;
  }) => (
    <Link href={href} className="card card-lift group flex flex-col justify-between p-5 transition-colors hover:border-accent">
      <span className="text-xs font-medium uppercase tracking-[0.1em] text-muted">{label}</span>
      <span className={"mt-2 font-mono text-4xl font-semibold tracking-tight tnum " + (accent && value > 0 ? "text-success" : "")}>
        {value}
      </span>
      <span className="mt-1 text-xs text-muted">{hint}</span>
    </Link>
  );

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <header>
          <p className="text-sm text-muted">{user?.email}</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
          <p className="mt-2 max-w-prose text-sm text-muted">{message}</p>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-5">
          {/* Pipeline */}
          <section className="card card-lift p-6 md:col-span-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">Your pipeline</h2>
              <Link href="/results" className="link text-sm font-medium">
                See all →
              </Link>
            </div>
            <p className="mt-1 text-xs text-muted">{responseLine}</p>
            <div className="mt-5">
              <PipelineDonut segments={segments} total={jobCount} />
            </div>
          </section>

          {/* Setup checklist */}
          <section className="card card-lift p-6 md:col-span-2">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">Setup checklist</h2>
              <span className="font-mono text-sm text-muted tnum">{done}/{steps.length}</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={done}
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-label={`Setup progress: ${done} of ${steps.length} steps complete`}
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-500"
                style={{ width: `${(done / steps.length) * 100}%` }}
              />
            </div>
            <ul className="mt-4 flex flex-col gap-1">
              {steps.map((s) => (
                <Check key={s.label} {...s} />
              ))}
            </ul>
          </section>
        </div>

        {/* Stat tiles */}
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <Stat
            label="Strong fits"
            value={strongCount}
            href="/results"
            hint={keywordMode ? "AI-scored 85+ (AI match is off)" : "AI-scored 85+ — worth your time first"}
          />
          <Stat
            label="Awaiting review"
            value={neu}
            href="/results?status=New"
            hint="New matches you haven't triaged"
          />
          <Stat
            label="Offers"
            value={offers}
            href="/results?status=Offer"
            hint="Roles that came back with a yes"
            accent
          />
        </div>

        {/* Run search */}
        <section className="card card-lift mt-5 p-6">
          <h2 className="font-display text-lg font-semibold">Find matches</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            {keywordMode
              ? "Pulls recent job listings, keeps the ones that contain your keywords, and ranks them by how many they match."
              : "Pulls recent job listings, scores them against your CV and preferences, and highlights the strongest fits."}
          </p>
          <div className="mt-5">
            <RunSearch disabled={!ready} />
          </div>
          {!ready && (
            <p className="mt-3 text-sm text-warning">Complete the setup steps above before searching.</p>
          )}
        </section>
      </main>
    </>
  );
}
