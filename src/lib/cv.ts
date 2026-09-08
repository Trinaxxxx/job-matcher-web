import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

// Cap on extracted text (G). Even a small compressed upload (e.g. a DOCX, which
// is a ZIP) can expand into a very large amount of text; bound what we keep so a
// crafted file can't blow up memory or the DB. ~200k chars is far more than any
// real CV needs.
export const MAX_CV_CHARS = 200_000;

// Verify the file's leading bytes match its claimed extension (G). Checking the
// extension alone lets an attacker mislabel content; a magic-byte check ensures
// we hand the bytes to the right parser (and reject spoofed types outright).
function hasMagic(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04" — DOCX is a ZIP

function cap(text: string): string {
  const t = (text || "").trim();
  return t.length > MAX_CV_CHARS ? t.slice(0, MAX_CV_CHARS) : t;
}

// Extract plain text from an uploaded CV. Supports PDF, DOCX, and TXT.
// Returns "" if the format is unsupported, the content doesn't match the claimed
// type, or extraction yields nothing.
export async function parseCv(fileName: string, buffer: ArrayBuffer): Promise<string> {
  const lower = fileName.toLowerCase();
  const bytes = new Uint8Array(buffer);

  if (lower.endsWith(".pdf")) {
    if (!hasMagic(bytes, PDF_MAGIC)) return "";
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    return cap(text);
  }

  if (lower.endsWith(".docx")) {
    if (!hasMagic(bytes, ZIP_MAGIC)) return "";
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return cap(value);
  }

  if (lower.endsWith(".txt")) {
    return cap(Buffer.from(buffer).toString("utf8"));
  }

  return "";
}
