// server/services/osha_ita_designation.js — 29 CFR 1904.41 designated-
// industry determination.
//
// Under 1904.41(a)(1)+(2), an establishment must electronically submit
// 300A information to OSHA if it falls into ONE OF three categories:
//
//   (a)(1)(i) — 20-249 employees AND classified in an Appendix A NAICS.
//               Submission: 300A only.
//   (a)(1)(ii) — 250+ employees (any industry that keeps records).
//                Submission: 300A only.
//   (a)(2)    — 100+ employees AND classified in an Appendix B NAICS.
//               Submission: 300A + 300 + 301.
//
// Per 1904.41(b)(2), "each individual employed in the establishment at
// any time during the calendar year counts as one employee, including
// full-time, part-time, seasonal, and temporary workers."
//
// 1904.41(b)(8): an enterprise or corporate office MAY submit on behalf
// of multiple establishments. v1 reports per-establishment; corporate
// rollup is a future concern.
//
// 1904.41(b)(6) carve-out: partially-exempt establishments (under
// 1904.1 / 1904.2) do not routinely submit. v1 does not detect partial
// exemption — owner-confirmable as a follow-up.
//
// Reporting deadline (1904.41(c)): March 2 of the year following the
// calendar year covered.
//
// NAICS matching: Appendix A includes two-digit sector codes (11, 22,
// 23, 42), a range "31-33" for Manufacturing, and four-digit codes.
// Appendix B uses only four-digit codes. We match in this order:
//   1. Exact 4-digit match
//   2. Range match (31-33 — explicit set {31, 32, 33})
//   3. Two-digit prefix match against Appendix A two-digit entries
// Caller passes the NAICS code as a string (sites.naics_code is TEXT).

// 29 CFR 1904 Appendix A — Designated Industries for §1904.41(a)(1)(i)
// Source: 88 FR 47347 (July 21, 2023)
// Verbatim from docs/regulatory-sources/osha/29 CFR Part 1904 (up to date as of 5-07-2026).pdf
// (pages 35-37). Each entry is [naics_code, industry_label].
//
// The Manufacturing entry is rendered in the Act as "31-33" — we
// represent it as three two-digit codes ('31', '32', '33') in the
// data structure for clean prefix matching.
const APPENDIX_A = [
  ['11',   'Agriculture, Forestry, Fishing and Hunting.'],
  ['22',   'Utilities.'],
  ['23',   'Construction.'],
  ['31',   'Manufacturing.'],            // part of "31-33" range
  ['32',   'Manufacturing.'],            // part of "31-33" range
  ['33',   'Manufacturing.'],            // part of "31-33" range
  ['42',   'Wholesale Trade.'],
  ['4413', 'Automotive Parts, Accessories, and Tire Stores.'],
  ['4421', 'Furniture Stores.'],
  ['4422', 'Home Furnishings Stores.'],
  ['4441', 'Building Material and Supplies Dealers.'],
  ['4442', 'Lawn and Garden Equipment and Supplies Stores.'],
  ['4451', 'Grocery Stores.'],
  ['4452', 'Specialty Food Stores.'],
  ['4522', 'Department Stores.'],
  ['4523', 'General Merchandise Stores, including Warehouse Clubs and Supercenters.'],
  ['4533', 'Used Merchandise Stores.'],
  ['4542', 'Vending Machine Operators.'],
  ['4543', 'Direct Selling Establishments.'],
  ['4811', 'Scheduled Air Transportation.'],
  ['4841', 'General Freight Trucking.'],
  ['4842', 'Specialized Freight Trucking.'],
  ['4851', 'Urban Transit Systems.'],
  ['4852', 'Interurban and Rural Bus Transportation.'],
  ['4853', 'Taxi and Limousine Service.'],
  ['4854', 'School and Employee Bus Transportation.'],
  ['4855', 'Charter Bus Industry.'],
  ['4859', 'Other Transit and Ground Passenger Transportation.'],
  ['4871', 'Scenic and Sightseeing Transportation, Land.'],
  ['4881', 'Support Activities for Air Transportation.'],
  ['4882', 'Support Activities for Rail Transportation.'],
  ['4883', 'Support Activities for Water Transportation.'],
  ['4884', 'Support Activities for Road Transportation.'],
  ['4889', 'Other Support Activities for Transportation.'],
  ['4911', 'Postal Service.'],
  ['4921', 'Couriers and Express Delivery Services.'],
  ['4922', 'Local Messengers and Local Delivery.'],
  ['4931', 'Warehousing and Storage.'],
  ['5152', 'Cable and Other Subscription Programming.'],
  ['5311', 'Lessors of Real Estate.'],
  ['5321', 'Automotive Equipment Rental and Leasing.'],
  ['5322', 'Consumer Goods Rental.'],
  ['5323', 'General Rental Centers.'],
  ['5617', 'Services to Buildings and Dwellings.'],
  ['5621', 'Waste Collection.'],
  ['5622', 'Waste Treatment and Disposal.'],
  ['5629', 'Remediation and Other Waste Management Services.'],
  ['6219', 'Other Ambulatory Health Care Services.'],
  ['6221', 'General Medical and Surgical Hospitals.'],
  ['6222', 'Psychiatric and Substance Abuse Hospitals.'],
  ['6223', 'Specialty (except Psychiatric and Substance Abuse) Hospitals.'],
  ['6231', 'Nursing Care Facilities (Skilled Nursing Facilities).'],
  ['6232', 'Residential Intellectual and Developmental Disability, Mental Health, and Substance Abuse Facilities.'],
  ['6233', 'Continuing Care Retirement Communities and Assisted Living Facilities for the Elderly'],
  ['6239', 'Other Residential Care Facilities.'],
  ['6242', 'Community Food and Housing, and Emergency and Other Relief Services.'],
  ['6243', 'Vocational Rehabilitation Services.'],
  ['7111', 'Performing Arts Companies.'],
  ['7112', 'Spectator Sports.'],
  ['7121', 'Museums, Historical Sites, and Similar Institutions.'],
  ['7131', 'Amusement Parks and Arcades.'],
  ['7132', 'Gambling Industries.'],
  ['7211', 'Traveler Accommodation.'],
  ['7212', 'RV (Recreational Vehicle) Parks and Recreational Camps.'],
  ['7223', 'Special Food Services.'],
  ['8113', 'Commercial and Industrial Machinery and Equipment (except Automotive and Electronic) Repair and Maintenance.'],
  ['8123', 'Drycleaning and Laundry Services.'],
];

