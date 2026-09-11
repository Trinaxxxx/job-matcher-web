"use client";
import { useEffect, useState } from "react";

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

const FIELD = "field";
const LABEL = "label";
const HINT = "hint mt-0.5";

// Client-side mirror of the server caps in strategy.ts (AnswersSchema). Kept in
// sync so the user is stopped at the input instead of bouncing off a generic
// "Invalid profile data" after a round-trip.
const MAX: Partial<Record<keyof Answers, number>> = {
  targetTitles: 500,
  skills: 1000,
  industries: 500,
  dealbreakers: 1000,
  locations: 500,
  excludeLocations: 500,
  minSalary: 50,
  currency: 20,
  priorities: 500,
  workStyle: 500,
  careerGoal: 1000,
};
const MAX_APIFY_KEY = 500;

// Matches the /api/cv contract so we fail fast before a wasted upload.
const MAX_CV_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXT = [".pdf", ".docx", ".txt"];

type Msg = { kind: "info" | "ok" | "error"; text: string };
function toneClass(kind: Msg["kind"]) {
  if (kind === "error") return "text-[var(--danger)]";
  if (kind === "ok") return "text-success";
  return "text-muted";
}

function CheckIcon() {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block shrink-0 align-[-2px] text-success"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

type CvSuggestions = { titles: string[]; skills: string[]; industries: string[] };
const EMPTY_SUGGESTIONS: CvSuggestions = { titles: [], skills: [], industries: [] };

export default function ProfileForm() {
  const [answers, setAnswers] = useState<Answers>({});
  const [apifyKey, setApifyKey] = useState("");
  const [hasApifyKey, setHasApifyKey] = useState(false);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [hasCvText, setHasCvText] = useState(false);
  const [cvMsg, setCvMsg] = useState<Msg | null>(null);
  const [saveMsg, setSaveMsg] = useState<Msg | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<CvSuggestions>(EMPTY_SUGGESTIONS);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.answers) setAnswers(d.answers);
        setHasApifyKey(!!d.hasApifyKey);
        setCvFileName(d.cvFileName ?? null);
        setHasCvText(!!d.hasCvText);
        if (d.suggestions) setSuggestions(d.suggestions);
      })
      .catch(() => {});
  }, []);

  // Any edit invalidates a stale "Profile saved." confirmation.
  function patchAnswers(patch: Partial<Answers>) {
    setSaveMsg(null);
    setAnswers((a) => ({ ...a, ...patch }));
  }

  // Add or remove a suggested keyword from a comma-separated Answers field
  // (case-insensitive match).
  function toggleChip(k: keyof Answers, value: string) {
    setSaveMsg(null);
    setAnswers((a) => {
      const current = ((a[k] as string | undefined) ?? "").trim();
      const items = current.split(",").map((s) => s.trim()).filter(Boolean);
      const already = items.some((x) => x.toLowerCase() === value.toLowerCase());
      const next = already
        ? items.filter((x) => x.toLowerCase() !== value.toLowerCase())
        : [...items, value];
      return { ...a, [k]: next.join(", ") };
    });
  }

  function isChosen(k: keyof Answers, value: string): boolean {
    const current = ((answers[k] as string | undefined) ?? "").toLowerCase();
    return current.split(",").map((s) => s.trim()).includes(value.toLowerCase());
  }

  // A row of "from your CV" suggestion chips for one field.
  function chipRow(k: keyof Answers, items: string[]) {
    if (!items.length) return null;
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-2">From your CV:</span>
        {items.map((item, i) => {
          const chosen = isChosen(k, item);
          return (
            <button
              key={`${item}-${i}`}
              type="button"
              onClick={() => toggleChip(k, item)}
              aria-pressed={chosen}
              title={chosen ? `Remove "${item}"` : `Add "${item}"`}
              className={
                "max-w-full break-words rounded-full border px-2.5 py-0.5 text-xs transition " +
                (chosen
                  ? "border-transparent bg-success/15 text-success hover:bg-[var(--danger)]/15 hover:text-[var(--danger)]"
                  : "border-[var(--border)] bg-surface-2 text-muted hover:border-accent hover:text-accent")
              }
            >
              {chosen ? "✓ " : "+ "}{item}
            </button>
          );
        })}
      </div>
    );
  }

  const set = (k: keyof Answers) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    patchAnswers({ [k]: e.target.value } as Partial<Answers>);

  async function uploadCv(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    // Reset the input so re-selecting the same file still fires onChange, and so a
    // failed upload doesn't leave the picker showing a name we didn't accept.
    input.value = "";
    if (!file) return;

    const lower = file.name.toLowerCase();
    if (!ACCEPTED_EXT.some((ext) => lower.endsWith(ext))) {
      setCvMsg({ kind: "error", text: "Unsupported file type. Upload a PDF, DOCX, or TXT." });
      return;
    }
    if (file.size > MAX_CV_BYTES) {
      setCvMsg({ kind: "error", text: "That file is over 5 MB. Upload a smaller PDF, DOCX, or TXT." });
      return;
    }

    setUploading(true);
    setCvMsg({ kind: "info", text: "Reading your CV…" });
    try {
      const fd = new FormData();
      fd.append("cv", file);
      const res = await fetch("/api/cv", { method: "POST", body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCvMsg({ kind: "error", text: d.error || "Couldn’t read that file. Try another PDF, DOCX, or TXT." });
        return;
      }
      setCvFileName(d.fileName);
      setHasCvText(true);
      setCvMsg({
        kind: "ok",
        text: `Read ${Number(d.chars ?? 0).toLocaleString()} characters from ${d.fileName}.`,
      });
      if (d.suggestions) setSuggestions(d.suggestions);
    } catch {
      setCvMsg({ kind: "error", text: "Upload failed — check your connection and try again." });
    } finally {
      setUploading(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers, apifyKey: apifyKey || undefined }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveMsg({ kind: "error", text: d.error || "Couldn’t save your profile. Please try again." });
        return;
      }
      if (apifyKey) {
        setHasApifyKey(true);
        setApifyKey("");
      }
      setSaveMsg({ kind: "ok", text: "Profile saved." });
    } catch {
      setSaveMsg({ kind: "error", text: "Save failed — check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* CV upload */}
      <section className="card card-lift p-6">
        <h2 className="font-display text-lg font-semibold">1. Your CV</h2>
        <p className={HINT} id="cv-hint">PDF, DOCX, or TXT (max 5 MB). We extract the text to match your background.</p>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={uploadCv}
          disabled={uploading}
          aria-describedby="cv-hint"
          className="mt-3 block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {cvFileName && (
          <p className="mt-2 flex items-center gap-1.5 text-sm">
            <span className="break-all">Current: <strong>{cvFileName}</strong></span>
            {hasCvText && <CheckIcon />}
          </p>
        )}
        <p role="status" aria-live="polite" className="min-h-[1.25rem]">
          {cvMsg && <span className={`text-sm ${toneClass(cvMsg.kind)}`}>{cvMsg.text}</span>}
        </p>
      </section>

      {/* Questionnaire */}
      <form onSubmit={save} noValidate className="flex flex-col gap-8">
        <section className="card card-lift p-6">
          <h2 className="font-display text-lg font-semibold">2. Questionnaire</h2>
          <div className="mt-4 grid gap-4">
            <div>
              <label className={LABEL} htmlFor="targetTitles">Target job titles</label>
              <p className={HINT}>Comma-separated. These become your search terms.</p>
              <input id="targetTitles" className={FIELD} maxLength={MAX.targetTitles} value={answers.targetTitles ?? ""} onChange={set("targetTitles")}
                placeholder="product manager, program manager" />
              {chipRow("targetTitles", suggestions.titles)}
            </div>
            <div>
              <label className={LABEL} htmlFor="skills">Key skills / tools</label>
              <input id="skills" className={FIELD} maxLength={MAX.skills} value={answers.skills ?? ""} onChange={set("skills")}
                placeholder="SQL, roadmapping, stakeholder management" />
              {chipRow("skills", suggestions.skills)}
            </div>
            <div>
              <label className={LABEL} htmlFor="industries">Preferred industries</label>
              <input id="industries" className={FIELD} maxLength={MAX.industries} value={answers.industries ?? ""} onChange={set("industries")}
                placeholder="fintech, SaaS, healthcare" />
              {chipRow("industries", suggestions.industries)}
            </div>
            <div>
              <label className={LABEL} htmlFor="dealbreakers">Dealbreakers (avoid)</label>
              <p className={HINT}>Words that disqualify a job (in title) or dock points (in description).</p>
              <input id="dealbreakers" className={FIELD} maxLength={MAX.dealbreakers} value={answers.dealbreakers ?? ""} onChange={set("dealbreakers")}
                placeholder="cold calling, commission only, night shift" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL} htmlFor="locations">Location</label>
                <p className={HINT}>One city or country only — the scrape runs a single location.</p>
                <input id="locations" className={FIELD} maxLength={MAX.locations} value={answers.locations ?? ""} onChange={set("locations")}
                  placeholder="Kuala Lumpur" />
              </div>
              <div>
                <label className={LABEL} htmlFor="excludeLocations">Locations to avoid</label>
                <input id="excludeLocations" className={FIELD} maxLength={MAX.excludeLocations} value={answers.excludeLocations ?? ""} onChange={set("excludeLocations")}
                  placeholder="United States, India" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div>
                <label className={LABEL} htmlFor="minSalary">Min salary</label>
                <input id="minSalary" className={FIELD} inputMode="numeric" maxLength={MAX.minSalary} value={answers.minSalary ?? ""} onChange={set("minSalary")} placeholder="10000" />
              </div>
              <div>
                <label className={LABEL} htmlFor="currency">Currency</label>
                <input id="currency" className={FIELD} maxLength={MAX.currency} value={answers.currency ?? ""} onChange={set("currency")} placeholder="RM" />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={LABEL} htmlFor="seniority">Seniority</label>
                <select id="seniority" className={FIELD} value={answers.seniority ?? ""} onChange={set("seniority")}>
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
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={!!answers.remoteOk} className="accent-[var(--accent)]"
                onChange={(e) => patchAnswers({ remoteOk: e.target.checked })} />
              Open to remote roles
            </label>
          </div>
        </section>

        {/* Intent — AI-only signals */}
        <section className="card card-lift p-6">
          <h2 className="font-display text-lg font-semibold">3. What you want next</h2>
          <p className={HINT}>
            Optional, but recommended. Your CV shows what you&apos;ve done — these tell the AI matcher what
            you&apos;re looking for, so it can judge fit beyond skill overlap.
          </p>
          <div className="mt-4 grid gap-4">
            <div>
              <label className={LABEL} htmlFor="careerGoal">Your goal for the next role</label>
              <p className={HINT}>Why you&apos;re looking now, and what you want your next role to be.</p>
              <textarea id="careerGoal" className={FIELD} rows={3} maxLength={MAX.careerGoal} value={answers.careerGoal ?? ""} onChange={set("careerGoal")}
                placeholder="Looking to move from delivery into product strategy at a company where I own a roadmap end-to-end." />
            </div>
            <div>
              <label className={LABEL} htmlFor="careerMove">Career move</label>
              <select id="careerMove" className={FIELD} value={answers.careerMove ?? ""} onChange={set("careerMove")}>
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
              <label className={LABEL} htmlFor="priorities">What matters most</label>
              <p className={HINT}>Ideally ranked — the AI weighs these against each job.</p>
              <input id="priorities" className={FIELD} maxLength={MAX.priorities} value={answers.priorities ?? ""} onChange={set("priorities")}
                placeholder="growth, then compensation, then work-life balance" />
            </div>
            <div>
              <label className={LABEL} htmlFor="workStyle">Preferred work style</label>
              <input id="workStyle" className={FIELD} maxLength={MAX.workStyle} value={answers.workStyle ?? ""} onChange={set("workStyle")}
                placeholder="individual contributor, small team, startup over corporate" />
            </div>
          </div>
        </section>

        {/* Apify key */}
        <section className="card card-lift p-6">
          <h2 className="font-display text-lg font-semibold">4. Apify API key</h2>
          <p className={HINT} id="apify-hint">
            Your own key from{" "}
            <a href="https://apify.com/" target="_blank" rel="noopener noreferrer"
              className="link">apify.com</a>{" "}
            (Settings → API &amp; Integrations). Stored encrypted; used only for your searches.
            {hasApifyKey && (
              <span className="inline-flex items-center gap-1 text-success"> A key is currently saved <CheckIcon /></span>
            )}
          </p>
          <input className={FIELD + " mt-3"} type="password" autoComplete="off" maxLength={MAX_APIFY_KEY}
            aria-label="Apify API key" aria-describedby="apify-hint" value={apifyKey}
            onChange={(e) => { setApifyKey(e.target.value); setSaveMsg(null); }}
            placeholder={hasApifyKey ? "Enter a new key to replace the saved one" : "apify_api_…"} />
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button disabled={busy} className="btn btn-primary px-5 py-2.5">
            {busy ? "Saving…" : "Save profile"}
          </button>
          <span role="status" aria-live="polite">
            {saveMsg && <span className={`text-sm ${toneClass(saveMsg.kind)}`}>{saveMsg.text}</span>}
          </span>
        </div>
      </form>
    </div>
  );
}
