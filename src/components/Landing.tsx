import Link from "next/link";
import ThemeToggle from "./ThemeToggle";
import DemoButton from "./DemoButton";

/* ------------------------------------------------------------------ *
 * Synthetic, user-approved hero data. Companies are invented; the rows
 * are illustrative and labelled as such in the UI. No real-company
 * claims, no fabricated metrics. See surface brief for provenance.
 * ------------------------------------------------------------------ */
type Match = {
  score: number;
  ai: boolean;
  kw: number;
  tier: "Strong" | "Good" | "Possible";
  title: string;
  company: string;
  location: string;
  why: string;
};

const MATCHES: Match[] = [
  {
    score: 94, ai: true, kw: 88, tier: "Strong",
    title: "Senior Product Designer", company: "Northwind Studio", location: "Remote · EU",
    why: "6 years in design systems and your Figma-to-code workflow map straight onto their platform team.",
  },
  {
    score: 91, ai: true, kw: 84, tier: "Strong",
    title: "Staff Frontend Engineer", company: "Halden Health", location: "Berlin · Remote",
    why: "React + TypeScript depth and the accessibility work you led fit their design-systems mandate.",
  },
  {
    score: 88, ai: true, kw: 81, tier: "Strong",
    title: "Design Engineer", company: "Cartographer", location: "Remote · Global",
    why: "Bridges the design/eng split you describe; your prototype-in-code samples are the hybrid they want.",
  },
  {
    score: 72, ai: true, kw: 69, tier: "Good",
    title: "Product Manager, Platform", company: "Fathom Labs", location: "London",
    why: "Strong technical fluency and roadmap examples; lighter on the B2B SaaS background they prefer.",
  },
  {
    score: 58, ai: false, kw: 58, tier: "Possible",
    title: "Frontend Developer", company: "Copperline", location: "Kuala Lumpur",
    why: "Skills overlap, but the on-site requirement conflicts with your remote-only preference.",
  },
];

function tierStyle(score: number): { box: string; label: string } {
  if (score >= 80)
    return { box: "bg-success-soft text-success", label: "text-success" };
  if (score >= 65)
    return { box: "bg-accent-soft text-accent", label: "text-accent" };
  if (score >= 50)
    return {
      box: "bg-[var(--warning)]/12 text-warning",
      label: "text-warning",
    };
  return { box: "bg-surface-2 text-muted", label: "text-muted" };
}

/* Drawn icon set — one consistent 1.7 stroke, 22px. */
function Icon({ name, className }: { name: string; className?: string }) {
  const common = {
    width: 22, height: 22, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.7,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 15V4" /><path d="m8 8 4-4 4 4" />
          <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
        </svg>
      );
    case "scan":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" />
          <path d="M11 8v3l2 1.5" />
        </svg>
      );
    case "rank":
      return (
        <svg {...common}>
          <path d="M4 6h11" /><path d="M4 12h8" /><path d="M4 18h5" />
          <path d="M18 8v9" /><path d="m15 14 3 3 3-3" />
        </svg>
      );
    case "key":
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="4" /><path d="m11 11 8 8" />
          <path d="m16 16 2-2" /><path d="m19 19 2-2" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="4.5" y="10" width="15" height="10" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" /><path d="M12 14v2" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3 5 6v5c0 4.2 2.9 7.5 7 9 4.1-1.5 7-4.8 7-9V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      );
    case "why":
      return (
        <svg {...common}>
          <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4v4l5-4h7a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1Z" />
          <path d="M9 9h8" /><path d="M9 12h5" />
        </svg>
      );
    default:
      return null;
  }
}

function Mark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2 whitespace-nowrap font-display text-base font-semibold tracking-tight">
      <span
        aria-hidden
        className="grid h-6 w-6 place-items-center rounded-md bg-accent text-[13px] font-bold text-[var(--accent-fg)]"
      >
        jm
      </span>
      <span className={compact ? "sr-only sm:not-sr-only" : undefined}>Job Matcher</span>
    </span>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-subtle bg-background/80 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
        <Link href="/">
          <Mark compact />
        </Link>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Link href="#how" className="btn btn-quiet hidden px-3 py-1.5 sm:inline-flex">
            How it works
          </Link>
          <ThemeToggle />
          <Link href="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Find my matches
          </Link>
        </div>
      </nav>
    </header>
  );
}

