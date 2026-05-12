// server/services/deadlines.js — WI-08 regulatory deadline aggregator.
//
// Today this only sees RIDDOR deadlines (the only regulatory deadline
// store that exists in the schema). When WI-06 (SafeWork NSW) and WI-07
// (OSHA 1904.39 severe-injury) land, their notification tables get
// folded in here.
//
// Two entry points:
//
//   computePendingDeadlines(incident, riddorReport)
//     Pure / sync. Given an incident row + (optional) riddor_reports row
//     for the same incident, returns the structured deadline array.
//     Used by the incidents list handler so the per-row badge renders
//     without a separate fetch — one bulk SELECT loads all RIDDOR rows
//     for the listed incidents, then this helper merges them in.
//
//   getPendingDeadlinesForIncident(orgId, incidentId)
//     Loads the incident + RIDDOR rows itself, then returns the same
//     shape. Used by GET /incidents/:id/deadlines for the IncidentDetail.
//     Returns null if the incident is not in the caller's org (route
//     turns that into a 404 to preserve tenant isolation).
//
// Shape:
//   [
//     { kind: 'riddor_phone',
//       jurisdiction: 'UK-RIDDOR',
//       label: 'RIDDOR — phone HSE',
//       reg_ref: 'Reg 4(1)',
//       deadline_at: null,           // null when the duty is "without delay"
//       submitted_at: null | ISO,    // when the obligation was discharged
//       status: 'without_delay' | 'overdue' | 'due_today' | 'due_soon' |
//               'upcoming' | 'submitted' },
//     ...
//   ]

import db from '../db/connection.js';

// RIDDOR categories that require "without delay" phone notification under
// Schedule 1 Part 1 §1 / Reg 11(1). Mirrors the phoneRequired flag in
// services/riddor.js — keep aligned when adding new categories there.
const PHONE_REQUIRED_CATEGORIES = new Set([
  'dangerous_occurrence',
  'fatality',
  'specified_injury',
  'non_worker_specified_injury',
  'non_worker_hospitalization',
  'gas_incident',
]);

// Human-readable reg paragraph by category. Mirrors the labels in
// client/src/utils/riddor.js. Kept in sync manually.
const CATEGORY_REG_REF = {
  dangerous_occurrence: 'Reg 7',
  fatality: 'Reg 6',
  specified_injury: 'Reg 4(1)',
  over_7_day: 'Reg 4(2)',
  disease: 'Reg 8',
  non_worker_hospitalization: 'Reg 5(a)',
  non_worker_specified_injury: 'Reg 5(b)',
  gas_incident: 'Reg 11(1)',
  gas_dangerous_fitting: 'Reg 11(2)',
};

// Bucket a deadline timestamp into one of four urgency tiers relative to
// `now`. Caller is responsible for the 'submitted' / 'without_delay'
// short-circuits — this only fires for actual time-driven deadlines.
function statusFromDeadline(deadlineAt, now = new Date()) {
  if (!deadlineAt) return 'upcoming';
  const dt = new Date(deadlineAt);
  const ms = dt - now;
  if (ms < 0) return 'overdue';
  const hours = ms / 3_600_000;
  if (hours < 24) return 'due_today';
  if (hours < 72) return 'due_soon';
  return 'upcoming';
}

// 1904.39 category → reg paragraph (for tooltip / chain-of-custody narrative).
const OSHA_SEVERE_REG_REF = {
  fatality:         '1904.39(a)(1)',  // 8 hours
  hospitalization:  '1904.39(a)(2)',  // 24 hours
  amputation:       '1904.39(a)(2)',
  loss_of_eye:      '1904.39(a)(2)',
};
const OSHA_SEVERE_LABEL = {
  fatality:         'OSHA 1904.39 — phone fatality',
  hospitalization:  'OSHA 1904.39 — phone hospitalization',
  amputation:       'OSHA 1904.39 — phone amputation',
  loss_of_eye:      'OSHA 1904.39 — phone loss of eye',
};

