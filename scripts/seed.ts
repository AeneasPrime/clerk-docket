/**
 * Seed script: inserts realistic test docket entries into the database.
 * Run with: npx tsx scripts/seed.ts
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dbPath = process.env.DATABASE_PATH || "./data/docket.db";
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Ensure tables exist
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
`);

const insert = db.prepare(`
  INSERT OR IGNORE INTO docket (
    email_id, email_from, email_subject, email_date, email_body_preview,
    relevant, confidence, item_type, department, summary,
    extracted_fields, completeness, attachment_filenames, status
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const entries = [
  {
    email_id: "test-001",
    from: "Robert Chen <rchen@edison.nj.us>",
    subject: "Resolution for Bid Award - Oak Tree Road Resurfacing Project",
    date: "Mon, 3 Feb 2026 09:15:00 -0500",
    preview: "Please find attached the recommendation to award Bid #2026-015 for the resurfacing of Oak Tree Road (Section 3) to Della Pello Paving, Inc., 42 Industrial Parkway, South Plainfield, NJ 08080, in the amount of $347,500.00 pursuant to N.J.S.A. 40A:11-1 et seq. The CFO certification is attached. Account: C-04-55-901-002.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Engineering",
    summary: "Recommendation to award Bid #2026-015 for Oak Tree Road resurfacing to Della Pello Paving for $347,500. CFO certification and bid tabulation attached.",
    extracted_fields: JSON.stringify({
      vendor_name: "Della Pello Paving, Inc.",
      vendor_address: "42 Industrial Parkway, South Plainfield, NJ 08080",
      contract_amount: "$347,500.00",
      bid_number: "2026-015",
      account_number: "C-04-55-901-002",
      project_name: "Oak Tree Road Resurfacing (Section 3)",
      statutory_citation: "N.J.S.A. 40A:11-1 et seq.",
      dollar_amounts: ["$347,500.00"],
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: true,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: ["CFO certification indicated as attached"],
    }),
    attachments: JSON.stringify(["Bid_Tabulation_2026-015.pdf", "CFO_Cert_OakTree.pdf", "Engineer_Recommendation.pdf"]),
    status: "new",
  },
  {
    email_id: "test-002",
    from: "Maria Santos <msantos@edison.nj.us>",
    subject: "Tax Overpayment Refunds - January 2026 Batch",
    date: "Tue, 4 Feb 2026 10:30:00 -0500",
    preview: "Attached is the list of tax overpayment refunds for Council approval. Total refund amount: $14,280.50 across 8 properties. Block 382, Lot 12 - $3,200.00 (duplicate payment); Block 156.01, Lot 45 - $1,890.50 (assessment reduction); Block 421, Lot 8 - $2,150.00 (exemption applied retroactively)...",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_tax_refund",
    department: "Tax Collection",
    summary: "Batch of 8 tax overpayment refunds totaling $14,280.50 for Council approval. Includes duplicate payments, assessment reductions, and retroactive exemptions.",
    extracted_fields: JSON.stringify({
      block_lot: "Multiple: 382/12, 156.01/45, 421/8, and 5 others",
      dollar_amounts: ["$14,280.50", "$3,200.00", "$1,890.50", "$2,150.00"],
      recommended_action: "Approve refunds",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: true,
      notes: ["Missing N.J.S.A. citation for tax refund authority", "CFO certification needed for refund batch"],
    }),
    attachments: JSON.stringify(["Tax_Refund_List_Jan2026.xlsx"]),
    status: "new",
  },
  {
    email_id: "test-003",
    from: "James Walsh <jwalsh@edison.nj.us>",
    subject: "Professional Services Contract - Environmental Consulting for Raritan Center",
    date: "Tue, 4 Feb 2026 14:22:00 -0500",
    preview: "Requesting Council approval for a professional services contract with Langan Engineering, 300 Kimball Drive, Parsippany, NJ 07054, for environmental site assessment and remediation oversight at the former Raritan Center industrial parcel. Contract not to exceed $125,000.00 pursuant to N.J.S.A. 40A:11-5.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_professional_services",
    department: "Administration",
    summary: "Professional services contract with Langan Engineering for environmental assessment at Raritan Center, NTE $125,000 under fair and open process.",
    extracted_fields: JSON.stringify({
      vendor_name: "Langan Engineering",
      vendor_address: "300 Kimball Drive, Parsippany, NJ 07054",
      contract_amount: "$125,000.00",
      project_name: "Raritan Center Environmental Site Assessment",
      statutory_citation: "N.J.S.A. 40A:11-5",
      block_lot: "Block 394, Lots 1-15",
      dollar_amounts: ["$125,000.00"],
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: true,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: ["Requires attorney review of contract terms", "Fair and open process documentation should be verified"],
    }),
    attachments: JSON.stringify(["Langan_Proposal.pdf", "RFQ_Environmental_2026.pdf"]),
    status: "reviewed",
  },
  {
    email_id: "test-004",
    from: "Council Member Patricia Rodriguez <prodriguez@edison.nj.us>",
    subject: "Work Session Discussion Topics - February 10",
    date: "Wed, 5 Feb 2026 08:45:00 -0500",
    preview: "I would like to have the following items discussed at the February 10 Work Session:\n1. Status update on the new community center construction timeline\n2. Traffic calming measures for Plainfield Avenue near JP Stevens HS\n3. Update on the Rt. 1 corridor redevelopment plan\n4. Review of the municipal parking lot fee structure",
    relevant: 1,
    confidence: "high",
    item_type: "discussion_item",
    department: "Council",
    summary: "Council Member Rodriguez requests four discussion topics for Feb 10 Work Session: community center update, Plainfield Ave traffic calming, Rt. 1 redevelopment, and parking fee review.",
    extracted_fields: JSON.stringify({
      recommended_action: "Add to Work Session agenda",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: false,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: [],
    }),
    attachments: JSON.stringify([]),
    status: "accepted",
  },
  {
    email_id: "test-005",
    from: "Thomas Park <tpark@edison.nj.us>",
    subject: "State Contract Purchase - Dump Trucks for DPW",
    date: "Wed, 5 Feb 2026 11:00:00 -0500",
    preview: "Requesting Council approval to purchase two (2) International HV507 dump trucks through NJ State Contract #A-88752 from Gabrielli Truck Sales, Ltd., for the Department of Public Works. Total purchase price: $189,400.00 each, $378,800.00 total. Account: T-13-56-400-001.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_state_contract",
    department: "Public Works",
    summary: "Purchase of 2 dump trucks via NJ State Contract #A-88752 from Gabrielli Truck Sales for $378,800 total for DPW fleet.",
    extracted_fields: JSON.stringify({
      vendor_name: "Gabrielli Truck Sales, Ltd.",
      contract_amount: "$378,800.00",
      state_contract_number: "A-88752",
      account_number: "T-13-56-400-001",
      statutory_citation: "N.J.S.A. 40A:11-12",
      dollar_amounts: ["$189,400.00", "$378,800.00"],
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: ["CFO certification required for expenditure"],
    }),
    attachments: JSON.stringify(["State_Contract_Quote_Gabrielli.pdf", "DPW_Fleet_Justification.docx"]),
    status: "new",
  },
  {
    email_id: "test-006",
    from: "Lisa Montgomery <lmontgomery@edison.nj.us>",
    subject: "Bond Release - Regency Square Phase 2 Performance Bond",
    date: "Thu, 6 Feb 2026 09:30:00 -0500",
    preview: "The Engineering Department has inspected and approved all improvements for Regency Square Phase 2 subdivision. We recommend release of the performance bond in the amount of $450,000.00 posted by Regency Development Group, LLC. Block 487, Lots 22-35. All infrastructure meets township standards.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bond_release",
    department: "Engineering",
    summary: "Recommendation to release $450,000 performance bond for Regency Square Phase 2 after satisfactory inspection of all subdivision improvements.",
    extracted_fields: JSON.stringify({
      vendor_name: "Regency Development Group, LLC",
      bond_amount: "$450,000.00",
      project_name: "Regency Square Phase 2",
      block_lot: "Block 487, Lots 22-35",
      dollar_amounts: ["$450,000.00"],
      recommended_action: "Release performance bond",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: true,
      missing_block_lot: false,
      missing_statutory_citation: true,
      notes: ["Missing statutory citation for bond release", "Attorney should review bond terms before release"],
    }),
    attachments: JSON.stringify(["Engineering_Inspection_Report.pdf", "Bond_Details_Regency.pdf"]),
    status: "needs_info",
  },
  {
    email_id: "test-007",
    from: "Edison Parks & Recreation <parks@edison.nj.us>",
    subject: "Weekly Recreation Newsletter - February Activities",
    date: "Thu, 6 Feb 2026 12:00:00 -0500",
    preview: "Happy February, Edison! Here's what's happening this month at Parks & Recreation: Valentine's Day Craft Workshop (Feb 8), Winter Basketball League games every Saturday, Senior Yoga classes continue Tuesdays and Thursdays, and don't forget to register for Spring Soccer by Feb 28!",
    relevant: 0,
    confidence: "high",
    item_type: null,
    department: null,
    summary: "Parks & Recreation weekly newsletter about February community activities. Not related to Council agenda.",
    extracted_fields: JSON.stringify({}),
    completeness: JSON.stringify({
      needs_cfo_certification: false,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: [],
    }),
    attachments: JSON.stringify([]),
    status: "new",
  },
  {
    email_id: "test-008",
    from: "Anthony Russo <arusso@edison.nj.us>",
    subject: "Ordinance Amendment - Chapter 23 Zoning - Mixed Use Overlay District",
    date: "Fri, 7 Feb 2026 10:15:00 -0500",
    preview: "Attached is the draft ordinance amending Chapter 23, Article IX of the Edison Township Code to establish a Mixed Use Overlay (MU-O) District along the Route 27 corridor from Talmadge Road to Plainfield Avenue. This follows the Planning Board's recommendation from their January 14 meeting.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_amendment",
    department: "Planning",
    summary: "Draft ordinance amending Chapter 23 zoning code to create Mixed Use Overlay District along Route 27 corridor, per Planning Board recommendation.",
    extracted_fields: JSON.stringify({
      statutory_citation: "Chapter 23, Article IX, Edison Township Code",
      project_name: "Route 27 Mixed Use Overlay District",
      recommended_action: "Introduction at first reading",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: false,
      needs_attorney_review: true,
      missing_block_lot: true,
      missing_statutory_citation: false,
      notes: ["Attorney must review ordinance language before introduction", "Missing specific block/lot designations for overlay boundary"],
    }),
    attachments: JSON.stringify(["Draft_Ordinance_MU-O_District.docx", "Planning_Board_Minutes_Jan14.pdf", "Zoning_Map_Amendment.pdf"]),
    status: "new",
  },
  {
    email_id: "test-009",
    from: "Karen Liu <kliu@edison.nj.us>",
    subject: "CFO Disbursement Report - January 2026",
    date: "Fri, 7 Feb 2026 14:00:00 -0500",
    preview: "Attached is the disbursement report for the period ending January 31, 2026. Current Fund: $4,287,341.12; Water/Sewer Utility: $892,450.00; Capital Fund: $1,245,000.00; Trust Fund: $156,200.00. Total disbursements: $6,580,991.12. All payments have been verified and certified.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_disbursement",
    department: "Finance",
    summary: "CFO's monthly disbursement report for January 2026 totaling $6,580,991.12 across Current, Water/Sewer, Capital, and Trust funds.",
    extracted_fields: JSON.stringify({
      dollar_amounts: ["$4,287,341.12", "$892,450.00", "$1,245,000.00", "$156,200.00", "$6,580,991.12"],
      recommended_action: "Approve disbursement report",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: true,
      needs_attorney_review: false,
      missing_block_lot: false,
      missing_statutory_citation: false,
      notes: ["CFO certification included with report"],
    }),
    attachments: JSON.stringify(["Disbursement_Report_Jan2026.xlsx", "CFO_Certification_Jan2026.pdf"]),
    status: "reviewed",
  },
  {
    email_id: "test-010",
    from: "David Kim <dkim@edison.nj.us>",
    subject: "Liquor License Renewal - Jade Garden Restaurant",
    date: "Fri, 7 Feb 2026 15:30:00 -0500",
    preview: "Application for renewal of Plenary Retail Consumption License #1205-33-007-007 for Jade Garden Restaurant, 1755 Route 27, Edison, NJ 08817. All fees paid, ABC clearance received, no violations on record. Recommend approval.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_license_renewal",
    department: "Clerk",
    summary: "Routine renewal of liquor license #1205-33-007-007 for Jade Garden Restaurant on Route 27. No violations, all fees current.",
    extracted_fields: JSON.stringify({
      license_number: "1205-33-007-007",
      licensee_name: "Jade Garden Restaurant",
      vendor_address: "1755 Route 27, Edison, NJ 08817",
      recommended_action: "Approve license renewal",
    }),
    completeness: JSON.stringify({
      needs_cfo_certification: false,
      needs_attorney_review: false,
      missing_block_lot: true,
      missing_statutory_citation: true,
      notes: ["Missing block/lot for licensed premises", "Should cite N.J.S.A. 33:1-12 for renewal authority"],
    }),
    attachments: JSON.stringify(["License_Renewal_Application.pdf", "ABC_Clearance_Letter.pdf"]),
    status: "new",
  },
];

const insertMany = db.transaction(() => {
  for (const e of entries) {
    insert.run(
      e.email_id, e.from, e.subject, e.date, e.preview,
      e.relevant, e.confidence, e.item_type, e.department, e.summary,
      e.extracted_fields, e.completeness, e.attachments, e.status
    );
  }
});

insertMany();
console.log(`Seeded ${entries.length} test docket entries.`);
db.close();
