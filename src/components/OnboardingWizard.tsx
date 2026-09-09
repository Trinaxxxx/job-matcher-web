"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// First-run setup wizard shown to guests and first-time users. Walks through
// CV upload → questionnaire → Apify key, saving as it goes, then hands off to
// the dashboard. Every step is skippable; the dashboard checklist backstops
// anything left undone.
type Answers = {
  targetTitles?: string;
  skills?: string;
  industries?: string;
  dealbreakers?: string;
  locations?: string;
  excludeLocations?: string;
  minSalary?: string;
  currency?: string;
  seniority?: string;
  remoteOk?: boolean;
  careerGoal?: string;
  careerMove?: string;
  priorities?: string;
  workStyle?: string;
};

const FIELD = "rounded border border-black/15 px-3 py-2 w-full dark:border-white/20 dark:bg-transparent";
const LABEL = "text-sm font-medium";
const HINT = "text-xs text-zinc-500";

const STEPS = ["Your CV", "Questionnaire", "Apify key"];

export default function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [apifyKey, setApifyKey] = useState("");
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvMsg, setCvMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof Answers) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setAnswers((a) => ({ ...a, [k]: e.target.value }));

  async function uploadCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvMsg("Reading…");
    setError(null);
    const fd = new FormData();
    fd.append("cv", file);
    const res = await fetch("/api/cv", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCvMsg(null);
      setError(d.error || "Upload failed");
      return;
    }
    setCvFileName(d.fileName);
    setCvMsg(`Read ${d.chars.toLocaleString()} characters from ${d.fileName}.`);
  }

  // Persist the questionnaire + (optionally) the Apify key. Answers are always
  // sent so a key-only save doesn't wipe them server-side.
  async function saveProfile(withKey: boolean): Promise<boolean> {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, apifyKey: withKey && apifyKey ? apifyKey : undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Couldn't save. Try again.");
      return false;
    }
    return true;
  }

  function goToDashboard() {
    router.push("/dashboard");
    router.refresh();
  }

  async function next() {
    if (step === 1) {
      if (!(await saveProfile(false))) return;
    }
    if (step === 2) {
      if (!(await saveProfile(true))) return;
      goToDashboard();
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Let&apos;s set you up</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Three quick steps and you&apos;ll be matching jobs. You can skip any of them and finish later.
      </p>

      {/* Progress */}
      <ol className="mt-6 flex items-center gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span className={
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-medium " +
              (i < step ? "bg-green-600 text-white" : i === step ? "bg-black text-white dark:bg-white dark:text-black" : "bg-black/10 text-zinc-500 dark:bg-white/15")
            }>
              {i < step ? "✓" : i + 1}
            </span>
            <span className={i === step ? "font-medium" : "text-zinc-500"}>{label}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-black/10 dark:bg-white/15" />}
          </li>
        ))}
      </ol>

      <div className="mt-6 rounded-lg border border-black/10 p-5 dark:border-white/15">
        {step === 0 && (
          <div>
            <h2 className="font-medium">Upload your CV</h2>
            <p className={HINT}>PDF, DOCX, or TXT (max 5 MB). We extract the text to match your background — skip if you&apos;d rather match on the questionnaire alone.</p>
            <input type="file" accept=".pdf,.docx,.txt" onChange={uploadCv} className="mt-3 text-sm" />
            {cvFileName && <p className="mt-2 text-sm">Current: <strong>{cvFileName}</strong> ✓</p>}
            {cvMsg && <p className="mt-1 text-sm text-green-600">{cvMsg}</p>}
          </div>
        )}

        {step === 1 && (
          <div className="grid gap-4">
            <h2 className="font-medium">Tell us what you&apos;re looking for</h2>
            <div>
              <label className={LABEL}>Target job titles</label>
              <p className={HINT}>Comma-separated. These become your search terms.</p>
              <input className={FIELD} value={answers.targetTitles ?? ""} onChange={set("targetTitles")}
                placeholder="product manager, program manager" />
            </div>
            <div>
              <label className={LABEL}>Key skills / tools</label>
              <input className={FIELD} value={answers.skills ?? ""} onChange={set("skills")}
                placeholder="SQL, roadmapping, stakeholder management" />
            </div>
            <div>
              <label className={LABEL}>Preferred industries</label>
              <input className={FIELD} value={answers.industries ?? ""} onChange={set("industries")}
                placeholder="fintech, SaaS, healthcare" />
            </div>
            <div>
              <label className={LABEL}>Dealbreakers (avoid)</label>
              <input className={FIELD} value={answers.dealbreakers ?? ""} onChange={set("dealbreakers")}
                placeholder="cold calling, commission only, night shift" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Location</label>
                <p className={HINT}>One city or country.</p>
                <input className={FIELD} value={answers.locations ?? ""} onChange={set("locations")}
                  placeholder="Kuala Lumpur" />
              </div>
              <div>
                <label className={LABEL}>Seniority</label>
                <select className={FIELD} value={answers.seniority ?? ""} onChange={set("seniority")}>
                  <option value="">Any</option>
                  <option value="intern">Intern</option>
                  <option value="junior">Junior</option>
                  <option value="mid">Mid</option>
                  <option value="senior">Senior</option>
                  <option value="lead">Lead</option>
                  <option value="director">Director</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Min salary</label>
                <input className={FIELD} value={answers.minSalary ?? ""} onChange={set("minSalary")} placeholder="10000" />
              </div>
              <div>
                <label className={LABEL}>Currency</label>
                <input className={FIELD} value={answers.currency ?? ""} onChange={set("currency")} placeholder="RM" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!answers.remoteOk}
                onChange={(e) => setAnswers((a) => ({ ...a, remoteOk: e.target.checked }))} />
              Open to remote roles
            </label>

            <hr className="border-black/10 dark:border-white/15" />
            <p className="text-sm font-medium">What you want next</p>
            <p className={HINT}>These tell the AI matcher what you&apos;re after, so it scores fit beyond skill overlap.</p>
            <div>
              <label className={LABEL}>Your goal for the next role</label>
              <textarea className={FIELD} rows={2} value={answers.careerGoal ?? ""} onChange={set("careerGoal")}
                placeholder="Move from delivery into product strategy where I own a roadmap end-to-end." />
            </div>
            <div>
              <label className={LABEL}>Career move</label>
              <select className={FIELD} value={answers.careerMove ?? ""} onChange={set("careerMove")}>
                <option value="">Not specified</option>
                <option value="same-field">Staying in my field</option>
                <option value="change-industry">Changing industry</option>
                <option value="change-function">Changing function / role type</option>
                <option value="step-up">Stepping up in seniority</option>
                <option value="returning">Returning to work after a break</option>
                <option value="first-role">First role / new graduate</option>
              </select>
            </div>
            <div>
              <label className={LABEL}>What matters most</label>
              <input className={FIELD} value={answers.priorities ?? ""} onChange={set("priorities")}
                placeholder="growth, then compensation, then work-life balance" />
            </div>
            <div>
              <label className={LABEL}>Preferred work style</label>
              <input className={FIELD} value={answers.workStyle ?? ""} onChange={set("workStyle")}
                placeholder="individual contributor, small team, startup over corporate" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-medium">Add your Apify API key</h2>
            <p className={HINT + " mt-1"}>
              Searches run through your own free Apify account, so your usage is yours alone.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
              <li>
                Open the{" "}
                <a href="https://console.apify.com/sign-up" target="_blank" rel="noopener noreferrer" className="underline">
                  Apify sign-up
                </a>{" "}
                (or{" "}
                <a href="https://console.apify.com/sign-in" target="_blank" rel="noopener noreferrer" className="underline">
                  sign in
                </a>{" "}
                if you already have an account).
              </li>
              <li>
                Go to{" "}
                <a href="https://console.apify.com/settings/integrations" target="_blank" rel="noopener noreferrer" className="underline">
                  Settings → Integrations
                </a>
                .
              </li>
              <li>Copy your <strong>Personal API token</strong> and paste it below.</li>
            </ol>
            <input className={FIELD + " mt-3"} type="password" value={apifyKey}
              onChange={(e) => setApifyKey(e.target.value)} placeholder="apify_api_…" />
            <p className={HINT + " mt-2"}>Stored encrypted and used only for your searches. You can add or change it later on your Profile.</p>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Nav */}
      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)} disabled={busy}
              className="text-sm text-zinc-500 underline disabled:opacity-50">
              Back
            </button>
          )}
          <button type="button" onClick={goToDashboard} disabled={busy}
            className="text-sm text-zinc-500 underline disabled:opacity-50">
            Skip setup
          </button>
        </div>
        <button type="button" onClick={next} disabled={busy}
          className="rounded bg-black px-5 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
          {busy ? "Saving…" : step === STEPS.length - 1 ? "Finish & go to dashboard" : "Next"}
        </button>
      </div>
    </div>
  );
}
