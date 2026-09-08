import type { RawJob } from "./scoring";

// Calls an Apify actor synchronously and returns its dataset items.
// Uses the USER's own Apify token (passed in), never a shared key.
async function runActor(actorId: string, token: string, input: unknown): Promise<any[]> {
  // run-sync-get-dataset-items waits for the run and returns items in one call.
  const url = `https://api.apify.com/v2/acts/${actorId.replace("/", "~")}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Apify actor ${actorId} failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Map a raw LinkedIn scraper item to our common RawJob shape.
function mapLinkedIn(item: any): RawJob {
  return {
    title: item.title || item.jobTitle,
    company: item.companyName || item.company,
    location: item.location,
    salary: item.salary || item.salaryInfo,
    url: item.jobUrl || item.link || item.url,
    source: "LinkedIn",
    description: item.description || item.descriptionText,
    postedDate: item.postedAt || item.postedDate,
  };
}

function mapJobStreet(item: any): RawJob {
  return {
    title: item.title || item.jobTitle,
    company: item.company || item.companyName,
    location: item.location || item.jobLocation,
    salary: item.salary,
    url: item.url || item.jobUrl,
    source: "JobStreet",
    description: item.description || item.jobDescription,
    postedDate: item.postedDate || item.listingDate,
  };
}

export type SearchParams = {
  keywords: string;   // what to search for (usually the target titles)
  location: string;   // "Malaysia Singapore"
  maxResults: number;
};

// Runs the enabled sources with the user's token and returns a flat RawJob[].
export async function scrapeJobs(token: string, params: SearchParams): Promise<RawJob[]> {
  const results: RawJob[] = [];
  const errors: string[] = [];

  // LinkedIn (broad, worldwide-capable).
  try {
    const items = await runActor("worldunboxer/rapid-linkedin-scraper", token, {
      job_title: params.keywords,
      location: params.location,
      job_post_time: "r604800", // last 7 days
      jobs_entries: params.maxResults,
    });
    results.push(...items.map(mapLinkedIn));
  } catch (e) {
    errors.push(String(e instanceof Error ? e.message : e));
  }

  // JobStreet (SEA). Only meaningful if the location covers MY/SG.
  if (/malaysia|singapore|kuala lumpur|\bsg\b|\bmy\b/i.test(params.location)) {
    try {
      const items = await runActor("blackfalcondata/jobstreet-scraper", token, {
        query: params.keywords,
        country: /singapore|\bsg\b/i.test(params.location) ? "SG" : "MY",
        maxResults: params.maxResults,
        includeDetails: true,
        sortMode: "date",
        dateRange: "7",
      });
      results.push(...items.map(mapJobStreet));
    } catch (e) {
      errors.push(String(e instanceof Error ? e.message : e));
    }
  }

  if (!results.length && errors.length) {
    throw new Error(errors.join(" | "));
  }
  return results;
}
