import Link from "next/link";
import { getUserId } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export default async function Nav() {
  const userId = await getUserId();
  if (!userId) return null;
  return (
    <header className="border-b border-black/10 dark:border-white/15">
      <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 text-sm">
        <Link href="/dashboard" className="font-semibold">Job Matcher</Link>
        <Link href="/dashboard" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">Dashboard</Link>
        <Link href="/profile" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">Profile</Link>
        <Link href="/results" className="text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-white">Results</Link>
        <div className="ml-auto"><LogoutButton /></div>
      </nav>
    </header>
  );
}
