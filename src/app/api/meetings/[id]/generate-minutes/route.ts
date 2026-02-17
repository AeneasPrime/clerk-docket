import { NextRequest, NextResponse } from "next/server";
import { getMeeting, getAgendaItemsForMeeting, updateMeeting } from "@/lib/db";
import { fetchTranscriptData, fetchWhisperTranscript, generateMinutes, analyzeOrdinanceOutcomes, type TranscriptSource } from "@/lib/minutes-generator";

// Allow long-running minutes generation (up to 10 minutes)
export const maxDuration = 600;

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

    // Get agenda items for this meeting
    const agendaItems = getAgendaItemsForMeeting(meeting.meeting_date);

    // Determine transcript source: default to fast Cablecast transcript API, allow whisper override
    let useWhisper = false;
    try {
      const body = await request.json();
      if (body.source === "whisper") useWhisper = true;
    } catch { /* default to transcript API */ }

    const transcriptData = useWhisper
      ? await fetchWhisperTranscript(meeting.video_url)
      : await fetchTranscriptData(meeting.video_url);

    if (!transcriptData.transcript?.trim()) {
      return NextResponse.json(
        { error: "No transcript available for this recording" },
        { status: 400 }
      );
    }

    const transcriptText: string = transcriptData.transcript;
    const chapters: string = transcriptData.chapters;
    const source: TranscriptSource = transcriptData.source;

    // Generate minutes via Claude
    const minutes = await generateMinutes(
      {
        meeting_type: meeting.meeting_type,
        meeting_date: meeting.meeting_date,
        video_url: meeting.video_url,
      },
      transcriptText,
      chapters,
      agendaItems,
      source
    );

    // Save the generated minutes
    updateMeeting(meetingId, { minutes });

    // Analyze transcript for ordinance outcomes and update tracking
    await analyzeOrdinanceOutcomes(meeting.meeting_type, meeting.meeting_date, transcriptText, agendaItems);

    const updated = getMeeting(meetingId);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Minutes generation error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
