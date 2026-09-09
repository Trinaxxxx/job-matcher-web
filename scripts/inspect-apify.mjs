// One-off verification: run the LinkedIn actor with YOUR Apify token and dump
// the real dataset shape, so we can confirm src/lib/apify.ts maps the right keys.
//
// Usage (PowerShell):
//   $env:APIFY_TOKEN="apify_api_xxx"; node scripts/inspect-apify.mjs
// or:
//   node scripts/inspect-apify.mjs apify_api_xxx
//
// It prints the keys of the first returned item and writes the full JSON to
// scripts/apify-sample.json for inspection. Nothing here runs in production.

const token = process.env.APIFY_TOKEN || process.argv[2];
if (!token) {
  console.error("Missing token. Set APIFY_TOKEN or pass it as the first arg.");
  process.exit(1);
}

const actorId = "worldunboxer/rapid-linkedin-scraper";
const input = {
  job_title: "manager",
  location: "Malaysia",
  job_post_time: "r604800", // last 7 days
  jobs_entries: 10,         // actor minimum is 10; keep low to limit credits
};

const url = `https://api.apify.com/v2/acts/${actorId.replace(
  "/",
  "~"
)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;

console.log(`Running ${actorId} (10 jobs)… this can take 30–90s.`);
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});

if (!res.ok) {
  console.error(`Actor failed (${res.status}):`, (await res.text()).slice(0, 500));
  process.exit(1);
}

const items = await res.json();
console.log(`\nReturned ${items.length} item(s).`);
if (items.length) {
  console.log("\n=== Keys on the first item ===");
  console.log(Object.keys(items[0]).sort().join("\n"));
  console.log("\n=== First item (title/url/company/location) ===");
  const it = items[0];
  console.log({
    job_title: it.job_title,
    job_url: it.job_url,
    company_name: it.company_name,
    location: it.location,
    salary_range: it.salary_range,
    time_posted: it.time_posted,
  });
  const { writeFileSync } = await import("node:fs");
  writeFileSync("scripts/apify-sample.json", JSON.stringify(items, null, 2));
  console.log("\nFull output written to scripts/apify-sample.json");
}