function ScoreBlock({ m }: { m: Match }) {
  const t = tierStyle(m.score);
  return (
    <div className="flex shrink-0 flex-col items-center">
      <div
        className={`grid h-14 w-14 place-items-center rounded-xl ${t.box}`}
      >
        <span className="font-mono text-2xl font-semibold leading-none tnum">
          {m.score}
        </span>
      </div>
      <span className={`mt-1.5 text-[11px] font-semibold ${t.label}`}>
        {m.tier}
      </span>
    </div>
  );
}

function MatchRow({ m, i }: { m: Match; i: number }) {
  return (
    <li
      className="rise flex items-start gap-4 border-b border-subtle px-4 py-4 last:border-0 sm:px-5"
      style={{ ["--rise-delay" as string]: `${140 + i * 90}ms` }}
    >
      <ScoreBlock m={m} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="font-medium leading-snug">{m.title}</p>
          {m.ai ? (
            <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
              <span className="badge bg-accent-soft text-accent">AI reviewed</span>
              <span className="font-mono text-[10px] text-muted tnum">
                kw {m.kw}
              </span>
            </span>
          ) : (
            <span className="badge shrink-0 bg-surface-2 text-muted">
              keyword only
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {m.company} · {m.location}
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          <span className="font-medium text-accent">Why · </span>
          {m.why}
        </p>
      </div>
    </li>
  );
}

function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-14 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14 lg:pb-24 lg:pt-20">
      <div className="rise" style={{ ["--rise-delay" as string]: "0ms" }}>
        <h1 className="font-display text-[clamp(2.6rem,6vw,4.25rem)] font-semibold leading-[1.05] tracking-tight">
          Read the shortlist,
          <br />
          not the job board.
        </h1>
        <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
          Job Matcher scores every recent opening against your CV and answers,
          ranks the strong fits, and tells you — in plain English — why each one
          made the list.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <DemoButton className="btn btn-primary px-5 py-2.5 text-base">
            Try the live demo
            <Icon name="rank" className="h-[18px] w-[18px]" />
          </DemoButton>
          <Link href="/signup" className="btn btn-ghost px-5 py-2.5 text-base">
            Set up with my CV
          </Link>
        </div>
        <p className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          <span>No sign-up — one click to a ranked shortlist</span>
          <span aria-hidden className="text-muted">·</span>
          <span>Sample CV and jobs, scored live</span>
        </p>
      </div>

      <div
        className="rise"
        style={{ ["--rise-delay" as string]: "80ms" }}
      >
        <div className="card card-lift overflow-hidden">
          <div className="flex items-center justify-between border-b border-subtle px-4 py-3 sm:px-5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
              Sample matches
            </span>
            <span className="text-xs text-muted">Ranked by fit</span>
          </div>
          <ul>
            {MATCHES.map((m, i) => (
              <MatchRow key={m.title} m={m} i={i} />
            ))}
          </ul>
        </div>
        <p className="mt-3 px-1 text-xs text-muted">
          Illustrative results with invented companies. Sign in to run against
          your own CV.
        </p>
      </div>
    </section>
  );
}

const STEPS = [
  {
    icon: "upload",
    title: "Tell us who you are",
    body: "Upload your CV as PDF, DOCX, or TXT, then answer a short questionnaire — target titles, skills, locations, pay, and dealbreakers.",
  },
  {
    icon: "scan",
    title: "Pull fresh roles",
    body: "Using your own Apify key, Job Matcher scrapes listings posted in the last 7 days from LinkedIn and JobStreet.",
  },
  {
    icon: "rank",
    title: "Get a ranked, explained shortlist",
    body: "Every job is scored 0–100 against your background. The strongest clear the gate for an AI deep-read and a plain-English summary.",
  },
];

