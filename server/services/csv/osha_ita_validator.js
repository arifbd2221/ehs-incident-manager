// server/services/csv/osha_ita_validator.js — pre-export validation
// for OSHA ITA submission rows. Spec source:
// docs/regulatory-sources/osha/ita-300a-csv-spec.pdf.
//
// Refuses to generate a CSV that OSHA would reject. Returns structured
// errors keyed by field with verbatim spec-page citations.
//
// Rules implemented:
//   Per-field rules (spec pp. 4-7):
//     • establishment_name — required, Character ≤ 100
//     • ein — required, exactly 9 digits, no dashes
//     • company_name — optional, ≤ 100
//     • street_address — required, ≤ 100, must not contain "PO Box"
//     • city — required, ≤ 100
//     • state — required, exactly 2 chars
//     • zip — required, 5 or 9 digits
//     • naics_code — required, exactly 6 digits
//     • industry_description — optional, ≤ 300
//     • size — required, value in {1, 21, 22, 3} (non-contiguous per
//       2023-10-17 changelog: <20 / 20-99 / 100-249 / 250+)
//     • establishment_type — required, value in {1, 2, 3} with the
//       verbatim wording "not a government entity" /
//       "State Government entity" / "Local Government entity"
//     • year_filing_for — required, 4-digit integer
//     • annual_average_employees — required integer > 0, < 25000
//     • total_hours_worked — required integer > 0
//     • no_injuries_illnesses — required, value in {1, 2}
//     • total_deaths / total_dafw_cases / total_djtr_cases /
//       total_other_cases / total_dafw_days / total_djtr_days /
//       total_injuries / total_skin_disorders /
//       total_respiratory_conditions / total_poisonings /
//       total_hearing_loss / total_other_illnesses — required integer
//       ≥ 0, no decimals (spec p.2 FAQ — decimals trigger rejection)
//     • change_reason — optional, ≤ 100
//
//   Cross-field rules (spec p.8):
//     1. Σ(M1..M6) == Σ(G..J)
//     2. annual_average_employees > Σ(G..J)
//     3. H > 0 → K > 0
//     4. K > 0 → H > 0
//     5. K ≥ H
//     6. I > 0 → L > 0
//     7. L > 0 → (H + I) > 0
//
//   Reasonability bounds (spec p.6):
//     • total_hours_worked / annual_average_employees < 8760
//     • total_hours_worked / annual_average_employees > 500

const SIZE_VALID = new Set([1, 21, 22, 3]);

const ESTABLISHMENT_TYPE_LABELS = {
  1: 'not a government entity',
  2: 'State Government entity',
  3: 'Local Government entity',
};

const LENGTH_LIMITS = {
  establishment_name: 100,
  ein: 9,
  company_name: 100,
  street_address: 100,
  city: 100,
  state: 2,
  zip: 9,
  naics_code: 6,
  industry_description: 300,
  change_reason: 100,
};

const REQUIRED_FIELDS = [
  'establishment_name', 'ein', 'street_address', 'city', 'state', 'zip',
  'naics_code', 'size', 'year_filing_for',
  'annual_average_employees', 'total_hours_worked', 'no_injuries_illnesses',
  'total_deaths', 'total_dafw_cases', 'total_djtr_cases', 'total_other_cases',
  'total_dafw_days', 'total_djtr_days',
  'total_injuries', 'total_skin_disorders', 'total_respiratory_conditions',
  'total_poisonings', 'total_hearing_loss', 'total_other_illnesses',
];

const NON_NEGATIVE_INT_FIELDS = [
  'total_deaths', 'total_dafw_cases', 'total_djtr_cases', 'total_other_cases',
  'total_dafw_days', 'total_djtr_days',
  'total_injuries', 'total_skin_disorders', 'total_respiratory_conditions',
  'total_poisonings', 'total_hearing_loss', 'total_other_illnesses',
];

