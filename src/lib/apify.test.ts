import { describe, it, expect } from "vitest";
import { sourcesFor, SOURCES, mapIndeed, mapTotaljobs, mapBayt, mapWttj, mapGulfTalent, type SearchParams } from "./apify";

const names = (cc?: string) => sourcesFor(cc).map((s) => s.name);
const source = (name: string) => SOURCES.find((s) => s.name === name)!;
const params: SearchParams = { keywords: "data engineer", location: "Sydney, Australia", city: "Sydney", postedWithinHours: 24, maxResults: 20 };

describe("sourcesFor", () => {
  it.each([
    ["au", ["LinkedIn", "Indeed", "SEEK"]],
    ["nz", ["LinkedIn", "Indeed", "SEEK"]],
    ["my", ["LinkedIn", "Indeed", "JobStreet"]],
    ["sg", ["LinkedIn", "Indeed", "JobStreet"]],
    ["th", ["LinkedIn", "Indeed", "JobsDB"]],
    ["ae", ["LinkedIn", "Indeed", "Bayt", "GulfTalent"]],
    ["sa", ["LinkedIn", "Indeed", "Bayt", "GulfTalent"]],
    ["de", ["LinkedIn", "Indeed", "StepStone"]],
    ["gb", ["LinkedIn", "Indeed", "Totaljobs"]],
    ["fr", ["LinkedIn", "Indeed", "Welcome to the Jungle"]],
    ["es", ["LinkedIn", "Indeed"]],
    ["nl", ["LinkedIn", "Indeed"]],
    ["ca", ["LinkedIn", "Indeed"]],
    ["ie", ["LinkedIn", "Indeed"]],
  ])("%s → %j", (cc, expected) => {
    expect(names(cc)).toEqual(expected);
  });
  it("falls back to LinkedIn only when the country is unknown", () => {
    expect(names(undefined)).toEqual(["LinkedIn"]);
  });
  it("runs only Indeed (remote within the country) for remote-only, and no actors for nomad", () => {
    expect(sourcesFor("my", "remote").map((s) => s.name)).toEqual(["Indeed"]);
    expect(sourcesFor("ae", "remote").map((s) => s.name)).toEqual(["Indeed"]);
    expect(sourcesFor("my", "nomad")).toEqual([]);
  });
});

describe("GulfTalent", () => {
  it("passes radius, centre and date window", () => {
    const p = { ...params, radiusKm: 25, center: { lat: 25.08, lon: 55.14 }, postedWithinHours: 168 };
    expect(source("GulfTalent").input(p, "ae")).toMatchObject({
      country: "AE", searchRadiusKm: 25, searchLatitude: 25.08, searchLongitude: 55.14, maxAgeMinutes: 10080,
    });
  });
  it("maps a listing", () => {
    expect(mapGulfTalent({ title: "Cloud Engineer", company: "Emirates NBD", location: "Dubai, UAE", salaryText: "AED 30,000", canonicalUrl: "https://www.gulftalent.com/x", postedAt: "2026-10-28" }))
      .toMatchObject({ title: "Cloud Engineer", company: "Emirates NBD", source: "GulfTalent", salary: "AED 30,000", url: "https://www.gulftalent.com/x" });
  });
});

describe("source inputs", () => {
  it("sends Indeed the city and its own code for the UK", () => {
    expect(source("Indeed").input(params, "gb")).toMatchObject({ title: "data engineer", location: "Sydney", country: "uk" });
  });
  it("passes the user's radius to boards that filter by distance", () => {
    const p = { ...params, radiusKm: 25, center: { lat: 25.08, lon: 55.14 } };
    expect(source("Bayt").input(p, "ae")).toMatchObject({ country: "AE", searchRadiusKm: 25, searchLatitude: "25.08" });
    expect(source("StepStone").input(p, "de")).toMatchObject({ radius: "30" });
    // 25 km ≈ 15.5 miles → the next Totaljobs option up.
    expect(source("Totaljobs").input(p, "gb")).toMatchObject({ radius: "20" });
    expect(source("Totaljobs").input({ ...p, radiusKm: 100 }, "gb")).toMatchObject({ radius: "30" });
  });
  it("leaves radius out when the user didn't ask for one", () => {
    expect(source("StepStone").input(params, "de")).not.toHaveProperty("radius");
    expect(source("Bayt").input(params, "ae")).not.toHaveProperty("searchRadiusKm");
  });
});

describe("date-posted translation", () => {
  const within = (h: number) => ({ ...params, postedWithinHours: h });
  it("maps sub-day windows to LinkedIn seconds and day boards to their narrowest bucket", () => {
    expect(source("LinkedIn").input(within(4), "")).toMatchObject({ job_post_time: "14400" });
    expect(source("LinkedIn").input(within(12), "")).toMatchObject({ job_post_time: "43200" });
    // Day-level boards can't do sub-day, so 12h snaps to "1 day".
    expect(source("Indeed").input(within(12), "gb")).toMatchObject({ datePosted: "1" });
    expect(source("SEEK").input(within(12), "au")).toMatchObject({ dateRange: "1" });
    expect(source("Bayt").input(within(12), "ae")).toMatchObject({ datePosted: "past-24h" });
    expect(source("StepStone").input(within(12), "de")).toMatchObject({ age: 1 });
  });
  it("maps the coarse windows per board", () => {
    expect(source("LinkedIn").input(within(24), "")).toMatchObject({ posted_within: "Past 24 hours" });
    expect(source("LinkedIn").input(within(168), "")).toMatchObject({ posted_within: "Past Week" });
    expect(source("LinkedIn").input(within(720), "")).toMatchObject({ posted_within: "Past Month" });
    expect(source("Indeed").input(within(720), "gb")).toMatchObject({ datePosted: "14" });
    expect(source("SEEK").input(within(720), "au")).toMatchObject({ dateRange: "31" });
    expect(source("Bayt").input(within(720), "ae")).toMatchObject({ datePosted: "past-month" });
    expect(source("StepStone").input(within(720), "de")).toMatchObject({ age: 30 });
  });
});

