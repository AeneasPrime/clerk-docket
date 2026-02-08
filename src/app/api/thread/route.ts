import { NextRequest, NextResponse } from "next/server";
import { fetchEmailThread } from "@/lib/gmail";

export async function GET(request: NextRequest) {
  const emailId = request.nextUrl.searchParams.get("emailId");

  if (!emailId) {
    return NextResponse.json({ error: "emailId is required" }, { status: 400 });
  }

  try {
    const messages = await fetchEmailThread(emailId);
    return NextResponse.json({ messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
