import { NextRequest, NextResponse } from "next/server";
import { getMeeting, getAgendaItemsForMeeting } from "@/lib/db";
import { generateAgendaPDF } from "@/lib/agenda-pdf";

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

    const agendaItems = getAgendaItemsForMeeting(meeting.meeting_date);

    if (agendaItems.length === 0) {
      return NextResponse.json(
        { error: "No agenda items for this meeting." },
        { status: 400 }
      );
    }

    const doc = generateAgendaPDF(agendaItems, meeting.meeting_date);

    const chunks: Buffer[] = [];
    return new Promise<NextResponse>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        const [y, m, d] = meeting.meeting_date.split("-");
        const filename = `Agenda_${m}-${d}-${y}.pdf`;

        resolve(
          new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="${filename}"`,
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
    console.error("Meeting agenda PDF error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
