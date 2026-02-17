import { NextRequest, NextResponse } from "next/server";
import { getMeeting, updateMeeting, getAgendaItemsForMeeting, insertMinutesHistory, getMinutesHistory } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const meetingId = parseInt(id, 10);
    const meeting = getMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }
    const agenda_items = getAgendaItemsForMeeting(meeting.meeting_date);

    // Return history if requested
    const wantHistory = request.nextUrl.searchParams.get("history");
    if (wantHistory === "true") {
      return NextResponse.json({ ...meeting, agenda_items, history: getMinutesHistory(meetingId) });
    }

    return NextResponse.json({ ...meeting, agenda_items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const meetingId = parseInt(id, 10);

    const meeting = getMeeting(meetingId);
    if (!meeting) {
      return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
    }

    // Record history if minutes are changing
    if (body.minutes !== undefined && body.minutes !== meeting.minutes) {
      insertMinutesHistory(meetingId, meeting.minutes ?? "", body.minutes);
    }

    updateMeeting(meetingId, {
      video_url: body.video_url,
      minutes: body.minutes,
      status: body.status,
    });

    const updated = getMeeting(meetingId);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
