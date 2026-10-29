// Salary parsing and comparison across the countries the app searches.
//
// Job ads state pay in wildly different shapes: "$110,000 + super" (AU, annual
// by convention), "Rp 15.000.000" (ID, dot thousands, monthly), "45 000 € par an"
// (FR, space thousands), "12-18 LPA" (IN, lakhs per annum), "AED 15k/month".
// This module turns those into one comparable number and compares it with the
// user's floor ONLY when both are in the same currency — a wrong conversion
// would silently hide good jobs, so a foreign-currency job is never excluded.
//
// Pure and dependency-free: used by the scorer (server) and the profile form
// (browser, for the currency/period dropdowns and location auto-fill).

export type PayPeriod = "hour" | "day" | "week" | "fortnight" | "semimonth" | "month" | "year";
export type FloorPeriod = "month" | "year";

type Currency = {
  code: string;
  name: string;
  // Lower-case markers that identify the currency in an ad. "$" alone is
  // ambiguous and handled separately (see DOLLAR_CODES).
  marks: string[];
  // How ads in this currency state pay when they don't say: Anglo/EU/Indian
  // markets quote annual packages, most of Asia, the Gulf and LatAm quote monthly.
  period: FloorPeriod;
};

export const CURRENCIES: Currency[] = [
  { code: "AUD", name: "Australian dollar", marks: ["aud", "a$", "au$"], period: "year" },
  { code: "NZD", name: "New Zealand dollar", marks: ["nzd", "nz$"], period: "year" },
  { code: "MYR", name: "Malaysian ringgit", marks: ["myr", "rm"], period: "month" },
  { code: "SGD", name: "Singapore dollar", marks: ["sgd", "s$"], period: "month" },
  { code: "IDR", name: "Indonesian rupiah", marks: ["idr", "rp"], period: "month" },
  { code: "PHP", name: "Philippine peso", marks: ["php", "₱"], period: "month" },
  { code: "THB", name: "Thai baht", marks: ["thb", "฿", "baht"], period: "month" },
  { code: "HKD", name: "Hong Kong dollar", marks: ["hkd", "hk$"], period: "month" },
  { code: "AED", name: "UAE dirham", marks: ["aed", "dhs", "dirham"], period: "month" },
  { code: "SAR", name: "Saudi riyal", marks: ["sar", "riyal"], period: "month" },
  { code: "QAR", name: "Qatari riyal", marks: ["qar", "qr"], period: "month" },
  { code: "KWD", name: "Kuwaiti dinar", marks: ["kwd", "kd"], period: "month" },
  { code: "BHD", name: "Bahraini dinar", marks: ["bhd"], period: "month" },
  { code: "OMR", name: "Omani rial", marks: ["omr"], period: "month" },
  { code: "EGP", name: "Egyptian pound", marks: ["egp", "e£"], period: "month" },
  { code: "JOD", name: "Jordanian dinar", marks: ["jod", "jd"], period: "month" },
  { code: "EUR", name: "Euro", marks: ["eur", "€", "euro", "euros"], period: "year" },
  { code: "GBP", name: "British pound", marks: ["gbp", "£"], period: "year" },
  { code: "USD", name: "US dollar", marks: ["usd", "us$"], period: "year" },
  { code: "CAD", name: "Canadian dollar", marks: ["cad", "c$", "ca$"], period: "year" },
  { code: "INR", name: "Indian rupee", marks: ["inr", "₹", "rs", "rs."], period: "year" },
  { code: "CHF", name: "Swiss franc", marks: ["chf"], period: "year" },
  { code: "SEK", name: "Swedish krona", marks: ["sek"], period: "month" },
  { code: "NOK", name: "Norwegian krone", marks: ["nok"], period: "year" },
  { code: "DKK", name: "Danish krone", marks: ["dkk"], period: "month" },
  { code: "PLN", name: "Polish złoty", marks: ["pln", "zł", "zl"], period: "month" },
  { code: "CZK", name: "Czech koruna", marks: ["czk", "kč"], period: "month" },
  { code: "HUF", name: "Hungarian forint", marks: ["huf"], period: "month" },
  { code: "RON", name: "Romanian leu", marks: ["ron", "lei"], period: "month" },
  { code: "TRY", name: "Turkish lira", marks: ["₺"], period: "month" },
  { code: "ILS", name: "Israeli shekel", marks: ["ils", "₪", "nis"], period: "month" },
  { code: "ZAR", name: "South African rand", marks: ["zar"], period: "year" },
  { code: "NGN", name: "Nigerian naira", marks: ["ngn", "₦"], period: "month" },
  { code: "KES", name: "Kenyan shilling", marks: ["kes", "ksh"], period: "month" },
  { code: "MAD", name: "Moroccan dirham", marks: [], period: "month" },
  { code: "PKR", name: "Pakistani rupee", marks: ["pkr"], period: "month" },
  { code: "BDT", name: "Bangladeshi taka", marks: ["bdt", "৳"], period: "month" },
  { code: "LKR", name: "Sri Lankan rupee", marks: ["lkr"], period: "month" },
  { code: "VND", name: "Vietnamese dong", marks: ["vnd", "₫", "đ"], period: "month" },
  { code: "CNY", name: "Chinese yuan", marks: ["cny", "rmb", "元"], period: "month" },
  { code: "TWD", name: "New Taiwan dollar", marks: ["twd", "nt$"], period: "month" },
  { code: "JPY", name: "Japanese yen", marks: ["jpy", "¥", "円"], period: "year" },
  { code: "KRW", name: "South Korean won", marks: ["krw", "₩"], period: "year" },
  { code: "BRL", name: "Brazilian real", marks: ["brl", "r$"], period: "month" },
  { code: "MXN", name: "Mexican peso", marks: ["mxn", "mx$"], period: "month" },
  { code: "ARS", name: "Argentine peso", marks: ["ars"], period: "month" },
  { code: "CLP", name: "Chilean peso", marks: ["clp"], period: "month" },
  { code: "COP", name: "Colombian peso", marks: [], period: "month" },
];

