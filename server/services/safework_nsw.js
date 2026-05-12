// server/services/safework_nsw.js — WI-06 SafeWork NSW notification engine.
//
// Implements the classification + lifecycle helpers for Work Health and
// Safety Act 2011 (NSW) Part 3 (ss.35–39). Source PDF verbatim quotes
// extracted from docs/regulatory-sources/safework-nsw/whs-act-2011-nsw.pdf
// (current version for 1 March 2026 to date).
//
// s.35 — "notifiable incident" means—
//   (a) the death of a person, or
//   (b) a serious injury or illness of a person, or
//   (c) a dangerous incident.
//
// s.36 — "serious injury or illness" means an injury or illness requiring
//   the person to have—
//     (a) immediate treatment as an in-patient in a hospital, or
//     (b) immediate treatment for—
//         (i) amputation; (ii) serious head injury; (iii) serious eye injury;
//         (iv) serious burn; (v) skin separation (degloving/scalping);
//         (vi) spinal injury; (vii) loss of a bodily function;
//         (viii) serious lacerations, or
//     (c) medical treatment within 48 hours of exposure to a substance.
//   Tail: "and includes any other injury or illness prescribed by the
//   regulations but does not include an illness or injury of a prescribed
//   kind." → captured via the `s36_other_prescribed_by_regulations`
//   lookup row + free-text label on the notification (deferred until
//   WHS Regulation 2017 (NSW) source lands).
//
// s.37 — "dangerous incident" — 11 enumerated (a)–(k) + (l) "any other
//   event prescribed by the regulations". Same tail-clause handling.
//
// s.38 — duty to notify "immediately" and "by the fastest possible means":
//   (3) by telephone OR in writing; (4)(b) if the regulator requests, a
//   written notice within 48 hours OF THAT REQUEST. The clock for the
//   written deadline starts ONLY at regulator_requested_written_at — not
//   at incident time. Owner-approved gap-2 decision.
//
// s.39 — duty to preserve the site until an inspector arrives. (3)(a)–(e)
//   are the permitted disturbance bases. (4) excludes Mines & Petroleum
//   sites.
//
// s.38(8) + s.39(4) — Mines & Petroleum carve-out. When the notification
// has excluded_mines_petroleum=1, the engine emits no deadlines and the
// row exists only as a record of the determination.
//
// Detection signals from the incident shape we already have:
//   • Death (s.35(a)) — incidents.osha_date_of_death OR
//     primaryInjury.date_of_death set.
//   • Serious injury / illness (s.35(b)) — auto-derived from the existing
//     incident columns + a `type_data.safework_nsw.serious_injury_sub`
//     reporter-set array for items that aren't otherwise derivable. Soft
//     auto-derive:
//       incidents.hospitalized=1 → s36(a) inpatient hospital
//       primaryInjury.hospitalized=1 → s36(a) inpatient hospital
//   • Dangerous incident (s.35(c)) — explicit reporter-set
//     `type_data.safework_nsw.dangerous_incident_sub` array. We do NOT
//     fuzzy-match injury_type / description here — s.37 categories
//     describe workplace events, not injury phenotypes, and the
//     1904.39(b)(11)-style "no substring auto-match" discipline applies.
//
// Numbering: NSW-{YYYY}-{NNNN} via nextNswNumber().

import db from '../db/connection.js';
import { writeActivity } from './activity_log.js';
import { nextNswNumber } from './numbering.js';

const WRITTEN_DEADLINE_HOURS = 48;  // s.38(4)(b)

// ---------------------------------------------------------------------------
// Pure classification
// ---------------------------------------------------------------------------

/**
 * Given an incident row (and optional primary affected_person + injury
 * row from the WI-A side tables), decide whether the incident is
 * notifiable under WHS Act 2011 (NSW) ss.35–37.
 *
 * Returns a structured `intent` object describing what the
 * safework_nsw_notifications row should look like, OR null when the
 * incident is not notifiable.
 *
 *   {
 *     is_fatality: 0|1,                          // s.35(a)
 *     is_serious_injury: 0|1,                    // s.35(b)
 *     is_dangerous_incident: 0|1,                // s.35(c)
 *     serious_injury_sub_categories: string[],   // s.36 lookup keys
 *     dangerous_incident_sub_categories: string[], // s.37 lookup keys
 *     excluded_mines_petroleum: 0|1,             // s.38(8) / s.39(4)
 *   }
 */
