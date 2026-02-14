import Anthropic from "@anthropic-ai/sdk";
import type { ClassificationResult } from "@/types";
import { truncateText } from "./parser";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are an intake classifier for a municipal clerk's office in Edison Township, New Jersey (Faulkner Act Mayor-Council form of government). Your job is to read incoming emails and their attachments and determine whether they are related to an upcoming Township Council meeting agenda, and if so, extract structured data.

CONTEXT: The Township Clerk receives items from various departments and outside parties that need to go before the Municipal Council. These arrive as emails with attachments (memos, spreadsheets, PDFs, forms). The Clerk needs to quickly understand what each submission is, what type of resolution or action it requires, and whether it is complete.

Edison operates on a biweekly cycle: Work Session (Monday) followed by Regular Meeting (Wednesday). Departments submit items by Wednesday before the Work Session. Items must go through the Work Session before appearing on the Regular Meeting agenda.

RESPOND WITH A JSON OBJECT (no markdown, no backticks, just raw JSON) with these fields:

{
  "relevant": boolean,
  "confidence": "high"|"medium"|"low",
  "item_type": string|null,
  "department": string|null,
  "summary": string,
  "extracted_fields": {
    "vendor_name": string|null,
    "vendor_address": string|null,
    "contract_amount": string|null,
    "bid_number": string|null,
    "state_contract_number": string|null,
    "account_number": string|null,
    "block_lot": string|null,
    "statutory_citation": string|null,
    "license_number": string|null,
    "licensee_name": string|null,
    "project_name": string|null,
    "bond_amount": string|null,
    "escrow_amount": string|null,
    "recommended_action": string|null,
    "dollar_amounts": string[],
    "line_items": [{"payee": string, "amount": string, "description": string|null}] | null,
    "ordinance_number": string|null,
    "reading_stage": "first"|"second"|null
  },
  "completeness": {
    "needs_cfo_certification": boolean,
    "needs_attorney_review": boolean,
    "missing_block_lot": boolean,
    "missing_statutory_citation": boolean,
    "notes": string[]
  }
}

ITEM TYPES:
- resolution_bid_award: Competitive bid contract award (N.J.S.A. 40A:11-1 et seq.)
- resolution_professional_services: Non-bid professional services contract (N.J.S.A. 40A:11-5)
- resolution_state_contract: Purchase under NJ state contract (N.J.S.A. 40A:11-12)
- resolution_tax_refund: Tax, water, or sewer overpayment refund
- resolution_tax_sale_redemption: Tax sale certificate redemption refund
- resolution_bond_release: Performance or maintenance bond release
- resolution_escrow_release: Street opening or tree escrow release
- resolution_project_acceptance: Construction project completion/acceptance
- resolution_license_renewal: Liquor, raffle, or bingo license renewal
- resolution_grant: Grant application or acceptance
- resolution_personnel: Labor agreement (MOA), appointment, salary action
- resolution_surplus_sale: Surplus property disposal authorization
- resolution_fee_waiver: Park rental or permit fee waiver
- resolution_disbursement: Disbursement/payment report approval
- ordinance_new: New ordinance for introduction (first reading)
- ordinance_amendment: Amendment to existing ordinance
- discussion_item: Council member topic for work session discussion
- informational: FYI or status update, no council action needed
- other: Relevant but doesn't fit the categories above

DEPARTMENTS (use these exact names for the "department" field):
- Administration
- Finance/CFO
- Law
- Engineering
- Public Works
- Police
- Fire
- Health
- Recreation
- Planning/Zoning
- Tax Collection
- Tax Assessment
- Water/Sewer Utility
- Code Enforcement
- Human Resources
- Municipal Court

CLASSIFICATION GUIDANCE:
- If the email is clearly personal, spam, a newsletter, or administrative (meeting logistics, scheduling) with no substantive agenda content, mark relevant: false
- If you're unsure, err on the side of relevant: true with confidence: "low"
- Look for dollar amounts, vendor names, bid numbers, N.J.S.A. citations, block/lot numbers as strong signals of agenda relevance
- An engineer's memo recommending project acceptance = resolution_project_acceptance
- A tax collector's spreadsheet of refunds = resolution_tax_refund or resolution_tax_sale_redemption
- A department head requesting a purchase citing a state contract = resolution_state_contract
- A council member listing topics they want to discuss = discussion_item
- A CFO's disbursement report = resolution_disbursement

DISBURSEMENT REPORT GUIDANCE:
- For disbursement reports (resolution_disbursement), you MUST preserve EVERY named line item in the "line_items" array
- This includes fund breakdowns (e.g. "Current: $41,287,445.18" → payee: "Current Fund", amount: "$41,287,445.18"), individual vendor payments, account-level items, or any other named amount in the report
- Each entry in line_items should have: "payee" (the fund name, vendor name, or account name), "amount" (the dollar amount), and optionally "description" (any additional context)
- Do NOT collapse or sum up amounts — preserve every individual named item exactly as presented
- Include items with $0.00 amounts as well — the clerk needs to see the complete report
- dollar_amounts should contain ONLY the grand total
- line_items is only used for disbursement reports; set it to null for all other item types

ORDINANCE GUIDANCE:
- For ordinance_new and ordinance_amendment items, extract the ordinance number if present (e.g. "O.2270-2026" from the subject, body, or attachment filename)
- Set reading_stage to "first" if this is being submitted for introduction/first reading, or "second" if it's coming back for public hearing/second reading/adoption
- Clues for first reading: "for introduction", "first reading", "proposed ordinance", no mention of prior passage
- Clues for second reading: "second reading", "public hearing", "final passage", "passed first reading on [date]", "adopted on first reading"
- If unclear, set reading_stage to null
- ordinance_number and reading_stage are ONLY used for ordinance types; set both to null for all other item types

