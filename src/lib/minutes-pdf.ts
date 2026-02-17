import PDFDocument from "pdfkit";

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

// Measured from actual Edison Township minutes PDF
const FONT_SIZE = 10;
const LINE_GAP = 1;
const LINE_HEIGHT = FONT_SIZE + LINE_GAP; // ~11pt, matching actual's 11.3pt
const SECTION_INDENT = 36; // 36pt from margin, matching actual's 108pt from page edge

const FONT_REG = "Times-Roman";
const FONT_BOLD = "Times-Bold";

interface MinutesPDFOptions {
  meetingDate: string;
  meetingType: "work_session" | "regular";
  minutes: string;
  isDraft?: boolean;
}

function formatHeaderDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${m}/${d}/${y}`;
}

function formatLongDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** Check if a line is predominantly uppercase (section headers, ordinance titles) */
function isAllCaps(text: string): boolean {
  const letters = text.replace(/[^a-zA-Z]/g, "");
  if (letters.length === 0) return false;
  const upper = letters.replace(/[^A-Z]/g, "").length;
  return upper / letters.length > 0.7;
}

/** Lines that should NOT be indented even inside a numbered section */
function isFullWidthLine(text: string): boolean {
  return (
    text.startsWith("A Worksession") ||
    text.startsWith("A Regular") ||
    text.startsWith("A Combined") ||
    text.startsWith("Present were") ||
    text.startsWith("Also present") ||
    text.startsWith("The Township Clerk advised") ||
    text.startsWith("This meeting") ||
    text.startsWith("http") ||
    text.startsWith("On a motion") ||
    text.startsWith("Hearing no further")
  );
}

/** Check if line should be bold within a section */
function isBoldLine(text: string, inDiscussion: boolean): boolean {
  // ALL-CAPS lines (department headers, ordinance titles, etc.)
  if (isAllCaps(text)) return true;
  // Discussion Items: councilmember names and their items
  if (inDiscussion) {
    if (text.startsWith("Councilmember") || text.startsWith("Council President") ||
        text.startsWith("Council Vice President")) return true;
    if (/^a\.\s/.test(text)) return true;
  }
  return false;
}

export function generateMinutesPDF(options: MinutesPDFOptions): PDFKit.PDFDocument {
  const { meetingDate, minutes, isDraft } = options;
  const headerDate = formatHeaderDate(meetingDate);

  const doc = new PDFDocument({
    size: "LETTER",
    margins: {
      top: PAGE.marginTop,
      bottom: PAGE.marginBottom,
      left: PAGE.marginLeft,
      right: PAGE.marginRight,
    },
    info: {
      Title: `Council Meeting Minutes - ${formatLongDate(meetingDate)}`,
      Author: "Township of Edison Municipal Clerk",
    },
  });

  let y = PAGE.marginTop;
  let pageNum = 1;

  function writePageHeader() {
    const savedY = y;
    const savedDocY = doc.y;
    doc.font(FONT_REG).fontSize(FONT_SIZE);
    doc.text(headerDate, PAGE.width - PAGE.marginRight - 80, PAGE.marginTop - 24, {
      width: 80,
      align: "right",
      lineBreak: false,
    });
    if (isDraft) {
      doc.font(FONT_BOLD).fontSize(28);
      doc.fillColor("#CC0000")
        .text("DRAFT", PAGE.marginLeft, PAGE.marginTop - 32, {
          width: PAGE.contentWidth,
          align: "center",
          lineBreak: false,
        })
        .fillColor("#000000");
    }
    // Reset font so callers aren't left with DRAFT's bold 28pt font state
    doc.font(FONT_REG).fontSize(FONT_SIZE);
    doc.y = savedDocY;
    y = savedY;
  }

  function writePageFooter() {
    const savedY = y;
    const savedDocY = doc.y;
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT_REG).fontSize(FONT_SIZE);
    doc.text(String(pageNum), PAGE.width / 2 - 10, PAGE.height - PAGE.marginBottom + 8, {
      width: 20,
      align: "center",
      lineBreak: false,
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
    writePageHeader();
  }

  // Write header on first page
  writePageHeader();

  function ensureSpace(needed: number) {
    if (y + needed > PAGE.bottomLimit) {
      startNewPage();
    }
  }

  function writeText(text: string, x: number, width: number, opts?: { align?: string; bold?: boolean; color?: string }) {
    const font = opts?.bold ? FONT_BOLD : FONT_REG;
    doc.font(font).fontSize(FONT_SIZE);
    if (opts?.color) doc.fillColor(opts.color);
    const textHeight = doc.heightOfString(text, { width, lineGap: LINE_GAP });
    ensureSpace(textHeight);
    // Re-apply font after ensureSpace (page breaks can change font state)
    doc.font(font).fontSize(FONT_SIZE);
    if (opts?.color) doc.fillColor(opts.color);
    doc.text(text, x, y, { width, lineGap: LINE_GAP, align: opts?.align as "center" | "left" | undefined });
    y = doc.y;
    if (opts?.color) doc.fillColor("#000000");
  }

  function blankLine() {
    y += LINE_HEIGHT;
  }

  // --- Parse minutes into sections ---
  const REVIEW_RE = /\[REVIEW:\s*(.*?)(?:\s*@\d{1,2}:\d{2}(?::\d{2})?)?\s*\]/g;

  function hasReviewMarker(text: string): boolean {
    return /\[REVIEW:[^\]]*\]/.test(text);
  }

  /** Render a line that contains [REVIEW: ...] markers with mixed colors:
   *  normal text in black, review content in red prefixed with "REVIEW:" */
  function writeReviewLine(text: string, x: number, width: number) {
    const segments: Array<{ text: string; isReview: boolean }> = [];
    const regex = new RegExp(REVIEW_RE.source, "g");
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, match.index), isReview: false });
      }
      segments.push({ text: `REVIEW: ${match[1]}`, isReview: true });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      segments.push({ text: text.slice(lastIndex), isReview: false });
    }

    // Calculate height for page-break check
    doc.font(FONT_REG).fontSize(FONT_SIZE);
    const fullText = segments.map(s => s.text).join("");
    const th = doc.heightOfString(fullText, { width, lineGap: LINE_GAP });
    ensureSpace(th);
    doc.font(FONT_REG).fontSize(FONT_SIZE);

    // Render segments inline with PDFKit's "continued" option
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      const isLast = si === segments.length - 1;
      doc.fillColor(seg.isReview ? "#CC0000" : "#000000");
      if (si === 0) {
        doc.text(seg.text, x, y, { width, lineGap: LINE_GAP, continued: !isLast });
      } else {
        doc.text(seg.text, { continued: !isLast });
      }
    }
    y = doc.y;
    doc.fillColor("#000000");
  }

  const lines = minutes.replace(/\t/g, "    ").split("\n");

  // Find title block (everything before the first paragraph starting with "A Worksession" or "A Regular" or "A Combined")
  let titleEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith("A Worksession") || t.startsWith("A Regular") || t.startsWith("A Combined")) {
      titleEnd = i;
      break;
    }
  }

  // Title lines (centered, bold)
  const titleLines = lines.slice(0, titleEnd).filter(l => l.trim().length > 0);

  // Find signature block
  let sigStart = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("___")) {
      sigStart = i;
      break;
    }
  }

  const bodyLines = lines.slice(titleEnd, sigStart);
  const sigLines = lines.slice(sigStart);

  // --- Render title block (bold, centered) ---
  blankLine();
  blankLine();
  for (const line of titleLines) {
    writeText(line.trim(), PAGE.marginLeft, PAGE.contentWidth, { align: "center", bold: true });
  }
  blankLine();
  blankLine();

  // --- Render body ---
  const sectionNumPattern = /^(\d+)\.\s+/;
  let insideSection = false;
  let inDiscussion = false;

  for (let i = 0; i < bodyLines.length; i++) {
    const line = bodyLines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      blankLine();
      continue;
    }

    // Lines with [REVIEW: ...] markers — render inline with only the review part in red
    if (hasReviewMarker(trimmed)) {
      const indent = insideSection && !isFullWidthLine(trimmed) ? SECTION_INDENT : 0;
      writeReviewLine(trimmed, PAGE.marginLeft + indent, PAGE.contentWidth - indent);
      continue;
    }

    // Track Discussion Items section
    if (/^\d+\.\s+DISCUSSION/.test(trimmed)) {
      inDiscussion = true;
    } else if (/^\d+\.\s+/.test(trimmed) && !trimmed.includes("DISCUSSION")) {
      inDiscussion = false;
    }

    const sectionMatch = trimmed.match(sectionNumPattern);

    if (sectionMatch) {
      // Numbered section: "4. PRESENTATION..." — both number and title in bold
      insideSection = true;
      const numText = sectionMatch[0]; // "4. "
      const rest = trimmed.slice(numText.length);

      ensureSpace(LINE_HEIGHT * 2);
      doc.font(FONT_BOLD).fontSize(FONT_SIZE);
      doc.text(numText, PAGE.marginLeft, y, { lineBreak: false });

      if (rest.length > 0) {
        doc.font(FONT_BOLD).fontSize(FONT_SIZE);
        doc.text(rest, PAGE.marginLeft + SECTION_INDENT, y, {
          width: PAGE.contentWidth - SECTION_INDENT,
          lineGap: LINE_GAP,
        });
        y = doc.y;
      } else {
        y = doc.y;
      }
    } else if (insideSection && !isFullWidthLine(trimmed)) {
      // Indented content within a numbered section
      const bold = isBoldLine(trimmed, inDiscussion);
      writeText(trimmed, PAGE.marginLeft + SECTION_INDENT, PAGE.contentWidth - SECTION_INDENT, { bold });
    } else {
      // Full-width text: preamble, motions, closing
      if (trimmed.startsWith("On a motion")) insideSection = false;
      if (trimmed.startsWith("Hearing no further")) insideSection = false;
      writeText(trimmed, PAGE.marginLeft, PAGE.contentWidth);
    }
  }

  // --- Signature block ---
  ensureSpace(60);
  blankLine();
  blankLine();

  // Parse sig lines for names and titles
  const nameLinesParsed: string[] = [];
  const titleLinesParsed: string[] = [];
  for (const line of sigLines) {
    const t = line.trim();
    if (t.includes("___") || t === "") continue;
    if (nameLinesParsed.length < 2) {
      const parts = t.split(/\s{4,}/);
      if (parts.length >= 2) {
        nameLinesParsed.push(parts[0].trim(), parts[1].trim());
      } else {
        nameLinesParsed.push(t);
      }
    } else {
      const parts = t.split(/\s{4,}/);
      if (parts.length >= 2) {
        titleLinesParsed.push(parts[0].trim(), parts[1].trim());
      } else {
        titleLinesParsed.push(t);
      }
    }
  }

  const sigLeftX = PAGE.marginLeft;
  const sigRightX = PAGE.marginLeft + PAGE.contentWidth / 2 + 20;
  const sigLineWidth = PAGE.contentWidth / 2 - 40;

  doc.moveTo(sigLeftX, y).lineTo(sigLeftX + sigLineWidth, y).lineWidth(0.5).stroke();
  doc.moveTo(sigRightX, y).lineTo(sigRightX + sigLineWidth, y).lineWidth(0.5).stroke();

  y += 4;
  doc.font(FONT_REG).fontSize(FONT_SIZE);
  doc.text(nameLinesParsed[0] || "Sam Joshi", sigLeftX, y, { width: sigLineWidth });
  doc.text(nameLinesParsed[1] || "Patricia Benedetto, RMC", sigRightX, y, { width: sigLineWidth });

  y += LINE_HEIGHT;
  doc.text(titleLinesParsed[0] || "Council President", sigLeftX, y, { width: sigLineWidth });
  doc.text(titleLinesParsed[1] || "Municipal Clerk", sigRightX, y, { width: sigLineWidth });

  // Write footer on the last page
  writePageFooter();

  return doc;
}
