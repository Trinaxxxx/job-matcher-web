import { describe, it, expect } from "vitest";
import { haversineKm, checkRadius, isBarePostcode, normalizeJobLocation, multiLocationParts, type GeoPoint, type Geocoder } from "./geo";
import { buildStrategy } from "./strategy";

const pt = (lat: number, lon: number, extentKm: number, label: string, area = label): GeoPoint => ({
  lat, lon, extentKm, label, area, city: area.split(",")[0], countryCode: "my",
});
const bangsar = pt(3.1294, 101.6713, 1.5, "Bangsar, Malaysia", "Kuala Lumpur, Malaysia");

const places: Record<string, GeoPoint> = {
  "petaling jaya, selangor, malaysia": pt(3.1073, 101.6067, 6, "Petaling Jaya, Malaysia"),
  "george town, penang, malaysia": pt(5.4141, 100.3288, 5, "George Town, Malaysia"),
  "kuala lumpur, malaysia": pt(3.152, 101.704, 40, "Kuala Lumpur, Malaysia"),
  "johor bahru, malaysia": pt(1.4927, 103.7414, 30, "Johor Bahru, Malaysia"),
  singapore: pt(1.357, 103.819, 60, "Singapore"),
  malaysia: pt(4.57, 102.27, 900, "Malaysia"),
};
const fakeGeocoder: Geocoder = async (q) => places[q.trim().toLowerCase()] ?? null;
const opts = { remoteOk: false, geocoder: fakeGeocoder };

describe("haversineKm", () => {
  it("is zero for the same point", () => {
    expect(haversineKm(bangsar, bangsar)).toBe(0);
  });
  it("matches a known distance (KL → Penang ≈ 290 km)", () => {
    const d = haversineKm(bangsar, places["george town, penang, malaysia"]);
    expect(d).toBeGreaterThan(270);
    expect(d).toBeLessThan(310);
  });
});

describe("isBarePostcode", () => {
  it("flags postcodes with no place name", () => {
    for (const q of ["2010", "10115", "SW1A 1AA", "1012 AB", "M5V 3L9", "018956"]) expect(isBarePostcode(q)).toBe(true);
  });
  it("accepts postcodes with a place or country, and plain place names", () => {
    for (const q of ["2010 Australia", "Surry Hills NSW 2010", "10115 Berlin", "Bangsar", "Dubai Marina"]) expect(isBarePostcode(q)).toBe(false);
  });
});

describe("normalizeJobLocation", () => {
  it.each([
    ["Greater Sydney Area", "Sydney"],
    ["Berlin Metropolitan Area", "Berlin"],
    ["Greater Paris Metropolitan Region", "Paris"],
    ["London Area, United Kingdom", "London, United Kingdom"],
    ["Berlin, Berlin, Germany", "Berlin, Germany"],
    ["Bangkok, Bangkok City, Thailand", "Bangkok, Thailand"],
    ["Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia", "Kuala Lumpur, Malaysia"],
    ["Hybrid - London", "London"],
    ["London (Hybrid)", "London"],
    ["Sydney, New South Wales, Australia", "Sydney, New South Wales, Australia"],
    ["EMEA", ""],
    ["Randstad, Netherlands", ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeJobLocation(input)).toBe(expected);
  });
});

describe("multi-office listings", () => {
  const kreuzberg: GeoPoint = { lat: 52.497, lon: 13.403, extentKm: 3, label: "Kreuzberg, Germany", area: "Berlin, Germany", city: "Berlin", countryCode: "de" };
  const cities: Record<string, GeoPoint> = {
    aachen: { ...kreuzberg, lat: 50.776, lon: 6.084, extentKm: 10, label: "Aachen, Germany", area: "Aachen, Germany", city: "Aachen" },
    augsburg: { ...kreuzberg, lat: 48.371, lon: 10.898, extentKm: 10, label: "Augsburg, Germany", area: "Augsburg, Germany", city: "Augsburg" },
    berlin: { ...kreuzberg, lat: 52.52, lon: 13.405, extentKm: 25, label: "Berlin, Germany", area: "Berlin, Germany", city: "Berlin" },
    bonn: { ...kreuzberg, lat: 50.737, lon: 7.098, extentKm: 10, label: "Bonn, Germany", area: "Bonn, Germany", city: "Bonn" },
  };
  const geocoder: Geocoder = async (q) => cities[q.trim().toLowerCase()] ?? null;

  it("keeps a StepStone job when any of its offices is in range", async () => {
    const v = await checkRadius("Aachen, Augsburg, Berlin, Bonn", kreuzberg, 10, { remoteOk: false, geocoder });
    expect(v.keep).toBe(true);
  });
  it("handles the 'weitere Standorte' marker", async () => {
    const v = await checkRadius("Berlin, weitere Standorte in DE", kreuzberg, 10, { remoteOk: false, geocoder });
    expect(v.keep).toBe(true);
  });
  it("drops it when no office is in range", async () => {
    expect(await checkRadius("Aachen, Augsburg, Bonn, Aachen", kreuzberg, 10, { remoteOk: false, geocoder })).toEqual({ keep: false, why: "outside" });
  });
  it("doesn't treat an ordinary 'Suburb, City, State, Country' as a list", () => {
    expect(multiLocationParts("Lane Cove West, Sydney, New South Wales, Germany", kreuzberg)).toBeNull();
    expect(multiLocationParts("Sydney, New South Wales, Australia", kreuzberg)).toBeNull();
  });
});