// 29 CFR 1904 Appendix B — Designated Industries for §1904.41(a)(2)
// Source: 88 FR 47348 (July 21, 2023)
// Verbatim from docs/regulatory-sources/osha/29 CFR Part 1904 (up to date as of 5-07-2026).pdf
// (pages 37-39). All entries are four-digit NAICS codes.
const APPENDIX_B = [
  ['1111', 'Oilseed and Grain Farming.'],
  ['1112', 'Vegetable and Melon Farming.'],
  ['1113', 'Fruit and Tree Nut Farming.'],
  ['1114', 'Greenhouse, Nursery, and Floriculture Production.'],
  ['1119', 'Other Crop Farming.'],
  ['1121', 'Cattle Ranching and Farming.'],
  ['1122', 'Hog and Pig Farming.'],
  ['1123', 'Poultry and Egg Production.'],
  ['1129', 'Other Animal Production.'],
  ['1133', 'Logging.'],
  ['1141', 'Fishing.'],
  ['1142', 'Hunting and Trapping.'],
  ['1151', 'Support Activities for Crop Production.'],
  ['1152', 'Support Activities for Animal Production.'],
  ['1153', 'Support Activities for Forestry.'],
  ['2213', 'Water, Sewage and Other Systems.'],
  ['2381', 'Foundation, Structure, and Building Exterior Contractors.'],
  ['3111', 'Animal Food Manufacturing.'],
  ['3113', 'Sugar and Confectionery Product Manufacturing.'],
  ['3114', 'Fruit and Vegetable Preserving and Specialty Food Manufacturing.'],
  ['3115', 'Dairy Product Manufacturing.'],
  ['3116', 'Animal Slaughtering and Processing.'],
  ['3117', 'Seafood Product Preparation and Packaging.'],
  ['3118', 'Bakeries and Tortilla Manufacturing.'],
  ['3119', 'Other Food Manufacturing.'],
  ['3121', 'Beverage Manufacturing.'],
  ['3161', 'Leather and Hide Tanning and Finishing.'],
  ['3162', 'Footwear Manufacturing.'],
  ['3211', 'Sawmills and Wood Preservation.'],
  ['3212', 'Veneer, Plywood, and Engineered Wood Product Manufacturing.'],
  ['3219', 'Other Wood Product Manufacturing.'],
  ['3261', 'Plastics Product Manufacturing.'],
  ['3262', 'Rubber Product Manufacturing.'],
  ['3271', 'Clay Product and Refractory Manufacturing.'],
  ['3272', 'Glass and Glass Product Manufacturing.'],
  ['3273', 'Cement and Concrete Product Manufacturing.'],
  ['3279', 'Other Nonmetallic Mineral Product Manufacturing.'],
  ['3312', 'Steel Product Manufacturing from Purchased Steel.'],
  ['3314', 'Nonferrous Metal (except Aluminum) Production and Processing.'],
  ['3315', 'Foundries.'],
  ['3321', 'Forging and Stamping.'],
  ['3323', 'Architectural and Structural Metals Manufacturing.'],
  ['3324', 'Boiler, Tank, and Shipping Container Manufacturing.'],
  ['3325', 'Hardware Manufacturing.'],
  ['3326', 'Spring and Wire Product Manufacturing.'],
  ['3327', 'Machine Shops; Turned Product; and Screw, Nut, and Bolt Manufacturing.'],
  ['3328', 'Coating, Engraving, Heat Treating, and Allied Activities.'],
  ['3331', 'Agriculture, Construction, and Mining Machinery Manufacturing.'],
  ['3335', 'Metalworking Machinery Manufacturing.'],
  ['3361', 'Motor Vehicle Manufacturing.'],
  ['3362', 'Motor Vehicle Body and Trailer Manufacturing.'],
  ['3363', 'Motor Vehicle Parts Manufacturing.'],
  ['3366', 'Ship and Boat Building.'],
  ['3371', 'Household and Institutional Furniture and Kitchen Cabinet Manufacturing.'],
  ['3372', 'Office Furniture (including Fixtures) Manufacturing.'],
  ['3379', 'Other Furniture Related Product Manufacturing.'],
  ['4231', 'Motor Vehicle and Motor Vehicle Parts and Supplies Merchant Wholesalers.'],
  ['4233', 'Lumber and Other Construction Materials Merchant Wholesalers.'],
  ['4235', 'Metal and Mineral (except Petroleum) Merchant Wholesalers.'],
  ['4239', 'Miscellaneous Durable Goods Merchant Wholesalers.'],
  ['4244', 'Grocery and Related Product Merchant Wholesalers.'],
  ['4248', 'Beer, Wine, and Distilled Alcoholic Beverage Merchant Wholesalers.'],
  ['4413', 'Automotive Parts, Accessories, and Tire Stores.'],
  ['4422', 'Home Furnishings Stores.'],
  ['4441', 'Building Material and Supplies Dealers.'],
  ['4442', 'Lawn and Garden Equipment and Supplies Stores.'],
  ['4451', 'Grocery Stores.'],
  ['4522', 'Department Stores.'],
  ['4523', 'General Merchandise Stores, including Warehouse Clubs and Supercenters.'],
  ['4533', 'Used Merchandise Stores.'],
  ['4543', 'Direct Selling Establishments.'],
  ['4811', 'Scheduled Air Transportation.'],
  ['4841', 'General Freight Trucking.'],
  ['4842', 'Specialized Freight Trucking.'],
  ['4851', 'Urban Transit Systems.'],
  ['4852', 'Interurban and Rural Bus Transportation.'],
  ['4853', 'Taxi and Limousine Service.'],
  ['4854', 'School and Employee Bus Transportation.'],
  ['4859', 'Other Transit and Ground Passenger Transportation.'],
  ['4871', 'Scenic and Sightseeing Transportation, Land.'],
  ['4881', 'Support Activities for Air Transportation.'],
  ['4883', 'Support Activities for Water Transportation.'],
  ['4889', 'Other Support Activities for Transportation.'],
  ['4911', 'Postal Service.'],
  ['4921', 'Couriers and Express Delivery Services.'],
  ['4931', 'Warehousing and Storage.'],
  ['5322', 'Consumer Goods Rental.'],
  ['5621', 'Waste Collection.'],
  ['5622', 'Waste Treatment and Disposal.'],
  ['6219', 'Other Ambulatory Health Care Services.'],
  ['6221', 'General Medical and Surgical Hospitals.'],
  ['6222', 'Psychiatric and Substance Abuse Hospitals.'],
  ['6223', 'Specialty (except Psychiatric and Substance Abuse) Hospitals.'],
  ['6231', 'Nursing Care Facilities (Skilled Nursing Facilities).'],
  ['6232', 'Residential Intellectual and Developmental Disability, Mental Health, and Substance Abuse Facilities.'],
  ['6233', 'Continuing Care Retirement Communities and Assisted Living Facilities for the Elderly.'],
  ['6239', 'Other Residential Care Facilities.'],
  ['6243', 'Vocational Rehabilitation Services.'],
  ['7111', 'Performing Arts Companies.'],
  ['7112', 'Spectator Sports.'],
  ['7131', 'Amusement Parks and Arcades.'],
  ['7211', 'Traveler Accommodation.'],
  ['7212', 'RV (Recreational Vehicle) Parks and Recreational Camps.'],
  ['7223', 'Special Food Services.'],
];

