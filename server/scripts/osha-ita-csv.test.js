// server/scripts/osha-ita-csv.test.js — node:test unit suite for the
// OSHA ITA CSV exporter, validator, and 1904.41 designation helper.
//
// Three areas tested:
//   1. Column-header parity with the official OSHA template (this is
//      the regression gate — if OSHA changes the template and we don't
//      update ITA_CSV_HEADERS, this test fires).
//   2. Validator rules: per-field + cross-field (spec p.8 rules 1–7) +
//      reasonability bounds.
//   3. itaDesignation() logic against Appendix A + B + the 250+ general
//      case + the not-required cases.
//
// Pure functional — no DB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ITA_CSV_HEADERS, generateItaCsv, buildItaRow, _internal as csvInternal }
  from '../services/csv/osha_ita.js';
import { validateItaSubmission }
  from '../services/csv/osha_ita_validator.js';
import { itaDesignation, _internal as desigInternal }
  from '../services/osha_ita_designation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(
  __dirname, '..', '..',
  'docs', 'regulatory-sources', 'osha',
  'osha_ita_summary_data_csv_template-revised.csv',
);

// =================================================================
// 1. Column-header parity — the spec-drift regression gate
// =================================================================

test('ITA CSV column headers match the OSHA template byte-for-byte', () => {
  const templateText = readFileSync(TEMPLATE_PATH, 'utf8');
  // First line of the template = the official header row. Strip BOM,
  // trim CR/LF.
  const firstLine = templateText.replace(/^﻿/, '').split(/\r?\n/)[0];
  const templateHeaders = firstLine.split(',');
  assert.equal(templateHeaders.length, 28, 'Template should have 28 columns per ITA spec');
  assert.deepEqual(
    ITA_CSV_HEADERS,
    templateHeaders,
    'ITA_CSV_HEADERS in services/csv/osha_ita.js must match docs/regulatory-sources/osha/osha_ita_summary_data_csv_template-revised.csv exactly. If they have drifted, OSHA likely updated the template and ITA_CSV_HEADERS needs updating.',
  );
});

test('generateItaCsv emits the same header row as the OSHA template', () => {
  const csv = generateItaCsv([]);
  const firstLine = csv.split(/\r?\n/)[0];
  const templateText = readFileSync(TEMPLATE_PATH, 'utf8');
  const templateFirst = templateText.replace(/^﻿/, '').split(/\r?\n/)[0];
  assert.equal(firstLine, templateFirst);
});

// =================================================================
// 2. CSV encoding (RFC 4180)
// =================================================================

test('escapeCsvField — plain value, no quoting needed', () => {
  assert.equal(csvInternal.escapeCsvField('Worker Plant', 'establishment_name'), 'Worker Plant');
});

test('escapeCsvField — value with comma gets quoted', () => {
  assert.equal(csvInternal.escapeCsvField('1, 2, 3 Street', 'street_address'), '"1, 2, 3 Street"');
});

test('escapeCsvField — embedded double-quote gets doubled (RFC 4180)', () => {
  // "123 & 4 Street" → ""123 & 4 Street""  (inside the wrapping quotes)
  // Full output: """123 & 4 Street"""
  assert.equal(
    csvInternal.escapeCsvField('"123 & 4 Street"', 'street_address'),
    '"""123 & 4 Street"""',
  );
});

test('escapeCsvField — apostrophe is NOT doubled (RFC 4180 is silent on apostrophes)', () => {
  // O'Brien → O'Brien (no encoding change). The spec p.2 FAQ apostrophe
  // advice is an Excel UI workaround, NOT a CSV encoding rule.
  assert.equal(csvInternal.escapeCsvField("O'Brien", 'company_name'), "O'Brien");
});

test('escapeCsvField — zip always quoted to preserve leading zero', () => {
  assert.equal(csvInternal.escapeCsvField('01234', 'zip'), '"01234"');
  assert.equal(csvInternal.escapeCsvField('012345678', 'zip'), '"012345678"');
});

test('escapeCsvField — ein always quoted to preserve leading zero', () => {
  assert.equal(csvInternal.escapeCsvField('012345678', 'ein'), '"012345678"');
});

