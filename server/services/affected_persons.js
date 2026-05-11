// server/services/affected_persons.js — WI-A multi-person incidents.
//
// Pure service module — no Express coupling. Route handlers in
// server/routes/affected_persons.js call these helpers; the dual-write
// hooks in server/routes/incidents.js POST/PATCH call them too via
// upsertPrimaryFromLegacy() so the legacy type_data.injured_person
// JSON sub-record and the new affected_persons / injuries tables stay
// in lockstep.
//
// Soft-delete model: deleted_at IS NULL = active. All reads filter.
// Hard deletes are not exposed — the WI-C append-only triggers block
// activity_log DELETE anyway, and retention obligations (see
// docs/compliance-notes.md §1) prefer soft delete throughout.
//
// org_id scoping: every mutation is gated on (org_id, incident_id) so
// a cross-org actor can't reach into another tenant's data even if
// they guess an apId or injuryId.
//
// Activity log: writeActivity() with entity_type='incident' so the
// timeline rolls up to the parent incident. WI-C autocomputes the
// hash chain on every INSERT.

import db from '../db/connection.js';
import { writeActivity, diffFields } from './activity_log.js';

// ----- Field allowlists for INSERT / PATCH safety -----
// PATCH callers can supply any subset; unknown keys are silently
// dropped. INSERT requires nothing beyond the FK columns, but most
// callers will fill name + at least one identifying field.

export const AFFECTED_PERSON_FIELDS = [
  'name', 'dob', 'gender', 'address', 'phone', 'email',
  'job_title', 'employment_status', 'employer_name', 'date_hired',
  'experience_years', 'hours_into_shift',
  'is_privacy_case', 'is_primary',
];

export const INJURY_FIELDS = [
  'body_part', 'injury_type', 'mechanism', 'object_substance',
  'treatment', 'physician_name', 'physician_phone', 'physician_facility',
  'er_treated', 'hospitalized', 'hospitalization_date',
  'days_away', 'days_restricted', 'date_of_death',
  'narrative',
];

const EMPLOYMENT_STATUS_VALUES = new Set([
  'employee', 'contractor', 'labour_hire', 'volunteer',
  'visitor', 'member_of_public', 'self_employed',
]);

// Pick allowed keys + drop undefined values. Used for both INSERT
// column lists and PATCH partial updates.
function pickAllowed(payload, allowlist) {
  const out = {};
  if (!payload || typeof payload !== 'object') return out;
  for (const k of allowlist) {
    if (payload[k] !== undefined) out[k] = payload[k];
  }
  return out;
}

function bool01(v) {
  // Frontend may send true/false/1/0/"yes"/null. Coerce to SQLite 0/1.
  if (v === undefined || v === null || v === '') return 0;
  if (v === true || v === 1 || v === '1' || v === 'true' || v === 'yes') return 1;
  return 0;
}

function normalizeAffectedPersonPatch(patch) {
  const clean = pickAllowed(patch, AFFECTED_PERSON_FIELDS);
  if ('is_privacy_case' in clean) clean.is_privacy_case = bool01(clean.is_privacy_case);
  if ('is_primary' in clean) clean.is_primary = bool01(clean.is_primary);
  if ('employment_status' in clean && clean.employment_status != null) {
    if (!EMPLOYMENT_STATUS_VALUES.has(clean.employment_status)) {
      throw new Error(`employment_status must be one of: ${[...EMPLOYMENT_STATUS_VALUES].join(', ')}`);
    }
  }
  return clean;
}

function normalizeInjuryPatch(patch) {
  const clean = pickAllowed(patch, INJURY_FIELDS);
  if ('er_treated' in clean) clean.er_treated = bool01(clean.er_treated);
  if ('hospitalized' in clean) clean.hospitalized = bool01(clean.hospitalized);
  if ('days_away' in clean) clean.days_away = Number(clean.days_away) || 0;
  if ('days_restricted' in clean) clean.days_restricted = Number(clean.days_restricted) || 0;
  return clean;
}

// ----- Read -----

