// Radius filtering: geocodes the user's suburb/postcode and each scraped job's
// location, then keeps only jobs within the requested distance.
//
// Geocoding uses OpenStreetMap Nominatim (free, no key). Its usage policy asks
// for an identifying User-Agent and at most ~1 request/second, so lookups are
// serialized with a gap and cached per process (Fluid Compute reuses instances,
// and most scraped jobs share a handful of location strings).

export type GeoPoint = {
  lat: number;
  lon: number;
  // Half the diagonal of the place's bounding box, in km. A suburb is ~1-3 km, a
  // city 10-100 km, a state or country hundreds. Used to tell "this job is in
  // Bangsar" apart from "this job is somewhere in Sydney" or "somewhere in Malaysia".
  extentKm: number;
  // Short human name for reasons, e.g. "Surry Hills, Australia".
  label: string;
  // City-level name for the job-board query, e.g. "Sydney, Australia". Job boards
  // don't understand postcodes and return little for small suburbs.
  area: string;
  // The same city without the country ("Sydney"), for boards that are already
  // scoped to one country and reject "Sydney, Australia" as a location.
  city: string;
  countryCode?: string; // ISO 3166-1 alpha-2, lower case
};

export type Geocoder = (query: string, opts?: { countryCode?: string }) => Promise<GeoPoint | null>;

export const RADIUS_OPTIONS_KM = [5, 10, 25, 50, 100] as const;

// A job location broader than this (a state, emirate or country) can't be checked
// against a radius at all. Up to it (a city or metro area: Greater Melbourne is
// ~100 km), a job listed only by city is kept if that city reaches the radius.
const CITY_MAX_EXTENT_KM = 110;
// How much of a city's bounding box counts as "where its jobs are". The box's
// half-diagonal overstates it (boxes include outskirts, water, farmland, and
// city jobs cluster near the centre); the full box would put Johor Bahru inside
// a 10 km radius of central Singapore.
const CITY_SPREAD = 0.35;

const EARTH_RADIUS_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

// Great-circle distance between two points, in km.
export function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// True when the input is only a postcode ("2010", "10115", "SW1A 1AA", "1012 AB"):
// no word of 3+ letters. Postcodes repeat across countries (2010 is Sydney, and
// also a town in Albania), so these need a country to resolve reliably.
export function isBarePostcode(input: string): boolean {
  return /\d/.test(input) && !/\b[\p{L}]{3,}\b/u.test(input);
}

// Rewrites a job board's location string into something a geocoder resolves to
// the right place. LinkedIn emits "Greater Sydney Area", "Berlin Metropolitan
// Area", "Berlin, Berlin, Germany", "Hybrid - London"; geocoded as-is these land
// on the wrong continent. Returns "" for non-places (EMEA, Worldwide).
export function normalizeJobLocation(raw: string): string {
  let s = raw
    .replace(/\((?:hybrid|on-?site|in[- ]office|remote)[^)]*\)/gi, " ")
    .replace(/\b(?:hybrid|on-?site|in[- ]office)\b\s*[-–:]?\s*/gi, " ")
    .replace(/\bgreater\s+/gi, "")
    .replace(/\s+(?:metropolitan|metro)\s+(?:area|region)\b/gi, "")
    .replace(/\s+area\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-–,\s]+|[-–,\s]+$/g, "");
  // Drop a part that just repeats the one before it ("Berlin, Berlin", "Bangkok,
  // Bangkok City", "Kuala Lumpur, Federal Territory of Kuala Lumpur").
  const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const p of parts) {
    const prev = kept[kept.length - 1]?.toLowerCase();
    if (prev && p.toLowerCase().includes(prev)) continue;
    kept.push(p);
  }
  s = kept.join(", ");
  // Trading blocs and multi-city regions aren't places a radius can check; OSM
  // would otherwise match a namesake (Randstad → Almere Stad, EMEA → Indonesia).
  if (/^(?:emea|apac|amer|americas|latam|anz|europe|asia|asia pacific|worldwide|global|anywhere|international|randstad|benelux|dach|nordics|gcc|middle east)\b/i.test(s)) return "";
  return s;
}

