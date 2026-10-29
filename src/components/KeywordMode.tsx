"use client";
import { useRef, useState } from "react";
import type { Answers, MatchMode } from "@/lib/strategy";
import {
  KEYWORD_FIX_MESSAGE,
  KEYWORD_FORMAT,
  KEYWORD_PROMPT,
  parseKeywordImport,
  type KeywordImportCounts,
  type KeywordImportError,
} from "@/lib/keywordImport";

const FIELD = "field";
const LABEL = "label";
const HINT = "hint mt-0.5";

// Client-side mirror of the AnswersSchema caps in strategy.ts.
const MAX = { includeAll: 500, includeAny: 2000, excludeAny: 1000 };
const MAX_PASTE = 20_000;

const MODES: { id: MatchMode; title: string; body: string }[] = [
  { id: "ai", title: "AI match", body: "AI reads each job against your CV and goals, then scores the fit." },
  { id: "keywords", title: "Keywords only", body: "No AI. Keep jobs that contain your words and drop jobs that contain words you don't want." },
];

// Two-way choice between the AI matcher and plain keyword filtering. Behaves
// like a native radio group: one tab stop, arrow keys move the selection.
export function MatchModeToggle({ value, onChange }: { value?: MatchMode; onChange: (m: MatchMode) => void }) {
  const mode = value ?? "ai";
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = (MODES.findIndex((m) => m.id === mode) + step + MODES.length) % MODES.length;
    onChange(MODES[i].id);
    refs.current[i]?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Matching mode" onKeyDown={onKeyDown} className="grid gap-3 sm:grid-cols-2">
      {MODES.map((o, i) => {
        const on = mode === o.id;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={
              "rounded-xl border p-4 text-left transition " +
              (on ? "border-accent bg-accent-soft" : "border-[var(--border)] hover:border-accent")
            }
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span
                aria-hidden
                className={
                  "grid h-4 w-4 place-items-center rounded-full border " +
                  (on ? "border-accent" : "border-subtle-strong")
                }
              >
                {on && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              {o.title}
            </span>
            <span className="mt-1 block text-xs text-muted">{o.body}</span>
          </button>
        );
      })}
    </div>
  );
}

// Human labels for the fields an import can change, in display order.
const IMPORT_FIELDS: [keyof Answers, string][] = [
  ["includeAny", "Must contain at least one of"],
  ["includeAll", "Must contain all of"],
  ["excludeAny", "Drop jobs containing"],
  ["targetTitles", "Job titles to search for"],
  ["locations", "Location"],
  ["excludeLocations", "Locations to avoid"],
  ["remoteOk", "Open to remote"],
  ["seniority", "Seniority"],
  ["minSalary", "Min salary"],
  ["currency", "Currency"],
  ["salaryPeriod", "Salary is per"],
];

function show(v: unknown): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return String(v ?? "").trim();
}

const EXAMPLE_REPLY = `\`\`\`json
{
  "format": "${KEYWORD_FORMAT}",
  "targetTitles": ["finance manager", "financial controller"],
  "location": "Kuala Lumpur",
  "includeAny": ["ifrs", "month-end close", "netsuite"],
  "excludeAny": ["commission only", "night shift"],
  …
}
\`\`\``;

type Pending = { patch: Partial<Answers>; counts: KeywordImportCounts; warnings: string[] };
type Applied = { previous: Partial<Answers>; summary: string };

