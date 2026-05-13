import { Router } from 'express';
import db from '../db/connection.js';
import { nextIncidentNumber, nextInvestigationNumber, nextRiddorNumber } from '../services/numbering.js';
import { calculateSeverityAndTrack, shouldAutoClose, inferSeverityFrom } from '../services/classification.js';
import { determineOshaRecordability, determineRiddorReportability, calculateDeadline } from '../services/regulatory.js';
import { verifyOshaRecordability } from '../services/recordability.js';
import { parseBodyParts } from '../services/body_parts.js';
import multer from 'multer';
import { extractFromTranscript } from '../services/voice_extract.js';
import { extractFromTranscriptGemini } from '../services/gemini_extract.js';
import { transcribeAudio } from '../services/gemini_transcribe.js';
import { analyzeVideo } from '../services/gemini_video.js';
import { analyzeImages } from '../services/gemini_image.js';

const audioUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['video/mp4', 'video/webm', 'video/quicktime', 'video/3gpp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported video type: ${file.mimetype}. Use MP4, WebM, or MOV.`));
  },
});
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Unsupported image type: ${file.mimetype}. Use JPEG, PNG, or WebP.`));
  },
});
import { injuryTypeForOsha300, descriptionForOsha300 } from '../services/osha_300_helpers.js';
import { createCapaRow } from './capas.js';
import { notifyUser, notifyElevatedAtSite, notifyRole } from '../services/notifications.js';
import { evaluateClosureGates } from '../services/closure_gates.js';
import { writeActivity, auditCtx } from '../services/activity_log.js';
import {
  computePendingDeadlines,
  getPendingDeadlinesForIncident,
  loadRiddorReportsForIncidents,
  loadOshaSevereForIncidents,
  loadNswNotificationsForIncidents,
  mostUrgent,
} from '../services/deadlines.js';
import { syncSevereNotifications } from '../services/osha_severe.js';
import { syncSafeworkNswNotification } from '../services/safework_nsw.js';
import { canActOnAssignment, requireAssigneeOrElevated } from '../services/permissions.js';
import {
  upsertPrimaryFromLegacy,
  bulkInsertFromArray,
  buildLegacyInjuredPerson,
  updateAffectedPerson,
  updateInjury,
  mapInjuredPersonToColumns,
} from '../services/affected_persons.js';

const router = Router();

// Roles that may mutate severity/track/regulatory/assignment.
// Phase 2 collapses these to worker/ehs_manager/site_admin.
const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// WI-A defensive: the wizard now lifts flat injured_* keys into a nested
// injured_person sub-record at submit time, but a curl PATCH or older
// client may still send the flat shape. Mirror the wizard's lift here
// so both the incidents.type_data stored on disk AND the affected_persons
// sync see the same complete injured_person object. Mutates typeData in
// place; safe to call on any PATCH body that includes type_data.
const FLAT_INJURED_KEYS = [
  ['injured_name', 'name'],
  ['injured_job_title', 'job_title'],
  ['injured_department', 'department'],
  ['injured_dob', 'dob'],
  ['injured_gender', 'gender'],
  ['injured_date_hired', 'date_hired'],
  ['injured_address', 'address'],
  ['injured_phone', 'phone'],
];
function liftFlatInjuredKeys(typeData) {
  if (!typeData || typeof typeData !== 'object') return typeData;
  const hasFlat = FLAT_INJURED_KEYS.some(([flat]) => typeData[flat] !== undefined);
  if (!hasFlat) return typeData;
  // Only lift keys actually present in the flat body. Don't default
  // unspecified keys to null — that would wipe existing fields via the
  // affected_persons sync downstream.
  const lifted = { ...(typeData.injured_person || {}) };
  for (const [flat, nested] of FLAT_INJURED_KEYS) {
    if (typeData[flat] !== undefined) lifted[nested] = typeData[flat];
  }
  typeData.injured_person = lifted;
  return typeData;
}

// WI-A: keep the primary affected_person + primary injury in sync with
// whatever was PATCHed against an existing incident. Called from PATCH
// /:id. Multi-person edits use /incidents/:id/affected-persons/... and
// don't go through here.
//
// Safe to call on every PATCH — if no sync surface applies, returns
// without writing.
function syncAffectedPersonsOnPatch({ incident, body, req, userId }) {
  const orgId = incident.org_id;
  const incidentId = incident.id;

  // ----- 1. Locate the active primary affected_person, if any. -----
  let primary = db.prepare(`
    SELECT * FROM affected_persons
    WHERE org_id = ? AND incident_id = ? AND is_primary = 1 AND deleted_at IS NULL
  `).get(orgId, incidentId);

  // ----- 2. type_data.injured_person changes → upsert primary AP. -----
  if (body.type_data !== undefined) {
    const newTd = body.type_data || {};
    const newIp = newTd.injured_person || newTd.affected_person || null;

    if (newIp && primary) {
      // Update existing primary with the new identity fields.
      const apPatch = mapInjuredPersonToColumns(newIp);
      // Drop keys whose value didn't actually change so we don't write
      // a no-op diff to activity_log.
      const realPatch = {};
      for (const [k, v] of Object.entries(apPatch)) {
        if (v !== undefined && (primary[k] ?? null) !== (v ?? null)) realPatch[k] = v;
      }
      if (Object.keys(realPatch).length > 0) {
        updateAffectedPerson({ orgId, incidentId, apId: primary.id, patch: realPatch, userId, req });
        // Re-fetch so downstream paths see the new values.
        primary = db.prepare(`SELECT * FROM affected_persons WHERE id = ?`).get(primary.id);
      }
    } else if (newIp && !primary) {
      // No primary today — create one from the merged type_data so the
      // multi-person side-table doesn't drift from the JSON forever.
      // Use upsertPrimaryFromLegacy (no audit row of its own; the parent
      // PATCH activity_log captures the actor).
      const merged = { ...(safeParse(incident.type_data) || {}), ...newTd };
      upsertPrimaryFromLegacy({
        orgId, incidentId,
        typeData: merged,
        incidentColumns: {
          er_treated: body.er_treated ?? incident.er_treated,
          hospitalized: body.hospitalized ?? incident.hospitalized,
          hospitalization_date: body.hospitalization_date ?? incident.hospitalization_date,
          body_parts_affected: body.body_parts_affected !== undefined
            ? JSON.stringify(parseBodyParts(body.body_parts_affected))
            : incident.body_parts_affected,
          osha_privacy_case: body.osha_privacy_case ?? incident.osha_privacy_case ?? 0,
          osha_days_away: body.osha_days_away ?? incident.osha_days_away ?? 0,
          osha_days_restricted: body.osha_days_restricted ?? incident.osha_days_restricted ?? 0,
          osha_date_of_death: body.osha_date_of_death ?? incident.osha_date_of_death,
          description: body.description ?? incident.description,
        },
        userId,
      });
      primary = db.prepare(`
        SELECT * FROM affected_persons
        WHERE org_id = ? AND incident_id = ? AND is_primary = 1 AND deleted_at IS NULL
      `).get(orgId, incidentId);
    }
  }

  // ----- 3. osha_privacy_case flip → mirror onto primary AP. -----
  if (body.osha_privacy_case !== undefined && primary) {
    const desired = body.osha_privacy_case ? 1 : 0;
    if (primary.is_privacy_case !== desired) {
      updateAffectedPerson({
        orgId, incidentId, apId: primary.id,
        patch: { is_privacy_case: desired },
        userId, req,
      });
    }
  }

  // ----- 4. Primary-injury mirror columns → patch the primary injury. -----
  // The wizard's er_treated / hospitalized / osha_days_* / hospitalization_date /
  // description path is the legacy "first injury" surface. body_parts_affected
  // on the incident column also folds into body_part (comma-joined) for the
  // primary injury.
  if (!primary) return;

  const injPatch = {};
  if (body.er_treated !== undefined) injPatch.er_treated = body.er_treated;
  if (body.hospitalized !== undefined) injPatch.hospitalized = body.hospitalized;
  if (body.hospitalization_date !== undefined) injPatch.hospitalization_date = body.hospitalization_date;
  if (body.osha_days_away !== undefined) injPatch.days_away = body.osha_days_away;
  if (body.osha_days_restricted !== undefined) injPatch.days_restricted = body.osha_days_restricted;
  if (body.osha_date_of_death !== undefined) injPatch.date_of_death = body.osha_date_of_death;
  if (body.description !== undefined) injPatch.narrative = body.description;
  if (body.body_parts_affected !== undefined) {
    const parts = parseBodyParts(body.body_parts_affected);
    injPatch.body_part = parts.length ? parts.join(', ') : null;
  }

  if (Object.keys(injPatch).length === 0) return;

  const primaryInjury = db.prepare(`
    SELECT id FROM injuries
    WHERE affected_person_id = ? AND deleted_at IS NULL
    ORDER BY id ASC LIMIT 1
  `).get(primary.id);

  if (primaryInjury) {
    updateInjury({
      orgId, incidentId, apId: primary.id, injuryId: primaryInjury.id,
      patch: injPatch, userId, req,
    });
  }
}

function safeParse(s) {
  try { return JSON.parse(s || '{}'); } catch { return {}; }
}

const RESTRICTED_FIELDS = new Set([
  'severity', 'track', 'status', 'assigned_to',
  'triage_due', 'triage_notes',
  'osha_recordable', 'osha_recordability_type', 'osha_days_away', 'osha_days_restricted',
  'osha_privacy_case', 'osha_work_related', 'er_treated', 'hospitalized', 'hospitalization_date',
  'riddor_reportable',
]);

function trackForSeverity(severity) {
  if (severity <= 2) return 'A';
  if (severity === 3) return 'B';
  return 'C';
}

// Count prior incidents in the last N days at the same asset (preferred)
// or, lacking an asset, at the same site + area. Used for the trending
// banner in the wizard and for likelihood inference. Excludes the
// supplied `excludeId` so a freshly-inserted incident doesn't count itself.
function priorIncidentsCount({ orgId, assetId, siteId, area, days = 90, excludeId = null }) {
  const window = `-${days} days`;
  if (assetId) {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM incidents
      WHERE org_id = ? AND asset_id = ?
        AND incident_datetime > datetime('now', ?)
        AND (? IS NULL OR id != ?)
    `).get(orgId, assetId, window, excludeId, excludeId);
    return row.c;
  }
  if (siteId && area) {
    const row = db.prepare(`
      SELECT COUNT(*) as c FROM incidents
      WHERE org_id = ? AND site_id = ? AND area = ?
        AND incident_datetime > datetime('now', ?)
        AND (? IS NULL OR id != ?)
    `).get(orgId, siteId, area, window, excludeId, excludeId);
    return row.c;
  }
  return 0;
}