export function listAffectedPersons({ orgId, incidentId }) {
  const persons = db.prepare(`
    SELECT * FROM affected_persons
    WHERE org_id = ? AND incident_id = ? AND deleted_at IS NULL
    ORDER BY is_primary DESC, id ASC
  `).all(orgId, incidentId);
  if (persons.length === 0) return [];
  const injStmt = db.prepare(`
    SELECT * FROM injuries
    WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL
    ORDER BY id ASC
  `);
  return persons.map(ap => ({
    ...ap,
    injuries: injStmt.all(orgId, ap.id),
  }));
}

export function getAffectedPerson({ orgId, incidentId, apId }) {
  const ap = db.prepare(`
    SELECT * FROM affected_persons
    WHERE id = ? AND org_id = ? AND incident_id = ? AND deleted_at IS NULL
  `).get(apId, orgId, incidentId);
  if (!ap) return null;
  ap.injuries = db.prepare(`
    SELECT * FROM injuries
    WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL
    ORDER BY id ASC
  `).all(orgId, ap.id);
  return ap;
}

function findActivePrimary(orgId, incidentId) {
  return db.prepare(`
    SELECT id FROM affected_persons
    WHERE org_id = ? AND incident_id = ? AND is_primary = 1 AND deleted_at IS NULL
  `).get(orgId, incidentId);
}

// ----- Write: affected_persons -----

// Creates an affected_person plus zero or more injuries in one tx.
// payload shape: { ...AP fields, injuries?: [ ...INJURY fields ... ] }
// If payload.is_primary and another primary exists, the existing one is
// cleared in the same tx before insert (partial UNIQUE index requires
// this swap to be atomic).
export function createAffectedPerson({ orgId, incidentId, payload, userId, req }) {
  const apData = normalizeAffectedPersonPatch(payload);
  const injuriesIn = Array.isArray(payload?.injuries) ? payload.injuries : [];

  const result = db.transaction(() => {
    if (apData.is_primary === 1) {
      const existing = findActivePrimary(orgId, incidentId);
      if (existing) {
        db.prepare('UPDATE affected_persons SET is_primary = 0, updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?')
          .run(userId, existing.id);
      }
    }

    const cols = Object.keys(apData);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(k => apData[k]);
    const sql = `
      INSERT INTO affected_persons
        (org_id, incident_id, created_by, updated_by${cols.length ? ', ' + cols.join(', ') : ''})
      VALUES (?, ?, ?, ?${cols.length ? ', ' + placeholders : ''})
    `;
    const ins = db.prepare(sql).run(orgId, incidentId, userId, userId, ...values);
    const apId = ins.lastInsertRowid;

    const createdInjuries = injuriesIn.map(injPayload => {
      const inj = normalizeInjuryPatch(injPayload);
      return _insertInjury({ orgId, apId, payload: inj, userId });
    });

    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'affected_person_added',
      description: `added affected person${apData.name ? ` "${apData.name}"` : ''}${createdInjuries.length ? ` with ${createdInjuries.length} injury record(s)` : ''}`,
      user_id: userId,
      metadata: { affected_person_id: apId, injury_count: createdInjuries.length },
      ip: req?.ip ?? null,
      user_agent: req?.headers?.['user-agent'] ?? null,
    });

    return apId;
  })();

  return getAffectedPerson({ orgId, incidentId, apId: result });
}

export function updateAffectedPerson({ orgId, incidentId, apId, patch, userId, req }) {
  const clean = normalizeAffectedPersonPatch(patch);
  if (Object.keys(clean).length === 0) {
    return getAffectedPerson({ orgId, incidentId, apId });
  }

  const before = getAffectedPerson({ orgId, incidentId, apId });
  if (!before) return null;

  db.transaction(() => {
    // is_primary flip: clear any other primary first.
    if (clean.is_primary === 1 && before.is_primary !== 1) {
      const existing = findActivePrimary(orgId, incidentId);
      if (existing && existing.id !== apId) {
        db.prepare('UPDATE affected_persons SET is_primary = 0, updated_at = datetime(\'now\'), updated_by = ? WHERE id = ?')
          .run(userId, existing.id);
      }
    }

    const cols = Object.keys(clean);
    const setSql = cols.map(k => `${k} = ?`).join(', ');
    db.prepare(`
      UPDATE affected_persons
      SET ${setSql}, updated_at = datetime('now'), updated_by = ?
      WHERE id = ? AND org_id = ? AND incident_id = ? AND deleted_at IS NULL
    `).run(...cols.map(k => clean[k]), userId, apId, orgId, incidentId);
  })();

  const after = getAffectedPerson({ orgId, incidentId, apId });
  const diff = diffFields(before, after, AFFECTED_PERSON_FIELDS);
  if (diff) {
    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'affected_person_updated',
      description: `updated affected person${after.name ? ` "${after.name}"` : ` #${apId}`}`,
      user_id: userId,
      metadata: { affected_person_id: apId },
      field_diffs: diff,
      ip: req?.ip ?? null,
      user_agent: req?.headers?.['user-agent'] ?? null,
    });
  }
  return after;
}

