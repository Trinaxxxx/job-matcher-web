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
