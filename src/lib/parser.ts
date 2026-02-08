import mammoth from "mammoth";
import * as xlsx from "xlsx";
import path from "path";
import type { RawAttachment } from "@/types";

interface ParsedAttachment {
  filename: string;
  text: string;
  parseError?: string;
}

function getExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

async function extractText(attachment: RawAttachment): Promise<string> {
  const ext = getExtension(attachment.filename);
  const mime = attachment.mimeType.toLowerCase();

  // PDF
  if (ext === ".pdf" || mime === "application/pdf") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string }>;
    const result = await pdfParse(attachment.data);
    return result.text;
  }

  // DOCX
  if (
    ext === ".docx" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const result = await mammoth.extractRawText({ buffer: attachment.data });
    return result.value;
  }

  // Spreadsheets (XLSX, XLS, CSV)
  if (
    [".xlsx", ".xls", ".csv"].includes(ext) ||
    mime.includes("spreadsheet") ||
    mime === "text/csv" ||
    mime === "application/vnd.ms-excel" ||
    mime ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    const workbook = xlsx.read(attachment.data, { type: "buffer" });
    const parts: string[] = [];
    for (const name of workbook.SheetNames) {
      parts.push(`--- Sheet: ${name} ---`);
      parts.push(xlsx.utils.sheet_to_csv(workbook.Sheets[name]));
    }
    return parts.join("\n");
  }

  // Legacy .doc
  if (ext === ".doc" || mime === "application/msword") {
    return "[Legacy .doc file — convert to .docx for full parsing]";
  }

  // Images
  if (mime.startsWith("image/")) {
    return `[Image file: ${attachment.filename} — no text extraction]`;
  }

  // Plain text / HTML
  if (
    [".txt", ".html", ".htm"].includes(ext) ||
    mime.startsWith("text/")
  ) {
    return attachment.data.toString("utf-8");
  }

  // Unsupported
  return `[Unsupported file type: ${attachment.filename} (${attachment.mimeType})]`;
}

export async function parseAttachments(
  attachments: RawAttachment[]
): Promise<ParsedAttachment[]> {
  const results: ParsedAttachment[] = [];

  for (const attachment of attachments) {
    try {
      const text = await extractText(attachment);
      results.push({ filename: attachment.filename, text });
    } catch (err) {
      results.push({
        filename: attachment.filename,
        text: "",
        parseError: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return results;
}

export function truncateText(text: string, maxChars = 12000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[...truncated...]";
}
