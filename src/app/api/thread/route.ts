import { NextRequest, NextResponse } from "next/server";
import { fetchEmailThread } from "@/lib/gmail";
import { getDocketEntryByEmailId } from "@/lib/db";

/** Generate a realistic email body from seed docket data */
function generateSeedEmailBody(entry: {
  email_from: string;
  email_subject: string;
  email_date: string;
  email_body_preview: string;
  item_type: string | null;
  department: string | null;
  summary: string | null;
  extracted_fields: string;
  attachment_filenames: string;
}): string {
  const senderName = entry.email_from.match(/^([^<]+)/)?.[1]?.trim() ?? entry.email_from;
  const fields = JSON.parse(entry.extracted_fields || "{}");
  const attachments: string[] = JSON.parse(entry.attachment_filenames || "[]");

  let body = `Dear Municipal Clerk,\n\n`;

  // Generate body based on item type
  switch (entry.item_type) {
    case "resolution":
      body += `Please find attached the resolution for "${entry.email_subject}" for inclusion on the next council agenda.\n\n`;
      if (fields.vendor_name) body += `Vendor: ${fields.vendor_name}\n`;
      if (fields.contract_amount) body += `Amount: ${fields.contract_amount}\n`;
      if (fields.statutory_citation) body += `Statutory Authority: ${fields.statutory_citation}\n`;
      body += `\n${entry.email_body_preview}\n\n`;
      body += `This item has been reviewed and approved by the department head. Please confirm receipt and placement on the agenda.\n`;
      break;

    case "ordinance_new":
    case "ordinance_amendment":
      body += `Attached please find the proposed ordinance: "${entry.email_subject}".\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      if (fields.statutory_citation) body += `Statutory Reference: ${fields.statutory_citation}\n`;
      if (fields.reading_stage) body += `Reading Stage: ${fields.reading_stage === "first" ? "First Reading / Introduction" : "Second Reading / Public Hearing"}\n`;
      body += `\nThis ordinance has been reviewed by the Township Attorney's office and is ready for introduction at the next work session.\n`;
      break;

    case "contract":
      body += `I am submitting the following contract for council approval:\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      if (fields.vendor_name) body += `Contractor: ${fields.vendor_name}\n`;
      if (fields.contract_amount) body += `Contract Amount: ${fields.contract_amount}\n`;
      if (fields.bid_number) body += `Bid Number: ${fields.bid_number}\n`;
      body += `\nAll required documentation including insurance certificates and business registration are attached. Please place on the next available council agenda.\n`;
      break;

    case "consent_agenda":
      body += `Please include the following item on the consent agenda for the next regular meeting:\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      if (fields.dollar_amounts?.length) body += `Amount(s): ${fields.dollar_amounts.join(", ")}\n`;
      body += `\nThis is a routine matter appropriate for the consent agenda.\n`;
      break;

    case "administrative":
      body += `The following administrative item is submitted for council consideration:\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      body += `Please place this on the administrative agenda for the next work session.\n`;
      break;

    case "license":
    case "permit":
      body += `Please find attached the ${entry.item_type} application for council review:\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      if (fields.licensee_name) body += `Applicant: ${fields.licensee_name}\n`;
      if (fields.license_number) body += `License #: ${fields.license_number}\n`;
      if (fields.block_lot) body += `Location: ${fields.block_lot}\n`;
      body += `\nAll required fees have been paid and the application is complete.\n`;
      break;

    case "bond_release":
      body += `I am requesting the release of the following bond:\n\n`;
      body += `${entry.email_body_preview}\n\n`;
      if (fields.bond_amount) body += `Bond Amount: ${fields.bond_amount}\n`;
      if (fields.block_lot) body += `Property: ${fields.block_lot}\n`;
      body += `\nThe Engineering Department has confirmed all conditions have been satisfied.\n`;
      break;

    default:
      body += `${entry.email_body_preview}\n\n`;
      if (fields.dollar_amounts?.length) body += `Amount(s): ${fields.dollar_amounts.join(", ")}\n\n`;
      body += `Please include this on the agenda for the next council meeting.\n`;
      break;
  }

  if (attachments.length > 0) {
    body += `\nAttachments:\n`;
    for (const a of attachments) body += `  - ${a}\n`;
  }

  body += `\nThank you,\n${senderName}`;
  if (entry.department) body += `\n${entry.department}`;
  body += `\nTownship of Edison`;

  return body;
}

/** Generate a clerk acknowledgment reply */
function generateClerkReply(entry: {
  email_subject: string;
  email_date: string;
  email_from: string;
  item_type: string | null;
  target_meeting_date: string | null;
}): string {
  const senderName = entry.email_from.match(/^([^<]+)/)?.[1]?.trim() ?? "colleague";

  let body = `Hi ${senderName.split(",")[0]},\n\n`;
  body += `Thank you for submitting this item. I have received it and will include it in the docket for review.\n\n`;

  if (entry.target_meeting_date) {
    const d = new Date(entry.target_meeting_date + "T12:00:00");
    const meeting = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    body += `This item is currently scheduled for the ${meeting} meeting cycle.\n\n`;
  }

  if (entry.item_type === "ordinance_new" || entry.item_type === "ordinance_amendment") {
    body += `As this is an ordinance, it will require introduction at a work session followed by a public hearing at a regular meeting (minimum 10 days after introduction per NJSA 40:49-2).\n\n`;
  }

  body += `Please let me know if there are any changes or additional documents needed.\n\n`;
  body += `Best regards,\nCheryl Russomanno\nMunicipal Clerk\nTownship of Edison`;

  return body;
}

export async function GET(request: NextRequest) {
  const emailId = request.nextUrl.searchParams.get("emailId");

  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  // For seed entries, generate synthetic thread data from the docket entry
  if (emailId.startsWith("seed-")) {
    const entry = getDocketEntryByEmailId(emailId);
    if (!entry) {
      return NextResponse.json({ messages: [] });
    }

    const originalDate = new Date(entry.email_date + "T09:30:00");
    const replyDate = new Date(originalDate.getTime() + 2 * 60 * 60 * 1000); // 2 hours later

    const messages = [
      {
        id: emailId,
        from: entry.email_from,
        to: "Russomanno, Cheryl <clerk@edisonnj.org>",
        subject: entry.email_subject,
        date: originalDate.toISOString(),
        snippet: entry.email_body_preview,
        bodyText: generateSeedEmailBody(entry),
      },
      {
        id: `${emailId}-reply-1`,
        from: "Russomanno, Cheryl <clerk@edisonnj.org>",
        to: entry.email_from,
        subject: `Re: ${entry.email_subject}`,
        date: replyDate.toISOString(),
        snippet: `Thank you for submitting this item. I have received it and will include it in the docket for review.`,
        bodyText: generateClerkReply(entry),
      },
    ];

    return NextResponse.json({ messages });
  }

  try {
    const messages = await fetchEmailThread(emailId);
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
