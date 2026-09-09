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

export default function ProfileForm() {
  const [answers, setAnswers] = useState<Answers>({});
  const [apifyKey, setApifyKey] = useState("");
  const [hasApifyKey, setHasApifyKey] = useState(false);
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [hasCvText, setHasCvText] = useState(false);
  const [cvMsg, setCvMsg] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (d.answers) setAnswers(d.answers);
        setHasApifyKey(!!d.hasApifyKey);
        setCvFileName(d.cvFileName ?? null);
        setHasCvText(!!d.hasCvText);
      })
      .catch(() => {});
  }, []);

  const set = (k: keyof Answers) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setAnswers((a) => ({ ...a, [k]: e.target.value }));

  async function uploadCv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCvMsg("Reading…");
    const fd = new FormData();
    fd.append("cv", file);
    const res = await fetch("/api/cv", { method: "POST", body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return setCvMsg(d.error || "Upload failed");
    setCvFileName(d.fileName);
    setHasCvText(true);
    setCvMsg(`Read ${d.chars.toLocaleString()} characters from ${d.fileName}.`);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaveMsg(null);
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, apifyKey: apifyKey || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return setSaveMsg(d.error || "Save failed");
    }
    if (apifyKey) { setHasApifyKey(true); setApifyKey(""); }
    setSaveMsg("Saved.");
  }

  return (
    <div className="mt-6 flex flex-col gap-8">
      {/* CV upload */}
      <section className="card card-lift p-6">
        <h2 className="font-display text-lg font-semibold">1. Your CV</h2>
        <p className={HINT}>PDF, DOCX, or TXT (max 5 MB). We extract the text to match your background.</p>
        <input
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={uploadCv}
          className="mt-3 block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-accent-soft file:px-3 file:py-2 file:text-sm file:font-medium file:text-accent hover:file:brightness-95"
        />
        {cvFileName && <p className="mt-2 text-sm">Current: <strong>{cvFileName}</strong>{hasCvText ? " ✓" : ""}</p>}
        {cvMsg && <p className="mt-1 text-sm text-success">{cvMsg}</p>}
      </section>

      {/* Questionnaire */}
      <form onSubmit={save} className="flex flex-col gap-8">
        <section className="card card-lift p-6">
          <h2 className="font-display text-lg font-semibold">2. Questionnaire</h2>
          <div className="mt-4 grid gap-4">
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
              <p className={HINT}>Words that disqualify a job (in title) or dock points (in description).</p>
              <input className={FIELD} value={answers.dealbreakers ?? ""} onChange={set("dealbreakers")}
                placeholder="cold calling, commission only, night shift" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Location</label>
                <p className={HINT}>One city or country only — the scrape runs a single location.</p>
                <input className={FIELD} value={answers.locations ?? ""} onChange={set("locations")}
                  placeholder="Kuala Lumpur" />
              </div>
              <div>
                <label className={LABEL}>Locations to avoid</label>
                <input className={FIELD} value={answers.excludeLocations ?? ""} onChange={set("excludeLocations")}
                  placeholder="United States, India" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={LABEL}>Min salary</label>
                <input className={FIELD} value={answers.minSalary ?? ""} onChange={set("minSalary")} placeholder="10000" />
              </div>
              <div>
                <label className={LABEL}>Currency</label>
                <input className={FIELD} value={answers.currency ?? ""} onChange={set("currency")} placeholder="RM" />
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
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={!!answers.remoteOk} className="accent-[var(--accent)]"
                onChange={(e) => setAnswers((a) => ({ ...a, remoteOk: e.target.checked }))} />
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
              <label className={LABEL}>Your goal for the next role</label>
              <p className={HINT}>Why you&apos;re looking now, and what you want your next role to be.</p>
              <textarea className={FIELD} rows={3} value={answers.careerGoal ?? ""} onChange={set("careerGoal")}
                placeholder="Looking to move from delivery into product strategy at a company where I own a roadmap end-to-end." />
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
              <p className={HINT}>Ideally ranked — the AI weighs these against each job.</p>
              <input className={FIELD} value={answers.priorities ?? ""} onChange={set("priorities")}
                placeholder="growth, then compensation, then work-life balance" />
            </div>
            <div>
              <label className={LABEL}>Preferred work style</label>
              <input className={FIELD} value={answers.workStyle ?? ""} onChange={set("workStyle")}
                placeholder="individual contributor, small team, startup over corporate" />
            </div>
          </div>
        </section>

        {/* Apify key */}
        <section className="card card-lift p-6">
          <h2 className="font-display text-lg font-semibold">4. Apify API key</h2>
          <p className={HINT}>
            Your own key from{" "}
            <a href="https://apify.com/" target="_blank" rel="noopener noreferrer"
              className="link">apify.com</a>{" "}
            (Settings → API &amp; Integrations). Stored encrypted; used only for your searches.
            {hasApifyKey && <span className="text-success"> A key is currently saved ✓</span>}
          </p>
          <input className={FIELD + " mt-3"} type="password" value={apifyKey}
            onChange={(e) => setApifyKey(e.target.value)}
            placeholder={hasApifyKey ? "Enter a new key to replace the saved one" : "apify_api_…"} />
        </section>

        <div className="flex items-center gap-3">
          <button disabled={busy} className="btn btn-primary px-5 py-2.5">
            {busy ? "Saving…" : "Save profile"}
          </button>
          {saveMsg && <span className="text-sm text-success">{saveMsg}</span>}
        </div>
      </form>
    </div>
  );
}
