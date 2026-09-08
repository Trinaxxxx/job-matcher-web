import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

// Extract plain text from an uploaded CV. Supports PDF and DOCX.
// Returns "" if the format is unsupported or extraction yields nothing.
export async function parseCv(fileName: string, buffer: ArrayBuffer): Promise<string> {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return (text || "").trim();
  }

  if (lower.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
    return (value || "").trim();
  }

  if (lower.endsWith(".txt")) {
    return Buffer.from(buffer).toString("utf8").trim();
  }

  return "";
}
