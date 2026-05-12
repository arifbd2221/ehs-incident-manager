// server/services/osha_severe.js — WI-07 OSHA 1904.39 severe-injury notifications.
//
// 29 CFR 1904.39(a) — covered employers must report to OSHA:
//   (1) any work-related fatality within 8 hours after the death.
//   (2) any work-related in-patient hospitalization, amputation, or loss of
//       an eye within 24 hours after the event.
//
// 1904.39(b)(6) reportability window: the fatality must occur within 30 days
//   of the incident; hospitalization / amputation / eye-loss within 24
//   hours of the incident. Events outside the window are still recorded on
//   the 300 Log (1904.7) but are NOT reported under 1904.39.
//
// 1904.39(b)(7) clock-start: if the employer first learns of the event
//   later, the 8-h / 24-h clock starts from when the employer learns. v1
//   computes the deadline from `incident_datetime`; the
//   `phone_notified_at` field captures the discharge of the obligation.
//
// 1904.39(b)(9) "in-patient hospitalization" definition: formal admission
//   to the in-patient service of a hospital or clinic for CARE OR
//   TREATMENT — not observation-only. v1 trusts the existing
//   `incidents.hospitalized` flag; the wizard collects it from the
//   reporter.
//
// 1904.39(b)(11) "amputation" definition: traumatic loss of a limb or
//   external body part, including fingertip amputations with/without bone
//   loss; medical amputations; reattached parts. Excludes avulsions,
//   enucleations, deglovings, scalpings, severed ears, broken or chipped
//   teeth.
//
// Detection signals (additive — no schema change beyond migration 027):
//   - fatality: incidents.osha_date_of_death set OR primaryInjury.date_of_death set.
//   - hospitalization: incidents.hospitalized = 1 OR primaryInjury.hospitalized = 1.
//   - amputation / loss_of_eye: free text isn't enough → reporter must
//     explicitly flag via incidents.type_data.osha_severe.{amputation,loss_of_eye}.
//     Substring match on "amput" in injury_type is used as a soft hint that
//     surfaces a TODO log line but does NOT auto-create the row (would
//     under-report avulsions / chipped teeth which 1904.39(b)(11) excludes).
//
// Pure functional core (`evaluateSevereInjury`) so the unit-test surface
// is just (incident, primaryAp, primaryInjury) → {category, deadline_at}[].

import db from '../db/connection.js';

const FATALITY_DEADLINE_HOURS = 8;     // 1904.39(a)(1)
const NONFATAL_DEADLINE_HOURS = 24;    // 1904.39(a)(2)

const FATALITY_WINDOW_DAYS    = 30;    // 1904.39(b)(6) — fatality must occur within 30 days
const NONFATAL_WINDOW_HOURS   = 24;    // 1904.39(b)(6) — others must occur within 24 hours

/**
 * Pure classification — given an incident row + (optional) primary
 * affected_persons row + (optional) primary injuries row, return an
 * array of severe-injury categories that apply with their deadlines.
 *
 * Returns [] for non-severe incidents. Multiple categories possible
 * (e.g. fatality + amputation on the same incident → two rows).
 */