// =================================================================
// 3. Validator — per-field rules
// =================================================================

const goodRow = {
  establishment_name: 'Acme Plant',
  ein: '123456789',
  company_name: 'Acme Corp',
  street_address: '100 Industrial Blvd',
  city: 'Cleveland',
  state: 'OH',
  zip: '44114',
  naics_code: '331110',
  industry_description: 'Iron and Steel Mills',
  size: 22,
  establishment_type: 1,
  year_filing_for: '2026',
  annual_average_employees: 150,
  total_hours_worked: 300000,
  no_injuries_illnesses: 1,
  total_deaths: 0,
  total_dafw_cases: 3,
  total_djtr_cases: 2,
  total_other_cases: 1,
  total_dafw_days: 25,
  total_djtr_days: 14,
  total_injuries: 4,
  total_skin_disorders: 0,
  total_respiratory_conditions: 1,
  total_poisonings: 0,
  total_hearing_loss: 0,
  total_other_illnesses: 1,
  change_reason: '',
};

test('validateItaSubmission — known-good row passes', () => {
  const r = validateItaSubmission(goodRow);
  assert.equal(r.ok, true, r.errors ? JSON.stringify(r.errors, null, 2) : '');
});

test('validateItaSubmission — missing required field fails', () => {
  const r = validateItaSubmission({ ...goodRow, ein: '' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'ein' && /required/.test(e.message)));
});

test('validateItaSubmission — EIN must be 9 digits, no dashes', () => {
  const r = validateItaSubmission({ ...goodRow, ein: '12-3456789' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'ein' && /9 digits/i.test(e.message)));
});

test('validateItaSubmission — PO Box in street_address rejected', () => {
  const r = validateItaSubmission({ ...goodRow, street_address: 'PO Box 4242' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'street_address' && /PO Box/i.test(e.message)));
});

test('validateItaSubmission — ZIP 5 or 9 digits accepted, 6 rejected', () => {
  assert.equal(validateItaSubmission({ ...goodRow, zip: '44114' }).ok, true);
  assert.equal(validateItaSubmission({ ...goodRow, zip: '441140000' }).ok, true);
  const r = validateItaSubmission({ ...goodRow, zip: '441140' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'zip'));
});

test('validateItaSubmission — NAICS must be exactly 6 digits', () => {
  const r = validateItaSubmission({ ...goodRow, naics_code: '3311' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'naics_code'));
});

test('validateItaSubmission — size must be in {1, 21, 22, 3}', () => {
  for (const s of [1, 21, 22, 3]) {
    // size=1 case needs employees < 20 to pass rule 2; bump down for that
    const adj = s === 1 ? { ...goodRow, size: s, annual_average_employees: 15, total_dafw_cases: 0, total_djtr_cases: 0, total_other_cases: 0, total_dafw_days: 0, total_djtr_days: 0, total_injuries: 0, total_respiratory_conditions: 0, total_other_illnesses: 0, no_injuries_illnesses: 2, total_hours_worked: 25000 } : { ...goodRow, size: s };
    const r = validateItaSubmission(adj);
    assert.equal(r.ok, true, `size=${s} should pass: ${JSON.stringify(r.errors)}`);
  }
  const bad = validateItaSubmission({ ...goodRow, size: 2 });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some(e => e.field === 'size' && /non-contiguous/i.test(e.spec_ref)));
});

test('validateItaSubmission — establishment_type must be 1/2/3 with spec wording in error', () => {
  const r = validateItaSubmission({ ...goodRow, establishment_type: 4 });
  assert.equal(r.ok, false);
  const e = r.errors.find(x => x.field === 'establishment_type');
  assert.ok(e, 'should have establishment_type error');
  assert.ok(/not a government entity/i.test(e.message));
  assert.ok(/State Government entity/i.test(e.message));
  assert.ok(/Local Government entity/i.test(e.message));
});

test('validateItaSubmission — decimals in number fields fail (spec p.2 FAQ)', () => {
  const r = validateItaSubmission({ ...goodRow, total_dafw_days: 25.5 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'total_dafw_days' && /no decimals/i.test(e.message)));
});

