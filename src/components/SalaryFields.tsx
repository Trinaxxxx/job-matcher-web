"use client";
import type { Answers } from "@/lib/strategy";
import { CURRENCIES, normalizeCurrency, parseSalaryFloor, resolvePay, type FloorPeriod } from "@/lib/salary";

const FIELD = "field";
const LABEL = "label";

const PERIOD_LABEL: Record<FloorPeriod, string> = { month: "per month", year: "per year" };

function countryLabel(cc?: string): string | undefined {
  if (!cc) return undefined;
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(cc.toUpperCase());
  } catch {
    return cc.toUpperCase();
  }
}

// Min salary + currency + period. Currency and period default to "Auto", which
// follows the Location field — the same rule the server applies (resolvePay), so
// what's shown here is exactly what the search uses. A live readout spells the
// floor out in both periods, so an annual figure typed as monthly is obvious.
export default function SalaryFields({
  answers,
  onChange,
  ids = true,
}: {
  answers: Pick<Answers, "minSalary" | "currency" | "salaryPeriod" | "locations">;
  onChange: (patch: Partial<Answers>) => void;
  // Set false where the host already renders fields with these ids.
  ids?: boolean;
}) {
  const pay = resolvePay({ currency: answers.currency, salaryPeriod: answers.salaryPeriod, location: answers.locations });
  const chosenCurrency = normalizeCurrency(answers.currency) ?? "";
  const country = countryLabel(pay.country);
  const floor = parseSalaryFloor(answers.minSalary);
  const id = (s: string) => (ids ? s : undefined);

  // What "Auto" would pick, for the option labels.
  const fromLocation = resolvePay({ location: answers.locations }).currency;
  const autoCurrency = fromLocation ? `Auto — ${fromLocation} (from ${country})` : "Auto (from your location)";
  const autoPeriodValue = resolvePay({ currency: answers.currency, location: answers.locations }).period;

  let readout: string | null = null;
  if (floor) {
    const cur = pay.currency ? `${pay.currency} ` : "";
    const other: FloorPeriod = pay.period === "month" ? "year" : "month";
    const otherAmount = pay.period === "month" ? floor * 12 : floor / 12;
    const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
    readout = `Jobs that state a salary under ${cur}${fmt(floor)} ${PERIOD_LABEL[pay.period]} (about ${cur}${fmt(otherAmount)} ${PERIOD_LABEL[other]}) are hidden.`;
  }

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor={id("minSalary")}>Min salary</label>
          <input id={id("minSalary")} className={FIELD} inputMode="decimal" maxLength={50} value={answers.minSalary ?? ""}
            onChange={(e) => onChange({ minSalary: e.target.value })} placeholder="e.g. 10000 or 10k" />
        </div>
        <div>
          <label className={LABEL} htmlFor={id("currency")}>Currency</label>
          <select id={id("currency")} className={FIELD} value={chosenCurrency}
            onChange={(e) => onChange({ currency: e.target.value || undefined })}>
            <option value="">{autoCurrency}</option>
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor={id("salaryPeriod")}>Paid</label>
          <select id={id("salaryPeriod")} className={FIELD} value={answers.salaryPeriod ?? ""}
            onChange={(e) => onChange({ salaryPeriod: (e.target.value || undefined) as FloorPeriod | undefined })}>
            <option value="">Auto — {PERIOD_LABEL[autoPeriodValue]}{country ? ` (usual in ${country})` : ""}</option>
            <option value="month">Per month</option>
            <option value="year">Per year</option>
          </select>
        </div>
      </div>
      {floor && !pay.currency && (
        <p className="hint text-warning">
          We can&apos;t tell the currency from your location. Pick one so job salaries can be compared.
        </p>
      )}
      {readout && <p className="hint" aria-live="polite">{readout}</p>}
      {floor ? (
        <p className="hint">Jobs paid in another currency, or with no salary listed, are never hidden by this.</p>
      ) : null}
    </div>
  );
}