const BY_CODE = new Map(CURRENCIES.map((c) => [c.code, c]));
// Currencies a bare "$" can mean. When the user's own currency is one of these,
// a bare "$" in a (country-scoped) job ad is read as theirs.
const DOLLAR_CODES = new Set(["AUD", "NZD", "SGD", "HKD", "USD", "CAD", "TWD"]);

export function currencyInfo(code?: string): Currency | undefined {
  return code ? BY_CODE.get(code) : undefined;
}

// Map whatever the user typed ("RM", "myr", "S$", "Ringgit") to an ISO code.
export function normalizeCurrency(input?: string): string | undefined {
  const s = (input ?? "").trim().toLowerCase();
  if (!s) return undefined;
  const up = s.toUpperCase();
  if (BY_CODE.has(up)) return up;
  for (const c of CURRENCIES) if (c.marks.includes(s) || c.name.toLowerCase() === s) return c.code;
  return undefined;
}

// ---------------------------------------------------------------------------
// Country → currency, for auto-filling from the Location field
// ---------------------------------------------------------------------------

const EURO = ["de", "at", "be", "fr", "es", "nl", "ie", "it", "pt", "fi", "gr", "lu", "sk", "si", "ee", "lv", "lt", "mt", "cy", "hr"];

export const COUNTRY_CURRENCY: Record<string, string> = {
  au: "AUD", nz: "NZD", my: "MYR", sg: "SGD", id: "IDR", ph: "PHP", th: "THB", hk: "HKD",
  ae: "AED", sa: "SAR", qa: "QAR", kw: "KWD", bh: "BHD", om: "OMR", eg: "EGP", jo: "JOD",
  gb: "GBP", us: "USD", ca: "CAD", in: "INR", ch: "CHF", se: "SEK", no: "NOK", dk: "DKK",
  pl: "PLN", cz: "CZK", hu: "HUF", ro: "RON", tr: "TRY", il: "ILS", za: "ZAR", ng: "NGN",
  ke: "KES", ma: "MAD", pk: "PKR", bd: "BDT", lk: "LKR", vn: "VND", cn: "CNY", tw: "TWD",
  jp: "JPY", kr: "KRW", br: "BRL", mx: "MXN", ar: "ARS", cl: "CLP", co: "COP",
  ...Object.fromEntries(EURO.map((cc) => [cc, "EUR"])),
};