export function softDeleteAffectedPerson({ orgId, incidentId, apId, userId, req }) {
  const before = getAffectedPerson({ orgId, incidentId, apId });
  if (!before) return null;

  db.transaction(() => {
    db.prepare(`
      UPDATE affected_persons
      SET deleted_at = datetime('now'), updated_at = datetime('now'), updated_by = ?
      WHERE id = ? AND org_id = ? AND incident_id = ? AND deleted_at IS NULL
    `).run(userId, apId, orgId, incidentId);
    // Cascade soft-delete the injuries so list views don't surface orphans.
    db.prepare(`
      UPDATE injuries
      SET deleted_at = datetime('now'), updated_at = datetime('now'), updated_by = ?
      WHERE affected_person_id = ? AND org_id = ? AND deleted_at IS NULL
    `).run(userId, apId, orgId);
  })();

  writeActivity({
    org_id: orgId,
    entity_type: 'incident',
    entity_id: incidentId,
    action: 'affected_person_removed',
    description: `removed affected person${before.name ? ` "${before.name}"` : ` #${apId}`}`,
    user_id: userId,
    metadata: { affected_person_id: apId, was_primary: before.is_primary === 1 },
    ip: req?.ip ?? null,
    user_agent: req?.headers?.['user-agent'] ?? null,
  });

  return { ok: true, deleted_id: apId };
}

// ----- Write: injuries -----

function _insertInjury({ orgId, apId, payload, userId }) {
  const cols = Object.keys(payload);
  const placeholders = cols.map(() => '?').join(', ');
  const values = cols.map(k => payload[k]);
  const sql = `
    INSERT INTO injuries
      (org_id, affected_person_id, created_by, updated_by${cols.length ? ', ' + cols.join(', ') : ''})
    VALUES (?, ?, ?, ?${cols.length ? ', ' + placeholders : ''})
  `;
  return db.prepare(sql).run(orgId, apId, userId, userId, ...values).lastInsertRowid;
}

export function createInjury({ orgId, incidentId, apId, payload, userId, req }) {
  const ap = getAffectedPerson({ orgId, incidentId, apId });
  if (!ap) return null;

  const clean = normalizeInjuryPatch(payload);
  const injuryId = _insertInjury({ orgId, apId, payload: clean, userId });

  writeActivity({
    org_id: orgId,
    entity_type: 'incident',
    entity_id: incidentId,
    action: 'injury_added',
    description: `added injury record${clean.body_part ? ` (${clean.body_part})` : ''}${ap.name ? ` for ${ap.name}` : ''}`,
    user_id: userId,
    metadata: { affected_person_id: apId, injury_id: injuryId },
    ip: req?.ip ?? null,
    user_agent: req?.headers?.['user-agent'] ?? null,
  });

  return db.prepare(`
    SELECT * FROM injuries WHERE id = ? AND deleted_at IS NULL
  `).get(injuryId);
}

