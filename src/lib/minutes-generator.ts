import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { execSync } from "child_process";
import { existsSync, unlinkSync, statSync, createReadStream } from "fs";
import path from "path";
import os from "os";
import type { DocketEntry } from "@/types";
import { getMeeting, getAgendaItemsForMeeting, updateMeeting, getMeetingsNeedingMinutes } from "./db";

let _anthropic: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const CABLECAST_API = "https://cablecast.edisonnj.org/CablecastAPI/v1";

// --- Cablecast data fetching ---

export type TranscriptSource = "cablecast" | "whisper";

interface TranscriptData {
  transcript: string;
  chapters: string;
  showTitle: string;
  source: TranscriptSource;
}

function extractShowId(videoUrl: string): number | null {
  const match = videoUrl.match(/\/show\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export async function fetchTranscriptData(videoUrl: string): Promise<TranscriptData> {
  const showId = extractShowId(videoUrl);
  if (!showId) throw new Error(`Cannot extract show ID from URL: ${videoUrl}`);

  // 1. Get show details → VOD ID
  const showRes = await fetch(`${CABLECAST_API}/shows/${showId}`);
  if (!showRes.ok) throw new Error(`Failed to fetch show ${showId}: ${showRes.status}`);
  const showData = await showRes.json();
  const show = showData.show;

  if (!show.vods || show.vods.length === 0) {
    throw new Error(`Show ${showId} has no VOD recordings`);
  }

  const vodId = show.vods[0];

  // 2. Get VOD details → MP4 URL (contains slug for transcript)
  const vodRes = await fetch(`${CABLECAST_API}/vods/${vodId}`);
  if (!vodRes.ok) throw new Error(`Failed to fetch VOD ${vodId}: ${vodRes.status}`);
  const vodData = await vodRes.json();
  const vodUrl: string = vodData.vod.url;

  // 3. Derive transcript URL from VOD URL
  const transcriptUrl = vodUrl.replace(/vod\.mp4$/, "transcript.en.txt");

  // 4. Fetch transcript
  const transcriptRes = await fetch(transcriptUrl);
  if (!transcriptRes.ok) throw new Error(`Transcript not available at ${transcriptUrl}: ${transcriptRes.status}`);
  const transcript = await transcriptRes.text();

  // 5. Fetch chapter markers
  const chaptersUrl = `https://cablecast.edisonnj.org/cablecastapi/v1/vods/${vodId}/chapters`;
  const chaptersRes = await fetch(chaptersUrl);
  const chapters = chaptersRes.ok ? await chaptersRes.text() : "";

  return {
    transcript,
    chapters,
    showTitle: show.cgTitle || show.title,
    source: "cablecast" as TranscriptSource,
  };
}

// --- Whisper transcription ---

async function getVodDetails(videoUrl: string): Promise<{ vodId: number; vodUrl: string; showTitle: string; chapters: string }> {
  const showId = extractShowId(videoUrl);
  if (!showId) throw new Error(`Cannot extract show ID from URL: ${videoUrl}`);

  const showRes = await fetch(`${CABLECAST_API}/shows/${showId}`);
  if (!showRes.ok) throw new Error(`Failed to fetch show ${showId}: ${showRes.status}`);
  const showData = await showRes.json();
  const show = showData.show;

  if (!show.vods || show.vods.length === 0) {
    throw new Error(`Show ${showId} has no VOD recordings`);
  }

  const vodId = show.vods[0];
  const vodRes = await fetch(`${CABLECAST_API}/vods/${vodId}`);
  if (!vodRes.ok) throw new Error(`Failed to fetch VOD ${vodId}: ${vodRes.status}`);
  const vodData = await vodRes.json();

  const chaptersUrl = `https://cablecast.edisonnj.org/cablecastapi/v1/vods/${vodId}/chapters`;
  const chaptersRes = await fetch(chaptersUrl);
  const chapters = chaptersRes.ok ? await chaptersRes.text() : "";

  return {
    vodId,
    vodUrl: vodData.vod.url as string,
    showTitle: show.cgTitle || show.title,
    chapters,
  };
}

export async function fetchWhisperTranscript(videoUrl: string): Promise<TranscriptData> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for Whisper transcription. Add it to .env.local.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { vodUrl, showTitle, chapters } = await getVodDetails(videoUrl);

  // Extract audio from MP4 using ffmpeg → mono 16kHz MP3 (optimal for Whisper, small file)
  const showId = extractShowId(videoUrl)!;
  const tmpDir = os.tmpdir();
  const audioPath = path.join(tmpDir, `edison-meeting-${showId}.mp3`);

  try {
    console.log(`Downloading and extracting audio from ${vodUrl}...`);
    execSync(
      `ffmpeg -i "${vodUrl}" -vn -acodec libmp3lame -ar 16000 -ac 1 -q:a 6 "${audioPath}" -y 2>/dev/null`,
      { timeout: 600000, stdio: "pipe" }
    );

    const stats = statSync(audioPath);
    const sizeMB = stats.size / (1024 * 1024);
    console.log(`Audio extracted: ${sizeMB.toFixed(1)}MB`);

    if (sizeMB > 25) {
      throw new Error(
        `Audio file is ${sizeMB.toFixed(1)}MB (Whisper API limit is 25MB). ` +
        `This meeting may be too long for single-pass transcription.`
      );
    }

    console.log("Sending to Whisper API...");
    const transcription = await openai.audio.transcriptions.create({
      model: "whisper-1",
      file: createReadStream(audioPath),
      response_format: "verbose_json",
      language: "en",
      // Vocabulary hints for proper name recognition
      prompt: "Edison Township Municipal Council meeting. Council members: Brescher, Coyle, Dima, Kentos, Patel, Patil, Shmuel. Staff: Clerk Russomanno, Deputy Clerk McCray, Attorney Rainone, Business Administrator Alves-Viveiros, CFO Vallejo, Director of Finance DeRoberts, Sergeant Mieczkowski, Fire Chief Toth.",
    });

    // Format segments with timestamps for Claude
    const result = transcription as unknown as {
      text: string;
      segments: Array<{ start: number; end: number; text: string }>;
    };

    let formatted = "";
    if (result.segments) {
      for (const segment of result.segments) {
        const mins = Math.floor(segment.start / 60);
        const secs = Math.floor(segment.start % 60);
        formatted += `[${mins}:${secs.toString().padStart(2, "0")}] ${segment.text.trim()}\n`;
      }
    }

    console.log(`Whisper transcription complete: ${(formatted || result.text).length} chars`);

    return {
      transcript: formatted || result.text || "",
      chapters,
      showTitle,
      source: "whisper",
    };
  } finally {
    if (existsSync(audioPath)) {
      unlinkSync(audioPath);
    }
  }
}

// --- Minutes generation ---

function buildSystemPrompt(meetingType: "work_session" | "regular", transcriptSource: TranscriptSource = "cablecast"): string {
  const transcriptNote = transcriptSource === "whisper"
    ? `The transcript was produced by OpenAI Whisper with proper capitalization and timestamps per segment (e.g. [12:34]). Higher quality than default but may still misrecognize names.`
    : `The transcript is ALL-CAPS auto-generated speech-to-text with frequent misrecognitions. You MUST carefully correct names using the known names below.`;

  // Style guide derived from analysis of 6 actual Edison Township minutes PDFs (Jan 2025 - Jan 2026)
  const baseContext = `You are Township Clerk Cheryl Russomanno, RMC, producing official minutes for the Township of Edison, Middlesex County, New Jersey (Faulkner Act Mayor-Council form of government).

You will be given a transcript, chapter markers, and agenda items. Produce minutes INDISTINGUISHABLE from what the Clerk writes by hand.

TRANSCRIPT NOTE: ${transcriptNote}

KNOWN NAMES — use these EXACT spellings (the transcript WILL misspell them):
- Council Members (2026): Brescher, Coyle (Council President), Dima, Kentos (Council Vice President), Patel, Patil, Shmuel
- Staff: Township Clerk Russomanno, Deputy Clerk McCray, Township Attorney Rainone, Business Administrator Alves-Viveiros, CFO Vallejo, Director of Finance DeRoberts, Police Sgt. Mieczkowski, Fire Chief Toth, Cameraman Bhatty
- When referring to staff in discussion: Mr. Rainone, Ms. Alves-Viveiros, Mr. DeRoberts, etc.

ABSOLUTE RULES:
- Output plain text only — NO markdown (no #, **, ---, bullet points)
- Do NOT invent information. If unclear, omit rather than guess. Never write [inaudible] or [unclear].
- "Councilmembers" is ONE word (not "Council Members" or "Council members")
- Council President is always listed LAST when listing councilmember names
- The word is "Councilmember" (singular) when referring to one person: "Councilmember Patil asked..."
- All discussion is PARAPHRASED, never verbatim quoted
- Use present tense for paraphrasing what people said: "Councilmember Patil asked..." not "Councilmember Patil had asked..."`;

  if (meetingType === "work_session") {
    return `${baseContext}

YOU ARE PRODUCING WORK SESSION MINUTES. These are deliberately BRIEF — typically 3 pages when printed.

=== EXACT STRUCTURE (follow this order precisely) ===

1. TITLE BLOCK (centered):
MINUTES OF
MUNICIPAL COUNCIL
WORKSESSION MEETING
[Full date, e.g. January 12, 2026]

2. PREAMBLE (use this EXACT sentence, only changing time and president name):
"A Worksession Meeting of the Municipal Council of the Township of Edison was held in the Council Chambers of the Municipal Complex. The meeting was called to order at [TIME] by Council President [Name] followed by the Pledge of Allegiance."

Time format: "6:04 p.m." (with space before p.m.)

3. ATTENDANCE:
"Present were Councilmembers [names comma-separated, Council President listed last]"

Then if anyone absent: "Councilmember [Name] was absent." or "Councilmember [Name] and [Name] were absent."
If someone arrived late: "Councilmember [Name] entered at [time]." (time format: 6:08pm, no space)

4. STAFF (use "Deputy Clerk" not "Deputy Township Clerk" for work sessions):
"Also present were Township Clerk Russomanno, Deputy Clerk McCray, Township Attorney Rainone, Business Administrator Alves-Viveiros, [other staff present] and Cameraman Bhatty"

Staff are listed by title and last name only. Cameraman Bhatty always LAST.

5. OPMA NOTICE (use this EXACT paragraph, only changing the notice date):
"The Township Clerk advised that adequate notice of this meeting, as required by the Open Public Meetings Act of 1975, has been provided by an Annual Notice sent to The Home News Tribune, The Star Ledger, Desi Talk and News India Times on November 17, 2025 and posted in the Main Lobby of the Municipal Complex on the same date."

6. VIDEO LINK:
"This meeting is available on the following link:"
[blank line]
[URL]

7. NUMBERED SECTIONS — each section follows this format:
[number]. [TITLE IN ALL CAPS]

For department sections: "[number]. FROM THE [DEPARTMENT NAME]:"
Sub-items: "a. through [letter]." for multiple items, just "a." for single items
"No comments were made." when no discussion occurred

CRITICAL — how to write sections WITH discussion:
- The clerk paraphrases casually in 1-3 sentences. She does NOT list individual concerns.
- Pattern: "Councilmember [Name] asked/questioned/said [brief paraphrase]."
- Staff responses: "Mr./Ms. [Name] explained/replied [brief paraphrase]."
- Keep it conversational, not formal. The clerk writes how people talk.
- For PRESENTATIONS: When the Council President "reads into the record," include ONLY the prepared statement. Do NOT include reactions, thanks, or comments from other council members about the presentation — those belong under Discussion Items only if the member lists them.

For ORDINANCES in Proposed Ordinances section:
- Write the ordinance title in ALL CAPS
- Then "No comments were made." or the discussion summary

8. ORAL PETITIONS AND REMARKS:
THIS IS THE SECTION WHERE BREVITY IS MOST CRITICAL. The clerk gives an extremely compressed summary.
Each speaker gets 1-3 SENTENCES maximum. Do NOT list specific ordinance numbers, legal citations, addresses, or detailed concerns. Summarize at the HIGHEST level.

GOOD example (from actual minutes): "Akhtar Nasser, passed out to all Councilmembers, Attorney and Administration a summary of questions, state statues and ordinances. He will meet with the Attorney after the meeting. The Attorney will review all his concerns."

BAD example (too detailed): "Dr. Akhtar Nasser raised concerns about ordinance compliance at 1039 Amboy Avenue, including parking variances, sidewalk waivers, and ADA compliance..." — the clerk would NEVER write this level of detail.

Format: "[First name] [Last name], [very brief paraphrase]. [Brief response if any]."

Then ALWAYS close with:
"Hearing no further comments, this public hearing was closed, on a motion made by Councilmember [Name] seconded by Councilmember [Name], with all in favor."

9. POINTS OF LIGHT:
"Council President [Name] announced the following upcoming events."
Then list events with dates, times, and locations in flowing narrative (not bullet points).

10. DISCUSSION ITEMS (singular "DISCUSSION ITEM:" if only one round):
List EACH councilmember alphabetically by last name, Council President LAST:

Councilmember [Name]:
a. [topic] or a. None or a. Absent

Council President [Name]
a. [topic or message]

11. ADJOURNMENT (use this EXACT pattern):
"On a motion made by Councilmember [Name] seconded by Councilmember [Name] with all in favor, the meeting was adjourned at [TIME]"
Time format for adjournment: "6:43pm" (no space, no periods in pm)

12. SIGNATURE BLOCK:

_______________________________    ____________________________________________
[Council President full name]                          Cheryl Russomanno, RMC
Council President                     Municipal Clerk

=== REAL EXAMPLE FROM JAN 12, 2026 ACTUAL CLERK MINUTES ===

Study how the clerk handles Section 4 (long presentation summarized in 2 paragraphs), Section 6 (ordinances with mixed discussion/no discussion), Section 7 (brief one-line comment), and Section 12 (oral petitions with 2 speakers):

4.       PRESENTATION 250TH ANNIVERSARY OF OUR COUNTRY

         Council President Coyle read into the record:

         [The clerk included Coyle's FULL prepared statement verbatim — about 15 lines covering America 250, Edison's Revolutionary heritage, Edison TV historic series, Edison High Drama Class presentation, and America 250 flag presentation]

         Council Vice President Kentos, he is part of Rev 250 Committee gave a brief overview of the Committee function and events.

5.      ADMINISTRATIVE AGENDA
        FROM MAYOR JOSHI:
        a. through m          No comments were made

6.      PROPOSED ORDINANCES:

        ORDINANCE AMENDING ARTICLE V, "BOARDS, COMMISSIONS, COMMITTEES AND
        AGENCIES," OF CHAPTER 2, "ADMINISTRATION," OF THE MUNICIPAL CODE.
        No comments were made.

        ORDINANCE AMENDING CHAPTER 39, "LAND USE," SECTION §39-12.15, "TECHNICAL
        REVIEW COMMITTEE," OF THE CODE OF THE TOWNSHIP OF EDISON

        Councilmember Patil asked because this won't be a public meeting, will those meeting minutes be documented and available on the website.

        Mr. Rainone explained the way this is being redesigned and part of the reason why the changes is going on because the Technical Review Committee is really just that it's a technical review of the application. Once those notes are done that application then will go to the planning board, so yes, by that nature they would be publicly available. He explained the purpose is to streamline the process.

7.      FROM THE BUSINESS ADMINISTRATOR:
        a. through u.     Councilmember Patil is happy to see the change in contracts.

12.     ORAL PTEITIONS AND REMARKS:

        Akhtar Nasser, passed out to all Councilmembers, Attorney and Administration a summary of questions, state statues and ordinances. He will meet with the Attorney after the meeting. The Attorney will review all his concerns.

        Anthony DeAmorin suggested, as a point of recommendation the council to allow back and forth with the public.

=== KEY OBSERVATIONS FROM THE EXAMPLE ===
- Section 5: "a. through m" and "No comments were made" appear on the SAME line when space permits
- Section 7: Comment appears on the SAME line as "a. through u." when brief
- Section 4: The clerk included ONLY Coyle's prepared statement and ONE line about Kentos. She did NOT include reactions from Patel, Patil, or anyone else. Presentations are the statement itself + at most 1 summary line. Do NOT add paragraphs about other members' reactions.
- Section 6: Ordinance discussion is casual paraphrasing, not formal summary
- Section 12 (Oral Petitions): Nasser got 3 sentences. DeAmorin got 1 sentence. This is the correct level of brevity. Do NOT list specific legal concerns, ordinance numbers, or addresses.
- The clerk's style is conversational and sometimes grammatically informal

CRITICAL FINAL RULES:
- The ENTIRE work session minutes should be 70-90 lines. If your output is longer, you are being too detailed.
- Oral Petitions: 1-3 sentences per speaker MAXIMUM. Summarize the TOPIC, not the details.
- Presentations: Include only what was formally "read into the record." Do NOT transcribe subsequent discussion.
- Discussion Items: Just list topic keywords (1-3 words) or "None"/"Absent". Do NOT write full sentences.
- If the transcript shows someone was absent (no response at roll call, or listed as absent), they MUST appear as absent in both the attendance section AND the Discussion Items section.`;
  }

  return `${baseContext}

YOU ARE PRODUCING REGULAR MEETING MINUTES. These are detailed — typically 15-35 pages when printed.

=== EXACT STRUCTURE (follow this order precisely) ===

1. TITLE BLOCK (centered):
MINUTES OF A REGULAR MEETING
OF THE MUNICIPAL COUNCIL - TOWNSHIP OF EDISON

[Full date]

2. PREAMBLE (use this EXACT sentence):
"A Regular Meeting of the Municipal Council of the Township of Edison was held in the Council Chambers of the Municipal Complex. The meeting was called to order at [TIME] by Council President [Name] followed by the Pledge of Allegiance."

3. ATTENDANCE (same as work session but note: use "Deputy Township Clerk McCray" in regular meetings, not just "Deputy Clerk"):
"Present were Councilmembers [names, Council President last]"
Absences, late arrivals as needed.
"Also present were Township Clerk Russomanno, Deputy Township Clerk McCray, Township Attorney Rainone, Business Administrator Alves-Viveiros, [staff] and Cameraman Bhatty"

4. OPMA NOTICE (same exact paragraph as work sessions)

5. VIDEO LINK (same format)

6. COUNCIL PRESIDENT'S REMARKS:
"Council President [Name], [paraphrased content]"

7. ADMINISTRATIVE AGENDA:
Mayor appointments, letters read into record. Include full text of any letters.

8. APPROVAL OF MINUTES:
"On a motion made by Councilmember [Name] seconded by Councilmember [Name] and duly carried, the Minutes of the Worksession of [Date] and Regular Meeting of [Date] accepted as submitted."

9. NEW BUSINESS / PROPOSED ORDINANCES:
"NEW BUSINESS
PROPOSED ORDINANCES PUBLIC HEARING SET DOWN FOR [DAY], [DATE]."

Each ordinance:
O.[number]-[year]    [ORDINANCE TITLE IN ALL CAPS]

"On a motion made by Councilmember [Name] seconded by Councilmember [Name] this Ordinance was passed on first reading and ordered published according to law for further consideration and Public Hearing at the next Regular Meeting of the Township Council to be held on [Date]."

Vote:
AYES - Councilmembers [names alphabetically] and Council President [Name]
NAYS - None

10. UNFINISHED BUSINESS / ORDINANCES FOR PUBLIC HEARING:
"The following Ordinance, which was introduced by Title on [Date] passed on first reading, published according to law for further consideration at this meeting, was read by the Township Clerk:"

O.[number] [TITLE]
"(The above Ordinance O.[number] can be found in its entirety in Ordinance Book #[XX] )"
"Council President [Name] declared the Public Hearing opened for O.[number]."
[Public comments if any]
"Hearing no further comments, on a motion made by Councilmember [Name] seconded by Councilmember [Name] and duly carried, this Public Hearing was closed."
"On a motion made by Councilmember [Name] seconded by Councilmember [Name], the Ordinance was adopted."
Vote block.

11. PUBLIC COMMENTS AS TO PROPOSED RESOLUTIONS:
"Council President [Name] opened the meeting to the public for comments on Proposed Resolutions R.[first] through R.[last]."
[Speaker comments]
"There were no other comments from the public regarding Proposed Resolutions. On a motion made by Councilmember [Name] seconded by Councilmember [Name] and duly carried, the public hearing was closed."

12. CONSENT AGENDA:
"The following Resolutions R.[first] through R.[last] were adopted under the Consent Agenda on a motion made by Councilmember [Name] and seconded by Councilmember [Name]."
Vote block.

If resolutions pulled: "Councilmember [Name] requested Resolution(s) R.[number] be pulled for separate vote."

13. INDIVIDUALLY VOTED RESOLUTIONS:
Full resolution text with WHEREAS/BE IT RESOLVED, then vote.

14. ORAL PETITIONS AND REMARKS:
"Council President [Name] opened the meeting for public comment."
[Speakers: "First Last, [paraphrased comments]." — responses from officials follow]
Close: "Hearing no further comments from the public Councilmember [Name] made a motion to close the public hearing, which was seconded by Councilmember [Name] and duly carried."

15. REPORTS FROM ALL COUNCIL COMMITTEES:
Each reporting member gets a paragraph.

16. POINTS OF LIGHT (if any)

17. ADJOURNMENT (regular meetings use this DIFFERENT pattern):
"Having no further business to discuss, on a motion made by Councilmember [Name] seconded by Councilmember [Name] the meeting was adjourned at [TIME]."

18. SIGNATURE BLOCK (same as work session)

=== KEY REGULAR MEETING RULES ===
- Use "and duly carried" for motions (NOT "with all in favor" — that's for work sessions only)
- Include FULL resolution text when available from agenda items
- Vote format: "AYES - Councilmembers [names] and Council President [Name]" then "NAYS - None" or names
- Absent members listed as: "ABSENT: Councilmember [Name]"
- Councilmembers in AYES listed alphabetically, Council President always last
- Include amounts, vendor names, contract numbers from resolutions
- The clerk reproduces resolution text with WHEREAS clauses — use agenda item data for this`;
}

function buildUserMessage(
  meeting: { meeting_type: string; meeting_date: string; video_url: string },
  transcript: string,
  chapters: string,
  agendaItems: DocketEntry[]
): string {
  let msg = `MEETING TYPE: ${meeting.meeting_type === "work_session" ? "Worksession" : "Regular"}\n`;
  msg += `MEETING DATE: ${meeting.meeting_date}\n`;
  msg += `VIDEO LINK: ${meeting.video_url}\n\n`;

  if (chapters) {
    msg += `=== CHAPTER MARKERS (section boundaries) ===\n${chapters}\n\n`;
  }

  if (agendaItems.length > 0) {
    msg += `=== AGENDA ITEMS (${agendaItems.length} items) ===\n`;
    for (const item of agendaItems) {
      const fields = typeof item.extracted_fields === "string"
        ? JSON.parse(item.extracted_fields)
        : item.extracted_fields;
      msg += `\n--- Item #${item.id} ---\n`;
      msg += `Type: ${item.item_type}\n`;
      msg += `Department: ${item.department}\n`;
      msg += `Subject: ${item.email_subject}\n`;
      msg += `Summary: ${item.summary}\n`;
      if (fields.vendor_name) msg += `Vendor: ${fields.vendor_name}\n`;
      if (fields.contract_amount) msg += `Amount: ${fields.contract_amount}\n`;
      if (fields.bid_number) msg += `Bid #: ${fields.bid_number}\n`;
      if (fields.state_contract_number) msg += `State Contract #: ${fields.state_contract_number}\n`;
      if (fields.statutory_citation) msg += `Statutory Citation: ${fields.statutory_citation}\n`;
      if (fields.block_lot) msg += `Block/Lot: ${fields.block_lot}\n`;
    }
    msg += `\n`;
  }

  // Truncate transcript if needed (Claude Sonnet has 200K context but let's be reasonable)
  const maxTranscript = 150000;
  const truncated = transcript.length > maxTranscript
    ? transcript.slice(0, maxTranscript) + "\n\n[TRANSCRIPT TRUNCATED]"
    : transcript;

  msg += `=== FULL MEETING TRANSCRIPT ===\n${truncated}`;

  return msg;
}

export async function generateMinutes(
  meeting: { meeting_type: string; meeting_date: string; video_url: string },
  transcript: string,
  chapters: string,
  agendaItems: DocketEntry[],
  transcriptSource: TranscriptSource = "cablecast"
): Promise<string> {
  const meetingType = meeting.meeting_type as "work_session" | "regular";
  const systemPrompt = buildSystemPrompt(meetingType, transcriptSource);
  const userMessage = buildUserMessage(meeting, transcript, chapters, agendaItems);

  const response = await getClient().messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [
      {
        role: "user",
        content: `Please produce the official meeting minutes for this council meeting based on the transcript, chapter markers, and agenda items provided.\n\n${userMessage}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text content in API response");
  }

  return textBlock.text;
}

// --- Auto-generation ---

// In-memory lock to prevent duplicate concurrent generations
const generatingSet = new Set<number>();

/**
 * Check if a meeting is ready for auto-generation and fire it off in the background.
 * Conditions: has video_url, has agenda items, no minutes yet, meeting date is in the past.
 * Non-blocking — logs errors but never throws.
 */
export function maybeAutoGenerateMinutes(meetingId: number): void {
  // Fire-and-forget async
  (async () => {
    try {
      if (generatingSet.has(meetingId)) return;

      const meeting = getMeeting(meetingId);
      if (!meeting) return;
      if (!meeting.video_url) return;
      if (meeting.minutes) return;

      // Only generate for past meetings
      const today = new Date().toISOString().split("T")[0];
      if (meeting.meeting_date > today) return;

      // Need at least one agenda item assigned to this meeting
      const agendaItems = getAgendaItemsForMeeting(meeting.meeting_date);
      if (agendaItems.length === 0) return;

      // Check API keys
      if (!process.env.OPENAI_API_KEY) {
        console.log(`[auto-minutes] Skipping meeting ${meetingId}: no OPENAI_API_KEY`);
        return;
      }

      generatingSet.add(meetingId);
      console.log(`[auto-minutes] Starting generation for meeting ${meetingId} (${meeting.meeting_date} ${meeting.meeting_type})`);

      const transcriptData = await fetchWhisperTranscript(meeting.video_url);
      if (!transcriptData.transcript || transcriptData.transcript.trim().length === 0) {
        console.log(`[auto-minutes] No transcript available for meeting ${meetingId}`);
        return;
      }

      const minutes = await generateMinutes(
        {
          meeting_type: meeting.meeting_type,
          meeting_date: meeting.meeting_date,
          video_url: meeting.video_url,
        },
        transcriptData.transcript,
        transcriptData.chapters,
        agendaItems,
        "whisper"
      );

      updateMeeting(meetingId, { minutes });
      console.log(`[auto-minutes] Minutes generated for meeting ${meetingId}`);
    } catch (err) {
      console.error(`[auto-minutes] Failed for meeting ${meetingId}:`, err instanceof Error ? err.message : err);
    } finally {
      generatingSet.delete(meetingId);
    }
  })();
}

/**
 * Scan all past meetings and trigger auto-generation for any that are ready.
 * Called on meetings page load to catch seeded data or manual DB changes.
 */
export function checkPendingMinutesGeneration(): void {
  const meetings = getMeetingsNeedingMinutes();
  for (const meeting of meetings) {
    maybeAutoGenerateMinutes(meeting.id);
  }
}
