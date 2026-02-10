/**
 * Seed script: populate docket with realistic entries based on actual Edison Township agendas.
 * Run with: npx tsx scripts/seed-docket.ts
 */
import Database from "better-sqlite3";
import path from "path";

const dbPath = process.env.DATABASE_PATH || "./data/docket.db";
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

interface SeedEntry {
  email_from: string;
  email_subject: string;
  email_date: string;
  email_body_preview: string;
  relevant: number;
  confidence: string;
  item_type: string;
  department: string;
  summary: string;
  extracted_fields: Record<string, unknown>;
  completeness: Record<string, unknown>;
  attachment_filenames: string[];
  status: string;
  target_meeting_date: string | null;
}

const entries: SeedEntry[] = [
  // ============================================================
  // ITEMS FOR FEB 9, 2026 WORK SESSION (upcoming)
  // ============================================================

  // From Finance - Disbursement report
  {
    email_from: "DeRoberts, Anthony <deroberts@edisonnj.org>",
    email_subject: "Report of Disbursements through February 4, 2026",
    email_date: "2026-02-04",
    email_body_preview: "Please find attached the Report of Disbursements for the period ending February 4, 2026 for inclusion on the February 9 worksession agenda. Total disbursements: $4,287,341.16. Breakdown by fund attached.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_disbursement",
    department: "Finance/CFO",
    summary: "Report of disbursements through February 4, 2026 totaling $4,287,341.16",
    extracted_fields: {
      dollar_amounts: ["$4,287,341.16"],
      recommended_action: "Accept report of disbursements",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Disbursement_Report_020426.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Tax refunds from Tax Collection
  {
    email_from: "Tax Collection <taxcollector@edisonnj.org>",
    email_subject: "Tax Refund Authorization - Multiple Properties February 2026",
    email_date: "2026-02-03",
    email_body_preview: "Please find attached the list of tax overpayments requiring council authorization for refund. Total refunds: $18,710.60 across 12 properties. All refunds have been verified by the Tax Collector's office.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_tax_refund",
    department: "Tax Collection",
    summary: "Authorization of tax refund overpayments totaling $18,710.60 for 12 properties",
    extracted_fields: {
      contract_amount: "$18,710.60",
      recommended_action: "Authorize tax refunds",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Tax_Refund_List_Feb2026.pdf", "Tax_Refund_Detail.xlsx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Water/Sewer - Neptune equipment
  {
    email_from: "Alves-Viveiros, Maria <alves-viveiros@edisonnj.org>",
    email_subject: "Resolution - Rio Supply Inc. Neptune Water Equipment and Spare Parts",
    email_date: "2026-02-03",
    email_body_preview: "Per the attached, requesting council approval for a contract with Rio Supply Inc. for the purchase of Neptune Technology water equipment and spare parts. This is for ongoing water meter replacement and maintenance program. Not to exceed $135,000.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Water/Sewer Utility",
    summary: "Contract award to Rio Supply Inc. for Neptune Technology water equipment and spare parts, NTE $135,000",
    extracted_fields: {
      vendor_name: "Rio Supply Inc.",
      contract_amount: "$135,000.00",
      project_name: "Neptune Technology Water Equipment and Spare Parts",
      recommended_action: "Award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Rio_Supply_Quote_2026.pdf", "Resolution_Draft.docx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Engineering - Sewer inspection
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "LiRo Engineers - Phase 2 Gravity Sewer Main Inspection & Assessment",
    email_date: "2026-02-02",
    email_body_preview: "Attached is the proposal from LiRo Engineers, Inc. for Phase 2 Inspection and Assessment of Gravity Sewer Main. The scope includes CCTV inspection of approximately 45,000 linear feet of sewer mains in the northeast section. Professional services, not to exceed $317,190.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_professional_services",
    department: "Engineering",
    summary: "Professional services contract with LiRo Engineers for Phase 2 gravity sewer main inspection and assessment, NTE $317,190",
    extracted_fields: {
      vendor_name: "LiRo Engineers, Inc.",
      vendor_address: "333 Thornall Street, Edison, NJ 08837",
      contract_amount: "$317,190.00",
      project_name: "Phase 2 Inspection and Assessment of Gravity Sewer Main",
      statutory_citation: "N.J.S.A. 40A:11-5(1)(a)(i)",
      recommended_action: "Award professional services contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["LiRo_Proposal_Sewer_Ph2.pdf", "Resolution_ProfServices.docx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // From Administration - Lunar New Year fireworks
  {
    email_from: "Diehl, Robert <diehl@edisonnj.org>",
    email_subject: "Garden State Fireworks - Lunar New Year Celebration Feb 21, 2026",
    email_date: "2026-02-01",
    email_body_preview: "Please find attached the application from Garden State Fireworks, Inc. for the Lunar New Year Day Celebration on February 21, 2026 (rain date March 7, 2026). Non-aerial fireworks and 18-minute drone show at grounds adjacent to 450 Division Street. Fire Chief Toth has reviewed and approved.",
    relevant: 1,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Authorization for Garden State Fireworks to discharge non-aerial fireworks for Lunar New Year celebration on Feb 21 at 450 Division St",
    extracted_fields: {
      vendor_name: "Garden State Fireworks, Inc.",
      block_lot: "Block 82.14, Lot 3.22",
      project_name: "Lunar New Year Day Celebration",
      recommended_action: "Authorize fireworks discharge",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: ["Fire Chief approval obtained"] },
    attachment_filenames: ["GardenState_Fireworks_Application.pdf", "Fire_Chief_Approval.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Engineering - Tree maintenance bond release
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "Tree Maintenance Bond Refund - 82 Vineyard Road",
    email_date: "2026-02-02",
    email_body_preview: "Request for release of tree maintenance bond in the amount of $225.00 for property at 82 Vineyard Road, Block 1111, Lot 46.03. Trees have been inspected and remained alive and in satisfactory condition for the required 2-year maintenance period per township code.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bond_release",
    department: "Engineering",
    summary: "Tree maintenance bond refund of $225 for 82 Vineyard Rd — trees survived required 2-year maintenance period",
    extracted_fields: {
      bond_amount: "$225.00",
      block_lot: "Block 1111, Lot 46.03",
      project_name: "Tree Maintenance Bond Refund - 82 Vineyard Road",
      recommended_action: "Release tree maintenance bond",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Tree_Inspection_Report.pdf", "Bond_Refund_Resolution.docx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Public Works - Vehicle lettering
  {
    email_from: "Public Works <dpw@edisonnj.org>",
    email_subject: "Cranbury Custom Lettering - Vehicle & Building Lettering Contract Renewal",
    email_date: "2026-02-03",
    email_body_preview: "Requesting council approval to renew the contract with Cranbury Custom Lettering Inc. for township vehicle and building lettering details and window tinting. Current contract expires March 1. Renewal not to exceed $56,000.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Public Works",
    summary: "Contract renewal with Cranbury Custom Lettering for vehicle/building lettering and window tinting, NTE $56,000",
    extracted_fields: {
      vendor_name: "Cranbury Custom Lettering Inc.",
      contract_amount: "$56,000.00",
      project_name: "Township Vehicle & Building Lettering Details and Window Tinting",
      recommended_action: "Renew contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Cranbury_Lettering_Renewal.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // IT / Administration - SHI International
  {
    email_from: "IT Department <it@edisonnj.org>",
    email_subject: "SHI International - SDL System Hosting and Licensing Renewal",
    email_date: "2026-02-04",
    email_body_preview: "Annual renewal of hosting and licensing for the Spatial Data Logic (SDL) system through SHI International Corporation. SDL is used for property management, code enforcement tracking, and GIS integration. Amount: $123,900.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_state_contract",
    department: "Administration",
    summary: "Annual renewal of SDL system hosting and licensing through SHI International, $123,900",
    extracted_fields: {
      vendor_name: "SHI International Corporation",
      vendor_address: "290 Davidson Avenue, Somerset, NJ 08873",
      contract_amount: "$123,900.00",
      project_name: "Spatial Data Logic (SDL) System Hosting and Licensing Renewal",
      recommended_action: "Approve annual renewal",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["SHI_Quote_SDL_2026.pdf", "SDL_System_Summary.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // Police - Vehicle purchase
  {
    email_from: "Police Department <police@edisonnj.org>",
    email_subject: "Purchase of 2026 Ford Police Interceptor Utility Vehicles",
    email_date: "2026-02-04",
    email_body_preview: "Requesting authorization for the purchase of five (5) 2026 Ford Police Interceptor Utility Vehicles through the Educational Services Commission of NJ cooperative pricing system. Total cost: $241,719.85. These vehicles replace units exceeding 100,000 miles.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Police",
    summary: "Purchase of five 2026 Ford Police Interceptor Utility vehicles via ESCNJ cooperative pricing, $241,719.85",
    extracted_fields: {
      vendor_name: "Nielsen Ford of Morristown",
      contract_amount: "$241,719.85",
      project_name: "2026 Ford Police Interceptor Utility Vehicles (5 units)",
      state_contract_number: "ESCNJ Co-op #65MCESCCPS",
      recommended_action: "Approve purchase",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Ford_Interceptor_Quote.pdf", "ESCNJ_Authorization.pdf", "Vehicle_Replacement_Schedule.xlsx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-09",
  },

  // ============================================================
  // ITEMS FOR FEB 11, 2026 REGULAR MEETING (upcoming)
  // ============================================================

  // Ordinance - Electric scooter regulations
  {
    email_from: "Rainone, William <rainone@edisonnj.org>",
    email_subject: "Ordinance - Chapter 7 Traffic - Electric Scooter Regulations",
    email_date: "2026-01-28",
    email_body_preview: "Attached is the proposed ordinance to amend Chapter 7 \"Traffic\" by creating new Subchapter 7-44 \"Electric Scooter Regulations.\" This ordinance regulates the operation of low-speed electric scooters within the Township including helmet requirements, lighting, and penalties for violations. Introduced at first reading January 28.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_new",
    department: "Law",
    summary: "New ordinance creating Subchapter 7-44 regulating electric scooter operation — helmet requirements, lighting, penalties ($250-$1,000)",
    extracted_fields: {
      statutory_citation: "N.J.S.A. 39:4-14.16 et seq.",
      project_name: "Chapter 7 Traffic - Subchapter 7-44 Electric Scooter Regulations",
      recommended_action: "Second reading, public hearing, and adoption",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["Passed first reading 1/28/2026"] },
    attachment_filenames: ["O.2270-2026_Electric_Scooter.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Ordinance amendment - Adopt an Area
  {
    email_from: "Rainone, William <rainone@edisonnj.org>",
    email_subject: "Ordinance Amending Chapter 23 - Adopt an Area Program Guidelines",
    email_date: "2026-01-29",
    email_body_preview: "Attached is the proposed ordinance amending Chapter 23 \"Adopt an Area Program\" to establish updated program guidelines and volunteer recognition. This updates the existing program first established in 2018 to expand eligibility and streamline the application process.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_amendment",
    department: "Law",
    summary: "Amendment to Chapter 23 Adopt an Area Program — updated guidelines, expanded eligibility, streamlined applications",
    extracted_fields: {
      project_name: "Chapter 23 Adopt an Area Program Amendment",
      recommended_action: "Second reading, public hearing, and adoption",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["Passed first reading 1/28/2026"] },
    attachment_filenames: ["O.2271-2026_Adopt_Area.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Water main replacement
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "J. Fletcher Creamer & Son - Smart Hydrant Leak Detection Installation",
    email_date: "2026-02-03",
    email_body_preview: "Attached resolution awarding contract to J. Fletcher Creamer & Son, Inc. for the Smart Hydrant Leak Detection Installation Project. This project installs smart leak detection sensors on 350 fire hydrants throughout the township water system. Bid #25-10-22. Amount: $2,311,200.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Engineering",
    summary: "Contract award to J. Fletcher Creamer & Son for smart hydrant leak detection installation on 350 hydrants, $2,311,200",
    extracted_fields: {
      vendor_name: "J. Fletcher Creamer & Son, Inc.",
      contract_amount: "$2,311,200.00",
      bid_number: "Public Bid #25-10-22",
      project_name: "Smart Hydrant Leak Detection Installation Project",
      recommended_action: "Accept bid and award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["NJ Water Bank financing approved"] },
    attachment_filenames: ["Creamer_Bid_Response.pdf", "Bid_Tabulation_25-10-22.pdf", "Resolution_SmartHydrant.docx"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Plainfield Ave water main
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "Plainfield Avenue Water Main Replacement Project",
    email_date: "2026-02-03",
    email_body_preview: "Requesting council approval for the Plainfield Avenue Water Main Replacement project. Contract to be awarded to the lowest responsive bidder for replacement of approximately 2,400 linear feet of 8-inch ductile iron water main along Plainfield Avenue from Inman Ave to New Dover Road. Amount: $474,850.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Engineering",
    summary: "Plainfield Avenue water main replacement — 2,400 LF of 8-inch ductile iron pipe from Inman Ave to New Dover Rd, $474,850",
    extracted_fields: {
      contract_amount: "$474,850.00",
      project_name: "Plainfield Avenue Water Main Replacement",
      recommended_action: "Award contract to lowest responsive bidder",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: ["Part of NJ Water Bank loan program"] },
    attachment_filenames: ["Plainfield_WaterMain_BidTab.pdf", "Resolution_Draft.docx", "Project_Map.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Emergency water main repair
  {
    email_from: "Alves-Viveiros, Maria <alves-viveiros@edisonnj.org>",
    email_subject: "Emergency Water Main Repair Services - B&W Construction Co.",
    email_date: "2026-02-03",
    email_body_preview: "Requesting authorization for emergency water main system repair services contract. Bids received October 1 for Public Bid No. 25-10-23. Recommending award to B&W Construction Co. of NJ, Inc. as secondary vendor. Aggregate not to exceed $2,000,000.00 per year.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Water/Sewer Utility",
    summary: "Emergency water main repair services contract with B&W Construction, NTE $2,000,000/year",
    extracted_fields: {
      vendor_name: "B&W Construction Co. of NJ, Inc.",
      vendor_address: "PO Box 574, South River, NJ 08882",
      contract_amount: "$2,000,000.00/year",
      bid_number: "Public Bid No. 25-10-23",
      project_name: "Emergency Water Main System Repair Services",
      recommended_action: "Accept bid and award contract (secondary vendor)",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["Three-tier award: primary, secondary, tertiary"] },
    attachment_filenames: ["Bid_25-10-23_Tabulation.pdf", "BW_Construction_Bid.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // USW union agreement
  {
    email_from: "Human Resources <hr@edisonnj.org>",
    email_subject: "MOA - United Steel Workers Local 1426 Contract Agreement",
    email_date: "2026-02-04",
    email_body_preview: "Attached is the Memorandum of Agreement between the Township of Edison and United Steel, Paper and Forestry, Rubber, Manufacturing, Energy, Allied Industrial and Service Workers International Union, AFL-CIO, Local 1426. Agreement covers 2025-2028 term. Requires council ratification.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_personnel",
    department: "Human Resources",
    summary: "Memorandum of Agreement with USW Local 1426 for 2025-2028 contract term — requires council ratification",
    extracted_fields: {
      vendor_name: "United Steel Workers International Union, AFL-CIO, Local 1426",
      project_name: "Collective Bargaining Agreement 2025-2028",
      recommended_action: "Ratify memorandum of agreement",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["CFO fiscal impact statement attached"] },
    attachment_filenames: ["MOA_USW_Local1426_2025-2028.pdf", "Fiscal_Impact_Statement.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Kitchen equipment - Penn Jersey Paper
  {
    email_from: "Recreation Dept <recreation@edisonnj.org>",
    email_subject: "Penn Jersey Paper Co - Kitchen Equipment Purchase and Installation",
    email_date: "2026-02-04",
    email_body_preview: "Requesting approval for purchase and installation of kitchen equipment at the Minnie B. Veal Community Center from Penn Jersey Paper Co LLC. Equipment includes commercial refrigerator, convection oven, and prep tables for the senior nutrition program expansion.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Recreation",
    summary: "Kitchen equipment purchase and installation at Minnie B. Veal Community Center from Penn Jersey Paper Co LLC",
    extracted_fields: {
      vendor_name: "Penn Jersey Paper Co LLC",
      project_name: "Kitchen Equipment - Minnie B. Veal Community Center",
      recommended_action: "Award contract for purchase and installation",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["PennJersey_Quote.pdf", "Kitchen_Equipment_Specs.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // Sewer overpayment refunds
  {
    email_from: "Tax Collection <taxcollector@edisonnj.org>",
    email_subject: "Sewer Overpayment Refunds - February 2026",
    email_date: "2026-02-04",
    email_body_preview: "Attached is the list of sewer overpayments requiring council authorization for refund. Total refunds: $9,385.93 across 8 accounts.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_tax_refund",
    department: "Tax Collection",
    summary: "Authorization of sewer overpayment refunds totaling $9,385.93 for 8 accounts",
    extracted_fields: {
      contract_amount: "$9,385.93",
      recommended_action: "Authorize sewer refunds",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Sewer_Refund_List_Feb2026.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-02-11",
  },

  // ============================================================
  // ITEMS FOR JAN 12, 2026 WORK SESSION (past - already has minutes)
  // ============================================================

  // Admin agenda from Mayor
  {
    email_from: "Diehl, Robert <diehl@edisonnj.org>",
    email_subject: "Administrative Agenda - Mayor Joshi Appointments January 2026",
    email_date: "2026-01-08",
    email_body_preview: "Attached are the Mayor's appointments and administrative items for the January 12 worksession. Items a. through m. include various board and commission appointments for the 2026 term.",
    relevant: 1,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Mayor Joshi administrative agenda items a. through m. — board and commission appointments for 2026 term",
    extracted_fields: {
      recommended_action: "Review administrative agenda",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Admin_Agenda_011226.pdf", "Mayor_Appointments.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-12",
  },

  // Ordinance - Technical Review Committee
  {
    email_from: "Rainone, William <rainone@edisonnj.org>",
    email_subject: "Ordinance Amending §39-12.15 Technical Review Committee",
    email_date: "2026-01-07",
    email_body_preview: "Attached ordinance amends Chapter 39 \"Land Use,\" Section §39-12.15 \"Technical Review Committee\" of the Code of the Township of Edison. The amendment redesigns the Technical Review Committee process to streamline application review before Planning Board submission.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_amendment",
    department: "Law",
    summary: "Amendment to Land Use code §39-12.15 redesigning Technical Review Committee to streamline planning applications",
    extracted_fields: {
      statutory_citation: "N.J.S.A. 40:55D-1 et seq.",
      project_name: "Chapter 39 Land Use - Technical Review Committee Amendment",
      recommended_action: "Introduction and first reading",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Ordinance_TechReview.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-12",
  },

  // Ordinance - Boards and Commissions
  {
    email_from: "Rainone, William <rainone@edisonnj.org>",
    email_subject: "Ordinance Amending Article V - Boards, Commissions, Committees and Agencies",
    email_date: "2026-01-07",
    email_body_preview: "Attached ordinance amends Article V \"Boards, Commissions, Committees and Agencies\" of Chapter 2 \"Administration\" of the Municipal Code. This update reflects current organizational structure and appointment procedures.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_amendment",
    department: "Law",
    summary: "Amendment to Chapter 2 Administration — updating boards, commissions, committees organizational structure",
    extracted_fields: {
      project_name: "Chapter 2 Administration - Article V Boards, Commissions, Committees",
      recommended_action: "Introduction and first reading",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Ordinance_BoardsCommissions.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-12",
  },

  // BA items
  {
    email_from: "Alves-Viveiros, Maria <alves-viveiros@edisonnj.org>",
    email_subject: "Business Administrator Items a. through u. - January 12 Worksession",
    email_date: "2026-01-08",
    email_body_preview: "Please find attached the Business Administrator's items for the January 12 worksession agenda. Items a. through u. include various contracts, change orders, and authorizations requiring council review.",
    relevant: 1,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Business Administrator agenda items a. through u. — contracts, change orders, and authorizations",
    extracted_fields: {
      recommended_action: "Review business administrator items",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["BA_Items_011226.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-12",
  },

  // America 250 presentation
  {
    email_from: "Council President <coyle@edisonnj.org>",
    email_subject: "Presentation - 250th Anniversary of Our Country",
    email_date: "2026-01-06",
    email_body_preview: "Requesting agenda time for the America 250th Anniversary presentation at the January 12 worksession. Council President Coyle will read a statement into the record regarding Edison's Revolutionary War heritage, EdisonTV historic series, Edison High Drama Class presentation, and America 250 flag presentation.",
    relevant: 1,
    confidence: "high",
    item_type: "discussion_item",
    department: "Administration",
    summary: "Council President Coyle presentation on America 250th Anniversary — Edison's Revolutionary War heritage and commemorative events",
    extracted_fields: {
      project_name: "250th Anniversary of Our Country Presentation",
      recommended_action: "Presentation to Council",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["America250_Statement.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-12",
  },

  // ============================================================
  // ITEMS FOR JAN 14, 2026 REGULAR MEETING (past)
  // ============================================================

  // Disbursement report for regular
  {
    email_from: "DeRoberts, Anthony <deroberts@edisonnj.org>",
    email_subject: "Report of Disbursements through January 8, 2026",
    email_date: "2026-01-09",
    email_body_preview: "Please find attached the Report of Disbursements for the period ending January 8, 2026 for inclusion on the January 14 regular meeting agenda.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_disbursement",
    department: "Finance/CFO",
    summary: "Report of disbursements through January 8, 2026",
    extracted_fields: {
      recommended_action: "Accept report of disbursements",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Disbursement_Report_010826.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // Tax refunds for regular
  {
    email_from: "Tax Collection <taxcollector@edisonnj.org>",
    email_subject: "Tax Refund Authorization - January 2026",
    email_date: "2026-01-09",
    email_body_preview: "Please find attached the list of tax overpayments requiring council authorization for refund. Total refunds: $12,447.30 across 9 properties.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_tax_refund",
    department: "Tax Collection",
    summary: "Authorization of tax refund overpayments totaling $12,447.30 for 9 properties",
    extracted_fields: {
      contract_amount: "$12,447.30",
      recommended_action: "Authorize tax refunds",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Tax_Refund_List_Jan2026.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // Edmunds software renewal
  {
    email_from: "IT Department <it@edisonnj.org>",
    email_subject: "Edmunds & Associates - Software Maintenance and Hosting Renewal",
    email_date: "2026-01-09",
    email_body_preview: "Annual renewal of software maintenance and hosting agreement with Edmunds & Associates, Inc. for the Edmunds GovTech financial management system. Used by Finance, Tax Collection, and Utility Billing departments. Renewal for calendar year 2026.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_state_contract",
    department: "Finance/CFO",
    summary: "Annual renewal of Edmunds GovTech financial management system maintenance and hosting",
    extracted_fields: {
      vendor_name: "Edmunds & Associates, Inc.",
      project_name: "Edmunds System Software Maintenance and Hosting Renewal 2026",
      recommended_action: "Approve annual renewal",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Edmunds_Renewal_Quote_2026.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // Johnston Communications
  {
    email_from: "IT Department <it@edisonnj.org>",
    email_subject: "Johnston Communications - IT Infrastructure and Fiber Optic Network Services",
    email_date: "2026-01-08",
    email_body_preview: "Requesting council approval for contract with Johnston GP, Inc. d/b/a Johnston Communications for IT infrastructure, fiber optic network, and advanced applications and services. Johnston provides Avaya phone system support, fiber backbone maintenance, and network consulting.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_professional_services",
    department: "Administration",
    summary: "IT infrastructure contract with Johnston Communications for fiber optic network, Avaya support, and network services",
    extracted_fields: {
      vendor_name: "Johnston GP, Inc. d/b/a Johnston Communications",
      vendor_address: "36 Commerce Street, Springfield, NJ 07081",
      project_name: "IT Infrastructure, Fiber Optic Network, Advanced Applications and Services",
      recommended_action: "Award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Johnston_Proposal_2026.pdf", "Network_Services_Scope.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // Promotional items bid
  {
    email_from: "Recreation Dept <recreation@edisonnj.org>",
    email_subject: "AD Cafe - Promotional Items, Trophies and Awards Contract",
    email_date: "2026-01-09",
    email_body_preview: "Requesting approval to award Public Bid #25-01-18 for promotional items, trophies and awards to AD Cafe. These items are used across Recreation, Council events, and township-sponsored programs. Not to exceed $32,000.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Recreation",
    summary: "Bid award to AD Cafe for promotional items, trophies and awards, NTE $32,000",
    extracted_fields: {
      vendor_name: "AD Cafe",
      contract_amount: "$32,000.00",
      bid_number: "Public Bid #25-01-18",
      project_name: "Promotional Items, Trophies and Awards",
      recommended_action: "Accept bid and award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Bid_25-01-18_Tabulation.pdf", "AD_Cafe_Bid.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // Minuteman Press
  {
    email_from: "Clerk's Office <clerk@edisonnj.org>",
    email_subject: "GMA Marketing / Minuteman Press - Printing Services Contract",
    email_date: "2026-01-08",
    email_body_preview: "Requesting council approval for contract with GMA Marketing Inc. d/b/a Minuteman Press of Edison for printing services including council agenda packets, public hearing notices, and municipal forms. Not to exceed $10,000.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Administration",
    summary: "Printing services contract with Minuteman Press for agenda packets, notices, and forms, NTE $10,000",
    extracted_fields: {
      vendor_name: "GMA Marketing Inc. d/b/a Minuteman Press",
      vendor_address: "134 Talmadge Road, Edison, NJ 08817",
      contract_amount: "$10,000.00",
      project_name: "Municipal Printing Services",
      recommended_action: "Award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Minuteman_Press_Quote.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-14",
  },

  // ============================================================
  // ITEMS FOR JAN 28, 2026 COMBINED MEETING (past)
  // ============================================================

  // Office Basics
  {
    email_from: "Alves-Viveiros, Maria <alves-viveiros@edisonnj.org>",
    email_subject: "Office Basics Inc. - Ink, Toner, and Office Printing Supplies",
    email_date: "2026-01-22",
    email_body_preview: "Requesting approval for 2-year contract with Office Basics Inc. for ink, toner, and supplies for office printing equipment. Annual cost not to exceed $7,524.48 ($15,048.96 total). Bid received and evaluated per purchasing regulations.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Administration",
    summary: "2-year contract with Office Basics Inc. for ink, toner, and office printing supplies, NTE $15,048.96",
    extracted_fields: {
      vendor_name: "Office Basics Inc.",
      contract_amount: "$15,048.96",
      project_name: "Ink, Toner, and Supplies for Office Printing Equipment (2-year)",
      recommended_action: "Accept bid and award contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["OfficeBasics_Bid.pdf", "Resolution_OfficeSupplies.docx"],
    status: "on_agenda",
    target_meeting_date: "2026-01-28",
  },

  // Rock salt emergency
  {
    email_from: "Public Works <dpw@edisonnj.org>",
    email_subject: "Emergency Rock Salt Purchase - Middlesex County Co-op",
    email_date: "2026-01-21",
    email_body_preview: "Requesting emergency authorization to purchase rock salt through the Middlesex County Cooperative Purchasing System. Current supplies depleted due to January storms. Secondary vendor: Atlantic Salt Inc. at $79.00 per ton.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Public Works",
    summary: "Emergency rock salt purchase through Middlesex County Co-op — Atlantic Salt at $79/ton",
    extracted_fields: {
      vendor_name: "Atlantic Salt Inc.",
      vendor_address: "134 Middle Street, Suite 210, Lowell, MA 01852",
      contract_amount: "$79.00/ton",
      project_name: "Emergency Rock Salt Purchase",
      state_contract_number: "Middlesex County Co-op",
      recommended_action: "Authorize emergency purchase",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: ["Emergency due to depleted supplies"] },
    attachment_filenames: ["AtlanticSalt_Quote.pdf", "County_Coop_Authorization.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-28",
  },

  // 2026 meeting schedule
  {
    email_from: "Russomanno, Cheryl <clerk@edisonnj.org>",
    email_subject: "Approval of 2026 Council Meeting Schedule",
    email_date: "2026-01-21",
    email_body_preview: "Attached is the proposed 2026 Municipal Council meeting schedule for council approval. Worksession meetings on the 2nd and 4th Monday at 6:00 PM, Regular meetings on the 2nd and 4th Wednesday at 7:00 PM.",
    relevant: 1,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Approval of 2026 Municipal Council meeting schedule — biweekly worksessions and regular meetings",
    extracted_fields: {
      recommended_action: "Approve 2026 meeting schedule",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["2026_Meeting_Schedule.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-28",
  },

  // Debt service
  {
    email_from: "Vallejo, Carlos <vallejo@edisonnj.org>",
    email_subject: "Debt Service Appropriations for 2026",
    email_date: "2026-01-22",
    email_body_preview: "Attached resolution authorizing debt service appropriations for calendar year 2026. This is the annual authorization required under N.J.S.A. 40A:4-53 for payment of principal and interest on outstanding municipal bonds and notes.",
    relevant: 1,
    confidence: "high",
    item_type: "other",
    department: "Finance/CFO",
    summary: "Authorization of 2026 debt service appropriations for municipal bonds and notes per N.J.S.A. 40A:4-53",
    extracted_fields: {
      statutory_citation: "N.J.S.A. 40A:4-53",
      recommended_action: "Authorize debt service appropriations",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Debt_Service_2026.pdf", "Bond_Payment_Schedule.xlsx"],
    status: "on_agenda",
    target_meeting_date: "2026-01-28",
  },

  // Wawa surety bond
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "Wawa at 1095 US Route 1 - Maintenance Surety Bond Release",
    email_date: "2026-01-23",
    email_body_preview: "Request for release of maintenance surety bond for the Wawa project at 1095 US Route 1. Capitol Indemnity Company bond dated January 12, 2026. Site inspection completed, all improvements found satisfactory.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bond_release",
    department: "Engineering",
    summary: "Release of maintenance surety bond for Wawa at 1095 US Rt 1 — Capitol Indemnity Company bond, improvements satisfactory",
    extracted_fields: {
      vendor_name: "Capitol Indemnity Company",
      block_lot: "1095 US Route 1",
      project_name: "Wawa - 1095 US Route 1 Maintenance Surety Bond",
      recommended_action: "Release maintenance surety bond",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["Site inspection completed"] },
    attachment_filenames: ["Capitol_Indemnity_Bond.pdf", "Site_Inspection_Report.pdf"],
    status: "on_agenda",
    target_meeting_date: "2026-01-28",
  },

  // ============================================================
  // ITEMS NOT YET ASSIGNED (new/reviewed - in the docket queue)
  // ============================================================

  // Bamboo ordinance
  {
    email_from: "Rainone, William <rainone@edisonnj.org>",
    email_subject: "Ordinance Amending Chapter 25 Trees - Running Bamboo Prohibition",
    email_date: "2026-02-05",
    email_body_preview: "Attached is a proposed ordinance amending Chapter 25 \"Trees\" to prohibit the planting and spread of running bamboo in the Township of Edison. This addresses ongoing complaints from residents about invasive bamboo spreading across property lines and damaging infrastructure.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_amendment",
    department: "Law",
    summary: "Amendment to Chapter 25 Trees — prohibiting planting and spread of running bamboo in the township",
    extracted_fields: {
      project_name: "Chapter 25 Trees - Running Bamboo Prohibition",
      recommended_action: "Introduction and first reading",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Ordinance_Bamboo.pdf"],
    status: "reviewed",
    target_meeting_date: null,
  },

  // Budget cap bank
  {
    email_from: "Vallejo, Carlos <vallejo@edisonnj.org>",
    email_subject: "Ordinance to Exceed Municipal Budget Appropriation Limits - Cap Bank",
    email_date: "2026-02-06",
    email_body_preview: "Attached ordinance to exceed the municipal budget appropriation limits and to establish a cap bank per N.J.S.A. 40A:4-45.14. This is a standard annual ordinance required for budget flexibility under the state cap law. Must be adopted before introduction of the 2026 municipal budget.",
    relevant: 1,
    confidence: "high",
    item_type: "ordinance_new",
    department: "Finance/CFO",
    summary: "Annual ordinance to exceed budget appropriation limits and establish cap bank per state cap law",
    extracted_fields: {
      statutory_citation: "N.J.S.A. 40A:4-45.14",
      project_name: "Exceed Municipal Budget Appropriation Limits / Cap Bank 2026",
      recommended_action: "Introduction and first reading",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: ["Must be adopted before 2026 budget introduction"] },
    attachment_filenames: ["Ordinance_CapBank_2026.pdf"],
    status: "reviewed",
    target_meeting_date: null,
  },

  // Plumbing services
  {
    email_from: "Public Works <dpw@edisonnj.org>",
    email_subject: "Plumbing Services Contract - Various Vendors",
    email_date: "2026-02-06",
    email_body_preview: "Requesting authorization to award contracts for plumbing services to various qualified vendors for township building maintenance. Multiple vendor approach ensures availability for emergency repairs. Aggregate not to exceed $75,000.00.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_bid_award",
    department: "Public Works",
    summary: "Plumbing services contracts with various vendors for township building maintenance, NTE $75,000",
    extracted_fields: {
      contract_amount: "$75,000.00",
      project_name: "Plumbing Services - Township Buildings",
      recommended_action: "Award contracts to various vendors",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Plumbing_Services_Vendors.pdf"],
    status: "new",
    target_meeting_date: null,
  },

  // Street opening escrow
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "Street Opening Escrow - 111 Livingston Avenue",
    email_date: "2026-02-07",
    email_body_preview: "Requesting council approval for street opening escrow deposit for utility work at 111 Livingston Avenue. Escrow amount: $4,800.00 to cover potential road restoration costs. PSE&G gas main connection.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_escrow_release",
    department: "Engineering",
    summary: "Street opening escrow of $4,800 for utility work at 111 Livingston Ave — PSE&G gas main connection",
    extracted_fields: {
      escrow_amount: "$4,800.00",
      block_lot: "111 Livingston Avenue",
      project_name: "Street Opening Escrow - 111 Livingston Avenue",
      recommended_action: "Approve street opening escrow",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["Street_Opening_Application.pdf"],
    status: "new",
    target_meeting_date: null,
  },

  // SAGE grant
  {
    email_from: "Diehl, Robert <diehl@edisonnj.org>",
    email_subject: "Blue SAGE Grant Transfer - Edison Memorial Tower Corporation",
    email_date: "2026-02-05",
    email_body_preview: "Requesting authorization for Mayor or Clerk to execute documents to transfer 2023 Blue SAGE Grant Funds from NJ Department of State Historical Commission. Not to exceed $250,000.00 for the Thomas Edison Center at Menlo Park / Edison Memorial Tower Corporation at 37 Christie Street.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_grant",
    department: "Administration",
    summary: "Transfer of $250,000 Blue SAGE Grant from NJ Historical Commission for Thomas Edison Center at Menlo Park",
    extracted_fields: {
      contract_amount: "$250,000.00",
      vendor_name: "Edison Memorial Tower Corporation",
      vendor_address: "37 Christie Street, Edison, NJ",
      project_name: "2023 Blue SAGE Grant - Thomas Edison Center at Menlo Park",
      recommended_action: "Authorize grant fund transfer",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["SAGE_Grant_Agreement.pdf", "Edison_Memorial_Tower_Info.pdf"],
    status: "accepted",
    target_meeting_date: null,
  },

  // DPW Garage design
  {
    email_from: "Engineering Dept <engineering@edisonnj.org>",
    email_subject: "LiRo Engineers - DPW Garage Design, Engineering and Construction Documents",
    email_date: "2026-02-06",
    email_body_preview: "Professional services proposal from LiRo Engineers, Inc. for DPW Garage design, engineering, and construction document preparation. The existing DPW garage requires significant upgrades to meet current operational needs and building codes.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_professional_services",
    department: "Engineering",
    summary: "Professional services contract with LiRo Engineers for DPW Garage design and construction document preparation",
    extracted_fields: {
      vendor_name: "LiRo Engineers, Inc.",
      vendor_address: "333 Thornall Street, Edison, NJ 08837",
      project_name: "DPW Garage Design, Engineering and Construction Documents",
      statutory_citation: "N.J.S.A. 40A:11-5(1)(a)(i)",
      recommended_action: "Award professional services contract",
    },
    completeness: { needs_cfo_certification: true, needs_attorney_review: true, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["LiRo_DPW_Garage_Proposal.pdf", "DPW_Garage_Assessment.pdf"],
    status: "new",
    target_meeting_date: null,
  },

  // Tax sale redemption
  {
    email_from: "Tax Collection <taxcollector@edisonnj.org>",
    email_subject: "Tax Sale Certificate Redemption Report - January 2026",
    email_date: "2026-02-02",
    email_body_preview: "Monthly report of tax sale certificates redeemed in January 2026. Report covers certificates held by Edison Township Collector of Taxes from prior year tax sales for delinquent property taxes.",
    relevant: 1,
    confidence: "high",
    item_type: "resolution_tax_sale_redemption",
    department: "Tax Collection",
    summary: "Monthly report of tax sale certificates redeemed in January 2026 for delinquent property taxes",
    extracted_fields: {
      recommended_action: "Accept report",
    },
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: [] },
    attachment_filenames: ["TaxSale_Redemption_Jan2026.pdf"],
    status: "accepted",
    target_meeting_date: null,
  },

  // Non-relevant email (spam/irrelevant)
  {
    email_from: "Edison Chamber of Commerce <info@edisonchamber.com>",
    email_subject: "2026 Edison Chamber Annual Gala - Sponsorship Opportunities",
    email_date: "2026-02-03",
    email_body_preview: "Dear Township Officials, We are pleased to announce the 2026 Edison Chamber of Commerce Annual Gala on March 14 at the Pines Manor. Sponsorship levels available from $500 to $5,000. Please consider supporting local business development.",
    relevant: 0,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Chamber of Commerce annual gala sponsorship solicitation — not council business",
    extracted_fields: {},
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: ["Not relevant to council agenda"] },
    attachment_filenames: ["Gala_Sponsorship_Flyer.pdf"],
    status: "new",
    target_meeting_date: null,
  },

  // Non-relevant vendor marketing
  {
    email_from: "GovDeals <notifications@govdeals.com>",
    email_subject: "New Surplus Equipment Available in Your Area",
    email_date: "2026-02-04",
    email_body_preview: "New government surplus items available near Edison, NJ. Browse heavy equipment, vehicles, and office furniture from surrounding municipalities. Visit GovDeals.com for current listings.",
    relevant: 0,
    confidence: "high",
    item_type: "other",
    department: "Administration",
    summary: "Government surplus marketplace notification — automated marketing email",
    extracted_fields: {},
    completeness: { needs_cfo_certification: false, needs_attorney_review: false, missing_block_lot: false, missing_statutory_citation: false, notes: ["Automated marketing email"] },
    attachment_filenames: [],
    status: "new",
    target_meeting_date: null,
  },
];

// --- Insert entries ---
const insertStmt = db.prepare(`
  INSERT INTO docket (
    email_id, email_from, email_subject, email_date, email_body_preview,
    relevant, confidence, item_type, department, summary,
    extracted_fields, completeness, attachment_filenames,
    status, notes, target_meeting_date
  ) VALUES (
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, '', ?
  )
`);

const processedStmt = db.prepare(`
  INSERT OR IGNORE INTO processed_emails (email_id) VALUES (?)
`);

let inserted = 0;
const insertAll = db.transaction(() => {
  for (const entry of entries) {
    const emailId = `seed-${entry.email_date}-${entry.email_subject.slice(0, 40).replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`;

    // Skip if already inserted
    const exists = db.prepare("SELECT 1 FROM docket WHERE email_id = ?").get(emailId);
    if (exists) continue;

    insertStmt.run(
      emailId,
      entry.email_from,
      entry.email_subject,
      entry.email_date,
      entry.email_body_preview,
      entry.relevant,
      entry.confidence,
      entry.item_type,
      entry.department,
      entry.summary,
      JSON.stringify(entry.extracted_fields),
      JSON.stringify(entry.completeness),
      JSON.stringify(entry.attachment_filenames),
      entry.status,
      entry.target_meeting_date,
    );

    processedStmt.run(emailId);
    inserted++;
  }
});

insertAll();

console.log(`Seeded ${inserted} docket entries (${entries.length} total, ${entries.length - inserted} already existed)`);

// Show summary
const stats = db.prepare(`
  SELECT
    status,
    COUNT(*) as count,
    SUM(CASE WHEN target_meeting_date IS NOT NULL THEN 1 ELSE 0 END) as assigned
  FROM docket
  WHERE email_id LIKE 'seed-%'
  GROUP BY status
`).all() as { status: string; count: number; assigned: number }[];

console.log("\nBy status:");
for (const row of stats) {
  console.log(`  ${row.status}: ${row.count} items (${row.assigned} assigned to meetings)`);
}

const byMeeting = db.prepare(`
  SELECT target_meeting_date, COUNT(*) as count
  FROM docket
  WHERE target_meeting_date IS NOT NULL AND email_id LIKE 'seed-%'
  GROUP BY target_meeting_date
  ORDER BY target_meeting_date
`).all() as { target_meeting_date: string; count: number }[];

console.log("\nBy meeting date:");
for (const row of byMeeting) {
  console.log(`  ${row.target_meeting_date}: ${row.count} items`);
}

db.close();
