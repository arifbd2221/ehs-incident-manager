// server/scripts/populate-safework-nsw-demo.js
//
// Non-destructive add of the Harbour Safety Solutions (AU / SafeWork NSW)
// demo org. Mirrors the AU block in db/seed.js but uses non-colliding
// incident_numbers (INC-2026-92xx) and NSW notification numbers
// (NSW-2026-91xx) so the existing Sydney Smelters Pty AU org is untouched.
//
// Idempotent: if `Harbour Safety Solutions Pty Ltd` already exists, exits
// without changes.
//
// Run from server/:
//   node scripts/populate-safework-nsw-demo.js

import db from '../db/connection.js';
import bcrypt from 'bcryptjs';
import { writeActivity } from '../services/activity_log.js';

const ORG_NAME = 'Harbour Safety Solutions Pty Ltd';

const existing = db.prepare('SELECT id FROM organizations WHERE name = ?').get(ORG_NAME);
if (existing) {
  console.log(`${ORG_NAME} already exists (id=${existing.id}). Skipping.`);
  process.exit(0);
}

console.log(`Adding ${ORG_NAME} (AU / SafeWork NSW) demo data...`);

const run = db.transaction(() => {
  const auOrgId = db.prepare(
    `INSERT INTO organizations (name, country, industry_sector, naics_code, compliance_frameworks, company_size)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    ORG_NAME, 'AU', 'Manufacturing', null,
    JSON.stringify(['safework_nsw']),
    '51-200',
  ).lastInsertRowid;

  // Sites
  const sydneyId = db.prepare(
    `INSERT INTO sites (org_id, name, country, annual_avg_employees, total_hours_worked, timezone)
     VALUES (?, 'Sydney Manufacturing', 'AU', 85, 174200, 'Australia/Sydney')`
  ).run(auOrgId).lastInsertRowid;
  const penrithId = db.prepare(
    `INSERT INTO sites (org_id, name, country, annual_avg_employees, total_hours_worked, timezone)
     VALUES (?, 'Western Sydney Distribution', 'AU', 42, 86100, 'Australia/Sydney')`
  ).run(auOrgId).lastInsertRowid;

  // Users
  const auPw = bcrypt.hashSync('password123', 10);
  const auIns = db.prepare(
    'INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const sarahId = auIns.run(auOrgId, sydneyId, 'sarah@sdsmanager.com', auPw, 'Sarah Mitchell', 'SM', 'admin', 'Leadership', 'Operations Director').lastInsertRowid;
  const tomId   = auIns.run(auOrgId, sydneyId, 'tom@sdsmanager.com',   auPw, 'Tom Nguyen',     'TN', 'ehs_manager', 'WHS', 'WHS Manager').lastInsertRowid;
  const kateId  = auIns.run(auOrgId, sydneyId, 'kate@sdsmanager.com',  auPw, "Kate O'Brien",   'KO', 'supervisor', 'Production', 'Production Supervisor').lastInsertRowid;
  const benId   = auIns.run(auOrgId, penrithId, 'ben@sdsmanager.com',  auPw, 'Ben Walker',     'BW', 'worker',     'Warehouse',  'Plant Operator').lastInsertRowid;

  // Assets
  const auAssetIns = db.prepare(
    `INSERT INTO assets (asset_number, org_id, site_id, name, asset_type, location_description, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  let auN = 9100;
  const auNext = () => `AST-2026-${String(++auN).padStart(5, '0')}`;
  const scaffold    = auAssetIns.run(auNext(), auOrgId, sydneyId,  'Scaffold Bay 2',       'building', 'Assembly area — Bay 2', null).lastInsertRowid;
  const weldBay     = auAssetIns.run(auNext(), auOrgId, sydneyId,  'Welding Bay 1',        'building', 'Fabrication area',      null).lastInsertRowid;
  const auForklift  = auAssetIns.run(auNext(), auOrgId, penrithId, 'Forklift FL-12',       'vehicle',  'Loading dock B',        'TCM-FL12-90044').lastInsertRowid;
  auAssetIns.run(auNext(), auOrgId, sydneyId,  'Chemical Store Room 1', 'building', 'East wing',         null);
  auAssetIns.run(auNext(), auOrgId, sydneyId,  'Overhead crane #3',     'machine',  'Fabrication area',  'KONE-3-2021');

  // 18 months of work_hours (TRIR/DART denominator)
  const auWhIns = db.prepare(
    `INSERT INTO work_hours (site_id, period_start, period_end, hours_worked, avg_employees, entered_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  function auFillHours(siteId, baseHours, baseEmp, months, enteredBy) {
    const today = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end   = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      const variance = Math.round((Math.random() - 0.5) * 0.08 * baseHours);
      auWhIns.run(siteId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), baseHours + variance, baseEmp, enteredBy);
    }
  }
  auFillHours(sydneyId,  14500, 85, 18, tomId);
  auFillHours(penrithId,  7200, 42, 18, tomId);

  // =====================================================================
  // INCIDENTS — covering all three s.35 notification categories.
  // Numbered INC-2026-92xx so they don't collide with the existing AU org.
  // =====================================================================
  const auIncIns = db.prepare(`
    INSERT INTO incidents (
      incident_number, org_id, site_id, title, type, description, incident_datetime,
      area, specific_location, department, asset_id,
      severity, likelihood, consequence, track,
      status, reported_by, is_anonymous, is_imminent_danger, stop_work_status,
      body_parts_affected, voice_extraction_id,
      osha_recordable, osha_recordability_type,
      osha_recordable_verified_by, osha_recordable_verified_at,
      riddor_reportable, riddor_category,
      type_data, immediate_actions_taken,
      closed_at, closed_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // (1) s.35(a) FATALITY — forklift crush
  const fatalityIncId = auIncIns.run(
    'INC-2026-9200', auOrgId, penrithId,
    'Fatal forklift crush — Loading dock B',
    'injury',
    'Worker struck and pinned by reversing forklift at Loading dock B. Emergency services attended. Worker pronounced deceased at scene. SafeWork NSW inspector attended and preserved the site under s.39.',
    '2026-04-15T06:45:00', 'Loading dock B', 'Racking aisle 3', 'Warehouse', auForklift,
    1, 0, 4, 'A',
    'Investigating', benId, 0, 1, null,
    '["torso","l_leg","r_leg"]', null,
    0, null, null, null, 0, null,
    JSON.stringify({
      injured_person: { name: 'David Chen', job_title: 'Warehouse operator', department: 'Warehouse' },
      injury_type: 'Crush injury — fatal',
      mechanism: 'Struck by moving vehicle',
      treatment: ['Emergency services — deceased at scene'],
    }),
    'Area evacuated, emergency services called immediately, site secured.',
    null, null,
  ).lastInsertRowid;

  // (2) s.35(b) SERIOUS INJURY — fall from scaffold, spinal
  const spinalIncId = auIncIns.run(
    'INC-2026-9201', auOrgId, sydneyId,
    'Fall from scaffold — spinal injury',
    'injury',
    'Worker fell approximately 3.2m from scaffold platform in Bay 2 when guardrail detached. Worker landed on concrete floor, unable to move lower limbs. Ambulance transported to Royal Prince Alfred Hospital. Admitted as in-patient with suspected spinal injury.',
    '2026-05-05T10:20:00', 'Assembly area', 'Bay 2 scaffold platform', 'Production', scaffold,
    1, 0, 4, 'A',
    'Investigating', kateId, 0, 0, null,
    '["spine","l_leg","r_leg"]', null,
    0, null, null, null, 0, null,
    JSON.stringify({
      injured_person: { name: 'Ryan Murphy', job_title: 'Fitter', department: 'Production' },
      injury_type: 'Spinal injury — suspected fracture',
      mechanism: 'Fall from height',
      object_substance: 'Scaffold platform (~3.2m)',
      treatment: ['Hospitalization — in-patient RPA Hospital'],
      ppe: ['Hard hat', 'Steel cap boots'],
    }),
    'Do not move patient. Area cleared, ambulance called. Scaffold quarantined.',
    null, null,
  ).lastInsertRowid;

  // (3) s.35(b) SERIOUS INJURY — chemical burn
  const burnIncId = auIncIns.run(
    'INC-2026-9202', auOrgId, sydneyId,
    'Serious chemical burn — hydrochloric acid splash',
    'injury',
    "During transfer of hydrochloric acid from IBC to process tank, hose coupling failed spraying acid onto worker's left arm and torso. Emergency shower used for 20 minutes. Worker transported to Concord Hospital burns unit for treatment as in-patient.",
    '2026-05-08T14:10:00', 'Chemical store', 'Transfer bay', 'Production', null,
    1, 0, 4, 'A',
    'Investigating', tomId, 0, 0, null,
    '["l_arm","torso"]', null,
    0, null, null, null, 0, null,
    JSON.stringify({
      injured_person: { name: 'Lisa Trần', job_title: 'Process operator', department: 'Production' },
      injury_type: 'Chemical burn — 2nd degree',
      mechanism: 'Contact with chemical substance',
      object_substance: 'Hydrochloric acid 32% (CAS 7647-01-0)',
      treatment: ['Hospitalization — in-patient Concord Hospital burns unit'],
      ppe: ['Chemical-resistant gloves', 'Safety glasses', 'Apron'],
    }),
    'Emergency shower activated, contaminated clothing removed, ambulance called.',
    null, null,
  ).lastInsertRowid;

  // (4) s.35(c) DANGEROUS INCIDENT — gas release
  const gasIncId = auIncIns.run(
    'INC-2026-9203', auOrgId, sydneyId,
    'Uncontrolled argon/CO₂ gas release — Welding Bay 1',
    'dangerous',
    'Manifold regulator failed on argon/CO₂ shielding gas supply causing uncontrolled release into welding bay. Oxygen monitoring alarm activated. Bay evacuated — no injuries. Gas supply isolated at bulk tank.',
    '2026-05-10T09:35:00', 'Fabrication area', 'Welding Bay 1', 'Production', weldBay,
    2, 1, 3, 'A',
    'Investigating', kateId, 0, 0, null,
    '[]', null,
    0, null, null, null, 0, null,
    JSON.stringify({}),
    'Gas isolated at bulk tank, bay ventilated, atmospheric monitoring confirmed safe before re-entry.',
    null, null,
  ).lastInsertRowid;

  // (5) Near miss — forklift near miss at loading dock
  auIncIns.run(
    'INC-2026-9204', auOrgId, penrithId,
    'Forklift near miss with pedestrian — Loading dock A',
    'nearmiss',
    'Forklift reversed without sounding horn at Loading dock A. Pedestrian worker stepped back in time to avoid contact. No barriers or exclusion zones marked at the dock entrance.',
    '2026-05-11T15:50:00', 'Loading dock A', null, 'Warehouse', null,
    3, 2, 2, 'B',
    'New', benId, 0, 0, null,
    '[]', null,
    0, null, null, null, 0, null,
    '{}', null, null, null,
  );

  // (6) Track C auto-close — minor first-aid
  auIncIns.run(
    'INC-2026-9205', auOrgId, sydneyId,
    'Minor cut — hand laceration during deburring',
    'injury',
    'Worker sustained superficial cut to left index finger while deburring aluminium panel. First aid applied on site — adhesive bandage.',
    '2026-04-28T11:15:00', 'Fabrication area', 'Deburring station', 'Production', null,
    5, 4, 0, 'C',
    'Closed', kateId, 0, 0, null,
    '["l_hand"]', null,
    0, 'first_aid', null, null, 0, null,
    JSON.stringify({ injured_person: { name: 'Jake Williams' }, treatment: ['First aid only'] }),
    null,
    '2026-04-28T12:00:00', 'Auto-closed (Track C)',
  );

  // =====================================================================
  // SafeWork NSW NOTIFICATIONS — NSW-2026-91xx
  // =====================================================================
  const nswIns = db.prepare(`
    INSERT INTO safework_nsw_notifications (
      nsw_number, incident_id, org_id, site_id, event_date,
      is_fatality, is_serious_injury, is_dangerous_incident,
      serious_injury_sub_categories, dangerous_incident_sub_categories,
      site_preservation_status, site_preservation_notes, inspector_arrived_at,
      phone_notified_at, phone_notified_by, phone_regulator_office, phone_notes,
      regulator_requested_written_at, written_deadline, written_submitted_at,
      written_submitted_by, written_reference, written_notes,
      pcbu_name, pcbu_abn, pcbu_anzsic_code,
      created_by,
      pcbu_trading_name, pcbu_address, pcbu_worker_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // (1) Fatality — phone + written submitted, site released by inspector
  nswIns.run(
    'NSW-2026-9101', fatalityIncId, auOrgId, penrithId, '2026-04-15',
    1, 0, 0,
    '[]', '[]',
    'released_by_inspector',
    'SafeWork NSW inspector attended 2026-04-15 08:30. Site released 2026-04-16 16:00 after forensic examination.',
    '2026-04-15T08:30:00',
    '2026-04-15T07:02:00', tomId, 'SafeWork NSW — Parramatta',
    'Phone notification made immediately. Spoke with duty officer. Reference provided.',
    '2026-04-15T07:02:00', '2026-04-17T07:02:00',
    '2026-04-15T18:45:00', tomId, 'SWNSW-2026-F-04821',
    'Written report submitted same day via SafeWork NSW online portal.',
    'Harbour Safety Solutions Pty Ltd', '51 628 473 190', '2292',
    tomId,
    'Harbour Safety', '14 Industrial Ave, Penrith NSW 2750', 42,
  );

  // (2) Spinal — phone done, written requested but NOT submitted (deadline approaching)
  nswIns.run(
    'NSW-2026-9102', spinalIncId, auOrgId, sydneyId, '2026-05-05',
    0, 1, 0,
    JSON.stringify(['s36_a_inpatient_hospital', 's36_b_vi_spinal_injury']),
    '[]',
    'preserved',
    'Scaffold quarantined, access restricted with barrier tape. Awaiting inspector.',
    null,
    '2026-05-05T10:48:00', tomId, 'SafeWork NSW — Sydney CBD',
    'Phoned SafeWork immediately. Inspector scheduled for next business day.',
    '2026-05-05T10:48:00', '2026-05-07T10:48:00',
    null, null, null,
    'Written report overdue — regulator follow-up expected.',
    'Harbour Safety Solutions Pty Ltd', '51 628 473 190', '2292',
    tomId,
    'Harbour Safety', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  // (3) Chemical burn — phone + written submitted
  nswIns.run(
    'NSW-2026-9103', burnIncId, auOrgId, sydneyId, '2026-05-08',
    0, 1, 0,
    JSON.stringify(['s36_a_inpatient_hospital', 's36_b_iv_serious_burn']),
    '[]',
    'disturbed_to_make_safe',
    'Acid spill neutralised and cleaned for safety under s.39(3)(c). Hose coupling retained as evidence.',
    null,
    '2026-05-08T14:35:00', tomId, 'SafeWork NSW — Sydney CBD',
    'Phone notification within 25 minutes of incident.',
    '2026-05-08T14:35:00', '2026-05-10T14:35:00',
    '2026-05-09T09:20:00', sarahId, 'SWNSW-2026-SI-05102',
    'Written report submitted next morning. Included photos of failed coupling.',
    'Harbour Safety Solutions Pty Ltd', '51 628 473 190', '2292',
    tomId,
    'Harbour Safety', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  // (4) Gas release — phone done, written not yet requested
  nswIns.run(
    'NSW-2026-9104', gasIncId, auOrgId, sydneyId, '2026-05-10',
    0, 0, 1,
    '[]',
    JSON.stringify(['s37_c_uncontrolled_gas_or_steam']),
    'preserved',
    'Welding bay cordoned off. Gas manifold isolated. Awaiting regulator direction.',
    null,
    '2026-05-10T09:52:00', kateId, 'SafeWork NSW — Sydney CBD',
    'Phoned SafeWork within 20 minutes. No injuries reported.',
    null, null,
    null, null, null, null,
    'Harbour Safety Solutions Pty Ltd', '51 628 473 190', '2292',
    kateId,
    'Harbour Safety', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  // =====================================================================
  // Notifications — regulatory alerts
  // =====================================================================
  const auNotifIns = db.prepare('INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)');
  auNotifIns.run(auOrgId, 'safework_nsw_immediate',       fatalityIncId, 'SafeWork NSW — fatality notification',          'Fatal forklift crush at Western Sydney Distribution. Phone notification completed. Written report submitted.', 'err',  null);
  auNotifIns.run(auOrgId, 'safework_nsw_written_overdue', spinalIncId,   'SafeWork NSW — written report OVERDUE',         'Scaffold fall — spinal injury (Sydney Manufacturing). Written report was due 2026-05-07. Submit immediately.', 'err',  '2026-05-07T10:48:00');
  auNotifIns.run(auOrgId, 'safework_nsw_immediate',       gasIncId,      'SafeWork NSW — dangerous incident notification', 'Uncontrolled gas release in Welding Bay 1. Phone notification completed. Site preserved.',                    'warn', null);

  // =====================================================================
  // Investigations — INV-2026-91xx (no collision; only 2026-0100..0102 used originally)
  // =====================================================================
  const auInvIns = db.prepare(
    'INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, status, track, findings, root_cause_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const auInv1 = auInvIns.run(
    'INV-2026-9100', fatalityIncId, auOrgId, tomId, 'progress', 'A',
    'Preliminary: forklift reversed without spotter in confined dock area. CCTV shows no audible reversing alarm. Pedestrian exclusion zone not established.',
    null,
  ).lastInsertRowid;
  const auInv2 = auInvIns.run(
    'INV-2026-9101', spinalIncId, auOrgId, tomId, 'progress', 'A',
    'Scaffold guardrail found detached at two connection points. Inspection records show last scaffold check was 6 weeks prior (should be weekly per AS/NZS 1576).',
    'Scaffold inspection regime non-compliant with AS/NZS 1576.3 requirements for regular inspection.',
  ).lastInsertRowid;
  const auInv3 = auInvIns.run(
    'INV-2026-9102', burnIncId, auOrgId, kateId, 'pending', 'A', null, null,
  ).lastInsertRowid;

  // 5-Why for scaffold fall investigation
  const auWhyIns = db.prepare('INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  auWhyIns.run(auInv2, 1, 'Why did the worker fall?',                       'Guardrail on scaffold platform detached when worker leaned against it.',                                       0, tomId);
  auWhyIns.run(auInv2, 2, 'Why did the guardrail detach?',                  'Two of four connection clips were missing; remaining two had corroded threads.',                              0, tomId);
  auWhyIns.run(auInv2, 3, 'Why were connection clips missing and corroded?', 'Last scaffold inspection was 6 weeks ago; defects were not identified.',                                     0, tomId);
  auWhyIns.run(auInv2, 4, 'Why was the inspection 6 weeks overdue?',         'No scheduled inspection regime in place; inspections were ad-hoc.',                                          0, tomId);
  auWhyIns.run(auInv2, 5, 'Why was there no scheduled inspection regime?',   'AS/NZS 1576.3 weekly inspection requirement was not incorporated into the site WHS management system.',     1, tomId);

  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(auInv1, tomId,   'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(auInv1, sarahId, 'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(auInv2, tomId,   'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(auInv2, kateId,  'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(auInv3, kateId,  'lead');

  // =====================================================================
  // CAPAs — CAPA-91xx range to avoid collision with CAPA-100..105 if present
  // =====================================================================
  const auCapaIns = db.prepare(`
    INSERT INTO capas (capa_number, source_type, investigation_id, incident_id, org_id, title, description, type, priority, owner_id, verifier_id, due_date, status, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  auCapaIns.run('CAPA-9100', 'investigation', auInv1, null,      auOrgId, 'Install proximity sensors and reversing alarms on all forklifts',     null, 'corrective', 'critical', kateId, tomId,   '2026-05-20', 'progress', 40);
  auCapaIns.run('CAPA-9101', 'investigation', auInv1, null,      auOrgId, 'Establish pedestrian exclusion zones at all loading docks',           null, 'corrective', 'critical', tomId,  sarahId, '2026-05-15', 'pending',  0);
  auCapaIns.run('CAPA-9102', 'investigation', auInv2, null,      auOrgId, 'Implement weekly scaffold inspection per AS/NZS 1576.3',              null, 'preventive', 'critical', kateId, tomId,   '2026-05-18', 'progress', 60);
  auCapaIns.run('CAPA-9103', 'investigation', auInv2, null,      auOrgId, 'Replace all scaffold guardrail clips and conduct structural audit',   null, 'corrective', 'high',     kateId, tomId,   '2026-05-25', 'pending',  0);
  auCapaIns.run('CAPA-9104', 'incident',      null,    burnIncId, auOrgId, 'Replace all chemical transfer hose couplings and test at 1.5x pressure rating', null, 'corrective', 'high', tomId, sarahId, '2026-05-22', 'pending', 0);
  auCapaIns.run('CAPA-9105', 'investigation', auInv1, null,      auOrgId, 'Traffic management plan review — all sites',                          null, 'preventive', 'high',     tomId,  sarahId, '2026-06-15', 'pending',  0);

  // =====================================================================
  // Activity log — sample entries (chain trigger auto-hashes on INSERT)
  // =====================================================================
  const auActIns = db.prepare('INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  auActIns.run(auOrgId, 'incident',     fatalityIncId, 'created',             'reported INC-2026-9200 — fatal forklift crush at Western Sydney Distribution', benId,  '2026-04-15T06:55:00');
  auActIns.run(auOrgId, 'incident',     fatalityIncId, 'safework_nsw_phone',  'SafeWork NSW phone notification — fatality at Loading dock B',                  tomId,  '2026-04-15T07:02:00');
  auActIns.run(auOrgId, 'incident',     fatalityIncId, 'safework_nsw_written','SafeWork NSW written report submitted — ref SWNSW-2026-F-04821',                tomId,  '2026-04-15T18:45:00');
  auActIns.run(auOrgId, 'investigation', auInv1,        'created',             'opened investigation INV-2026-9100 for fatal forklift incident',               tomId,  '2026-04-15T09:00:00');
  auActIns.run(auOrgId, 'incident',     spinalIncId,    'created',             'reported INC-2026-9201 — fall from scaffold, spinal injury',                    kateId, '2026-05-05T10:30:00');
  auActIns.run(auOrgId, 'incident',     spinalIncId,    'safework_nsw_phone',  'SafeWork NSW phone notification — serious injury (spinal)',                     tomId,  '2026-05-05T10:48:00');
  auActIns.run(auOrgId, 'investigation', auInv2,        'created',             'opened investigation INV-2026-9101 for scaffold fall',                          tomId,  '2026-05-05T14:00:00');
  auActIns.run(auOrgId, 'incident',     burnIncId,      'created',             'reported INC-2026-9202 — serious chemical burn, HCl splash',                    tomId,  '2026-05-08T14:20:00');
  auActIns.run(auOrgId, 'incident',     burnIncId,      'safework_nsw_phone',  'SafeWork NSW phone notification — serious injury (burn)',                       tomId,  '2026-05-08T14:35:00');
  auActIns.run(auOrgId, 'incident',     burnIncId,      'safework_nsw_written','SafeWork NSW written report submitted — ref SWNSW-2026-SI-05102',               sarahId,'2026-05-09T09:20:00');
  auActIns.run(auOrgId, 'incident',     gasIncId,       'created',             'reported INC-2026-9203 — uncontrolled gas release, Welding Bay 1',              kateId, '2026-05-10T09:40:00');
  auActIns.run(auOrgId, 'incident',     gasIncId,       'safework_nsw_phone',  'SafeWork NSW phone notification — dangerous incident (gas release)',           kateId, '2026-05-10T09:52:00');

  writeActivity({
    org_id: auOrgId,
    entity_type: 'organization',
    entity_id: auOrgId,
    action: 'org_created',
    description: `created organization ${ORG_NAME}`,
    user_id: sarahId,
    metadata: {
      org_name: ORG_NAME,
      country: 'AU',
      industry_sector: 'Manufacturing',
      compliance_frameworks: ['safework_nsw'],
      company_size: '51-200',
      founder_email: 'sarah@sdsmanager.com',
    },
  });

  console.log(`  Org id:                 ${auOrgId}`);
  console.log(`  Sites:                  2 (Sydney Manufacturing, Western Sydney Distribution)`);
  console.log(`  Users:                  4 (sarah / tom / kate / ben @ sdsmanager.com)`);
  console.log(`  Incidents:              6 (INC-2026-9200..9205)`);
  console.log(`  SafeWork notifications: 4 (NSW-2026-9101..9104)`);
  console.log(`  Investigations:         3 (INV-2026-9100..9102)`);
  console.log(`  Five-Whys entries:      5 (scaffold fall, full chain)`);
  console.log(`  CAPAs:                  6 (CAPA-9100..9105)`);
});

run();
console.log('\nDone. Log in as sarah@sdsmanager.com / password123 to view the new AU org.');
