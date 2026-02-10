import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ClassificationResult, DocketEntry, DocketStatus, Meeting, MeetingCycle, MeetingStatus } from "@/types";

const dbPath = process.env.DATABASE_PATH || "./data/docket.db";
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS docket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_id TEXT UNIQUE NOT NULL,
    email_from TEXT NOT NULL,
    email_subject TEXT NOT NULL,
    email_date TEXT NOT NULL,
    email_body_preview TEXT NOT NULL,
    relevant INTEGER NOT NULL DEFAULT 0,
    confidence TEXT,
    item_type TEXT,
    department TEXT,
    summary TEXT,
    extracted_fields TEXT NOT NULL DEFAULT '{}',
    completeness TEXT NOT NULL DEFAULT '{}',
    attachment_filenames TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'new',
    notes TEXT NOT NULL DEFAULT '',
    target_meeting_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS processed_emails (
    email_id TEXT PRIMARY KEY,
    processed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_docket_status ON docket(status);
  CREATE INDEX IF NOT EXISTS idx_docket_item_type ON docket(item_type);
  CREATE INDEX IF NOT EXISTS idx_docket_relevant ON docket(relevant);
  CREATE INDEX IF NOT EXISTS idx_docket_created_at ON docket(created_at);

  CREATE TABLE IF NOT EXISTS meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_type TEXT NOT NULL CHECK(meeting_type IN ('work_session', 'regular')),
    meeting_date TEXT NOT NULL,
    cycle_date TEXT NOT NULL,
    video_url TEXT,
    minutes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK(status IN ('upcoming', 'in_progress', 'completed')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_type_date ON meetings(meeting_type, meeting_date);
  CREATE INDEX IF NOT EXISTS idx_meetings_cycle ON meetings(cycle_date);
`);

// --- Config ---

export function getConfig(key: string): string | null {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setConfig(key: string, value: string): void {
  db.prepare(
    "INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(key, value);
}

// --- Processed emails ---

export function isEmailProcessed(emailId: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM processed_emails WHERE email_id = ?")
    .get(emailId);
  return !!row;
}

export function markEmailProcessed(emailId: string): void {
  db.prepare(
    "INSERT OR IGNORE INTO processed_emails (email_id) VALUES (?)"
  ).run(emailId);
}

// --- Docket entries ---

export function createDocketEntry(params: {
  emailId: string;
  emailFrom: string;
  emailSubject: string;
  emailDate: string;
  emailBodyPreview: string;
  classification: ClassificationResult;
  attachmentFilenames: string[];
}): number {
  const { classification } = params;
  const result = db
    .prepare(
      `INSERT INTO docket (
        email_id, email_from, email_subject, email_date, email_body_preview,
        relevant, confidence, item_type, department, summary,
        extracted_fields, completeness, attachment_filenames
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      params.emailId,
      params.emailFrom,
      params.emailSubject,
      params.emailDate,
      params.emailBodyPreview,
      classification.relevant ? 1 : 0,
      classification.confidence,
      classification.item_type,
      classification.department,
      classification.summary,
      JSON.stringify(classification.extracted_fields),
      JSON.stringify(classification.completeness),
      JSON.stringify(params.attachmentFilenames)
    );
  return result.lastInsertRowid as number;
}

export function getDocketEntries(filters?: {
  status?: DocketStatus;
  relevant?: boolean;
  itemType?: string;
  limit?: number;
  offset?: number;
}): { entries: DocketEntry[]; total: number } {
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (filters?.status) {
    conditions.push("status = ?");
    values.push(filters.status);
  }
  if (filters?.relevant !== undefined) {
    conditions.push("relevant = ?");
    values.push(filters.relevant ? 1 : 0);
  }
  if (filters?.itemType) {
    conditions.push("item_type = ?");
    values.push(filters.itemType);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM docket ${where}`)
    .get(...values) as { count: number };

  const entries = db
    .prepare(
      `SELECT * FROM docket ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
    .all(...values, limit, offset) as DocketEntry[];

  return { entries, total: total.count };
}

export function getDocketEntry(id: number): DocketEntry | null {
  const row = db.prepare("SELECT * FROM docket WHERE id = ?").get(id) as
    | DocketEntry
    | undefined;
  return row ?? null;
}

export function updateDocketEntry(
  id: number,
  updates: {
    status?: DocketStatus;
    notes?: string;
    target_meeting_date?: string | null;
    item_type?: string;
    department?: string;
  }
): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  if (updates.notes !== undefined) {
    sets.push("notes = ?");
    values.push(updates.notes);
  }
  if (updates.target_meeting_date !== undefined) {
    sets.push("target_meeting_date = ?");
    values.push(updates.target_meeting_date);
  }
  if (updates.item_type !== undefined) {
    sets.push("item_type = ?");
    values.push(updates.item_type);
  }
  if (updates.department !== undefined) {
    sets.push("department = ?");
    values.push(updates.department);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE docket SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
    id
  );
}

export function getDocketStats(): {
  total: number;
  new_count: number;
  reviewed: number;
  accepted: number;
  needs_info: number;
  by_type: { item_type: string; count: number }[];
  by_department: { department: string; count: number }[];
} {
  const total = db
    .prepare("SELECT COUNT(*) as count FROM docket WHERE relevant = 1")
    .get() as { count: number };

  const statusCounts = db
    .prepare(
      "SELECT status, COUNT(*) as count FROM docket WHERE relevant = 1 GROUP BY status"
    )
    .all() as { status: string; count: number }[];

  const statusMap: Record<string, number> = {};
  for (const row of statusCounts) {
    statusMap[row.status] = row.count;
  }

  const byType = db
    .prepare(
      "SELECT item_type, COUNT(*) as count FROM docket WHERE relevant = 1 AND item_type IS NOT NULL GROUP BY item_type ORDER BY count DESC"
    )
    .all() as { item_type: string; count: number }[];

  const byDepartment = db
    .prepare(
      "SELECT department, COUNT(*) as count FROM docket WHERE relevant = 1 AND department IS NOT NULL GROUP BY department ORDER BY count DESC"
    )
    .all() as { department: string; count: number }[];

  return {
    total: total.count,
    new_count: statusMap["new"] || 0,
    reviewed: statusMap["reviewed"] || 0,
    accepted: statusMap["accepted"] || 0,
    needs_info: statusMap["needs_info"] || 0,
    by_type: byType,
    by_department: byDepartment,
  };
}

// --- Meetings ---

const BIWEEKLY_ANCHOR = "2026-01-12"; // A known Monday in Edison's biweekly cycle

function getBiweeklyMondays(startDate: Date, endDate: Date): string[] {
  const anchor = new Date(getConfig("meeting_anchor_date") ?? BIWEEKLY_ANCHOR);
  anchor.setUTCHours(0, 0, 0, 0);

  const mondays: string[] = [];
  // Find the first biweekly Monday on or before startDate
  const diffMs = startDate.getTime() - anchor.getTime();
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  const biweeklyPeriods = Math.floor(diffWeeks / 2);
  const firstMonday = new Date(anchor.getTime() + biweeklyPeriods * 2 * 7 * 24 * 60 * 60 * 1000);

  const cursor = new Date(firstMonday);
  while (cursor <= endDate) {
    if (cursor >= startDate) {
      mondays.push(cursor.toISOString().split("T")[0]);
    }
    cursor.setDate(cursor.getDate() + 14);
  }
  return mondays;
}

export function ensureMeetingsGenerated(): void {
  const now = new Date();
  // 1 month back, 3 months forward
  const start = new Date(now);
  start.setMonth(start.getMonth() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setMonth(end.getMonth() + 3);
  end.setUTCHours(0, 0, 0, 0);

  const mondays = getBiweeklyMondays(start, end);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO meetings (meeting_type, meeting_date, cycle_date) VALUES (?, ?, ?)`
  );

  const txn = db.transaction(() => {
    for (const monday of mondays) {
      // Work Session = Monday
      insert.run("work_session", monday, monday);
      // Regular Meeting = Wednesday (Monday + 2 days)
      const wed = new Date(monday);
      wed.setDate(wed.getDate() + 2);
      const wedStr = wed.toISOString().split("T")[0];
      insert.run("regular", wedStr, monday);
    }
  });
  txn();
}

export function getMeetingCycles(filters?: {
  filter?: "upcoming" | "past" | "all";
  limit?: number;
  offset?: number;
}): { cycles: MeetingCycle[]; total: number } {
  const now = new Date().toISOString().split("T")[0];
  let condition = "";
  const values: string[] = [];

  if (filters?.filter === "upcoming") {
    condition = "WHERE m.cycle_date >= ?";
    values.push(now);
  } else if (filters?.filter === "past") {
    condition = "WHERE m.cycle_date < ?";
    values.push(now);
  }

  const limit = filters?.limit ?? 20;
  const offset = filters?.offset ?? 0;

  const totalRow = db.prepare(
    `SELECT COUNT(DISTINCT cycle_date) as count FROM meetings m ${condition}`
  ).get(...values) as { count: number };

  const orderDir = filters?.filter === "past" ? "DESC" : "ASC";
  const rows = db.prepare(
    `SELECT * FROM meetings m ${condition} ORDER BY m.cycle_date ${orderDir}, m.meeting_type ASC`
  ).all(...values) as Meeting[];

  // Group by cycle_date
  const cycleMap = new Map<string, MeetingCycle>();
  for (const row of rows) {
    if (!cycleMap.has(row.cycle_date)) {
      cycleMap.set(row.cycle_date, { cycle_date: row.cycle_date, work_session: null, regular_meeting: null });
    }
    const cycle = cycleMap.get(row.cycle_date)!;
    if (row.meeting_type === "work_session") {
      cycle.work_session = row;
    } else {
      cycle.regular_meeting = row;
    }
  }

  const allCycles = Array.from(cycleMap.values());
  const paged = allCycles.slice(offset, offset + limit);

  return { cycles: paged, total: totalRow.count };
}

export function getMeeting(id: number): Meeting | null {
  const row = db.prepare("SELECT * FROM meetings WHERE id = ?").get(id) as Meeting | undefined;
  return row ?? null;
}

export function getMeetingByTypeAndDate(meetingType: string, meetingDate: string): Meeting | null {
  const row = db.prepare(
    "SELECT * FROM meetings WHERE meeting_type = ? AND meeting_date = ?"
  ).get(meetingType, meetingDate) as Meeting | undefined;
  return row ?? null;
}

export function getMeetingsByDate(meetingDate: string): Meeting[] {
  return db.prepare(
    "SELECT * FROM meetings WHERE meeting_date = ?"
  ).all(meetingDate) as Meeting[];
}

export function updateMeeting(
  id: number,
  updates: { video_url?: string | null; minutes?: string; status?: MeetingStatus }
): void {
  const sets: string[] = [];
  const values: (string | null)[] = [];

  if (updates.video_url !== undefined) {
    sets.push("video_url = ?");
    values.push(updates.video_url);
  }
  if (updates.minutes !== undefined) {
    sets.push("minutes = ?");
    values.push(updates.minutes);
  }
  if (updates.status !== undefined) {
    sets.push("status = ?");
    values.push(updates.status);
  }

  if (sets.length === 0) return;
  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE meetings SET ${sets.join(", ")} WHERE id = ?`).run(...values, id);
}

export function getAgendaItemsForMeeting(meetingDate: string): DocketEntry[] {
  return db.prepare(
    `SELECT * FROM docket WHERE target_meeting_date = ? AND status IN ('accepted', 'on_agenda') ORDER BY item_type, id`
  ).all(meetingDate) as DocketEntry[];
}
