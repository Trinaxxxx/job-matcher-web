// CSV serialization helpers.
//
// SECURITY: values may come from scraped web content, so a cell can contain an
// attacker-controlled spreadsheet formula (CSV injection). Excel / Sheets
// execute any cell whose value begins with = + - @ (or a leading tab /
// carriage return). Neutralize those by prefixing with a single quote before
// quoting, so the cell is always treated as literal text.
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
}