COMPLETENESS GUIDANCE:
- needs_cfo_certification: true if any money is being spent, refunded, or authorized
- needs_attorney_review: true if it involves contracts, ordinances, redevelopment, settlements, or legal authority
- missing_block_lot: true if real property is referenced but no block/lot numbers are provided
- missing_statutory_citation: true if the resolution type typically requires an N.J.S.A. citation but none is present`;

function buildUserMessage(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  attachmentTexts: { filename: string; text: string }[]
): string {
  let content = `EMAIL FROM: ${emailFrom}\nSUBJECT: ${emailSubject}\n\nBODY:\n${emailBody}`;

  for (const att of attachmentTexts) {
    content += `\n\n--- ATTACHMENT [File: ${att.filename}] ---\n${att.text}\n`;
  }

  return truncateText(content, 50000);
}

function safeParseResult(raw: unknown): ClassificationResult {
  const obj = raw as Record<string, unknown>;
  const ef = (obj.extracted_fields ?? {}) as Record<string, unknown>;
  const comp = (obj.completeness ?? {}) as Record<string, unknown>;

  return {
    relevant: typeof obj.relevant === "boolean" ? obj.relevant : true,
    confidence: (["high", "medium", "low"].includes(obj.confidence as string)
      ? obj.confidence
      : "low") as ClassificationResult["confidence"],
    item_type: typeof obj.item_type === "string" ? (obj.item_type as ClassificationResult["item_type"]) : null,
    department: typeof obj.department === "string" ? obj.department : null,
    summary: typeof obj.summary === "string" ? obj.summary : "No summary provided",
    extracted_fields: {
      vendor_name: typeof ef.vendor_name === "string" ? ef.vendor_name : undefined,
      vendor_address: typeof ef.vendor_address === "string" ? ef.vendor_address : undefined,
      contract_amount: typeof ef.contract_amount === "string" ? ef.contract_amount : undefined,
      bid_number: typeof ef.bid_number === "string" ? ef.bid_number : undefined,
      state_contract_number: typeof ef.state_contract_number === "string" ? ef.state_contract_number : undefined,
      account_number: typeof ef.account_number === "string" ? ef.account_number : undefined,
      block_lot: typeof ef.block_lot === "string" ? ef.block_lot : undefined,
      statutory_citation: typeof ef.statutory_citation === "string" ? ef.statutory_citation : undefined,
      license_number: typeof ef.license_number === "string" ? ef.license_number : undefined,
      licensee_name: typeof ef.licensee_name === "string" ? ef.licensee_name : undefined,
      project_name: typeof ef.project_name === "string" ? ef.project_name : undefined,
      bond_amount: typeof ef.bond_amount === "string" ? ef.bond_amount : undefined,
      escrow_amount: typeof ef.escrow_amount === "string" ? ef.escrow_amount : undefined,
      recommended_action: typeof ef.recommended_action === "string" ? ef.recommended_action : undefined,
      dollar_amounts: Array.isArray(ef.dollar_amounts) ? ef.dollar_amounts.filter((d): d is string => typeof d === "string") : undefined,
      line_items: Array.isArray(ef.line_items)
        ? ef.line_items
            .filter((li): li is Record<string, unknown> => typeof li === "object" && li !== null)
            .map((li) => ({
              payee: typeof li.payee === "string" ? li.payee : "Unknown",
              amount: typeof li.amount === "string" ? li.amount : "$0.00",
              ...(typeof li.description === "string" ? { description: li.description } : {}),
            }))
        : undefined,
      ordinance_number: typeof ef.ordinance_number === "string" ? ef.ordinance_number : undefined,
      reading_stage: (ef.reading_stage === "first" || ef.reading_stage === "second") ? ef.reading_stage : undefined,
    },
    completeness: {
      needs_cfo_certification: typeof comp.needs_cfo_certification === "boolean" ? comp.needs_cfo_certification : false,
      needs_attorney_review: typeof comp.needs_attorney_review === "boolean" ? comp.needs_attorney_review : false,
      missing_block_lot: typeof comp.missing_block_lot === "boolean" ? comp.missing_block_lot : false,
      missing_statutory_citation: typeof comp.missing_statutory_citation === "boolean" ? comp.missing_statutory_citation : false,
      notes: Array.isArray(comp.notes) ? comp.notes.filter((n): n is string => typeof n === "string") : [],
    },
  };
}

function fallbackResult(error: string): ClassificationResult {
  return {
    relevant: true,
    confidence: "low",
    item_type: "other",
    department: null,
    summary: `Classification failed: ${error}`,
    extracted_fields: {},
    completeness: {
      needs_cfo_certification: false,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: ["Automated classification failed — manual review required"],
    },
  };
}

export async function classifyEmail(
  emailFrom: string,
  emailSubject: string,
  emailBody: string,
  attachmentTexts: { filename: string; text: string }[]
): Promise<ClassificationResult> {
  try {
    const userMessage = buildUserMessage(emailFrom, emailSubject, emailBody, attachmentTexts);

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Please classify the following email and extract structured data.\n\n${userMessage}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return fallbackResult("No text content in API response");
    }

    let jsonText = textBlock.text.trim();
    // Strip markdown code fences if present
    if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }

    const parsed = JSON.parse(jsonText);
    return safeParseResult(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fallbackResult(message);
  }
}
