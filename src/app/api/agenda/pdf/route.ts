import { NextRequest, NextResponse } from "next/server";
import { getDocketEntries } from "@/lib/db";
import { generateAgendaPDF } from "@/lib/agenda-pdf";

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl;
    const font = url.searchParams.get("font") ?? "times";
    const fontSize = parseInt(url.searchParams.get("size") ?? "10", 10);
    const spacing = url.searchParams.get("spacing") ?? "normal";

    // Get all accepted/on_agenda entries
    const { entries: all } = getDocketEntries({ relevant: true, limit: 500 });
    const accepted = all.filter((e) => e.status === "accepted" || e.status === "on_agenda");

    if (accepted.length === 0) {
      return NextResponse.json({ error: "No items on the agenda" }, { status: 400 });
    }

    // Determine meeting date (next work session Monday)
    const now = new Date();
    const ws = new Date(now);
    ws.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
    const meetingDate = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, "0")}-${String(ws.getDate()).padStart(2, "0")}`;

    const doc = generateAgendaPDF(accepted, meetingDate, { font, fontSize, spacing });

    const chunks: Buffer[] = [];
    return new Promise<NextResponse>((resolve, reject) => {
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => {
        const pdfBuffer = Buffer.concat(chunks);
        const [y, m, d] = meetingDate.split("-");
        const filename = `Agenda_${m}-${d}-${y}.pdf`;

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
    console.error("Agenda PDF error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
