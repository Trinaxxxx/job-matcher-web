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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  async function continueAsGuest() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/guest", { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't start a guest session");
      return;
    }
    router.push("/dashboard");
    router.refresh();
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