router.get('/', (req, res) => {
  const { type, severity, status, site_id, track, search, page = 1, limit = 50 } = req.query;
  const orgId = req.user.org_id;

  let where = ['i.org_id = ?'];
  let params = [orgId];

  if (type) { where.push('i.type = ?'); params.push(type); }
  if (severity) { where.push('i.severity = ?'); params.push(Number(severity)); }
  if (status) { where.push('i.status = ?'); params.push(status); }
  if (site_id) { where.push('i.site_id = ?'); params.push(Number(site_id)); }
  if (track) { where.push('i.track = ?'); params.push(track); }
  if (search) { where.push("(i.title LIKE ? OR i.incident_number LIKE ? OR i.description LIKE ?)"); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as count FROM incidents i WHERE ${whereClause}`).get(...params).count;

  const incidents = db.prepare(`
    SELECT i.*, s.name as site_name, u.name as reporter_name, u.initials as reporter_initials,
           a.name as assignee_name, a.initials as assignee_initials
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    LEFT JOIN users a ON a.id = i.assigned_to
    WHERE ${whereClause}
    ORDER BY i.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  // Scrub anonymous reporter info (per locked decision #10)
  for (const inc of incidents) {
    if (inc.is_anonymous) {
      inc.reporter_name = 'Anonymous';
      inc.reporter_initials = 'AN';
      inc.reported_by = null;
    }
  }

  // WI-08: attach pending_deadlines + most_urgent_deadline per row so the
  // IncidentsList can render a single inline badge without a follow-up
  // fetch. One bulk SELECT loads RIDDOR rows for the listed incidents;
  // a second loads WI-07 OSHA 1904.39 severe-notification rows.
  // computePendingDeadlines merges them in row-by-row.
  const incidentIds = incidents.map(i => i.id);
  const riddorMap = loadRiddorReportsForIncidents(incidentIds);
  const oshaSevereMap = loadOshaSevereForIncidents(req.user.org_id, incidentIds);
  const nswMap = loadNswNotificationsForIncidents(req.user.org_id, incidentIds);
  for (const inc of incidents) {
    const deadlines = computePendingDeadlines(
      inc,
      riddorMap.get(inc.id),
      oshaSevereMap.get(inc.id) || [],
      nswMap.get(inc.id) || null,
    );
    inc.pending_deadlines = deadlines;
    inc.most_urgent_deadline = mostUrgent(deadlines);
  }

  res.json({ incidents, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const incident = db.prepare(`
    SELECT i.*, s.name as site_name, s.country as site_country,
           u.name as reporter_name, u.initials as reporter_initials,
           a.name as assignee_name, a.initials as assignee_initials,
           vu.name as verified_by_name, vu.initials as verified_by_initials
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    LEFT JOIN users a ON a.id = i.assigned_to
    LEFT JOIN users vu ON vu.id = i.osha_recordable_verified_by
    WHERE i.id = ? AND i.org_id = ?
  `).get(req.params.id, req.user.org_id);

  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const witnesses = db.prepare('SELECT * FROM witnesses WHERE incident_id = ?').all(incident.id);
  const attachments = db.prepare("SELECT * FROM attachments WHERE entity_type = 'incident' AND entity_id = ?").all(incident.id);
  const activity = db.prepare(
    "SELECT al.*, u.name as user_name, u.initials as user_initials FROM activity_log al LEFT JOIN users u ON u.id = al.user_id WHERE al.entity_type = 'incident' AND al.entity_id = ? ORDER BY al.created_at DESC"
  ).all(incident.id);

  incident.type_data = JSON.parse(incident.type_data || '{}');
  incident.body_parts_affected = JSON.parse(incident.body_parts_affected || '[]');

  // Per locked decision #10: anonymous reports never expose a reporter
  // identity, even if the column would otherwise show via JOIN. Scrub.
  if (incident.is_anonymous) {
    incident.reporter_name = 'Anonymous';
    incident.reporter_initials = 'AN';
    incident.reported_by = null;
  }

  const closure_request = db.prepare(`
    SELECT cr.*, u.name as requested_by_name, u.initials as requested_by_initials,
           rv.name as reviewed_by_name, rv.initials as reviewed_by_initials
    FROM closure_requests cr
    LEFT JOIN users u ON u.id = cr.requested_by
    LEFT JOIN users rv ON rv.id = cr.reviewed_by
    WHERE cr.incident_id = ? AND cr.status = 'pending'
    ORDER BY cr.created_at DESC LIMIT 1
  `).get(incident.id);

  // WI-08: attach pending_deadlines + most_urgent_deadline so the
  // IncidentDetail header renders without a follow-up fetch. Reuses the
  // same helper as the standalone /deadlines endpoint.
  const pending_deadlines = getPendingDeadlinesForIncident(req.user.org_id, incident.id) || [];
  const most_urgent_deadline = mostUrgent(pending_deadlines);

  // Full RIDDOR rows for the incident so the detail page can render the
  // Log phone / Log F2508 actions without a second fetch. JOIN the
  // notifier/submitter names while we're here.
  const riddor_reports = db.prepare(`
    SELECT r.*,
           u_phone.name AS phone_notified_by_name,
           u_written.name AS written_submitted_by_name
    FROM riddor_reports r
    LEFT JOIN users u_phone ON u_phone.id = r.phone_notified_by
    LEFT JOIN users u_written ON u_written.id = r.written_submitted_by
    WHERE r.incident_id = ? AND r.org_id = ?
    ORDER BY r.id
  `).all(incident.id, req.user.org_id);

  res.json({
    ...incident,
    witnesses, attachments, activity,
    closure_request: closure_request || null,
    pending_deadlines,
    most_urgent_deadline,
    riddor_reports,
  });
});

// WI-08: aggregated regulatory deadlines for one incident. Today RIDDOR
// is the only source; WI-06 (SafeWork NSW) and WI-07 (OSHA 1904.39) plug
// in via deadlines.js when they land. Returns [] for incidents with no
// applicable deadline (e.g. non-RIDDOR US injury), 404 for cross-tenant.
router.get('/:id/deadlines', (req, res) => {
  const deadlines = getPendingDeadlinesForIncident(req.user.org_id, Number(req.params.id));
  if (deadlines === null) return res.status(404).json({ error: 'Incident not found' });
  res.json({ pending_deadlines: deadlines });
});

router.post('/', async (req, res, next) => {
  try {
  const {
    title, type, description, incident_datetime, site_id, area, specific_location,
    department, shift, likelihood, consequence, type_data, immediate_actions_taken,
    asset_id,
    body_parts_affected,
    is_anonymous,
    witnesses: witnessData,
    voice_extraction_id,
    voice_user_confirmed,
    voice_user_edited,
    voice_user_rejected,
    // WI-A: optional multi-person shape. When present, this REPLACES the
    // legacy type_data.injured_person sub-record for purposes of OSHA
    // recordability + RIDDOR classification — we synthesize a back-compat
    // injured_person from the primary entry below.
    affected_persons,
  } = req.body;

  if (!title || !type || !site_id || !incident_datetime) {
    return res.status(400).json({ error: 'Title, type, site_id, and incident_datetime are required' });
  }

  const orgId = req.user.org_id;

  // Anonymous: per locked decision #10, allowed for 6 of 8 types only.
  // Injury and illness identify a person and require an audit trail.
  const anonymous = !!is_anonymous;
  if (anonymous && (type === 'injury' || type === 'illness')) {
    return res.status(400).json({
      error: 'Anonymous reporting is not permitted for injury or illness types — these require identifying the affected person.',
    });
  }

  // Validate asset belongs to user's org + matches the chosen site (if provided)
  let resolvedAssetId = null;
  if (asset_id) {
    const a = db.prepare('SELECT id, site_id FROM assets WHERE id = ? AND org_id = ? AND active = 1').get(asset_id, orgId);
    if (!a) return res.status(404).json({ error: 'Asset not found in your organization' });
    if (a.site_id !== Number(site_id)) {
      return res.status(400).json({ error: 'Asset does not belong to the chosen site' });
    }
    resolvedAssetId = a.id;
  }

  // Sanitize body_parts_affected against the canonical region ID set
  const cleanedBodyParts = parseBodyParts(body_parts_affected);
  const bodyPartsJson = JSON.stringify(cleanedBodyParts);

  // Validate voice_extraction_id is one of the requester's extractions if
  // supplied. Quietly null it out if it doesn't belong — no need to 400 the
  // whole submission over a stale link.
  let resolvedVoiceExtractionId = null;
  if (voice_extraction_id) {
    const ve = db.prepare('SELECT id FROM voice_extractions WHERE id = ? AND created_by = ?')
      .get(voice_extraction_id, req.user.id);
    if (ve) resolvedVoiceExtractionId = ve.id;
  }

  const incidentNumber = nextIncidentNumber();
  const { severity, track } = calculateSeverityAndTrack(likelihood, consequence, type);

  // WI-A dual-write: if the caller supplied affected_persons[], synthesize
  // type_data.injured_person from the primary entry BEFORE classification
  // so OSHA recordability + RIDDOR engines see the same shape they
  // always did. The new tables get the full multi-person data after INSERT.
  const useArrayShape = Array.isArray(affected_persons) && affected_persons.length > 0;
  let workingTypeData = type_data || {};
  if (useArrayShape) {
    let primaryIdx = affected_persons.findIndex(p => p?.is_primary);
    if (primaryIdx < 0) primaryIdx = 0;
    const primary = affected_persons[primaryIdx];
    workingTypeData = {
      ...workingTypeData,
      injured_person: buildLegacyInjuredPerson(primary),
    };
  }

  const site = db.prepare('SELECT country FROM sites WHERE id = ?').get(site_id);
  const osha = determineOshaRecordability(type, workingTypeData);
  const riddor = determineRiddorReportability(type, workingTypeData, site?.country);

  const autoClose = shouldAutoClose(type, severity, track);
  const status = autoClose ? 'Closed' : 'New';

  // Per locked decision #10: anonymous incidents are stored with reported_by NULL
  // even when the submitter is logged in. The activity log entry below is also
  // scrubbed (user_id NULL, actor "Anonymous" in the description).
  const reportedBy = anonymous ? null : req.user.id;

  const td = workingTypeData || {};
  const erTreated = td.er_treated ? 1 : 0;
  const hospitalized = td.hospitalized ? 1 : 0;
  const hospitalizationDate = td.hospitalization_date || null;

  const result = db.prepare(`
    INSERT INTO incidents (
      incident_number, org_id, site_id, title, type, description, incident_datetime,
      area, specific_location, department, shift, asset_id,
      severity, likelihood, consequence, track,
      status, reported_by, is_anonymous, body_parts_affected,
      osha_recordable, osha_recordability_type,
      er_treated, hospitalized, hospitalization_date,
      riddor_reportable, riddor_category,
      type_data, immediate_actions_taken,
      voice_extraction_id,
      closed_at, closed_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    incidentNumber, orgId, site_id, title, type, description || '', incident_datetime,
    area || null, specific_location || null, department || null, shift || null, resolvedAssetId,
    severity, likelihood ?? null, consequence ?? null, track,
    status, reportedBy, anonymous ? 1 : 0, bodyPartsJson,
    osha.recordable ? 1 : 0, osha.type,
    erTreated, hospitalized, hospitalizationDate,
    riddor.reportable ? 1 : 0, riddor.category || null,
    JSON.stringify(td), immediate_actions_taken || null,
    resolvedVoiceExtractionId,
    autoClose ? new Date().toISOString() : null,
    autoClose ? 'Auto-closed (Track C)' : null
  );

  const incidentId = result.lastInsertRowid;

  // Record the user's confirm/edit/reject decisions on the voice extraction
  // row so audit can show how much of the AI's suggestion was kept verbatim.
  if (resolvedVoiceExtractionId) {
    db.prepare(`
      UPDATE voice_extractions
      SET incident_id = ?,
          user_confirmed_fields = ?,
          user_edited_fields = ?,
          user_rejected_fields = ?
      WHERE id = ?
    `).run(
      incidentId,
      JSON.stringify(Array.isArray(voice_user_confirmed) ? voice_user_confirmed : []),
      JSON.stringify(Array.isArray(voice_user_edited) ? voice_user_edited : []),
      JSON.stringify(Array.isArray(voice_user_rejected) ? voice_user_rejected : []),
      resolvedVoiceExtractionId,
    );
  }

  if (witnessData && Array.isArray(witnessData)) {
    const insertWitness = db.prepare('INSERT INTO witnesses (incident_id, name, contact) VALUES (?, ?, ?)');
    for (const w of witnessData) {
      if (w.name) insertWitness.run(incidentId, w.name, w.contact || null);
    }
  }

  // Scrub the actor on anonymous incidents: log user_id NULL and a description
  // that says "Anonymous reporter" rather than the JWT subject.
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'created', ?, ?)
  `).run(
    orgId, incidentId,
    anonymous
      ? `submitted ${incidentNumber} anonymously — ${type} · Sev ${severity} · Track ${track}`
      : `submitted ${incidentNumber} — ${type} · Sev ${severity} · Track ${track}`,
    anonymous ? null : req.user.id,
  );

  // WI-A dual-write: keep affected_persons + injuries tables in sync with
  // whichever payload shape the caller used. Either path is a no-op when
  // the incident type has no person data (nearmiss/property/env/unsafe/
  // observation/dangerous without an injured_person).
  const dualWriteCtx = {
    er_treated: erTreated,
    hospitalized,
    hospitalization_date: hospitalizationDate,
    body_parts_affected: bodyPartsJson,
    osha_privacy_case: 0,
    osha_days_away: 0,
    osha_days_restricted: 0,
    osha_date_of_death: null,
    description: description || '',
  };
  if (useArrayShape) {
    bulkInsertFromArray({
      orgId, incidentId, persons: affected_persons, userId: reportedBy,
    });
  } else if (workingTypeData?.injured_person || workingTypeData?.affected_person) {
    upsertPrimaryFromLegacy({
      orgId, incidentId,
      typeData: workingTypeData,
      incidentColumns: dualWriteCtx,
      userId: reportedBy,
    });
  }

  if (autoClose) {
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description)
      VALUES (?, 'incident', ?, 'auto_closed', ?)
    `).run(orgId, incidentId, `auto-routed ${incidentNumber} to Track C and closed`);
  }

  if (osha.recordable) {
    const year = new Date(incident_datetime).getFullYear();
    const maxCase = db.prepare('SELECT MAX(case_number) as m FROM osha_300_log WHERE site_id = ? AND calendar_year = ?').get(site_id, year);
    const caseNum = (maxCase?.m || 0) + 1;

    const oshaResult = db.prepare(`
      INSERT INTO osha_300_log (org_id, site_id, incident_id, calendar_year, case_number, employee_name, job_title, injury_date, location, description,
        classification_death, classification_days_away, classification_job_transfer, classification_other, injury_type, is_privacy_case)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orgId, site_id, incidentId, year, caseNum,
      td.injured_person?.name || td.affected_person?.name || 'Unknown',
      td.injured_person?.job_title || td.affected_person?.job_title || null,
      incident_datetime, area || null,
      descriptionForOsha300({ description, title, bodyParts: cleanedBodyParts }),
      osha.type === 'death' ? 1 : 0,
      osha.type === 'days_away' ? 1 : 0,
      osha.type === 'job_transfer' ? 1 : 0,
      osha.type === 'other_recordable' ? 1 : 0,
      injuryTypeForOsha300(type, type_data),
      0,
    );

    // Regulatory-record creation gets its own audit row so inspectors can see
    // "OSHA 300 entry opened for case #N" alongside the parent incident row.
    // Anonymous incidents still log user_id=null per the scrub above.
    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'osha_300_auto_entry',
      description: `opened OSHA 300 case #${caseNum} (CY ${year}) — ${osha.type}`,
      user_id: anonymous ? null : req.user.id,
      metadata: {
        osha_300_log_id: oshaResult.lastInsertRowid,
        site_id, calendar_year: year, case_number: caseNum,
        classification_type: osha.type,
      },
      ...auditCtx(req),
    });
  }

  // --- WI-07: OSHA 1904.39 severe-injury notifications ---
  // Auto-create osha_severe_notifications rows for any of the four
  // reportable categories (fatality / hospitalization / amputation /
  // loss_of_eye). Detection signals:
  //   - osha_date_of_death set → fatality
  //   - hospitalized = 1 → hospitalization
  //   - type_data.osha_severe.{amputation, loss_of_eye} === true → those
  // See services/osha_severe.js for the 1904.39(b) carve-outs.
  //
  // 1904.39 is a US OSH Act obligation. Gate on site.country = 'US' so a
  // UK / AU incident doesn't get a phantom OSHA deadline attached. (RIDDOR
  // and SafeWork NSW have their own paths.) The site row was already loaded
  // above into `site` (for the framework gate).
  if (site?.country === 'US') {
  try {
    const justCreatedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
    const aps = db.prepare(`
      SELECT * FROM affected_persons
      WHERE org_id = ? AND incident_id = ? AND deleted_at IS NULL
      ORDER BY is_primary DESC, id ASC
    `).all(orgId, incidentId);
    const primaryAp = aps.find(p => p.is_primary === 1) || aps[0] || null;
    const primaryInj = primaryAp
      ? db.prepare(`SELECT * FROM injuries WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`)
          .get(orgId, primaryAp.id)
      : null;
    const rowsBefore = db.prepare('SELECT id FROM osha_severe_notifications WHERE incident_id = ?')
      .all(incidentId).map(r => r.id);
    const allRows = syncSevereNotifications({
      orgId, incidentId, incident: justCreatedIncident,
      primaryAp, primaryInjury: primaryInj,
      userId: anonymous ? null : req.user.id,
    });
    for (const row of allRows) {
      if (rowsBefore.includes(row.id)) continue;
      writeActivity({
        org_id: orgId,
        entity_type: 'incident',
        entity_id: incidentId,
        action: 'osha_severe_opened',
        description: `opened OSHA 1904.39 ${row.category} notification — deadline ${row.deadline_at}`,
        user_id: anonymous ? null : req.user.id,
        metadata: {
          severe_notification_id: row.id,
          category: row.category,
          deadline_at: row.deadline_at,
        },
        ...auditCtx(req),
      });
    }
  } catch (severeErr) {
    // Non-fatal — the incident is created, just flag the classification miss.
    console.error('[WI-07] syncSevereNotifications failed for incident', incidentId, severeErr);
  }
  } // close `if (site?.country === 'US')`

  // --- WI-06: SafeWork NSW notifiable incidents ---
  // WHS Act 2011 (NSW) Part 3. Gated on site.country = 'AU' so US / UK
  // incidents don't get a phantom NSW notification. The classifier
  // returns null when the incident doesn't meet s.35/s.36/s.37 criteria.
  if (site?.country === 'AU') {
    try {
      const justCreatedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
      const aps = db.prepare(`
        SELECT * FROM affected_persons
        WHERE org_id = ? AND incident_id = ? AND deleted_at IS NULL
        ORDER BY is_primary DESC, id ASC
      `).all(orgId, incidentId);
      const primaryAp = aps.find(p => p.is_primary === 1) || aps[0] || null;
      const primaryInj = primaryAp
        ? db.prepare(`SELECT * FROM injuries WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`)
            .get(orgId, primaryAp.id)
        : null;
      const result = syncSafeworkNswNotification({
        orgId, incidentId, incident: justCreatedIncident,
        primaryAp, primaryInjury: primaryInj,
        userId: anonymous ? null : req.user.id,
      });
      if (result?.created) {
        writeActivity({
          org_id: orgId,
          entity_type: 'incident',
          entity_id: incidentId,
          action: 'safework_nsw_opened',
          description: `opened SafeWork NSW notification ${result.row.nsw_number} per WHS Act 2011 (NSW) Part 3`,
          user_id: anonymous ? null : req.user.id,
          metadata: {
            nsw_notification_id: result.row.id,
            nsw_number: result.row.nsw_number,
            is_fatality: result.row.is_fatality,
            is_serious_injury: result.row.is_serious_injury,
            is_dangerous_incident: result.row.is_dangerous_incident,
            excluded_mines_petroleum: result.row.excluded_mines_petroleum,
          },
          ...auditCtx(req),
        });
      }
    } catch (nswErr) {
      console.error('[WI-06] syncSafeworkNswNotification failed for incident', incidentId, nswErr);
    }
  }

  if (riddor.reportable) {
    const riddorNum = nextRiddorNumber();
    const deadline = calculateDeadline(incident_datetime, riddor.writtenDeadlineDays);

    const riddorResult = db.prepare(`
      INSERT INTO riddor_reports (riddor_number, org_id, site_id, incident_id, event_date, category, description, written_deadline, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(riddorNum, orgId, site_id, incidentId, incident_datetime, riddor.category, title, deadline);

    // Inspector-visible audit row tied to the parent incident's timeline.
    writeActivity({
      org_id: orgId,
      entity_type: 'incident',
      entity_id: incidentId,
      action: 'riddor_opened',
      description: `opened RIDDOR ${riddorNum} — ${riddor.category}${riddor.phoneRequired ? ' (phone required)' : ` (written by ${deadline?.slice(0, 10)})`}`,
      user_id: anonymous ? null : req.user.id,
      metadata: {
        riddor_report_id: riddorResult.lastInsertRowid,
        riddor_number: riddorNum,
        category: riddor.category,
        phone_required: !!riddor.phoneRequired,
        written_deadline: deadline,
      },
      ...auditCtx(req),
    });

    db.prepare(`
      INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline)
      VALUES (?, ?, ?, ?, ?, 'err', ?)
    `).run(
      orgId, riddor.phoneRequired ? 'riddor_immediate' : 'riddor_written',
      incidentId,
      riddor.phoneRequired ? 'RIDDOR — immediate phone report required' : 'RIDDOR — written report required',
      `${title} classified as ${riddor.category}. ${riddor.phoneRequired ? 'Phone HSE without delay.' : `Written report due by ${deadline?.slice(0, 10)}.`}`,
      deadline
    );
  }

  // --- Notifications ---
  notifyElevatedAtSite({
    orgId, siteId: site_id, type: 'incident_created', incidentId,
    title: `New incident reported — ${incidentNumber}`,
    body: `${title} (${type} · S${severity} · Track ${track})`,
    severity: severity <= 2 ? 'warn' : 'info',
    actionUrl: `/incidents/${incidentId}`,
  });

  if (severity <= 2) {
    notifyRole({
      orgId, role: 'ehs_manager', type: 'high_severity', incidentId,
      title: `High-severity incident — ${incidentNumber} (S${severity})`,
      body: `${title} requires immediate attention.`,
      severity: 'err',
      actionUrl: `/incidents/${incidentId}`,
    });
    notifyRole({
      orgId, role: 'admin', type: 'high_severity', incidentId,
      title: `High-severity incident — ${incidentNumber} (S${severity})`,
      body: `${title} requires immediate attention.`,
      severity: 'err',
      actionUrl: `/incidents/${incidentId}`,
    });
  }

  if (osha.recordable) {
    const oshaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    notifyRole({
      orgId, role: 'ehs_manager', type: 'osha_recordable', incidentId,
      title: `OSHA recordable — ${incidentNumber}`,
      body: `${title} classified as ${osha.type}. Ensure 300 log entry within 24 hours.`,
      severity: 'err',
      deadline: oshaDeadline,
      actionUrl: `/incidents/${incidentId}`,
    });
  }

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
  incident.type_data = JSON.parse(incident.type_data || '{}');
  incident.body_parts_affected = JSON.parse(incident.body_parts_affected || '[]');

  // Trending banner data (per locked decision #16): how many incidents
  // already happened at this asset (or site+area) in the last 90 days.
  // Counted EXCLUDING the just-inserted row so the value reads as "prior."
  incident.prior_incidents_count = priorIncidentsCount({
    orgId,
    assetId: resolvedAssetId,
    siteId: site_id,
    area,
    days: 90,
    excludeId: incidentId,
  });

  res.status(201).json(incident);
  } catch (err) { next(err); }
});

// Classify-preview: lets the wizard pre-fill the matrix selection with
// rule-based inference (likelihood × consequence + reasoning) BEFORE the
// user submits. Per locked decision #14 — auto-classification. Read-only.
router.post('/classify-preview', (req, res) => {
  const { type, type_data, body_parts_affected, asset_id, site_id, area } = req.body;
  const orgId = req.user.org_id;

  let assetSiteId = null;
  if (asset_id) {
    const a = db.prepare('SELECT site_id FROM assets WHERE id = ? AND org_id = ?').get(asset_id, orgId);
    if (a) assetSiteId = a.site_id;
  }

  const prior = priorIncidentsCount({
    orgId,
    assetId: asset_id || null,
    siteId: site_id || assetSiteId,
    area,
    days: 365, // for likelihood inference, 12-month window per locked spec
  });

  const inference = inferSeverityFrom({
    type,
    type_data,
    body_parts_affected: parseBodyParts(body_parts_affected),
    prior_incidents_count: prior,
  });

  // Recent count over the 90-day window for the wizard banner ("3 prior in 90 days")
  const recent = priorIncidentsCount({
    orgId,
    assetId: asset_id || null,
    siteId: site_id || assetSiteId,
    area,
    days: 90,
  });

  res.json({
    ...inference,
    prior_incidents_12mo: prior,
    prior_incidents_90d: recent,
  });
});

// =============================================================================
// Inline notes on the activity timeline (UX-B).
//
// Any authenticated user can post a free-text note against an incident.
// Workers can leave observations ("spoke with site mgr — no PPE was issued")
// alongside the system-generated events. Activity timeline GET already
// returns these — they just need an INSERT path.
// =============================================================================

router.post('/:id/note', (req, res) => {
  const incident = db.prepare('SELECT id, org_id, incident_number FROM incidents WHERE id = ? AND org_id = ?')
    .get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Note text is required' });
  if (text.length > 4000) return res.status(400).json({ error: 'Note is too long (max 4000 chars).' });

  const result = db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'note', ?, ?)
  `).run(incident.org_id, incident.id, text, req.user.id);

  // Return the row already joined with the user info so the FE can append
  // it to the timeline without re-fetching the whole incident.
  const row = db.prepare(`
    SELECT al.*, u.name as user_name, u.initials as user_initials
    FROM activity_log al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(row);
});

// =============================================================================
// Voice intake — pre-incident transcript → structured fields.
//
// The FE captures audio with the Web Speech API and posts the resulting text
// here. We never see audio. Anthropic extracts a typed JSON shape; the
// transcript text is hashed but not stored (privacy decision in the spec).
// The wizard then renders fields with an "✨ AI suggested" badge until the
// user confirms or edits each one.
//
// 503 (no API key) is a soft failure — the demo seed includes a fallback
// voice_extractions row so this beat is still demonstrable without a key.
// =============================================================================

router.post('/voice-extract', async (req, res, next) => {
  try {
    const { transcript } = req.body || {};
    const extractArgs = { transcript, orgId: req.user.org_id, userId: req.user.id };

    const useGemini = !!process.env.GEMINI_API_KEY;
    const result = useGemini
      ? await extractFromTranscriptGemini(extractArgs)
      : await extractFromTranscript(extractArgs);

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'system', NULL, 'voice_extracted', ?, ?, ?)
    `).run(
      req.user.org_id,
      `voice transcript extracted via ${useGemini ? 'Gemini' : 'Claude'} (${result.transcript_hash.slice(0, 8)}…)`,
      req.user.id,
      JSON.stringify({
        extraction_id: result.extraction_id,
        transcript_hash: result.transcript_hash,
        extracted_type: result.extracted_fields.type,
        missing_required: result.missing_required,
        engine: useGemini ? 'gemini' : 'claude',
      }),
    );

    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.status || err.name === 'APIError' || err.message?.includes('Connection error')) {
      return res.status(502).json({
        error: 'Voice extraction service is unavailable right now. You can fill the wizard manually.',
        upstream: err.message,
      });
    }
    next(err);
  }
});