// --- Match helpers ---

function findInAppendix(appendix, naicsCode) {
  if (!naicsCode) return null;
  const code = String(naicsCode).trim();
  if (!code) return null;
  // Exact match first (works for 4-digit entries AND for our split
  // two-digit Manufacturing entries '31'/'32'/'33').
  const exact = appendix.find(([c]) => c === code);
  if (exact) return { naics: exact[0], label: exact[1] };
  // Two-digit prefix match (Appendix A's '11', '22', '23', '42' cover
  // entire sectors). Iterate two-digit entries only.
  const twoDigit = appendix.filter(([c]) => c.length === 2);
  const prefix = code.slice(0, 2);
  const matched = twoDigit.find(([c]) => c === prefix);
  if (matched) return { naics: matched[0], label: matched[1] };
  return null;
}

/**
 * Determine ITA submission requirement for an establishment.
 *
 * Inputs:
 *   naicsCode (string) — NAICS code from sites.naics_code (2/4/6 digits)
 *   annualEmployees (integer) — peak headcount last CY per 1904.41(b)(2)
 *
 * Returns:
 *   { required: bool,
 *     submission_type: '300A' | '300A+300+301' | 'none',
 *     reason: 'appendix_a' | 'appendix_b' | 'large_employer' | 'below_threshold' | 'unknown_naics',
 *     appendix: 'A' | 'B' | null,
 *     matched_naics: string | null,
 *     matched_label: string | null,
 *     reg_ref: '1904.41(a)(1)(i)' | '1904.41(a)(1)(ii)' | '1904.41(a)(2)' | null }
 */
