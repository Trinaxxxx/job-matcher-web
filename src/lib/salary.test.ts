import { describe, it, expect } from "vitest";
import {
  compareSalary,
  countryForLocation,
  normalizeCurrency,
  parseSalary,
  parseSalaryFloor,
  payDefaultsForLocation,
  resolvePay,
} from "./salary";
import { buildStrategy } from "./strategy";
import { scoreJob } from "./scoring";

// One realistic ad per market the app searches, with the floor a local user
// would naturally type (annual in AU/NZ/UK/US/CA/IE/DE/FR/ES/IN, monthly in
// MY/SG/ID/PH/TH/HK/Gulf/EG/AT/BE/NL).
const MARKETS: [location: string, salary: string, floor: number, kept: boolean][] = [
  ["Sydney", "$110,000 - $130,000 + super", 100000, true],
  ["Melbourne, Australia", "$55 - $65 per hour", 100000, true],
  ["Auckland", "$90k - $105k", 85000, true],
  ["Bangsar, Kuala Lumpur", "MYR 8,000 - 10,000 per month", 7000, true],
  ["Singapore", "SGD 6,500 - 8,000 monthly", 6000, true],
  ["Jakarta", "Rp 15.000.000 - Rp 20.000.000", 12000000, true],
  ["Makati", "PHP 60,000 - 70,000", 40000, true],
  ["Bangkok", "฿50,000 - ฿70,000", 45000, true],
  ["Hong Kong", "HK$30,000 - HK$40,000 /month", 28000, true],
  ["Dubai", "AED 15,000 - 20,000 per month", 14000, true],
  ["Riyadh", "SAR 18,000 monthly", 15000, true],
  ["Cairo, Egypt", "EGP 30,000 - 40,000", 25000, true],
  ["Berlin", "45.000 € - 55.000 € pro Jahr", 50000, true],
  ["Wien", "ab € 3.500 brutto/Monat", 3200, true],
  ["Brussels", "€3.800 - €4.500 bruto per maand", 3500, true],
  ["London", "£45,000 - £55,000 per annum", 40000, true],
  ["Manchester", "£450 per day", 60000, true],
  ["Paris", "45 000 € - 55 000 € par an, le poste est basé à Paris", 42000, true],
  ["Lyon, France", "45K à 55K €", 42000, true],
  ["Madrid", "30.000 € - 40.000 € brutos/año", 28000, true],
  ["Amsterdam", "€ 4.000 - € 5.500 per maand", 4500, true],
  ["Dublin", "€60,000 - €70,000", 55000, true],
  ["Toronto", "$85,000–$100,000 a year", 80000, true],
  ["New York", "$120K - $150K", 110000, true],
  ["Austin, USA", "$55 - $70 an hour", 100000, true],
  ["Bengaluru", "₹12,00,000 - ₹18,00,000 a year", 1000000, true],
  ["Pune, India", "12-18 LPA", 1000000, true],
  ["Kuala Lumpur", "SGD 6,000 per month", 8000, true], // other currency: never compared
  ["Dubai", "Competitive", 14000, true],
  ["Kuala Lumpur", "MYR 3,000 per month", 7000, false],
  ["London", "£28,000 per annum", 40000, false],
  ["Jakarta", "Rp 8.000.000", 12000000, false],
  ["Kuala Lumpur", "RM 5,000 - 6,000, min 2 years experience", 7000, false],
];