router.post('/voice-report', audioUpload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No audio file uploaded.' });

    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);

    const extractArgs = { transcript, orgId: req.user.org_id, userId: req.user.id };
    const useGemini = !!process.env.GEMINI_API_KEY;
    const result = useGemini
      ? await extractFromTranscriptGemini(extractArgs)
      : await extractFromTranscript(extractArgs);

    result.transcript = transcript;

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'system', NULL, 'voice_extracted', ?, ?, ?)
    `).run(
      req.user.org_id,
      `voice audio transcribed + extracted via Gemini (${result.transcript_hash.slice(0, 8)}…)`,
      req.user.id,
      JSON.stringify({
        extraction_id: result.extraction_id,
        transcript_hash: result.transcript_hash,
        extracted_type: result.extracted_fields.type,
        missing_required: result.missing_required,
        engine: 'gemini-audio',
      }),
    );

    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.status === 429 || err.message?.includes('429') || err.message?.includes('quota')) {
      return res.status(429).json({ error: 'API quota exceeded. Please wait a moment and try again, or enable billing on your Gemini project.' });
    }
    if (err.message?.includes('GoogleGenerativeAI') || err.message?.includes('fetch failed')) {
      console.error('[voice-report] Gemini error:', err.message);
      return res.status(502).json({ error: 'Voice service unavailable. Try again later.' });
    }
    next(err);
  }
});

router.post('/video-report', videoUpload.single('video'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });

    const narrative = await analyzeVideo(req.file.buffer, req.file.mimetype);

    const extractArgs = { transcript: narrative, orgId: req.user.org_id, userId: req.user.id };
    const result = process.env.GEMINI_API_KEY
      ? await extractFromTranscriptGemini(extractArgs)
      : await extractFromTranscript(extractArgs);

    result.transcript = narrative;

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'system', NULL, 'voice_extracted', ?, ?, ?)
    `).run(
      req.user.org_id,
      `video analyzed + extracted via Gemini (${result.transcript_hash.slice(0, 8)}…)`,
      req.user.id,
      JSON.stringify({
        extraction_id: result.extraction_id,
        transcript_hash: result.transcript_hash,
        extracted_type: result.extracted_fields.type,
        missing_required: result.missing_required,
        engine: 'gemini-video',
      }),
    );

    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.status === 429 || err.message?.includes('429') || err.message?.includes('quota')) {
      return res.status(429).json({ error: 'API quota exceeded. Please wait a moment and try again.' });
    }
    if (err.message?.includes('GoogleGenerativeAI') || err.message?.includes('fetch failed')) {
      console.error('[video-report] Gemini error:', err.message);
      return res.status(502).json({ error: 'Video analysis service unavailable. Try again later.' });
    }
    next(err);
  }
});