// =================================================================
// 4. Validator — cross-field rules (spec p.8)
// =================================================================

test('cross-field rule 1: Σ(M1..M6) must equal Σ(G..J)', () => {
  // goodRow has G+H+I+J = 0+3+2+1 = 6; M1..M6 = 4+0+1+0+0+1 = 6. OK.
  // Drop M1 to 3 → totals diverge → fail.
  const r = validateItaSubmission({ ...goodRow, total_injuries: 3 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /Sum of Injury and Illness Types/i.test(e.message) && e.spec_ref === 'ITA spec p.8'));
});

test('cross-field rule 2: annual_average_employees > Σ(G..J)', () => {
  // 5 employees vs 6 cases → rule 2 fail. Need to keep M=cases too.
  const r = validateItaSubmission({ ...goodRow, annual_average_employees: 5, total_hours_worked: 5000 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /greater than the total number of cases/i.test(e.message)));
});

test('cross-field rule 3: H > 0 → K > 0', () => {
  const r = validateItaSubmission({ ...goodRow, total_dafw_days: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'total_dafw_days' && /K/.test(e.message)));
});

test('cross-field rule 4: K > 0 → H > 0', () => {
  const r = validateItaSubmission({ ...goodRow, total_dafw_cases: 0, total_injuries: 1 /* keep M = G..J */ });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'total_dafw_cases'));
});

test('cross-field rule 5: K >= H', () => {
  // H=3 with K=2 (less than H) → fail.
  const r = validateItaSubmission({ ...goodRow, total_dafw_days: 2 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /must be >= cases with days away/i.test(e.message)));
});

test('cross-field rule 6: I > 0 → L > 0', () => {
  const r = validateItaSubmission({ ...goodRow, total_djtr_days: 0 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.field === 'total_djtr_days'));
});

test('cross-field rule 7: L > 0 → (H + I) > 0', () => {
  // Need M sum to also equal G..J for rule 1.
  const r = validateItaSubmission({
    ...goodRow,
    total_dafw_cases: 0,
    total_djtr_cases: 0,
    total_dafw_days: 0,
    total_djtr_days: 5,    // L > 0 but H+I = 0
    total_other_cases: 1,
    total_deaths: 0,
    total_injuries: 1, total_skin_disorders: 0, total_respiratory_conditions: 0,
    total_poisonings: 0, total_hearing_loss: 0, total_other_illnesses: 0,
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /reported under H or I/i.test(e.message)));
});

// =================================================================
// 5. Validator — reasonability bounds (spec p.6)
// =================================================================

test('reasonability — hours / employees < 8760', () => {
  // 150 employees × 9000 hours = 1,350,000 → 9000/employee → over 8760
  const r = validateItaSubmission({ ...goodRow, total_hours_worked: 9000 * 150 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /< 8,760/.test(e.message)));
});

test('reasonability — hours / employees > 500', () => {
  // 150 employees × 100 hours = 15,000 → 100/employee → under 500
  const r = validateItaSubmission({ ...goodRow, total_hours_worked: 100 * 150 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /> 500/.test(e.message)));
});

// =================================================================
// 6. buildItaRow + generateItaCsv integration
// =================================================================

test('buildItaRow + generateItaCsv produces a valid 2-line CSV', () => {
  const snapshot = {
    establishment_name: 'Acme Plant', establishment_address: '100 Industrial Blvd',
    naics_code: '331110', ein: '123456789',
    annual_avg_employees: 150, total_hours_worked: 300000, period_year: 2026,
    total_deaths: 0, total_days_away_cases: 3, total_job_transfer_cases: 2,
    total_other_recordable_cases: 1, total_days_away: 25, total_days_restricted: 14,
    total_injuries: 4, total_skin_disorders: 0, total_respiratory: 1,
    total_poisonings: 0, total_hearing_loss: 0, total_other_illnesses: 1,
  };
  const row = buildItaRow(snapshot, {
    company_name: 'Acme Corp', city: 'Cleveland', state: 'OH', zip: '44114',
    industry_description: 'Iron and Steel Mills', size: 22, establishment_type: 1,
  });
  const validation = validateItaSubmission(row);
  assert.equal(validation.ok, true, JSON.stringify(validation.errors));
  const csv = generateItaCsv([row]);
  const lines = csv.split(/\r\n/).filter(Boolean);
  assert.equal(lines.length, 2, 'header + 1 data line');
  // Verify ZIP and EIN are quoted (leading-zero preservation rule)
  assert.match(lines[1], /,"123456789",/);
  assert.match(lines[1], /,"44114",/);
});

