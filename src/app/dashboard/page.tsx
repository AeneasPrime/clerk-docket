"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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

// --- Sidebar ---

function Sidebar({ view, onViewChange, stats, deptFilter, onDeptFilter }: {
  view: string;
  onViewChange: (v: string) => void;
  stats: DocketStats | null;
  deptFilter: string | null;
  onDeptFilter: (dept: string | null) => void;
}) {
  const navItems = [
    { id: "review", label: "Review", count: stats?.new_count ?? 0 },
    { id: "agenda", label: "Agenda", count: stats?.accepted ?? 0 },
    { id: "live_agenda", label: "Live Agenda", count: stats?.accepted ?? 0 },
    { id: "all", label: "All Items", count: stats?.total ?? 0 },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-stone-50">
      {/* Logo */}
      <div className="px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-stone-800">Office of the Clerk</p>
        <p className="text-[10px] tracking-[0.2em] text-stone-400">Edison Township</p>
      </div>

      {/* Nav */}
      <nav className="mt-2 flex-1 px-3">
        <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-widest text-stone-400">Workflow</p>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              view === item.id
                ? "bg-stone-200/60 font-medium text-stone-900"
                : "text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            {item.label}
            {item.count > 0 && (
              <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
                view === item.id ? "bg-stone-300/50 text-stone-700" : "text-stone-400"
              }`}>
                {item.count}
              </span>
            )}
          </button>
        ))}

        {stats && (stats.needs_info ?? 0) > 0 && (
          <button
            onClick={() => onViewChange("needs_info")}
            className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
              view === "needs_info"
                ? "bg-stone-200/60 font-medium text-stone-900"
                : "text-stone-500 hover:bg-stone-100 hover:text-stone-700"
            }`}
          >
            Needs Info
            <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              {stats.needs_info}
            </span>
          </button>
        )}

        {stats && stats.by_department.length > 0 && (
          <>
            <p className="mb-2 mt-6 px-2 text-[10px] font-medium uppercase tracking-widest text-stone-400">Departments</p>
            {stats.by_department.slice(0, 6).map((d) => (
              <button
                key={d.department}
                onClick={() => onDeptFilter(deptFilter === d.department ? null : d.department)}
                className={`mb-0.5 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                  deptFilter === d.department
                    ? "bg-stone-200/60 font-medium text-stone-700"
                    : "text-stone-400 hover:bg-stone-100 hover:text-stone-600"
                }`}
              >
                <span className="truncate">{d.department}</span>
                <span className={`tabular-nums ${deptFilter === d.department ? "text-stone-500" : "text-stone-300"}`}>{d.count}</span>
              </button>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-stone-200/60 px-4 py-3">
        <a href="/api/auth/gmail" className="block text-[11px] text-stone-400 transition-colors hover:text-stone-600">
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
    <div className="border-b border-stone-200 bg-stone-50 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-stone-400">Next Work Session</p>
            <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-900">
              {ws.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              <span className={`ml-2 text-sm font-normal ${ws.days <= 2 ? "text-red-500" : ws.days <= 5 ? "text-amber-500" : "text-stone-400"}`}>
                {ws.days === 0 ? "Today" : ws.days === 1 ? "Tomorrow" : `in ${ws.days}d`}
              </span>
            </p>
          </div>

          <div className="flex gap-6">
            {[
              { label: "Review", value: stats?.new_count ?? 0, color: "text-blue-600" },
              { label: "Accepted", value: stats?.accepted ?? 0, color: "text-emerald-600" },
              { label: "Flagged", value: stats?.needs_info ?? 0, color: "text-red-500" },
            ].map((s) => (
              <div key={s.label}>
                <p className={`text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-stone-400">{s.label}</p>
              </div>
            ))}
          </div>

          {total > 0 && (
            <div className="flex items-center gap-3">
              <div className="h-1.5 w-32 overflow-hidden rounded-full bg-stone-200/60">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs tabular-nums text-stone-400">{pct}%</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {scanMessage && (
            <span className="animate-fade-in text-xs text-stone-500">{scanMessage}</span>
          )}
          <button
            onClick={onScan}
            disabled={scanning}
            className="glow-ring flex items-center gap-2 rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-stone-700 disabled:opacity-50"
          >
            {scanning && (
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-stone-500 border-t-white" />
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
      className="group flex cursor-pointer items-start gap-4 border-b border-stone-100 px-5 py-4 transition-colors hover:bg-stone-100/50"
      onClick={onSelect}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-200/50 text-[11px] font-bold tracking-wider text-stone-400">
        {meta?.short ?? "—"}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[13px] font-medium text-stone-800">
            {entry.summary || entry.email_subject}
          </p>
          {amount && (
            <span className="shrink-0 font-mono text-xs font-medium text-emerald-600">{amount}</span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-400">
          {entry.department && <span className="font-medium text-stone-500">{entry.department}</span>}
          {entry.department && <span className="text-stone-300">·</span>}
          <span>{senderName(entry.email_from)}</span>
          <span className="text-stone-300">·</span>
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
              className="rounded-md px-2.5 py-1 text-[11px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
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
          <span className="text-[10px] text-stone-300">Dismissed</span>
        )}
      </div>

      <div className="flex shrink-0 items-center pt-1 group-hover:hidden">
        {entry.status === "new" && <div className="h-2 w-2 rounded-full bg-blue-500" />}
        {entry.status === "reviewed" && <div className="h-2 w-2 rounded-full bg-yellow-500" />}
        {entry.status === "accepted" && <div className="h-2 w-2 rounded-full bg-emerald-500" />}
        {entry.status === "needs_info" && <div className="h-2 w-2 rounded-full bg-red-500" />}
        {entry.status === "rejected" && <div className="h-2 w-2 rounded-full bg-stone-300" />}
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
    <div className="h-full overflow-y-auto bg-stone-50">
      <div className="px-5 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-stone-900">Draft Agenda</h2>
          <span className="tabular-nums text-xs text-stone-400">{accepted.length} items</span>
        </div>
      </div>

      {accepted.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <p className="text-xs text-stone-400">Accept items to build the agenda</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {grouped.map((group) => (
            <div key={group.label} className="mb-4">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">{group.label}</p>
              {group.items.map((item, i) => {
                const fields = parseJson<ExtractedFields>(item.extracted_fields, {});
                const amount = primaryAmount(fields);
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                    className="mb-1 flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-stone-100/50"
                  >
                    <span className="mt-px text-[10px] tabular-nums text-stone-300">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] leading-snug text-stone-600">{item.summary || item.email_subject}</p>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-stone-400">
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
        whereas: [summary ?? "a matter has been presented to the Municipal Council for consideration and action"],
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
    return `AN ORDINANCE OF THE TOWNSHIP OF EDISON, IN THE COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, AMENDING ${project ? `THE REVISED GENERAL ORDINANCES OF THE TOWNSHIP OF EDISON WITH RESPECT TO ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "THE REVISED GENERAL ORDINANCES")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
  }
  return `AN ORDINANCE OF THE TOWNSHIP OF EDISON, IN THE COUNTY OF MIDDLESEX, STATE OF NEW JERSEY, ${project ? `ESTABLISHING ${project.toUpperCase()}` : (summary?.toUpperCase() ?? "PROVIDING FOR THE GENERAL WELFARE")}${citation ? ` (${citation.toUpperCase()})` : ""}`;
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
    <div className="animate-slide-in no-print fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-stone-200 bg-[#faf8f5] shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-stone-200/60 p-5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">Email Trail</p>
          <h2 className="mt-1 text-[14px] font-semibold leading-snug text-stone-900">{subject}</h2>
        </div>
        <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
          </div>
        )}

        {error && (
          <div className="p-5">
            <div className="rounded-lg bg-red-50 p-4 text-[12px] text-red-600">{error}</div>
          </div>
        )}

        {!loading && !error && messages.length === 0 && (
          <div className="p-5 text-center text-[12px] text-stone-400">No messages found in this thread.</div>
        )}

        {!loading && !error && messages.length > 0 && (
          <div className="p-4">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
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
                        : "border-stone-200/60 bg-white"
                    }`}
                  >
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                      className="flex w-full items-start gap-3 p-3.5 text-left"
                    >
                      {/* Message number */}
                      <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        isSource ? "bg-indigo-200 text-indigo-700" : "bg-stone-200/60 text-stone-400"
                      }`}>
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-[12px] font-medium text-stone-800">{fromName}</p>
                          <span className="shrink-0 text-[10px] text-stone-400">{dateStr}</span>
                        </div>
                        {!isExpanded && (
                          <p className="mt-0.5 truncate text-[11px] text-stone-400">
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
                      <div className="border-t border-stone-200/40 px-3.5 pb-3.5 pt-3">
                        <div className="mb-2 space-y-0.5 text-[10px] text-stone-400">
                          <p><span className="font-medium text-stone-500">From:</span> {msg.from}</p>
                          <p><span className="font-medium text-stone-500">To:</span> {msg.to}</p>
                          {msg.subject && <p><span className="font-medium text-stone-500">Subject:</span> {msg.subject}</p>}
                        </div>
                        <div className="max-h-64 overflow-y-auto rounded-lg bg-stone-100/60 p-3 font-mono text-[11px] leading-relaxed text-stone-600 whitespace-pre-wrap">
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

function LiveAgenda({
  entries,
  onAction,
}: {
  entries: DocketEntry[];
  onAction: (id: number, status: string) => void;
}) {
  const [trailEmailId, setTrailEmailId] = useState<string | null>(null);
  const [trailSubject, setTrailSubject] = useState("");

  const accepted = useMemo(
    () => entries.filter((e) => e.status === "accepted" || e.status === "on_agenda"),
    [entries]
  );

  const grouped = useMemo(
    () => AGENDA_SECTIONS
      .map((s) => ({ ...s, items: accepted.filter((e) => s.types.has(e.item_type ?? "")) }))
      .filter((g) => g.items.length > 0),
    [accepted]
  );

  const ws = nextWorkSession();
  const meetingDate = ws.date.toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div className="flex-1 overflow-y-auto bg-[#f5f3ef]">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-stone-200/60 bg-[#faf8f5]/90 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-stone-800">Live Agenda</h2>
          <span className="tabular-nums text-xs text-stone-400">{accepted.length} items</span>
        </div>
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100"
        >
          Print / Export
        </button>
      </div>

      {/* Document */}
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="agenda-doc rounded-xl bg-white p-12 shadow-sm ring-1 ring-stone-200/60">
          {/* Header */}
          <div className="mb-10 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-stone-800">
              AGENDA
            </p>
            <h1 className="mt-2 text-xl font-bold tracking-wide text-stone-900">
              MUNICIPAL COUNCIL
            </h1>
            <p className="mt-1 text-base font-bold text-stone-900">
              REGULAR MEETING
            </p>
            <div className="mx-auto mt-3 h-px w-24 bg-stone-300" />
            <p className="mt-3 text-sm text-stone-600">{meetingDate}</p>
            <p className="mt-1 text-xs text-stone-500">7:00 P.M.</p>
            <p className="mt-3 text-[11px] uppercase tracking-widest text-stone-400">
              Municipal Council Chambers &mdash; Edison Municipal Complex
            </p>
          </div>

          {/* Empty state */}
          {accepted.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm italic text-stone-400">
                No items on the agenda. Accept items from the Review queue to populate this document.
              </p>
            </div>
          )}

          {/* Sections */}
          {grouped.map((section, sectionIdx) => {
            const now = new Date();
            const monthYear = `${String(now.getMonth() + 1).padStart(2, "0")}${now.getFullYear()}`;

            return (
              <div key={section.label} className={sectionIdx > 0 ? "mt-10" : ""}>
                <div className="mb-6 border-b-2 border-stone-800 pb-2">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-stone-800">
                    {SECTION_HEADERS[section.label] ?? section.label}
                  </h2>
                </div>

                {/* Consent agenda note */}
                {section.label === "Resolutions" && (
                  <p className="mb-6 text-[12px] italic leading-relaxed text-stone-500">
                    All items listed under the Consent Agenda are considered to be routine by the Municipal Council and will be enacted by one motion in the form listed. There will be no separate discussion of these items. If discussion is desired, that item will be removed from the Consent Agenda and will be considered separately.
                  </p>
                )}

                {section.items.map((item, itemIdx) => {
                  const fields = parseJson<ExtractedFields>(item.extracted_fields, {});
                  const comp = parseJson<CompletenessCheck>(item.completeness, {
                    needs_cfo_certification: false, needs_attorney_review: false,
                    missing_block_lot: false, missing_statutory_citation: false, notes: [],
                  });
                  const issues = completenessIssues(comp);
                  const isResolution = item.item_type?.startsWith("resolution_");
                  const isOrdinance = item.item_type?.startsWith("ordinance_");

                  // Resolution numbering: R.XXX-MMYYYY (e.g. R.360-062024)
                  // Use a base number + item index for sequential numbering
                  const resolutionNum = isResolution
                    ? `R.${String(300 + itemIdx + 1).padStart(3, "0")}-${monthYear}`
                    : null;

                  return (
                    <div key={item.id} className="group relative mb-8">
                      {/* Item number + type + department */}
                      <div className="mb-2 flex items-center gap-3">
                        {resolutionNum && (
                          <span className="mono-num text-xs font-bold text-stone-500">{resolutionNum}</span>
                        )}
                        {!isResolution && (
                          <span className="mono-num text-xs font-bold text-stone-400">
                            {String(itemIdx + 1).padStart(2, "0")}
                          </span>
                        )}
                        <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-stone-500">
                          {TYPE_META[item.item_type ?? ""]?.label ?? "Item"}
                        </span>
                        {item.department && (
                          <span className="text-[10px] text-stone-400">{item.department}</span>
                        )}
                        <div className="no-print ml-auto flex gap-1 opacity-0 transition-all group-hover:opacity-100">
                          <button
                            onClick={() => { setTrailEmailId(item.email_id); setTrailSubject(item.email_subject); }}
                            className="rounded px-2 py-0.5 text-[10px] text-stone-300 transition-all hover:bg-indigo-50 hover:text-indigo-500"
                          >
                            Trail
                          </button>
                          <button
                            onClick={() => onAction(item.id, "new")}
                            className="rounded px-2 py-0.5 text-[10px] text-stone-300 transition-all hover:bg-red-50 hover:text-red-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>

                      {/* Completeness warnings */}
                      {issues.length > 0 && (
                        <div className="no-print mb-3 flex flex-wrap gap-2">
                          {comp.needs_cfo_certification && (
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600">Pending CFO Certification</span>
                          )}
                          {comp.needs_attorney_review && (
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600">Pending Attorney Review</span>
                          )}
                          {comp.missing_block_lot && (
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600">Missing Block/Lot</span>
                          )}
                          {comp.missing_statutory_citation && (
                            <span className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-600">Missing Statutory Citation</span>
                          )}
                        </div>
                      )}

                      {/* Resolution clause */}
                      {isResolution && (() => {
                        const clause = generateClause(item.item_type!, fields, item.summary, comp);
                        const lineItems = Array.isArray(fields.line_items) ? fields.line_items as LineItem[] : [];
                        return (
                          <div className="pl-6">
                            {clause.whereas.map((w, wi) => (
                              <p key={wi} className="mb-2 text-[13px] leading-relaxed text-stone-700">
                                <span className="font-bold">WHEREAS, </span>
                                {w}
                                {wi < clause.whereas.length - 1 ? "; and" : ";"}
                              </p>
                            ))}
                            <p className="mt-4 text-[13px] leading-relaxed text-stone-700">
                              <span className="font-bold">NOW, THEREFORE, BE IT RESOLVED </span>
                              by the Municipal Council of the Township of Edison, County of Middlesex, State of New Jersey, that {clause.resolved}; and
                            </p>
                            <p className="mt-2 text-[13px] leading-relaxed text-stone-700">
                              <span className="font-bold">BE IT FURTHER RESOLVED </span>
                              that the aforementioned recitals are incorporated herein as though fully set forth at length; and
                            </p>
                            <p className="mt-2 text-[13px] leading-relaxed text-stone-700">
                              <span className="font-bold">BE IT FURTHER RESOLVED </span>
                              that a certified copy of this Resolution shall be forwarded to {clause.cfoNote ? "the Chief Financial Officer, " : ""}the Township Clerk, and any other interested parties.
                            </p>

                            {/* Disbursement line items — Edison Township "Report of Disbursements" format */}
                            {item.item_type === "resolution_disbursement" && lineItems.length > 0 && (() => {
                              const totalItem = lineItems.find((li) => /total/i.test(li.payee));
                              const fundItems = lineItems.filter((li) => !/total/i.test(li.payee));
                              return (
                                <div className="mt-8">
                                  <p className="mb-1 text-center text-[13px] font-bold uppercase tracking-wide text-stone-800">
                                    Report of Disbursements
                                  </p>
                                  <p className="mb-4 text-center text-[12px] text-stone-500">
                                    For the Period Ending {new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                                  </p>
                                  <table className="w-full border-collapse text-[12.5px]">
                                    <thead>
                                      <tr className="border-b-2 border-stone-800">
                                        <th className="pb-1.5 text-left font-bold uppercase text-stone-800">Fund</th>
                                        <th className="pb-1.5 text-right font-bold uppercase text-stone-800">Amount</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {fundItems.map((li, liIdx) => (
                                        <tr key={liIdx}>
                                          <td className="py-1 text-stone-700">{li.payee}</td>
                                          <td className="py-1 text-right font-mono tabular-nums text-stone-700">{li.amount}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t-2 border-stone-800">
                                        <td className="pt-2 font-bold uppercase text-stone-900">Total</td>
                                        <td className="pt-2 text-right font-mono font-bold tabular-nums text-stone-900">
                                          {totalItem?.amount ?? primaryAmount(fields) ?? "—"}
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })()}

                      {/* Ordinance */}
                      {isOrdinance && (
                        <div className="pl-6">
                          <p className="text-[13px] font-bold uppercase leading-relaxed tracking-wide text-stone-800">
                            {generateOrdinanceTitle(item.item_type!, fields, item.summary)}
                          </p>
                          {item.summary && (
                            <p className="mt-2 text-[13px] italic leading-relaxed text-stone-600">
                              {item.summary}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Discussion / Other */}
                      {!isResolution && !isOrdinance && (
                        <div className="pl-6">
                          <p className="text-[13px] leading-relaxed text-stone-700">
                            {item.summary || item.email_subject}
                          </p>
                          {typeof fields.recommended_action === "string" && (
                            <p className="mt-1 text-[12px] italic text-stone-500">
                              Recommended action: {fields.recommended_action}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Separator */}
                      {itemIdx < section.items.length - 1 && (
                        <div className="mt-6 border-b border-stone-200/50" />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Footer */}
          {accepted.length > 0 && (
            <div className="mt-12 border-t border-stone-300 pt-6 text-center">
              <p className="text-[11px] uppercase tracking-widest text-stone-400">End of Agenda</p>
              <p className="mt-1 text-[10px] text-stone-300">
                {accepted.length} item{accepted.length !== 1 ? "s" : ""} total
                {" \u00B7 "}
                Generated {new Date().toLocaleDateString("en-US", {
                  month: "long", day: "numeric", year: "numeric",
                  hour: "numeric", minute: "2-digit",
                })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Trail sidebar overlay */}
      {trailEmailId && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-stone-900/15 backdrop-blur-sm" onClick={() => setTrailEmailId(null)} />
          <TrailSidebar emailId={trailEmailId} subject={trailSubject} onClose={() => setTrailEmailId(null)} />
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
    <div className="animate-slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-stone-200 bg-[#faf8f5] shadow-2xl">
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-stone-200/60 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-200/50 text-xs font-bold tracking-wider text-stone-400">
          {meta?.short ?? "—"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            {meta?.label ?? "Item"} {entry.department && `· ${entry.department}`}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold leading-snug text-stone-900">{entry.email_subject}</h2>
          <p className="mt-1 text-[11px] text-stone-400">
            {senderName(entry.email_from)} · {fullDate(entry.email_date)}
          </p>
        </div>
        <button onClick={onClose} className="glow-ring shrink-0 rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 4L4 12M4 4l8 8"/></svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* AI Summary */}
        <div className="border-b border-stone-200/60 p-5">
          <div className="rounded-xl bg-indigo-50/80 p-4">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-indigo-400">Summary</p>
            <p className="text-[13px] leading-relaxed text-indigo-900">{entry.summary}</p>
          </div>
        </div>

        {/* Extracted data */}
        {nonNull.length > 0 && (
          <div className="border-b border-stone-200/60 p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Extracted Data</p>
            <div className="space-y-2">
              {nonNull
                .filter(([key]) => key !== "line_items")
                .map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-4">
                  <span className="text-[11px] text-stone-400">{formatKey(key)}</span>
                  <span className="text-right font-mono text-[11px] text-stone-700">
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
            <div className="border-b border-stone-200/60 p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
                Report of Disbursements
                <span className="ml-1.5 normal-case tracking-normal text-stone-300">{fundItems.length} funds</span>
              </p>
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b-2 border-stone-300">
                      <th className="pb-1 text-left text-[10px] font-semibold uppercase tracking-wider text-stone-500">Fund</th>
                      <th className="pb-1 text-right text-[10px] font-semibold uppercase tracking-wider text-stone-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fundItems.map((li, i) => (
                      <tr key={i}>
                        <td className="py-1 text-stone-600">{li.payee}</td>
                        <td className="py-1 text-right font-mono tabular-nums text-stone-600">{li.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                  {totalItem && (
                    <tfoot>
                      <tr className="border-t-2 border-stone-300">
                        <td className="pt-2 text-[11px] font-bold text-stone-800">TOTAL</td>
                        <td className="pt-2 text-right font-mono text-[11px] font-bold tabular-nums text-stone-800">{totalItem.amount}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        })()}

        {/* Completeness */}
        <div className="border-b border-stone-200/60 p-5">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Completeness
            {hasIssues
              ? <span className="ml-1.5 normal-case tracking-normal text-amber-500">· {issues.length} issue{issues.length > 1 ? "s" : ""}</span>
              : <span className="ml-1.5 normal-case tracking-normal text-emerald-500">· Complete</span>
            }
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {flags.map((f) => (
              <div key={f.key} className={`flex items-center gap-2 rounded-lg px-3 py-2 ${f.on ? "bg-amber-50" : "bg-stone-100/60"}`}>
                <span className={`text-[11px] ${f.on ? "text-amber-500" : "text-emerald-500"}`}>
                  {f.on ? "⚠" : "✓"}
                </span>
                <span className={`text-[11px] ${f.on ? "text-amber-700" : "text-stone-400"}`}>{f.label}</span>
              </div>
            ))}
          </div>
          {comp.notes.length > 0 && (
            <div className="mt-3 space-y-1 rounded-lg bg-stone-100/60 p-3">
              {comp.notes.map((n, i) => (
                <p key={i} className="text-[11px] text-stone-500">· {n}</p>
              ))}
            </div>
          )}
        </div>

        {/* Attachments */}
        {attachments.length > 0 && (
          <div className="border-b border-stone-200/60 p-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Attachments <span className="text-stone-300">{attachments.length}</span>
            </p>
            <div className="space-y-1">
              {attachments.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-stone-100/60 px-3 py-2 text-[11px] text-stone-500">
                  <span className="text-stone-300">◆</span>
                  {f}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Original email */}
        {entry.email_body_preview && (
          <div className="p-5">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Source Email</p>
            <div className="max-h-36 overflow-y-auto rounded-lg bg-stone-100/60 p-3 font-mono text-[11px] leading-relaxed text-stone-500 whitespace-pre-wrap">
              {entry.email_body_preview}
            </div>
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="border-t border-stone-200 bg-stone-100/60 p-4">
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
              className="flex-1 rounded-lg border border-stone-200 bg-stone-50 py-2.5 text-[13px] font-medium text-stone-600 transition-colors hover:bg-stone-100"
            >
              Remove from Agenda
            </button>
          )}
          {entry.status !== "rejected" && entry.status !== "accepted" && (
            <button
              onClick={() => onAction(entry.id, "rejected")}
              className="rounded-lg border border-stone-200 bg-stone-50 px-4 py-2.5 text-[13px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
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
  const [view, setView] = useState("review");
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
    <div className="flex h-screen overflow-hidden bg-[#f5f3ef]">
      <Sidebar view={view} onViewChange={setView} stats={stats} deptFilter={deptFilter} onDeptFilter={setDeptFilter} />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar stats={stats} scanning={scanning} scanMessage={scanMsg} onScan={doScan} />

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-500" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-200/50">
              <span className="text-xl text-stone-400">◇</span>
            </div>
            <p className="text-sm font-medium text-stone-700">No items yet</p>
            <p className="mt-1 text-xs text-stone-400">Connect Gmail and scan your inbox to get started</p>
            <div className="mt-5 flex gap-2">
              <a href="/api/auth/gmail" className="glow-ring rounded-lg bg-stone-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700">
                Connect Gmail
              </a>
              <button onClick={doScan} className="glow-ring rounded-lg border border-stone-200 bg-stone-50 px-4 py-2 text-sm text-stone-600 transition hover:bg-stone-100">
                Scan Inbox
              </button>
            </div>
          </div>
        ) : view === "live_agenda" ? (
          <LiveAgenda entries={entries} onAction={doAction} />
        ) : (
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="sticky top-0 z-10 border-b border-stone-200/60 bg-[#faf8f5]/90 px-5 py-3 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-stone-800">
                      {view === "review" ? "Review Queue" : view === "agenda" ? "Accepted Items" : view === "needs_info" ? "Needs Information" : "All Items"}
                    </h2>
                    {deptFilter && (
                      <button
                        onClick={() => setDeptFilter(null)}
                        className="flex items-center gap-1 rounded-md bg-stone-200/60 px-2 py-0.5 text-[11px] font-medium text-stone-600 transition-colors hover:bg-stone-200"
                      >
                        {deptFilter}
                        <span className="text-stone-400">×</span>
                      </button>
                    )}
                  </div>
                  <span className="tabular-nums text-xs text-stone-400">{display.length}</span>
                </div>
              </div>

              {display.length === 0 && view === "review" ? (
                <div className="flex flex-col items-center py-20">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50">
                    <span className="text-sm text-emerald-500">✓</span>
                  </div>
                  <p className="text-sm font-medium text-stone-700">All caught up</p>
                  <p className="mt-1 text-[11px] text-stone-400">No items waiting for review</p>
                </div>
              ) : (
                <div className="bg-[#faf8f5]">
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

            <div className="hidden w-72 shrink-0 border-l border-stone-200/60 lg:block">
              <AgendaPanel entries={entries} onSelect={(id) => setSelectedId(id)} />
            </div>
          </div>
        )}
      </div>

      {selected && (
        <>
          <div className="animate-fade-in fixed inset-0 z-40 bg-stone-900/15 backdrop-blur-sm" onClick={() => setSelectedId(null)} />
          <DetailDrawer entry={selected} onClose={() => setSelectedId(null)} onAction={doAction} />
        </>
      )}
    </div>
  );
}