router.post('/image-report', imageUpload.array('images', 5), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No images uploaded.' });

    const caption = req.body.caption || '';
    const narrative = await analyzeImages(req.files, caption);

    const extractArgs = { transcript: narrative, orgId: req.user.org_id, userId: req.user.id };
    const result = process.env.GEMINI_API_KEY
      ? await extractFromTranscriptGemini(extractArgs)
      : await extractFromTranscript(extractArgs);

    result.transcript = narrative;

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'system', NULL, 'voice_extracted', ?, ?, ?)
    `).run(
      req.user.org_id,
      `${req.files.length} image(s) analyzed + extracted via Gemini (${result.transcript_hash.slice(0, 8)}…)`,
      req.user.id,
      JSON.stringify({
        extraction_id: result.extraction_id,
        transcript_hash: result.transcript_hash,
        extracted_type: result.extracted_fields.type,
        missing_required: result.missing_required,
        engine: 'gemini-image',
        image_count: req.files.length,
      }),
    );

    res.json(result);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    if (err.status === 429 || err.message?.includes('429') || err.message?.includes('quota')) {
      return res.status(429).json({ error: 'API quota exceeded. Please wait a moment and try again.' });
    }
    if (err.message?.includes('GoogleGenerativeAI') || err.message?.includes('fetch failed')) {
      console.error('[image-report] Gemini error:', err.message);
      return res.status(502).json({ error: 'Image analysis service unavailable. Try again later.' });
    }
    next(err);
  }
});

// =============================================================================
// Stop-work endpoints (per locked decision #11)
//
// Submission is open to ANY authenticated user (Worker / EHS / Site Admin) —
// never deter someone from triggering. Anonymous flag honored. The created
// incident is locked: severity=1, track='A', is_imminent_danger=1,
// stop_work_status='active'. Down-routing blocked in PATCH/escalate guards.
//
// State endpoints (acknowledge / resolve / cancel) are elevated-only.
// =============================================================================

router.post('/stop-work', async (req, res, next) => {
  try {
    const { site_id, area, description, asset_id, is_anonymous } = req.body;

    if (!site_id || !area) {
      return res.status(400).json({ error: 'site_id and area are required' });
    }

    const orgId = req.user.org_id;
    const site = db.prepare('SELECT id, country FROM sites WHERE id = ? AND org_id = ?').get(site_id, orgId);
    if (!site) return res.status(404).json({ error: 'Site not found in your organization' });

    let resolvedAssetId = null;
    if (asset_id) {
      const a = db.prepare('SELECT id, site_id FROM assets WHERE id = ? AND org_id = ? AND active = 1').get(asset_id, orgId);
      if (!a) return res.status(404).json({ error: 'Asset not found in your organization' });
      if (a.site_id !== Number(site_id)) {
        return res.status(400).json({ error: 'Asset does not belong to the chosen site' });
      }
      resolvedAssetId = a.id;
    }

    const anonymous = !!is_anonymous;
    const reportedBy = anonymous ? null : req.user.id;
    const incidentNumber = nextIncidentNumber();
    const nowIso = new Date().toISOString();
    const title = `STOP WORK — ${area}`;

    const result = db.prepare(`
      INSERT INTO incidents (
        incident_number, org_id, site_id, title, type, description, incident_datetime,
        area, asset_id,
        severity, likelihood, consequence, track,
        status, reported_by, is_anonymous, is_imminent_danger, stop_work_status,
        body_parts_affected
      ) VALUES (?, ?, ?, ?, 'unsafe', ?, ?, ?, ?, 1, 0, 4, 'A', 'New', ?, ?, 1, 'active', '[]')
    `).run(
      incidentNumber, orgId, site_id, title,
      description || 'Stop-work submitted — details to follow',
      nowIso, area, resolvedAssetId,
      reportedBy, anonymous ? 1 : 0,
    );
    const incidentId = result.lastInsertRowid;

    // Activity log — scrubbed if anonymous
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
      VALUES (?, 'incident', ?, 'stop_work_submitted', ?, ?)
    `).run(
      orgId, incidentId,
      anonymous
        ? `STOP-WORK ${incidentNumber} submitted anonymously at ${area}`
        : `STOP-WORK ${incidentNumber} submitted at ${area}`,
      anonymous ? null : req.user.id,
    );

    // Notify all elevated users at the site (recipients computed at fire time
    // per locked decision #9 — role × scope, not stored configuration).
    const recipients = db.prepare(`
      SELECT id FROM users
      WHERE org_id = ? AND is_active = 1
        AND role IN ('supervisor', 'ehs_officer', 'ehs_manager', 'admin')
        AND (site_id = ? OR site_id IS NULL OR role = 'admin')
    `).all(orgId, site_id);
    const insertNotif = db.prepare(`
      INSERT INTO notifications (org_id, user_id, type, incident_id, title, body, severity)
      VALUES (?, ?, 'stop_work_active', ?, ?, ?, 'err')
    `);
    for (const r of recipients) {
      insertNotif.run(
        orgId, r.id, incidentId,
        `STOP WORK at ${site.id ? area : ''} — immediate response required`,
        `${incidentNumber}: ${description || 'No details provided'}`,
      );
    }

    const incident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
    incident.type_data = JSON.parse(incident.type_data || '{}');
    incident.body_parts_affected = JSON.parse(incident.body_parts_affected || '[]');
    res.status(201).json(incident);
  } catch (err) { next(err); }
});

