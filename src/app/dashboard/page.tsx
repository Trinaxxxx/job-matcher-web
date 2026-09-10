import { redirect } from "next/navigation";
import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Nav from "@/components/Nav";
import RunSearch from "@/components/RunSearch";

export default async function Dashboard() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const [profile, user, jobCount] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { apifyKeyEnc: true, email: true } }),
    prisma.job.count({ where: { userId } }),
  ]);

  const hasCv = !!profile?.cvText;
  const hasAnswers = !!profile?.answers;
  const hasApify = !!user?.apifyKeyEnc;
  const ready = hasCv && hasAnswers && hasApify;

  const steps = [
    { ok: hasCv, label: "Upload your CV", hint: "Your experience shapes how roles are ranked." },
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
            "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold " +
            (ok
              ? "bg-success text-white"
              : "border border-subtle-strong text-muted-2 group-hover:border-accent group-hover:text-accent")
          }
        >
          {ok ? "✓" : ""}
        </span>
        <span>
          <span className={"block text-sm font-medium " + (ok ? "text-muted line-through" : "")}>{label}</span>
          <span className="block text-xs text-muted">{hint}</span>
        </span>
        <span className="sr-only">{ok ? "(done)" : "(to do)"}</span>
      </Link>
    </li>
  );

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <header>
          <p className="text-sm text-muted">{user?.email}</p>
          <h1 className="mt-1 text-3xl font-semibold">Dashboard</h1>
        </header>

        <div className="mt-8 grid gap-5 md:grid-cols-5">
          {/* Setup checklist */}
          <section className="card card-lift p-6 md:col-span-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-semibold">Setup checklist</h2>
              <span className="text-sm text-muted tnum">{done}/{steps.length}</span>
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

          {/* Saved matches stat */}
          <section className="card card-lift flex flex-col justify-between p-6 md:col-span-2">
            <div>
              <h2 className="font-display text-lg font-semibold">Saved matches</h2>
              <p className="mt-3 font-display text-5xl font-semibold tracking-tight tnum">{jobCount}</p>
              <p className="mt-1 text-sm text-muted">
                {jobCount === 1 ? "role saved" : "roles saved"} to your list.
              </p>
            </div>
            <Link href="/results" className="link mt-6 text-sm font-medium">
              See your matches →
            </Link>
          </section>
        </div>

        {/* Run search */}
        <section className="card card-lift mt-5 p-6">
          <h2 className="font-display text-lg font-semibold">Find matches</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Pulls recent job listings, scores them against your CV and preferences, and highlights the strongest fits.
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
