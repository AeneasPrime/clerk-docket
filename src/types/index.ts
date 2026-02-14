export interface RawAttachment {
  filename: string;
  mimeType: string;
  size: number;
  data: Buffer;
}

export interface RawEmail {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  bodyText: string;
  bodyHtml: string;
  attachments: RawAttachment[];
}

export type ItemType =
  | "resolution_bid_award"
  | "resolution_professional_services"
  | "resolution_state_contract"
  | "resolution_tax_refund"
  | "resolution_tax_sale_redemption"
  | "resolution_bond_release"
  | "resolution_escrow_release"
  | "resolution_project_acceptance"
  | "resolution_license_renewal"
  | "resolution_grant"
  | "resolution_personnel"
  | "resolution_surplus_sale"
  | "resolution_fee_waiver"
  | "resolution_disbursement"
  | "ordinance_new"
  | "ordinance_amendment"
  | "discussion_item"
  | "informational"
  | "other";

export interface ExtractedFields {
  vendor_name?: string;
  vendor_address?: string;
  contract_amount?: string;
  bid_number?: string;
  state_contract_number?: string;
  account_number?: string;
  block_lot?: string;
  statutory_citation?: string;
  license_number?: string;
  licensee_name?: string;
  project_name?: string;
  bond_amount?: string;
  escrow_amount?: string;
  recommended_action?: string;
  dollar_amounts?: string[];
  line_items?: { payee: string; amount: string; description?: string }[];
  ordinance_number?: string;
  reading_stage?: "first" | "second";
  [key: string]: string | string[] | { payee: string; amount: string; description?: string }[] | undefined;
}

export interface CompletenessCheck {
  needs_cfo_certification: boolean;
  needs_attorney_review: boolean;
  missing_block_lot: boolean;
  missing_statutory_citation: boolean;
  notes: string[];
}

export interface ClassificationResult {
  relevant: boolean;
  confidence: "high" | "medium" | "low";
  item_type: ItemType | null;
  department: string | null;
  summary: string;
  extracted_fields: ExtractedFields;
  completeness: CompletenessCheck;
}

export type DocketStatus =
  | "new"
  | "reviewed"
  | "accepted"
  | "needs_info"
  | "rejected"
  | "on_agenda";

export interface DocketEntry {
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
  status: DocketStatus;
  notes: string;
  target_meeting_date: string | null;
  text_override: string | null;
  created_at: string;
  updated_at: string;
}

export interface TextOverride {
  whereas?: string[];
  resolved?: string;
  further_resolved?: string[];
  ordinance_title?: string;
  summary?: string;
}

export interface DocketHistoryEntry {
  id: number;
  docket_id: number;
  field_name: string;
  old_value: string;
  new_value: string;
  changed_at: string;
}

export interface OrdinanceTracking {
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
  created_at: string;
  updated_at: string;
}

export interface ScanResult {
  emails_found: number;
  emails_processed: number;
  emails_skipped: number;
  docket_entries_created: number;
  errors: string[];
}

// --- Meetings ---

export type MeetingType = "work_session" | "regular";
export type MeetingStatus = "upcoming" | "in_progress" | "completed";

export interface Meeting {
  id: number;
  meeting_type: MeetingType;
  meeting_date: string;
  cycle_date: string;
  video_url: string | null;
  minutes: string;
  status: MeetingStatus;
  created_at: string;
  updated_at: string;
}

export interface MeetingCycle {
  cycle_date: string;
  work_session: Meeting | null;
  regular_meeting: Meeting | null;
}

export interface MeetingWithAgenda extends Meeting {
  agenda_items: DocketEntry[];
}