export function itaDesignation(naicsCode, annualEmployees) {
  const employees = Number(annualEmployees);
  if (!Number.isFinite(employees) || employees < 0) {
    return {
      required: false, submission_type: 'none',
      reason: 'below_threshold', appendix: null,
      matched_naics: null, matched_label: null, reg_ref: null,
    };
  }

  // 1904.41(a)(2): 100+ employees in Appendix B → 300A + 300 + 301.
  // Checked first because submission_type is the most expansive.
  if (employees >= 100) {
    const m = findInAppendix(APPENDIX_B, naicsCode);
    if (m) {
      return {
        required: true, submission_type: '300A+300+301',
        reason: 'appendix_b', appendix: 'B',
        matched_naics: m.naics, matched_label: m.label,
        reg_ref: '1904.41(a)(2)',
      };
    }
  }

  // 1904.41(a)(1)(ii): 250+ employees in ANY industry that keeps records.
  if (employees >= 250) {
    return {
      required: true, submission_type: '300A',
      reason: 'large_employer', appendix: null,
      matched_naics: null, matched_label: null,
      reg_ref: '1904.41(a)(1)(ii)',
    };
  }

  // 1904.41(a)(1)(i): 20-249 employees in Appendix A.
  if (employees >= 20 && employees <= 249) {
    const m = findInAppendix(APPENDIX_A, naicsCode);
    if (m) {
      return {
        required: true, submission_type: '300A',
        reason: 'appendix_a', appendix: 'A',
        matched_naics: m.naics, matched_label: m.label,
        reg_ref: '1904.41(a)(1)(i)',
      };
    }
  }

  // Otherwise: not routinely required (1904.41(b)(1)). The reg also
  // allows OSHA to request data ad-hoc under (a)(3); v1 doesn't model
  // that — it's an inbound notification, not a routine submission.
  return {
    required: false, submission_type: 'none',
    reason: naicsCode ? 'below_threshold' : 'unknown_naics',
    appendix: null,
    matched_naics: null, matched_label: null, reg_ref: null,
  };
}

// Exported for tests.
export const _internal = { APPENDIX_A, APPENDIX_B, findInAppendix };
