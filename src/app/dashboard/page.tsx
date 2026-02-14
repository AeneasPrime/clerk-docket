"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// --- Types ---

interface DocketEntry {
  id: number;
  email_id: string;
  email_from: string;
  email_subject: string;
  email_date: string;
  email_body_preview: string;
  relevant: number;
  confidence: string | null;
  item_type: string | null;
  department: string | null;
  summary: string | null;
  extracted_fields: string;
  completeness: string;
  attachment_filenames: string;
  status: string;
  notes: string;
  target_meeting_date: string | null;
  text_override: string | null;
  created_at: string;
  updated_at: string;
}

interface DocketStats {
  total: number;
  new_count: number;
  reviewed: number;
  accepted: number;
  needs_info: number;
  by_type: { item_type: string; count: number }[];
  by_department: { department: string; count: number }[];
}

interface ScanResult {
  emails_found: number;
  emails_processed: number;
  emails_skipped: number;
  docket_entries_created: number;
  errors: string[];
}

interface LineItem {
  payee: string;
  amount: string;
  description?: string;
}

interface ExtractedFields {
  line_items?: LineItem[];
  [key: string]: string | string[] | LineItem[] | undefined | null;
}

interface CompletenessCheck {
  needs_cfo_certification: boolean;
  needs_attorney_review: boolean;
  missing_block_lot: boolean;
  missing_statutory_citation: boolean;
  notes: string[];
}

interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  snippet: string;
  bodyText: string;
}

interface TextOverride {
  whereas?: string[];
  resolved?: string;
  further_resolved?: string[];
  ordinance_title?: string;
  summary?: string;
}

interface DocketHistoryEntry {
  id: number;
  docket_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_at: string;
}

interface OrdinanceTracking {
  id: number;
  docket_id: number;
  ordinance_number: string | null;
  introduction_date: string | null;
  introduction_meeting: string | null;
  pub_intro_date: string | null;
  pub_intro_newspaper: string | null;
  bulletin_posted_date: string | null;
  hearing_date: string | null;
  hearing_amended: number;
  hearing_notes: string;
  adoption_date: string | null;
  adoption_vote: string | null;
  adoption_failed: number;
  pub_final_date: string | null;
  pub_final_newspaper: string | null;
  effective_date: string | null;
  is_emergency: number;
  website_posted_date: string | null;
  website_url: string | null;
  clerk_notes: string;
}

type OrdinanceWithTracking = DocketEntry & { tracking: OrdinanceTracking | null };

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

const DEPARTMENTS: { name: string; icon: string }[] = [
  { name: "Administration", icon: "◆" },
  { name: "Finance/CFO", icon: "$" },
  { name: "Law", icon: "§" },
  { name: "Engineering", icon: "△" },
  { name: "Public Works", icon: "⚙" },
  { name: "Police", icon: "★" },
  { name: "Fire", icon: "⦿" },
  { name: "Health", icon: "+" },
  { name: "Recreation", icon: "◎" },
  { name: "Planning/Zoning", icon: "▦" },
  { name: "Tax Collection", icon: "¢" },
  { name: "Tax Assessment", icon: "▤" },
  { name: "Water/Sewer Utility", icon: "≋" },
  { name: "Code Enforcement", icon: "⊘" },
  { name: "Human Resources", icon: "⊕" },
  { name: "Municipal Court", icon: "⚖" },
];

const AGENDA_SECTIONS = [
  { label: "Resolutions", types: new Set([
    "resolution_bid_award", "resolution_professional_services", "resolution_state_contract",
    "resolution_tax_refund", "resolution_tax_sale_redemption", "resolution_bond_release",
    "resolution_escrow_release", "resolution_project_acceptance", "resolution_license_renewal",
    "resolution_grant", "resolution_personnel", "resolution_surplus_sale",
    "resolution_fee_waiver", "resolution_disbursement",
  ])},
  { label: "Ordinances", types: new Set(["ordinance_new", "ordinance_amendment"]) },
  { label: "Discussion", types: new Set(["discussion_item"]) },
  { label: "Other Business", types: new Set(["informational", "other"]) },
];

// --- Helpers ---

function parseJson<T>(raw: string, fallback: T): T {
  try { return JSON.parse(raw); } catch { return fallback; }
}

function formatKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function shortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return "Today";
    if (diff < 172800000) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function fullDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    });
  } catch { return dateStr; }
}

function nextWorkSession(): { date: Date; days: number } {
  const now = new Date();
  const ws = new Date(now);
  ws.setDate(now.getDate() + ((8 - now.getDay()) % 7 || 7));
  ws.setHours(19, 0, 0, 0);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const target = new Date(ws); target.setHours(0, 0, 0, 0);
  return { date: ws, days: Math.ceil((target.getTime() - today.getTime()) / 86400000) };
}

function completenessIssues(c: CompletenessCheck): string[] {
  const out: string[] = [];
  if (c.needs_cfo_certification) out.push("CFO Cert");
  if (c.needs_attorney_review) out.push("Attorney");
  if (c.missing_block_lot) out.push("Block/Lot");
  if (c.missing_statutory_citation) out.push("Citation");
  return out;
}

function primaryAmount(f: ExtractedFields): string | null {
  const v = f.contract_amount ?? f.bond_amount ?? f.escrow_amount;
  if (typeof v === "string") return v;
  if (Array.isArray(f.dollar_amounts) && f.dollar_amounts.length) {
    const last = f.dollar_amounts[f.dollar_amounts.length - 1];
    if (typeof last === "string") return last;
  }
  return null;
}

function senderName(from: string): string {
  const match = from.match(/^([^<]+)/);
  return match ? match[1].trim() : from;
}

// --- Command Center ---

