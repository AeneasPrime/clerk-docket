import PDFDocument from "pdfkit";
import type { DocketEntry, ExtractedFields, CompletenessCheck } from "@/types";

const PAGE = {
  width: 612,
  height: 792,
  marginTop: 72,
  marginBottom: 72,
  marginLeft: 72,
  marginRight: 72,
  get contentWidth() { return this.width - this.marginLeft - this.marginRight; },
  get bottomLimit() { return this.height - this.marginBottom - 14; },
};

const TIMES  = { reg: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic" };
const HELV   = { reg: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique" };
const COUR   = { reg: "Courier", bold: "Courier-Bold", italic: "Courier-Oblique" };

const PDF_FONTS: Record<string, { reg: string; bold: string; italic: string }> = {
  times: TIMES, garamond: TIMES, palatino: TIMES, bookman: TIMES, cambria: TIMES, charter: TIMES,
  helvetica: HELV, arial: HELV, calibri: HELV, verdana: HELV, trebuchet: HELV, tahoma: HELV,
  courier: COUR,
};

const SPACING_GAP: Record<string, number> = { tight: 0, normal: 1, relaxed: 2.5 };

export interface AgendaPDFOptions {
  font?: string;      // "times" | "helvetica" | "courier"
  fontSize?: number;   // 10-14
  spacing?: string;    // "tight" | "normal" | "relaxed"
}

type LineItem = { payee: string; amount: string; description?: string };

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function primaryAmount(f: ExtractedFields): string | null {
  const v = f.contract_amount ?? f.bond_amount ?? f.escrow_amount;
  if (typeof v === "string") return v;
  if (Array.isArray(f.dollar_amounts) && f.dollar_amounts.length) {
    const last = f.dollar_amounts[f.dollar_amounts.length - 1];
    if (typeof last === "string") return last;
  }
  return null;
}

function generateClause(
  itemType: string,
  fields: ExtractedFields,
  summary: string | null,
  comp: CompletenessCheck
): { whereas: string[]; resolved: string; cfoNote: boolean } {
  const vendor = typeof fields.vendor_name === "string" ? fields.vendor_name : "[vendor]";
  const amount = primaryAmount(fields) ?? "[amount to be determined]";
  const project = typeof fields.project_name === "string" ? fields.project_name : "[project description]";
  const citation = typeof fields.statutory_citation === "string" ? fields.statutory_citation : null;
  const blockLot = typeof fields.block_lot === "string" ? fields.block_lot : null;
  const bidNum = typeof fields.bid_number === "string" ? fields.bid_number : null;
  const stateContract = typeof fields.state_contract_number === "string" ? fields.state_contract_number : null;
  const licenseNum = typeof fields.license_number === "string" ? fields.license_number : null;
  const licenseeName = typeof fields.licensee_name === "string" ? fields.licensee_name : null;
  const bondAmt = typeof fields.bond_amount === "string" ? fields.bond_amount : null;
  const escrowAmt = typeof fields.escrow_amount === "string" ? fields.escrow_amount : null;
  const action = typeof fields.recommended_action === "string" ? fields.recommended_action : null;
  const dollarAmounts = Array.isArray(fields.dollar_amounts) ? fields.dollar_amounts : [];
  const cfo = comp.needs_cfo_certification;

  switch (itemType) {
    case "resolution_bid_award":
      return {
        whereas: [
          `bids were received by the Township of Edison for ${project}${bidNum ? `, Public Bid No. ${bidNum}` : ""}`,
          `${vendor} submitted the lowest legally responsible, responsive bid in the amount of ${amount}`,
          "the Chief Financial Officer has certified that funds are available for this purpose",
          ...(citation ? [`the award is authorized pursuant to the Local Public Contracts Law, ${citation}`] : [
            "the award is authorized pursuant to the Local Public Contracts Law, N.J.S.A. 40A:11-1 et seq.",
          ]),
        ],
        resolved: `the contract for ${project} be and is hereby awarded to ${vendor}, in an amount not to exceed ${amount}, and the Mayor and Township Clerk are hereby authorized to execute said contract`,
        cfoNote: cfo,
      };
    case "resolution_professional_services":
      return {
        whereas: [
          `the Township of Edison has a need to acquire professional services for ${project}`,
          `${vendor} has submitted a proposal to provide such services in the amount of ${amount}`,
          ...(citation ? [`such services are to be awarded as a professional service without competitive bidding pursuant to ${citation}`] : [
            "such services are to be awarded as a professional service without competitive bidding pursuant to N.J.S.A. 40A:11-5(1)(a) of the Local Public Contracts Law",
          ]),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `${vendor} be and is hereby appointed to provide professional services for ${project}, in an amount not to exceed ${amount}, and the Mayor and Township Clerk are hereby authorized to execute the necessary agreement`,
        cfoNote: cfo,
      };
    case "resolution_state_contract":
      return {
        whereas: [
          `the Township of Edison wishes to purchase goods or services from ${vendor}`,
          ...(stateContract ? [`said purchase is authorized under New Jersey State Contract No. ${stateContract}`] : []),
          ...(citation ? [`the purchase is authorized pursuant to ${citation}`] : [
            "the purchase is authorized without competitive bidding pursuant to N.J.S.A. 40A:11-12 of the Local Public Contracts Law",
          ]),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `the Township be and is hereby authorized to purchase from ${vendor}, in an amount not to exceed ${amount}, under ${stateContract ? `New Jersey State Contract No. ${stateContract}` : "the applicable State contract"}, and the Mayor and Township Clerk are hereby authorized to execute any necessary documents`,
        cfoNote: cfo,
      };
    case "resolution_tax_refund":
      return {
        whereas: [
          blockLot
            ? `the Tax Collector has certified that a tax overpayment exists for property known as Block ${blockLot}`
            : "the Tax Collector has certified that a tax overpayment exists for the subject property",
          ...(dollarAmounts.length > 0 ? [`the overpayment totals ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          ...(citation ? [`the refund is authorized pursuant to ${citation}`] : []),
        ],
        resolved: `the Tax Collector be and is hereby authorized to process a refund${blockLot ? ` for Block ${blockLot}` : ""}${dollarAmounts.length > 0 ? ` in the amount of ${dollarAmounts[dollarAmounts.length - 1]}` : ""}`,
        cfoNote: cfo,
      };
    case "resolution_tax_sale_redemption":
      return {
        whereas: [
          blockLot
            ? `the property known as Block ${blockLot} was sold at tax sale by the Township of Edison`
            : "the subject property was sold at tax sale by the Township of Edison",
          "the owner has made full payment of all taxes, interest, penalties, and costs due thereon",
        ],
        resolved: `the Tax Collector be and is hereby authorized to issue a tax sale certificate of redemption${blockLot ? ` for Block ${blockLot}` : ""}${dollarAmounts.length > 0 ? ` upon receipt of ${dollarAmounts[dollarAmounts.length - 1]}` : ""}`,
        cfoNote: false,
      };
    case "resolution_bond_release":
      return {
        whereas: [
          `${vendor} has posted a performance bond${bondAmt ? ` in the amount of ${bondAmt}` : ""} in connection with ${project}`,
          ...(blockLot ? [`the project is located at Block ${blockLot} in the Township of Edison`] : []),
          "the Township Engineer has inspected said project and has certified that all work has been completed in accordance with the approved plans and specifications",
        ],
        resolved: `the performance bond posted by ${vendor}${bondAmt ? ` in the amount of ${bondAmt}` : ""} for ${project} be and is hereby released, and the Township Clerk is authorized to process said release`,
        cfoNote: false,
      };
    case "resolution_escrow_release":
      return {
        whereas: [
          `the applicant has requested the release of ${escrowAmt ? `developer escrow funds in the amount of ${escrowAmt}` : "developer escrow funds"} for ${project}`,
          ...(blockLot ? [`the project is located at Block ${blockLot} in the Township of Edison`] : []),
          "the Township Engineer has reviewed the escrow account and has certified that the balance may be released",
        ],
        resolved: `the developer escrow funds${escrowAmt ? ` in the amount of ${escrowAmt}` : ""} for ${project} be and are hereby authorized for release to the applicant`,
        cfoNote: false,
      };
    case "resolution_license_renewal":
      return {
        whereas: [
          licenseeName
            ? `${licenseeName} has applied for renewal of ${licenseNum ? `License No. ${licenseNum}` : "their license"} in the Township of Edison`
            : `the applicant has applied for license renewal${licenseNum ? ` (License No. ${licenseNum})` : ""} in the Township of Edison`,
          "all required documents, fees, and inspections have been completed and are in order",
        ],
        resolved: `the license renewal${licenseeName ? ` for ${licenseeName}` : ""}${licenseNum ? `, License No. ${licenseNum},` : ""} be and is hereby approved, subject to compliance with all applicable Township ordinances and State regulations`,
        cfoNote: false,
      };
    case "resolution_personnel":
      return {
        whereas: [
          action
            ? `the following personnel action has been recommended: ${action}`
            : "a personnel action has been recommended by the appropriate department head",
          ...(citation ? [`said action is authorized pursuant to ${citation}`] : []),
          "the Chief Financial Officer has certified that funds are available for this purpose, where applicable",
        ],
        resolved: action
          ? `the following personnel action be and is hereby approved: ${action}`
          : "the recommended personnel action be and is hereby approved as set forth in the attached schedule",
        cfoNote: cfo,
      };
    case "resolution_grant":
      return {
        whereas: [
          `the Township of Edison has been offered a grant for ${project} in the amount of ${amount}`,
          "it is in the best interest of the Township of Edison to accept said grant funds",
          "no local match is required unless otherwise specified herein",
        ],
        resolved: `the Mayor and Township Clerk be and are hereby authorized to execute all documents necessary to accept the grant for ${project} in the amount of ${amount}, and the Chief Financial Officer is authorized to establish the appropriate budget accounts`,
        cfoNote: cfo,
      };
    case "resolution_disbursement":
      return {
        whereas: [
          action
            ? `the following disbursement has been recommended for approval: ${action}`
            : "the claims listed on the bill list have been reviewed and approved for payment",
          ...(dollarAmounts.length > 0 ? [`the total disbursement amount is ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `the disbursements${dollarAmounts.length > 0 ? ` totaling ${dollarAmounts[dollarAmounts.length - 1]}` : ""} as set forth on the bill list be and are hereby approved for payment`,
        cfoNote: cfo,
      };
    case "resolution_surplus_sale":
      return {
        whereas: [
          `the Township of Edison has determined that certain property${project !== "[project description]" ? ` described as ${project}` : ""} is no longer needed for public use`,
          ...(blockLot ? [`said property is located at Block ${blockLot}`] : []),
          ...(vendor !== "[vendor]" ? [`${vendor} has submitted a bid for purchase of said surplus property`] : []),
          "the sale is authorized pursuant to N.J.S.A. 40A:12-13 et seq.",
        ],
        resolved: `the surplus property${project !== "[project description]" ? ` (${project})` : ""} be and is hereby authorized for sale${vendor !== "[vendor]" ? ` to ${vendor}` : ""} in accordance with applicable law`,
        cfoNote: false,
      };
    case "resolution_project_acceptance":
      return {
        whereas: [
          `${project} has been completed in the Township of Edison`,
          ...(blockLot ? [`the project is located at Block ${blockLot}`] : []),
          "the Township Engineer has inspected said project and has recommended acceptance thereof",
          "the developer has posted the required maintenance bond, where applicable",
        ],
        resolved: `${project} be and is hereby accepted by the Township of Edison, and the Township Clerk is authorized to process the release of any applicable performance guarantees${action ? `; and further, ${action}` : ""}`,
        cfoNote: false,
      };
    case "resolution_fee_waiver":
      return {
        whereas: [
          "an application has been received requesting a waiver of certain Township fees",
          ...(dollarAmounts.length > 0 ? [`the fee amount requested to be waived is ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          ...(action ? [`the recommendation is as follows: ${action}`] : []),
        ],
        resolved: `the fee waiver${dollarAmounts.length > 0 ? ` in the amount of ${dollarAmounts[dollarAmounts.length - 1]}` : ""} be and is hereby approved`,
        cfoNote: false,
      };
    default:
      return {
        whereas: [summary ?? "a matter has been presented to the Township Council for consideration and action"],
        resolved: summary ?? "the recommended action be and is hereby approved",
        cfoNote: false,
      };
  }
}

function generateOrdinanceTitle(
  itemType: string,
  fields: ExtractedFields,
  summary: string | null
): string {
  const citation = typeof fields.statutory_citation === "string" ? fields.statutory_citation : null;
  const project = typeof fields.project_name === "string" ? fields.project_name : null;

  if (itemType === "ordinance_amendment") {
    return `AN ORDINANCE TO AMEND AND SUPPLEMENT THE REVISED GENERAL ORDINANCES OF THE TOWNSHIP OF EDISON, COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, ${project ? `AMENDING ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "AMENDING THE REVISED GENERAL ORDINANCES")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
  }
  return `AN ORDINANCE OF THE TOWNSHIP OF EDISON, COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, ${project ? `ESTABLISHING ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "PROVIDING FOR THE GENERAL WELFARE")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
}

interface TextOverride {
  whereas?: string[];
  resolved?: string;
  further_resolved?: string[];
  ordinance_title?: string;
  summary?: string;
}

export function generateAgendaPDF(entries: DocketEntry[], meetingDateStr: string, opts?: AgendaPDFOptions): PDFKit.PDFDocument {
  const fonts = PDF_FONTS[opts?.font ?? "times"] ?? PDF_FONTS.times;
  const FONT_REG = fonts.reg;
  const FONT_BOLD = fonts.bold;
  const FONT_ITALIC = fonts.italic;
  const FONT_SIZE = Math.min(14, Math.max(8, opts?.fontSize ?? 10));
  const FONT_SIZE_SMALL = Math.max(7, FONT_SIZE - 1);
  const LINE_GAP = SPACING_GAP[opts?.spacing ?? "normal"] ?? 1;
  const LINE_HEIGHT = FONT_SIZE + LINE_GAP;

  const yr = meetingDateStr.slice(2, 4);
  const meetingDateFull = new Date(meetingDateStr + "T19:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();

  const resolutions = entries.filter((e) => e.item_type?.startsWith("resolution_"));
  const ordinances = entries.filter((e) => e.item_type?.startsWith("ordinance_"));
  const discussionItems = entries.filter((e) =>
    e.item_type === "discussion_item" || e.item_type === "informational" || e.item_type === "other"
  );

  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: PAGE.marginTop,
      bottom: PAGE.marginBottom,
      left: PAGE.marginLeft,
      right: PAGE.marginRight,
    },
    info: {
      Title: `Council Meeting Agenda - ${meetingDateFull}`,
      Author: "Township of Edison Municipal Clerk",
    },
  });

  let y = PAGE.marginTop;
  let pageNum = 1;

  function writePageFooter() {
    const savedY = y;
    const savedDocY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT_REG).fontSize(FONT_SIZE_SMALL);
    doc.text(String(pageNum), PAGE.width / 2 - 10, PAGE.height - PAGE.marginBottom + 8, {
      width: 20, align: "center", lineBreak: false,
    });
    doc.page.margins.bottom = savedBottom;
    doc.y = savedDocY;
    y = savedY;
  }

  function startNewPage() {
    writePageFooter();
    pageNum++;
    doc.addPage();
    y = PAGE.marginTop;
  }

  function ensureSpace(needed: number) {
    if (y + needed > PAGE.bottomLimit) {
      startNewPage();
    }
  }

  function writeText(text: string, x: number, width: number, opts?: { align?: string; bold?: boolean; italic?: boolean; fontSize?: number }) {
    const font = opts?.italic ? FONT_ITALIC : opts?.bold ? FONT_BOLD : FONT_REG;
    const size = opts?.fontSize ?? FONT_SIZE;
    doc.font(font).fontSize(size);
    const textHeight = doc.heightOfString(text, { width, lineGap: LINE_GAP });
    ensureSpace(textHeight);
    doc.text(text, x, y, { width, lineGap: LINE_GAP, align: opts?.align as "center" | "left" | undefined });
    y = doc.y;
  }

  function blankLine(n = 1) {
    y += LINE_HEIGHT * n;
  }

  // === HEADER ===
  blankLine(2);
  writeText("TOWNSHIP OF EDISON", PAGE.marginLeft, PAGE.contentWidth, { align: "center", bold: true });
  blankLine();
  writeText("COUNCIL MEETING AGENDA", PAGE.marginLeft, PAGE.contentWidth, { align: "center", bold: true });
  blankLine();

  // Divider line
  const centerX = PAGE.width / 2;
  doc.moveTo(centerX - 36, y).lineTo(centerX + 36, y).lineWidth(0.5).stroke();
  y += 8;

  writeText(`${meetingDateFull} \u2013 7:00 PM`, PAGE.marginLeft, PAGE.contentWidth, { align: "center" });
  blankLine(2);

  // === CONSENT AGENDA ===
  if (resolutions.length > 0) {
    writeText("CONSENT AGENDA", PAGE.marginLeft, PAGE.contentWidth, { bold: true });
    // Underline
    doc.moveTo(PAGE.marginLeft, y).lineTo(PAGE.marginLeft + PAGE.contentWidth, y).lineWidth(1).stroke();
    y += 6;

    writeText(
      "All items listed with an asterisk (*) are considered to be routine by the Township Council and will be enacted by one motion. There will be no separate discussion of these items unless a Council member so requests, in which event the item will be removed from the Consent Agenda and considered in its normal sequence on the agenda.",
      PAGE.marginLeft, PAGE.contentWidth, { italic: true, fontSize: FONT_SIZE_SMALL }
    );
    blankLine();

    resolutions.forEach((item, resIdx) => {
      const fields = parseJson<ExtractedFields>(item.extracted_fields, {} as ExtractedFields);
      const comp = parseJson<CompletenessCheck>(item.completeness, {
        needs_cfo_certification: false, needs_attorney_review: false,
        missing_block_lot: false, missing_statutory_citation: false, notes: [],
      });
      const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
      const clause = generateClause(item.item_type!, fields, item.summary, comp);
      const lineItems = Array.isArray(fields.line_items) ? fields.line_items as LineItem[] : [];
      const letter = String.fromCharCode(97 + resIdx);
      const resNum = `#${yr}-${resIdx + 1}`;

      const genWhereas = clause.whereas.map((w, i, a) =>
        `WHEREAS, ${w}${i < a.length - 1 ? "; and" : ";"}`
      );
      const whereas = override.whereas ?? genWhereas;
      const genResolved = `NOW, THEREFORE, BE IT RESOLVED by the Township Council of the Township of Edison, County of Middlesex, State of New Jersey, that ${clause.resolved}; and`;
      const resolved = override.resolved ?? genResolved;
      const genFurther = [
        "BE IT FURTHER RESOLVED that the aforementioned recitals are incorporated herein as though fully set forth at length; and",
        `BE IT FURTHER RESOLVED that a certified copy of this Resolution shall be forwarded to ${clause.cfoNote ? "the Chief Financial Officer, " : ""}the Township Clerk, and any other interested parties.`,
      ];
      const further = override.further_resolved ?? genFurther;

      ensureSpace(LINE_HEIGHT * 3);

      // Resolution header
      writeText(`${letter}. Resolution ${resNum}`, PAGE.marginLeft + 18, PAGE.contentWidth - 18, { bold: true });
      blankLine();

      // WHEREAS clauses
      for (const para of whereas) {
        writeText(para, PAGE.marginLeft + 18, PAGE.contentWidth - 18);
        y += 2;
      }
      blankLine();

      // RESOLVED
      writeText(resolved, PAGE.marginLeft + 18, PAGE.contentWidth - 18);
      y += 2;
      blankLine();

      // FURTHER RESOLVED
      for (const para of further) {
        writeText(para, PAGE.marginLeft + 18, PAGE.contentWidth - 18);
        y += 2;
      }

      // Disbursement table
      if (item.item_type === "resolution_disbursement" && lineItems.length > 0) {
        blankLine();
        writeText("REPORT OF DISBURSEMENTS", PAGE.marginLeft + 18, PAGE.contentWidth - 18, { bold: true, align: "center" });
        y += 4;

        const tableX = PAGE.marginLeft + 18;
        const tableW = PAGE.contentWidth - 36;
        const amtColW = 100;
        const fundColW = tableW - amtColW;

        // Header row
        doc.font(FONT_BOLD).fontSize(FONT_SIZE_SMALL);
        ensureSpace(LINE_HEIGHT * 2);
        doc.text("Fund", tableX, y, { width: fundColW, lineBreak: false });
        doc.text("Amount", tableX + fundColW, y, { width: amtColW, align: "right", lineBreak: false });
        y += LINE_HEIGHT;
        doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(0.5).stroke();
        y += 3;

        const totalItem = lineItems.find((li) => /total/i.test(li.payee));
        const fundItems = lineItems.filter((li) => !/total/i.test(li.payee));

        doc.font(FONT_REG).fontSize(FONT_SIZE_SMALL);
        for (const li of fundItems) {
          ensureSpace(LINE_HEIGHT);
          doc.text(li.payee, tableX, y, { width: fundColW, lineBreak: false });
          doc.text(li.amount, tableX + fundColW, y, { width: amtColW, align: "right", lineBreak: false });
          y += LINE_HEIGHT;
        }

        // Total row
        doc.moveTo(tableX, y).lineTo(tableX + tableW, y).lineWidth(0.5).stroke();
        y += 3;
        doc.font(FONT_BOLD).fontSize(FONT_SIZE_SMALL);
        ensureSpace(LINE_HEIGHT);
        doc.text("Total", tableX, y, { width: fundColW, lineBreak: false });
        doc.text(totalItem?.amount ?? primaryAmount(fields) ?? "\u2014", tableX + fundColW, y, { width: amtColW, align: "right", lineBreak: false });
        y += LINE_HEIGHT;
      }

      blankLine(2);
    });
  }

  // === ORDINANCES ===
  if (ordinances.length > 0) {
    ensureSpace(LINE_HEIGHT * 4);
    writeText("FOR FURTHER CONSIDERATION AND PUBLIC HEARING OF ORDINANCES", PAGE.marginLeft, PAGE.contentWidth, { bold: true });
    doc.moveTo(PAGE.marginLeft, y).lineTo(PAGE.marginLeft + PAGE.contentWidth, y).lineWidth(1).stroke();
    y += 6;

    ordinances.forEach((item) => {
      const fields = parseJson<ExtractedFields>(item.extracted_fields, {} as ExtractedFields);
      const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
      const ordTitle = override.ordinance_title ?? generateOrdinanceTitle(item.item_type!, fields, item.summary);

      ensureSpace(LINE_HEIGHT * 3);
      writeText(ordTitle, PAGE.marginLeft + 18, PAGE.contentWidth - 18, { bold: true });
      blankLine(2);
    });
  }

  // === DISCUSSION ITEMS ===
  if (discussionItems.length > 0) {
    ensureSpace(LINE_HEIGHT * 4);
    writeText("DISCUSSION ITEMS", PAGE.marginLeft, PAGE.contentWidth, { bold: true });
    doc.moveTo(PAGE.marginLeft, y).lineTo(PAGE.marginLeft + PAGE.contentWidth, y).lineWidth(1).stroke();
    y += 6;

    discussionItems.forEach((item, idx) => {
      const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
      const text = override.summary ?? item.summary ?? item.email_subject;

      ensureSpace(LINE_HEIGHT * 2);
      writeText(`${idx + 1}. ${text}`, PAGE.marginLeft + 18, PAGE.contentWidth - 18);
      blankLine();
    });
  }

  // === SIGNATURE ===
  ensureSpace(80);
  blankLine(3);

  const sigRightX = PAGE.marginLeft + PAGE.contentWidth - 180;
  const sigW = 180;

  doc.moveTo(sigRightX, y).lineTo(sigRightX + sigW, y).lineWidth(0.5).stroke();
  y += 4;

  writeText("Patricia Benedetto, RMC", sigRightX, sigW, { align: "left" });
  writeText("Township Clerk", sigRightX, sigW, { align: "left" });

  // Write footer on last page
  writePageFooter();

  return doc;
}