function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-t border-subtle bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <h2 className="max-w-2xl font-display text-[clamp(1.9rem,3.5vw,2.75rem)] font-semibold leading-tight tracking-tight">
          From CV to shortlist in three steps.
        </h2>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-subtle bg-subtle sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.title} className="flex flex-col bg-background p-6 sm:p-7">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon name={s.icon} />
              </span>
              <h3 className="mt-5 font-display text-lg font-semibold tracking-tight">
                {s.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const FUNNEL = [
  { count: "312", label: "roles scraped", note: "last 7 days" },
  { count: "312", label: "keyword-scored", note: "0–100, deterministic" },
  { count: "25", label: "sent to AI", note: "top scores only" },
  { count: "12", label: "on your shortlist", note: "ranked by fit" },
];

function Funnel() {
  return (
    <section className="border-t border-subtle">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(1.9rem,3.5vw,2.75rem)] font-semibold leading-tight tracking-tight">
            Cheap first. Smart second.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            A deterministic keyword scorer reads every job and decides which ones
            are worth a paid AI look. You get the accuracy of a careful read
            without paying to read all of them.
          </p>
        </div>

        <p className="mt-10 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          One example search
        </p>
        <div className="relative mt-5 grid gap-4 sm:grid-cols-4">
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-[27px] hidden sm:block"
            height="2"
            width="100%"
            preserveAspectRatio="none"
            viewBox="0 0 1000 2"
          >
            <line x1="0" y1="1" x2="1000" y2="1" stroke="var(--border)" strokeWidth="2" />
            <line
              className="flow"
              x1="0" y1="1" x2="1000" y2="1"
              stroke="var(--highlight)" strokeWidth="2"
              strokeDasharray="1000" strokeDashoffset="1000"
              style={{ ["--flow-len" as string]: 1000 }}
            />
          </svg>
          {FUNNEL.map((f, i) => (
            <div key={f.label} className="relative">
              <div className="flex items-center gap-3 sm:block">
                <span
                  className={`relative z-10 grid h-14 w-14 shrink-0 place-items-center rounded-full border-2 bg-background ${
                    i === FUNNEL.length - 1
                      ? "border-highlight text-highlight"
                      : "border-subtle-strong text-accent"
                  }`}
                >
                  <span className="font-mono text-lg font-semibold tnum">
                    {f.count}
                  </span>
                </span>
                <div className="sm:mt-4">
                  <p className="font-medium">{f.label}</p>
                  <p className="text-xs text-muted">{f.note}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="mt-10 max-w-2xl rounded-xl bg-accent-soft px-5 py-4 text-sm leading-relaxed text-muted">
          <span className="font-semibold text-accent">Never broken by AI.</span>{" "}
          No Gemini key, or a hiccup on any single job, and that job quietly falls
          back to its keyword score. A search never fails because of the AI stage.
        </p>
      </div>
    </section>
  );
}

const TRUST = [
  {
    icon: "key",
    term: "Bring your own key",
    body: "Scraping runs on your Apify account and quota — never a shared key.",
  },
  {
    icon: "lock",
    term: "Encrypted at rest",
    body: "Your key is AES-256-GCM encrypted and decrypted only when a search runs.",
  },
  {
    icon: "shield",
    term: "Yours to keep",
    body: "Track each role as New, Interested, Applied, or Rejected, and export to CSV.",
  },
  {
    icon: "why",
    term: "Always explainable",
    body: "Every score carries plain-English reasons you can open and inspect.",
  },
];

function Trust() {
  return (
    <section className="border-t border-subtle bg-surface-2/40">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {TRUST.map((t) => (
            <li key={t.term} className="flex gap-4">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                <Icon name={t.icon} />
              </span>
              <div>
                <h3 className="font-display font-semibold tracking-tight">
                  {t.term}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {t.body}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="border-t border-subtle">
      <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6 lg:py-28">
        <h2 className="mx-auto max-w-2xl font-display text-[clamp(2rem,4vw,3.25rem)] font-semibold leading-[1.08] tracking-tight">
          Your next role is already posted. Let&apos;s rank it.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <DemoButton className="btn btn-primary px-6 py-3 text-base">
            Try the live demo
            <Icon name="rank" className="h-[18px] w-[18px]" />
          </DemoButton>
          <Link href="/signup" className="btn btn-ghost px-6 py-3 text-base">
            Set up with my CV
          </Link>
        </div>
        <p className="mt-5 text-sm text-muted">
          Already set up?{" "}
          <Link href="/login" className="link">
            Log in
          </Link>
        </p>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-auto border-t border-subtle">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Mark />
        <p className="max-w-sm text-xs leading-relaxed text-muted">
          A portfolio project. Matches your CV to fresh job listings and shows
          you why each one ranked where it did.
        </p>
      </div>
    </footer>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <Funnel />
        <Trust />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