export function evaluateSafeworkNsw(incident, primaryAp, primaryInjury) {
  if (!incident) return null;

  let td = {};
  try { td = incident.type_data ? JSON.parse(incident.type_data) : {}; } catch (_) { td = {}; }
  const nsw = (td && td.safework_nsw) || {};

  // s.38(8) / s.39(4): Mines & Petroleum sites are governed by the WHS
  // (Mines and Petroleum Sites) Act 2013, not this Part. We still record
  // the determination so the audit trail is complete.
  const excluded = nsw.excluded_mines_petroleum === true ? 1 : 0;

  // s.35(a) — fatality. Derived from incidents.osha_date_of_death OR the
  // primary injury's date_of_death (WI-A path). Reporter-set
  // td.safework_nsw.is_fatality also accepted as a manual override.
  const isFatality = (
    !!incident.osha_date_of_death ||
    !!primaryInjury?.date_of_death ||
    nsw.is_fatality === true
  ) ? 1 : 0;

  // s.35(b) / s.36 — serious injury or illness.
  // Auto-derive: hospitalized=1 → s.36(a). Reporter can supply additional
  // s.36(b)/(c) sub-categories via td.safework_nsw.serious_injury_sub.
  const seriousSubs = new Set(
    Array.isArray(nsw.serious_injury_sub) ? nsw.serious_injury_sub : []
  );
  const hospitalized = incident.hospitalized === 1 || primaryInjury?.hospitalized === 1;
  if (hospitalized) seriousSubs.add('s36_a_inpatient_hospital');

  // The reporter-supplied sub-categories ARE the authoritative signal for
  // anything beyond s.36(a) — we don't fuzzy-derive from free text.
  const isSeriousInjury = seriousSubs.size > 0 ? 1 : 0;

  // s.35(c) / s.37 — dangerous incident. Explicit reporter flags only;
  // no auto-derive (these describe workplace events, not injury types).
  const dangerousSubs = new Set(
    Array.isArray(nsw.dangerous_incident_sub) ? nsw.dangerous_incident_sub : []
  );
  const isDangerousIncident = dangerousSubs.size > 0 ? 1 : 0;

  // Not notifiable at all? → no row needed.
  if (!isFatality && !isSeriousInjury && !isDangerousIncident && !excluded) {
    return null;
  }

  return {
    is_fatality: isFatality,
    is_serious_injury: isSeriousInjury,
    is_dangerous_incident: isDangerousIncident,
    serious_injury_sub_categories: [...seriousSubs],
    dangerous_incident_sub_categories: [...dangerousSubs],
    excluded_mines_petroleum: excluded,
  };
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function listSeriousInjuryTypes() {
  return db.prepare(`
    SELECT key, label, section_ref
    FROM safework_nsw_serious_injury_types
    ORDER BY display_order ASC, id ASC
  `).all();
}

export function listDangerousIncidentTypes() {
  return db.prepare(`
    SELECT key, label, section_ref
    FROM safework_nsw_dangerous_incident_types
    ORDER BY display_order ASC, id ASC
  `).all();
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export function getNotificationForIncident(orgId, incidentId) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE org_id = ? AND incident_id = ?
  `).get(orgId, incidentId);
  if (!row) return null;
  return inflate(row);
}

export function getNotificationByNumber(orgId, nswNumber) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE org_id = ? AND nsw_number = ?
  `).get(orgId, nswNumber);
  if (!row) return null;
  return inflate(row);
}

export function listNotificationsForOrg(orgId, { siteId, year } = {}) {
  const where = ['org_id = ?'];
  const params = [orgId];
  if (siteId) { where.push('site_id = ?'); params.push(Number(siteId)); }
  if (year)   { where.push("strftime('%Y', event_date) = ?"); params.push(String(year)); }
  const rows = db.prepare(`
    SELECT n.*, i.incident_number, i.title AS incident_title, s.name AS site_name
    FROM safework_nsw_notifications n
    LEFT JOIN incidents i ON i.id = n.incident_id
    LEFT JOIN sites s ON s.id = n.site_id
    WHERE ${where.join(' AND ')}
    ORDER BY n.event_date DESC, n.id DESC
  `).all(...params);
  return rows.map(inflate);
}

