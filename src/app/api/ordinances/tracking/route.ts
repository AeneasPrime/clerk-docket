import { NextRequest, NextResponse } from "next/server";
import { getDocketEntry, getOrdinanceTracking, upsertOrdinanceTracking } from "@/lib/db";

export async function GET(request: NextRequest) {
  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const tracking = getOrdinanceTracking(id);
  return NextResponse.json({ tracking });
}

export async function PATCH(request: NextRequest) {
  const id = parseInt(request.nextUrl.searchParams.get("id") ?? "", 10);
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const entry = getDocketEntry(id);
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await request.json();

  // Auto-calculate effective date: 20 days after adoption (unless emergency)
  if (body.adoption_date && !body.effective_date) {
    const d = new Date(body.adoption_date + "T12:00:00");
    if (!body.is_emergency) {
      d.setDate(d.getDate() + 20);
    }
    body.effective_date = d.toISOString().split("T")[0];
  }

  // Clear effective date if adoption is being removed
  if (body.adoption_date === "" || body.adoption_date === null) {
    body.effective_date = null;
  }

  upsertOrdinanceTracking(id, body);

  const tracking = getOrdinanceTracking(id);
  return NextResponse.json({ tracking });
}
