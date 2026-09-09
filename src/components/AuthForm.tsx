"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  function go(path: string) {
    router.push(path);
    router.refresh();
  }

  // Send first-time users through onboarding, returning users to the dashboard.
  // "First time" = no scoring strategy has ever been built for this account.
  async function routeAfterAuth() {
    const done = await fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => !!d.hasStrategy)
      .catch(() => false);
    go(done ? "/dashboard" : "/onboarding");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      setBusy(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
      return;
    }
    // New signups always onboard; logins onboard only if setup is incomplete.
    if (isSignup) go("/onboarding");
    else await routeAfterAuth();
  }

  async function continueAsGuest() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/guest", { method: "POST" });
    if (!res.ok) {
      setBusy(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't start a guest session");
      return;
    }
    // Fresh guest account — always walk through onboarding.
    go("/onboarding");
  }

  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold">{isSignup ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-1 text-sm text-zinc-500">
        {isSignup ? "Set up a private account to save your CV and job matches." : "Log in to see your job matches."}
      </p>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <input
          type="email" required placeholder="you@example.com" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        <input
          type="password" required placeholder="Password (8+ characters)" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="rounded bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>
      <div className="mt-4 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
        or
        <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />
      </div>
      <button
        type="button"
        onClick={continueAsGuest}
        disabled={busy}
        className="mt-4 rounded border border-black/15 px-4 py-2 font-medium disabled:opacity-50 dark:border-white/20"
      >
        Continue as guest
      </button>
      <p className="mt-2 text-xs text-zinc-500">
        A temporary account — your CV and matches won&apos;t be saved for a return visit.
      </p>
      <p className="mt-4 text-sm text-zinc-500">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="underline">Log in</Link></>
        ) : (
          <>No account yet? <Link href="/signup" className="underline">Sign up</Link></>
        )}
      </p>
    </div>
  );
}
