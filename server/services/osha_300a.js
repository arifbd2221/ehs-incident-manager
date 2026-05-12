// server/services/osha_300a.js — WI-02 OSHA Form 300A annual summary
// aggregation + certified-snapshot helpers.
//
// 29 CFR 1904.32 governs the annual summary. Key citations:
//   (b)(2)(i) — total the columns on the OSHA 300 Log
//   (b)(2)(ii) — enter calendar year, company / establishment info,
//                annual avg employees, total hours worked
//   (b)(3)    — a company executive must certify the summary
//   (b)(4)    — defines who is a "company executive" (four categories)
//   (b)(5)    — the posted summary must not be altered
//
// 29 CFR 1904.33(a) — retain the annual summary for 5 years after the
//   end of the calendar year it covers.
//
// Architectural shape:
//   • aggregate300A(orgId, siteId, periodYear) — pure read against the
//     live osha_300_log. Used for DRAFT view + as the input to a cert.
//   • createCertifiedSnapshot(...) — wraps the regulatory_certifications
//     INSERT + the osha_300a_certified_summaries INSERT in a single
//     transaction. Caller-supplied user-id + certifier_title_key are
//     validated before the tx opens.
//   • getCertifiedSnapshot(orgId, siteId, periodYear) — returns the
//     snapshot row (PDF + CSV exporters read from here).

import db from '../db/connection.js';
import { calculateMetrics } from './metrics.js';

// --- 1904.32(b)(4) certifier-title allowlist ---
// Internal key + verbatim Act label. Same dual-storage pattern as the
// WI-06 NSW lookup tables. UI presents these as a dropdown; the
// snapshot stores both fields.
export const CERTIFIER_TITLE_OPTIONS = [
  {
    key: 'owner',
    label: 'An owner of the company (only if the company is a sole proprietorship or partnership)',
    section_ref: '29 CFR 1904.32(b)(4)(i)',
  },
  {
    key: 'corporate_officer',
    label: 'An officer of the corporation',
    section_ref: '29 CFR 1904.32(b)(4)(ii)',
  },
  {
    key: 'highest_ranking_official',
    label: 'The highest ranking company official working at the establishment',
    section_ref: '29 CFR 1904.32(b)(4)(iii)',
  },
  {
    key: 'immediate_supervisor_of_highest_ranking',
    label: 'The immediate supervisor of the highest ranking company official working at the establishment',
    section_ref: '29 CFR 1904.32(b)(4)(iv)',
  },
];

const CERTIFIER_TITLE_BY_KEY = new Map(CERTIFIER_TITLE_OPTIONS.map(o => [o.key, o]));

// Verbatim 1904.32(b)(3) affirmation text. The UI shows it under a
// header reading "By signing, you affirm the following statement,
// made under 29 CFR 1904.32(b)(3):" — keeps the Act's exact words
// in front of the executive at sign-time.
export const OSHA_300A_AFFIRMATION_TEXT =
  'A company executive must certify that he or she has examined the OSHA 300 Log ' +
  'and that he or she reasonably believes, based on his or her knowledge of the ' +
  'process by which the information was recorded, that the annual summary is ' +
  'correct and complete.';

// Allowed values for the Form 300A column M-bucket. Mirrors the buckets
// from services/osha_300_helpers.js — keep aligned.
const M_BUCKETS = ['injury', 'skin_disorder', 'respiratory', 'poisoning', 'hearing_loss', 'all_other_illness'];

// ---------------------------------------------------------------------------
// Aggregate from live osha_300_log
// ---------------------------------------------------------------------------

/**
 * Compute the 12 column totals (G, H, I, J, K, L, M1..M6) plus the
 * sorted list of contributing osha_300_log row ids, for one
 * establishment / calendar year. Used both for the DRAFT view and as
 * the input to a certified snapshot.
 *
 * Returns the totals shape used by both the PDF renderer and the ITA
 * CSV exporter. Site / hours / employees are loaded by the caller from
 * sites + calculateMetrics — this helper deals strictly with the log.
 */
export function aggregate300A({ orgId, siteId, periodYear }) {
  const totals = db.prepare(`
    SELECT
      COALESCE(SUM(classification_death),         0) AS total_deaths,
      COALESCE(SUM(classification_days_away),     0) AS total_days_away_cases,
      COALESCE(SUM(classification_job_transfer),  0) AS total_job_transfer_cases,
      COALESCE(SUM(classification_other),         0) AS total_other_recordable_cases,
      COALESCE(SUM(days_away_count),              0) AS total_days_away,
      COALESCE(SUM(days_restricted_count),        0) AS total_days_restricted,
      COALESCE(SUM(CASE WHEN injury_type='injury'            THEN 1 ELSE 0 END), 0) AS total_injuries,
      COALESCE(SUM(CASE WHEN injury_type='skin_disorder'     THEN 1 ELSE 0 END), 0) AS total_skin_disorders,
      COALESCE(SUM(CASE WHEN injury_type='respiratory'       THEN 1 ELSE 0 END), 0) AS total_respiratory,
      COALESCE(SUM(CASE WHEN injury_type='poisoning'         THEN 1 ELSE 0 END), 0) AS total_poisonings,
      COALESCE(SUM(CASE WHEN injury_type='hearing_loss'      THEN 1 ELSE 0 END), 0) AS total_hearing_loss,
      COALESCE(SUM(CASE WHEN injury_type='all_other_illness' THEN 1 ELSE 0 END), 0) AS total_other_illnesses
    FROM osha_300_log
    WHERE org_id = ? AND site_id = ? AND calendar_year = ?
  `).get(orgId, siteId, periodYear);

  const caseIds = db.prepare(`
    SELECT id FROM osha_300_log
    WHERE org_id = ? AND site_id = ? AND calendar_year = ?
    ORDER BY case_number ASC, id ASC
  `).all(orgId, siteId, periodYear).map(r => r.id);

  return { ...totals, case_ids_snapshot: caseIds };
}