// Acknowledge — elevated only
router.post('/:id/stop-work-acknowledge', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot acknowledge stop-work.' });
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!incident.is_imminent_danger) return res.status(400).json({ error: 'Not a stop-work incident' });
  if (incident.stop_work_status !== 'active') {
    return res.status(409).json({ error: `Cannot acknowledge — current state is "${incident.stop_work_status}"` });
  }

  db.prepare(`
    UPDATE incidents SET stop_work_status = 'acknowledged', updated_at = datetime('now')
    WHERE id = ?
  `).run(incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'stop_work_acknowledged', ?, ?)
  `).run(incident.org_id, incident.id, `acknowledged stop-work ${incident.incident_number}`, req.user.id);

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  res.json(updated);
});

// Resolve — elevated only, requires reason + remediation
router.post('/:id/stop-work-resolve', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot resolve stop-work.' });
  const { reason, remediation } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required' });

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!incident.is_imminent_danger) return res.status(400).json({ error: 'Not a stop-work incident' });
  if (incident.stop_work_status !== 'active' && incident.stop_work_status !== 'acknowledged') {
    return res.status(409).json({ error: `Cannot resolve — current state is "${incident.stop_work_status}"` });
  }

  const remediationLine = remediation && remediation.trim() ? `\n\nRemediation: ${remediation.trim()}` : '';
  const closeNotes = `${reason.trim()}${remediationLine}`;

  db.prepare(`
    UPDATE incidents
    SET stop_work_status = 'resolved',
        closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(`stop-work resolved: ${reason.trim()}`, closeNotes, req.user.id, incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'stop_work_resolved', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `resolved stop-work ${incident.incident_number} — ${reason.trim()}`,
    req.user.id,
    JSON.stringify({ reason: reason.trim(), remediation: remediation?.trim() || null }),
  );

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  res.json(updated);
});

// Cancel — Site Admin only (false-alarm path), requires reason
router.post('/:id/stop-work-cancel', (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only a Site Admin can cancel a stop-work (false-alarm path).' });
  }
  const { reason } = req.body;
  if (!reason || !reason.trim() || reason.trim().length < 20) {
    return res.status(400).json({ error: 'reason is required and must be at least 20 characters' });
  }

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!incident.is_imminent_danger) return res.status(400).json({ error: 'Not a stop-work incident' });
  if (incident.stop_work_status === 'resolved' || incident.stop_work_status === 'cancelled') {
    return res.status(409).json({ error: `Cannot cancel — current state is "${incident.stop_work_status}"` });
  }

  db.prepare(`
    UPDATE incidents
    SET stop_work_status = 'cancelled',
        closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(`stop-work cancelled (false alarm): ${reason.trim()}`, reason.trim(), req.user.id, incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'stop_work_cancelled', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `cancelled stop-work ${incident.incident_number} (false alarm) — ${reason.trim()}`,
    req.user.id,
    JSON.stringify({ reason: reason.trim() }),
  );

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  res.json(updated);
});

// =============================================================================
// EHS recordability verification (per locked decision #1, hybrid path)
//
// Reporter form provides a fast `osha_recordable` guess at submission time.
// This endpoint runs the full 5-gate decision tree and stamps the verifying
// EHS Manager + timestamp on the incident. Elevated roles only. The verifier
// can either confirm or override the original guess; both are stored on the
// incident plus a structured activity_log entry with the gate trail.
// =============================================================================

// Direct CAPA creation from an incident (pre-investigation path). Sets
// source_type='incident' and skips the investigation step. Elevated only.
router.post('/:id/create-capa', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create CAPAs.' });
  }
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  try {
    const capaId = createCapaRow({
      orgId: req.user.org_id,
      sourceType: 'incident',
      investigationId: null,
      incidentId: incident.id,
      body: req.body,
      userId: req.user.id,
    });
    const capa = db.prepare(`
      SELECT c.*, src_inc.incident_number as incident_number
      FROM capas c
      LEFT JOIN incidents src_inc ON src_inc.id = c.incident_id
      WHERE c.id = ?
    `).get(capaId);
    res.status(201).json(capa);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    throw err;
  }
});

// OSHA 1904 recordability is a specialist EHS judgment (the 1904.5(b)(2)
// exception list + 1904.7(b)(5)(ii) first-aid list aren't intuitive), so this
// route is tighter than the general isElevated gate — supervisors observe and
// can request overrides, but only EHS owns the decision.
const RECORDABILITY_VERIFY_ROLES = new Set(['ehs_officer', 'ehs_manager', 'admin']);

router.post('/:id/recordability-verify', (req, res) => {
  if (!RECORDABILITY_VERIFY_ROLES.has(req.user?.role)) {
    return res.status(403).json({ error: 'Only EHS officers, EHS managers, or admins can verify OSHA recordability.' });
  }

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  if (incident.type !== 'injury' && incident.type !== 'illness') {
    return res.status(400).json({ error: 'Recordability verification only applies to injury or illness incidents.' });
  }

  const decision = verifyOshaRecordability(req.body || {});

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE incidents
    SET osha_recordable = ?,
        osha_recordability_type = ?,
        osha_recordable_verified_by = ?,
        osha_recordable_verified_at = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    decision.recordable ? 1 : 0,
    decision.type,
    req.user.id,
    nowIso,
    incident.id,
  );

  const summary = decision.recordable
    ? `verified OSHA recordable as ${decision.type}`
    : `verified NOT OSHA recordable${decision.failed_gate ? ` (gate: ${decision.failed_gate})` : ''}`;

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'recordability_verified', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `${summary} for ${incident.incident_number}`,
    req.user.id,
    JSON.stringify({
      recordable: decision.recordable,
      type: decision.type,
      reasoning: decision.reasoning,
      failed_gate: decision.failed_gate,
      gates: req.body || {},
    }),
  );

  // 300 Log row management: if newly recordable and no row yet, insert one;
  // if previously recordable but now not, the existing row is left in place
  // (reverts handled by EHS via the OSHA log UI — out of scope for verify).
  if (decision.recordable) {
    const existing = db.prepare('SELECT id FROM osha_300_log WHERE incident_id = ?').get(incident.id);
    if (!existing) {
      const year = new Date(incident.incident_datetime).getFullYear();
      const maxCase = db.prepare('SELECT MAX(case_number) as m FROM osha_300_log WHERE site_id = ? AND calendar_year = ?').get(incident.site_id, year);
      const caseNum = (maxCase?.m || 0) + 1;
      const td = JSON.parse(incident.type_data || '{}');

      const verifyBodyParts = JSON.parse(incident.body_parts_affected || '[]');
      db.prepare(`
        INSERT INTO osha_300_log (
          org_id, site_id, incident_id, calendar_year, case_number,
          employee_name, job_title, injury_date, location, description,
          classification_death, classification_days_away, classification_job_transfer, classification_other,
          injury_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        incident.org_id, incident.site_id, incident.id, year, caseNum,
        td.injured_person?.name || td.affected_person?.name || 'Unknown',
        td.injured_person?.job_title || td.affected_person?.job_title || null,
        incident.incident_datetime, incident.area || null,
        descriptionForOsha300({ description: incident.description, title: incident.title, bodyParts: verifyBodyParts }),
        decision.type === 'death' ? 1 : 0,
        decision.type === 'days_away' ? 1 : 0,
        decision.type === 'job_transfer' ? 1 : 0,
        decision.type === 'other_recordable' ? 1 : 0,
        injuryTypeForOsha300(incident.type, td),
      );
    }
  }

  const updated = db.prepare(`
    SELECT i.*, vu.name as verified_by_name, vu.initials as verified_by_initials
    FROM incidents i
    LEFT JOIN users vu ON vu.id = i.osha_recordable_verified_by
    WHERE i.id = ?
  `).get(incident.id);

  res.json({
    incident: updated,
    decision,
  });
});

