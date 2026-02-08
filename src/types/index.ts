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
