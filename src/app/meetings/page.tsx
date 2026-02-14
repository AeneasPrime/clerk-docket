"use client";

import { useState, useEffect, useCallback } from "react";

// --- Types ---

interface Meeting {
  id: number;
  meeting_type: "work_session" | "regular";
  meeting_date: string;
  cycle_date: string;
  video_url: string | null;
  minutes: string;
  status: "upcoming" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
}

interface MeetingCycle {
  cycle_date: string;
  work_session: Meeting | null;
  regular_meeting: Meeting | null;
}

interface DocketEntry {
  id: number;
  email_subject: string;
  item_type: string | null;
  department: string | null;
  summary: string | null;
  status: string;
}

interface MeetingWithAgenda extends Meeting {
  agenda_items: DocketEntry[];
}

// --- Constants ---

const TYPE_META: Record<string, { label: string; short: string }> = {
  resolution_bid_award: { label: "Bid Award", short: "BID" },
  resolution_professional_services: { label: "Professional Services", short: "PRO" },
  resolution_state_contract: { label: "State Contract", short: "STC" },
  resolution_tax_refund: { label: "Tax Refund", short: "TAX" },
  resolution_tax_sale_redemption: { label: "Tax Sale Redemption", short: "TSR" },
  resolution_bond_release: { label: "Bond Release", short: "BND" },
  resolution_escrow_release: { label: "Escrow Release", short: "ESC" },
  resolution_project_acceptance: { label: "Project Acceptance", short: "PRJ" },
  resolution_license_renewal: { label: "License Renewal", short: "LIC" },
  resolution_grant: { label: "Grant", short: "GRT" },
  resolution_personnel: { label: "Personnel", short: "PER" },
  resolution_surplus_sale: { label: "Surplus Sale", short: "SUR" },
  resolution_fee_waiver: { label: "Fee Waiver", short: "FEE" },
  resolution_disbursement: { label: "Disbursement", short: "DIS" },
  ordinance_new: { label: "New Ordinance", short: "ORD" },
  ordinance_amendment: { label: "Ordinance Amendment", short: "AMD" },
  discussion_item: { label: "Discussion Item", short: "DSC" },
  informational: { label: "Informational", short: "INF" },
  other: { label: "Other", short: "OTH" },
};

const AGENDA_SECTIONS = [
  { key: "resolutions", label: "Resolutions", types: ["resolution_bid_award", "resolution_professional_services", "resolution_state_contract", "resolution_tax_refund", "resolution_tax_sale_redemption", "resolution_bond_release", "resolution_escrow_release", "resolution_project_acceptance", "resolution_license_renewal", "resolution_grant", "resolution_personnel", "resolution_surplus_sale", "resolution_fee_waiver", "resolution_disbursement"] },
  { key: "ordinances", label: "Ordinances", types: ["ordinance_new", "ordinance_amendment"] },
  { key: "discussion", label: "Discussion", types: ["discussion_item"] },
  { key: "other", label: "Other", types: ["informational", "other"] },
];

// --- Helpers ---

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatWeekOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function statusBadge(status: string) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    upcoming: { bg: "rgba(94, 106, 210, 0.08)", color: "#5E6AD2", label: "Upcoming" },
    in_progress: { bg: "rgba(38, 181, 206, 0.08)", color: "#26B5CE", label: "In Progress" },
    completed: { bg: "rgba(75, 180, 100, 0.08)", color: "#4BB464", label: "Completed" },
  };
  const s = styles[status] ?? styles.upcoming;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// --- Sidebar ---

function Sidebar({ filter, onFilterChange }: {
  filter: "upcoming" | "past" | "all";
  onFilterChange: (f: "upcoming" | "past" | "all") => void;
}) {
  return (
    <aside className="flex w-56 shrink-0 flex-col" style={{ background: "#1F2023" }}>
      <a href="/dashboard" className="block px-5 py-5 transition-opacity hover:opacity-80">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white">Office of the Clerk</p>
        <p className="text-[10px] tracking-[0.2em]" style={{ color: "#6B6F76" }}>Edison Township</p>
      </a>

      <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3">
        <p className="sb-section-label mb-2 px-2.5">Navigation</p>
        <a href="/dashboard" className="sb-nav">Dashboard</a>
        <button className="sb-nav active">Meeting Packets</button>

        <p className="sb-section-label mb-2 mt-5 px-2.5">Filter</p>
        {(["upcoming", "past", "all"] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFilterChange(f)}
            className={`sb-nav ${filter === f ? "active" : ""}`}
          >
            {f === "upcoming" ? "Upcoming" : f === "past" ? "Past" : "All Meetings"}
          </button>
        ))}
      </nav>

      <div className="sb-footer">
        <a href="/dashboard" className="sb-footer-link">
          ← Back to Dashboard
        </a>
      </div>
    </aside>
  );
}