function isInteger(value) {
  if (value === null || value === undefined || value === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && Math.floor(n) === n;
}

function isAllDigits(value, count) {
  if (value === null || value === undefined) return false;
  const s = String(value);
  return new RegExp(`^\\d{${count}}$`).test(s);
}

/**
 * Validate a single ITA submission row.
 *
 * Returns { ok: true } on pass, or
 *   { ok: false, errors: [ { field, message, spec_ref } ] }
 *
 * The route layer refuses to serve the CSV on any failure.
 */
export function validateItaSubmission(row) {
  const errors = [];
  const err = (field, message, spec_ref) => errors.push({ field, message, spec_ref });

  // --- Required-field gate (spec pp.4-7 "Required" column = Yes) ---
  for (const f of REQUIRED_FIELDS) {
    if (row[f] === null || row[f] === undefined || String(row[f]).trim() === '') {
      err(f, `${f} is required.`, 'ITA spec pp.4-7');
    }
  }

  // --- Length limits (spec pp.4-7 "Length" column) ---
  for (const [field, max] of Object.entries(LENGTH_LIMITS)) {
    const v = row[field];
    if (v !== null && v !== undefined && String(v).length > max) {
      err(field, `${field} length ${String(v).length} exceeds spec maximum of ${max}.`, 'ITA spec pp.4-7');
    }
  }

  // --- EIN: exactly 9 digits, no dashes (spec p.4) ---
  if (row.ein && !isAllDigits(row.ein, 9)) {
    err('ein', 'ein must be exactly 9 digits with no dashes.', 'ITA spec p.4');
  }

  // --- Street address: no PO Box (spec p.4) ---
  if (row.street_address && /\bP\.?\s*O\.?\s*Box\b/i.test(String(row.street_address))) {
    err('street_address', 'street_address must not contain a PO Box address.', 'ITA spec p.4');
  }

  // --- State: 2 characters (spec p.4) ---
  if (row.state && String(row.state).length !== 2) {
    err('state', 'state must be the 2-character postal code.', 'ITA spec p.4');
  }

  // --- ZIP: 5 or 9 digits (spec p.4) ---
  if (row.zip && !(isAllDigits(row.zip, 5) || isAllDigits(row.zip, 9))) {
    err('zip', 'zip must be a 5- or 9-digit number.', 'ITA spec p.4');
  }

  // --- NAICS: 6 digits (spec p.5) ---
  if (row.naics_code && !isAllDigits(row.naics_code, 6)) {
    err('naics_code', 'naics_code must be a 6-digit NAICS code (2012, 2017, or 2022).', 'ITA spec p.5');
  }

  // --- size: non-contiguous codes per 2023-10-17 changelog (spec p.5) ---
  // 1 = <20 employees, 21 = 20-99, 22 = 100-249, 3 = 250+
  if (row.size !== undefined && row.size !== null && row.size !== '') {
    const sz = Number(row.size);
    if (!SIZE_VALID.has(sz)) {
      err('size',
        `size must be 1 (<20), 21 (20-99), 22 (100-249), or 3 (250+). Got: ${row.size}.`,
        'ITA spec p.5 — non-contiguous codes per 2023-10-17 changelog');
    }
  }

  // --- establishment_type: 1/2/3 with verbatim spec wording (spec p.5) ---
  if (row.establishment_type !== undefined && row.establishment_type !== null && row.establishment_type !== '') {
    const et = Number(row.establishment_type);
    if (!ESTABLISHMENT_TYPE_LABELS[et]) {
      err('establishment_type',
        `establishment_type must be 1 ("${ESTABLISHMENT_TYPE_LABELS[1]}"), 2 ("${ESTABLISHMENT_TYPE_LABELS[2]}"), or 3 ("${ESTABLISHMENT_TYPE_LABELS[3]}"). Got: ${row.establishment_type}.`,
        'ITA spec p.5');
    }
  }

  // --- year_filing_for: 4-digit integer (spec p.5) ---
  if (row.year_filing_for !== undefined && row.year_filing_for !== null && row.year_filing_for !== '') {
    if (!isAllDigits(row.year_filing_for, 4)) {
      err('year_filing_for', 'year_filing_for must be a 4-digit year.', 'ITA spec p.5');
    }
  }

  // --- annual_average_employees: > 0, < 25000, integer (spec p.5) ---
  if (row.annual_average_employees !== undefined && row.annual_average_employees !== null && row.annual_average_employees !== '') {
    if (!isInteger(row.annual_average_employees)) {
      err('annual_average_employees', 'annual_average_employees must be a whole-number integer (no decimals).', 'ITA spec p.5');
    } else {
      const v = Number(row.annual_average_employees);
      if (v <= 0) err('annual_average_employees', 'annual_average_employees must be > 0.', 'ITA spec p.5');
      if (v >= 25000) err('annual_average_employees', 'annual_average_employees should be < 25,000.', 'ITA spec p.5');
    }
  }

  // --- total_hours_worked: > 0, integer (spec p.6) ---
  if (row.total_hours_worked !== undefined && row.total_hours_worked !== null && row.total_hours_worked !== '') {
    if (!isInteger(row.total_hours_worked)) {
      err('total_hours_worked', 'total_hours_worked must be a whole-number integer (no decimals).', 'ITA spec p.6');
    } else if (Number(row.total_hours_worked) <= 0) {
      err('total_hours_worked', 'total_hours_worked must be > 0.', 'ITA spec p.6');
    }
  }

  // --- no_injuries_illnesses: 1 or 2 (spec p.6) ---
  if (row.no_injuries_illnesses !== undefined && row.no_injuries_illnesses !== null && row.no_injuries_illnesses !== '') {
    const v = Number(row.no_injuries_illnesses);
    if (v !== 1 && v !== 2) {
      err('no_injuries_illnesses', 'no_injuries_illnesses must be 1 (had cases) or 2 (no cases).', 'ITA spec p.6');
    }
  }

  // --- Non-negative integer fields (spec pp.6-7) ---
  // Decimals trigger OSHA rejection per spec p.2 FAQ.
  for (const f of NON_NEGATIVE_INT_FIELDS) {
    if (row[f] !== undefined && row[f] !== null && row[f] !== '') {
      if (!isInteger(row[f])) {
        err(f, `${f} must be a whole-number integer (no decimals — spec p.2 FAQ).`, 'ITA spec pp.6-7');
      } else if (Number(row[f]) < 0) {
        err(f, `${f} must be >= 0.`, 'ITA spec pp.6-7');
      }
    }
  }

  // ─── Cross-field rules (spec p.8) ─────────────────────────────────
  const G = Number(row.total_deaths) || 0;
  const H = Number(row.total_dafw_cases) || 0;
  const I = Number(row.total_djtr_cases) || 0;
  const J = Number(row.total_other_cases) || 0;
  const K = Number(row.total_dafw_days) || 0;
  const L = Number(row.total_djtr_days) || 0;
  const M1 = Number(row.total_injuries) || 0;
  const M2 = Number(row.total_skin_disorders) || 0;
  const M3 = Number(row.total_respiratory_conditions) || 0;
  const M4 = Number(row.total_poisonings) || 0;
  const M5 = Number(row.total_hearing_loss) || 0;
  const M6 = Number(row.total_other_illnesses) || 0;
  const sumCases = G + H + I + J;
  const sumTypes = M1 + M2 + M3 + M4 + M5 + M6;
  const employees = Number(row.annual_average_employees) || 0;

  // Rule 1: Σ(M1..M6) == Σ(G..J)
  if (sumTypes !== sumCases) {
    err('total_injuries',
      `Sum of Injury and Illness Types (M1..M6 = ${sumTypes}) must equal sum of Number of Cases (G..J = ${sumCases}). Spec p.8 rule 1.`,
      'ITA spec p.8');
  }
  // Rule 2: annual_average_employees > Σ(G..J)
  if (employees > 0 && employees <= sumCases) {
    err('annual_average_employees',
      `annual_average_employees (${employees}) should be greater than the total number of cases (G..J = ${sumCases}). Spec p.8 rule 2.`,
      'ITA spec p.8');
  }
  // Rule 3 / 4: H and K co-occur
  if (H > 0 && K <= 0) {
    err('total_dafw_days',
      'If there are cases with days away from work (H), there must be days away from work (K). Spec p.8 rule 3.',
      'ITA spec p.8');
  }
  if (K > 0 && H <= 0) {
    err('total_dafw_cases',
      'If there are days away from work (K), there must be cases with days away from work (H). Spec p.8 rule 4.',
      'ITA spec p.8');
  }
  // Rule 5: K ≥ H
  if (K < H) {
    err('total_dafw_days',
      `Days away from work (K = ${K}) must be >= cases with days away from work (H = ${H}). Spec p.8 rule 5.`,
      'ITA spec p.8');
  }
  // Rule 6: I > 0 → L > 0
  if (I > 0 && L <= 0) {
    err('total_djtr_days',
      'If there are cases with job transfer or restriction (I), there must be days with job transfer or restriction (L). Spec p.8 rule 6.',
      'ITA spec p.8');
  }
  // Rule 7: L > 0 → (H + I) > 0
  if (L > 0 && (H + I) <= 0) {
    err('total_dafw_cases',
      'If there are days with job transfer or restriction (L), there must be cases reported under H or I. Spec p.8 rule 7.',
      'ITA spec p.8');
  }

  // Reasonability bounds: hours/employee (spec p.6)
  if (employees > 0 && Number(row.total_hours_worked) > 0) {
    const hoursPerEmployee = Number(row.total_hours_worked) / employees;
    if (hoursPerEmployee >= 8760) {
      err('total_hours_worked',
        `total_hours_worked / annual_average_employees (${hoursPerEmployee.toFixed(1)}) must be < 8,760 (hours in a year per employee). Spec p.6.`,
        'ITA spec p.6');
    }
    if (hoursPerEmployee <= 500) {
      err('total_hours_worked',
        `total_hours_worked / annual_average_employees (${hoursPerEmployee.toFixed(1)}) should be > 500. Spec p.6.`,
        'ITA spec p.6');
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// Exposed for tests + the route layer's enum help text.
export const _internal = { ESTABLISHMENT_TYPE_LABELS, SIZE_VALID };
