// server/scripts/populate-sdsmanager-demo.js
//
// Non-destructive demo-data populator for SDS Manager Inc. (org_id=1).
//
// Adds enough investigations, 5-Whys, CAPAs, and one active recordability
// override request that the kanban boards and approvals queue look populated
// for the live demo. Does NOT delete or wipe any existing rows — pure
// INSERTs plus narrow status UPDATEs on a small set of "New" incidents.
//
// Idempotent: marker is INV-DEMO-* on investigation_number. If any such row
// already exists for org=1, the script exits without changes.
//
// Run from the server/ dir:
//   node scripts/populate-sdsmanager-demo.js
//
// Reverse: investigations / capas / activity_log entries inserted here all
// carry their own number prefix (INV-DEMO-*, CAPA-DEMO-*) so they can be
// selected and rolled back with one DELETE per table if needed.

import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';

const ORG_ID = 1;
const NOW = new Date();
const isoNow = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const daysFromNow = (n) => {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Pre-flight
// ---------------------------------------------------------------------------
function getUser(email) {
  const row = db.prepare('SELECT id, name FROM users WHERE email = ? AND org_id = ?')
    .get(email, ORG_ID);
  if (!row) throw new Error(`User not found: ${email}`);
  return row;
}

const existing = db.prepare(`
  SELECT COUNT(*) AS n FROM investigations
  WHERE org_id = ? AND investigation_number LIKE 'INV-DEMO-%'
`).get(ORG_ID);

if (existing.n > 0) {
  console.log(`Demo data already populated (${existing.n} INV-DEMO-* investigations).`);
  console.log('To re-run, delete INV-DEMO-* and CAPA-DEMO-* rows first.');
  process.exit(0);
}

const priya  = getUser('priya@sdsmanager.com');
const elena  = getUser('elena@sdsmanager.com');
const marcus = getUser('marcus@sdsmanager.com');
const james  = getUser('james@sdsmanager.com');
const mehta  = getUser('mehta@sdsmanager.com');

// ---------------------------------------------------------------------------
// Pick target incidents: 15 "New" Track A/B incidents (oldest first so we
// pull from the existing fixture pool, not hand-created recent rows).
// ---------------------------------------------------------------------------
const targets = db.prepare(`
  SELECT id, incident_number, title, site_id, severity, track, type
  FROM incidents
  WHERE org_id = ?
    AND status = 'New'
    AND track IN ('A','B')
    AND type IN ('injury','illness','nearmiss','dangerous')
  ORDER BY incident_datetime ASC
  LIMIT 15
`).all(ORG_ID);

if (targets.length < 15) {
  console.warn(`Only ${targets.length} eligible incidents found (need 15). Continuing anyway.`);
}

// ---------------------------------------------------------------------------
// Plan: distribute targets across kanban lanes
// ---------------------------------------------------------------------------
//   pending  -> 4   (investigation queued, not started)
//   progress -> 5   (active, with 5-Whys)
//   capa     -> 4   (awaiting CAPA, with 5-Whys + child CAPAs)
//   closed   -> 2   (resolved, with findings)
const LANE_PLAN = [
  ['pending',  4],
  ['progress', 5],
  ['capa',     4],
  ['closed',   2],
];

const NARRATIVE = {
  finding: [
    'Operator workflow lacked a documented hand-clearance step before energising the press cycle.',
    'Spill kit was located 14m from the decanting station; response time exceeded SOP target by 4×.',
    'Forklift pre-shift inspection sheet was outdated and did not include the load-backrest check.',
    'PPE issuance log showed last cuff-resistant glove distribution was 11 months prior to incident.',
    'Lockout/tagout step omitted because the energy source was perceived as already isolated.',
    'Housekeeping cadence on Bay 4 had slipped from weekly to monthly without supervisor sign-off.',
  ],
  rootCause: [
    'Procedural drift — SOP last revised 2019; no automated review cadence in place.',
    'Training gap — workers onboarded post-2023 did not receive the legacy decanting briefing.',
    'Equipment ageing — Press 4 guarding cleared 2022 retrofit but original 2018 spec was insufficient.',
    'Communication gap — shift handover sheet does not flag near-miss precursors.',
  ],
  rcCategories: [
    '["procedure","training"]',
    '["equipment","maintenance"]',
    '["communication","supervision"]',
    '["training","ppe"]',
    '["procedure","supervision"]',
  ],
  whyQs: [
    'Why did the {hazard} occur?',
    'Why was the {control} not effective?',
    'Why was the {control} not in place?',
    'Why did the procedure not catch this?',
    'Why has the procedure not been reviewed?',
  ],
  whyAs: [
    'Operator was performing the task outside the engineered safeguard zone.',
    'The control had been removed temporarily during a 2024 retrofit and never reinstated.',
    'The SOP referenced an older revision of the equipment manual.',
    'The annual review process was suspended during the 2020–2022 disruption.',
    'No automated reminder existed to flag the lapse to EHS.',
  ],
};

const CAPA_TITLES = [
  ['Update SOP-PRD-021 to mandate hand-clearance verbal callout', 'corrective', 'high'],
  ['Replace existing guarding on Press 4 with light-curtain retrofit', 'corrective', 'critical'],
  ['Relocate spill kit to within 5m of every decanting station', 'corrective', 'high'],
  ['Issue cuff-resistant gloves to all Bay 3 operators', 'corrective', 'medium'],
  ['Schedule quarterly LOTO refresher training site-wide', 'preventive', 'medium'],
  ['Add load-backrest check to forklift pre-shift sheet', 'corrective', 'high'],
  ['Implement automated SOP-review reminder via QMS', 'preventive', 'medium'],
  ['Audit chemical-decanting workflow across all labs', 'preventive', 'high'],
  ['Retrofit Bay 4 housekeeping cadence with weekly checklist', 'preventive', 'low'],
  ['Procure and deploy fall-arrest kits for roofing crew', 'corrective', 'critical'],
  ['Revise shift handover template to include near-miss precursors', 'preventive', 'medium'],
  ['Replace damaged PPE storage cabinet on Bay 2', 'corrective', 'low'],
];

// ---------------------------------------------------------------------------
// Statement preparers
// ---------------------------------------------------------------------------
const updIncStatus = db.prepare(`
  UPDATE incidents SET status = ?, assigned_to = ? WHERE id = ?
`);
const insInv = db.prepare(`
  INSERT INTO investigations
    (investigation_number, incident_id, org_id, lead_investigator, status, track,
     due_date, findings, root_cause_summary, root_cause_categories, closed_at, closed_by, closed_reason)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insWhy = db.prepare(`
  INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insCapa = db.prepare(`
  INSERT INTO capas
    (capa_number, source_type, investigation_id, incident_id, org_id, title, type, priority,
     owner_id, verifier_id, due_date, status, progress)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insOverride = db.prepare(`
  INSERT INTO classification_override_requests
    (incident_id, org_id, jurisdiction, field, current_value, proposed_value, reason, requested_by)
  VALUES (?, ?, 'US-OSHA', 'osha_recordable', 1, 0, ?, ?)
`);

// ---------------------------------------------------------------------------
// Pick CAPA owner/verifier pairs (must differ — DB trigger enforces this)
// ---------------------------------------------------------------------------
const PAIRS = [
  [elena.id, james.id],
  [marcus.id, elena.id],
  [james.id, elena.id],
  [marcus.id, james.id],
  [elena.id, marcus.id],
];

// ---------------------------------------------------------------------------
// Run inside a single transaction
// ---------------------------------------------------------------------------
const run = db.transaction(() => {
  let invSeq = 1;
  let capaSeq = 1;
  let cursor = 0;
  let totalInv = 0, totalWhy = 0, totalCapa = 0;

  for (const [laneStatus, count] of LANE_PLAN) {
    for (let i = 0; i < count && cursor < targets.length; i++, cursor++) {
      const t = targets[cursor];

      // Promote the incident's lifecycle status to match the investigation lane
      const incStatus =
        laneStatus === 'pending'  ? 'Investigating' :
        laneStatus === 'progress' ? 'Investigating' :
        laneStatus === 'capa'     ? 'Awaiting CAPA' :
        /* closed */                'Closed';
      updIncStatus.run(incStatus, elena.id, t.id);

      writeActivity({
        org_id: ORG_ID,
        entity_type: 'incident',
        entity_id: t.id,
        action: 'status_changed',
        description: `Status promoted to ${incStatus} (demo seed)`,
        user_id: elena.id,
        metadata: { source: 'populate-sdsmanager-demo', lane: laneStatus },
      });

      // Build the investigation row
      const invNo = `INV-DEMO-${String(invSeq++).padStart(3, '0')}`;
      const isClosed = laneStatus === 'closed';
      const hasFindings = laneStatus === 'capa' || isClosed;

      const findings = hasFindings ? NARRATIVE.finding[(i + cursor) % NARRATIVE.finding.length] : null;
      const rootCause = hasFindings ? NARRATIVE.rootCause[(i + cursor) % NARRATIVE.rootCause.length] : null;
      const rcCats = hasFindings ? NARRATIVE.rcCategories[(i + cursor) % NARRATIVE.rcCategories.length] : '[]';
      const closedAt = isClosed ? isoNow() : null;
      const closedBy = isClosed ? elena.id : null;
      const closedReason = isClosed ? 'Investigation complete; CAPAs verified effective.' : null;
      const dueDate = isClosed ? null : daysFromNow(laneStatus === 'pending' ? 10 : laneStatus === 'progress' ? 5 : 2);

      const invRes = insInv.run(
        invNo, t.id, ORG_ID, elena.id, laneStatus, t.track,
        dueDate, findings, rootCause, rcCats, closedAt, closedBy, closedReason,
      );
      const invId = invRes.lastInsertRowid;
      totalInv++;

      writeActivity({
        org_id: ORG_ID,
        entity_type: 'investigation',
        entity_id: invId,
        action: 'investigation_created',
        description: `Investigation ${invNo} opened (${laneStatus})`,
        user_id: elena.id,
        metadata: { incident_id: t.id, lane: laneStatus },
      });

      // 5-Whys for progress / capa / closed lanes
      if (laneStatus !== 'pending') {
        for (let level = 1; level <= 5; level++) {
          const q = NARRATIVE.whyQs[level - 1]
            .replace('{hazard}', t.type === 'injury' ? 'injury' : 'incident')
            .replace('{control}', t.type === 'injury' ? 'PPE / engineering control' : 'procedural control');
          const a = NARRATIVE.whyAs[(level - 1 + cursor) % NARRATIVE.whyAs.length];
          insWhy.run(invId, level, q, a, level === 5 ? 1 : 0, elena.id);
          totalWhy++;
        }
      }

      // CAPAs for capa / closed lanes
      if (laneStatus === 'capa' || isClosed) {
        const capaCount = isClosed ? 2 : 3;
        for (let k = 0; k < capaCount; k++) {
          const titleEntry = CAPA_TITLES[(cursor + k) % CAPA_TITLES.length];
          const [pTitle, pType, pPriority] = titleEntry;
          const [ownerId, verifierId] = PAIRS[(cursor + k) % PAIRS.length];
          const capaNo = `CAPA-DEMO-${String(capaSeq++).padStart(3, '0')}`;

          let capaStatus, progress, due;
          if (isClosed) {
            capaStatus = 'closed'; progress = 100; due = daysFromNow(-7);
          } else {
            // capa-lane investigations: spread across pending / progress / verify
            const r = k % 3;
            if (r === 0) { capaStatus = 'pending';  progress = 0;  due = daysFromNow(7); }
            else if (r === 1) { capaStatus = 'progress'; progress = 45; due = daysFromNow(-2); } // overdue
            else { capaStatus = 'verify'; progress = 100; due = daysFromNow(1); }
          }

          insCapa.run(
            capaNo, 'investigation', invId, null, ORG_ID,
            pTitle, pType, pPriority, ownerId, verifierId, due, capaStatus, progress,
          );
          totalCapa++;

          writeActivity({
            org_id: ORG_ID,
            entity_type: 'capa',
            entity_id: null,
            action: 'capa_created',
            description: `${capaNo} created — ${pTitle}`,
            user_id: elena.id,
            metadata: { investigation_id: invId, status: capaStatus, priority: pPriority },
          });
        }
      }

      // For progress-lane investigations: add one pending CAPA each so the
      // CAPA board has a couple of just-opened items waiting for the
      // owner to start.
      if (laneStatus === 'progress') {
        const titleEntry = CAPA_TITLES[(cursor + 7) % CAPA_TITLES.length];
        const [pTitle, pType, pPriority] = titleEntry;
        const [ownerId, verifierId] = PAIRS[(cursor + 2) % PAIRS.length];
        const capaNo = `CAPA-DEMO-${String(capaSeq++).padStart(3, '0')}`;
        insCapa.run(
          capaNo, 'investigation', invId, null, ORG_ID,
          pTitle, pType, pPriority, ownerId, verifierId,
          daysFromNow(14), 'pending', 0,
        );
        totalCapa++;
      }
    }
  }

  // -------------------------------------------------------------------------
  // One active override approval request — pick an OSHA-recordable incident
  // for SDS Manager Inc. that does not already have a pending request.
  // -------------------------------------------------------------------------
  const overrideTarget = db.prepare(`
    SELECT i.id, i.incident_number FROM incidents i
    LEFT JOIN classification_override_requests o
      ON o.incident_id = i.id AND o.field = 'osha_recordable' AND o.status = 'pending'
    WHERE i.org_id = ? AND i.osha_recordable = 1 AND o.id IS NULL
    ORDER BY i.incident_datetime DESC
    LIMIT 1
  `).get(ORG_ID);

  let overrideId = null;
  if (overrideTarget) {
    const res = insOverride.run(
      overrideTarget.id,
      ORG_ID,
      'Initial classification flagged OSHA-recordable, but injury required only first-aid treatment per 1904.7(b)(5)(ii). Requesting reclassification to non-recordable.',
      marcus.id,
    );
    overrideId = res.lastInsertRowid;

    writeActivity({
      org_id: ORG_ID,
      entity_type: 'incident',
      entity_id: overrideTarget.id,
      action: 'override_requested',
      description: `Recordability override requested on ${overrideTarget.incident_number}`,
      user_id: marcus.id,
      metadata: { jurisdiction: 'US-OSHA', field: 'osha_recordable', request_id: overrideId },
    });
  }

  console.log(`\n  Investigations created: ${totalInv}`);
  console.log(`  5-Whys entries:         ${totalWhy}`);
  console.log(`  CAPAs created:          ${totalCapa}`);
  console.log(`  Override requests:      ${overrideId ? 1 : 0}${overrideTarget ? ` (incident ${overrideTarget.incident_number})` : ''}`);
});

console.log('Populating SDS Manager Inc. (org_id=1) demo data...');
run();
console.log('\nDone. Refresh the dashboard / investigations / CAPAs pages to see the new records.');
