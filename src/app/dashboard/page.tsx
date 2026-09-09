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
    { ok: hasCv, label: "Upload your CV", hint: "So matches weigh your real background." },
    { ok: hasAnswers, label: "Answer the questionnaire", hint: "Titles, skills, and what you want next." },
    { ok: hasApify, label: "Add your Apify API key", hint: "Runs each search on your own account." },
  ];
  const done = steps.filter((s) => s.ok).length;

  const Check = ({ ok, label, hint }: { ok: boolean; label: string; hint: string }) => (
    <li>
      <Link
        href="/profile"
        className="group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2"
      >
        <span
          aria-hidden
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
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
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
              View results →
            </Link>
          </section>
        </div>

        {/* Run search */}
        <section className="card card-lift mt-5 p-6">
          <h2 className="font-display text-lg font-semibold">Find matches</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Scrapes fresh jobs with your Apify key, scores them against your profile with a zero-cost keyword pass,
            then gives the top roles an AI read.
          </p>
          <div className="mt-5">
            <RunSearch disabled={!ready} />
          </div>
          {!ready && (
            <p className="mt-3 text-sm text-warning">Finish the checklist above to enable search.</p>
          )}
        </section>
      </main>
    </>
  );
}