describe("salary floor across markets", () => {
  it.each(MARKETS)("%s: %s vs floor %d", (location, salary, floor, kept) => {
    const d = payDefaultsForLocation(location);
    expect(d).toBeDefined();
    const v = compareSalary(salary, { amount: floor, period: d!.period, currency: d!.currency });
    expect(v.kind !== "below").toBe(kept);
  });

  it("works end to end through buildStrategy + scoreJob with Auto currency/period", () => {
    const s = buildStrategy("", { locations: "Sydney", minSalary: "100k" });
    expect(s).toMatchObject({ currency: "AUD", salaryPeriod: "year", minSalary: 100000 });
    const r = scoreJob({ title: "Analyst", salary: "$110,000 - $130,000 + super" }, s);
    expect(r.excluded).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/AUD ~130000\/yr .* meets your floor/);
    const low = scoreJob({ title: "Analyst", salary: "$70,000" }, s);
    expect(low.excludeReason).toMatch(/below your floor 100000\/yr/);
  });

  it("explains, rather than excludes, a job in another currency", () => {
    const s = buildStrategy("", { locations: "Kuala Lumpur", minSalary: "8000" });
    const r = scoreJob({ title: "Analyst", salary: "SGD 6,000 per month" }, s);
    expect(r.excluded).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/in SGD, not compared with your MYR floor/);
  });

  it("keeps a job just under an annual floor when 13th/14th-month pay could cover it", () => {
    expect(compareSalary("ab € 3.500 brutto/Monat", { amount: 45000, period: "year", currency: "EUR" }).kind).toBe("near");
    // €3.000/Monat (≈ €42k with 14 months) is within 10% of €45k, so also near;
    // €2.500/Monat (≈ €35k) is clearly below.
    expect(compareSalary("ab € 3.000 brutto/Monat", { amount: 45000, period: "year", currency: "EUR" }).kind).toBe("near");
    expect(compareSalary("ab € 2.500 brutto/Monat", { amount: 45000, period: "year", currency: "EUR" }).kind).toBe("below");
  });

  it("keeps the old monthly meaning for profiles saved before periods existed", () => {
    const s = buildStrategy("", { minSalary: "9000" });
    expect(s.salaryPeriod).toBe("month");
    expect(scoreJob({ title: "x", salary: "USD 120,000 per year" }, s).excluded).toBe(false);
  });
});

describe("parsing", () => {
  it.each([
    ["Rp 15.000.000", 15000000],
    ["45 000 €", 45000],
    ["€3.800", 3800],
    ["12,5k", 12500],
    ["₹12,00,000", 1200000],
    ["1.2m per year", 1200000],
    ["2 crore", 20000000],
  ])("%s → %d", (text, amount) => {
    expect(parseSalary(text)?.amount).toBe(amount);
  });

  it("doesn't read the m of 'monthly' as million", () => {
    expect(parseSalary("SGD 6,500 - 8,000 monthly")).toMatchObject({ amount: 8000, period: "month" });
  });

  it("doesn't read 'years experience' or a stray French 'an' as an annual salary", () => {
    expect(parseSalary("RM 5,000, 2 years experience", "MYR")?.period).toBe("month");
    expect(parseSalary("RM 5,000, an experienced hire", "MYR")?.period).toBe("month");
  });

  it("detects currencies, resolving a bare $ by the user's currency", () => {
    expect(parseSalary("$100,000", "AUD")?.currency).toBe("AUD");
    expect(parseSalary("$100,000", "MYR")?.currency).toBe("USD");
    expect(parseSalary("US$5,000", "SGD")?.currency).toBe("USD");
    expect(parseSalary("45 000 € par an, le poste")?.currency).toBe("EUR");
    expect(parseSalary("TRY 50,000")?.currency).toBe("TRY");
    expect(parseSalary("we'll try 50,000")?.currency).toBeUndefined();
  });

  it("reads typed floors", () => {
    expect(parseSalaryFloor("12,000 - 15,000")).toBe(12000);
    expect(parseSalaryFloor("RM12k")).toBe(12000);
    expect(parseSalaryFloor("45.000")).toBe(45000);
    expect(parseSalaryFloor("12 LPA")).toBe(1200000);
    expect(parseSalaryFloor("negotiable")).toBeUndefined();
  });
});

describe("location → currency", () => {
  it.each([
    ["Bangsar, Kuala Lumpur", "my"],
    ["Sydney NSW", "au"],
    ["Abu Dhabi", "ae"],
    ["München", "de"],
    ["Makati City, Metro Manila", "ph"],
    ["Remote", undefined],
  ])("%s → %s", (loc, cc) => {
    expect(countryForLocation(loc)).toBe(cc);
  });

  it("normalizes typed currencies", () => {
    expect(normalizeCurrency("RM")).toBe("MYR");
    expect(normalizeCurrency("s$")).toBe("SGD");
    expect(normalizeCurrency("euro")).toBe("EUR");
    expect(normalizeCurrency("zzz")).toBeUndefined();
  });

  it("resolvePay: a choice wins, Auto follows location", () => {
    expect(resolvePay({ location: "Vienna" })).toMatchObject({ currency: "EUR", period: "month", currencySource: "location" });
    expect(resolvePay({ location: "Berlin" })).toMatchObject({ currency: "EUR", period: "year" });
    expect(resolvePay({ location: "Sydney", currency: "USD" })).toMatchObject({ currency: "USD", period: "year", currencySource: "chosen" });
    expect(resolvePay({ location: "Sydney", salaryPeriod: "month" })).toMatchObject({ currency: "AUD", period: "month", periodSource: "chosen" });
    expect(resolvePay({})).toMatchObject({ currency: undefined, period: "month", currencySource: "none" });
  });
});

