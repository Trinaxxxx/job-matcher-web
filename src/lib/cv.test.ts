import { describe, it, expect } from "vitest";
import { parseCv, MAX_CV_CHARS } from "./cv";

function buf(bytes: number[] | Uint8Array): ArrayBuffer {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
function textBuf(s: string): ArrayBuffer {
  return buf(new TextEncoder().encode(s));
}

describe("parseCv (G — magic-byte validation & output cap)", () => {
  it("rejects a .pdf whose bytes are not really a PDF", async () => {
    expect(await parseCv("resume.pdf", textBuf("this is not a pdf"))).toBe("");
  });

  it("rejects a .docx whose bytes are not a ZIP", async () => {
    expect(await parseCv("resume.docx", textBuf("not a zip"))).toBe("");
  });

  it("rejects an unsupported extension", async () => {
    expect(await parseCv("resume.exe", textBuf("MZ..."))).toBe("");
  });

  it("reads and trims a .txt file", async () => {
    expect(await parseCv("cv.txt", textBuf("  hello world  "))).toBe("hello world");
  });

  it("normalises messy whitespace from extracted text (token savings)", async () => {
    const messy = "  Line one  \t  \n\n\n\n\n   Line two   \r\n  Line three  ";
    const out = await parseCv("cv.txt", textBuf(messy));
    // Tabs → spaces, runs collapsed, 3+ blank lines → one, each line trimmed
    expect(out).toBe("Line one\n\nLine two\nLine three");
  });

  it("caps very large .txt content at MAX_CV_CHARS", async () => {
    const big = "a".repeat(MAX_CV_CHARS + 5000);
    const out = await parseCv("cv.txt", textBuf(big));
    expect(out.length).toBe(MAX_CV_CHARS);
  });
});