// Shapes taken from the live test run of each actor (2026-10-29).
describe("mappers on live records", () => {
  it("never asks LinkedIn for fewer than 10 jobs (the actor rejects it)", () => {
    expect(SOURCES.find((s) => s.name === "LinkedIn")!.input({ ...params, maxResults: 3 }, "au")).toMatchObject({ jobs_entries: 10 });
  });
  it("uses LinkedIn's real date, not '5 days ago'", () => {
    expect(SOURCES.find((s) => s.name === "LinkedIn")!.map({ job_title: "Core Java Developer", time_posted: "5 days ago", posted_date: "2026-10-23" }).postedDate)
      .toBe("2026-10-23");
  });
  it("dates a re-listed Indeed ad by when it went up on Indeed", () => {
    expect(mapIndeed({ title: "SDE", datePublished: "2026-02-10T06:00:00.000Z", dateOnIndeed: "2026-10-27T14:54:20.187Z" }).postedDate)
      .toBe("2026-10-27T14:54:20.187Z");
  });
  it("strips JobStreet's glued-on 'New' badge but not real words", () => {
    const js = SOURCES.find((s) => s.name === "JobStreet")!;
    expect(js.map({ title: "Principal Backend Development Engineer (C++)New" }).title).toBe("Principal Backend Development Engineer (C++)");
    expect(js.map({ title: "Account Manager - New Business" }).title).toBe("Account Manager - New Business");
  });
  it("drops GulfTalent's placeholder salary when the employer hid it", () => {
    const item = { title: "Engineer", salaryText: "1000 - 1001 AED", salaryMin: 1000, salaryMax: 1001 };
    expect(mapGulfTalent({ ...item, salaryDisclosed: false }).salary).toBeUndefined();
    expect(mapGulfTalent({ ...item, salaryText: "AED 25,000 - 30,000", salaryDisclosed: true }).salary).toBe("AED 25,000 - 30,000");
  });
  it("ignores Totaljobs' non-coordinate geo field", () => {
    expect(mapTotaljobs({ title: "Dev", location: "London", postCode: null, geo: "TOTALJOBS" }).geo).toBeUndefined();
  });
});

describe("mappers", () => {
  it("maps Indeed and trusts coordinates only for address-level listings", () => {
    const base = {
      title: "Data Engineer",
      url: "https://au.indeed.com/viewjob?jk=1",
      employer: { name: "Acme" },
      baseSalary: { min: 120000, max: 140000, unitOfWork: "YEAR", currencyCode: "AUD" },
      description: { text: "Build pipelines" },
      datePublished: "2026-10-27T00:00:00.000Z",
    };
    const cityOnly = mapIndeed({ ...base, location: { city: "Sydney", admin1Code: "NSW", countryName: "Australia", latitude: -33.87, longitude: 151.21 } });
    expect(cityOnly).toMatchObject({
      title: "Data Engineer", company: "Acme", location: "Sydney, NSW, Australia", source: "Indeed",
      salary: "AUD 120,000 – 140,000 /year", description: "Build pipelines",
    });
    expect(cityOnly.geo).toBeUndefined();
    const withPostcode = mapIndeed({ ...base, location: { city: "Sydney", postalCode: "2010", latitude: -33.886, longitude: 151.211 } });
    expect(withPostcode.geo).toEqual({ lat: -33.886, lon: 151.211 });
  });
  it("maps Totaljobs with postcode-level coordinates", () => {
    const job = mapTotaljobs({ title: "Engineer", company: "Co", location: "London", postCode: "EC2A", geo: { lat: 51.52, lon: -0.08 }, url: "u" });
    expect(job).toMatchObject({ location: "London, EC2A", source: "Totaljobs", geo: { lat: 51.52, lon: -0.08 } });
  });
  it("maps Bayt and WTTJ, building a salary string from min/max", () => {
    expect(mapBayt({ title: "Dev", company: "X", location: "Dubai, UAE", salaryMin: 15000, salaryMax: 20000, salaryCurrency: "AED", salaryPeriod: "Month" }))
      .toMatchObject({ salary: "AED 15,000 – 20,000 /month", source: "Bayt" });
    expect(mapWttj({ title: "Dev", companyName: "Y", city: "Paris", countryCode: "FR" }))
      .toMatchObject({ company: "Y", location: "Paris, FR" });
  });
  it("ignores non-string junk in fields", () => {
    expect(mapBayt({ title: { nested: true }, company: 42 }).title).toBeUndefined();
  });
});