export function updateInjury({ orgId, incidentId, apId, injuryId, patch, userId, req }) {
  const ap = getAffectedPerson({ orgId, incidentId, apId });
  if (!ap) return null;
  const before = db.prepare(`
    SELECT * FROM injuries
    WHERE id = ? AND affected_person_id = ? AND org_id = ? AND deleted_at IS NULL
  `).get(injuryId, apId, orgId);
  if (!before) return null;

  const clean = normalizeInjuryPatch(patch);
  if (Object.keys(clean).length === 0) return before;

  const cols = Object.keys(clean);
  const setSql = cols.map(k => `${k} = ?`).join(', ');
  db.prepare(`
    UPDATE injuries
    SET ${setSql}, updated_at = datetime('now'), updated_by = ?
    WHERE id = ? AND affected_person_id = ? AND org_id = ? AND deleted_at IS NULL
  `).run(...cols.map(k => clean[k]), userId, injuryId, apId, orgId);

  const after = db.prepare('SELECT * FROM injuries WHERE id = ?').get(injuryId);
  const diff = diffFields(before, after, INJURY_FIELDS);
  if (diff) {
    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'injury_updated',
      description: `updated injury record${after.body_part ? ` (${after.body_part})` : ''}${ap.name ? ` for ${ap.name}` : ''}`,
      user_id: userId,
      metadata: { affected_person_id: apId, injury_id: injuryId },
      field_diffs: diff,
      ip: req?.ip ?? null,
      user_agent: req?.headers?.['user-agent'] ?? null,
    });
  }
  return after;
}

export function softDeleteInjury({ orgId, incidentId, apId, injuryId, userId, req }) {
  const ap = getAffectedPerson({ orgId, incidentId, apId });
  if (!ap) return null;
  const before = db.prepare(`
    SELECT * FROM injuries
    WHERE id = ? AND affected_person_id = ? AND org_id = ? AND deleted_at IS NULL
  `).get(injuryId, apId, orgId);
  if (!before) return null;

  db.prepare(`
    UPDATE injuries
    SET deleted_at = datetime('now'), updated_at = datetime('now'), updated_by = ?
    WHERE id = ? AND affected_person_id = ? AND org_id = ? AND deleted_at IS NULL
  `).run(userId, injuryId, apId, orgId);

  writeActivity({
    org_id: orgId,
    entity_type: 'incident',
    entity_id: incidentId,
    action: 'injury_removed',
    description: `removed injury record${before.body_part ? ` (${before.body_part})` : ''}${ap.name ? ` for ${ap.name}` : ''}`,
    user_id: userId,
    metadata: { affected_person_id: apId, injury_id: injuryId },
    ip: req?.ip ?? null,
    user_agent: req?.headers?.['user-agent'] ?? null,
  });

  return { ok: true, deleted_id: injuryId };
}

// ----- Legacy bridge: type_data.injured_person ↔ primary affected_person -----
//
// Used by dual-write hooks in routes/incidents.js (A4) so that
// (a) incidents created via the existing single-person POST shape get
//     a primary affected_person + primary injury automatically; and
// (b) incidents created via the new multi-person shape get a
//     type_data.injured_person snapshot derived from the primary so
//     OSHA 301 / RIDDOR classification continue to work unchanged.

// Pull a {name, job_title, ...} sub-record from typeData; returns null
// if not present. Tolerates both '$.injured_person' and '$.affected_person'.
export function extractLegacyInjuredPerson(typeData) {
  const td = typeof typeData === 'string' ? safeJsonParse(typeData) : (typeData || {});
  return td?.injured_person ?? td?.affected_person ?? null;
}

function safeJsonParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

// Map legacy JSON sub-record → affected_persons column shape. Mirrors
// the field selection used in migration 025's backfill.
export function mapInjuredPersonToColumns(injuredPerson) {
  if (!injuredPerson || typeof injuredPerson !== 'object') return {};
  return {
    name: injuredPerson.name ?? null,
    dob: injuredPerson.dob ?? null,
    gender: injuredPerson.gender ?? null,
    address: injuredPerson.address ?? null,
    phone: injuredPerson.phone ?? null,
    email: injuredPerson.email ?? null,
    job_title: injuredPerson.job_title ?? injuredPerson.department ?? null,
    employment_status: injuredPerson.employment_status ?? null,
    employer_name: injuredPerson.employer_name ?? null,
    date_hired: injuredPerson.date_hired ?? injuredPerson.hire_date ?? null,
    experience_years: injuredPerson.experience_years ?? null,
    hours_into_shift: injuredPerson.hours_into_shift ?? null,
  };
}

