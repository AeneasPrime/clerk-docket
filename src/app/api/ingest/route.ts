import { NextRequest, NextResponse } from "next/server";
import { processSingleEmail } from "@/lib/scanner";
import type { RawAttachment } from "@/types";

// Allow long-running classification (up to 5 minutes)
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  // Validate API key
  const apiKey = process.env.INGEST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "server_error", message: "INGEST_API_KEY not configured." },
      { status: 500 }
    );
  }

  const auth = request.headers.get("authorization");
  if (!auth || auth !== `Bearer ${apiKey}`) {
    return NextResponse.json(
      { success: false, error: "unauthorized", message: "Invalid or missing API key." },
      { status: 401 }
    );
  }

  // Parse request body
  let body: {
    emailId: string;
    from: string;
    subject: string;
    date: string;
    bodyText: string;
    bodyHtml?: string;
    attachments?: { filename: string; mimeType: string; data: string }[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "validation_error", message: "Invalid JSON body." },
      { status: 400 }
    );
  }

  // Validate required fields
  if (!body.emailId || !body.from || !body.subject || !body.date || !body.bodyText) {
    return NextResponse.json(
      { success: false, error: "validation_error", message: "Missing required fields: emailId, from, subject, date, bodyText." },
      { status: 400 }
    );
  }

  // Decode base64 attachments into RawAttachment[]
  const attachments: RawAttachment[] = [];
  if (body.attachments) {
    for (const att of body.attachments) {
      try {
        const buffer = Buffer.from(att.data, "base64");
        attachments.push({
          filename: att.filename,
          mimeType: att.mimeType,
          size: buffer.length,
          data: buffer,
        });
      } catch {
        // Skip malformed attachments
      }
    }
  }

  try {
    const result = await processSingleEmail({
      id: body.emailId,
      from: body.from,
      subject: body.subject,
      date: body.date,
      bodyText: body.bodyText,
      bodyHtml: body.bodyHtml,
      attachments,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    // Handle "already processed" case
    if (err instanceof Error && (err as Error & { code?: string }).code === "ALREADY_PROCESSED") {
      return NextResponse.json(
        {
          success: false,
          error: "already_processed",
          message: err.message,
          docketId: (err as Error & { docketId?: number }).docketId,
        },
        { status: 409 }
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: "processing_error", message },
      { status: 500 }
    );
  }
}
