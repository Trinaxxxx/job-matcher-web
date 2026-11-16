import { test } from "vitest";
import { writeFileSync, appendFileSync } from "node:fs";
import { buildStrategy } from "./strategy";
import { scoreJob, type RawJob } from "./scoring";

const OUT = "C:\\Users\\pkinz\\AppData\\Local\\Temp\\claude\\3dc87db66fd2b33b\\38c7d990-4c9b-4ce7-bc6e-5af05d5548f2\\scratchpad\\bench.txt";
writeFileSync(OUT, "");

// Build a realistic strategy once.
const cvText = `Jane Smith
Senior Product Manager | Fintech, Payments, SaaS
10 years experience in product management and roadmapping.
KEY SKILLS
SQL, roadmapping, stakeholder management, API design, data analysis, A/B testing
EXPERIENCE
Senior Product Manager at a fintech company, 2018-2026. Led payments platform.
Product Manager at a SaaS firm, 2015-2018.`;

const strategy = buildStrategy(cvText, {
  targetTitles: "product manager, program manager, senior product manager",
  skills: "SQL, roadmapping, stakeholder management, API design",
  industries: "fintech, saas, payments",
  dealbreakers: "commission-only, door-to-door, unpaid",
  locations: "Kuala Lumpur, Singapore, Remote",
  excludeLocations: "Penang",
  minSalary: "12000",
  currency: "MYR",
  seniority: "senior",
  remoteOk: true,
});

// A pool of varied synthetic jobs (realistic JD length).
const DESC = (extra: string) =>
  `We are looking for an experienced professional to join our team. ${extra} ` +
  "You will work with cross-functional stakeholders, own the roadmap, and drive outcomes. " +
  "Requirements include strong communication, analytical skills, and experience with SQL and APIs. " +
  "This is a full-time role with competitive benefits and growth opportunities. ".repeat(3);

const titles = [
  "Senior Product Manager", "Product Manager", "Program Manager", "Sales Manager",
  "Software Engineer", "Data Analyst", "Marketing Director", "Junior Product Manager",
  "Head of Product", "Product Owner", "Business Analyst", "Account Executive",
];
const locs = ["Kuala Lumpur, Malaysia", "Singapore", "Remote", "Penang, Malaysia", "Jakarta, Indonesia"];
const sals = ["RM 15,000 - 20,000", "SGD 8000", "", "RM 6000", "12k MYR monthly"];

const pool: RawJob[] = [];
for (let i = 0; i < 1000; i++) {
  pool.push({
    title: titles[i % titles.length],
    company: `Company ${i}`,
    location: locs[i % locs.length],
    salary: sals[i % sals.length],
    description: DESC(`Role number ${i} in fintech and payments and saas.`),
    url: `https://example.com/job/${i}`,
    source: "linkedin",
  });
}

test("scoring throughput benchmark", () => {
  // Warm up
  for (const j of pool) scoreJob(j, strategy);

  const RUNS = 20; // 20 x 1000 = 20,000 scored jobs
  const t0 = performance.now();
  let checksum = 0;
  for (let r = 0; r < RUNS; r++) {
    for (const j of pool) checksum += scoreJob(j, strategy).score;
  }
  const t1 = performance.now();

  const total = RUNS * pool.length;
  const ms = t1 - t0;
  const perJobUs = (ms * 1000) / total;
  const perSec = Math.round(total / (ms / 1000));

   
  appendFileSync(OUT,
    `\n=== SCORING BENCHMARK ===\n` +
      `jobs scored:      ${total.toLocaleString()}\n` +
      `total time:       ${ms.toFixed(1)} ms\n` +
      `per job:          ${perJobUs.toFixed(2)} µs\n` +
      `throughput:       ${perSec.toLocaleString()} jobs/sec\n` +
      `(checksum ${checksum})\n`
  );
});

test("strategy build benchmark", () => {
  const RUNS = 2000;
  const t0 = performance.now();
  for (let r = 0; r < RUNS; r++) buildStrategy(cvText, { targetTitles: "product manager", skills: "sql" });
  const t1 = performance.now();
  const ms = t1 - t0;
   
  appendFileSync(OUT,
    `\n=== STRATEGY BUILD BENCHMARK ===\n` +
      `builds:           ${RUNS.toLocaleString()}\n` +
      `total time:       ${ms.toFixed(1)} ms\n` +
      `per build:        ${((ms * 1000) / RUNS).toFixed(2)} µs\n`
  );
});