// Extra names a country goes by, plus major job-market cities, so a location
// like "Bangsar, Kuala Lumpur" or "Dubai" resolves without a geocoder.
const PLACE_ALIASES: Record<string, string[]> = {
  au: ["sydney", "melbourne", "brisbane", "perth", "adelaide", "canberra", "gold coast", "hobart", "darwin", "nsw", "vic", "qld"],
  nz: ["auckland", "wellington", "christchurch", "hamilton"],
  my: ["kuala lumpur", "kl", "selangor", "petaling jaya", "penang", "johor bahru", "cyberjaya", "putrajaya", "shah alam", "bangsar"],
  sg: ["singapore"],
  id: ["jakarta", "surabaya", "bandung", "bali"],
  ph: ["manila", "makati", "taguig", "cebu", "quezon city", "pasig"],
  th: ["bangkok", "chiang mai", "phuket"],
  hk: ["hong kong", "kowloon"],
  ae: ["uae", "dubai", "abu dhabi", "sharjah"],
  sa: ["ksa", "riyadh", "jeddah", "dammam", "saudi"],
  qa: ["doha"],
  kw: ["kuwait city"],
  bh: ["manama"],
  om: ["muscat"],
  eg: ["cairo", "alexandria", "giza"],
  jo: ["amman"],
  de: ["berlin", "munich", "münchen", "hamburg", "frankfurt", "cologne", "köln", "stuttgart", "düsseldorf"],
  at: ["vienna", "wien", "graz", "salzburg", "linz"],
  be: ["brussels", "antwerp", "ghent", "bruxelles"],
  fr: ["paris", "lyon", "marseille", "toulouse", "lille", "bordeaux", "nantes"],
  es: ["madrid", "barcelona", "valencia", "seville"],
  nl: ["amsterdam", "rotterdam", "the hague", "utrecht", "eindhoven", "holland"],
  ie: ["dublin", "cork", "galway"],
  gb: ["uk", "england", "scotland", "wales", "london", "manchester", "birmingham", "edinburgh", "glasgow", "leeds", "bristol"],
  us: ["usa", "new york", "san francisco", "los angeles", "seattle", "austin", "chicago", "boston"],
  ca: ["toronto", "vancouver", "montreal", "calgary", "ottawa"],
  in: ["bangalore", "bengaluru", "mumbai", "delhi", "new delhi", "hyderabad", "pune", "chennai", "gurgaon", "gurugram", "noida"],
};