// --- Meeting Card ---

function MeetingCard({ meeting, onClick }: {
  meeting: Meeting | null;
  type: "work_session" | "regular";
  onClick: () => void;
}) {
  if (!meeting) return null;

  const isWorkSession = meeting.meeting_type === "work_session";
  const hasVideo = !!meeting.video_url;
  const hasMinutes = !!meeting.minutes;

  return (
    <button
      onClick={onClick}
      className="flex-1 rounded-lg bg-white text-left transition-all hover:shadow-md"
      style={{ border: "1px solid #E5E5E8" }}
    >
      <div className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider" style={{ color: isWorkSession ? "#5E6AD2" : "#26B5CE" }}>
              {isWorkSession ? "Work Session" : "Regular Meeting"}
            </p>
            <p className="mt-1 text-[15px] font-semibold" style={{ color: "#1D2024" }}>
              {formatShortDate(meeting.meeting_date)}
            </p>
            <p className="mt-0.5 text-xs" style={{ color: "#9CA0AB" }}>7:00 PM</p>
          </div>
          {statusBadge(meeting.status)}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: hasVideo ? "#4BB464" : "#C8C9CC" }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="3" width="10" height="10" rx="1.5" />
              <path d="M11 6.5L15 4.5V11.5L11 9.5" />
            </svg>
            Video
          </span>
          <span
            className="flex items-center gap-1 text-[11px]"
            style={{ color: hasMinutes ? "#4BB464" : "#C8C9CC" }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V3C14 2.44772 13.5523 2 13 2Z" />
              <path d="M5 5H11" /><path d="M5 8H11" /><path d="M5 11H8" />
            </svg>
            Minutes
          </span>
        </div>
      </div>
    </button>
  );
}

// --- Meeting Cycle Row ---

function MeetingCycleRow({ cycle, onSelect }: {
  cycle: MeetingCycle;
  onSelect: (meeting: Meeting) => void;
}) {
  return (
    <div className="mb-6">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider" style={{ color: "#6B6F76" }}>
        Week of {formatWeekOf(cycle.cycle_date)}
      </p>
      <div className="flex gap-4">
        <MeetingCard
          meeting={cycle.work_session}
          type="work_session"
          onClick={() => cycle.work_session && onSelect(cycle.work_session)}
        />
        <MeetingCard
          meeting={cycle.regular_meeting}
          type="regular"
          onClick={() => cycle.regular_meeting && onSelect(cycle.regular_meeting)}
        />
      </div>
    </div>
  );
}

// --- Meeting Detail ---

