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

  const Check = ({ ok, label, href }: { ok: boolean; label: string; href: string }) => (
    <li className="flex items-center gap-3">
      <span className={ok ? "text-green-600" : "text-zinc-400"}>{ok ? "✓" : "○"}</span>
      <Link href={href} className="underline-offset-2 hover:underline">{label}</Link>
    </li>
  );

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500">{user?.email}</p>

        <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="font-medium">Setup checklist</h2>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <Check ok={hasCv} label="Upload your CV" href="/profile" />
            <Check ok={hasAnswers} label="Answer the questionnaire" href="/profile" />
            <Check ok={hasApify} label="Add your Apify API key" href="/profile" />
          </ul>
        </section>

        <section className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="font-medium">Find matches</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Scrapes fresh jobs with your Apify key, scores them against your profile, and saves the matches.
          </p>
          <div className="mt-4">
            <RunSearch disabled={!ready} />
          </div>
          {!ready && <p className="mt-2 text-sm text-amber-600">Finish the checklist above to enable search.</p>}
        </section>

        <p className="mt-6 text-sm text-zinc-500">
          You have <strong>{jobCount}</strong> saved {jobCount === 1 ? "match" : "matches"}.{" "}
          <Link href="/results" className="underline">View results →</Link>
        </p>
      </main>
    </>
  );
}
