import { describe, it, expect } from "vitest";
import { remoteEligible, countryName, mapHimalayas, isWorldwideText } from "./remote";
import { buildStrategy } from "./strategy";

describe("remoteEligible", () => {
  it("accepts worldwide roles for everyone, in every mode", () => {
    expect(remoteEligible([], "my")).toBe(true);
    expect(remoteEligible([], "my", "nomad")).toBe(true);
    expect(remoteEligible([], undefined)).toBe(true);
  });
  it("accepts a country-restricted role only for people in that country", () => {
    expect(remoteEligible(["Malaysia", "Singapore"], "my")).toBe(true);
    expect(remoteEligible(["United States"], "my")).toBe(false);
    expect(remoteEligible(["United States"], "us")).toBe(true);
  });
  it("matches the names countries go by in ads", () => {
    expect(remoteEligible(["United Kingdom"], "gb")).toBe(true);
    expect(remoteEligible(["UAE"], "ae")).toBe(true);
    expect(remoteEligible(["Russian Federation"], "ru")).toBe(true);
  });
  it("rejects country-restricted roles in nomad mode, or when the user's country is unknown", () => {
    expect(remoteEligible(["Malaysia"], "my", "nomad")).toBe(false);
    expect(remoteEligible(["Malaysia"], undefined)).toBe(false);
  });
});

describe("countryName / isWorldwideText", () => {
  it("names countries the way Himalayas lists them", () => {
    expect(countryName("my")).toBe("Malaysia");
    expect(countryName("ae")).toBe("United Arab Emirates");
    expect(countryName(undefined)).toBeUndefined();
  });
  it("spots work-from-anywhere wording", () => {
    expect(isWorldwideText("Remote — Worldwide")).toBe(true);
    expect(isWorldwideText("Anywhere")).toBe(true);
    expect(isWorldwideText("Remote — United States")).toBe(false);
  });
});

describe("mapHimalayas", () => {
  const job = {
    title: "Backend Engineer",
    companyName: "Acme",
    minSalary: 60000,
    maxSalary: 80000,
    currency: "USD",
    salaryPeriod: "annual",
    locationRestrictions: ["Malaysia", "Singapore"],
    description: "<p>Build APIs &amp; services.</p><ul><li>Go</li></ul>",
    pubDate: 1793000000,
    applicationLink: "https://himalayas.app/companies/acme/jobs/backend?utm_source=api",
  };
  it("labels it remote with where it hires, keeps the Himalayas apply link, and strips HTML", () => {
    expect(mapHimalayas(job)).toMatchObject({
      location: "Remote — Malaysia, Singapore",
      source: "Himalayas",
      url: job.applicationLink,
      salary: "USD 60,000 – 80,000 /annual",
      description: "Build APIs & services.\nGo",
    });
  });
  it("labels unrestricted roles worldwide", () => {
    expect(mapHimalayas({ ...job, locationRestrictions: [] }).location).toBe("Remote — Worldwide");
  });
});

describe("buildStrategy remoteMode", () => {
  it("keeps the remote mode only when remote is on", () => {
    expect(buildStrategy("", { remoteOk: true, remoteMode: "nomad" }).remoteMode).toBe("nomad");
    expect(buildStrategy("", { remoteOk: false, remoteMode: "nomad" }).remoteMode).toBeUndefined();
    expect(buildStrategy("", { remoteOk: true, remoteMode: "" }).remoteMode).toBeUndefined();
  });
});