describe("pay-period invariants (stress)", () => {
  // Each phrasing of a pay period must resolve to the right period. Fortnightly
  // (26/yr) is standard in AU/NZ; bi-weekly is its US payroll synonym;
  // semi-monthly (24/yr) is twice a month, NOT monthly.
  it.each([
    ["AUD 2,000 per fortnight", "fortnight"],
    ["$4,000 fortnightly", "fortnight"],
    ["NZ$2,000 /fortnight", "fortnight"],
    ["$2,500 bi-weekly", "fortnight"],
    ["$2,500 biweekly", "fortnight"],
    ["$2,500 every two weeks", "fortnight"],
    ["$2,500 semi-monthly", "semimonth"],
    ["$2,500 twice a month", "semimonth"],
    ["£1,000 per week", "week"],
    ["€500 per day", "day"],
    ["$50 per hour", "hour"],
    ["RM 8,000 per month", "month"],
    ["$120,000 per annum", "year"],
  ])("%s → %s", (text, period) => {
    expect(parseSalary(text, "AUD")?.period).toBe(period);
  });

  // INVARIANT: the same real pay, written in any period, gives the same verdict
  // against a given floor. ~AUD 104,000/yr, five ways.
  const SAME_PAY = [
    "$50 per hour",        // 50 × 2080
    "$2,000 per week",     // × 52
    "$4,000 per fortnight",// × 26
    "$4,333 semi-monthly", // × 24 ≈ 103,992
    "$8,667 per month",    // × 12
    "$104,000 per annum",
  ];
  it.each(SAME_PAY)("conversion consistency: %s clears a 90k/yr floor", (salary) => {
    const v = compareSalary(salary, { amount: 90000, period: "year", currency: "AUD" });
    expect(v.kind).not.toBe("below");
  });
  it.each(SAME_PAY)("conversion consistency: %s fails a 200k/yr floor", (salary) => {
    const v = compareSalary(salary, { amount: 200000, period: "year", currency: "AUD" });
    expect(v.kind).toBe("below"); // ~104k is well under 200k, past the near cushion
  });

  // INVARIANT: for a fixed currency + period, more pay never flips meets → below.
  it("monotonic: a higher-paying fortnightly job is never dropped when a lower one passes", () => {
    const floor = { amount: 90000, period: "year" as const, currency: "AUD" };
    for (let fn = 3000; fn <= 6000; fn += 500) {
      const lower = compareSalary(`$${fn} per fortnight`, floor);
      const higher = compareSalary(`$${fn + 500} per fortnight`, floor);
      if (lower.kind === "meets") expect(higher.kind).toBe("meets");
    }
  });

  // INVARIANT: unknown pay never excludes a job (silent hiding is the worst case).
  it.each([
    ["no salary at all", undefined],
    ["unparseable", "Attractive package"],
    ["zero", "$0 per month"],
    ["junk", "💰💰💰"],
    ["ambiguous 'per pay period'", "$3,000 per pay period"],
  ])("never-drop-on-unknown: %s", (_name, salary) => {
    const v = compareSalary(salary, { amount: 90000, period: "year", currency: "AUD" });
    expect(v.kind).not.toBe("below");
  });

  it("other-currency jobs are reported, never excluded", () => {
    const v = compareSalary("MYR 3,000 per fortnight", { amount: 90000, period: "year", currency: "AUD" });
    expect(v.kind).toBe("other-currency");
  });

  // Boundary contract (same currency + period, so no conversion slack): at/above
  // the floor = meets, a small shortfall is cushioned as "near" (kept), and only
  // a clear shortfall past the ~10% band is excluded.
  it("boundary: meets at the floor, near just below, below well under", () => {
    const floor = { amount: 5000, period: "month" as const, currency: "MYR" };
    expect(compareSalary("MYR 5,000 per month", floor).kind).toBe("meets");
    expect(compareSalary("MYR 4,800 per month", floor).kind).toBe("near"); // ~4% under
    expect(compareSalary("MYR 4,000 per month", floor).kind).toBe("below"); // 20% under
  });
});