function CommandCenter({
  entries,
  stats,
  onViewChange,
  onSelect,
}: {
  entries: DocketEntry[];
  stats: DocketStats | null;
  onViewChange: (v: string) => void;
  onSelect: (id: number) => void;
}) {
  const ws = nextWorkSession();
  const accepted = useMemo(() => entries.filter((e) => e.status === "accepted" || e.status === "on_agenda"), [entries]);
  const newItems = useMemo(() => entries.filter((e) => e.status === "new"), [entries]);
  const flagged = useMemo(() => entries.filter((e) => e.status === "needs_info"), [entries]);

  // Meeting readiness: agenda items by section
  const agendaSections = useMemo(() =>
    AGENDA_SECTIONS.map((s) => ({
      ...s,
      items: accepted.filter((e) => s.types.has(e.item_type ?? "")),
    })),
    [accepted]
  );

  // Completeness issues on agenda items
  const agendaIssues = useMemo(() => {
    let cfo = 0, attorney = 0, blockLot = 0, citation = 0;
    for (const e of accepted) {
      const c = parseJson<CompletenessCheck>(e.completeness, {
        needs_cfo_certification: false, needs_attorney_review: false,
        missing_block_lot: false, missing_statutory_citation: false, notes: [],
      });
      if (c.needs_cfo_certification) cfo++;
      if (c.needs_attorney_review) attorney++;
      if (c.missing_block_lot) blockLot++;
      if (c.missing_statutory_citation) citation++;
    }
    return { cfo, attorney, blockLot, citation, total: cfo + attorney + blockLot + citation };
  }, [accepted]);

  // Total dollar value on agenda
  const agendaTotal = useMemo(() => {
    let sum = 0;
    for (const e of accepted) {
      const f = parseJson<ExtractedFields>(e.extracted_fields, {});
      const amt = primaryAmount(f);
      if (amt) {
        const n = parseFloat(amt.replace(/[$,]/g, ""));
        if (!isNaN(n)) sum += n;
      }
    }
    return sum;
  }, [accepted]);

  // Department breakdown with status counts
  const deptBreakdown = useMemo(() => {
    const map: Record<string, { total: number; new_: number; accepted: number; flagged: number }> = {};
    for (const e of entries) {
      const dept = e.department || "Unassigned";
      if (!map[dept]) map[dept] = { total: 0, new_: 0, accepted: 0, flagged: 0 };
      map[dept].total++;
      if (e.status === "new") map[dept].new_++;
      if (e.status === "accepted" || e.status === "on_agenda") map[dept].accepted++;
      if (e.status === "needs_info") map[dept].flagged++;
    }
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [entries]);

  // Recent items (last 5)
  const recent = useMemo(() =>
    [...entries].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5),
    [entries]
  );

  // Action items: agenda items with completeness gaps
  const incompleteAgenda = useMemo(() =>
    accepted.filter((e) => {
      const c = parseJson<CompletenessCheck>(e.completeness, {
        needs_cfo_certification: false, needs_attorney_review: false,
        missing_block_lot: false, missing_statutory_citation: false, notes: [],
      });
      return c.needs_cfo_certification || c.needs_attorney_review || c.missing_block_lot || c.missing_statutory_citation;
    }),
    [accepted]
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F8F8F9" }}>
      <div className="mx-auto max-w-[1080px] px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-[15px] font-semibold" style={{ color: "#1D2024" }}>Command Center</h1>
            <p className="mt-1 text-[12px]" style={{ color: "#9CA0AB" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="mb-6 grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-white px-5 py-4" style={{ border: "1px solid #E5E5E8" }}>
            <p className="text-[11px] font-medium" style={{ color: "#9CA0AB" }}>Next Meeting</p>
            <p className="mt-2 text-[22px] font-semibold tabular-nums" style={{ color: "#1D2024" }}>
              {ws.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
            <p className="mt-1 text-[12px] font-medium" style={{ color: ws.days <= 2 ? "#F2555A" : ws.days <= 5 ? "#E59500" : "#9CA0AB" }}>
              {ws.days === 0 ? "Today" : ws.days === 1 ? "Tomorrow" : `${ws.days} days away`}
            </p>
          </div>

          <button onClick={() => onViewChange("agenda")} className="rounded-lg bg-white px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA]" style={{ border: "1px solid #E5E5E8" }}>
            <p className="text-[11px] font-medium" style={{ color: "#9CA0AB" }}>On Agenda</p>
            <p className="mt-2 text-[22px] font-semibold tabular-nums" style={{ color: "#26B5CE" }}>{accepted.length}</p>
            {agendaTotal > 0 ? (
              <p className="mt-1 font-mono text-[12px]" style={{ color: "#9CA0AB" }}>
                ${agendaTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            ) : (
              <p className="mt-1 text-[12px]" style={{ color: "#9CA0AB" }}>items accepted</p>
            )}
          </button>

          <button onClick={() => onViewChange("review")} className="rounded-lg bg-white px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA]" style={{ border: "1px solid #E5E5E8" }}>
            <p className="text-[11px] font-medium" style={{ color: "#9CA0AB" }}>Needs Review</p>
            <p className="mt-2 text-[22px] font-semibold tabular-nums" style={{ color: newItems.length > 0 ? "#5E6AD2" : "#D2D3D6" }}>
              {newItems.length}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "#9CA0AB" }}>
              {newItems.length === 0 ? "All caught up" : "awaiting action"}
            </p>
          </button>

          <button onClick={() => onViewChange("needs_info")} className="rounded-lg bg-white px-5 py-4 text-left transition-colors hover:bg-[#FAFAFA]" style={{ border: "1px solid #E5E5E8" }}>
            <p className="text-[11px] font-medium" style={{ color: "#9CA0AB" }}>Flagged</p>
            <p className="mt-2 text-[22px] font-semibold tabular-nums" style={{ color: flagged.length > 0 ? "#F2555A" : "#D2D3D6" }}>
              {flagged.length}
            </p>
            <p className="mt-1 text-[12px]" style={{ color: "#9CA0AB" }}>
              {flagged.length === 0 ? "No flags" : "needs information"}
            </p>
          </button>
        </div>

        {/* Two-column middle */}
        <div className="mb-6 grid grid-cols-2 gap-4">
          {/* Meeting Readiness */}
          <div className="rounded-lg bg-white px-5 py-5" style={{ border: "1px solid #E5E5E8" }}>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Meeting Readiness</h2>
              <button onClick={() => onViewChange("live_agenda")} className="text-[11px] font-medium transition-colors hover:opacity-80" style={{ color: "#5E6AD2" }}>
                View Agenda →
              </button>
            </div>

            <div className="mb-5 space-y-3">
              {agendaSections.map((s) => (
                <div key={s.label} className="flex items-center justify-between">
                  <span className="text-[12px]" style={{ color: "#6B6F76" }}>{s.label}</span>
                  <div className="flex items-center gap-3">
                    <div className="h-[5px] w-24 overflow-hidden rounded-full" style={{ background: "#F0F0F2" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: accepted.length > 0 ? `${(s.items.length / Math.max(accepted.length, 1)) * 100}%` : "0%",
                          background: "#26B5CE",
                        }}
                      />
                    </div>
                    <span className="w-5 text-right text-[11px] tabular-nums" style={{ color: "#9CA0AB" }}>{s.items.length}</span>
                  </div>
                </div>
              ))}
            </div>

            {agendaIssues.total > 0 ? (
              <div className="rounded-md px-4 py-3" style={{ background: "#FFF8F0", border: "1px solid #F5E6D0" }}>
                <p className="mb-2 text-[11px] font-semibold" style={{ color: "#B45309" }}>
                  {agendaIssues.total} Completeness {agendaIssues.total === 1 ? "Issue" : "Issues"}
                </p>
                <div className="space-y-1">
                  {agendaIssues.cfo > 0 && <p className="text-[11px]" style={{ color: "#92400E" }}>CFO Certification needed ({agendaIssues.cfo})</p>}
                  {agendaIssues.attorney > 0 && <p className="text-[11px]" style={{ color: "#92400E" }}>Attorney Review needed ({agendaIssues.attorney})</p>}
                  {agendaIssues.blockLot > 0 && <p className="text-[11px]" style={{ color: "#92400E" }}>Missing Block/Lot ({agendaIssues.blockLot})</p>}
                  {agendaIssues.citation > 0 && <p className="text-[11px]" style={{ color: "#92400E" }}>Missing Citation ({agendaIssues.citation})</p>}
                </div>
              </div>
            ) : accepted.length > 0 ? (
              <div className="rounded-md px-4 py-3" style={{ background: "#F0FDF4", border: "1px solid #D1FAE5" }}>
                <p className="text-[11px] font-medium" style={{ color: "#15803D" }}>All agenda items complete</p>
              </div>
            ) : (
              <div className="rounded-md px-4 py-3" style={{ background: "#F8F8F9", border: "1px solid #E5E5E8" }}>
                <p className="text-[11px]" style={{ color: "#9CA0AB" }}>No items on agenda yet</p>
              </div>
            )}
          </div>

          {/* Action Items */}
          <div className="rounded-lg bg-white px-5 py-5" style={{ border: "1px solid #E5E5E8" }}>
            <h2 className="mb-5 text-[12px] font-semibold" style={{ color: "#1D2024" }}>Action Items</h2>

            {newItems.length === 0 && flagged.length === 0 && incompleteAgenda.length === 0 ? (
              <div className="flex flex-col items-center py-10">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#F0FDF4" }}>
                  <span className="text-[14px]" style={{ color: "#16A34A" }}>✓</span>
                </div>
                <p className="text-[12px] font-medium" style={{ color: "#6B6F76" }}>Nothing needs attention</p>
              </div>
            ) : (
              <div className="space-y-0.5 overflow-y-auto" style={{ maxHeight: "240px" }}>
                {newItems.slice(0, 3).map((e) => {
                  const meta = e.item_type ? TYPE_META[e.item_type] : null;
                  return (
                    <button key={e.id} onClick={() => onSelect(e.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#F8F8F9]">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded" style={{ background: "#EEF0FF", color: "#5E6AD2", fontSize: "9px", fontWeight: 700 }}>
                        {meta?.short ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px]" style={{ color: "#1D2024" }}>{e.summary || e.email_subject}</p>
                        <p className="text-[11px]" style={{ color: "#9CA0AB" }}>{e.department} · New</p>
                      </div>
                    </button>
                  );
                })}
                {newItems.length > 3 && (
                  <button onClick={() => onViewChange("review")} className="w-full rounded-md px-3 py-2 text-left text-[11px] font-medium transition-colors hover:bg-[#F8F8F9]" style={{ color: "#5E6AD2" }}>
                    +{newItems.length - 3} more to review →
                  </button>
                )}
                {flagged.slice(0, 2).map((e) => {
                  const meta = e.item_type ? TYPE_META[e.item_type] : null;
                  return (
                    <button key={e.id} onClick={() => onSelect(e.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#F8F8F9]">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded" style={{ background: "#FEF2F2", color: "#F2555A", fontSize: "9px", fontWeight: 700 }}>
                        {meta?.short ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px]" style={{ color: "#1D2024" }}>{e.summary || e.email_subject}</p>
                        <p className="text-[11px]" style={{ color: "#F2555A" }}>{e.department} · Needs Info</p>
                      </div>
                    </button>
                  );
                })}
                {incompleteAgenda.slice(0, 2).map((e) => {
                  const meta = e.item_type ? TYPE_META[e.item_type] : null;
                  const c = parseJson<CompletenessCheck>(e.completeness, {
                    needs_cfo_certification: false, needs_attorney_review: false,
                    missing_block_lot: false, missing_statutory_citation: false, notes: [],
                  });
                  const issues = completenessIssues(c);
                  return (
                    <button key={e.id} onClick={() => onSelect(e.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#F8F8F9]">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded" style={{ background: "#FFF8F0", color: "#B45309", fontSize: "9px", fontWeight: 700 }}>
                        {meta?.short ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px]" style={{ color: "#1D2024" }}>{e.summary || e.email_subject}</p>
                        <p className="text-[11px]" style={{ color: "#B45309" }}>On Agenda · {issues.join(", ")}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Bottom row */}
        <div className="grid grid-cols-2 gap-4">
          {/* Department Breakdown */}
          <div className="rounded-lg bg-white px-5 py-5" style={{ border: "1px solid #E5E5E8" }}>
            <h2 className="mb-5 text-[12px] font-semibold" style={{ color: "#1D2024" }}>By Department</h2>
            {deptBreakdown.length === 0 ? (
              <p className="py-6 text-center text-[11px]" style={{ color: "#9CA0AB" }}>No items yet</p>
            ) : (
              <div className="space-y-2.5">
                {deptBreakdown.slice(0, 8).map(([dept, counts]) => (
                  <div key={dept} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-[12px]" style={{ color: "#6B6F76" }}>{dept}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      {counts.new_ > 0 && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] tabular-nums font-medium" style={{ background: "#EEF0FF", color: "#5E6AD2" }}>{counts.new_}</span>
                      )}
                      {counts.accepted > 0 && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] tabular-nums font-medium" style={{ background: "#E8FAFE", color: "#0E8FA0" }}>{counts.accepted}</span>
                      )}
                      {counts.flagged > 0 && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] tabular-nums font-medium" style={{ background: "#FEF2F2", color: "#F2555A" }}>{counts.flagged}</span>
                      )}
                      <span className="w-5 text-right text-[11px] tabular-nums" style={{ color: "#D2D3D6" }}>{counts.total}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg bg-white px-5 py-5" style={{ border: "1px solid #E5E5E8" }}>
            <h2 className="mb-5 text-[12px] font-semibold" style={{ color: "#1D2024" }}>Recent Items</h2>
            {recent.length === 0 ? (
              <p className="py-6 text-center text-[11px]" style={{ color: "#9CA0AB" }}>No items yet</p>
            ) : (
              <div className="space-y-0.5">
                {recent.map((e) => {
                  const meta = e.item_type ? TYPE_META[e.item_type] : null;
                  return (
                    <button key={e.id} onClick={() => onSelect(e.id)} className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-[#F8F8F9]">
                      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded text-[9px] font-bold" style={{ background: "#F0F0F2", color: "#9CA0AB" }}>
                        {meta?.short ?? "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px]" style={{ color: "#1D2024" }}>{e.summary || e.email_subject}</p>
                        <p className="text-[11px]" style={{ color: "#9CA0AB" }}>{e.department} · {shortDate(e.created_at)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Sidebar ---

function Sidebar({ view, onViewChange, stats, deptFilter, onDeptFilter }: {
  view: string;
  onViewChange: (v: string) => void;
  stats: DocketStats | null;
  deptFilter: string | null;
  onDeptFilter: (dept: string | null) => void;
}) {
  const [deptsOpen, setDeptsOpen] = useState(true);
  const navItems = [
    { id: "command", label: "Command Center", count: 0 },
    { id: "review", label: "Review", count: stats?.new_count ?? 0 },
    { id: "agenda", label: "Agenda", count: stats?.accepted ?? 0 },
    { id: "live_agenda", label: "Live Agenda", count: stats?.accepted ?? 0 },
    { id: "ordinances", label: "Ordinances", count: 0 },
    { id: "all", label: "All Items", count: stats?.total ?? 0 },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col" style={{ background: "#1F2023" }}>
      {/* Logo */}
      <a href="/dashboard" className="block px-5 py-5 transition-opacity hover:opacity-80">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-white">Office of the Clerk</p>
        <p className="text-[10px] tracking-[0.2em]" style={{ color: "#6B6F76" }}>Edison Township</p>
      </a>

      {/* Nav */}
      <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-3">
        <p className="sb-section-label mb-2 px-2.5">Workflow</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`sb-nav ${view === item.id ? "active" : ""}`}
          >
            {item.label}
            {item.count > 0 && (
              <span className="sb-count">{item.count}</span>
            )}
          </button>
        ))}

        {stats && (stats.needs_info ?? 0) > 0 && (
          <button
            onClick={() => onViewChange("needs_info")}
            className={`sb-nav ${view === "needs_info" ? "active" : ""}`}
          >
            Needs Info
            <span className="sb-badge-red">{stats.needs_info}</span>
          </button>
        )}

        <p className="sb-section-label mb-2 mt-5 px-2.5">Pages</p>
        <a href="/meetings" className="sb-nav">Meeting Packets</a>

        <button
          onClick={() => setDeptsOpen((v) => !v)}
          className="sb-section-toggle mt-5 mb-1"
        >
          Departments
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform duration-150 ${deptsOpen ? "" : "-rotate-90"}`}
          >
            <path d="M3 4.5L6 7.5L9 4.5" />
          </svg>
        </button>
        {deptsOpen && (() => {
          const countMap: Record<string, number> = {};
          if (stats) {
            for (const d of stats.by_department ?? []) countMap[d.department] = d.count;
          }
          return DEPARTMENTS.map((dept) => {
            const count = countMap[dept.name] ?? 0;
            return (
              <button
                key={dept.name}
                onClick={() => onDeptFilter(deptFilter === dept.name ? null : dept.name)}
                className={`sb-dept ${count > 0 ? "has-items" : ""} ${deptFilter === dept.name ? "active" : ""}`}
              >
                <span className="flex items-center gap-1.5 truncate">
                  <span className="sb-dept-icon">{dept.icon}</span>
                  {dept.name}
                </span>
                <span className="sb-dept-count">{count}</span>
              </button>
            );
          });
        })()}
      </nav>

      <div className="sb-footer">
        <a href="/api/auth/gmail" className="sb-footer-link">
          Gmail Settings →
        </a>
      </div>
    </aside>
  );
}

// --- Top Bar ---

function TopBar({
  stats,
  scanning,
  scanMessage,
  onScan,
}: {
  stats: DocketStats | null;
  scanning: boolean;
  scanMessage: string | null;
  onScan: () => void;
}) {
  const ws = nextWorkSession();
  const processed = (stats?.total ?? 0) - (stats?.new_count ?? 0);
  const total = stats?.total ?? 0;
  const pct = total === 0 ? 0 : Math.round((processed / total) * 100);

  return (
    <div className="bg-white px-6 py-4" style={{ borderBottom: "1px solid #E5E5E8" }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest" style={{ color: "#6B6F76" }}>Next Work Session</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: "#1D2024" }}>
              {ws.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              <span className={`ml-2 text-sm font-normal ${ws.days <= 2 ? "text-red-500" : ws.days <= 5 ? "text-amber-500" : ""}`} style={ws.days > 5 ? { color: "#9CA0AB" } : undefined}>
                {ws.days === 0 ? "Today" : ws.days === 1 ? "Tomorrow" : `in ${ws.days}d`}
              </span>
            </p>
          </div>

          <div className="flex gap-6">
            {[
              { label: "Review", value: stats?.new_count ?? 0, color: "#5E6AD2" },
              { label: "Accepted", value: stats?.accepted ?? 0, color: "#26B5CE" },
              { label: "Flagged", value: stats?.needs_info ?? 0, color: "#F2555A" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-lg font-semibold tabular-nums" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[10px]" style={{ color: "#6B6F76" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full" style={{ background: "#F0F0F2" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: "linear-gradient(to right, #5E6AD2, #26B5CE)" }}
                />
              </div>
              <span className="text-xs tabular-nums" style={{ color: "#9CA0AB" }}>{pct}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {scanMessage && (
            <span className="animate-fade-in text-xs" style={{ color: "#6B6F76" }}>{scanMessage}</span>
          )}
          <button
            onClick={onScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-all disabled:opacity-50"
            style={{ background: "#5E6AD2" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#4F5BC0")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#5E6AD2")}
          >
            {scanning && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-slate-500 border-t-white" />
            )}
            {scanning ? "Scanning" : "Scan Inbox"}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Item Row ---

function ItemRow({
  entry,
  onSelect,
  onAction,
}: {
  entry: DocketEntry;
  onSelect: () => void;
  onAction: (id: number, status: string) => void;
}) {
  const comp = parseJson<CompletenessCheck>(entry.completeness, {
    needs_cfo_certification: false, needs_attorney_review: false,
    missing_block_lot: false, missing_statutory_citation: false, notes: [],
  });
  const fields = parseJson<ExtractedFields>(entry.extracted_fields, {});
  const issues = completenessIssues(comp);
  const amount = primaryAmount(fields);
  const meta = entry.item_type ? TYPE_META[entry.item_type] : null;

  return (
    <div
      className="group flex cursor-pointer items-start gap-4 border-b border-slate-100 px-5 py-4 transition-colors hover:bg-slate-100/50"
      onClick={onSelect}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-200/50 text-[11px] font-bold tracking-wider text-slate-400">
        {meta?.short ?? "—"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[13px] font-medium text-slate-800">
            {entry.summary || entry.email_subject}
          </p>
          {amount && (
            <span className="shrink-0 font-mono text-xs font-medium text-emerald-600">{amount}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400">
          {entry.department && <span className="font-medium text-slate-500">{entry.department}</span>}
          {entry.department && <span className="text-slate-300">·</span>}
          <span>{senderName(entry.email_from)}</span>
          <span className="text-slate-300">·</span>
          <span>{shortDate(entry.email_date)}</span>
        </div>

        {issues.length > 0 && (
          <div className="mt-2 flex gap-1.5">
            {issues.map((issue) => (
              <span key={issue} className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                {issue}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
        {(entry.status === "new" || entry.status === "reviewed") && (
          <>
            <button
              onClick={() => onAction(entry.id, "accepted")}
              className="rounded-md bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
            >
              Accept
            </button>
            <button
              onClick={() => onAction(entry.id, "needs_info")}
              className="rounded-md bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Flag
            </button>
            <button
              onClick={() => onAction(entry.id, "rejected")}
              className="rounded-md px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              Dismiss
            </button>
          </>
        )}
        {entry.status === "accepted" && (
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-700">On Agenda</span>
        )}
        {entry.status === "needs_info" && (
          <span className="rounded-md bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600">Flagged</span>
        )}
        {entry.status === "rejected" && (
          <span className="text-[10px] text-slate-300">Dismissed</span>
        )}
      </div>

      <div className="flex shrink-0 items-center pt-1 group-hover:hidden">
        {entry.status === "new" && <div className="h-2 w-2 rounded-full bg-blue-500" />}
        {entry.status === "reviewed" && <div className="h-2 w-2 rounded-full bg-yellow-500" />}
        {entry.status === "accepted" && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
        {entry.status === "needs_info" && <div className="h-2 w-2 rounded-full bg-red-500" />}
        {entry.status === "rejected" && <div className="h-2 w-2 rounded-full bg-slate-300" />}
      </div>
    </div>
  );
}

// --- Agenda Panel ---

function AgendaPanel({ entries, onSelect }: { entries: DocketEntry[]; onSelect: (id: number) => void }) {
  const accepted = entries.filter((e) => e.status === "accepted" || e.status === "on_agenda");
  const grouped = AGENDA_SECTIONS
    .map((s) => ({ ...s, items: accepted.filter((e) => s.types.has(e.item_type ?? "")) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="h-full overflow-y-auto bg-slate-50">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Draft Agenda</h2>
          <span className="tabular-nums text-xs text-slate-400">{accepted.length} items</span>
        </div>
      </div>

      {accepted.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-xs text-slate-400">Accept items to build the agenda</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {grouped.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">{group.label}</p>
              {group.items.map((item, i) => {
                const fields = parseJson<ExtractedFields>(item.extracted_fields, {});
                const amount = primaryAmount(fields);
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-slate-100/50"
                  >
                    <span className="mt-px text-[10px] tabular-nums text-slate-300">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-snug text-slate-600">{item.summary || item.email_subject}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <span>{item.department}</span>
                        {amount && <span className="font-mono text-emerald-600">{amount}</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Clause Generation (Edison Township format per actual Municipal Council records) ---

function generateClause(
  itemType: string,
  fields: ExtractedFields,
  summary: string | null,
  comp: CompletenessCheck
): { whereas: string[]; resolved: string; cfoNote: boolean } {
  const vendor = typeof fields.vendor_name === "string" ? fields.vendor_name : "[vendor]";
  const amount = primaryAmount(fields) ?? "[amount to be determined]";
  const project = typeof fields.project_name === "string" ? fields.project_name : "[project description]";
  const citation = typeof fields.statutory_citation === "string" ? fields.statutory_citation : null;
  const blockLot = typeof fields.block_lot === "string" ? fields.block_lot : null;
  const bidNum = typeof fields.bid_number === "string" ? fields.bid_number : null;
  const stateContract = typeof fields.state_contract_number === "string" ? fields.state_contract_number : null;
  const licenseNum = typeof fields.license_number === "string" ? fields.license_number : null;
  const licenseeName = typeof fields.licensee_name === "string" ? fields.licensee_name : null;
  const bondAmt = typeof fields.bond_amount === "string" ? fields.bond_amount : null;
  const escrowAmt = typeof fields.escrow_amount === "string" ? fields.escrow_amount : null;
  const action = typeof fields.recommended_action === "string" ? fields.recommended_action : null;
  const dollarAmounts = Array.isArray(fields.dollar_amounts) ? fields.dollar_amounts : [];
  const cfo = comp.needs_cfo_certification;

  switch (itemType) {
    case "resolution_bid_award":
      return {
        whereas: [
          `bids were received by the Township of Edison for ${project}${bidNum ? `, Public Bid No. ${bidNum}` : ""}`,
          `${vendor} submitted the lowest legally responsible, responsive bid in the amount of ${amount}`,
          "the Chief Financial Officer has certified that funds are available for this purpose",
          ...(citation ? [`the award is authorized pursuant to the Local Public Contracts Law, ${citation}`] : [
            "the award is authorized pursuant to the Local Public Contracts Law, N.J.S.A. 40A:11-1 et seq.",
          ]),
        ],
        resolved: `the contract for ${project} be and is hereby awarded to ${vendor}, in an amount not to exceed ${amount}, and the Mayor and Township Clerk are hereby authorized to execute said contract`,
        cfoNote: cfo,
      };

    case "resolution_professional_services":
      return {
        whereas: [
          `the Township of Edison has a need to acquire professional services for ${project}`,
          `${vendor} has submitted a proposal to provide such services in the amount of ${amount}`,
          ...(citation ? [`such services are to be awarded as a professional service without competitive bidding pursuant to ${citation}`] : [
            "such services are to be awarded as a professional service without competitive bidding pursuant to N.J.S.A. 40A:11-5(1)(a) of the Local Public Contracts Law",
          ]),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `${vendor} be and is hereby appointed to provide professional services for ${project}, in an amount not to exceed ${amount}, and the Mayor and Township Clerk are hereby authorized to execute the necessary agreement`,
        cfoNote: cfo,
      };

    case "resolution_state_contract":
      return {
        whereas: [
          `the Township of Edison wishes to purchase goods or services from ${vendor}`,
          ...(stateContract ? [`said purchase is authorized under New Jersey State Contract No. ${stateContract}`] : []),
          ...(citation ? [`the purchase is authorized pursuant to ${citation}`] : [
            "the purchase is authorized without competitive bidding pursuant to N.J.S.A. 40A:11-12 of the Local Public Contracts Law",
          ]),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `the Township be and is hereby authorized to purchase from ${vendor}, in an amount not to exceed ${amount}, under ${stateContract ? `New Jersey State Contract No. ${stateContract}` : "the applicable State contract"}, and the Mayor and Township Clerk are hereby authorized to execute any necessary documents`,
        cfoNote: cfo,
      };

    case "resolution_tax_refund":
      return {
        whereas: [
          blockLot
            ? `the Tax Collector has certified that a tax overpayment exists for property known as Block ${blockLot}`
            : "the Tax Collector has certified that a tax overpayment exists for the subject property",
          ...(dollarAmounts.length > 0 ? [`the overpayment totals ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          ...(citation ? [`the refund is authorized pursuant to ${citation}`] : []),
        ],
        resolved: `the Tax Collector be and is hereby authorized to process a refund${blockLot ? ` for Block ${blockLot}` : ""}${dollarAmounts.length > 0 ? ` in the amount of ${dollarAmounts[dollarAmounts.length - 1]}` : ""}`,
        cfoNote: cfo,
      };

    case "resolution_tax_sale_redemption":
      return {
        whereas: [
          blockLot
            ? `the property known as Block ${blockLot} was sold at tax sale by the Township of Edison`
            : "the subject property was sold at tax sale by the Township of Edison",
          "the owner has made full payment of all taxes, interest, penalties, and costs due thereon",
        ],
        resolved: `the Tax Collector be and is hereby authorized to issue a tax sale certificate of redemption${blockLot ? ` for Block ${blockLot}` : ""}${dollarAmounts.length > 0 ? ` upon receipt of ${dollarAmounts[dollarAmounts.length - 1]}` : ""}`,
        cfoNote: false,
      };

    case "resolution_bond_release":
      return {
        whereas: [
          `${vendor} has posted a performance bond${bondAmt ? ` in the amount of ${bondAmt}` : ""} in connection with ${project}`,
          ...(blockLot ? [`the project is located at Block ${blockLot} in the Township of Edison`] : []),
          "the Township Engineer has inspected said project and has certified that all work has been completed in accordance with the approved plans and specifications",
        ],
        resolved: `the performance bond posted by ${vendor}${bondAmt ? ` in the amount of ${bondAmt}` : ""} for ${project} be and is hereby released, and the Township Clerk is authorized to process said release`,
        cfoNote: false,
      };

    case "resolution_escrow_release":
      return {
        whereas: [
          `the applicant has requested the release of ${escrowAmt ? `developer escrow funds in the amount of ${escrowAmt}` : "developer escrow funds"} for ${project}`,
          ...(blockLot ? [`the project is located at Block ${blockLot} in the Township of Edison`] : []),
          "the Township Engineer has reviewed the escrow account and has certified that the balance may be released",
        ],
        resolved: `the developer escrow funds${escrowAmt ? ` in the amount of ${escrowAmt}` : ""} for ${project} be and are hereby authorized for release to the applicant`,
        cfoNote: false,
      };

    case "resolution_license_renewal":
      return {
        whereas: [
          licenseeName
            ? `${licenseeName} has applied for renewal of ${licenseNum ? `License No. ${licenseNum}` : "their license"} in the Township of Edison`
            : `the applicant has applied for license renewal${licenseNum ? ` (License No. ${licenseNum})` : ""} in the Township of Edison`,
          "all required documents, fees, and inspections have been completed and are in order",
        ],
        resolved: `the license renewal${licenseeName ? ` for ${licenseeName}` : ""}${licenseNum ? `, License No. ${licenseNum},` : ""} be and is hereby approved, subject to compliance with all applicable Township ordinances and State regulations`,
        cfoNote: false,
      };

    case "resolution_personnel":
      return {
        whereas: [
          action
            ? `the following personnel action has been recommended: ${action}`
            : "a personnel action has been recommended by the appropriate department head",
          ...(citation ? [`said action is authorized pursuant to ${citation}`] : []),
          "the Chief Financial Officer has certified that funds are available for this purpose, where applicable",
        ],
        resolved: action
          ? `the following personnel action be and is hereby approved: ${action}`
          : "the recommended personnel action be and is hereby approved as set forth in the attached schedule",
        cfoNote: cfo,
      };

    case "resolution_grant":
      return {
        whereas: [
          `the Township of Edison has been offered a grant for ${project} in the amount of ${amount}`,
          "it is in the best interest of the Township of Edison to accept said grant funds",
          "no local match is required unless otherwise specified herein",
        ],
        resolved: `the Mayor and Township Clerk be and are hereby authorized to execute all documents necessary to accept the grant for ${project} in the amount of ${amount}, and the Chief Financial Officer is authorized to establish the appropriate budget accounts`,
        cfoNote: cfo,
      };

    case "resolution_disbursement":
      return {
        whereas: [
          action
            ? `the following disbursement has been recommended for approval: ${action}`
            : "the claims listed on the bill list have been reviewed and approved for payment",
          ...(dollarAmounts.length > 0 ? [`the total disbursement amount is ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          "the Chief Financial Officer has certified that funds are available for this purpose",
        ],
        resolved: `the disbursements${dollarAmounts.length > 0 ? ` totaling ${dollarAmounts[dollarAmounts.length - 1]}` : ""} as set forth on the bill list be and are hereby approved for payment`,
        cfoNote: cfo,
      };

    case "resolution_surplus_sale":
      return {
        whereas: [
          `the Township of Edison has determined that certain property${project !== "[project description]" ? ` described as ${project}` : ""} is no longer needed for public use`,
          ...(blockLot ? [`said property is located at Block ${blockLot}`] : []),
          ...(vendor !== "[vendor]" ? [`${vendor} has submitted a bid for purchase of said surplus property`] : []),
          "the sale is authorized pursuant to N.J.S.A. 40A:12-13 et seq.",
        ],
        resolved: `the surplus property${project !== "[project description]" ? ` (${project})` : ""} be and is hereby authorized for sale${vendor !== "[vendor]" ? ` to ${vendor}` : ""} in accordance with applicable law`,
        cfoNote: false,
      };

    case "resolution_project_acceptance":
      return {
        whereas: [
          `${project} has been completed in the Township of Edison`,
          ...(blockLot ? [`the project is located at Block ${blockLot}`] : []),
          "the Township Engineer has inspected said project and has recommended acceptance thereof",
          "the developer has posted the required maintenance bond, where applicable",
        ],
        resolved: `${project} be and is hereby accepted by the Township of Edison, and the Township Clerk is authorized to process the release of any applicable performance guarantees${action ? `; and further, ${action}` : ""}`,
        cfoNote: false,
      };

    case "resolution_fee_waiver":
      return {
        whereas: [
          "an application has been received requesting a waiver of certain Township fees",
          ...(dollarAmounts.length > 0 ? [`the fee amount requested to be waived is ${dollarAmounts[dollarAmounts.length - 1]}`] : []),
          ...(action ? [`the recommendation is as follows: ${action}`] : []),
        ],
        resolved: `the fee waiver${dollarAmounts.length > 0 ? ` in the amount of ${dollarAmounts[dollarAmounts.length - 1]}` : ""} be and is hereby approved`,
        cfoNote: false,
      };

    default:
      return {
        whereas: [summary ?? "a matter has been presented to the Township Council for consideration and action"],
        resolved: summary ?? "the recommended action be and is hereby approved",
        cfoNote: false,
      };
  }
}

function generateOrdinanceTitle(
  itemType: string,
  fields: ExtractedFields,
  summary: string | null
): string {
  const citation = typeof fields.statutory_citation === "string" ? fields.statutory_citation : null;
  const project = typeof fields.project_name === "string" ? fields.project_name : null;

  if (itemType === "ordinance_amendment") {
    return `AN ORDINANCE TO AMEND AND SUPPLEMENT THE REVISED GENERAL ORDINANCES OF THE TOWNSHIP OF EDISON, COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, ${project ? `AMENDING ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "AMENDING THE REVISED GENERAL ORDINANCES")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
  }
  return `AN ORDINANCE OF THE TOWNSHIP OF EDISON, COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, ${project ? `ESTABLISHING ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "PROVIDING FOR THE GENERAL WELFARE")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
}

// --- Live Agenda ---

const SECTION_HEADERS: Record<string, string> = {
  "Resolutions": "CONSENT AGENDA",
  "Ordinances": "FOR FURTHER CONSIDERATION AND PUBLIC HEARING OF ORDINANCES",
  "Discussion": "DISCUSSION ITEMS",
  "Other Business": "OTHER BUSINESS",
};

function TrailSidebar({
  emailId,
  subject,
  onClose,
}: {
  emailId: string;
  subject: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(emailId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/thread?emailId=${encodeURIComponent(emailId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
        } else {
          setMessages(data.messages ?? []);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [emailId]);

  return (
    <div className="animate-slide-in no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-slate-200/60 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Email Trail</p>
          <h2 className="mt-1 text-[14px] font-semibold leading-snug text-slate-900">{subject}</h2>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" />
          </div>
        )}

        {error && (
          <div className="p-5">
            <div className="rounded-lg bg-red-50 p-4 text-[12px] text-red-600">{error}</div>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="p-5 text-center text-[12px] text-slate-400">No messages found in this thread.</div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="p-4">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {messages.length} message{messages.length !== 1 ? "s" : ""} in thread
            </p>
            <div className="space-y-2">
              {messages.map((msg, idx) => {
                const isSource = msg.id === emailId;
                const isExpanded = expandedId === msg.id;
                const fromName = msg.from.match(/^([^<]+)/)?.[1]?.trim() ?? msg.from;
                let dateStr = "";
                try {
                  dateStr = new Date(msg.date).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                  });
                } catch { dateStr = msg.date; }

                return (
                  <div
                    key={msg.id}
                    className={`rounded-lg border transition-colors ${
                      isSource
                        ? "border-indigo-200 bg-indigo-50/50"
                        : "border-slate-200/60 bg-white"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      className="flex w-full items-start gap-3 p-3.5 text-left"
                    >
                      {/* Message number */}
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isSource ? "bg-indigo-200 text-indigo-700" : "bg-slate-200/60 text-slate-400"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[12px] font-medium text-slate-800">{fromName}</p>
                          <span className="shrink-0 text-[10px] text-slate-400">{dateStr}</span>
                        </div>
                        {!isExpanded && (
                          <p className="mt-0.5 truncate text-[11px] text-slate-400">
                            {msg.snippet}
                          </p>
                        )}
                      </div>
                      {isSource && (
                        <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-indigo-600">
                          Source
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-slate-200/40 px-3.5 pb-3.5 pt-3">
                        <div className="mb-2 space-y-0.5 text-[10px] text-slate-400">
                          <p><span className="font-medium text-slate-500">From:</span> {msg.from}</p>
                          <p><span className="font-medium text-slate-500">To:</span> {msg.to}</p>
                          {msg.subject && <p><span className="font-medium text-slate-500">Subject:</span> {msg.subject}</p>}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-lg bg-slate-100/60 p-3 font-mono text-[11px] leading-relaxed text-slate-600 whitespace-pre-wrap">
                          {msg.bodyText || msg.snippet || "(no content)"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function boldLegalPrefixes(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/^(WHEREAS,)/i, "<strong>$1</strong>")
    .replace(/^(NOW, THEREFORE, BE IT RESOLVED)/i, "<strong>$1</strong>")
    .replace(/^(BE IT FURTHER RESOLVED)/i, "<strong>$1</strong>");
}

function InlineEdit({
  value,
  onSave,
  className,
}: {
  value: string;
  onSave: (newValue: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const savedRef = useRef(value);

  useEffect(() => {
    savedRef.current = value;
    if (ref.current) ref.current.innerHTML = boldLegalPrefixes(value);
  }, [value]);

  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onFocus={() => {
        savedRef.current = ref.current?.textContent ?? value;
      }}
      onBlur={() => {
        const text = ref.current?.textContent?.trim() ?? "";
        if (text && text !== savedRef.current) {
          savedRef.current = text;
          onSave(text);
        }
        // Re-apply bold formatting after editing
        if (ref.current) ref.current.innerHTML = boldLegalPrefixes(ref.current.textContent ?? "");
      }}
      className={`cursor-text outline-none ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: boldLegalPrefixes(value) }}
    />
  );
}

function HistorySidebar({
  itemId,
  subject,
  onClose,
  onRevert,
}: {
  itemId: number;
  subject: string;
  onClose: () => void;
  onRevert: (field: string) => void;
}) {
  const [history, setHistory] = useState<DocketHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/docket-item?id=${itemId}&history=true`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setHistory(data.history ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [itemId]);

  const fieldLabel = (f: string) => {
    const labels: Record<string, string> = { whereas: "WHEREAS clauses", resolved: "RESOLVED text", ordinance_title: "Ordinance title", summary: "Summary" };
    return labels[f] ?? f;
  };

  const formatVal = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      if (parsed === null) return "(auto-generated)";
      if (Array.isArray(parsed)) return parsed.join("; ");
      return String(parsed);
    } catch { return raw; }
  };

  return (
    <div className="animate-slide-in no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start gap-3 border-b border-slate-200/60 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Edit History</p>
          <h2 className="mt-1 text-[14px] font-semibold leading-snug text-slate-900">{subject}</h2>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full" style={{ borderWidth: 2, borderStyle: "solid", borderRightColor: "#E5E5E8", borderBottomColor: "#E5E5E8", borderLeftColor: "#E5E5E8", borderTopColor: "#5E6AD2" }} />
          </div>
        ) : history.length === 0 ? (
          <p className="py-12 text-center text-sm italic text-slate-400">No edit history yet</p>
        ) : (
          <div className="space-y-4">
            {history.map((h) => (
              <div key={h.id} className="rounded-lg border border-slate-200/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    {fieldLabel(h.field_name)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(h.changed_at + "Z").toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                <div className="mb-1 text-[11px] text-slate-400">Previous:</div>
                <p className="mb-2 rounded bg-red-50/50 p-2 text-[12px] leading-relaxed text-slate-600 line-through">{formatVal(h.old_value)}</p>
                <div className="mb-1 text-[11px] text-slate-400">Changed to:</div>
                <p className="rounded bg-green-50/50 p-2 text-[12px] leading-relaxed text-slate-700">{formatVal(h.new_value)}</p>
                {h.new_value !== "null" && (
                  <button
                    onClick={() => onRevert(h.field_name)}
                    className="mt-2 text-[11px] text-indigo-500 hover:text-indigo-700"
                  >
                    Revert to auto-generated
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Ordinances View ---

const ORDINANCE_STAGES = [
  { key: "introduction", label: "Introduction", num: "1" },
  { key: "pub_intro", label: "Publication", num: "2" },
  { key: "bulletin", label: "Bulletin Board", num: "3" },
  { key: "hearing", label: "Public Hearing", num: "4" },
  { key: "adoption", label: "Adoption", num: "5" },
  { key: "pub_final", label: "Final Publication", num: "6" },
  { key: "effective", label: "Effective", num: "7" },
  { key: "website", label: "Website", num: "8" },
] as const;

function getOrdStage(t: OrdinanceTracking | null): { label: string; color: string; idx: number } {
  if (!t) return { label: "Draft", color: "#9CA0AB", idx: -1 };
  if (t.adoption_failed) return { label: "Failed", color: "#F2555A", idx: -1 };
  if (t.effective_date && new Date(t.effective_date + "T23:59:59") <= new Date()) return { label: "In Effect", color: "#16A34A", idx: 7 };
  if (t.website_posted_date) return { label: "In Effect", color: "#16A34A", idx: 8 };
  if (t.pub_final_date) return { label: "Awaiting Effective", color: "#26B5CE", idx: 6 };
  if (t.adoption_date) return { label: "Adopted", color: "#26B5CE", idx: 5 };
  if (t.hearing_date && !t.adoption_date) {
    if (t.hearing_amended) return { label: "Amended — Reset", color: "#E59500", idx: 4 };
    return { label: "Public Hearing", color: "#E59500", idx: 4 };
  }
  if (t.bulletin_posted_date) return { label: "Posted", color: "#5E6AD2", idx: 3 };
  if (t.pub_intro_date) return { label: "Published", color: "#5E6AD2", idx: 2 };
  if (t.introduction_date) return { label: "Introduced", color: "#5E6AD2", idx: 1 };
  return { label: "Draft", color: "#9CA0AB", idx: 0 };
}

function daysRelative(dateStr: string | null): string {
  if (!dateStr) return "";
  const target = new Date(dateStr + "T12:00:00");
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  if (diff < -1) return `${Math.abs(diff)}d ago`;
  if (diff === -1) return "yesterday";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff}d`;
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return d; }
}

function OrdinancesView({ onSelect }: { onSelect: (id: number) => void }) {
  const [ordinances, setOrdinances] = useState<OrdinanceWithTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchOrdinances = useCallback(async () => {
    try {
      const r = await fetch("/api/ordinances");
      const d = await r.json();
      setOrdinances(d.ordinances ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchOrdinances(); }, [fetchOrdinances]);

  const saveTracking = async (docketId: number, updates: Record<string, string | number | null>) => {
    await fetch(`/api/ordinances/tracking?id=${docketId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    fetchOrdinances();
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full" style={{ borderWidth: 2, borderStyle: "solid", borderRightColor: "#E5E5E8", borderBottomColor: "#E5E5E8", borderLeftColor: "#E5E5E8", borderTopColor: "#5E6AD2" }} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F8F8F9" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-white/90 px-6 py-3 backdrop-blur-sm" style={{ borderColor: "#E5E5E8" }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "#1D2024" }}>Ordinances</h2>
            <p className="mt-0.5 text-[11px]" style={{ color: "#9CA0AB" }}>
              NJ lifecycle tracking — NJSA 40:49-2, 40:69A-181
            </p>
          </div>
          <span className="tabular-nums text-[12px]" style={{ color: "#9CA0AB" }}>{ordinances.length} total</span>
        </div>
      </div>

      {ordinances.length === 0 ? (
        <div className="flex flex-col items-center py-20">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "#F0F0F2" }}>
            <span className="text-[14px]" style={{ color: "#9CA0AB" }}>§</span>
          </div>
          <p className="text-[13px] font-medium" style={{ color: "#6B6F76" }}>No ordinances yet</p>
          <p className="mt-1 text-[11px]" style={{ color: "#9CA0AB" }}>Ordinances will appear here when classified from inbox</p>
        </div>
      ) : (
        <div className="mx-auto max-w-[900px] space-y-3 px-6 py-5">
          {ordinances.map((ord) => {
            const stage = getOrdStage(ord.tracking);
            const meta = ord.item_type ? TYPE_META[ord.item_type] : null;
            const isOpen = expandedId === ord.id;

            return (
              <div key={ord.id} className="rounded-lg bg-white" style={{ border: "1px solid #E5E5E8" }}>
                {/* Card header */}
                <div className="flex items-start gap-3.5 px-5 py-4">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold"
                    style={{ background: "#EEF0FF", color: "#5E6AD2" }}
                  >
                    {meta?.short ?? "ORD"}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {ord.tracking?.ordinance_number && (
                            <span className="text-[12px] font-semibold tabular-nums" style={{ color: "#5E6AD2" }}>
                              {ord.tracking.ordinance_number}
                            </span>
                          )}
                          <h3
                            className="cursor-pointer truncate text-[13px] font-medium hover:underline"
                            style={{ color: "#1D2024" }}
                            onClick={() => onSelect(ord.id)}
                            title={ord.summary || ord.email_subject}
                          >
                            {ord.summary || ord.email_subject}
                          </h3>
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-[11px]" style={{ color: "#9CA0AB" }}>
                          {ord.department && <span>{ord.department}</span>}
                          {ord.department && <span>·</span>}
                          <span>{shortDate(ord.created_at)}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className="rounded px-2 py-1 text-[11px] font-medium"
                          style={{ background: `${stage.color}18`, color: stage.color }}
                        >
                          {stage.label}
                        </span>
                        <button
                          onClick={() => setExpandedId(isOpen ? null : ord.id)}
                          className="rounded px-2 py-1 text-[11px] font-medium transition-colors hover:bg-slate-50"
                          style={{ border: "1px solid #E5E5E8", color: "#6B6F76" }}
                        >
                          {isOpen ? "Close" : "Track"}
                        </button>
                      </div>
                    </div>

                    {/* Mini progress bar — collapsed view */}
                    {!isOpen && ord.tracking && (
                      <div className="mt-3 flex items-center gap-1">
                        {ORDINANCE_STAGES.map((s, i) => {
                          const done = stage.idx > i || (stage.idx === i && stage.label !== "Draft");
                          const current = stage.idx === i;
                          return (
                            <div key={s.key} className="flex items-center gap-1">
                              <div
                                className="h-1.5 w-8 rounded-full transition-colors"
                                style={{
                                  background: done ? stage.color : current ? `${stage.color}40` : "#E5E5E8",
                                }}
                                title={s.label}
                              />
                            </div>
                          );
                        })}
                        {/* Key dates inline */}
                        <div className="ml-3 flex items-center gap-3 text-[10px]" style={{ color: "#9CA0AB" }}>
                          {ord.tracking?.hearing_date && (
                            <span>
                              Hearing {fmtDate(ord.tracking.hearing_date)}{" "}
                              {new Date(ord.tracking.hearing_date + "T23:59:59") >= new Date() && (
                                <span style={{ color: "#E59500" }}>({daysRelative(ord.tracking.hearing_date)})</span>
                              )}
                            </span>
                          )}
                          {ord.tracking?.effective_date && (
                            <span>
                              Effective {fmtDate(ord.tracking.effective_date)}{" "}
                              {new Date(ord.tracking.effective_date + "T23:59:59") >= new Date() && (
                                <span style={{ color: "#26B5CE" }}>({daysRelative(ord.tracking.effective_date)})</span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Expanded tracking form */}
                {isOpen && (
                  <div className="border-t px-5 py-5" style={{ background: "#FAFAFA", borderColor: "#E5E5E8" }}>
                    <OrdTrackingForm
                      ord={ord}
                      onSave={(updates) => saveTracking(ord.id, updates)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrdTrackingForm({
  ord,
  onSave,
}: {
  ord: OrdinanceWithTracking;
  onSave: (updates: Record<string, string | number | null>) => void;
}) {
  const t = ord.tracking;
  const [form, setForm] = useState({
    ordinance_number: t?.ordinance_number ?? "",
    introduction_date: t?.introduction_date ?? "",
    introduction_meeting: t?.introduction_meeting ?? "",
    pub_intro_date: t?.pub_intro_date ?? "",
    pub_intro_newspaper: t?.pub_intro_newspaper ?? "",
    bulletin_posted_date: t?.bulletin_posted_date ?? "",
    hearing_date: t?.hearing_date ?? "",
    hearing_amended: t?.hearing_amended ?? 0,
    hearing_notes: t?.hearing_notes ?? "",
    adoption_date: t?.adoption_date ?? "",
    adoption_vote: t?.adoption_vote ?? "",
    adoption_failed: t?.adoption_failed ?? 0,
    pub_final_date: t?.pub_final_date ?? "",
    pub_final_newspaper: t?.pub_final_newspaper ?? "",
    effective_date: t?.effective_date ?? "",
    is_emergency: t?.is_emergency ?? 0,
    website_posted_date: t?.website_posted_date ?? "",
    website_url: t?.website_url ?? "",
    clerk_notes: t?.clerk_notes ?? "",
  });
  const [dirty, setDirty] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = (key: string, val: string | number) => {
    setForm((prev) => ({ ...prev, [key]: val }));
    setDirty(true);
    // Debounce auto-save
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const updates: Record<string, string | number | null> = { [key]: val === "" ? null : val };
      onSave(updates);
      setDirty(false);
    }, 800);
  };

  // Validate: hearing must be ≥10 days after introduction
  const introDate = form.introduction_date ? new Date(form.introduction_date + "T12:00:00") : null;
  const hearingDate = form.hearing_date ? new Date(form.hearing_date + "T12:00:00") : null;
  const hearingTooSoon = introDate && hearingDate && (hearingDate.getTime() - introDate.getTime()) < 10 * 86400000;

  const fieldStyle = "w-full rounded border px-2.5 py-1.5 text-[12px] outline-none transition-colors focus:border-[#5E6AD2]";
  const labelStyle = "mb-1 block text-[11px] font-medium";

  return (
    <div className="space-y-6">
      {/* Ordinance Number */}
      <div className="max-w-xs">
        <label className={labelStyle} style={{ color: "#6B6F76" }}>Ordinance Number</label>
        <input
          type="text"
          value={form.ordinance_number}
          onChange={(e) => set("ordinance_number", e.target.value)}
          placeholder="O.2270-2026"
          className={fieldStyle}
          style={{ borderColor: "#E5E5E8", color: "#1D2024" }}
        />
      </div>

      {/* Stage 1: Introduction */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#5E6AD2" }}>1</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Introduction / First Reading</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Date Introduced</label>
            <input type="date" value={form.introduction_date} onChange={(e) => set("introduction_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Meeting</label>
            <input type="text" value={form.introduction_meeting} onChange={(e) => set("introduction_meeting", e.target.value)}
              placeholder="Regular Meeting 2/11/2026" className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
        </div>
      </div>

      {/* Stage 2: Publication after introduction */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#5E6AD2" }}>2</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Publication After Introduction</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Publication Date</label>
            <input type="date" value={form.pub_intro_date} onChange={(e) => set("pub_intro_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Newspaper</label>
            <input type="text" value={form.pub_intro_newspaper} onChange={(e) => set("pub_intro_newspaper", e.target.value)}
              placeholder="Home News Tribune" className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
        </div>
      </div>

      {/* Stage 3: Bulletin board */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#5E6AD2" }}>3</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Bulletin Board Posting</h4>
        </div>
        <div className="max-w-xs">
          <label className={labelStyle} style={{ color: "#6B6F76" }}>Date Posted</label>
          <input type="date" value={form.bulletin_posted_date} onChange={(e) => set("bulletin_posted_date", e.target.value)}
            className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
        </div>
      </div>

      {/* Stage 4: Public hearing */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#E59500" }}>4</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Public Hearing / Second Reading</h4>
          {hearingTooSoon && (
            <span className="rounded px-2 py-0.5 text-[10px] font-medium" style={{ background: "#FEF2F2", color: "#F2555A" }}>
              Must be ≥10 days after introduction
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Hearing Date</label>
            <input type="date" value={form.hearing_date} onChange={(e) => set("hearing_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: hearingTooSoon ? "#F2555A" : "#E5E5E8", color: "#1D2024" }} />
            {form.introduction_date && (
              <p className="mt-1 text-[10px]" style={{ color: "#9CA0AB" }}>
                Earliest allowed: {fmtDate((() => { const d = new Date(form.introduction_date + "T12:00:00"); d.setDate(d.getDate() + 10); return d.toISOString().split("T")[0]; })())}
              </p>
            )}
          </div>
          <div className="flex items-end gap-3">
            <label className="flex cursor-pointer items-center gap-2 pb-1.5">
              <input type="checkbox" checked={!!form.hearing_amended} onChange={(e) => set("hearing_amended", e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded" />
              <span className="text-[12px]" style={{ color: "#6B6F76" }}>Substantially amended (resets process)</span>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <label className={labelStyle} style={{ color: "#6B6F76" }}>Hearing Notes</label>
          <textarea value={form.hearing_notes} onChange={(e) => set("hearing_notes", e.target.value)}
            placeholder="Public comments, amendments discussed..." rows={2}
            className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
        </div>
      </div>

      {/* Stage 5: Adoption */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#26B5CE" }}>5</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Final Passage (Adoption)</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Adoption Date</label>
            <input type="date" value={form.adoption_date} onChange={(e) => set("adoption_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Vote Tally</label>
            <input type="text" value={form.adoption_vote} onChange={(e) => set("adoption_vote", e.target.value)}
              placeholder="7-0" className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={!!form.adoption_failed} onChange={(e) => set("adoption_failed", e.target.checked ? 1 : 0)}
            className="h-4 w-4 rounded" />
          <span className="text-[12px]" style={{ color: "#F2555A" }}>Failed to pass</span>
        </label>
      </div>

      {/* Stage 6: Publication after adoption */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#26B5CE" }}>6</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Publication After Adoption</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Publication Date</label>
            <input type="date" value={form.pub_final_date} onChange={(e) => set("pub_final_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Newspaper</label>
            <input type="text" value={form.pub_final_newspaper} onChange={(e) => set("pub_final_newspaper", e.target.value)}
              placeholder="Home News Tribune" className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
        </div>
      </div>

      {/* Stage 7: Effective date */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#16A34A" }}>7</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Effective Date</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Effective Date</label>
            <input type="date" value={form.effective_date} onChange={(e) => set("effective_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024", background: form.adoption_date ? "#F8F8F9" : "#fff" }} />
            {form.adoption_date && (
              <p className="mt-1 text-[10px]" style={{ color: "#9CA0AB" }}>
                Auto-calculated: {form.is_emergency ? "Immediate (emergency)" : "20 days after adoption"}
                {form.effective_date && ` — ${daysRelative(form.effective_date)}`}
              </p>
            )}
          </div>
          <div className="flex items-end pb-1.5">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={!!form.is_emergency} onChange={(e) => set("is_emergency", e.target.checked ? 1 : 0)}
                className="h-4 w-4 rounded" />
              <span className="text-[12px]" style={{ color: "#6B6F76" }}>Emergency ordinance (requires 2/3 vote)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Stage 8: Website posting */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "#16A34A" }}>8</span>
          <h4 className="text-[12px] font-semibold" style={{ color: "#1D2024" }}>Website Posting</h4>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>Date Posted</label>
            <input type="date" value={form.website_posted_date} onChange={(e) => set("website_posted_date", e.target.value)}
              className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
          <div>
            <label className={labelStyle} style={{ color: "#6B6F76" }}>URL</label>
            <input type="text" value={form.website_url} onChange={(e) => set("website_url", e.target.value)}
              placeholder="https://www.edisonnj.org/ordinances/..." className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
          </div>
        </div>
      </div>

      {/* Clerk notes */}
      <div>
        <label className={labelStyle} style={{ color: "#6B6F76" }}>Clerk Notes</label>
        <textarea value={form.clerk_notes} onChange={(e) => set("clerk_notes", e.target.value)}
          placeholder="Internal notes, reminders..." rows={2}
          className={fieldStyle} style={{ borderColor: "#E5E5E8", color: "#1D2024" }} />
      </div>

      {dirty && (
        <p className="text-[10px]" style={{ color: "#9CA0AB" }}>Saving...</p>
      )}
    </div>
  );
}

// --- Live Agenda ---

function LiveAgenda({
  entries,
  onAction,
  onRefresh,
}: {
  entries: DocketEntry[];
  onAction: (id: number, status: string) => void;
  onRefresh: () => void;
}) {
  const [trailEmailId, setTrailEmailId] = useState<string | null>(null);
  const [trailSubject, setTrailSubject] = useState("");
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [historySubject, setHistorySubject] = useState("");
  const saveOverride = useCallback(async (itemId: number, field: string, value: string | string[]) => {
    try {
      await fetch(`/api/docket-item?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_override: { [field]: value } }),
      });
      onRefresh();
    } catch (e) { console.error(e); }
  }, [onRefresh]);

  const revertField = useCallback(async (itemId: number, field: string) => {
    try {
      await fetch(`/api/docket-item?id=${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text_override: { [field]: null } }),
      });
      onRefresh();
    } catch (e) { console.error(e); }
  }, [onRefresh]);

  const accepted = useMemo(
    () => entries.filter((e) => e.status === "accepted" || e.status === "on_agenda"),
    [entries]
  );

  // Categorize items for Edison agenda structure
  const resolutions = useMemo(() => accepted.filter((e) => e.item_type?.startsWith("resolution_")), [accepted]);
  const ordinances = useMemo(() => accepted.filter((e) => e.item_type?.startsWith("ordinance_")), [accepted]);
  const discussionItems = useMemo(() => accepted.filter((e) =>
    e.item_type === "discussion_item" || e.item_type === "informational" || e.item_type === "other"
  ), [accepted]);

  const ws = nextWorkSession();
  const meetingDateFull = ws.date.toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  }).toUpperCase();
  const yr = String(ws.date.getFullYear()).slice(2);

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200/60 bg-white/90 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-800">Live Agenda</h2>
          <span className="tabular-nums text-xs text-slate-400">{accepted.length} items</span>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100"
        >
          Print / Export
        </button>
      </div>

      {/* Document */}
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="agenda-doc rounded-xl bg-white p-12 shadow-sm ring-1 ring-slate-200/60">
          {/* Header — Edison format */}
          <div className="mb-10 text-center">
            <h1 className="text-base font-bold uppercase tracking-widest text-slate-900">
              TOWNSHIP OF EDISON
            </h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-wide text-slate-800">
              COUNCIL MEETING AGENDA
            </p>
            <div className="mx-auto mt-3 h-px w-24 bg-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {meetingDateFull} &ndash; 7:00 pm
            </p>
          </div>

          {/* Empty state */}
          {accepted.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm italic text-slate-400">
                No items on the agenda. Accept items from the Review queue to populate this document.
              </p>
            </div>
          )}

          {/* Agenda sections — Edison format with full resolution text */}
          {accepted.length > 0 && (
            <div className="mt-8 space-y-10">
              {/* CONSENT AGENDA */}
              {resolutions.length > 0 && (
                <div>
                  <h2 className="mb-4 border-b-2 border-slate-800 pb-1 text-sm font-bold uppercase tracking-wider text-slate-800">
                    CONSENT AGENDA
                  </h2>
                  <p className="mb-6 text-[12px] italic leading-relaxed text-slate-500">
                    All items listed with an asterisk (*) are considered to be routine by the Township Council and will be enacted by one motion. There will be no separate discussion of these items unless a Council member so requests, in which event the item will be removed from the Consent Agenda and considered in its normal sequence on the agenda.
                  </p>
                  {resolutions.map((item, resIdx) => {
                    const fields = parseJson<ExtractedFields>(item.extracted_fields, {});
                    const comp = parseJson<CompletenessCheck>(item.completeness, {
                      needs_cfo_certification: false, needs_attorney_review: false,
                      missing_block_lot: false, missing_statutory_citation: false, notes: [],
                    });
                    const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
                    const hasOverride = Object.keys(override).length > 0;
                    const clause = generateClause(item.item_type!, fields, item.summary, comp);
                    const lineItems = Array.isArray(fields.line_items) ? fields.line_items as LineItem[] : [];
                    const letter = String.fromCharCode(97 + resIdx);
                    const resNum = `#${yr}-${resIdx + 1}`;

                    const genWhereas = clause.whereas.map((w, i, a) =>
                      `WHEREAS, ${w}${i < a.length - 1 ? "; and" : ";"}`
                    );
                    const whereas = override.whereas ?? genWhereas;
                    const genResolved = `NOW, THEREFORE, BE IT RESOLVED by the Township Council of the Township of Edison, County of Middlesex, State of New Jersey, that ${clause.resolved}; and`;
                    const resolved = override.resolved ?? genResolved;
                    const genFurther = [
                      "BE IT FURTHER RESOLVED that the aforementioned recitals are incorporated herein as though fully set forth at length; and",
                      `BE IT FURTHER RESOLVED that a certified copy of this Resolution shall be forwarded to ${clause.cfoNote ? "the Chief Financial Officer, " : ""}the Township Clerk, and any other interested parties.`,
                    ];
                    const further = override.further_resolved ?? genFurther;

                    return (
                      <div key={item.id} className="group relative mb-8 pl-6">
                        {/* Resolution header */}
                        <p className="mb-3 text-[13px] font-semibold text-slate-800">
                          {letter}. Resolution {resNum}
                          {hasOverride && (
                            <span className="no-print ml-2 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-500">edited</span>
                          )}
                        </p>

                        {/* Hover controls */}
                        <div className="no-print absolute -right-2 top-0 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                          <button onClick={() => { setTrailEmailId(item.email_id); setTrailSubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">Trail</button>
                          <button onClick={() => { setHistoryItemId(item.id); setHistorySubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">History</button>
                          <button onClick={() => onAction(item.id, "new")} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-red-500">Remove</button>
                        </div>

                        {/* WHEREAS clauses */}
                        <div className="group/whereas relative">
                          {whereas.map((para, wi) => (
                            <p key={wi} className="group/clause relative mb-2 text-[12px] leading-relaxed text-slate-600">
                              <InlineEdit
                                value={para}
                                onSave={(newText) => {
                                  const updated = [...whereas];
                                  updated[wi] = newText;
                                  saveOverride(item.id, "whereas", updated);
                                }}
                              />
                              {whereas.length > 1 && (
                                <button
                                  onClick={() => saveOverride(item.id, "whereas", whereas.filter((_, i) => i !== wi))}
                                  className="no-print absolute -right-5 top-0.5 text-slate-300 opacity-0 hover:text-red-400 group-hover/clause:opacity-100"
                                  title="Remove clause"
                                >
                                  <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" /></svg>
                                </button>
                              )}
                            </p>
                          ))}
                          <button
                            onClick={() => saveOverride(item.id, "whereas", [...whereas, "WHEREAS, ; and"])}
                            className="no-print absolute -bottom-1 left-0 text-[11px] text-slate-300 opacity-0 hover:text-indigo-500 group-hover/whereas:opacity-100"
                          >
                            + Add clause
                          </button>
                        </div>

                        {/* RESOLVED */}
                        <p className="mt-4 text-[12px] leading-relaxed text-slate-600">
                          <InlineEdit value={resolved} onSave={(newText) => saveOverride(item.id, "resolved", newText)} />
                        </p>

                        {/* FURTHER RESOLVED */}
                        {further.map((para, fi) => (
                          <p key={fi} className="mt-2 text-[12px] leading-relaxed text-slate-600">
                            <InlineEdit
                              value={para}
                              onSave={(newText) => {
                                const updated = [...further];
                                updated[fi] = newText;
                                saveOverride(item.id, "further_resolved", updated);
                              }}
                            />
                          </p>
                        ))}

                        {/* Disbursement table */}
                        {item.item_type === "resolution_disbursement" && lineItems.length > 0 && (() => {
                          const totalItem = lineItems.find((li) => /total/i.test(li.payee));
                          const fundItems = lineItems.filter((li) => !/total/i.test(li.payee));
                          return (
                            <div className="mt-6">
                              <p className="mb-1 text-center text-[12px] font-bold uppercase text-slate-700">Report of Disbursements</p>
                              <table className="mt-2 w-full border-collapse text-[11px]">
                                <thead><tr className="border-b border-slate-300"><th className="pb-1 text-left font-bold text-slate-700">Fund</th><th className="pb-1 text-right font-bold text-slate-700">Amount</th></tr></thead>
                                <tbody>
                                  {fundItems.map((li, liIdx) => (
                                    <tr key={liIdx}><td className="py-0.5 text-slate-600">{li.payee}</td><td className="py-0.5 text-right font-mono tabular-nums text-slate-600">{li.amount}</td></tr>
                                  ))}
                                </tbody>
                                <tfoot><tr className="border-t border-slate-300"><td className="pt-1 font-bold text-slate-800">Total</td><td className="pt-1 text-right font-mono font-bold tabular-nums text-slate-800">{totalItem?.amount ?? primaryAmount(fields) ?? "\u2014"}</td></tr></tfoot>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ORDINANCES */}
              {ordinances.length > 0 && (
                <div>
                  <h2 className="mb-4 border-b-2 border-slate-800 pb-1 text-sm font-bold uppercase tracking-wider text-slate-800">
                    FOR FURTHER CONSIDERATION AND PUBLIC HEARING OF ORDINANCES
                  </h2>
                  {ordinances.map((item) => {
                    const fields = parseJson<ExtractedFields>(item.extracted_fields, {});
                    const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
                    const hasOverride = Object.keys(override).length > 0;
                    const ordTitle = override.ordinance_title ?? generateOrdinanceTitle(item.item_type!, fields, item.summary);
                    return (
                      <div key={item.id} className="group relative mb-6 pl-6">
                        <p className="text-[12px] font-bold uppercase leading-relaxed text-slate-800">
                          <InlineEdit
                            value={ordTitle}
                            onSave={(newText) => saveOverride(item.id, "ordinance_title", newText)}
                            className="uppercase"
                          />
                          {hasOverride && (
                            <span className="no-print ml-2 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium normal-case text-indigo-500">edited</span>
                          )}
                        </p>
                        <div className="no-print absolute -right-2 top-0 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                          <button onClick={() => { setTrailEmailId(item.email_id); setTrailSubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">Trail</button>
                          <button onClick={() => { setHistoryItemId(item.id); setHistorySubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">History</button>
                          <button onClick={() => onAction(item.id, "new")} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-red-500">Remove</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* DISCUSSION ITEMS */}
              {discussionItems.length > 0 && (
                <div>
                  <h2 className="mb-4 border-b-2 border-slate-800 pb-1 text-sm font-bold uppercase tracking-wider text-slate-800">
                    DISCUSSION ITEMS
                  </h2>
                  {discussionItems.map((item, idx) => {
                    const override = parseJson<TextOverride>(item.text_override ?? "{}", {});
                    const hasOverride = Object.keys(override).length > 0;
                    return (
                      <div key={item.id} className="group relative mb-4 pl-6">
                        <p className="text-[12px] leading-relaxed text-slate-700">
                          <span className="mr-2 font-semibold">{idx + 1}.</span>
                          <InlineEdit
                            value={override.summary ?? item.summary ?? item.email_subject}
                            onSave={(newText) => saveOverride(item.id, "summary", newText)}
                          />
                          {hasOverride && (
                            <span className="no-print ml-1.5 inline-block rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-500">edited</span>
                          )}
                        </p>
                        <div className="no-print absolute -right-2 top-0 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                          <button onClick={() => { setTrailEmailId(item.email_id); setTrailSubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">Trail</button>
                          <button onClick={() => { setHistoryItemId(item.id); setHistorySubject(item.email_subject); }} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-indigo-500">History</button>
                          <button onClick={() => onAction(item.id, "new")} className="rounded px-2 py-0.5 text-[10px] text-slate-300 hover:text-red-500">Remove</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Clerk signature */}
          {accepted.length > 0 && (
            <div className="mt-16 text-right">
              <p className="text-[13px] font-medium uppercase text-slate-700">Cheryl Russomanno, RMC</p>
              <p className="text-[12px] text-slate-500">Township Clerk</p>
            </div>
          )}
        </div>
      </div>

      {/* Trail sidebar overlay */}
      {trailEmailId && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-sm" onClick={() => setTrailEmailId(null)} />
          <TrailSidebar emailId={trailEmailId} subject={trailSubject} onClose={() => setTrailEmailId(null)} />
        </>
      )}

      {/* History sidebar overlay */}
      {historyItemId && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-sm" onClick={() => setHistoryItemId(null)} />
          <HistorySidebar
            itemId={historyItemId}
            subject={historySubject}
            onClose={() => setHistoryItemId(null)}
            onRevert={(field) => { revertField(historyItemId, field); setHistoryItemId(null); }}
          />
        </>
      )}
    </div>
  );
}

// --- Detail Drawer ---

function DetailDrawer({
  entry,
  onClose,
  onAction,
}: {
  entry: DocketEntry;
  onClose: () => void;
  onAction: (id: number, status: string) => void;
}) {
  const fields = parseJson<ExtractedFields>(entry.extracted_fields, {});
  const comp = parseJson<CompletenessCheck>(entry.completeness, {
    needs_cfo_certification: false, needs_attorney_review: false,
    missing_block_lot: false, missing_statutory_citation: false, notes: [],
  });
  const attachments = parseJson<string[]>(entry.attachment_filenames, []);
  const nonNull = Object.entries(fields).filter(
    ([, v]) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
  );
  const meta = entry.item_type ? TYPE_META[entry.item_type] : null;
  const issues = completenessIssues(comp);
  const hasIssues = issues.length > 0;

  const flags = [
    { key: "cfo", label: "CFO Certification", on: comp.needs_cfo_certification },
    { key: "atty", label: "Attorney Review", on: comp.needs_attorney_review },
    { key: "blk", label: "Block/Lot", on: comp.missing_block_lot },
    { key: "cite", label: "Statutory Citation", on: comp.missing_statutory_citation },
  ];

  return (
    <div className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-slate-200/60 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/50 text-xs font-bold tracking-wider text-slate-400">
          {meta?.short ?? "—"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            {meta?.label ?? "Item"} {entry.department && `· ${entry.department}`}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold leading-snug text-slate-900">{entry.email_subject}</h2>
          <p className="mt-1 text-[11px] text-slate-400">
            {senderName(entry.email_from)} · {fullDate(entry.email_date)}
          </p>
        </div>
        <button onClick={onClose} className="glow-ring shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Summary */}
        <div className="border-b border-slate-200/60 p-5">
          <div className="rounded-xl bg-indigo-50/80 p-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-400">Summary</p>
            <p className="text-[13px] leading-relaxed text-indigo-900">{entry.summary}</p>
          </div>
        </div>

        {/* Extracted data */}
        {nonNull.length > 0 && (
          <div className="border-b border-slate-200/60 p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Extracted Data</p>
            <div className="space-y-2">
              {nonNull
                .filter(([key]) => key !== "line_items")
                .map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] text-slate-400">{formatKey(key)}</span>
                  <span className="text-right font-mono text-[11px] text-slate-700">
                    {Array.isArray(value) ? (value as string[]).join(", ") : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Disbursement line items — Report of Disbursements */}
        {Array.isArray(fields.line_items) && fields.line_items.length > 0 && (() => {
          const totalItem = fields.line_items.find((li) => /total/i.test(li.payee));
          const fundItems = fields.line_items.filter((li) => !/total/i.test(li.payee));
          return (
            <div className="border-b border-slate-200/60 p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Report of Disbursements
                <span className="ml-1.5 normal-case tracking-normal text-slate-300">{fundItems.length} funds</span>
              </p>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b-2 border-slate-300">
                      <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">Fund</th>
                      <th className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundItems.map((li, i) => (
                      <tr key={i}>
                        <td className="py-1 text-slate-600">{li.payee}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-slate-600">{li.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totalItem && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-300">
                        <td className="pt-2 text-[11px] font-bold text-slate-800">TOTAL</td>
                        <td className="pt-2 text-right font-mono text-[11px] font-bold tabular-nums text-slate-800">{totalItem.amount}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })()}

        {/* Completeness */}
        <div className="border-b border-slate-200/60 p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
            Completeness
            {hasIssues
              ? <span className="ml-1.5 normal-case tracking-normal text-amber-500">· {issues.length} issue{issues.length > 1 ? "s" : ""}</span>
              : <span className="ml-1.5 normal-case tracking-normal text-emerald-500">· Complete</span>
            }
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {flags.map((f) => (
              <div key={f.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${f.on ? "bg-amber-50" : "bg-slate-100/60"}`}>
                <span className={`text-[11px] ${f.on ? "text-amber-500" : "text-emerald-500"}`}>
                  {f.on ? "⚠" : "✓"}
                </span>
                <span className={`text-[11px] ${f.on ? "text-amber-700" : "text-slate-400"}`}>{f.label}</span>
              </div>
            ))}
          </div>
          {comp.notes?.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg bg-slate-100/60 p-3">
              {comp.notes.map((n, i) => (
                <p key={i} className="text-[11px] text-slate-500">· {n}</p>
              ))}
            </div>
          )}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-b border-slate-200/60 p-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Attachments <span className="text-slate-300">{attachments.length}</span>
            </p>
            <div className="space-y-1">
              {attachments.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-100/60 px-3 py-2 text-[11px] text-slate-500">
                  <span className="text-slate-300">◆</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Original email */}
        {entry.email_body_preview && (
          <div className="p-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Source Email</p>
            <div className="max-h-36 overflow-y-auto rounded-lg bg-slate-100/60 p-3 font-mono text-[11px] leading-relaxed text-slate-500 whitespace-pre-wrap">
              {entry.email_body_preview}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-t border-slate-200 bg-slate-100/60 p-4">
        <div className="flex gap-2">
          {entry.status !== "accepted" && entry.status !== "on_agenda" && (
            <button
              onClick={() => onAction(entry.id, "accepted")}
              className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Accept for Agenda
            </button>
          )}
          {entry.status !== "needs_info" && entry.status !== "accepted" && (
            <button
              onClick={() => onAction(entry.id, "needs_info")}
              className="flex-1 rounded-lg bg-amber-50 py-2.5 text-[13px] font-medium text-amber-700 transition-colors hover:bg-amber-100"
            >
              Flag for Info
            </button>
          )}
          {entry.status === "accepted" && (
            <button
              onClick={() => onAction(entry.id, "new")}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 py-2.5 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Remove from Agenda
            </button>
          )}
          {entry.status !== "rejected" && entry.status !== "accepted" && (
            <button
              onClick={() => onAction(entry.id, "rejected")}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main ---

export default function DashboardPage() {
  const [entries, setEntries] = useState<DocketEntry[]>([]);
  const [stats, setStats] = useState<DocketStats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("command");
  const [deptFilter, setDeptFilter] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const r = await fetch("/api/docket?stats=true&limit=200&relevant=true");
      const d = await r.json();
      setEntries(d.entries ?? []);
      if (d.stats) setStats(d.stats);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);
  useEffect(() => { const i = setInterval(fetch_, 60000); return () => clearInterval(i); }, [fetch_]);

  const doScan = async () => {
    setScanning(true); setScanMsg(null);
    try {
      const r = await fetch("/api/scan", { method: "POST" });
      const d: ScanResult = await r.json();
      if (r.ok) {
        setScanMsg(d.docket_entries_created > 0
          ? `+${d.docket_entries_created} new`
          : d.emails_found === 0 ? "Inbox empty" : "No agenda items");
        fetch_();
        setTimeout(() => setScanMsg(null), 6000);
      } else setScanMsg("Failed");
    } catch { setScanMsg("Error"); }
    finally { setScanning(false); }
  };

  const doAction = async (id: number, status: string) => {
    setEntries((p) => p.map((e) => (e.id === id ? { ...e, status } : e)));
    try {
      await fetch(`/api/docket-item?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      fetch_();
    } catch { fetch_(); }
  };

  const selected = entries.find((e) => e.id === selectedId) ?? null;

  const reviewQueue = useMemo(() => entries.filter((e) => e.status === "new" || e.status === "reviewed"), [entries]);
  const needsInfo = useMemo(() => entries.filter((e) => e.status === "needs_info"), [entries]);
  const accepted = useMemo(() => entries.filter((e) => e.status === "accepted" || e.status === "on_agenda"), [entries]);

  const viewFiltered = view === "review" ? reviewQueue
    : view === "agenda" ? accepted
    : view === "needs_info" ? needsInfo
    : entries;

  const display = deptFilter
    ? viewFiltered.filter((e) => e.department === deptFilter)
    : viewFiltered;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F8F8F9" }}>
      <Sidebar view={view} onViewChange={setView} stats={stats} deptFilter={deptFilter} onDeptFilter={setDeptFilter} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar stats={stats} scanning={scanning} scanMessage={scanMsg} onScan={doScan} />

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full" style={{ borderWidth: 2, borderStyle: "solid", borderRightColor: "#E5E5E8", borderBottomColor: "#E5E5E8", borderLeftColor: "#E5E5E8", borderTopColor: "#5E6AD2" }} />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: "#F0F0F2" }}>
              <span className="text-xl" style={{ color: "#9CA0AB" }}>◇</span>
            </div>
            <p className="text-sm font-medium" style={{ color: "#1D2024" }}>No items yet</p>
            <p className="mt-1 text-xs" style={{ color: "#9CA0AB" }}>Connect Gmail and scan your inbox to get started</p>
            <div className="mt-5 flex gap-2">
              <a href="/api/auth/gmail" className="rounded-md px-4 py-2 text-sm font-medium text-white transition" style={{ background: "#5E6AD2" }}>
                Connect Gmail
              </a>
              <button onClick={doScan} className="rounded-md px-4 py-2 text-sm transition" style={{ border: "1px solid #E5E5E8", color: "#6B6F76" }}>
                Scan Inbox
              </button>
            </div>
          </div>
        ) : view === "command" ? (
          <CommandCenter entries={entries} stats={stats} onViewChange={setView} onSelect={(id) => setSelectedId(id)} />
        ) : view === "live_agenda" ? (
          <LiveAgenda entries={entries} onAction={doAction} onRefresh={fetch_} />
        ) : view === "ordinances" ? (
          <OrdinancesView onSelect={(id) => setSelectedId(id)} />
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-slate-200/60 bg-white/90 px-5 py-3 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-800">
                      {view === "review" ? "Review Queue" : view === "agenda" ? "Accepted Items" : view === "needs_info" ? "Needs Information" : "All Items"}
                    </h2>
                    {deptFilter && (
                      <button
                        onClick={() => setDeptFilter(null)}
                        className="flex items-center gap-1 rounded-md bg-slate-200/60 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-200"
                      >
                        {deptFilter}
                        <span className="text-slate-400">×</span>
                      </button>
                    )}
                  </div>
                  <span className="tabular-nums text-xs text-slate-400">{display.length}</span>
                </div>
              </div>

              {display.length === 0 && view === "review" ? (
                <div className="flex flex-col items-center py-20">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                    <span className="text-sm text-emerald-500">✓</span>
                  </div>
                  <p className="text-sm font-medium text-slate-700">All caught up</p>
                  <p className="mt-1 text-[11px] text-slate-400">No items waiting for review</p>
                </div>
              ) : (
                <div className="bg-white">
                  {display.map((entry) => (
                    <ItemRow
                      key={entry.id}
                      entry={entry}
                      onSelect={() => setSelectedId(entry.id)}
                      onAction={doAction}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="hidden w-72 shrink-0 border-l border-slate-200/60 lg:block">
              <AgendaPanel entries={entries} onSelect={(id) => setSelectedId(id)} />
            </div>
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
          <DetailDrawer entry={selected} onClose={() => setSelectedId(null)} onAction={doAction} />
        </>
      )}
    </div>
  );
}