function inflate(row) {
  return {
    ...row,
    serious_injury_sub_categories: safeParseArray(row.serious_injury_sub_categories),
    dangerous_incident_sub_categories: safeParseArray(row.dangerous_incident_sub_categories),
  };
}
function safeParseArray(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; }
  catch (_) { return []; }
}

// ---------------------------------------------------------------------------
// Sync (POST + PATCH hook)
// ---------------------------------------------------------------------------

/**
 * Idempotently create-or-update the safework_nsw_notifications row for
 * an incident based on the current classification intent. Returns the
 * row + a flag indicating whether it was created vs. updated this call
 * (so the route layer can emit the right activity_log verb).
 *
 *   {
 *     row,
 *     created: boolean,
 *     updated_fields: string[],   // populated when created=false
 *   }
 *
 * Returns null when the incident is not notifiable (or no longer is).
 * Caller is responsible for org/site validation upstream.
 */
export function syncSafeworkNswNotification({ orgId, incidentId, incident, primaryAp, primaryInjury, userId }) {
  const intent = evaluateSafeworkNsw(incident, primaryAp, primaryInjury);
  if (!intent) return null;

  const existing = getNotificationForIncident(orgId, incidentId);

  // Build the desired column set from the intent. We do NOT touch
  // user-captured fields like site_preservation_status, phone_*,
  // written_*, pcbu_*, regulator_*. Those are set via dedicated
  // write helpers below.
  const desired = {
    is_fatality: intent.is_fatality,
    is_serious_injury: intent.is_serious_injury,
    is_dangerous_incident: intent.is_dangerous_incident,
    serious_injury_sub_categories: JSON.stringify(intent.serious_injury_sub_categories),
    dangerous_incident_sub_categories: JSON.stringify(intent.dangerous_incident_sub_categories),
    excluded_mines_petroleum: intent.excluded_mines_petroleum,
  };

  if (existing) {
    const updatedFields = [];
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(desired)) {
      const before = (k.endsWith('_sub_categories'))
        ? JSON.stringify(existing[k])
        : existing[k];
      if (before !== v) {
        sets.push(`${k} = ?`);
        params.push(v);
        updatedFields.push(k);
      }
    }
    if (sets.length === 0) {
      return { row: existing, created: false, updated_fields: [] };
    }
    params.push(orgId, incidentId);
    db.prepare(`
      UPDATE safework_nsw_notifications
      SET ${sets.join(', ')}
      WHERE org_id = ? AND incident_id = ?
    `).run(...params);
    return {
      row: getNotificationForIncident(orgId, incidentId),
      created: false,
      updated_fields: updatedFields,
    };
  }

  // Insert new row.
  const nswNumber = nextNswNumber();
  const result = db.prepare(`
    INSERT INTO safework_nsw_notifications
      (nsw_number, incident_id, org_id, site_id, event_date,
       is_fatality, is_serious_injury, is_dangerous_incident,
       serious_injury_sub_categories, dangerous_incident_sub_categories,
       excluded_mines_petroleum,
       created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nswNumber,
    incidentId, orgId, incident.site_id, incident.incident_datetime,
    intent.is_fatality, intent.is_serious_injury, intent.is_dangerous_incident,
    desired.serious_injury_sub_categories, desired.dangerous_incident_sub_categories,
    intent.excluded_mines_petroleum,
    userId || null,
  );

  return {
    row: db.prepare('SELECT * FROM safework_nsw_notifications WHERE id = ?')
      .get(result.lastInsertRowid),
    created: true,
    updated_fields: [],
  };
}

// ---------------------------------------------------------------------------
// Lifecycle writers
// ---------------------------------------------------------------------------

/**
 * Log the s.38(1)/(3)/(4) phone notification — the "immediately / by
 * fastest possible means" duty. Idempotent: a second submit on a row
 * that's already notified returns the unchanged row.
 */
export function logPhoneNotification({ orgId, notificationId, userId, regulatorOffice, notes }) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE id = ? AND org_id = ?
  `).get(notificationId, orgId);
  if (!row) return null;
  if (row.phone_notified_at) return inflate(row);
  db.prepare(`
    UPDATE safework_nsw_notifications
       SET phone_notified_at = datetime('now'),
           phone_notified_by = ?,
           phone_regulator_office = ?,
           phone_notes = COALESCE(?, phone_notes)
     WHERE id = ? AND org_id = ?
  `).run(userId || null, regulatorOffice || null, notes || null, notificationId, orgId);
  return getNotificationForIncident(orgId, row.incident_id);
}