// Keyword-mode setup: copy a prompt into the user's own AI chat, paste its reply
// back, review what it will change, then apply (with undo) — or edit the three
// word lists by hand.
export function KeywordPanel({
  answers,
  onChange,
  onImported,
}: {
  answers: Partial<Answers>;
  onChange: (patch: Partial<Answers>) => void;
  // Called when an import (or its undo) is applied, so the host can save.
  onImported?: (patch: Partial<Answers>) => void;
}) {
  const [pasted, setPasted] = useState("");
  const [copied, setCopied] = useState<"prompt" | "fix" | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const [error, setError] = useState<KeywordImportError | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [applied, setApplied] = useState<Applied | null>(null);

  async function copy(text: string, which: "prompt" | "fix") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyFailed(false);
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopyFailed(true);
    }
  }

  function check() {
    setApplied(null);
    const r = parseKeywordImport(pasted);
    if (!r.ok) {
      setError(r);
      setPending(null);
      return;
    }
    setError(null);
    setPending({ patch: r.answers, counts: r.counts, warnings: r.warnings });
  }

  function apply() {
    if (!pending) return;
    // Snapshot what this import overwrites so it can be undone. The match mode
    // is left alone on undo — the user chose keyword mode either way.
    const previous: Partial<Answers> = {};
    for (const [k] of IMPORT_FIELDS) if (k in pending.patch) (previous as Record<string, unknown>)[k] = answers[k] ?? "";
    onChange(pending.patch);
    onImported?.(pending.patch);
    const { includeAll, includeAny, excludeAny, titles } = pending.counts;
    const parts = [
      titles && `${titles} job ${titles === 1 ? "title" : "titles"}`,
      `${includeAll + includeAny} keywords to look for`,
      `${excludeAny} to avoid`,
    ].filter(Boolean);
    setApplied({ previous, summary: `Applied ${parts.join(", ")}. Check the fields below.` });
    setPending(null);
    setPasted("");
  }

  function undo() {
    if (!applied) return;
    onChange(applied.previous);
    onImported?.(applied.previous);
    setApplied(null);
  }

  const set = (k: "includeAll" | "includeAny" | "excludeAny") =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ [k]: e.target.value });

  return (
    <div className="grid gap-5">
      <div className="rounded-xl border border-[var(--border)] bg-surface-2 p-4">
        <p className="text-sm font-semibold">Fill this in with your own AI chat</p>
        <p className={HINT}>
          Your CV goes to the chatbot you choose, not to us. It asks you a few questions, then gives you a short block of
          text to paste back here. Tip: remove your phone number and home address from your CV first.
        </p>
        <ol className="mt-3 grid gap-4 text-sm">
          <li>
            <span className="font-medium">1.</span> Copy the prompt and paste it into ChatGPT, Claude, Gemini or Copilot.
            Then attach your CV, or paste its text, in the same message.
            <div className="mt-2">
              <button type="button" onClick={() => copy(KEYWORD_PROMPT, "prompt")} className="btn btn-ghost btn-sm">
                {copied === "prompt" ? "Copied ✓" : "Copy prompt"}
              </button>
            </div>
            <details className="mt-2" open={copyFailed || undefined}>
              <summary className="cursor-pointer text-xs text-muted hover:text-accent">Show the prompt</summary>
              {copyFailed && (
                <p className="mt-2 text-xs text-[var(--danger)]">
                  Your browser blocked copying. Select all the text below and copy it yourself.
                </p>
              )}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 font-mono text-xs text-muted">
                {KEYWORD_PROMPT}
              </pre>
            </details>
          </li>
          <li>
            <span className="font-medium">2.</span> Answer the chatbot&apos;s questions. Its last reply will be a block of
            text starting with <code className="font-mono">{"{"}</code>.
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-muted hover:text-accent">What the last reply looks like</summary>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 font-mono text-xs text-muted">
                {EXAMPLE_REPLY}
              </pre>
            </details>
          </li>
          <li>
            <label htmlFor="keywordPaste">
              <span className="font-medium">3.</span> Copy that whole reply and paste it here. Extra text around it is fine.
            </label>
            <textarea
              id="keywordPaste"
              className={FIELD + " mt-2 font-mono text-xs"}
              rows={4}
              maxLength={MAX_PASTE}
              value={pasted}
              onChange={(e) => { setPasted(e.target.value); setError(null); setPending(null); }}
              placeholder={'{ "format": "job-matcher-keywords/v1", … }'}
              aria-describedby={error ? "keywordPasteError" : undefined}
            />
            <button type="button" onClick={check} disabled={!pasted.trim()} className="btn btn-primary btn-sm mt-2">
              Check reply
            </button>
          </li>
        </ol>

        {error && (
          <div id="keywordPasteError" role="alert" className="mt-3 rounded-lg bg-[var(--danger)]/10 p-3 text-sm">
            <p className="font-medium text-[var(--danger)]">{error.error}</p>
            <p className="mt-2 text-muted">To fix it, either:</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
              {error.kind === "cut-off" && <li>Copy the reply again, making sure you get everything down to the last {"}"}.</li>}
              <li>
                Send your AI chat this message, then paste its new reply.{" "}
                <button type="button" onClick={() => copy(KEYWORD_FIX_MESSAGE, "fix")} className="link font-medium">
                  {copied === "fix" ? "Copied ✓" : "Copy message"}
                </button>
              </li>
              <li>Or type your keywords into the boxes below yourself.</li>
            </ul>
          </div>
        )}

        {pending && (
          <div className="mt-3 rounded-lg border border-accent bg-surface p-3 text-sm">
            <p className="font-medium">Check these before applying</p>
            <dl className="mt-2 grid gap-1.5">
              {IMPORT_FIELDS.filter(([k]) => k in pending.patch).map(([k, label]) => {
                const next = show(pending.patch[k]);
                const prev = show(answers[k]);
                return (
                  <div key={k} className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="break-words">
                      {next || <span className="text-muted-2">(empty)</span>}
                      {prev && prev !== next && (
                        <span className="block text-xs text-muted-2">Replaces: {prev}</span>
                      )}
                    </dd>
                  </div>
                );
              })}
            </dl>
            {pending.warnings.length > 0 && (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-warning">
                {pending.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={apply} className="btn btn-primary btn-sm">Apply</button>
              <button type="button" onClick={() => setPending(null)} className="btn btn-quiet btn-sm">Cancel</button>
            </div>
          </div>
        )}

        <p role="status" aria-live="polite" className="mt-2 min-h-[1.25rem] text-sm">
          {applied && (
            <>
              <span className="text-success">{applied.summary}</span>{" "}
              <button type="button" onClick={undo} className="link font-medium">Undo</button>
            </>
          )}
        </p>
      </div>

      <p className={HINT}>
        Or type them yourself, separated by commas. Words are matched whole, ignoring case, in the job title and description.
      </p>
      <div>
        <label className={LABEL} htmlFor="includeAny">Must contain at least one of these</label>
        <p className={HINT}>Jobs with none of these are dropped. The more a job contains, the higher it ranks.</p>
        <textarea id="includeAny" className={FIELD} rows={3} maxLength={MAX.includeAny} value={answers.includeAny ?? ""}
          onChange={set("includeAny")} placeholder="ifrs, month-end close, sap, financial reporting" />
      </div>
      <div>
        <label className={LABEL} htmlFor="includeAll">Must contain all of these</label>
        <p className={HINT}>Optional. Jobs missing any one of these are dropped, so keep it to one or two.</p>
        <input id="includeAll" className={FIELD} maxLength={MAX.includeAll} value={answers.includeAll ?? ""}
          onChange={set("includeAll")} placeholder="acca" />
      </div>
      <div>
        <label className={LABEL} htmlFor="excludeAny">Drop jobs containing any of these</label>
        <p className={HINT}>Checked anywhere in the ad, so avoid words a good job might mention in passing.</p>
        <textarea id="excludeAny" className={FIELD} rows={2} maxLength={MAX.excludeAny} value={answers.excludeAny ?? ""}
          onChange={set("excludeAny")} placeholder="commission only, night shift, internship" />
      </div>
    </div>
  );
}
