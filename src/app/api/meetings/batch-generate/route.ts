import { NextResponse } from "next/server";
import { getPastMeetingsWithoutMinutes, getAgendaItemsForMeeting, updateMeeting } from "@/lib/db";
import { syncVideosFromCablecast } from "@/lib/video-sync";
import { fetchTranscriptData, generateMinutes, analyzeOrdinanceOutcomes } from "@/lib/minutes-generator";

// Allow long-running batch generation (up to 10 minutes)
export const maxDuration = 600;

interface BatchResult {
  meetingId: number;
  meetingDate: string;
  meetingType: string;
  status: "success" | "no_transcript" | "error";
  reviewMarkers?: number;
  error?: string;
}

export async function POST() {
  const results: BatchResult[] = [];

  try {
    // Step 1: Sync video URLs from Cablecast for any meetings missing them
    const syncResult = await syncVideosFromCablecast();
    console.log(`[batch] Video sync: ${syncResult.matched} new, ${syncResult.already_linked} existing, ${syncResult.unmatched} unmatched`);

    // Step 2: Find all past meetings with video URLs but no minutes
    const meetings = getPastMeetingsWithoutMinutes();

    if (meetings.length === 0) {
      return NextResponse.json({
        message: "All past meetings already have minutes generated",
        sync: syncResult,
        results: [],
      });
    }

    // Step 3: Process each meeting sequentially
    for (const meeting of meetings) {
      const result: BatchResult = {
        meetingId: meeting.id,
        meetingDate: meeting.meeting_date,
        meetingType: meeting.meeting_type,
        status: "success",
      };

      try {
        // Fetch transcript via Cablecast transcript API
        const transcriptData = await fetchTranscriptData(meeting.video_url!);

        if (!transcriptData.transcript?.trim()) {
          result.status = "no_transcript";
          results.push(result);
          continue;
        }

        const agendaItems = getAgendaItemsForMeeting(meeting.meeting_date);

        // Generate minutes via Claude
        const minutes = await generateMinutes(
          {
            meeting_type: meeting.meeting_type,
            meeting_date: meeting.meeting_date,
            video_url: meeting.video_url!,
          },
          transcriptData.transcript,
          transcriptData.chapters,
          agendaItems,
          transcriptData.source
        );

        // Save minutes
        updateMeeting(meeting.id, { minutes });

        // Count review markers
        const reviewMatches = minutes.match(/\[REVIEW:[^\]]*\]/g);
        result.reviewMarkers = reviewMatches ? reviewMatches.length : 0;

        // Analyze ordinance outcomes
        await analyzeOrdinanceOutcomes(
          meeting.meeting_type,
          meeting.meeting_date,
          transcriptData.transcript,
          agendaItems
        );

        console.log(`[batch] Generated minutes for ${meeting.meeting_date} ${meeting.meeting_type} (${result.reviewMarkers} review markers)`);
      } catch (err) {
        result.status = "error";
        result.error = err instanceof Error ? err.message : String(err);
        console.error(`[batch] Failed for ${meeting.meeting_date} ${meeting.meeting_type}:`, result.error);
      }

      results.push(result);
    }

    return NextResponse.json({
      message: `Processed ${results.length} meetings`,
      sync: syncResult,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[batch] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
