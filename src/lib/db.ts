import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { ClassificationResult, DocketEntry, DocketStatus, Meeting, MeetingCycle, MeetingStatus, OrdinanceTracking } from "@/types";

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

  CREATE TABLE IF NOT EXISTS docket_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docket_id INTEGER NOT NULL REFERENCES docket(id),
    field_name TEXT NOT NULL,
    old_value TEXT NOT NULL,
    new_value TEXT NOT NULL,
    changed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_docket_history_docket ON docket_history(docket_id);

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

  CREATE TABLE IF NOT EXISTS ordinance_tracking (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    docket_id INTEGER NOT NULL UNIQUE REFERENCES docket(id) ON DELETE CASCADE,
    ordinance_number TEXT,
    introduction_date TEXT,
    introduction_meeting TEXT,
    pub_intro_date TEXT,
    pub_intro_newspaper TEXT,
    bulletin_posted_date TEXT,
    hearing_date TEXT,
    hearing_amended INTEGER DEFAULT 0,
    hearing_notes TEXT DEFAULT '',
    adoption_date TEXT,
    adoption_vote TEXT,
    adoption_failed INTEGER DEFAULT 0,
    pub_final_date TEXT,
    pub_final_newspaper TEXT,
    effective_date TEXT,
    is_emergency INTEGER DEFAULT 0,
    website_posted_date TEXT,
    website_url TEXT,
    clerk_notes TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_ord_tracking_docket ON ordinance_tracking(docket_id);
`);

// --- Migrations ---
try { db.prepare("SELECT text_override FROM docket LIMIT 0").get(); }
catch { db.exec("ALTER TABLE docket ADD COLUMN text_override TEXT"); }

// --- Seed demo data on first run ---
seedDemoData();

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
  const docketId = result.lastInsertRowid as number;

  // Auto-create ordinance tracking for ordinance items
  if (classification.item_type === "ordinance_new" || classification.item_type === "ordinance_amendment") {
    const ef = classification.extracted_fields;
    const tracking: Record<string, string | number | null> = {};

    // Extract ordinance number: from classifier, or parse from attachment filename (e.g. "O.2271-2026_Adopt_Area.pdf")
    const ordNum = ef.ordinance_number ?? null;
    if (ordNum) {
      tracking.ordinance_number = ordNum;
    } else {
      const match = params.attachmentFilenames
        .map((f) => f.match(/^(O\.\d+-\d{4})/i))
        .find((m) => m);
      if (match) tracking.ordinance_number = match[1];
    }

    // Determine reading stage and populate dates
    const stage = ef.reading_stage ?? null;
    if (stage === "first") {
      // First reading — email date is roughly the introduction date
      tracking.introduction_date = params.emailDate;
    } else if (stage === "second") {
      // Second reading — the hearing is happening at the target meeting
      tracking.introduction_date = params.emailDate; // Approximate — clerk can refine
    }

    if (Object.keys(tracking).length > 0) {
      upsertOrdinanceTracking(docketId, tracking);
    } else {
      // Create empty tracking record so it shows up in the ordinances view
      upsertOrdinanceTracking(docketId, {});
    }
  }

  return docketId;
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

export function getDocketEntryByEmailId(emailId: string): DocketEntry | null {
  const row = db.prepare("SELECT * FROM docket WHERE email_id = ?").get(emailId) as
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
    text_override?: string | null;
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
  if (updates.text_override !== undefined) {
    sets.push("text_override = ?");
    values.push(updates.text_override);
  }

  if (sets.length === 0) return;

  sets.push("updated_at = datetime('now')");

  db.prepare(`UPDATE docket SET ${sets.join(", ")} WHERE id = ?`).run(
    ...values,
    id
  );
}

export function insertDocketHistory(
  docketId: number,
  fieldName: string,
  oldValue: string,
  newValue: string
): void {
  db.prepare(
    "INSERT INTO docket_history (docket_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?)"
  ).run(docketId, fieldName, oldValue, newValue);
}

export function getDocketHistory(docketId: number): {
  id: number;
  docket_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_at: string;
}[] {
  return db
    .prepare("SELECT * FROM docket_history WHERE docket_id = ? ORDER BY changed_at DESC")
    .all(docketId) as {
    id: number;
    docket_id: number;
    field_name: string;
    old_value: string;
    new_value: string;
    changed_at: string;
  }[];
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
  // 1 month back, 3 months forward — older meetings are only kept if they have data
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

/** Find past meetings that have video_url but no minutes and have agenda items assigned */
export function getMeetingsNeedingMinutes(): Meeting[] {
  const today = new Date().toISOString().split("T")[0];
  return db.prepare(`
    SELECT m.* FROM meetings m
    WHERE m.video_url IS NOT NULL
      AND (m.minutes IS NULL OR m.minutes = '')
      AND m.meeting_date <= ?
      AND EXISTS (
        SELECT 1 FROM docket d
        WHERE d.target_meeting_date = m.meeting_date
          AND d.status IN ('accepted', 'on_agenda')
      )
  `).all(today) as Meeting[];
}

/** Find all past meetings with video URLs that have no minutes yet (no agenda item requirement) */
export function getPastMeetingsWithoutMinutes(): Meeting[] {
  const today = new Date().toISOString().split("T")[0];
  return db.prepare(`
    SELECT * FROM meetings
    WHERE video_url IS NOT NULL
      AND (minutes IS NULL OR minutes = '')
      AND meeting_date <= ?
    ORDER BY meeting_date ASC
  `).all(today) as Meeting[];
}

/** Find all past meetings that have no video URL yet */
export function getPastMeetingsWithoutVideo(): Meeting[] {
  const today = new Date().toISOString().split("T")[0];
  return db.prepare(`
    SELECT * FROM meetings
    WHERE (video_url IS NULL OR video_url = '')
      AND meeting_date <= ?
    ORDER BY meeting_date ASC
  `).all(today) as Meeting[];
}

// --- Ordinance Lifecycle Helpers ---

/** Find the next regular meeting that is at least `minDaysAfter` days after `afterDate`. */
export function getNextRegularMeetingAfter(afterDate: string, minDaysAfter = 10): Meeting | null {
  const earliest = new Date(afterDate + "T12:00:00");
  earliest.setDate(earliest.getDate() + minDaysAfter);
  const earliestStr = earliest.toISOString().split("T")[0];

  // Ensure meetings are generated far enough ahead
  ensureMeetingsGenerated();

  const row = db.prepare(
    `SELECT * FROM meetings WHERE meeting_type = 'regular' AND meeting_date >= ? ORDER BY meeting_date ASC LIMIT 1`
  ).get(earliestStr) as Meeting | undefined;
  return row ?? null;
}

// --- Ordinance Tracking ---

export function getOrdinanceTracking(docketId: number): OrdinanceTracking | null {
  const row = db.prepare("SELECT * FROM ordinance_tracking WHERE docket_id = ?").get(docketId) as OrdinanceTracking | undefined;
  return row ?? null;
}

export function upsertOrdinanceTracking(
  docketId: number,
  updates: Partial<Omit<OrdinanceTracking, "id" | "docket_id" | "created_at" | "updated_at">>
): void {
  const existing = getOrdinanceTracking(docketId);
  if (!existing) {
    // Insert with provided fields
    const cols = ["docket_id"];
    const placeholders = ["?"];
    const vals: (string | number | null)[] = [docketId];
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        cols.push(k);
        placeholders.push("?");
        vals.push(v as string | number | null);
      }
    }
    db.prepare(`INSERT INTO ordinance_tracking (${cols.join(", ")}) VALUES (${placeholders.join(", ")})`).run(...vals);
  } else {
    // Update existing
    const sets: string[] = [];
    const vals: (string | number | null)[] = [];
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(v as string | number | null);
      }
    }
    if (sets.length === 0) return;
    sets.push("updated_at = datetime('now')");
    db.prepare(`UPDATE ordinance_tracking SET ${sets.join(", ")} WHERE docket_id = ?`).run(...vals, docketId);
  }
}

export function getAllOrdinancesWithTracking(): (DocketEntry & { tracking: OrdinanceTracking | null })[] {
  const ordinances = db.prepare(`
    SELECT * FROM docket
    WHERE item_type IN ('ordinance_new', 'ordinance_amendment')
    ORDER BY created_at DESC
  `).all() as DocketEntry[];

  return ordinances.map((ord) => {
    let tracking = getOrdinanceTracking(ord.id);

    // Lazy-create tracking for existing ordinances that don't have it yet
    if (!tracking) {
      const autoFields: Record<string, string | number | null> = {};

      // Try to parse ordinance number from attachment filenames
      try {
        const files = JSON.parse(ord.attachment_filenames) as string[];
        const match = files.map((f) => f.match(/^(O\.\d+-\d{4})/i)).find((m) => m);
        if (match) autoFields.ordinance_number = match[1];
      } catch { /* ignore */ }

      // Try to get ordinance number from extracted_fields
      try {
        const ef = JSON.parse(ord.extracted_fields);
        if (ef.ordinance_number) autoFields.ordinance_number = ef.ordinance_number;
      } catch { /* ignore */ }

      // Use target_meeting_date as introduction date if available
      if (ord.target_meeting_date) {
        autoFields.introduction_date = ord.target_meeting_date;
      }

      upsertOrdinanceTracking(ord.id, autoFields);
      tracking = getOrdinanceTracking(ord.id);
    }

    return { ...ord, tracking };
  });
}

// --- Seed demo data ---

function seedDemoData() {
  // Only run once — check config flag
  const seeded = db.prepare("SELECT value FROM config WHERE key = 'seed_v1'").get() as { value: string } | undefined;
  if (seeded) return;

  // Compact seed format: [email_from, email_subject, email_date, body_preview, relevant, item_type, department, summary, extracted_fields, attachments, status, target_meeting_date]
  type SeedRow = [string, string, string, string, number, string, string, string, Record<string, unknown>, string[], string, string | null];

  const rows: SeedRow[] = [
    // === FEB 9, 2026 WORK SESSION ===
    ["Marchetti, Frank <marchetti@edisonnj.org>", "Report of Disbursements through February 4, 2026", "2026-02-04",
      "Report of Disbursements for the period ending February 4, 2026. Total disbursements: $4,287,341.16.", 1,
      "resolution_disbursement", "Finance/CFO", "Report of disbursements through February 4, 2026 totaling $4,287,341.16",
      { dollar_amounts: ["$4,287,341.16"] }, ["Disbursement_Report_020426.pdf"], "on_agenda", "2026-02-09"],

    ["Tax Collection <taxcollector@edisonnj.org>", "Tax Refund Authorization - Multiple Properties February 2026", "2026-02-03",
      "List of tax overpayments requiring council authorization for refund. Total refunds: $18,710.60 across 12 properties.", 1,
      "resolution_tax_refund", "Tax Collection", "Authorization of tax refund overpayments totaling $18,710.60 for 12 properties",
      { contract_amount: "$18,710.60" }, ["Tax_Refund_List_Feb2026.pdf"], "on_agenda", "2026-02-09"],

    ["Santos-Rivera, Elena <santos-rivera@edisonnj.org>", "Resolution - Rio Supply Inc. Neptune Water Equipment and Spare Parts", "2026-02-03",
      "Contract with Rio Supply Inc. for Neptune Technology water equipment and spare parts. Not to exceed $135,000.00.", 1,
      "resolution_bid_award", "Water/Sewer Utility", "Contract award to Rio Supply Inc. for Neptune Technology water equipment, NTE $135,000",
      { vendor_name: "Rio Supply Inc.", contract_amount: "$135,000.00" }, ["Rio_Supply_Quote_2026.pdf"], "on_agenda", "2026-02-09"],

    ["Engineering Dept <engineering@edisonnj.org>", "LiRo Engineers - Phase 2 Gravity Sewer Main Inspection & Assessment", "2026-02-02",
      "Proposal from LiRo Engineers for Phase 2 Inspection of Gravity Sewer Main. CCTV inspection of 45,000 LF. NTE $317,190.00.", 1,
      "resolution_professional_services", "Engineering", "Professional services with LiRo Engineers for sewer main inspection, NTE $317,190",
      { vendor_name: "LiRo Engineers, Inc.", vendor_address: "333 Thornall Street, Edison, NJ 08837", contract_amount: "$317,190.00", statutory_citation: "N.J.S.A. 40A:11-5(1)(a)(i)" },
      ["LiRo_Proposal_Sewer_Ph2.pdf"], "on_agenda", "2026-02-09"],

    ["Fischer, James <fischer@edisonnj.org>", "Garden State Fireworks - Lunar New Year Celebration Feb 21, 2026", "2026-02-01",
      "Application from Garden State Fireworks for Lunar New Year celebration. Non-aerial fireworks and drone show at 450 Division Street.", 1,
      "other", "Administration", "Authorization for Garden State Fireworks for Lunar New Year celebration on Feb 21 at 450 Division St",
      { vendor_name: "Garden State Fireworks, Inc.", block_lot: "Block 82.14, Lot 3.22" },
      ["GardenState_Fireworks_Application.pdf"], "on_agenda", "2026-02-09"],

    ["Engineering Dept <engineering@edisonnj.org>", "Tree Maintenance Bond Refund - 82 Vineyard Road", "2026-02-02",
      "Release of tree maintenance bond $225.00 for 82 Vineyard Road, Block 1111, Lot 46.03. Trees survived 2-year maintenance period.", 1,
      "resolution_bond_release", "Engineering", "Tree maintenance bond refund of $225 for 82 Vineyard Rd",
      { bond_amount: "$225.00", block_lot: "Block 1111, Lot 46.03" },
      ["Tree_Inspection_Report.pdf"], "on_agenda", "2026-02-09"],

    ["Public Works <dpw@edisonnj.org>", "Cranbury Custom Lettering - Vehicle & Building Lettering Contract Renewal", "2026-02-03",
      "Contract renewal with Cranbury Custom Lettering Inc. for township vehicle and building lettering. NTE $56,000.00.", 1,
      "resolution_bid_award", "Public Works", "Contract renewal with Cranbury Custom Lettering for vehicle/building lettering, NTE $56,000",
      { vendor_name: "Cranbury Custom Lettering Inc.", contract_amount: "$56,000.00" },
      ["Cranbury_Lettering_Renewal.pdf"], "on_agenda", "2026-02-09"],

    ["IT Department <it@edisonnj.org>", "SHI International - SDL System Hosting and Licensing Renewal", "2026-02-04",
      "Annual renewal of SDL system hosting and licensing through SHI International Corporation. Amount: $123,900.00.", 1,
      "resolution_state_contract", "Administration", "Annual renewal of SDL system hosting/licensing through SHI International, $123,900",
      { vendor_name: "SHI International Corporation", vendor_address: "290 Davidson Avenue, Somerset, NJ 08873", contract_amount: "$123,900.00" },
      ["SHI_Quote_SDL_2026.pdf"], "on_agenda", "2026-02-09"],

    ["Police Department <police@edisonnj.org>", "Purchase of 2026 Ford Police Interceptor Utility Vehicles", "2026-02-04",
      "Purchase of five 2026 Ford Police Interceptor Utility Vehicles via ESCNJ cooperative pricing. Total: $241,719.85.", 1,
      "resolution_bid_award", "Police", "Purchase of five 2026 Ford Police Interceptor vehicles via ESCNJ cooperative, $241,719.85",
      { vendor_name: "Nielsen Ford of Morristown", contract_amount: "$241,719.85", state_contract_number: "ESCNJ Co-op #65MCESCCPS" },
      ["Ford_Interceptor_Quote.pdf", "ESCNJ_Authorization.pdf"], "on_agenda", "2026-02-09"],

    // === FEB 11, 2026 REGULAR MEETING ===
    ["Caruso, Thomas <caruso@edisonnj.org>", "Ordinance - Chapter 7 Traffic - Electric Scooter Regulations", "2026-01-28",
      "Proposed ordinance creating Subchapter 7-44 Electric Scooter Regulations. Helmet requirements, lighting, penalties.", 1,
      "ordinance_new", "Law", "New ordinance creating Subchapter 7-44 regulating electric scooter operation",
      { statutory_citation: "N.J.S.A. 39:4-14.16 et seq." },
      ["O.2270-2026_Electric_Scooter.pdf"], "on_agenda", "2026-02-11"],

    ["Caruso, Thomas <caruso@edisonnj.org>", "Ordinance Amending Chapter 23 - Adopt an Area Program Guidelines", "2026-01-29",
      "Proposed ordinance amending Chapter 23 Adopt an Area Program to update guidelines and expand eligibility.", 1,
      "ordinance_amendment", "Law", "Amendment to Chapter 23 Adopt an Area Program — updated guidelines, expanded eligibility",
      {}, ["O.2271-2026_Adopt_Area.pdf"], "on_agenda", "2026-02-11"],

    ["Engineering Dept <engineering@edisonnj.org>", "J. Fletcher Creamer & Son - Smart Hydrant Leak Detection Installation", "2026-02-03",
      "Contract to J. Fletcher Creamer & Son for Smart Hydrant Leak Detection on 350 hydrants. Bid #25-10-22. $2,311,200.00.", 1,
      "resolution_bid_award", "Engineering", "Smart hydrant leak detection installation on 350 hydrants, $2,311,200",
      { vendor_name: "J. Fletcher Creamer & Son, Inc.", contract_amount: "$2,311,200.00", bid_number: "Public Bid #25-10-22" },
      ["Creamer_Bid_Response.pdf", "Bid_Tabulation_25-10-22.pdf"], "on_agenda", "2026-02-11"],

    ["Engineering Dept <engineering@edisonnj.org>", "Plainfield Avenue Water Main Replacement Project", "2026-02-03",
      "Plainfield Avenue Water Main Replacement — 2,400 LF of 8-inch ductile iron pipe. Amount: $474,850.00.", 1,
      "resolution_bid_award", "Engineering", "Plainfield Avenue water main replacement — 2,400 LF, $474,850",
      { contract_amount: "$474,850.00" },
      ["Plainfield_WaterMain_BidTab.pdf"], "on_agenda", "2026-02-11"],

    ["Santos-Rivera, Elena <santos-rivera@edisonnj.org>", "Emergency Water Main Repair Services - B&W Construction Co.", "2026-02-03",
      "Emergency water main repair services. Bid No. 25-10-23. B&W Construction secondary vendor. NTE $2,000,000/year.", 1,
      "resolution_bid_award", "Water/Sewer Utility", "Emergency water main repair services with B&W Construction, NTE $2M/year",
      { vendor_name: "B&W Construction Co. of NJ, Inc.", contract_amount: "$2,000,000.00/year", bid_number: "Public Bid No. 25-10-23" },
      ["Bid_25-10-23_Tabulation.pdf"], "on_agenda", "2026-02-11"],

    ["Human Resources <hr@edisonnj.org>", "MOA - United Steel Workers Local 1426 Contract Agreement", "2026-02-04",
      "Memorandum of Agreement with USW Local 1426 for 2025-2028 term. Requires council ratification.", 1,
      "resolution_personnel", "Human Resources", "Memorandum of Agreement with USW Local 1426 for 2025-2028 contract term",
      { vendor_name: "United Steel Workers International Union, AFL-CIO, Local 1426" },
      ["MOA_USW_Local1426_2025-2028.pdf", "Fiscal_Impact_Statement.pdf"], "on_agenda", "2026-02-11"],

    ["Recreation Dept <recreation@edisonnj.org>", "Penn Jersey Paper Co - Kitchen Equipment Purchase and Installation", "2026-02-04",
      "Kitchen equipment purchase at Minnie B. Veal Community Center from Penn Jersey Paper Co LLC.", 1,
      "resolution_bid_award", "Recreation", "Kitchen equipment at Minnie B. Veal Community Center from Penn Jersey Paper Co",
      { vendor_name: "Penn Jersey Paper Co LLC" },
      ["PennJersey_Quote.pdf"], "on_agenda", "2026-02-11"],

    ["Tax Collection <taxcollector@edisonnj.org>", "Sewer Overpayment Refunds - February 2026", "2026-02-04",
      "Sewer overpayments requiring refund authorization. Total: $9,385.93 across 8 accounts.", 1,
      "resolution_tax_refund", "Tax Collection", "Authorization of sewer overpayment refunds totaling $9,385.93",
      { contract_amount: "$9,385.93" },
      ["Sewer_Refund_List_Feb2026.pdf"], "on_agenda", "2026-02-11"],

    // === JAN 12, 2026 WORK SESSION ===
    ["Fischer, James <fischer@edisonnj.org>", "Administrative Agenda - Mayor Kumar Appointments January 2026", "2026-01-08",
      "Mayor's appointments and administrative items a. through m. for the January 12 worksession.", 1,
      "other", "Administration", "Mayor Kumar administrative agenda items a. through m. — board and commission appointments",
      {}, ["Admin_Agenda_011226.pdf"], "on_agenda", "2026-01-12"],

    ["Caruso, Thomas <caruso@edisonnj.org>", "Ordinance Amending §39-12.15 Technical Review Committee", "2026-01-07",
      "Amendment to Chapter 39 Land Use, §39-12.15 Technical Review Committee to streamline application review.", 1,
      "ordinance_amendment", "Law", "Amendment to Land Use code §39-12.15 redesigning Technical Review Committee",
      { statutory_citation: "N.J.S.A. 40:55D-1 et seq." },
      ["Ordinance_TechReview.pdf"], "on_agenda", "2026-01-12"],

    ["Caruso, Thomas <caruso@edisonnj.org>", "Ordinance Amending Article V - Boards, Commissions, Committees", "2026-01-07",
      "Amendment to Article V of Chapter 2 Administration updating boards, commissions, committees structure.", 1,
      "ordinance_amendment", "Law", "Amendment to Chapter 2 Administration — boards, commissions organizational structure",
      {}, ["Ordinance_BoardsCommissions.pdf"], "on_agenda", "2026-01-12"],

    ["Santos-Rivera, Elena <santos-rivera@edisonnj.org>", "Business Administrator Items a. through u. - January 12", "2026-01-08",
      "Business Administrator's items a. through u. including contracts, change orders, and authorizations.", 1,
      "other", "Administration", "Business Administrator agenda items a. through u. — contracts and authorizations",
      {}, ["BA_Items_011226.pdf"], "on_agenda", "2026-01-12"],

    ["Council President <burke@edisonnj.org>", "Presentation - 250th Anniversary of Our Country", "2026-01-06",
      "America 250th Anniversary presentation. Council President Burke will read statement re: Edison's Revolutionary War heritage.", 1,
      "discussion_item", "Administration", "Council President Burke presentation on America 250th Anniversary",
      {}, ["America250_Statement.pdf"], "on_agenda", "2026-01-12"],

    // === JAN 14, 2026 REGULAR MEETING ===
    ["Marchetti, Frank <marchetti@edisonnj.org>", "Report of Disbursements through January 8, 2026", "2026-01-09",
      "Report of Disbursements for the period ending January 8, 2026.", 1,
      "resolution_disbursement", "Finance/CFO", "Report of disbursements through January 8, 2026",
      {}, ["Disbursement_Report_010826.pdf"], "on_agenda", "2026-01-14"],

    ["Tax Collection <taxcollector@edisonnj.org>", "Tax Refund Authorization - January 2026", "2026-01-09",
      "Tax overpayments requiring refund. Total: $12,447.30 across 9 properties.", 1,
      "resolution_tax_refund", "Tax Collection", "Authorization of tax refund overpayments totaling $12,447.30",
      { contract_amount: "$12,447.30" },
      ["Tax_Refund_List_Jan2026.pdf"], "on_agenda", "2026-01-14"],

    ["IT Department <it@edisonnj.org>", "Edmunds & Associates - Software Maintenance and Hosting Renewal", "2026-01-09",
      "Annual renewal of Edmunds GovTech financial management system for Finance, Tax, and Utility Billing.", 1,
      "resolution_state_contract", "Finance/CFO", "Annual renewal of Edmunds GovTech financial management system",
      { vendor_name: "Edmunds & Associates, Inc." },
      ["Edmunds_Renewal_Quote_2026.pdf"], "on_agenda", "2026-01-14"],

    ["IT Department <it@edisonnj.org>", "Johnston Communications - IT Infrastructure and Fiber Optic Network", "2026-01-08",
      "Contract with Johnston Communications for IT infrastructure, fiber optic network, and Avaya phone support.", 1,
      "resolution_professional_services", "Administration", "IT infrastructure contract with Johnston Communications for fiber optic and network services",
      { vendor_name: "Johnston GP, Inc. d/b/a Johnston Communications", vendor_address: "36 Commerce Street, Springfield, NJ 07081" },
      ["Johnston_Proposal_2026.pdf"], "on_agenda", "2026-01-14"],

    ["Recreation Dept <recreation@edisonnj.org>", "AD Cafe - Promotional Items, Trophies and Awards Contract", "2026-01-09",
      "Public Bid #25-01-18 for promotional items, trophies and awards. NTE $32,000.00.", 1,
      "resolution_bid_award", "Recreation", "Bid award to AD Cafe for promotional items, trophies and awards, NTE $32,000",
      { vendor_name: "AD Cafe", contract_amount: "$32,000.00", bid_number: "Public Bid #25-01-18" },
      ["Bid_25-01-18_Tabulation.pdf"], "on_agenda", "2026-01-14"],

    ["Clerk's Office <clerk@edisonnj.org>", "GMA Marketing / Minuteman Press - Printing Services Contract", "2026-01-08",
      "Contract with Minuteman Press for printing — agenda packets, public hearing notices, municipal forms. NTE $10,000.", 1,
      "resolution_bid_award", "Administration", "Printing services contract with Minuteman Press, NTE $10,000",
      { vendor_name: "GMA Marketing Inc. d/b/a Minuteman Press", contract_amount: "$10,000.00" },
      ["Minuteman_Press_Quote.pdf"], "on_agenda", "2026-01-14"],

    // === JAN 28, 2026 COMBINED MEETING ===
    ["Santos-Rivera, Elena <santos-rivera@edisonnj.org>", "Office Basics Inc. - Ink, Toner, and Office Printing Supplies", "2026-01-22",
      "2-year contract with Office Basics Inc. for office printing supplies. Annual: $7,524.48 ($15,048.96 total).", 1,
      "resolution_bid_award", "Administration", "2-year contract with Office Basics for ink/toner/supplies, NTE $15,048.96",
      { vendor_name: "Office Basics Inc.", contract_amount: "$15,048.96" },
      ["OfficeBasics_Bid.pdf"], "on_agenda", "2026-01-28"],

    ["Public Works <dpw@edisonnj.org>", "Emergency Rock Salt Purchase - Middlesex County Co-op", "2026-01-21",
      "Emergency rock salt purchase through Middlesex County Co-op. Atlantic Salt at $79.00/ton.", 1,
      "resolution_bid_award", "Public Works", "Emergency rock salt purchase — Atlantic Salt at $79/ton via county co-op",
      { vendor_name: "Atlantic Salt Inc.", contract_amount: "$79.00/ton", state_contract_number: "Middlesex County Co-op" },
      ["AtlanticSalt_Quote.pdf"], "on_agenda", "2026-01-28"],

    ["Benedetto, Patricia <clerk@edisonnj.org>", "Approval of 2026 Council Meeting Schedule", "2026-01-21",
      "Proposed 2026 Municipal Council meeting schedule for approval. Biweekly worksessions and regular meetings.", 1,
      "other", "Administration", "Approval of 2026 Municipal Council meeting schedule",
      {}, ["2026_Meeting_Schedule.pdf"], "on_agenda", "2026-01-28"],

    ["Morales, Rafael <morales@edisonnj.org>", "Debt Service Appropriations for 2026", "2026-01-22",
      "Authorization of debt service appropriations for 2026 per N.J.S.A. 40A:4-53.", 1,
      "other", "Finance/CFO", "Authorization of 2026 debt service appropriations for municipal bonds",
      { statutory_citation: "N.J.S.A. 40A:4-53" },
      ["Debt_Service_2026.pdf"], "on_agenda", "2026-01-28"],

    ["Engineering Dept <engineering@edisonnj.org>", "Wawa at 1095 US Route 1 - Maintenance Surety Bond Release", "2026-01-23",
      "Release of maintenance surety bond for Wawa at 1095 US Route 1. Capitol Indemnity Company. Improvements satisfactory.", 1,
      "resolution_bond_release", "Engineering", "Maintenance surety bond release for Wawa at 1095 US Rt 1",
      { vendor_name: "Capitol Indemnity Company", block_lot: "1095 US Route 1" },
      ["Capitol_Indemnity_Bond.pdf", "Site_Inspection_Report.pdf"], "on_agenda", "2026-01-28"],

    // === UNASSIGNED (in queue) ===
    ["Caruso, Thomas <caruso@edisonnj.org>", "Ordinance Amending Chapter 25 Trees - Running Bamboo Prohibition", "2026-02-05",
      "Proposed ordinance to prohibit planting and spread of running bamboo in the Township.", 1,
      "ordinance_amendment", "Law", "Amendment to Chapter 25 Trees — prohibiting running bamboo",
      {}, ["Ordinance_Bamboo.pdf"], "reviewed", null],

    ["Morales, Rafael <morales@edisonnj.org>", "Ordinance to Exceed Municipal Budget Appropriation Limits - Cap Bank", "2026-02-06",
      "Annual ordinance to exceed budget appropriation limits and establish cap bank per N.J.S.A. 40A:4-45.14.", 1,
      "ordinance_new", "Finance/CFO", "Annual cap bank ordinance — must be adopted before 2026 budget introduction",
      { statutory_citation: "N.J.S.A. 40A:4-45.14" },
      ["Ordinance_CapBank_2026.pdf"], "reviewed", null],

    ["Public Works <dpw@edisonnj.org>", "Plumbing Services Contract - Various Vendors", "2026-02-06",
      "Plumbing services contracts for township building maintenance. Multiple vendors. NTE $75,000.", 1,
      "resolution_bid_award", "Public Works", "Plumbing services contracts for township buildings, NTE $75,000",
      { contract_amount: "$75,000.00" },
      ["Plumbing_Services_Vendors.pdf"], "new", null],

    ["Engineering Dept <engineering@edisonnj.org>", "Street Opening Escrow - 111 Livingston Avenue", "2026-02-07",
      "Street opening escrow $4,800 for utility work at 111 Livingston Ave. PSE&G gas main connection.", 1,
      "resolution_escrow_release", "Engineering", "Street opening escrow of $4,800 for utility work at 111 Livingston Ave",
      { escrow_amount: "$4,800.00", block_lot: "111 Livingston Avenue" },
      ["Street_Opening_Application.pdf"], "new", null],

    ["Fischer, James <fischer@edisonnj.org>", "Blue SAGE Grant Transfer - Edison Memorial Tower Corporation", "2026-02-05",
      "Transfer of 2023 Blue SAGE Grant from NJ Historical Commission. NTE $250,000 for Thomas Edison Center at Menlo Park.", 1,
      "resolution_grant", "Administration", "Transfer of $250,000 Blue SAGE Grant for Thomas Edison Center at Menlo Park",
      { contract_amount: "$250,000.00", vendor_name: "Edison Memorial Tower Corporation" },
      ["SAGE_Grant_Agreement.pdf"], "accepted", null],

    ["Engineering Dept <engineering@edisonnj.org>", "LiRo Engineers - DPW Garage Design and Construction Documents", "2026-02-06",
      "Professional services for DPW Garage design, engineering, and construction document preparation.", 1,
      "resolution_professional_services", "Engineering", "LiRo Engineers for DPW Garage design and construction documents",
      { vendor_name: "LiRo Engineers, Inc.", statutory_citation: "N.J.S.A. 40A:11-5(1)(a)(i)" },
      ["LiRo_DPW_Garage_Proposal.pdf"], "new", null],

    ["Tax Collection <taxcollector@edisonnj.org>", "Tax Sale Certificate Redemption Report - January 2026", "2026-02-02",
      "Monthly report of tax sale certificates redeemed in January 2026.", 1,
      "resolution_tax_sale_redemption", "Tax Collection", "Monthly report of tax sale certificates redeemed in January 2026",
      {}, ["TaxSale_Redemption_Jan2026.pdf"], "accepted", null],

    // Non-relevant
    ["Edison Chamber of Commerce <info@edisonchamber.com>", "2026 Edison Chamber Annual Gala - Sponsorship Opportunities", "2026-02-03",
      "2026 Edison Chamber Annual Gala on March 14 at the Pines Manor. Sponsorship levels $500 to $5,000.", 0,
      "other", "Administration", "Chamber of Commerce gala sponsorship solicitation — not council business",
      {}, ["Gala_Sponsorship_Flyer.pdf"], "new", null],

    ["GovDeals <notifications@govdeals.com>", "New Surplus Equipment Available in Your Area", "2026-02-04",
      "New government surplus items available near Edison, NJ. Browse heavy equipment, vehicles, office furniture.", 0,
      "other", "Administration", "Government surplus marketplace notification — automated marketing email",
      {}, [], "new", null],
  ];

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO docket (
      email_id, email_from, email_subject, email_date, email_body_preview,
      relevant, confidence, item_type, department, summary,
      extracted_fields, completeness, attachment_filenames,
      status, notes, target_meeting_date
    ) VALUES (?, ?, ?, ?, ?, ?, 'high', ?, ?, ?, ?, '{}', ?, ?, '', ?)
  `);

  const pStmt = db.prepare("INSERT OR IGNORE INTO processed_emails (email_id) VALUES (?)");

  const insertAll = db.transaction(() => {
    for (const [from, subject, date, body, relevant, itemType, dept, summary, fields, attachments, status, meetingDate] of rows) {
      const emailId = `seed-${date}-${subject.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;
      stmt.run(emailId, from, subject, date, body, relevant, itemType, dept, summary,
        JSON.stringify(fields), JSON.stringify(attachments), status, meetingDate);
      pStmt.run(emailId);
    }
  });

  insertAll();
  db.prepare("INSERT INTO config (key, value) VALUES ('seed_v1', '1') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  console.log(`[seed] Inserted ${rows.length} demo docket entries`);
}