// ---------------------------------------------------------------------------
// Read certified snapshot
// ---------------------------------------------------------------------------

export function getCertifiedSnapshotForCert(orgId, certificationId) {
  return db.prepare(`
    SELECT s.*, rc.signed_at, rc.affirmation_text,
           rc.certifier_user_id, rc.certifier_title,
           u.name AS certifier_name, u.initials AS certifier_initials
    FROM osha_300a_certified_summaries s
    JOIN regulatory_certifications rc ON rc.id = s.certification_id
    LEFT JOIN users u ON u.id = rc.certifier_user_id
    WHERE s.org_id = ? AND s.certification_id = ?
  `).get(orgId, certificationId);
}

export function getCertifiedSnapshot(orgId, siteId, periodYear) {
  return db.prepare(`
    SELECT s.*, rc.signed_at, rc.affirmation_text,
           rc.certifier_user_id, rc.certifier_title,
           u.name AS certifier_name, u.initials AS certifier_initials
    FROM osha_300a_certified_summaries s
    JOIN regulatory_certifications rc ON rc.id = s.certification_id
    LEFT JOIN users u ON u.id = rc.certifier_user_id
    WHERE s.org_id = ? AND s.site_id = ? AND s.period_year = ?
    ORDER BY s.id DESC
    LIMIT 1
  `).get(orgId, siteId, periodYear);
}

// ---------------------------------------------------------------------------
// Create cert + snapshot atomically
// ---------------------------------------------------------------------------

/**
 * Inserts both the regulatory_certifications row AND the
 * osha_300a_certified_summaries snapshot in a single tx. Caller is
 * responsible for upstream validation (typed-name match, role gate,
 * site-belongs-to-org). Returns { certification_id, snapshot_id }.
 *
 * Throws if (site_id, period_year) is already certified — both the
 * partial UNIQUE on regulatory_certifications and the UNIQUE on
 * osha_300a_certified_summaries will fire.
 */
export function createCertifiedSnapshot({
  orgId, siteId, periodYear,
  certifierUserId, certifierTitleKey,
  ipAddress, userAgent,
  establishmentName, establishmentAddress, naicsCode, ein,
  annualAvgEmployees, totalHoursWorked,
  totals,                  // shape from aggregate300A()
}) {
  const titleOption = CERTIFIER_TITLE_BY_KEY.get(certifierTitleKey);
  if (!titleOption) {
    const e = new Error(
      `Invalid certifier_title_key: ${certifierTitleKey}. Must be one of ${[...CERTIFIER_TITLE_BY_KEY.keys()].join(', ')} per 29 CFR 1904.32(b)(4).`,
    );
    e.statusCode = 400;
    throw e;
  }

  return db.transaction(() => {
    const certResult = db.prepare(`
      INSERT INTO regulatory_certifications (
        type, site_id, period_year, certifier_user_id, certifier_title,
        affirmation_text, ip_address, user_agent
      ) VALUES ('osha_300a', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      siteId, periodYear, certifierUserId, titleOption.key,
      OSHA_300A_AFFIRMATION_TEXT, ipAddress || null, userAgent || null,
    );

    const snapshotResult = db.prepare(`
      INSERT INTO osha_300a_certified_summaries (
        certification_id, org_id, site_id, period_year,
        establishment_name, establishment_address, naics_code, ein,
        annual_avg_employees, total_hours_worked,
        total_deaths, total_days_away_cases, total_job_transfer_cases,
        total_other_recordable_cases, total_days_away, total_days_restricted,
        total_injuries, total_skin_disorders, total_respiratory,
        total_poisonings, total_hearing_loss, total_other_illnesses,
        case_ids_snapshot,
        certifier_title_key, certifier_title_label
      ) VALUES (?, ?, ?, ?,  ?, ?, ?, ?,  ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?)
    `).run(
      certResult.lastInsertRowid, orgId, siteId, periodYear,
      establishmentName, establishmentAddress || null, naicsCode || null, ein || null,
      annualAvgEmployees, totalHoursWorked,
      totals.total_deaths, totals.total_days_away_cases, totals.total_job_transfer_cases,
      totals.total_other_recordable_cases, totals.total_days_away, totals.total_days_restricted,
      totals.total_injuries, totals.total_skin_disorders, totals.total_respiratory,
      totals.total_poisonings, totals.total_hearing_loss, totals.total_other_illnesses,
      JSON.stringify(totals.case_ids_snapshot || []),
      titleOption.key, titleOption.label,
    );

    return {
      certification_id: certResult.lastInsertRowid,
      snapshot_id: snapshotResult.lastInsertRowid,
    };
  })();
}