function MeetingDetail({ meetingId, onBack }: {
  meetingId: number;
  onBack: () => void;
}) {
  const [meeting, setMeeting] = useState<MeetingWithAgenda | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingVideo, setEditingVideo] = useState(false);
  const [editingMinutes, setEditingMinutes] = useState(false);
  const [videoInput, setVideoInput] = useState("");
  const [minutesInput, setMinutesInput] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchMeeting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`);
      const data = await res.json();
      setMeeting(data);
      setVideoInput(data.video_url ?? "");
      setMinutesInput(data.minutes ?? "");
    } catch { /* ignore */ }
    setLoading(false);
  }, [meetingId]);

  useEffect(() => { fetchMeeting(); }, [fetchMeeting]);

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      setMeeting((prev) => prev ? { ...prev, ...data } : prev);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const saveVideo = () => {
    save({ video_url: videoInput || null });
    setEditingVideo(false);
  };

  const saveMinutes = () => {
    save({ minutes: minutesInput });
    setEditingMinutes(false);
  };

  const updateStatus = (status: string) => {
    save({ status });
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: "#9CA0AB" }}>
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: "#9CA0AB" }}>
        Meeting not found
      </div>
    );
  }

  const isWorkSession = meeting.meeting_type === "work_session";

  // Group agenda items by section
  const sectionedItems = AGENDA_SECTIONS.map((section) => ({
    ...section,
    items: meeting.agenda_items.filter((item) => section.types.includes(item.item_type ?? "")),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F8F8F9" }}>
      <div className="mx-auto max-w-[800px] px-8 py-8">
        {/* Back button */}
        <button
          onClick={onBack}
          className="mb-6 flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "#6B6F76" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#1D2024")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B6F76")}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 12L6 8L10 4" />
          </svg>
          All Meetings
        </button>

        {/* Header */}
        <div className="mb-8">
          <p
            className="text-[11px] font-medium uppercase tracking-wider"
            style={{ color: isWorkSession ? "#5E6AD2" : "#26B5CE" }}
          >
            {isWorkSession ? "Work Session" : "Regular Meeting"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: "#1D2024" }}>
            {formatDate(meeting.meeting_date)}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            {statusBadge(meeting.status)}
            <span className="text-xs" style={{ color: "#9CA0AB" }}>7:00 PM</span>
            {!saving && (
              <div className="flex gap-1">
                {(["upcoming", "in_progress", "completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => updateStatus(s)}
                    className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                    style={{
                      color: meeting.status === s ? "#fff" : "#9CA0AB",
                      background: meeting.status === s
                        ? (s === "upcoming" ? "#5E6AD2" : s === "in_progress" ? "#26B5CE" : "#4BB464")
                        : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (meeting.status !== s) e.currentTarget.style.color = "#1D2024";
                    }}
                    onMouseLeave={(e) => {
                      if (meeting.status !== s) e.currentTarget.style.color = "#9CA0AB";
                    }}
                  >
                    {s === "upcoming" ? "Upcoming" : s === "in_progress" ? "In Progress" : "Completed"}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Video Link Section */}
        <div className="mb-6 rounded-lg bg-white p-5" style={{ border: "1px solid #E5E5E8" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={meeting.video_url ? "#4BB464" : "#C8C9CC"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="10" height="10" rx="1.5" />
                <path d="M11 6.5L15 4.5V11.5L11 9.5" />
              </svg>
              <h2 className="text-sm font-semibold" style={{ color: "#1D2024" }}>Video Link</h2>
            </div>
            {!editingVideo && (
              <button
                onClick={() => setEditingVideo(true)}
                className="text-xs transition-colors"
                style={{ color: "#5E6AD2" }}
              >
                {meeting.video_url ? "Edit" : "Add"}
              </button>
            )}
          </div>

          {editingVideo ? (
            <div className="mt-3 flex gap-2">
              <input
                type="url"
                value={videoInput}
                onChange={(e) => setVideoInput(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="flex-1 rounded-md px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid #E5E5E8", color: "#1D2024" }}
                autoFocus
              />
              <button
                onClick={saveVideo}
                className="rounded-md px-3 py-2 text-xs font-medium text-white"
                style={{ background: "#5E6AD2" }}
              >
                Save
              </button>
              <button
                onClick={() => { setEditingVideo(false); setVideoInput(meeting.video_url ?? ""); }}
                className="rounded-md px-3 py-2 text-xs"
                style={{ color: "#6B6F76" }}
              >
                Cancel
              </button>
            </div>
          ) : meeting.video_url ? (
            <a
              href={meeting.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm transition-colors"
              style={{ color: "#5E6AD2" }}
            >
              {meeting.video_url}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6.5V9.5C9 10.0523 8.55228 10.5 8 10.5H2.5C1.94772 10.5 1.5 10.0523 1.5 9.5V4C1.5 3.44772 1.94772 3 2.5 3H5.5" />
                <path d="M7.5 1.5H10.5V4.5" /><path d="M5 7L10.5 1.5" />
              </svg>
            </a>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "#C8C9CC" }}>No video link added yet</p>
          )}
        </div>

        {/* Minutes Section */}
        <div className="mb-6 rounded-lg bg-white p-5" style={{ border: "1px solid #E5E5E8" }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={meeting.minutes ? "#4BB464" : "#C8C9CC"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2H3C2.44772 2 2 2.44772 2 3V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V3C14 2.44772 13.5523 2 13 2Z" />
                <path d="M5 5H11" /><path d="M5 8H11" /><path d="M5 11H8" />
              </svg>
              <h2 className="text-sm font-semibold" style={{ color: "#1D2024" }}>Minutes</h2>
            </div>
            <div className="flex items-center gap-2">
              {meeting.minutes && !editingMinutes && (
                <a
                  href={`/api/meetings/${meetingId}/pdf`}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all"
                  style={{ background: "#F0F0F3", color: "#1D2024", border: "1px solid #E5E5E8" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#E8E8EB")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "#F0F0F3")}
                  download
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2V10" /><path d="M4 8L8 12L12 8" /><path d="M2 14H14" />
                  </svg>
                  PDF
                </a>
              )}
              {!editingMinutes && (
                <button
                  onClick={() => setEditingMinutes(true)}
                  className="text-xs transition-colors"
                  style={{ color: "#5E6AD2" }}
                >
                  {meeting.minutes ? "Edit" : "Add Manually"}
                </button>
              )}
            </div>
          </div>

          {editingMinutes ? (
            <div className="mt-3">
              <textarea
                value={minutesInput}
                onChange={(e) => setMinutesInput(e.target.value)}
                placeholder="Enter meeting minutes..."
                rows={8}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ border: "1px solid #E5E5E8", color: "#1D2024", resize: "vertical" }}
                autoFocus
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={saveMinutes}
                  className="rounded-md px-3 py-2 text-xs font-medium text-white"
                  style={{ background: "#5E6AD2" }}
                >
                  Save
                </button>
                <button
                  onClick={() => { setEditingMinutes(false); setMinutesInput(meeting.minutes ?? ""); }}
                  className="rounded-md px-3 py-2 text-xs"
                  style={{ color: "#6B6F76" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : meeting.minutes ? (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "#3D4046" }}>
              {meeting.minutes}
            </p>
          ) : (
            <p className="mt-2 text-xs" style={{ color: "#C8C9CC" }}>No minutes added yet</p>
          )}
        </div>

        {/* Agenda Items Section */}
        <div className="rounded-lg bg-white p-5" style={{ border: "1px solid #E5E5E8" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#1D2024" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3H14" /><path d="M2 6.5H14" /><path d="M2 10H10" /><path d="M2 13.5H7" />
            </svg>
            <h2 className="text-sm font-semibold" style={{ color: "#1D2024" }}>
              Agenda Items
              {meeting.agenda_items.length > 0 && (
                <span className="ml-1.5 text-xs font-normal" style={{ color: "#9CA0AB" }}>
                  ({meeting.agenda_items.length})
                </span>
              )}
            </h2>
          </div>

          {meeting.agenda_items.length === 0 ? (
            <p className="mt-3 text-xs" style={{ color: "#C8C9CC" }}>
              No agenda items assigned to this meeting yet.
              <br />
              <span style={{ color: "#9CA0AB" }}>
                Assign items from the Dashboard by setting their target meeting date.
              </span>
            </p>
          ) : (
            <div className="mt-4 space-y-5">
              {sectionedItems.map((section) => (
                <div key={section.key}>
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wider" style={{ color: "#6B6F76" }}>
                    {section.label}
                  </p>
                  <div className="space-y-1">
                    {section.items.map((item) => {
                      const meta = TYPE_META[item.item_type ?? ""] ?? { label: item.item_type, short: "---" };
                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 rounded-md px-3 py-2 transition-colors"
                          style={{ background: "#FAFAFA" }}
                        >
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-mono font-medium"
                            style={{ background: "rgba(94, 106, 210, 0.08)", color: "#5E6AD2" }}
                          >
                            {meta.short}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm" style={{ color: "#1D2024" }}>
                              {item.summary || item.email_subject}
                            </p>
                            {item.department && (
                              <p className="text-[11px]" style={{ color: "#9CA0AB" }}>{item.department}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---

export default function MeetingsPage() {
  const [filter, setFilter] = useState<"upcoming" | "past" | "all">("upcoming");
  const [cycles, setCycles] = useState<MeetingCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMeetingId, setSelectedMeetingId] = useState<number | null>(null);

  const fetchCycles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/meetings?filter=${filter}`);
      const data = await res.json();
      setCycles(data.cycles ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchCycles(); }, [fetchCycles]);

  return (
    <div className="flex h-screen">
      <Sidebar filter={filter} onFilterChange={(f) => { setFilter(f); setSelectedMeetingId(null); }} />

      {selectedMeetingId ? (
        <MeetingDetail
          meetingId={selectedMeetingId}
          onBack={() => setSelectedMeetingId(null)}
        />
      ) : (
        <div className="flex-1 overflow-y-auto" style={{ background: "#F8F8F9" }}>
          <div className="mx-auto max-w-[900px] px-8 py-8">
            <div className="mb-8">
              <h1 className="text-xl font-semibold" style={{ color: "#1D2024" }}>Meeting Packets</h1>
              <p className="mt-1 text-sm" style={{ color: "#9CA0AB" }}>
                {filter === "upcoming" ? "Upcoming council meeting cycles" : filter === "past" ? "Past council meeting cycles" : "All council meeting cycles"}
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-20">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-500" />
              </div>
            ) : cycles.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-sm" style={{ color: "#9CA0AB" }}>No meeting cycles found.</p>
              </div>
            ) : (
              cycles.map((cycle) => (
                <MeetingCycleRow
                  key={cycle.cycle_date}
                  cycle={cycle}
                  onSelect={(meeting) => setSelectedMeetingId(meeting.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
