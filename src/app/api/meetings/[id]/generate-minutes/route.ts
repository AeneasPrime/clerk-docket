import { NextRequest, NextResponse } from "next/server";
import { getMeeting, getAgendaItemsForMeeting, updateMeeting } from "@/lib/db";
import { fetchTranscriptData, fetchWhisperTranscript, generateMinutes, type TranscriptSource } from "@/lib/minutes-generator";

export async function POST(
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

    if (!meeting.video_url) {
      return NextResponse.json(
        { error: "Meeting has no video URL — cannot generate minutes without a recording" },
        { status: 400 }
      );
    }

    // Parse request body for transcript source preference (default: whisper)
    let source: TranscriptSource = "whisper";
    try {
      const body = await request.json();
      if (body.source === "cablecast") source = "cablecast";
    } catch {
      // No body or invalid JSON — use default (whisper)
    }

    // Fetch transcript data based on source
    const transcriptData = source === "whisper"
      ? await fetchWhisperTranscript(meeting.video_url)
      : await fetchTranscriptData(meeting.video_url);

    if (!transcriptData.transcript || transcriptData.transcript.trim().length === 0) {
      return NextResponse.json(
        { error: "No transcript available for this recording" },
        { status: 400 }
      );
    }

    // Get agenda items for this meeting
    const agendaItems = getAgendaItemsForMeeting(meeting.meeting_date);

    // Generate minutes via Claude
    const minutes = await generateMinutes(
      {
        meeting_type: meeting.meeting_type,
        meeting_date: meeting.meeting_date,
        video_url: meeting.video_url,
      },
      transcriptData.transcript,
      transcriptData.chapters,
      agendaItems,
      transcriptData.source
    );

    // Save the generated minutes
    updateMeeting(meetingId, { minutes });

    const updated = getMeeting(meetingId);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Minutes generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