router.patch('/:id', (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  // Stop-work down-route guard (locked decision #11):
  // If is_imminent_danger=1, severity must stay at S1 and track must stay 'A'.
  // No exception — not even Site Admin can downgrade a stop-work.
  if (incident.is_imminent_danger) {
    const newSeverity = req.body.severity !== undefined ? Number(req.body.severity) : null;
    const newTrack = req.body.track !== undefined ? req.body.track : null;
    if (newSeverity !== null && newSeverity > 1) {
      return res.status(409).json({
        error: 'Stop-work incidents cannot be down-routed. Severity is locked at S1.',
      });
    }
    if (newTrack !== null && newTrack !== 'A') {
      return res.status(409).json({
        error: 'Stop-work incidents cannot be down-routed. Track is locked at A.',
      });
    }
  }

  const updatable = ['title', 'description', 'severity', 'track', 'status', 'assigned_to', 'triage_due', 'triage_notes',
    'osha_recordable', 'osha_recordability_type', 'osha_days_away', 'osha_days_restricted',
    'osha_privacy_case', 'osha_work_related', 'er_treated', 'hospitalized', 'hospitalization_date',
    'osha_date_of_death',
    'riddor_reportable', 'immediate_actions_taken', 'area', 'specific_location', 'department'];

  const requestedRestricted = updatable.filter(k => RESTRICTED_FIELDS.has(k) && req.body[k] !== undefined);
  if (requestedRestricted.length > 0 && !isElevated(req.user)) {
    return res.status(403).json({
      error: 'Worker role cannot modify severity, track, status, assignment, or regulatory fields.',
      restricted_fields: requestedRestricted,
    });
  }

  // WI-B: warn (but do not block) when osha_recordable / riddor_reportable
  // are flipped via the direct PATCH path. The override-request workflow
  // is the preferred separation-of-duties route. Leaving the direct path
  // working lets us measure usage before forbidding it in a follow-up WI
  // (per docs/plan-2026-05-11.md Part 2 — "Existing direct-edit path:
  // keep working for now, but emit a console.warn server-side").
  const recordabilityFlips = ['osha_recordable', 'riddor_reportable']
    .filter(k => req.body[k] !== undefined && Number(req.body[k]) !== Number(incident[k]));
  if (recordabilityFlips.length > 0) {
    console.warn(
      `[WI-B] Direct PATCH on ${recordabilityFlips.join(', ')} for incident ${incident.incident_number ?? incident.id} ` +
      `by user ${req.user.id} (${req.user.email}) — bypasses override-request workflow.`,
    );
  }

  const sets = [];
  const params = [];
  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      sets.push(`${key} = ?`);
      params.push(req.body[key]);
    }
  }
  if (req.body.type_data !== undefined) {
    liftFlatInjuredKeys(req.body.type_data);
    sets.push('type_data = ?');
    params.push(JSON.stringify(req.body.type_data));
  }
  // body_parts_affected: pass through parseBodyParts to drop unknown IDs.
  // Note: is_anonymous is intentionally NOT in the updatable list — once a
  // report is anonymous, it stays anonymous (per locked decision #10).
  if (req.body.body_parts_affected !== undefined) {
    sets.push('body_parts_affected = ?');
    params.push(JSON.stringify(parseBodyParts(req.body.body_parts_affected)));
  }

  // Severity override: capture audit trail, recompute track if not explicitly set.
  const severityChanged = req.body.severity !== undefined && Number(req.body.severity) !== incident.severity;
  if (severityChanged) {
    const newSeverity = Number(req.body.severity);
    const reason = req.body.severity_override_reason || req.body.reason || 'No reason provided';
    sets.push('severity_override = ?', 'severity_override_by = ?', 'severity_override_reason = ?');
    params.push(incident.severity, req.user.id, reason);
    if (req.body.track === undefined) {
      const recomputedTrack = trackForSeverity(newSeverity);
      sets.push('track = ?');
      params.push(recomputedTrack);
    }
  }

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  sets.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE incidents SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  // WI-A dual-write on PATCH: keep the primary affected_person + primary
  // injury in sync with whatever was touched. Multi-person edits go
  // through /incidents/:id/affected-persons/... — this hook only handles
  // the legacy single-person shape per the WI-A spec.
  //
  // Three sync paths:
  //  1) type_data.injured_person was PATCHed → patch primary AP's
  //     identity fields (name, dob, gender, job_title, etc.).
  //  2) osha_privacy_case was PATCHed → flip primary AP's is_privacy_case.
  //  3) er_treated/hospitalized/hospitalization_date/osha_days_*/
  //     description were PATCHed → patch the primary injury.
  // Each path no-ops cleanly when there's no primary AP (e.g. nearmiss
  // incident, or legacy incident that never had injured_person data).
  syncAffectedPersonsOnPatch({
    incident,
    body: req.body,
    req,
    userId: req.user.id,
  });

  // WI-07: re-run severe-injury classification when a triggering field
  // changed (osha_date_of_death / hospitalized / type_data.osha_severe.*).
  // Per 1904.39(b)(7) the 8-h/24-h clock starts when the employer learns,
  // and on this code path we treat the PATCH as the learning event. The
  // hook is idempotent (UNIQUE(incident_id, category)) so re-running on
  // unrelated PATCHes is harmless. Gated on US sites per the POST hook.
  const wi07Triggered = (
    req.body.osha_date_of_death !== undefined ||
    req.body.hospitalized !== undefined ||
    (req.body.type_data && req.body.type_data.osha_severe !== undefined)
  );
  if (wi07Triggered) {
    const patchedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
    const patchedSite = db.prepare('SELECT country FROM sites WHERE id = ?').get(patchedIncident.site_id);
    if (patchedSite?.country === 'US') {
      try {
        const aps = db.prepare(`
          SELECT * FROM affected_persons
          WHERE org_id = ? AND incident_id = ? AND deleted_at IS NULL
          ORDER BY is_primary DESC, id ASC
        `).all(incident.org_id, incident.id);
        const primaryAp = aps.find(p => p.is_primary === 1) || aps[0] || null;
        const primaryInj = primaryAp
          ? db.prepare(`SELECT * FROM injuries WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`)
              .get(incident.org_id, primaryAp.id)
          : null;
        const rowsBefore = db.prepare('SELECT id FROM osha_severe_notifications WHERE incident_id = ?')
          .all(incident.id).map(r => r.id);
        const allRows = syncSevereNotifications({
          orgId: incident.org_id, incidentId: incident.id,
          incident: patchedIncident, primaryAp, primaryInjury: primaryInj,
          userId: req.user.id,
        });
        for (const row of allRows) {
          if (rowsBefore.includes(row.id)) continue;
          writeActivity({
            org_id: incident.org_id,
            entity_type: 'incident',
            entity_id: incident.id,
            action: 'osha_severe_opened',
            description: `opened OSHA 1904.39 ${row.category} notification (on PATCH) — deadline ${row.deadline_at}`,
            user_id: req.user.id,
            metadata: {
              severe_notification_id: row.id,
              category: row.category,
              deadline_at: row.deadline_at,
              triggered_by: 'patch',
            },
            ...auditCtx(req),
          });
        }
      } catch (severeErr) {
        console.error('[WI-07] syncSevereNotifications on PATCH failed for incident', incident.id, severeErr);
      }
    }
  }

  // WI-06: re-run SafeWork NSW classification on PATCH for the same
  // trigger fields (osha_date_of_death = death; hospitalized = s.36(a);
  // type_data.safework_nsw.* updates the sub-categories or mines flag).
  // Gated on site.country='AU'. syncSafeworkNswNotification is
  // idempotent (UNIQUE(incident_id)).
  const wi06Triggered = (
    req.body.osha_date_of_death !== undefined ||
    req.body.hospitalized !== undefined ||
    (req.body.type_data && (
      req.body.type_data.safework_nsw !== undefined ||
      Object.prototype.hasOwnProperty.call(req.body.type_data, 'safework_nsw')
    ))
  );
  if (wi06Triggered) {
    const patchedIncident = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
    const patchedSite = db.prepare('SELECT country FROM sites WHERE id = ?').get(patchedIncident.site_id);
    if (patchedSite?.country === 'AU') {
      try {
        const aps = db.prepare(`
          SELECT * FROM affected_persons
          WHERE org_id = ? AND incident_id = ? AND deleted_at IS NULL
          ORDER BY is_primary DESC, id ASC
        `).all(incident.org_id, incident.id);
        const primaryAp = aps.find(p => p.is_primary === 1) || aps[0] || null;
        const primaryInj = primaryAp
          ? db.prepare(`SELECT * FROM injuries WHERE org_id = ? AND affected_person_id = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1`)
              .get(incident.org_id, primaryAp.id)
          : null;
        const result = syncSafeworkNswNotification({
          orgId: incident.org_id, incidentId: incident.id,
          incident: patchedIncident, primaryAp, primaryInjury: primaryInj,
          userId: req.user.id,
        });
        if (result?.created) {
          writeActivity({
            org_id: incident.org_id,
            entity_type: 'incident',
            entity_id: incident.id,
            action: 'safework_nsw_opened',
            description: `opened SafeWork NSW notification ${result.row.nsw_number} on PATCH per WHS Act 2011 (NSW) Part 3`,
            user_id: req.user.id,
            metadata: {
              nsw_notification_id: result.row.id,
              nsw_number: result.row.nsw_number,
              is_fatality: result.row.is_fatality,
              is_serious_injury: result.row.is_serious_injury,
              is_dangerous_incident: result.row.is_dangerous_incident,
              excluded_mines_petroleum: result.row.excluded_mines_petroleum,
              triggered_by: 'patch',
            },
            ...auditCtx(req),
          });
        }
      } catch (nswErr) {
        console.error('[WI-06] syncSafeworkNswNotification on PATCH failed for incident', incident.id, nswErr);
      }
    }
  }

  if (severityChanged) {
    const newSeverity = Number(req.body.severity);
    const reason = req.body.severity_override_reason || req.body.reason || 'No reason provided';
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'incident', ?, 'severity_overridden', ?, ?, ?)
    `).run(
      incident.org_id, incident.id,
      `severity changed Sev ${incident.severity} -> Sev ${newSeverity} - ${reason}`,
      req.user.id,
      JSON.stringify({ from: incident.severity, to: newSeverity, reason }),
    );
  }

  // UX-C: log non-restricted field edits so OSHA 1904.33 amendment chain
  // of custody is captured. Severity is logged separately above.
  const auditedFields = ['title', 'description', 'area', 'specific_location', 'department', 'immediate_actions_taken'];
  const fieldChanges = {};
  for (const f of auditedFields) {
    if (req.body[f] !== undefined && req.body[f] !== incident[f]) {
      fieldChanges[f] = { from: incident[f] || null, to: req.body[f] };
    }
  }
  if (Object.keys(fieldChanges).length > 0) {
    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'incident', ?, 'incident_updated', ?, ?, ?)
    `).run(
      incident.org_id, incident.id,
      `updated ${Object.keys(fieldChanges).join(', ')}`,
      req.user.id,
      JSON.stringify(fieldChanges),
    );
  }

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(req.params.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

// ---------------------------------------------------------------------------
// Witnesses CRUD (UX-D) — post-creation add/edit/remove.
//
// Reporters add witnesses at submission via the POST /incidents witnesses[]
// payload, but witnesses often surface late (a colleague mentions someone
// saw it the next day). All three handlers gate to elevated for parity with
// the rest of the incident-mutation surface and write activity_log rows so
// the chain of custody on the witness list is auditable.
// ---------------------------------------------------------------------------
router.post('/:id/witnesses', (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!requireAssigneeOrElevated(req, res, incident, 'assigned_to', 'this incident')) return;
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Witness name is required.' });
  const contact = (req.body.contact || '').trim() || null;
  const statement = (req.body.statement || '').trim() || null;
  const result = db.prepare('INSERT INTO witnesses (incident_id, name, contact, statement) VALUES (?, ?, ?, ?)').run(
    incident.id, name, contact, statement,
  );
  const witness = db.prepare('SELECT * FROM witnesses WHERE id = ?').get(result.lastInsertRowid);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'witness_added', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `added witness ${witness.name}`,
    req.user.id,
    JSON.stringify({ id: witness.id, name: witness.name, contact: witness.contact, statement: witness.statement }),
  );
  res.status(201).json(witness);
});