export function evaluateSevereInjury(incident, primaryAp, primaryInjury) {
  if (!incident || !incident.incident_datetime) return [];

  const incidentAt = new Date(incident.incident_datetime);
  if (Number.isNaN(incidentAt.getTime())) return [];

  // type_data carries reporter-supplied flags for amputation / eye loss
  // that can't be derived from existing columns. The 1904.39(b)(11)
  // definition is too narrow to infer from a free-text injury label.
  let td = {};
  try { td = incident.type_data ? JSON.parse(incident.type_data) : {}; } catch (_) { td = {}; }
  const severeFlags = (td && td.osha_severe) || {};

  const events = [];

  // --- 1904.39(a)(1) fatality ---
  // 1904.39(b)(6): fatality must occur within 30 days of the incident.
  const dod =
    incident.osha_date_of_death ||
    primaryInjury?.date_of_death ||
    null;
  if (dod) {
    const dodAt = new Date(dod);
    if (!Number.isNaN(dodAt.getTime())) {
      const dayDelta = (dodAt - incidentAt) / (1000 * 60 * 60 * 24);
      if (dayDelta <= FATALITY_WINDOW_DAYS) {
        // 8-hour clock from the death event itself.
        events.push({
          category: 'fatality',
          deadline_at: addHours(dodAt, FATALITY_DEADLINE_HOURS),
        });
      }
    }
  }

  // --- 1904.39(a)(2) hospitalization / amputation / loss of eye ---
  // Per 1904.39(b)(6), each of these must occur within 24 hours of the
  // incident; otherwise it stays on the 300 Log but is NOT reportable.
  // v1 computes deadline_at = incident_datetime + 24h. Owner-approved
  // refinement to (b)(7) ("when the employer learned") deferred.
  const nonFatalDeadline = addHours(incidentAt, NONFATAL_DEADLINE_HOURS);

  // Hospitalization — trust the existing hospitalized flag. 1904.39(b)(10)
  // carve-out (observation/diagnostic only, not care/treatment) is captured
  // upstream by the wizard's hospitalization question and is the reporter's
  // judgment call — no DB signal exists to distinguish in v1.
  const hospitalized =
    incident.hospitalized === 1 ||
    primaryInjury?.hospitalized === 1;
  if (hospitalized) {
    events.push({ category: 'hospitalization', deadline_at: nonFatalDeadline });
  }

  // Amputation — explicit flag only. 1904.39(b)(11) excludes avulsions,
  // deglovings, scalpings, severed ears, broken/chipped teeth, so a
  // substring match on "amput" in injury_type would over-report. Require
  // an explicit reporter-set flag.
  if (severeFlags.amputation === true) {
    events.push({ category: 'amputation', deadline_at: nonFatalDeadline });
  }

  // Loss of eye — explicit flag. The bodymap doesn't have an `eye` region
  // (see body_parts.js gap note); reporter must check the wizard flag.
  if (severeFlags.loss_of_eye === true) {
    events.push({ category: 'loss_of_eye', deadline_at: nonFatalDeadline });
  }

  return events;
}

function addHours(date, hours) {
  const d = new Date(date.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

// --- DB writers --------------------------------------------------------

/**
 * Upsert severe-notification rows for an incident. Idempotent: existing
 * rows for the same (incident_id, category) are left alone unless they
 * are now invalid (caller can clean up separately). New rows get inserted.
 *
 * Returns the array of rows (existing + inserted).
 */
export function syncSevereNotifications({ orgId, incidentId, incident, primaryAp, primaryInjury, userId }) {
  const events = evaluateSevereInjury(incident, primaryAp, primaryInjury);
  if (events.length === 0) return [];

  const existing = db.prepare(`
    SELECT id, category FROM osha_severe_notifications
    WHERE org_id = ? AND incident_id = ?
  `).all(orgId, incidentId);
  const existingByCat = new Map(existing.map(r => [r.category, r.id]));

  const insertedIds = [];
  const insert = db.prepare(`
    INSERT INTO osha_severe_notifications
      (incident_id, org_id, category, deadline_at, created_by)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const e of events) {
    if (existingByCat.has(e.category)) continue;
    const r = insert.run(incidentId, orgId, e.category, e.deadline_at, userId || null);
    insertedIds.push(r.lastInsertRowid);
  }

  return db.prepare(`
    SELECT * FROM osha_severe_notifications
    WHERE org_id = ? AND incident_id = ?
    ORDER BY id ASC
  `).all(orgId, incidentId);
}

export function listSevereNotificationsForIncident(orgId, incidentId) {
  return db.prepare(`
    SELECT * FROM osha_severe_notifications
    WHERE org_id = ? AND incident_id = ?
    ORDER BY id ASC
  `).all(orgId, incidentId);
}

export function getSevereNotification(orgId, id) {
  return db.prepare(`
    SELECT * FROM osha_severe_notifications
    WHERE org_id = ? AND id = ?
  `).get(orgId, Number(id));
}

/**
 * Log a 1904.39(a)(3) phone notification. Records who called, when,
 * which Area Office, and OSHA's case reference if provided. Pure DB
 * write — the route layer handles activity_log.
 */
export function logPhoneNotification({ orgId, notificationId, userId, areaOffice, oshaReference, notes }) {
  const row = getSevereNotification(orgId, notificationId);
  if (!row) return null;
  if (row.phone_notified_at) {
    // Idempotent — already submitted.
    return row;
  }
  db.prepare(`
    UPDATE osha_severe_notifications
       SET phone_notified_at = datetime('now'),
           phone_notified_by = ?,
           osha_area_office  = ?,
           osha_reference    = ?,
           notes             = COALESCE(?, notes)
     WHERE id = ? AND org_id = ?
  `).run(
    userId || null,
    areaOffice || null,
    oshaReference || null,
    notes || null,
    notificationId, orgId,
  );
  return getSevereNotification(orgId, notificationId);
}
