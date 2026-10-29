// ---------------------------------------------------------------------------
// ZERO-FRICTION DEMO DATASET
//
// Lets a reviewer see a full ranked, explained shortlist in one click — no
// sign-up, no Apify key, no Gemini key, no cost. The jobs below are a fixed,
// synthetic fixture (invented companies), but they are scored by the REAL
// keyword engine (scoreJob) against a REAL strategy (buildStrategy) derived
// from the sample CV + answers. Only the AI column is pre-baked: each top role
// carries a representative aiScore/aiSummary so the Gemini deep-read is shown
// without making a paid model call on a public demo.
//
// See /api/demo, which seeds a throwaway guest account with this data.
// ---------------------------------------------------------------------------

import type { Answers } from "./strategy";
import type { RawJob } from "./scoring";

// A believable candidate: a senior product designer / design engineer who wants
// to stay hands-on and work remotely. Chosen to mirror the landing-page persona.
export const DEMO_CV_TEXT = `Alex Rivera — Senior Product Designer & Design Engineer

Summary
Eight years designing and shipping product UI for B2B SaaS. I work across the
design/engineering seam: I design systems in Figma and implement them in React
and TypeScript. I led the accessibility programme at my last company (WCAG 2.2
AA across the product) and own our component library end to end.

Experience
Senior Product Designer, Meridian Software (2020–present)
- Own the design system (Figma + a React/TypeScript component library consumed
  by 40+ engineers). Cut new-feature build time ~30% by shipping accessible,
  tokenised primitives.
- Led the accessibility remediation programme to WCAG 2.2 AA.
- Prototype in code (React) rather than hand off static mocks.

Product Designer, Loomwork (2016–2020)
- Designed and front-end-built the onboarding and billing flows.
- Ran usability testing and translated findings into roadmap items.

Skills
Figma, design systems, React, TypeScript, accessibility (WCAG), HTML/CSS,
design tokens, prototyping, usability testing, roadmapping.

Education
BA Interaction Design.`;

export const DEMO_ANSWERS: Answers = {
  targetTitles: "senior product designer, design engineer, staff frontend engineer",
  skills: "Figma, design systems, React, TypeScript, accessibility, design tokens, prototyping",
  industries: "B2B SaaS, developer tools, product",
  dealbreakers: "crypto, commission-only sales, on-site only",
  locations: "Remote",
  minSalary: "110000",
  currency: "USD",
  salaryPeriod: "year",
  seniority: "senior",
  remoteOk: true,
  remoteMode: "remote",
  careerGoal:
    "Stay hands-on at the design/engineering seam — own a design system and implement it, not move into pure people-management.",
  careerMove: "same-field",
  priorities: "1) remote 2) design-systems ownership 3) compensation 4) accessibility-mature team",
  workStyle: "Individual contributor, small product-led team, writes code.",
  matchMode: "ai",
};