const cache = new Map<string, GeoPoint | null>();
let queue: Promise<unknown> = Promise.resolve();
const MIN_GAP_MS = 1100;
const USER_AGENT = process.env.GEOCODER_USER_AGENT || "job-matcher-web/0.1 (radius filter)";

// The subset of a Nominatim jsonv2 search result this module reads.
type NominatimItem = {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  boundingbox?: string[];
  address?: Partial<Record<
    "suburb" | "neighbourhood" | "city_district" | "town" | "city" | "village" | "municipality" | "county" | "state" | "country" | "country_code",
    string
  >>;
};

function placeNames(item: NominatimItem): { label: string; area: string; city: string } {
  const a = item.address ?? {};
  const country = a.country;
  const join = (place?: string) => [...new Set([place, country].filter(Boolean))].join(", ");
  const local =
    a.suburb || a.neighbourhood || a.city_district || a.town || a.city || a.village || a.county || a.state || item.name;
  // New Zealand's OSM "city" is a local board (1010 → Waitematā); its regions are
  // what job boards use (Auckland, Wellington, Canterbury).
  const city = ((a.country_code === "nz" && a.state) || a.town || a.city || a.municipality || a.county || a.state || "")
    .replace(/^greater\s+/i, "")
    .replace(/\s+emirate$/i, "")
    .replace(/\s+\d+$/, ""); // postal districts: "Dublin 2" → "Dublin"
  const cityName = city || local?.replace(/\s+\d+$/, "") || "";
  return { label: join(local) || String(item.display_name ?? ""), area: join(cityName), city: cityName };
}

