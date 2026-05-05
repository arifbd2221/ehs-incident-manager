// server/services/auto_classify.js — severity/track classification.
//
// Two functions:
//
//   calculateSeverityAndTrack(likelihood, consequence, type)
//     → existing matrix lookup (kept unchanged for back-compat with
//       incidents.js POST and the wizard's manual likelihood/consequence
//       picker). Returns {severity, track, riskLevel}.
//
//   inferSeverityFrom({ type, type_data, body_parts_affected, prior_incidents_count })
//     → NEW per locked decision #14: rule-based inference that proposes a
//       likelihood/consequence cell from already-known wizard fields.
//       Returns {suggested_likelihood, suggested_consequence, suggested_severity,
//                suggested_track, level_label, reasoning}.
//       Caller (wizard or POST handler) can pre-fill the matrix selection
//       with the suggestion; user can still override.
//
// Phase 2 W3 T3.1. Replaces classification.js, which now re-exports from here.

import { hasSpecifiedInjuryRegion } from './body_parts.js';

// Identical to the matrix that lived in classification.js. Source of truth
// for the cell map is the risk_matrix_cells table seeded by migration 001;
// this constant mirrors it for fast in-memory lookups during a single POST.
const RISK_MATRIX = [
  ['med',  'high', 'crit', 'crit', 'crit'],   // Almost Certain
  ['low',  'med',  'high', 'crit', 'crit'],   // Likely
  ['low',  'med',  'high', 'high', 'crit'],   // Possible
  ['low',  'low',  'med',  'high', 'high'],   // Unlikely
  ['low',  'low',  'med',  'med',  'high'],   // Rare
];

const SEV_MAP = { low: 5, med: 4, high: 3, crit: 2 };

const LIKELIHOOD_LABELS = ['Almost Certain', 'Likely', 'Possible', 'Unlikely', 'Rare'];
const CONSEQUENCE_LABELS = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];

const SEV_NAMES = {
  1: 'Critical',
  2: 'Major',
  3: 'Moderate',
  4: 'Minor',
  5: 'Insignificant',
};

function clampIdx(n) {
  return Math.max(0, Math.min(4, n ?? 2));
}

export function calculateSeverityAndTrack(likelihood, consequence, type) {
  const lIdx = clampIdx(likelihood);
  const cIdx = clampIdx(consequence);
  const key = RISK_MATRIX[lIdx][cIdx];
  let severity = SEV_MAP[key] ?? 3;

  if (type === 'dangerous') severity = Math.min(severity, 2);

  let track;
  if (severity <= 2) track = 'A';
  else if (severity === 3) track = 'B';
  else track = 'C';

  if (type === 'observation' && severity > 2) track = 'C';

  return { severity, track, riskLevel: key };
}

export function shouldAutoClose(type, severity, track) {
  return track === 'C' && (type === 'observation' || severity >= 5);
}

/**
 * Rule-based inference per locked decision #14.
 *
 * Inputs (all optional; missing fields just don't trigger their rule):
 *   type:                  'injury' | 'illness' | 'nearmiss' | ... (one of the 8 PRD types)
 *   type_data:             wizard's free-form per-type object (treatment list,
 *                          osha flags, days_away, illness_category, etc.)
 *   body_parts_affected:   array of region IDs from BodyMap3D (e.g. ['l_hand'])
 *   prior_incidents_count: int — count at the same asset (or site+area
 *                          fallback) in the last 12 months. Drives likelihood.
 *
 * Output:
 *   {
 *     suggested_likelihood:  0..4 (matrix index — 0=Almost Certain … 4=Rare)
 *     suggested_consequence: 0..4 (matrix index — 0=Insignificant … 4=Catastrophic)
 *     suggested_severity:    1..5
 *     suggested_track:       'A' | 'B' | 'C'
 *     level_label:           'low' | 'med' | 'high' | 'crit' (matrix cell)
 *     reasoning:             string — human-readable explanation surfaced in
 *                            the wizard tooltip and the activity log
 *   }
 */