// Synthetic postings. Companies are invented. Descriptions are written to
// exercise the scorer's real signals (title match, skills overlap, seniority
// ceiling, dealbreakers, location/remote).
export const DEMO_JOBS: RawJob[] = [
  {
    title: "Senior Product Designer",
    company: "Northwind Studio",
    location: "Remote · EU",
    salary: "€95,000 – €120,000 / year",
    url: "https://example.com/jobs/northwind-senior-product-designer",
    source: "demo",
    postedDate: "2 days ago",
    description:
      "We're hiring a Senior Product Designer to own our design system end to end — " +
      "Figma libraries plus the React/TypeScript component library our engineers build on. " +
      "You'll partner closely with engineering, drive accessibility (WCAG 2.2 AA), and " +
      "prototype in code. B2B SaaS product team, fully remote across the EU.",
  },
  {
    title: "Design Engineer",
    company: "Cartographer",
    location: "Remote · Global",
    salary: "$120,000 – $150,000 / year",
    url: "https://example.com/jobs/cartographer-design-engineer",
    source: "demo",
    postedDate: "1 day ago",
    description:
      "Design Engineer to bridge design and front-end. You will implement our design " +
      "system in React + TypeScript, maintain design tokens, and ship accessible UI. " +
      "Ideal for someone who designs in Figma and builds in code. Developer-tools company, remote-first worldwide.",
  },
  {
    title: "Staff Frontend Engineer",
    company: "Halden Health",
    location: "Berlin · Remote",
    salary: "€110,000 – €135,000 / year",
    url: "https://example.com/jobs/halden-staff-frontend",
    source: "demo",
    postedDate: "3 days ago",
    description:
      "Staff Frontend Engineer with deep React and TypeScript experience to lead our " +
      "design-systems mandate. Accessibility expertise (WCAG) strongly preferred. " +
      "Healthcare SaaS. Remote within Europe.",
  },
  {
    title: "Product Designer",
    company: "Fathom Labs",
    location: "Remote · US",
    salary: "$100,000 – $125,000 / year",
    url: "https://example.com/jobs/fathom-product-designer",
    source: "demo",
    postedDate: "4 days ago",
    description:
      "Product Designer for our platform team. Figma, prototyping, usability testing. " +
      "Some design-systems work. B2B SaaS, remote in US time zones.",
  },
  {
    title: "Senior UX Designer",
    company: "Copperline",
    location: "Remote · US",
    salary: "$105,000 – $130,000 / year",
    url: "https://example.com/jobs/copperline-senior-ux",
    source: "demo",
    postedDate: "5 days ago",
    description:
      "Senior UX Designer to run discovery and usability research for our SaaS product. " +
      "Figma and prototyping required; less hands-on code. Remote.",
  },
  {
    title: "Head of Design",
    company: "Brightfield",
    location: "Remote · US",
    salary: "$180,000 – $210,000 / year",
    url: "https://example.com/jobs/brightfield-head-of-design",
    source: "demo",
    postedDate: "6 days ago",
    description:
      "Head of Design to lead and grow a team of 12 designers. Primarily people " +
      "management, hiring, and design strategy. Little to no hands-on design or code. B2B SaaS, remote.",
  },
  {
    title: "Frontend Developer",
    company: "Tidewater Apps",
    location: "Austin, TX (On-site)",
    salary: "$95,000 – $115,000 / year",
    url: "https://example.com/jobs/tidewater-frontend",
    source: "demo",
    postedDate: "3 days ago",
    description:
      "Frontend Developer, React and TypeScript. Must be on-site in our Austin office " +
      "five days a week. SaaS product company.",
  },
  {
    title: "Crypto Community Manager",
    company: "ChainPulse",
    location: "Remote · Global",
    salary: "Commission-based",
    url: "https://example.com/jobs/chainpulse-community",
    source: "demo",
    postedDate: "1 day ago",
    description:
      "Community Manager for our crypto token project. Grow our Discord and Telegram. " +
      "Commission-only compensation tied to token sales.",
  },
  {
    title: "Senior Product Designer, Design Systems",
    company: "Quill & Co",
    location: "Remote · EU",
    salary: "€100,000 – €125,000 / year",
    url: "https://example.com/jobs/quill-design-systems",
    source: "demo",
    postedDate: "2 days ago",
    description:
      "Own our design system: Figma foundations, design tokens, and a React component " +
      "library. Work with engineering on implementation. Accessibility matters here. Remote EU, B2B SaaS.",
  },
  {
    title: "UI Engineer",
    company: "Slateboard",
    location: "Remote · US",
    salary: "$115,000 – $140,000 / year",
    url: "https://example.com/jobs/slateboard-ui-engineer",
    source: "demo",
    postedDate: "4 days ago",
    description:
      "UI Engineer to build accessible, reusable React + TypeScript components from our " +
      "Figma design system. Developer-tools startup. Remote across the US.",
  },
];

// Pre-baked representative AI deep-read results, keyed by title. Applied by the
// demo route to the roles the keyword gate would send to the model, so the
// "AI reviewed" column is populated without a live (paid) Gemini call. Honest by
// construction: these mirror what the real prompt (lib/ai.ts) produces — strict,
// evidence-first, capping aspirational stretches.
export const DEMO_AI: Record<string, { aiScore: number; aiSummary: string }> = {
  "Senior Product Designer": {
    aiScore: 94,
    aiSummary:
      "Strong fit. Your CV shows you already own a design system across Figma and a React/TypeScript " +
      "component library, and you led a WCAG 2.2 AA programme — exactly this role's core. Remote EU B2B SaaS matches your stated priorities.",
  },
  "Design Engineer": {
    aiScore: 92,
    aiSummary:
      "Strong fit. This is the design/engineering seam you describe wanting to stay on: you design in Figma and " +
      "implement in React, and you maintain tokens and accessible UI. Remote-first and in your target developer-tools space.",
  },
  "Senior Product Designer, Design Systems": {
    aiScore: 90,
    aiSummary:
      "Strong fit. Design-systems ownership is your top demonstrated strength, and the Figma + React + tokens + " +
      "accessibility combination maps directly onto your Meridian work. Remote EU and B2B SaaS align with your preferences.",
  },
  "Staff Frontend Engineer": {
    aiScore: 86,
    aiSummary:
      "Strong fit, slight stretch on title. Your React/TypeScript depth and accessibility leadership back the design-systems " +
      "mandate, though the role leans more engineering than design — comfortable given your code-first prototyping.",
  },
  "UI Engineer": {
    aiScore: 83,
    aiSummary:
      "Good fit. Building accessible React components from a Figma system is squarely in your experience. Scored just " +
      "below strong because it's narrower than the full design-system ownership you're targeting.",
  },
  "Product Designer": {
    aiScore: 71,
    aiSummary:
      "Good, not strong. Figma, prototyping, and usability testing all match, but the role is lighter on the design-systems " +
      "and code ownership that are your differentiators and stated priority.",
  },
  "Senior UX Designer": {
    aiScore: 64,
    aiSummary:
      "Partial fit. Research and Figma overlap with your background, but this role is deliberately less hands-on in code — " +
      "a step away from the design/engineering seam you want to stay on.",
  },
  "Head of Design": {
    aiScore: 52,
    aiSummary:
      "Stretch in the wrong direction. You could grow into it, but it's primarily people-management with little hands-on " +
      "work — which directly conflicts with your stated goal of staying an individual contributor who writes code. Capped accordingly.",
  },
};
