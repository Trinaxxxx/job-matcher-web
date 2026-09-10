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
      setError(data.error || (isSignup ? "Could not create your account. Please try again." : "Could not sign in. Check your email and password."));
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
    <main className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-4 py-16">
      <div className="mb-8 flex items-center gap-2.5">
        <span
          aria-hidden
          className="grid h-9 w-9 place-items-center rounded-lg bg-accent text-sm font-bold text-[var(--accent-fg)]"
        >
          jm
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">Job Matcher</span>
      </div>

      <h1 className="text-3xl font-semibold">{isSignup ? "Create your account" : "Sign in"}</h1>
      <p className="mt-2 text-sm text-muted">
        {isSignup
          ? "Save your CV, preferences, and matched roles in one place."
          : "Pick up where you left off with your saved matches."}
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-3">
        <div>
          <label htmlFor="auth-email" className="label mb-1">Email</label>
          <input
            id="auth-email"
            type="email" required placeholder="you@example.com" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field"
          />
        </div>
        <div>
          <label htmlFor="auth-password" className="label mb-1">Password</label>
          <input
            id="auth-password"
            type="password" required
            placeholder={isSignup ? "At least 8 characters" : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="field"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
        <button disabled={busy} className="btn btn-primary mt-1 w-full py-2.5">
          {busy ? "Please wait…" : isSignup ? "Sign up" : "Sign in"}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-3 text-xs text-muted-2">
        <span className="h-px flex-1 bg-[var(--border)]" />
        or
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <button
        type="button"
        onClick={continueAsGuest}
        disabled={busy}
        className="btn btn-ghost mt-6 w-full py-2.5"
      >
        Try without an account
      </button>
      <p className="mt-2 text-xs text-muted">
        You can explore the app, but your data won&apos;t be kept between sessions.
      </p>

      <p className="mt-8 text-sm text-muted">
        {isSignup ? (
          <>Already have an account? <Link href="/login" className="link">Sign in</Link></>
        ) : (
          <>First time here? <Link href="/signup" className="link">Create an account</Link></>
        )}
      </p>
    </main>
  );
}
