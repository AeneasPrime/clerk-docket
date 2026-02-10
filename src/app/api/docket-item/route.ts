import { NextRequest, NextResponse } from "next/server";
import { getDocketEntry, updateDocketEntry, getMeetingsByDate } from "@/lib/db";
import { maybeAutoGenerateMinutes } from "@/lib/minutes-generator";

export async function GET(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const id = parseInt(idParam, 10);
  const entry = getDocketEntry(id);

  if (!entry) {
    return NextResponse.json({ error: "Docket entry not found" }, { status: 404 });
  }

  return NextResponse.json(entry);
}

export async function PATCH(request: NextRequest) {
  const idParam = request.nextUrl.searchParams.get("id");

  if (!idParam) {
    return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
  }

  const id = parseInt(idParam, 10);
  const existing = getDocketEntry(id);

  if (!existing) {
    return NextResponse.json({ error: "Docket entry not found" }, { status: 404 });
  }

  const body = await request.json();

  updateDocketEntry(id, {
    status: body.status,
    notes: body.notes,
    target_meeting_date: body.target_meeting_date,
    item_type: body.item_type,
    department: body.department,
  });

  // If a docket item was assigned to a meeting, check if minutes can be auto-generated
  if (body.target_meeting_date) {
    const meetings = getMeetingsByDate(body.target_meeting_date);
    for (const m of meetings) {
      maybeAutoGenerateMinutes(m.id);
    }
  }

  const updated = getDocketEntry(id);
  return NextResponse.json(updated);
}
