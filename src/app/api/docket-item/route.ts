import { NextRequest, NextResponse } from "next/server";
import { getDocketEntry, updateDocketEntry, getMeetingsByDate, insertDocketHistory, getDocketHistory, getOrdinanceTracking, upsertOrdinanceTracking, getNextRegularMeetingAfter } from "@/lib/db";
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

  const history = request.nextUrl.searchParams.get("history");
  if (history === "true") {
    return NextResponse.json({ entry, history: getDocketHistory(id) });
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

  // Handle text override updates with history tracking
  if (body.text_override !== undefined) {
    const oldOverride: Record<string, unknown> = existing.text_override
      ? JSON.parse(existing.text_override)
      : {};

    const newFields = body.text_override as Record<string, unknown>;
    const merged = { ...oldOverride, ...newFields };

    // Remove null fields (used for reverting)
    for (const key of Object.keys(merged)) {
      if (merged[key] === null) delete merged[key];
    }

    // Record history for each changed field
    for (const [field, newVal] of Object.entries(newFields)) {
      const oldVal = oldOverride[field] ?? null;
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        insertDocketHistory(
          id,
          field,
          JSON.stringify(oldVal),
          JSON.stringify(newVal)
        );
      }
    }

    const overrideStr = Object.keys(merged).length > 0 ? JSON.stringify(merged) : null;
    updateDocketEntry(id, { text_override: overrideStr });
  }

  // Handle regular field updates
  const regularUpdates: Record<string, string | null | undefined> = {};
  if (body.status !== undefined) regularUpdates.status = body.status;
  if (body.notes !== undefined) regularUpdates.notes = body.notes;
  if (body.target_meeting_date !== undefined) regularUpdates.target_meeting_date = body.target_meeting_date;
  if (body.item_type !== undefined) regularUpdates.item_type = body.item_type;
  if (body.department !== undefined) regularUpdates.department = body.department;

  if (Object.keys(regularUpdates).length > 0) {
    updateDocketEntry(id, regularUpdates as Parameters<typeof updateDocketEntry>[1]);
  }

  // If a docket item was assigned to a meeting, check if minutes can be auto-generated
  if (body.target_meeting_date) {
    const meetings = getMeetingsByDate(body.target_meeting_date);
    for (const m of meetings) {
      maybeAutoGenerateMinutes(m.id);
    }

    // Auto-populate ordinance tracking when assigned to a meeting
    const freshEntry = getDocketEntry(id);
    if (freshEntry && (freshEntry.item_type === "ordinance_new" || freshEntry.item_type === "ordinance_amendment")) {
      const tracking = getOrdinanceTracking(id);
      const updates: Record<string, string | number | null> = {};
      const meetingDate = body.target_meeting_date;

      // Determine meeting type from the meetings table
      const workSession = meetings.find((m) => m.meeting_type === "work_session");
      const regular = meetings.find((m) => m.meeting_type === "regular");

      if (workSession) {
        // Work session = introduction / first reading
        if (!tracking?.introduction_date) {
          updates.introduction_date = meetingDate;
          updates.introduction_meeting = `Work Session ${new Date(meetingDate + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`;

          // Auto-suggest hearing date: next regular meeting ≥10 days after introduction
          if (!tracking?.hearing_date) {
            const nextRegular = getNextRegularMeetingAfter(meetingDate, 10);
            if (nextRegular) {
              updates.hearing_date = nextRegular.meeting_date;
            }
          }
        } else if (tracking?.introduction_date && tracking.introduction_date !== meetingDate) {
          // Ordinance being moved to a different work session — update introduction
          updates.introduction_date = meetingDate;
          updates.introduction_meeting = `Work Session ${new Date(meetingDate + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`;

          // Re-suggest hearing date based on new introduction date
          if (!tracking.adoption_date) {
            const nextRegular = getNextRegularMeetingAfter(meetingDate, 10);
            if (nextRegular) {
              updates.hearing_date = nextRegular.meeting_date;
            }
          }
        }
      } else if (regular) {
        if (tracking?.introduction_date && !tracking?.hearing_date) {
          // Already introduced — this regular meeting is the hearing/second reading
          updates.hearing_date = meetingDate;
        } else if (tracking?.introduction_date && tracking?.hearing_date && !tracking?.adoption_date) {
          // Already has a hearing date — moving to another regular meeting means adoption
          if (tracking.hearing_date !== meetingDate) {
            updates.adoption_date = meetingDate;
            // Auto-calculate effective date (20 days after adoption, unless emergency)
            if (!tracking.is_emergency) {
              const d = new Date(meetingDate + "T12:00:00");
              d.setDate(d.getDate() + 20);
              updates.effective_date = d.toISOString().split("T")[0];
            }
          }
        } else if (!tracking?.introduction_date) {
          // If no introduction yet, this regular meeting is introduction
          updates.introduction_date = meetingDate;
          updates.introduction_meeting = `Regular Meeting ${new Date(meetingDate + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}`;

          // Auto-suggest hearing date for next eligible regular meeting
          const nextRegular = getNextRegularMeetingAfter(meetingDate, 10);
          if (nextRegular) {
            updates.hearing_date = nextRegular.meeting_date;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        upsertOrdinanceTracking(id, updates);
      }
    }
  }

  const updated = getDocketEntry(id);
  return NextResponse.json(updated);
}