let placeIndex: [RegExp, string][] | null = null;
function buildPlaceIndex(): [RegExp, string][] {
  const names = new Map<string, string>();
  let display: Intl.DisplayNames | undefined;
  try {
    display = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    /* older runtimes: aliases only */
  }
  for (const cc of Object.keys(COUNTRY_CURRENCY)) {
    const name = display?.of(cc.toUpperCase());
    if (name) names.set(name.toLowerCase(), cc);
    for (const a of PLACE_ALIASES[cc] ?? []) names.set(a, cc);
  }
  // Longest first so "abu dhabi" wins over shorter overlapping names.
  return [...names.entries()]
    .sort((a, b) => b[0].length - a[0].length)
    .map(([n, cc]) => [new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu"), cc]);
}

// Best-guess country for a free-text location. The LAST place named wins
// ("Bangsar, Kuala Lumpur, Malaysia" → the country part).
export function countryForLocation(location?: string): string | undefined {
  const text = (location ?? "").trim();
  if (!text) return undefined;
  placeIndex ??= buildPlaceIndex();
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean).reverse();
  for (const part of parts) for (const [re, cc] of placeIndex) if (re.test(part)) return cc;
  return undefined;
}

// Euro countries where ads quote MONTHLY gross pay, unlike the euro default.
const MONTHLY_EURO = new Set(["at", "be", "nl", "pt", "gr", "sk", "si", "hr", "lt", "lv", "ee"]);

// Currency + the period salaries are usually quoted in, for a location.
export function payDefaultsForLocation(location?: string): { country: string; currency: string; period: FloorPeriod } | undefined {
  const country = countryForLocation(location);
  const currency = country ? COUNTRY_CURRENCY[country] : undefined;
  const info = currencyInfo(currency);
  if (!country || !info) return undefined;
  return { country, currency: info.code, period: MONTHLY_EURO.has(country) ? "month" : info.period };
}

// ---------------------------------------------------------------------------
// Parsing amounts
// ---------------------------------------------------------------------------

// Read one number token honouring local separators: "15.000.000" (dot
// thousands), "45 000" (space thousands), "12,00,000" (Indian lakh grouping),
// "3.5" / "12,5" (decimals).
function readNumber(token: string): number {
  // The tokenizer only lets whitespace/apostrophes through as thousands marks.
  let s = token.replace(/[\s  ']/g, "");
  if (/^\d{1,3}(,\d{2})+,\d{3}$/.test(s)) return Number(s.replace(/,/g, "")); // lakh grouping
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both present: whichever comes last is the decimal mark.
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    s = s.split(thou).join("").replace(dec, ".");
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const groups = s.split(sep);
    // "4.000" / "15.000.000" / "12,000" → thousands; "3.5" / "12,5" → decimal.
    s = groups.slice(1).every((g) => g.length === 3) ? groups.join("") : groups.join(".");
  }
  return Number(s);
}

const MULTIPLIERS: [RegExp, number, PayPeriod?][] = [
  [/^(lpa)$/, 100_000, "year"],
  [/^(l|lakh|lakhs|lac|lacs)$/, 100_000],
  [/^(cr|crore|crores)$/, 10_000_000],
  [/^(k)$/, 1_000],
  [/^(m|mn|mil|million|millions|mio)$/, 1_000_000],
];

// Period words in the languages of the markets searched. ORDER MATTERS: this is
// first-match-wins, so fortnight is checked before week ("bi-weekly" contains
// "weekly") and semimonth before month ("semi-monthly" contains "monthly").
const PERIOD_WORDS: [PayPeriod, RegExp][] = [
  ["hour", /\b(per\s*hour|hourly|an hour|a hour|hr|hrs|stunde|stündlich|heure|hora|uur|jam)\b|\/\s*h(ou)?r?\b|p\/h\b/],
  ["day", /\b(per\s*day|daily|a day|tag|täglich|jour|día|dia|dag|harian|hari)\b|\/\s*d(ay)?\b|p\/d\b/],
  // Fortnightly = every two weeks (26/yr), standard payroll in AU/NZ. "bi-weekly"
  // in job/payroll usage means the same. Must precede "week".
  ["fortnight", /\b(per\s*fortnight|fortnightly|a fortnight|bi-?weekly|every\s*(two|2)\s*weeks|14nly|quinzaine|quincenal|zwei\s*wochen)\b|\/\s*fortnight\b/],
  ["week", /\b(per\s*week|weekly|a week|wk|woche|semaine|semana|minggu)\b|\/\s*w(ee)?k\b|p\/w\b/],
  // Semi-monthly = twice a month (24/yr). Must precede "month".
  ["semimonth", /\b(semi-?monthly|twice\s*(a\s*)?month|twice\s*monthly|bimensuel)\b/],
  ["month", /\b(per\s*month|monthly|a month|month|months|mth|mths|mthly|pcm|monat|monatlich|mois|mensuel|mes|mensual|maand|bulan|sebulan)\b|\/\s*mo(nth)?\b|\bp\.?m\.?(?![a-z])/],
  // No bare "years" ("2 years experience") and French "an" only as "par an" /
  // "/an" ("an experienced…").
  ["year", /\b(per\s*(year|annum)|annually|annual|yearly|a year|annum|p\.?a\.?|pa|jahr|jährlich|par an|année|annuel|año|anual|jaar|ctc)\b|\/\s*y(ea)?r\b|\/\s*an\b/],
];

export type ParsedPay = {
  amount: number;       // the TOP of the stated range, in `period` units
  low: number;          // the BOTTOM of the range
  period: PayPeriod;
  periodStated: boolean;
  currency?: string;    // ISO code, when the ad names one
};

function detectCurrency(original: string, s: string, hint?: string): string | undefined {
  // An upper-case ISO code ("TRY", "MAD", "COP") is unambiguous even where the
  // lower-case form is an ordinary word, so check those first.
  for (const m of original.matchAll(/(?:^|[^A-Za-z])([A-Z]{3})(?=$|[^A-Za-z])/g)) if (BY_CODE.has(m[1])) return m[1];
  // Prefer the longest marker ("hk$" over "$", "rs." over "rs").
  let best: { code: string; len: number } | undefined;
  for (const c of CURRENCIES) {
    for (const m of c.marks) {
      const re = /^[a-z.]+$/.test(m)
        ? new RegExp(`(^|[^a-z])${m.replace(".", "\\.")}($|[^a-z])`)
        : null;
      const hit = re ? re.test(s) : s.includes(m);
      if (hit && (!best || m.length > best.len)) best = { code: c.code, len: m.length };
    }
  }
  if (best) return best.code;
  if (s.includes("$")) return hint && DOLLAR_CODES.has(hint) ? hint : "USD";
  return undefined;
}

export function parseSalary(text?: string, hintCurrency?: string): ParsedPay | null {
  if (!text) return null;
  const s = text.normalize("NFKC").toLowerCase();
  const nums: { v: number; mult?: number; per?: PayPeriod }[] = [];
  // Whitespace inside a number only as a thousands separator ("45 000"), so
  // "3 500" joins but "30 40" stays two numbers.
  const re = /(\d(?:\d|[.,']\d|\s(?=\d{3}(?!\d))\d)*)\s*([a-z]+)?/g;
  for (const m of s.matchAll(re)) {
    let v = readNumber(m[1]);
    if (!Number.isFinite(v) || v <= 0) continue;
    let mult: number | undefined;
    let per: PayPeriod | undefined;
    const suffix = m[2];
    if (suffix) {
      const hit = MULTIPLIERS.find(([r]) => r.test(suffix));
      if (hit) { mult = hit[1]; per = hit[2]; v *= mult; }
    }
    nums.push({ v, mult, per });
  }
  if (!nums.length) return null;
  // A multiplier on one end of a range applies to the other: "12-18 LPA",
  // "€50-60k".
  const withMult = nums.find((n) => n.mult);
  if (withMult) for (const n of nums) if (!n.mult && n.v < 1000) { n.v *= withMult.mult!; n.per ??= withMult.per; }

  let period: PayPeriod | undefined = nums.find((n) => n.per)?.per;
  for (const [p, rx] of PERIOD_WORDS) {
    if (period) break;
    if (rx.test(s)) period = p;
  }
  const currency = detectCurrency(text.normalize("NFKC"), s, normalizeCurrency(hintCurrency));
  const periodStated = !!period;
  // No period stated: use how ads in this currency are normally quoted.
  period ??= currencyInfo(currency ?? normalizeCurrency(hintCurrency))?.period ?? (Math.max(...nums.map((n) => n.v)) >= 30_000 ? "year" : "month");
  const values = nums.map((n) => n.v);
  return { amount: Math.max(...values), low: Math.min(...values), period, periodStated, currency };
}

// Lower end of whatever the user typed as their floor: "12,000 - 15,000" →
// 12000, "12k" → 12000, "45.000" → 45000, "12 LPA" → 1200000.
export function parseSalaryFloor(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? Math.round(v) : undefined;
  if (typeof v !== "string") return undefined;
  const p = parseSalary(v);
  return p ? Math.round(p.low) : undefined;
}

// ---------------------------------------------------------------------------
// Comparing with the user's floor
// ---------------------------------------------------------------------------

// Full-time conversion factors to a YEAR.
const PER_YEAR: Record<PayPeriod, number> = { hour: 40 * 52, day: 260, week: 52, fortnight: 26, semimonth: 24, month: 12, year: 1 };

// A job paying at least this share of the floor is "near" — kept and flagged,
// never excluded. Floors are usually a rough target, and an ad's figure is often
// the bottom of what's negotiable.
const NEAR_FLOOR = 0.9;
// No period stated and a figure under this share of the floor: it's almost surely
// quoted per day or hour ("EUR 300" against a €45k/yr floor), so the guessed
// period is wrong and the pay is "unclear" — kept, not excluded.
const IMPLAUSIBLY_LOW = 0.25;

export type SalaryVerdict =
  | { kind: "meets" | "near" | "below" | "unclear"; jobAmount: number; jobPeriod: PayPeriod; floor: number; floorPeriod: FloorPeriod; currency?: string; approx: boolean }
  | { kind: "other-currency"; jobCurrency: string; floorCurrency: string }
  | { kind: "unknown" };

export function compareSalary(
  jobSalary: string | undefined,
  floor: { amount: number; period: FloorPeriod; currency?: string }
): SalaryVerdict {
  const p = parseSalary(jobSalary, floor.currency);
  if (!p) return { kind: "unknown" };
  const jobCurrency = p.currency ?? floor.currency;
  if (floor.currency && jobCurrency && jobCurrency !== floor.currency) {
    return { kind: "other-currency", jobCurrency, floorCurrency: floor.currency };
  }
  const jobAmount = Math.round((p.amount * PER_YEAR[p.period]) / PER_YEAR[floor.period]);
  // Converting between periods is approximate: many markets pay a 13th/14th
  // month (AT, PH, ES…) or a holiday allowance (NL, BE), and hours per week
  // vary. Within that margin a job is "near", never excluded.
  const slack = p.period !== floor.period ? 14 / 12 : 1;
  const kind =
    jobAmount >= floor.amount ? "meets"
    : jobAmount * slack >= floor.amount * NEAR_FLOOR ? "near"
    : !p.periodStated && jobAmount < floor.amount * IMPLAUSIBLY_LOW ? "unclear"
    : "below";
  return {
    kind,
    jobAmount,
    jobPeriod: p.period,
    floor: floor.amount,
    floorPeriod: floor.period,
    currency: jobCurrency,
    // Converted between periods, or the period was guessed from convention.
    approx: p.period !== floor.period || !p.periodStated,
  };
}

export function formatPay(amount: number, period: FloorPeriod, currency?: string): string {
  return `${currency ? currency + " " : ""}${Math.round(amount).toLocaleString("en-US")}/${period === "year" ? "yr" : "mo"}`;
}

// ---------------------------------------------------------------------------
// The floor's effective currency and period
// ---------------------------------------------------------------------------

export type ResolvedPay = {
  currency?: string;
  period: FloorPeriod;
  currencySource: "chosen" | "location" | "none";
  periodSource: "chosen" | "auto";
  country?: string;
};

// What the user's floor means. An explicit choice wins; otherwise ("Auto") the
// currency comes from the Location field and the period from how salaries are
// usually quoted there. Shared by the profile form (to show it) and
// buildStrategy (to apply it), so the two can't disagree.
export function resolvePay(input: { currency?: string; salaryPeriod?: FloorPeriod; location?: string }): ResolvedPay {
  const chosen = normalizeCurrency(input.currency);
  const fromLocation = payDefaultsForLocation(input.location);
  const currency = chosen ?? fromLocation?.currency;
  const autoPeriod =
    fromLocation && fromLocation.currency === currency ? fromLocation.period : currencyInfo(currency)?.period ?? "month";
  return {
    currency,
    period: input.salaryPeriod ?? autoPeriod,
    currencySource: chosen ? "chosen" : fromLocation ? "location" : "none",
    periodSource: input.salaryPeriod ? "chosen" : "auto",
    country: fromLocation?.country,
  };
}
