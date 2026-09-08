import { describe, it, expect } from "vitest";
import { csvCell } from "./csv";

describe("csvCell (E — CSV formula injection)", () => {
  it("quotes plain values and escapes embedded quotes", () => {
    expect(csvCell("hello")).toBe('"hello"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("renders null/undefined as an empty quoted cell", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it("collapses newlines to spaces", () => {
    expect(csvCell("a\nb\r\nc")).toBe('"a b c"');
  });

  it("neutralizes formula-triggering leading characters", () => {
    // Each must be prefixed with a single quote so spreadsheets treat it as text.
    expect(csvCell('=HYPERLINK("http://evil")')).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+1+2")).toBe('"\'+1+2"');
    expect(csvCell("-2+3")).toBe('"\'-2+3"');
    expect(csvCell("@SUM(A1)")).toBe('"\'@SUM(A1)"');
    expect(csvCell("\t=1")).toBe('"\'\t=1"');
  });

  it("does not alter safe values that merely contain those characters later", () => {
    expect(csvCell("Manager (R&D)")).toBe('"Manager (R&D)"');
    expect(csvCell("a=b")).toBe('"a=b"');
  });
});