router.patch('/:id/witnesses/:wid', (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!requireAssigneeOrElevated(req, res, incident, 'assigned_to', 'this incident')) return;
  const witness = db.prepare('SELECT * FROM witnesses WHERE id = ? AND incident_id = ?').get(req.params.wid, incident.id);
  if (!witness) return res.status(404).json({ error: 'Witness not found' });

  const fields = ['name', 'contact', 'statement'];
  const sets = [];
  const params = [];
  const changes = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) {
      const raw = typeof req.body[f] === 'string' ? req.body[f].trim() : req.body[f];
      const newVal = raw === '' ? null : raw;
      if (newVal !== witness[f]) {
        sets.push(`${f} = ?`);
        params.push(newVal);
        changes[f] = { from: witness[f] || null, to: newVal };
      }
    }
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No changes to apply' });
  if ('name' in changes && (!changes.name.to || !String(changes.name.to).trim())) {
    return res.status(400).json({ error: 'Witness name cannot be empty.' });
  }
  params.push(witness.id);
  db.prepare(`UPDATE witnesses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM witnesses WHERE id = ?').get(witness.id);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'witness_updated', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `updated witness ${updated.name}`,
    req.user.id,
    JSON.stringify({ id: updated.id, name: updated.name, changes }),
  );
  res.json(updated);
});

router.delete('/:id/witnesses/:wid', (req, res) => {
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!requireAssigneeOrElevated(req, res, incident, 'assigned_to', 'this incident')) return;
  const witness = db.prepare('SELECT * FROM witnesses WHERE id = ? AND incident_id = ?').get(req.params.wid, incident.id);
  if (!witness) return res.status(404).json({ error: 'Witness not found' });
  db.prepare('DELETE FROM witnesses WHERE id = ?').run(witness.id);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, 'incident', ?, 'witness_removed', ?, ?, ?)
  `).run(
    incident.org_id, incident.id,
    `removed witness ${witness.name}`,
    req.user.id,
    JSON.stringify({ id: witness.id, name: witness.name, contact: witness.contact, statement: witness.statement }),
  );
  res.status(204).send();
});

router.post('/:id/assign', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot assign incidents.' });
  const { assigned_to, triage_due, notes } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  db.prepare(`
    UPDATE incidents SET status = 'Triage', assigned_to = ?, triage_due = ?, triage_notes = ?, updated_at = datetime('now') WHERE id = ?
  `).run(assigned_to, triage_due || null, notes || null, incident.id);

  const assignee = db.prepare('SELECT name, initials FROM users WHERE id = ?').get(assigned_to);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'assigned', ?, ?)
  `).run(incident.org_id, incident.id, `assigned ${assignee?.initials || '?'} as triage owner · due ${triage_due || 'TBD'}`, req.user.id);

  notifyUser({
    orgId: incident.org_id, userId: assigned_to, type: 'incident_assigned', incidentId: incident.id,
    title: `You've been assigned ${incident.incident_number}`,
    body: `${incident.title} — triage due ${triage_due || 'TBD'}`,
    severity: 'warn',
    actionUrl: `/incidents/${incident.id}`,
  });

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

router.post('/:id/escalate', (req, res) => {
  const { lead_investigator, track, notes } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!requireAssigneeOrElevated(req, res, incident, 'assigned_to', 'this incident')) return;

  const invNumber = nextInvestigationNumber();

  const invResult = db.prepare(`
    INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, track, status)
    VALUES (?, ?, ?, ?, ?, 'pending')
  `).run(invNumber, incident.id, incident.org_id, lead_investigator || null, track || incident.track);

  db.prepare(`
    UPDATE incidents SET status = 'Investigating', track = ?, assigned_to = ?, updated_at = datetime('now') WHERE id = ?
  `).run(track || incident.track, lead_investigator || incident.assigned_to, incident.id);

  if (lead_investigator) {
    db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)')
      .run(invResult.lastInsertRowid, lead_investigator, 'lead');
  }

  const lead = db.prepare('SELECT name, initials FROM users WHERE id = ?').get(lead_investigator);
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'escalated', ?, ?)
  `).run(incident.org_id, incident.id, `escalated to investigation ${invNumber} · Track ${track || incident.track} · lead ${lead?.initials || '?'}`, req.user.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'investigation', ?, 'created', ?, ?)
  `).run(incident.org_id, invResult.lastInsertRowid, `created from ${incident.incident_number}`, req.user.id);

  if (lead_investigator) {
    notifyUser({
      orgId: incident.org_id, userId: lead_investigator, type: 'incident_escalated', incidentId: incident.id,
      title: `Investigation assigned — ${invNumber}`,
      body: `${incident.title} escalated to Track ${track || incident.track}. You are lead investigator.`,
      severity: 'warn',
      actionUrl: `/investigations/${invResult.lastInsertRowid}`,
    });
  }

  const investigation = db.prepare('SELECT * FROM investigations WHERE id = ?').get(invResult.lastInsertRowid);
  res.status(201).json({ incident_id: incident.id, investigation });
});