/**
 * Log the regulator's request for a written notice per s.38(4)(b). This
 * is what starts the 48-hour written-deadline clock. The deadline is
 * stored on the row as `written_deadline` = request + 48h.
 */
export function logRegulatorRequestedWritten({ orgId, notificationId, userId, requestedAtIso }) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE id = ? AND org_id = ?
  `).get(notificationId, orgId);
  if (!row) return null;
  // Idempotent: if already set, return the existing row unchanged.
  if (row.regulator_requested_written_at) return inflate(row);

  const at = requestedAtIso || new Date().toISOString();
  const deadline = new Date(new Date(at).getTime() + WRITTEN_DEADLINE_HOURS * 3600 * 1000).toISOString();

  db.prepare(`
    UPDATE safework_nsw_notifications
       SET regulator_requested_written_at = ?,
           written_deadline = ?
     WHERE id = ? AND org_id = ?
  `).run(at, deadline, notificationId, orgId);
  return getNotificationForIncident(orgId, row.incident_id);
}

/**
 * Log the submission of the s.38(5) written notice.
 */
export function logWrittenSubmitted({ orgId, notificationId, userId, reference, notes }) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE id = ? AND org_id = ?
  `).get(notificationId, orgId);
  if (!row) return null;
  if (row.written_submitted_at) return inflate(row);
  db.prepare(`
    UPDATE safework_nsw_notifications
       SET written_submitted_at = datetime('now'),
           written_submitted_by = ?,
           written_reference = ?,
           written_notes = COALESCE(?, written_notes)
     WHERE id = ? AND org_id = ?
  `).run(userId || null, reference || null, notes || null, notificationId, orgId);
  return getNotificationForIncident(orgId, row.incident_id);
}

/**
 * Capture the s.39 site-preservation status + optional notes. The
 * enum is constrained at the DB level (CHECK in migration 028).
 */
export function setSitePreservation({ orgId, notificationId, status, notes, inspectorArrivedAt }) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE id = ? AND org_id = ?
  `).get(notificationId, orgId);
  if (!row) return null;
  db.prepare(`
    UPDATE safework_nsw_notifications
       SET site_preservation_status = ?,
           site_preservation_notes = COALESCE(?, site_preservation_notes),
           inspector_arrived_at = COALESCE(?, inspector_arrived_at)
     WHERE id = ? AND org_id = ?
  `).run(status || null, notes || null, inspectorArrivedAt || null, notificationId, orgId);
  return getNotificationForIncident(orgId, row.incident_id);
}

/**
 * Capture PCBU identity (name + ABN + ANZSIC). ABN is validated by the
 * route layer (server/services/abn_validator.js).
 */
export function setPcbu({ orgId, notificationId, name, abn, anzsicCode }) {
  const row = db.prepare(`
    SELECT * FROM safework_nsw_notifications
    WHERE id = ? AND org_id = ?
  `).get(notificationId, orgId);
  if (!row) return null;
  db.prepare(`
    UPDATE safework_nsw_notifications
       SET pcbu_name = COALESCE(?, pcbu_name),
           pcbu_abn = COALESCE(?, pcbu_abn),
           pcbu_anzsic_code = COALESCE(?, pcbu_anzsic_code)
     WHERE id = ? AND org_id = ?
  `).run(name || null, abn || null, anzsicCode || null, notificationId, orgId);
  return getNotificationForIncident(orgId, row.incident_id);
}