describe("checkRadius", () => {
  it("keeps a job inside the radius and explains the distance", async () => {
    const v = await checkRadius("Petaling Jaya, Selangor, Malaysia", bangsar, 25, opts);
    expect(v.keep).toBe(true);
    if (v.keep) expect(v.reason).toMatch(/^\d+ km from Bangsar, Malaysia$/);
  });
  it("drops a job outside the radius", async () => {
    expect(await checkRadius("George Town, Penang, Malaysia", bangsar, 25, opts)).toEqual({ keep: false, why: "outside" });
  });
  it("keeps a city-level listing when the city reaches the radius, flagged as approximate", async () => {
    const v = await checkRadius("Kuala Lumpur, Federal Territory of Kuala Lumpur, Malaysia", bangsar, 10, opts);
    expect(v).toMatchObject({ keep: true, distanceKm: null });
    if (v.keep) expect(v.reason).toMatch(/no suburb listed/);
  });
  it("drops a city-level listing in a city far away", async () => {
    expect(await checkRadius("Johor Bahru, Malaysia", bangsar, 25, opts)).toEqual({ keep: false, why: "outside" });
  });
  it("doesn't let a neighbouring city's wide bounding box reach into the radius", async () => {
    const tanjongPagar = pt(1.276, 103.845, 0.5, "Tanjong Pagar, Singapore", "Singapore");
    expect(await checkRadius("Johor Bahru, Malaysia", tanjongPagar, 10, opts)).toEqual({ keep: false, why: "outside" });
    expect((await checkRadius("Singapore", tanjongPagar, 10, opts)).keep).toBe(true);
  });
  it("drops a location too broad to check against the radius", async () => {
    expect(await checkRadius("Malaysia", bangsar, 50, opts)).toEqual({ keep: false, why: "vague" });
  });
  it("drops unknown, missing or non-place locations", async () => {
    expect(await checkRadius("Nowhere-ville", bangsar, 25, opts)).toEqual({ keep: false, why: "unknown" });
    expect(await checkRadius(undefined, bangsar, 25, opts)).toEqual({ keep: false, why: "unknown" });
    expect(await checkRadius("EMEA", bangsar, 25, opts)).toEqual({ keep: false, why: "unknown" });
  });
  it("keeps remote jobs only when the user accepts remote", async () => {
    expect((await checkRadius("Remote", bangsar, 10, opts)).keep).toBe(false);
    expect((await checkRadius("Malaysia (Remote)", bangsar, 10, { ...opts, remoteOk: true })).keep).toBe(true);
  });
  it("uses board-supplied coordinates directly instead of geocoding", async () => {
    const never: Geocoder = async () => { throw new Error("should not geocode"); };
    const near = await checkRadius("Kuala Lumpur", bangsar, 5, { remoteOk: false, geocoder: never, coords: { lat: 3.14, lon: 101.68 } });
    expect(near).toMatchObject({ keep: true, reason: "2 km from Bangsar, Malaysia" });
    const far = await checkRadius("Kuala Lumpur", bangsar, 5, { remoteOk: false, geocoder: never, coords: { lat: 3.2, lon: 101.75 } });
    expect(far).toEqual({ keep: false, why: "outside" });
  });
  it("looks up a bare city name in the user's country first", async () => {
    const seen: (string | undefined)[] = [];
    const spy: Geocoder = async (q, o) => (seen.push(o?.countryCode), places["petaling jaya, selangor, malaysia"]);
    await checkRadius("Petaling Jaya", bangsar, 25, { remoteOk: false, geocoder: spy });
    expect(seen[0]).toBe("my");
  });
});

describe("buildStrategy radiusKm", () => {
  it("parses a positive radius and ignores blank / invalid ones", () => {
    expect(buildStrategy("", { locations: "50450", radiusKm: "25" }).radiusKm).toBe(25);
    expect(buildStrategy("", { locations: "50450", radiusKm: "" }).radiusKm).toBeUndefined();
    expect(buildStrategy("", { locations: "50450", radiusKm: "abc" }).radiusKm).toBeUndefined();
  });
  it("keeps the whole location answer as the radius centre", () => {
    expect(buildStrategy("", { locations: "Surry Hills, Sydney", radiusKm: "10" }).radiusCenter).toBe("Surry Hills, Sydney");
    expect(buildStrategy("", { locations: "Surry Hills, Sydney" }).radiusCenter).toBeUndefined();
  });
});
