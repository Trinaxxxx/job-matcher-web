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
};

const FIELD = "rounded border border-black/15 px-3 py-2 w-full dark:border-white/20 dark:bg-transparent";
const LABEL = "text-sm font-medium";
const HINT = "text-xs text-zinc-500";

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

  const set = (k: keyof Answers) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
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
      <section className="rounded-lg border border-black/10 p-5 dark:border-white/15">
        <h2 className="font-medium">1. Your CV</h2>
        <p className={HINT}>PDF, DOCX, or TXT (max 5 MB). We extract the text to match your background.</p>
        <input type="file" accept=".pdf,.docx,.txt" onChange={uploadCv} className="mt-3 text-sm" />
        {cvFileName && <p className="mt-2 text-sm">Current: <strong>{cvFileName}</strong>{hasCvText ? " ✓" : ""}</p>}
        {cvMsg && <p className="mt-1 text-sm text-green-600">{cvMsg}</p>}
      </section>

      {/* Questionnaire */}
      <form onSubmit={save} className="flex flex-col gap-8">
        <section className="rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="font-medium">2. Questionnaire</h2>
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
                <label className={LABEL}>Preferred locations</label>
                <input className={FIELD} value={answers.locations ?? ""} onChange={set("locations")}
                  placeholder="Kuala Lumpur, Singapore" />
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
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!answers.remoteOk}
                onChange={(e) => setAnswers((a) => ({ ...a, remoteOk: e.target.checked }))} />
              Open to remote roles
            </label>
          </div>
        </section>

        {/* Apify key */}
        <section className="rounded-lg border border-black/10 p-5 dark:border-white/15">
          <h2 className="font-medium">3. Apify API key</h2>
          <p className={HINT}>
            Your own key from apify.com (Settings → API &amp; Integrations). Stored encrypted; used only for your searches.
            {hasApifyKey && <span className="text-green-600"> A key is currently saved ✓</span>}
          </p>
          <input className={FIELD + " mt-3"} type="password" value={apifyKey}
            onChange={(e) => setApifyKey(e.target.value)}
            placeholder={hasApifyKey ? "Enter a new key to replace the saved one" : "apify_api_…"} />
        </section>

        <div className="flex items-center gap-3">
          <button disabled={busy} className="rounded bg-black px-5 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black">
            {busy ? "Saving…" : "Save profile"}
          </button>
          {saveMsg && <span className="text-sm text-green-600">{saveMsg}</span>}
        </div>
      </form>
    </div>
  );
}