export function computePendingDeadlines(incident, riddorReport, oshaSevereRows = []) {
  if (!incident) return [];
  const out = [];

  if (riddorReport) {
    const category = riddorReport.category || incident.riddor_category;
    const regRef = CATEGORY_REG_REF[category] || null;

    // Phone notification (when category requires it).
    if (PHONE_REQUIRED_CATEGORIES.has(category)) {
      out.push({
        kind: 'riddor_phone',
        jurisdiction: 'UK-RIDDOR',
        label: 'RIDDOR — phone HSE',
        reg_ref: regRef,
        deadline_at: null,
        submitted_at: riddorReport.phone_notified_at || null,
        status: riddorReport.phone_notified_at ? 'submitted' : 'without_delay',
      });
    }

    // Written F2508 (when a written deadline is set; disease has no
    // fixed deadline so the column is NULL — skip).
    if (riddorReport.written_deadline) {
      out.push({
        kind: 'riddor_written',
        jurisdiction: 'UK-RIDDOR',
        label: 'RIDDOR F2508 — written',
        reg_ref: regRef,
        deadline_at: riddorReport.written_deadline,
        submitted_at: riddorReport.written_submitted_at || null,
        status: riddorReport.written_submitted_at
          ? 'submitted'
          : statusFromDeadline(riddorReport.written_deadline),
      });
    }
  }

  // OSHA 1904.39 severe-injury notifications (WI-07).
  // Each row carries one category + its deadline (8h fatality / 24h others).
  // Submitted state = phone_notified_at is set.
  for (const sev of oshaSevereRows) {
    out.push({
      kind: `osha_severe_${sev.category}`,
      jurisdiction: 'US-OSHA',
      label: OSHA_SEVERE_LABEL[sev.category] || `OSHA 1904.39 — ${sev.category}`,
      reg_ref: OSHA_SEVERE_REG_REF[sev.category] || '1904.39',
      deadline_at: sev.deadline_at,
      submitted_at: sev.phone_notified_at || null,
      status: sev.phone_notified_at
        ? 'submitted'
        : statusFromDeadline(sev.deadline_at),
    });
  }

  // TODO: WI-06 SafeWork NSW — safework_nsw_notifications.written_deadline
  //   + s.38(2) phone-notification "without delay" semantics.

  return out;
}

// Picks the most urgent entry from a deadlines array. Used by the
// IncidentsList row badge so we only render one pill per card. Order of
// urgency: overdue > without_delay (no clock but legally pressing) >
// due_today > due_soon > upcoming > submitted.
const STATUS_RANK = {
  overdue: 0,
  without_delay: 1,
  due_today: 2,
  due_soon: 3,
  upcoming: 4,
  submitted: 5,
};

export function mostUrgent(deadlines) {
  if (!deadlines?.length) return null;
  return [...deadlines].sort((a, b) => {
    const ra = STATUS_RANK[a.status] ?? 99;
    const rb = STATUS_RANK[b.status] ?? 99;
    if (ra !== rb) return ra - rb;
    // Tie-break by absolute deadline time when both have one.
    const da = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.POSITIVE_INFINITY;
    const dbb = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.POSITIVE_INFINITY;
    return da - dbb;
  })[0];
}

// Load + compute for a single incident. Returns null when the incident
// is not in the caller's org so the route can emit a 404 (avoids leaking
// existence across tenants).
export function getPendingDeadlinesForIncident(orgId, incidentId) {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?')
    .get(incidentId, orgId);
  if (!incident) return null;

  // Defensive: there's no UNIQUE(incident_id) on riddor_reports today,
  // so pick the most recently created row if there's somehow more than
  // one. In practice POST /incidents only ever inserts one.
  const riddorReport = db.prepare(`
    SELECT * FROM riddor_reports
    WHERE incident_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(incidentId);

  // WI-07: one row per (incident_id, category) reportable event.
  const oshaSevereRows = db.prepare(`
    SELECT * FROM osha_severe_notifications
    WHERE org_id = ? AND incident_id = ?
    ORDER BY id ASC
  `).all(orgId, incidentId);

  return computePendingDeadlines(incident, riddorReport, oshaSevereRows);
}

// Bulk helper for the incidents list handler. Given an array of
// incident rows, returns a Map<incident_id, riddorReport> with one
// query — caller then merges via computePendingDeadlines() per row.
// Tolerates an empty input array (returns empty Map).
export function loadRiddorReportsForIncidents(incidentIds) {
  const map = new Map();
  if (!Array.isArray(incidentIds) || incidentIds.length === 0) return map;
  const placeholders = incidentIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT incident_id, category, written_deadline,
           phone_notified_at, written_submitted_at, status
    FROM riddor_reports
    WHERE incident_id IN (${placeholders})
    ORDER BY id ASC
  `).all(...incidentIds);
  // If multiple rows per incident_id, the ORDER BY id ASC + later
  // `set()` calls means the last (highest id) wins.
  for (const r of rows) map.set(r.incident_id, r);
  return map;
}

// WI-07 bulk helper — load all osha_severe_notifications rows for a set
// of incidents in one query. Returns Map<incident_id, row[]> (multiple
// rows per incident possible — one per reportable category).
export function loadOshaSevereForIncidents(orgId, incidentIds) {
  const map = new Map();
  if (!Array.isArray(incidentIds) || incidentIds.length === 0) return map;
  const placeholders = incidentIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT * FROM osha_severe_notifications
    WHERE org_id = ? AND incident_id IN (${placeholders})
    ORDER BY id ASC
  `).all(orgId, ...incidentIds);
  for (const r of rows) {
    if (!map.has(r.incident_id)) map.set(r.incident_id, []);
    map.get(r.incident_id).push(r);
  }
  return map;
}