// Reverse: given a primary affected_person + its injuries, build the
// {name, job_title, ...} object the OSHA 301 / RIDDOR engines read.
// Used by POST /incidents to write a back-compat snapshot to type_data.
export function buildLegacyInjuredPerson(affectedPerson) {
  if (!affectedPerson) return null;
  const ap = affectedPerson;
  return {
    name: ap.name ?? null,
    job_title: ap.job_title ?? null,
    dob: ap.dob ?? null,
    date_hired: ap.date_hired ?? null,
    gender: ap.gender ?? null,
    address: ap.address ?? null,
    phone: ap.phone ?? null,
    email: ap.email ?? null,
    employment_status: ap.employment_status ?? null,
  };
}

// Used by routes/incidents.js POST handler when a legacy single-person
// shape arrives (i.e. payload.affected_persons is absent but
// type_data.injured_person is present). Creates a primary
// affected_person + primary injury reflecting the JSON + the
// typed-column data on the incidents row. Returns the new apId.
export function upsertPrimaryFromLegacy({ orgId, incidentId, typeData, incidentColumns, userId }) {
  const injuredPerson = extractLegacyInjuredPerson(typeData);
  if (!injuredPerson) return null;  // nothing to mirror

  const existing = findActivePrimary(orgId, incidentId);
  if (existing) return existing.id;  // idempotent — backfill or earlier dual-write covered it

  const apCols = mapInjuredPersonToColumns(injuredPerson);
  const apData = { ...apCols, is_primary: 1 };
  if (incidentColumns?.osha_privacy_case === 1) apData.is_privacy_case = 1;

  const injCols = mapTypeDataToInjuryColumns(typeData, incidentColumns);

  // Reuse createAffectedPerson but bypass its activity_log row — this
  // upsert is happening as part of incident creation; the parent
  // 'incident_created' row already captures the actor and context.
  // Writing a second 'affected_person_added' row for the same actor at
  // the same moment is noise. Inline the insert instead.
  const result = db.transaction(() => {
    const cols = Object.keys(apData);
    const placeholders = cols.map(() => '?').join(', ');
    const values = cols.map(k => apData[k]);
    const ins = db.prepare(`
      INSERT INTO affected_persons
        (org_id, incident_id, created_by, updated_by, ${cols.join(', ')})
      VALUES (?, ?, ?, ?, ${placeholders})
    `).run(orgId, incidentId, userId, userId, ...values);
    const apId = ins.lastInsertRowid;
    _insertInjury({ orgId, apId, payload: injCols, userId });
    return apId;
  })();
  return result;
}

function mapTypeDataToInjuryColumns(typeData, incidentColumns) {
  const td = typeof typeData === 'string' ? safeJsonParse(typeData) : (typeData || {});
  const bodyParts = (() => {
    const raw = incidentColumns?.body_parts_affected;
    if (!raw || raw === '[]') return null;
    try {
      const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return Array.isArray(arr) && arr.length ? arr.join(', ') : null;
    } catch { return null; }
  })();
  const treatment = (() => {
    if (Array.isArray(td.treatments) && td.treatments.length) return td.treatments.join('; ');
    if (Array.isArray(td.treatment) && td.treatment.length) return td.treatment.join('; ');
    return typeof td.treatment === 'string' ? td.treatment : null;
  })();
  return {
    body_part: bodyParts,
    injury_type: td.injury_type ?? null,
    mechanism: td.mechanism ?? null,
    object_substance: td.object_substance ?? td.substance?.name ?? null,
    treatment,
    physician_name: td.physician_name ?? null,
    physician_phone: td.physician_phone ?? null,
    physician_facility: td.facility_name ?? td.physician_facility ?? null,
    er_treated: incidentColumns?.er_treated ? 1 : 0,
    hospitalized: incidentColumns?.hospitalized ? 1 : 0,
    hospitalization_date: incidentColumns?.hospitalization_date ?? null,
    days_away: Number(incidentColumns?.osha_days_away) || 0,
    days_restricted: Number(incidentColumns?.osha_days_restricted) || 0,
    date_of_death: incidentColumns?.osha_date_of_death ?? null,
    narrative: incidentColumns?.description ?? null,
  };
}
