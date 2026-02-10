import { getMeetingByTypeAndDate, updateMeeting } from "./db";
import { maybeAutoGenerateMinutes } from "./minutes-generator";

const CABLECAST_API = "https://cablecast.edisonnj.org/CablecastAPI/v1/shows";
const CABLECAST_BASE = "https://cablecast.edisonnj.org/internetchannel/show";

interface CablecastShow {
  id: number;
  title: string;
  cgTitle: string;
  eventDate: string;
}

interface CablecastResponse {
  shows: CablecastShow[];
}

function parseShowType(title: string): "work_session" | "regular" | null {
  const lower = title.toLowerCase();
  if (lower.includes("swearing in") || lower.includes("reorganization")) return null;
  if (lower.includes("work session")) return "work_session";
  if (lower.includes("council")) return "regular";
  return null;
}

function parseShowDate(eventDate: string): string {
  // eventDate is ISO 8601 like "2026-02-09T00:00:00-05:00"
  return eventDate.split("T")[0];
}

export async function syncVideosFromEdisonTV(): Promise<{
  matched: number;
  already_linked: number;
  unmatched: number;
}> {
  let matched = 0;
  let already_linked = 0;
  let unmatched = 0;

  try {
    const res = await fetch(
      `${CABLECAST_API}?channel_id=1&page_size=50&order_by=date&order=desc`
    );

    if (!res.ok) {
      throw new Error(`Cablecast API returned ${res.status}`);
    }

    const data: CablecastResponse = await res.json();

    for (const show of data.shows) {
      const meetingType = parseShowType(show.title);
      if (!meetingType) continue;

      const meetingDate = parseShowDate(show.eventDate);
      const videoUrl = `${CABLECAST_BASE}/${show.id}`;

      const meeting = getMeetingByTypeAndDate(meetingType, meetingDate);

      if (!meeting) {
        unmatched++;
        continue;
      }

      if (meeting.video_url) {
        already_linked++;
        continue;
      }

      updateMeeting(meeting.id, { video_url: videoUrl });
      maybeAutoGenerateMinutes(meeting.id);
      matched++;
    }
  } catch (err) {
    console.error("Video sync error:", err);
  }

  return { matched, already_linked, unmatched };
}
