// server/services/csv/osha_ita.js — WI-02 OSHA ITA (Injury Tracking
// Application) Establishment + 300A summary CSV exporter.
//
// 29 CFR 1904.41 — electronic submission of injury and illness records.
// Format spec source: docs/regulatory-sources/osha/ita-300a-csv-spec.pdf
// (8 pages, "Injury Tracking Application CSV Documentation"). Column
// headers source: docs/regulatory-sources/osha/osha_ita_summary_data_csv_template-revised.csv.
//
// Per the owner directive, column headers are taken VERBATIM from the
// template, not derived from data-model field names. The data
// dictionary (spec PDF p.4) calls the EIN element `ein_number`; the
// template header is `ein`. The template wins. If OSHA ever realigns
// the template to match the dictionary, this constant is the migration
// point.
//
// Encoding rules (ITA spec p.1, RFC 4180-compliant):
//   • Fields containing commas, double-quotes, CR, or LF wrap in
//     double-quotes.
//   • Embedded double-quotes are doubled (escape as "").
//   • No apostrophe doubling. The apostrophe-prefix advice on spec p.2
//     is an Excel UI workaround for end users entering data manually,
//     not a CSV-encoding rule. Programmatic output must not apply it —
//     it would corrupt the actual submission.
//   • Leading-zero preservation: quote `zip` and `ein` unconditionally
//     (RFC 4180-compliant parsers — including OSHA's ingest — preserve
//     the quoted-string value as-is).
//
// Value rules (ITA spec p.5):
//   • size: 1 / 21 / 22 / 3 (non-contiguous codes per 2023-10-17
//     changelog).
//   • establishment_type: 1 / 2 / 3 with the verbatim wording
//     "not a government entity" / "State Government entity" /
//     "Local Government entity" (see osha_ita_validator.js).
//   • All number fields must be whole integers, no decimals (spec p.2).
//
// This exporter handles encoding ONLY. Cross-field validation lives in
// services/csv/osha_ita_validator.js and runs BEFORE the file is
// served — refusing to emit a CSV that OSHA would reject.

// ============================================================
// Column headers — verbatim from osha_ita_summary_data_csv_template-revised.csv
// ============================================================
// Spec sanity: 28 columns total. Exceeding causes OSHA ingest rejection.
export const ITA_CSV_HEADERS = [
  'establishment_name',
  'ein',                          // template name (data dictionary calls it ein_number; template wins)
  'company_name',
  'street_address',
  'city',
  'state',
  'zip',
  'naics_code',
  'industry_description',
  'size',
  'establishment_type',
  'year_filing_for',
  'annual_average_employees',
  'total_hours_worked',
  'no_injuries_illnesses',
  'total_deaths',
  'total_dafw_cases',             // ITA naming: dafw = days away from work
  'total_djtr_cases',             // ITA naming: djtr = days job transfer or restriction
  'total_other_cases',
  'total_dafw_days',
  'total_djtr_days',
  'total_injuries',
  'total_skin_disorders',
  'total_respiratory_conditions', // ITA spec p.7 — full name; matches template header
  'total_poisonings',
  'total_hearing_loss',
  'total_other_illnesses',
  'change_reason',
];

// Fields where we ALWAYS wrap in double-quotes to preserve leading
// zeros (spec p.2 FAQ + spec p.4 zip field "Must be a five or nine
// digit number").
const ALWAYS_QUOTE_FIELDS = new Set(['ein', 'zip']);

// RFC 4180 escape: quote-wrap if value contains delimiter, quote, CR,
// or LF; double any embedded double-quotes. See ITA spec p.1.
function escapeCsvField(value, fieldName) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  const needsQuote =
    ALWAYS_QUOTE_FIELDS.has(fieldName) ||
    /[",\r\n]/.test(s);
  if (!needsQuote) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

// ============================================================
// Build a row from a certified-snapshot record
// ============================================================
//
// Inputs:
//   snapshot — row from osha_300a_certified_summaries (already includes
//              establishment_name, address, naics_code, ein, totals).
//   extra    — { company_name, state, city, zip, industry_description,
//                size, establishment_type, change_reason }
//
// The route layer is responsible for splitting establishment_address
// into city/state/zip OR sourcing them separately. v1 of the FE asks
// the user to confirm those at export time (with sensible parsing
// guesses pre-filled).

export function buildItaRow(snapshot, extra = {}) {
  return {
    establishment_name: snapshot.establishment_name || '',
    ein: snapshot.ein || extra.ein || '',
    company_name: extra.company_name || '',
    street_address: snapshot.establishment_address || extra.street_address || '',
    city: extra.city || '',
    state: extra.state || '',
    zip: extra.zip || '',
    naics_code: snapshot.naics_code || '',
    industry_description: extra.industry_description || '',
    size: extra.size,                    // integer 1/21/22/3 — validator enforces
    establishment_type: extra.establishment_type, // integer 1/2/3
    year_filing_for: snapshot.period_year,
    annual_average_employees: snapshot.annual_avg_employees,
    total_hours_worked: snapshot.total_hours_worked,
    // no_injuries_illnesses: 1 = had cases, 2 = no cases. Spec p.6.
    no_injuries_illnesses: (
      snapshot.total_deaths +
      snapshot.total_days_away_cases +
      snapshot.total_job_transfer_cases +
      snapshot.total_other_recordable_cases
    ) > 0 ? 1 : 2,
    total_deaths: snapshot.total_deaths,
    total_dafw_cases: snapshot.total_days_away_cases,
    total_djtr_cases: snapshot.total_job_transfer_cases,
    total_other_cases: snapshot.total_other_recordable_cases,
    total_dafw_days: snapshot.total_days_away,
    total_djtr_days: snapshot.total_days_restricted,
    total_injuries: snapshot.total_injuries,
    total_skin_disorders: snapshot.total_skin_disorders,
    total_respiratory_conditions: snapshot.total_respiratory,
    total_poisonings: snapshot.total_poisonings,
    total_hearing_loss: snapshot.total_hearing_loss,
    total_other_illnesses: snapshot.total_other_illnesses,
    change_reason: extra.change_reason || '',
  };
}

/**
 * Serialise one or more rows to ITA CSV format.
 *   rows: array of objects keyed by ITA_CSV_HEADERS.
 *
 * Returns a string ready to send as text/csv. Caller (route layer)
 * is responsible for running validateItaSubmission() on each row
 * BEFORE calling this — we don't quietly emit a CSV OSHA would reject.
 */
export function generateItaCsv(rows) {
  const headerLine = ITA_CSV_HEADERS.join(',');
  const dataLines = rows.map(row =>
    ITA_CSV_HEADERS.map(h => escapeCsvField(row[h], h)).join(',')
  );
  // ITA spec doesn't specify a line terminator. RFC 4180 says CRLF; we
  // emit CRLF for maximum compatibility with the OSHA ingest pipeline
  // (which likely runs on Windows IIS infrastructure).
  return [headerLine, ...dataLines].join('\r\n') + '\r\n';
}

// Exposed for unit tests + the validator to share the same escape
// logic.
export const _internal = { escapeCsvField };
