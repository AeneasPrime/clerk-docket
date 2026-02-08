import { fetchNewEmails, markAsRead } from "./gmail";
import { isEmailProcessed, markEmailProcessed, createDocketEntry } from "./db";
import { parseAttachments, truncateText } from "./parser";
import { classifyEmail } from "./classifier";
import type { ScanResult } from "@/types";

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

      const parsedAttachments = await parseAttachments(email.attachments);

      let bodyText = email.bodyText || stripHtml(email.bodyHtml);
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

      createDocketEntry({
        emailId: email.id,
        emailFrom: email.from,
        emailSubject: email.subject,
        emailDate: email.date,
        emailBodyPreview: bodyText.slice(0, 500),
        classification,
        attachmentFilenames: email.attachments.map((a) => a.filename),
      });

      markEmailProcessed(email.id);
      result.emails_processed++;
      result.docket_entries_created++;

      console.log(
        `[Scan] Processed: "${email.subject}" → ${classification.item_type} (${classification.confidence})`
      );
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