export function inferSeverityFrom(input = {}) {
  const {
    type,
    type_data,
    body_parts_affected,
    prior_incidents_count = 0,
  } = input;

  const td = typeof type_data === 'string' ? JSON.parse(type_data || '{}') : (type_data || {});
  const treatments = td.treatment || td.treatments || [];
  const oshaFlags = td.osha_recordability || [];
  const daysAway = Number(td.osha_days_away) || 0;
  const reasons = [];

  // ---- Consequence floor (start at Minor by default) ----
  let consequenceIdx = 1; // Minor

  // Treatment-driven consequence floor
  if (treatments.includes('Fatality') || oshaFlags.includes('Death')) {
    consequenceIdx = 4; // Catastrophic
    reasons.push('Catastrophic: fatality reported');
  } else if (
    treatments.includes('Hospitalization') ||
    oshaFlags.includes('Loss of consciousness') ||
    oshaFlags.includes('Significant injury diagnosed by HCP')
  ) {
    consequenceIdx = Math.max(consequenceIdx, 3); // Major
    reasons.push('Major: hospitalization / LOC / HCP-diagnosed significant injury');
  } else if (daysAway > 0) {
    consequenceIdx = Math.max(consequenceIdx, 3);
    reasons.push(`Major: ${daysAway} day(s) away from work`);
  } else if (
    treatments.includes('Days away from work') ||
    oshaFlags.includes('Days away from work (DART)')
  ) {
    consequenceIdx = Math.max(consequenceIdx, 3);
    reasons.push('Major: days away from work flagged');
  } else if (
    treatments.includes('Restricted duty') ||
    treatments.includes('Job transfer') ||
    oshaFlags.includes('Restricted work or job transfer')
  ) {
    consequenceIdx = Math.max(consequenceIdx, 2); // Moderate
    reasons.push('Moderate: restricted duty / job transfer');
  } else if (
    treatments.includes('Medical treatment') ||
    oshaFlags.includes('Medical treatment beyond first aid')
  ) {
    consequenceIdx = Math.max(consequenceIdx, 2);
    reasons.push('Moderate: medical treatment beyond first aid');
  }

  // Specified-injury body region bumps consequence floor
  if (hasSpecifiedInjuryRegion(body_parts_affected)) {
    if (consequenceIdx < 3) {
      consequenceIdx = 3;
      reasons.push('Major: specified-injury region affected (head/face/back)');
    }
  }

  // Type-specific floors
  if (type === 'dangerous' && consequenceIdx < 3) {
    consequenceIdx = 3;
    reasons.push('Major (RIDDOR dangerous occurrence by definition)');
  }

  // ---- Likelihood from prior-incident count at this asset/area ----
  // 0     incidents → Rare       (likelihood idx 4)
  // 1-2              → Unlikely  (3)
  // 3-4              → Possible  (2)
  // 5-9              → Likely    (1)
  // 10+              → Almost Certain (0)
  let likelihoodIdx;
  if (prior_incidents_count >= 10) {
    likelihoodIdx = 0;
    reasons.push(`Almost Certain: ${prior_incidents_count} prior incidents in 12 months at this asset/area`);
  } else if (prior_incidents_count >= 5) {
    likelihoodIdx = 1;
    reasons.push(`Likely: ${prior_incidents_count} prior incidents in 12 months at this asset/area`);
  } else if (prior_incidents_count >= 3) {
    likelihoodIdx = 2;
    reasons.push(`Possible: ${prior_incidents_count} prior incidents in 12 months at this asset/area`);
  } else if (prior_incidents_count >= 1) {
    likelihoodIdx = 3;
    reasons.push(`Unlikely: ${prior_incidents_count} prior incident(s) in 12 months at this asset/area`);
  } else {
    likelihoodIdx = 4; // Rare — first-time
    reasons.push('Rare: first incident at this asset/area in the last 12 months');
  }

  // ---- Final cell + severity + track via the existing matrix ----
  let { severity, track, riskLevel } = calculateSeverityAndTrack(likelihoodIdx, consequenceIdx, type);

  // ---- Severity floor overrides ----
  // The 5×5 matrix is calibrated for likelihood × outcome-severity probability.
  // Once a high-consequence outcome has actually happened (fatality, hospitalization,
  // LOC, amputation), the matrix's "Rare row × high column = S3" is wrong because
  // the outcome is no longer probabilistic. Floor severity in those cases.
  if (treatments.includes('Fatality') || oshaFlags.includes('Death')) {
    if (severity > 1) reasons.push('Severity floored to S1 Critical: fatality reported');
    severity = 1;
    track = 'A';
  } else if (treatments.includes('Hospitalization')) {
    if (severity > 2) reasons.push('Severity floored to S2 Major: hospitalization required');
    severity = Math.min(severity, 2);
    if (severity <= 2) track = 'A';
  } else if (oshaFlags.includes('Loss of consciousness')) {
    if (severity > 2) reasons.push('Severity floored to S2 Major: loss of consciousness');
    severity = Math.min(severity, 2);
    if (severity <= 2) track = 'A';
  } else if (
    hasSpecifiedInjuryRegion(body_parts_affected) &&
    (treatments.includes('Medical treatment') || daysAway > 0 ||
     oshaFlags.includes('Medical treatment beyond first aid') ||
     oshaFlags.includes('Days away from work (DART)'))
  ) {
    // Specified-injury region (head/face/spine) AND any medical-treatment-class
    // outcome → at least S3 Moderate (Track B). The matrix alone undershoots
    // because Rare × Major = S4 Minor, which doesn't reflect the real risk
    // when the body part is high-stakes.
    if (severity > 3) {
      reasons.push('Severity floored to S3 Moderate: specified-injury region (head/face/spine) with medical-treatment outcome');
      severity = 3;
      if (track !== 'A') track = 'B';
    }
  }

  // observation type: keep the cap from calculateSeverityAndTrack —
  // observations stay Track C unless severity ≤ 2.

  const reasoning = reasons.length > 0
    ? `${LIKELIHOOD_LABELS[likelihoodIdx]} × ${CONSEQUENCE_LABELS[consequenceIdx]} → S${severity} ${SEV_NAMES[severity]}, Track ${track}. ${reasons.join('; ')}.`
    : `${LIKELIHOOD_LABELS[likelihoodIdx]} × ${CONSEQUENCE_LABELS[consequenceIdx]} → S${severity} ${SEV_NAMES[severity]}, Track ${track}`;

  return {
    suggested_likelihood: likelihoodIdx,
    suggested_consequence: consequenceIdx,
    suggested_severity: severity,
    suggested_track: track,
    level_label: riskLevel,
    reasoning,
  };
}