// =================================================================
// 7. itaDesignation — 1904.41 logic
// =================================================================

test('itaDesignation — 250+ employees in any NAICS → 300A only (1904.41(a)(1)(ii))', () => {
  const r = itaDesignation('541110', 250);  // legal services, NOT in App A or B
  assert.equal(r.required, true);
  assert.equal(r.submission_type, '300A');
  assert.equal(r.reason, 'large_employer');
  assert.equal(r.reg_ref, '1904.41(a)(1)(ii)');
});

test('itaDesignation — 100+ in Appendix B → 300A+300+301 (1904.41(a)(2))', () => {
  const r = itaDesignation('3361', 150);  // motor vehicle manufacturing
  assert.equal(r.required, true);
  assert.equal(r.submission_type, '300A+300+301');
  assert.equal(r.appendix, 'B');
  assert.equal(r.reg_ref, '1904.41(a)(2)');
});

test('itaDesignation — 20-249 in Appendix A → 300A only (1904.41(a)(1)(i))', () => {
  const r = itaDesignation('4413', 50);  // Automotive Parts Stores — in Appendix A
  assert.equal(r.required, true);
  assert.equal(r.submission_type, '300A');
  assert.equal(r.appendix, 'A');
  assert.equal(r.reg_ref, '1904.41(a)(1)(i)');
  assert.equal(r.matched_naics, '4413');
});

test('itaDesignation — Manufacturing prefix (NAICS starts with 31-33)', () => {
  // 312345 is a 6-digit code starting with 31 → matches App A "31-33" range
  const r = itaDesignation('312345', 100);
  assert.equal(r.required, true);
  assert.equal(r.appendix, 'A');
  assert.equal(r.matched_naics, '31');
});

test('itaDesignation — under 20 employees → not required even in Appendix A', () => {
  const r = itaDesignation('4413', 15);
  assert.equal(r.required, false);
  assert.equal(r.reason, 'below_threshold');
});

test('itaDesignation — non-designated NAICS with < 250 employees → not required', () => {
  const r = itaDesignation('541110', 100);  // legal services
  assert.equal(r.required, false);
});

test('itaDesignation — unknown NAICS reports unknown_naics reason', () => {
  const r = itaDesignation('', 50);
  assert.equal(r.required, false);
  assert.equal(r.reason, 'unknown_naics');
});

// =================================================================
// 8. Appendix verbatim integrity (spot-check entries match the Act)
// =================================================================

test('Appendix A spot-check — entries match 88 FR 47347', () => {
  const { APPENDIX_A } = desigInternal;
  // Spot-check three entries the Act lists
  const m11 = APPENDIX_A.find(([c]) => c === '11');
  assert.deepEqual(m11, ['11', 'Agriculture, Forestry, Fishing and Hunting.']);
  const m4451 = APPENDIX_A.find(([c]) => c === '4451');
  assert.deepEqual(m4451, ['4451', 'Grocery Stores.']);
  const m8123 = APPENDIX_A.find(([c]) => c === '8123');
  assert.deepEqual(m8123, ['8123', 'Drycleaning and Laundry Services.']);
});

test('Appendix B spot-check — entries match 88 FR 47348', () => {
  const { APPENDIX_B } = desigInternal;
  const m1111 = APPENDIX_B.find(([c]) => c === '1111');
  assert.deepEqual(m1111, ['1111', 'Oilseed and Grain Farming.']);
  const m3315 = APPENDIX_B.find(([c]) => c === '3315');
  assert.deepEqual(m3315, ['3315', 'Foundries.']);
  const m7223 = APPENDIX_B.find(([c]) => c === '7223');
  assert.deepEqual(m7223, ['7223', 'Special Food Services.']);
});