async function nominatim(query: string, countryCode?: string): Promise<GeoPoint | null> {
  const params = new URLSearchParams({ format: "jsonv2", limit: "1", addressdetails: "1", "accept-language": "en", q: query });
  if (countryCode) params.set("countrycodes", countryCode);
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Geocoder failed (${res.status})`);
  const items = (await res.json()) as NominatimItem[];
  const item = items[0];
  if (!item) return null;
  const lat = Number(item.lat);
  const lon = Number(item.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  // boundingbox is [south, north, west, east] as strings.
  const [s, n, w, e] = (item.boundingbox ?? []).map(Number);
  const extentKm = [s, n, w, e].every(Number.isFinite) ? haversineKm({ lat: s, lon: w }, { lat: n, lon: e }) / 2 : 0;
  return { lat, lon, extentKm, ...placeNames(item), countryCode: item.address?.country_code };
}

// Cached, rate-limited Nominatim lookup. Returns null when the place can't be found
// or the geocoder errors (a flaky lookup shouldn't fail the whole search).
export const geocode: Geocoder = async (query, opts) => {
  const key = `${opts?.countryCode ?? ""}|${query.trim().toLowerCase()}`;
  if (!query.trim()) return null;
  if (cache.has(key)) return cache.get(key)!;
  const run = queue.then(async () => {
    try {
      return await nominatim(query, opts?.countryCode);
    } catch (e) {
      console.warn("[geo] lookup failed:", query, e);
      return undefined; // don't cache transient failures
    } finally {
      await new Promise((r) => setTimeout(r, MIN_GAP_MS));
    }
  });
  queue = run.catch(() => {});
  const point = await run;
  if (point !== undefined) cache.set(key, point);
  return point ?? null;
};

const isRemote = (location: string) => /\bremote\b|work from home|\bwfh\b/i.test(location);

export type RadiusVerdict =
  | { keep: true; distanceKm: number | null; reason: string }
  | { keep: false; why: "outside" | "vague" | "unknown" | "remote" };

// Decide one job against the radius. When the user asks for a radius they asked
// for ONLY jobs inside it, so a location that can't be pinned down (unparseable,
// or as broad as a whole state/country) is dropped, not kept. A job listed only by
// city ("Sydney") is kept when that city reaches the radius, and says so.
export async function checkRadius(
  jobLocation: string | undefined,
  center: GeoPoint,
  radiusKm: number,
  opts: { remoteOk: boolean; geocoder?: Geocoder; coords?: { lat: number; lon: number } }
): Promise<RadiusVerdict> {
  const raw = (jobLocation ?? "").trim();
  if (opts.coords && !isRemote(raw)) {
    const distanceKm = haversineKm(center, opts.coords);
    if (distanceKm > radiusKm) return { keep: false, why: "outside" };
    return { keep: true, distanceKm, reason: `${Math.max(1, Math.round(distanceKm))} km from ${center.label}` };
  }
  if (!raw) return { keep: false, why: "unknown" };
  const loc = normalizeJobLocation(raw);
  if (isRemote(raw)) {
    return opts.remoteOk ? { keep: true, distanceKm: null, reason: "Remote (radius not applied)" } : { keep: false, why: "remote" };
  }
  if (!loc) return { keep: false, why: "unknown" };
  const lookup = opts.geocoder ?? geocode;

  // Multi-office ads list several cities ("Aachen, Augsburg, Berlin, Bonn, …,
  // weitere Standorte in DE"). Geocoded as one string that lands on the first
  // city, so check each one and keep the job if any office is in range.
  const offices = multiLocationParts(loc, center);
  if (offices) {
    let best: RadiusVerdict = { keep: false, why: "outside" };
    for (const office of offices) {
      const v = await checkPlace(office, center, radiusKm, lookup);
      if (v.keep && (v.distanceKm !== null || !best.keep)) best = v;
      if (best.keep && best.distanceKm !== null) break;
    }
    return best;
  }
  return checkPlace(loc, center, radiusKm, lookup);
}

const MORE_LOCATIONS = /(?:\b(?:weitere standorte|more locations|other locations|multiple locations|and \d+ more)\b|\+\s*\d+\b).*$/i;

// The cities of a multi-office listing, or null for an ordinary location. A plain
// "Suburb, City, State, Country" also has commas, so a list needs a "more
// locations" marker, or 4+ parts with none of them the user's country.
export function multiLocationParts(loc: string, center: GeoPoint): string[] | null {
  const marked = MORE_LOCATIONS.test(loc);
  const parts = loc.replace(MORE_LOCATIONS, "").split(",").map((p) => p.trim()).filter(Boolean);
  const country = center.area.split(",").pop()?.trim().toLowerCase();
  const namesCountry = parts.some((p) => p.toLowerCase() === country);
  if (!marked && (parts.length < 4 || namesCountry)) return null;
  return parts.slice(0, 8);
}

async function checkPlace(loc: string, center: GeoPoint, radiusKm: number, lookup: Geocoder): Promise<RadiusVerdict> {
  // A bare city name ("Sydney", "Amsterdam") is ambiguous worldwide; look it up in
  // the user's country first. Anything with a comma usually names its country.
  let point = !loc.includes(",") && center.countryCode ? await lookup(loc, { countryCode: center.countryCode }) : null;
  point ??= await lookup(loc);
  if (!point) return { keep: false, why: "unknown" };
  if (point.extentKm > CITY_MAX_EXTENT_KM) return { keep: false, why: "vague" };
  const distanceKm = haversineKm(center, point);
  if (point.extentKm <= radiusKm) {
    if (distanceKm > radiusKm) return { keep: false, why: "outside" };
    return { keep: true, distanceKm, reason: `${Math.max(1, Math.round(distanceKm))} km from ${center.label}` };
  }
  // City-level listing: the job is somewhere in a place wider than the radius.
  if (distanceKm > radiusKm + point.extentKm * CITY_SPREAD) return { keep: false, why: "outside" };
  return { keep: true, distanceKm: null, reason: `In ${point.area} (no suburb listed, so exact distance unknown)` };
}