// --- Closure checklist: returns gate evaluation for the UI ---
router.get('/:id/closure-checklist', (req, res) => {
  const incident = db.prepare('SELECT id FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const gates = evaluateClosureGates(incident.id, req.user.org_id);
  res.json(gates);
});

// --- Close: tiered by track ---
router.post('/:id/close', (req, res) => {
  const { reason, notes, force } = req.body;
  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (!requireAssigneeOrElevated(req, res, incident, 'assigned_to', 'this incident')) return;
  if (incident.status === 'Closed') return res.status(409).json({ error: 'Incident is already closed.' });

  const gates = evaluateClosureGates(incident.id, req.user.org_id);

  // Force-close: admin only, bypasses all gates
  if (force === true) {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only admin can force-close.' });

    db.prepare(`
      UPDATE incidents SET status = 'Closed', closure_type = 'force_closed', closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?, updated_at = datetime('now') WHERE id = ?
    `).run(reason || 'Force-closed by admin', notes || null, req.user.id, incident.id);

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, 'incident', ?, 'force_closed', ?, ?, ?)
    `).run(incident.org_id, incident.id, `FORCE-CLOSED ${incident.incident_number} — ${reason || 'no reason'}`, req.user.id, JSON.stringify({ skipped_gates: gates }));

    notifyElevatedAtSite({
      orgId: incident.org_id, siteId: incident.site_id, type: 'force_closed', incidentId: incident.id,
      title: `Incident force-closed — ${incident.incident_number}`,
      body: `${reason || 'No reason provided'}. All closure gates bypassed by admin.`,
      severity: 'err',
      actionUrl: `/incidents/${incident.id}`,
    });

    if (incident.reported_by) {
      notifyUser({
        orgId: incident.org_id, userId: incident.reported_by, type: 'incident_closed', incidentId: incident.id,
        title: `Your incident ${incident.incident_number} has been closed`,
        body: reason || 'Closed by management.',
        severity: 'info', actionUrl: `/incidents/${incident.id}`,
      });
    }

    const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
    updated.type_data = JSON.parse(updated.type_data || '{}');
    return res.json(updated);
  }

  // Track C: minimal gates
  if (gates.track === 'C') {
    if (!reason) return res.status(400).json({ error: 'Closure reason required.' });

    db.prepare(`
      UPDATE incidents SET status = 'Closed', closure_type = 'standard', closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?, updated_at = datetime('now') WHERE id = ?
    `).run(reason, notes || null, req.user.id, incident.id);

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
      VALUES (?, 'incident', ?, 'closed', ?, ?)
    `).run(incident.org_id, incident.id, `closed ${incident.incident_number} — ${reason}`, req.user.id);

    if (incident.reported_by) {
      notifyUser({
        orgId: incident.org_id, userId: incident.reported_by, type: 'incident_closed', incidentId: incident.id,
        title: `Your incident ${incident.incident_number} has been closed`,
        body: reason, severity: 'info', actionUrl: `/incidents/${incident.id}`,
      });
    }

    const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
    updated.type_data = JSON.parse(updated.type_data || '{}');
    return res.json(updated);
  }

  // Track B: CAPA + investigation gates
  if (gates.track === 'B') {
    if (!reason) return res.status(400).json({ error: 'Closure reason required.' });
    if (!gates.gates.capasComplete.passed) return res.status(409).json({ error: 'Cannot close: open CAPAs remain.', blockers: gates });
    if (!gates.gates.investigationClosed.passed) return res.status(409).json({ error: 'Cannot close: investigation not yet closed.', blockers: gates });

    db.prepare(`
      UPDATE incidents SET status = 'Closed', closure_type = 'standard', closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?, updated_at = datetime('now') WHERE id = ?
    `).run(reason, notes || null, req.user.id, incident.id);

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
      VALUES (?, 'incident', ?, 'closed', ?, ?)
    `).run(incident.org_id, incident.id, `closed ${incident.incident_number} — ${reason}`, req.user.id);

    if (incident.reported_by) {
      notifyUser({
        orgId: incident.org_id, userId: incident.reported_by, type: 'incident_closed', incidentId: incident.id,
        title: `Your incident ${incident.incident_number} has been closed`,
        body: reason, severity: 'info', actionUrl: `/incidents/${incident.id}`,
      });
    }

    const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
    updated.type_data = JSON.parse(updated.type_data || '{}');
    return res.json(updated);
  }

  // Track A: requires closure request + manager approval
  return res.status(409).json({
    error: 'Track A incidents require a closure request and manager approval.',
    blockers: gates,
  });
});

// --- Closure request: Track A approval flow ---
router.post('/:id/closure-request', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Insufficient permissions.' });
  const { closure_summary, lessons_learned } = req.body;
  if (!closure_summary) return res.status(400).json({ error: 'Closure summary is required.' });
  if (!lessons_learned) return res.status(400).json({ error: 'Lessons learned are required for Track A closure.' });

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (incident.status === 'Closed') return res.status(409).json({ error: 'Incident is already closed.' });

  const existing = db.prepare("SELECT id FROM closure_requests WHERE incident_id = ? AND status = 'pending'").get(incident.id);
  if (existing) return res.status(409).json({ error: 'A closure request is already pending.' });

  const gates = evaluateClosureGates(incident.id, req.user.org_id);
  if (!gates.gates.capasComplete.passed) return res.status(409).json({ error: 'Cannot request closure: open CAPAs remain.', blockers: gates });
  if (!gates.gates.investigationClosed.passed) return res.status(409).json({ error: 'Cannot request closure: investigation not yet closed.', blockers: gates });
  if (!gates.gates.rootCauseDocumented.passed) return res.status(409).json({ error: 'Cannot request closure: root cause not documented.', blockers: gates });
  if (gates.gates.osha300Entry.required && !gates.gates.osha300Entry.passed) return res.status(409).json({ error: 'Cannot request closure: OSHA 300 log entry missing.', blockers: gates });
  if (gates.gates.riddorFiled.required && !gates.gates.riddorFiled.passed) return res.status(409).json({ error: 'Cannot request closure: RIDDOR report not filed.', blockers: gates });

  const result = db.prepare(`
    INSERT INTO closure_requests (incident_id, org_id, requested_by, closure_summary, lessons_learned, gate_snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(incident.id, req.user.org_id, req.user.id, closure_summary, lessons_learned, JSON.stringify(gates));

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'closure_requested', ?, ?)
  `).run(incident.org_id, incident.id, `closure requested for ${incident.incident_number}`, req.user.id);

  notifyRole({ orgId: incident.org_id, role: 'ehs_manager', type: 'closure_requested', incidentId: incident.id,
    title: `Closure approval needed — ${incident.incident_number}`, body: closure_summary, severity: 'warn', actionUrl: `/incidents/${incident.id}` });
  notifyRole({ orgId: incident.org_id, role: 'admin', type: 'closure_requested', incidentId: incident.id,
    title: `Closure approval needed — ${incident.incident_number}`, body: closure_summary, severity: 'warn', actionUrl: `/incidents/${incident.id}` });

  const row = db.prepare('SELECT * FROM closure_requests WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// --- Approve closure request ---
router.post('/:id/closure-request/:requestId/approve', (req, res) => {
  if (!['ehs_manager', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only EHS managers or admins can approve closure.' });

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const cr = db.prepare("SELECT * FROM closure_requests WHERE id = ? AND incident_id = ? AND status = 'pending'").get(req.params.requestId, incident.id);
  if (!cr) return res.status(404).json({ error: 'Pending closure request not found.' });
  if (cr.requested_by === req.user.id) return res.status(403).json({ error: 'Cannot self-approve a closure request.' });

  // Re-validate gates at approval time
  const gates = evaluateClosureGates(incident.id, req.user.org_id);
  const prereqs = gates.gates;
  if (!prereqs.capasComplete.passed || !prereqs.investigationClosed.passed || !prereqs.rootCauseDocumented.passed) {
    return res.status(409).json({ error: 'Closure gates have regressed since the request was submitted. Review the checklist.', blockers: gates });
  }
  if (prereqs.osha300Entry.required && !prereqs.osha300Entry.passed) return res.status(409).json({ error: 'OSHA 300 entry removed since request.', blockers: gates });
  if (prereqs.riddorFiled.required && !prereqs.riddorFiled.passed) return res.status(409).json({ error: 'RIDDOR status regressed since request.', blockers: gates });

  const { notes } = req.body;

  db.prepare("UPDATE closure_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(req.user.id, notes || null, cr.id);

  db.prepare(`
    UPDATE incidents SET status = 'Closed', closure_type = 'approved', closed_reason = ?, closed_notes = ?, closed_at = datetime('now'), closed_by = ?, updated_at = datetime('now') WHERE id = ?
  `).run(cr.closure_summary, cr.lessons_learned + (notes ? `\n\nReviewer: ${notes}` : ''), req.user.id, incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'closure_approved', ?, ?)
  `).run(incident.org_id, incident.id, `closure approved for ${incident.incident_number}`, req.user.id);

  notifyUser({ orgId: incident.org_id, userId: cr.requested_by, type: 'closure_approved', incidentId: incident.id,
    title: `Closure approved — ${incident.incident_number}`, body: notes || 'Your closure request has been approved.', severity: 'info', actionUrl: `/incidents/${incident.id}` });
  if (incident.reported_by && incident.reported_by !== cr.requested_by) {
    notifyUser({ orgId: incident.org_id, userId: incident.reported_by, type: 'incident_closed', incidentId: incident.id,
      title: `Your incident ${incident.incident_number} has been closed`, body: 'Closed after manager approval.', severity: 'info', actionUrl: `/incidents/${incident.id}` });
  }

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

// --- Reject closure request ---
router.post('/:id/closure-request/:requestId/reject', (req, res) => {
  if (!['ehs_manager', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only EHS managers or admins can reject closure.' });
  const { notes } = req.body;
  if (!notes) return res.status(400).json({ error: 'Rejection reason is required.' });

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });

  const cr = db.prepare("SELECT * FROM closure_requests WHERE id = ? AND incident_id = ? AND status = 'pending'").get(req.params.requestId, incident.id);
  if (!cr) return res.status(404).json({ error: 'Pending closure request not found.' });

  db.prepare("UPDATE closure_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_notes = ?, updated_at = datetime('now') WHERE id = ?")
    .run(req.user.id, notes, cr.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'closure_rejected', ?, ?)
  `).run(incident.org_id, incident.id, `closure request rejected for ${incident.incident_number} — ${notes}`, req.user.id);

  notifyUser({ orgId: incident.org_id, userId: cr.requested_by, type: 'closure_rejected', incidentId: incident.id,
    title: `Closure rejected — ${incident.incident_number}`, body: notes, severity: 'err', actionUrl: `/incidents/${incident.id}` });

  res.json({ success: true });
});

// --- Reopen a closed incident ---
router.post('/:id/reopen', (req, res) => {
  if (!['ehs_manager', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only EHS managers or admins can reopen incidents.' });
  const { reason } = req.body;
  if (!reason || reason.trim().length < 10) return res.status(400).json({ error: 'Reopen reason must be at least 10 characters.' });

  const incident = db.prepare('SELECT * FROM incidents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  if (incident.status !== 'Closed') return res.status(409).json({ error: 'Incident is not closed.' });

  // Determine appropriate reopen status
  const inv = db.prepare("SELECT id, status FROM investigations WHERE incident_id = ? ORDER BY id DESC LIMIT 1").get(incident.id);
  const openCapas = db.prepare(`
    SELECT COUNT(*) as c FROM capas WHERE (incident_id = ? OR investigation_id IN (SELECT id FROM investigations WHERE incident_id = ?)) AND org_id = ? AND status != 'closed'
  `).get(incident.id, incident.id, req.user.org_id);

  let reopenStatus = 'Triage';
  if (openCapas.c > 0) reopenStatus = 'Awaiting CAPA';
  else if (inv && inv.status !== 'closed') reopenStatus = 'Investigating';

  db.prepare(`
    UPDATE incidents SET status = ?, closed_at = NULL, closed_by = NULL, closed_reason = NULL, closed_notes = NULL, closure_type = NULL,
      reopened_at = datetime('now'), reopened_by = ?, reopened_reason = ?, reopen_count = reopen_count + 1, updated_at = datetime('now')
    WHERE id = ?
  `).run(reopenStatus, req.user.id, reason, incident.id);

  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id)
    VALUES (?, 'incident', ?, 'incident_reopened', ?, ?)
  `).run(incident.org_id, incident.id, `reopened ${incident.incident_number} → ${reopenStatus} — ${reason}`, req.user.id);

  if (incident.assigned_to) {
    notifyUser({ orgId: incident.org_id, userId: incident.assigned_to, type: 'incident_reopened', incidentId: incident.id,
      title: `Incident reopened — ${incident.incident_number}`, body: reason, severity: 'warn', actionUrl: `/incidents/${incident.id}` });
  }
  if (incident.reported_by && incident.reported_by !== incident.assigned_to) {
    notifyUser({ orgId: incident.org_id, userId: incident.reported_by, type: 'incident_reopened', incidentId: incident.id,
      title: `Your incident ${incident.incident_number} has been reopened`, body: reason, severity: 'info', actionUrl: `/incidents/${incident.id}` });
  }
  notifyElevatedAtSite({ orgId: incident.org_id, siteId: incident.site_id, type: 'incident_reopened', incidentId: incident.id,
    title: `Incident reopened — ${incident.incident_number}`, body: reason, severity: 'warn', actionUrl: `/incidents/${incident.id}` });

  const updated = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incident.id);
  updated.type_data = JSON.parse(updated.type_data || '{}');
  res.json(updated);
});

export default router;
