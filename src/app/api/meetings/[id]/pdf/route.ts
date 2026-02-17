import { NextRequest, NextResponse } from "next/server";
import { getMeeting } from "@/lib/db";
import { generateMinutesPDF } from "@/lib/minutes-pdf";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meetingId = parseInt(id, 10);
    const meeting = getMeeting(meetingId);

    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    if (!meeting.minutes) {
      return NextResponse.json(
        { error: "No minutes available for this meeting. Generate minutes first." },
        { status: 400 }
      );
    }

    // Generate PDF — mark as DRAFT if any [REVIEW:] markers remain
    const hasReviewMarkers = /\[REVIEW:[^\]]*\]/.test(meeting.minutes);
    const doc = generateMinutesPDF({
      meetingDate: meeting.meeting_date,
      meetingType: meeting.meeting_type as "work_session" | "regular",
      minutes: meeting.minutes,
      isDraft: hasReviewMarkers,
    });

    // Collect PDF into buffer
    const chunks: Buffer[] = [];
    return new Promise<NextResponse>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);

        // Build filename like "01-12-2026 wor.pdf"
        const [y, m, d] = meeting.meeting_date.split("-");
        const typeCode = meeting.meeting_type === "work_session" ? "wor" : "reg";
        const filename = `${m}-${d}-${y} ${typeCode}.pdf`;

        resolve(
          new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename}"`,
              "Content-Length": String(pdfBuffer.length),
            },
          })
        );
      });
      doc.on("error", reject);
      doc.end();
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
