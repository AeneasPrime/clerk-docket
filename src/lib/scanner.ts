import { fetchNewEmails } from "./gmail";
import { isEmailProcessed, markEmailProcessed, createDocketEntry, getDocketEntryByEmailId } from "./db";
import { parseAttachments, truncateText } from "./parser";
import { classifyEmail } from "./classifier";
import type { ClassificationResult, RawAttachment, ScanResult } from "@/types";

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ProcessResult {
  docketId: number;
  classification: {
    relevant: boolean;
    item_type: string | null;
    department: string | null;
    summary: string;
    confidence: string;
  };
}

/**
 * Process a single email through the classification pipeline and create a docket entry.
 * Used by both runScan() and the /api/ingest endpoint.
 */
export async function processSingleEmail(email: {
  id: string;
  from: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml?: string;
  attachments: RawAttachment[];
}): Promise<ProcessResult> {
  // Check if already processed
  if (isEmailProcessed(email.id)) {
    const existing = getDocketEntryByEmailId(email.id);
    const err = new Error("This email has already been sent to the docket.");
    (err as Error & { code: string; docketId?: number }).code = "ALREADY_PROCESSED";
    if (existing) (err as Error & { docketId?: number }).docketId = existing.id;
    throw err;
  }

  const parsedAttachments = await parseAttachments(email.attachments);

  let bodyText = email.bodyText || stripHtml(email.bodyHtml || "");
  bodyText = truncateText(bodyText, 8000);

  const attachmentTexts = parsedAttachments.map((att) => ({
    filename: att.filename,
    text: truncateText(att.text, 4000),
  }));

  const classification = await classifyEmail(
    email.from,
    email.subject,
    bodyText,
    attachmentTexts
  );

  const docketId = createDocketEntry({
    emailId: email.id,
    emailFrom: email.from,
    emailSubject: email.subject,
    emailDate: email.date,
    emailBodyPreview: bodyText.slice(0, 500),
    classification,
    attachmentFilenames: email.attachments.map((a) => a.filename),
  });

  markEmailProcessed(email.id);

  console.log(
    `[Scan] Processed: "${email.subject}" → ${classification.item_type} (${classification.confidence})`
  );

  return {
    docketId,
    classification: {
      relevant: classification.relevant,
      item_type: classification.item_type,
      department: classification.department,
      summary: classification.summary,
      confidence: classification.confidence,
    },
  };
}

export async function runScan(): Promise<ScanResult> {
  const result: ScanResult = {
    emails_found: 0,
    emails_processed: 0,
    emails_skipped: 0,
    docket_entries_created: 0,
    errors: [],
  };

  const emails = await fetchNewEmails(20);
  result.emails_found = emails.length;

  for (const email of emails) {
    try {
      if (isEmailProcessed(email.id)) {
        result.emails_skipped++;
        continue;
      }

      await processSingleEmail({
        id: email.id,
        from: email.from,
        subject: email.subject,
        date: email.date,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        attachments: email.attachments,
      });

      result.emails_processed++;
      result.docket_entries_created++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Error processing "${email.subject}": ${message}`);
      try {
        markEmailProcessed(email.id);
      } catch {
        // ignore — best effort to avoid retrying
      }
    }
  }

  return result;
}
