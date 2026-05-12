// server/scripts/populate-sdsmanager-au.js
//
// Consolidates the SafeWork NSW demo under SDS Manager Inc. (org_id=1):
//   1. Adds a Sydney Manufacturing site (AU) to SDS Manager Inc.
//   2. Moves sarah@sdsmanager.com into SDS Manager Inc., assigned to that site
//   3. Seeds 6 AU incidents, 4 SafeWork NSW notifications, 3 investigations,
//      5-Whys, 6 CAPAs, work hours, assets, and activity log entries — all
//      under org_id=1.
//
// Numbers use the INC-2026-93xx / NSW-2026-92xx / INV-2026-92xx / CAPA-92xx
// ranges so nothing collides with the existing data in either org.
//
// Idempotent: if a site named "Sydney Manufacturing — AU" already exists in
// org_id=1, exits without changes. Harbour Safety Solutions (org_id=9) is
// left intact.
//
// Run from server/:
//   node scripts/populate-sdsmanager-au.js

import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';

const ORG_ID = 1;
const AU_SITE_NAME = 'Sydney Manufacturing — AU';

const exists = db.prepare(
  'SELECT id FROM sites WHERE org_id = ? AND name = ?'
).get(ORG_ID, AU_SITE_NAME);

if (exists) {
  console.log(`AU site already present in SDS Manager Inc. (id=${exists.id}). Skipping.`);
  process.exit(0);
}

const sarah = db.prepare(
  "SELECT id, org_id FROM users WHERE email = 'sarah@sdsmanager.com'"
).get();
if (!sarah) {
  console.error('User sarah@sdsmanager.com not found. Run populate-safework-nsw-demo.js first.');
  process.exit(1);
}

const elena  = db.prepare("SELECT id FROM users WHERE email = 'elena@sdsmanager.com'").get();
const james  = db.prepare("SELECT id FROM users WHERE email = 'james@sdsmanager.com'").get();
const marcus = db.prepare("SELECT id FROM users WHERE email = 'marcus@sdsmanager.com'").get();
const priya  = db.prepare("SELECT id FROM users WHERE email = 'priya@sdsmanager.com'").get();
if (!elena || !james || !marcus || !priya) {
  console.error('Required SDS Manager Inc. users missing (elena/james/marcus/priya).');
  process.exit(1);
}

console.log('Consolidating AU SafeWork NSW demo under SDS Manager Inc. (org_id=1)...');

const run = db.transaction(() => {
  // -------------------------------------------------------------------------
  // 1. AU site under SDS Manager Inc.
  // -------------------------------------------------------------------------
  const sydneyId = db.prepare(
    `INSERT INTO sites (org_id, name, country, annual_avg_employees, total_hours_worked, timezone)
     VALUES (?, ?, 'AU', 85, 174200, 'Australia/Sydney')`
  ).run(ORG_ID, AU_SITE_NAME).lastInsertRowid;

  // -------------------------------------------------------------------------
  // 2. Move sarah into SDS Manager Inc., assigned to the AU site
  // -------------------------------------------------------------------------
  db.prepare('UPDATE users SET org_id = ?, site_id = ? WHERE id = ?')
    .run(ORG_ID, sydneyId, sarah.id);

  // -------------------------------------------------------------------------
  // 3. Assets at the AU site
  // -------------------------------------------------------------------------
  const assetIns = db.prepare(
    `INSERT INTO assets (asset_number, org_id, site_id, name, asset_type, location_description, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  let auN = 9200;
  const auNext = () => `AST-2026-${String(++auN).padStart(5, '0')}`;
  const scaffold   = assetIns.run(auNext(), ORG_ID, sydneyId, 'Scaffold Bay 2',     'building', 'Assembly area — Bay 2', null).lastInsertRowid;
  const weldBay    = assetIns.run(auNext(), ORG_ID, sydneyId, 'Welding Bay 1',      'building', 'Fabrication area',      null).lastInsertRowid;
  const auForklift = assetIns.run(auNext(), ORG_ID, sydneyId, 'Forklift FL-AU-1',   'vehicle',  'Loading dock',          'TCM-FLAU1-90044').lastInsertRowid;
  assetIns.run(auNext(), ORG_ID, sydneyId, 'Chemical Store Room 1', 'building', 'East wing',        null);
  assetIns.run(auNext(), ORG_ID, sydneyId, 'Overhead crane #3',     'machine',  'Fabrication area', 'KONE-3-2021');

  // -------------------------------------------------------------------------
  // 4. Work hours — 18 months, TRIR/DART denominator
  // -------------------------------------------------------------------------
  const whIns = db.prepare(
    `INSERT INTO work_hours (site_id, period_start, period_end, hours_worked, avg_employees, entered_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const today = new Date();
  for (let i = 17; i >= 0; i--) {
    const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const end   = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    const variance = Math.round((Math.random() - 0.5) * 0.08 * 14500);
    whIns.run(sydneyId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), 14500 + variance, 85, sarah.id);
  }

  // -------------------------------------------------------------------------
  // 5. Incidents — covers s.35(a) / s.35(b) / s.35(c)
  // -------------------------------------------------------------------------
  const incIns = db.prepare(`
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
  const fatalityIncId = incIns.run(
    'INC-2026-9300', ORG_ID, sydneyId,
    'Fatal forklift crush — Loading dock',
    'injury',
    'Worker struck and pinned by reversing forklift at Loading dock. Emergency services attended. Worker pronounced deceased at scene. SafeWork NSW inspector attended and preserved the site under s.39.',
    '2026-04-15T06:45:00', 'Loading dock', 'Racking aisle 3', 'Warehouse', auForklift,
    1, 0, 4, 'A',
    'Investigating', sarah.id, 0, 1, null,
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

  // (2) s.35(b) SERIOUS INJURY — fall from scaffold, spinal injury
  const spinalIncId = incIns.run(
    'INC-2026-9301', ORG_ID, sydneyId,
    'Fall from scaffold — spinal injury',
    'injury',
    'Worker fell approximately 3.2m from scaffold platform in Bay 2 when guardrail detached. Worker landed on concrete floor, unable to move lower limbs. Ambulance transported to Royal Prince Alfred Hospital. Admitted as in-patient with suspected spinal injury.',
    '2026-05-05T10:20:00', 'Assembly area', 'Bay 2 scaffold platform', 'Production', scaffold,
    1, 0, 4, 'A',
    'Investigating', sarah.id, 0, 0, null,
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

  // (3) s.35(b) SERIOUS INJURY — chemical burn requiring hospitalisation
  const burnIncId = incIns.run(
    'INC-2026-9302', ORG_ID, sydneyId,
    'Serious chemical burn — hydrochloric acid splash',
    'injury',
    "During transfer of hydrochloric acid from IBC to process tank, hose coupling failed spraying acid onto worker's left arm and torso. Emergency shower used for 20 minutes. Worker transported to Concord Hospital burns unit for treatment as in-patient.",
    '2026-05-08T14:10:00', 'Chemical store', 'Transfer bay', 'Production', null,
    1, 0, 4, 'A',
    'Investigating', sarah.id, 0, 0, null,
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

  // (4) s.35(c) DANGEROUS INCIDENT — uncontrolled gas release
  const gasIncId = incIns.run(
    'INC-2026-9303', ORG_ID, sydneyId,
    'Uncontrolled argon/CO₂ gas release — Welding Bay 1',
    'dangerous',
    'Manifold regulator failed on argon/CO₂ shielding gas supply causing uncontrolled release into welding bay. Oxygen monitoring alarm activated. Bay evacuated — no injuries. Gas supply isolated at bulk tank.',
    '2026-05-10T09:35:00', 'Fabrication area', 'Welding Bay 1', 'Production', weldBay,
    2, 1, 3, 'A',
    'Investigating', sarah.id, 0, 0, null,
    '[]', null,
    0, null, null, null, 0, null,
    JSON.stringify({}),
    'Gas isolated at bulk tank, bay ventilated, atmospheric monitoring confirmed safe before re-entry.',
    null, null,
  ).lastInsertRowid;

  // (5) Near miss — forklift / pedestrian
  incIns.run(
    'INC-2026-9304', ORG_ID, sydneyId,
    'Forklift near miss with pedestrian — Loading dock',
    'nearmiss',
    'Forklift reversed without sounding horn at Loading dock. Pedestrian worker stepped back in time to avoid contact. No barriers or exclusion zones marked at the dock entrance.',
    '2026-05-11T15:50:00', 'Loading dock', null, 'Warehouse', null,
    3, 2, 2, 'B',
    'New', sarah.id, 0, 0, null,
    '[]', null,
    0, null, null, null, 0, null,
    '{}', null, null, null,
  );

  // (6) Track C auto-close — minor first-aid
  incIns.run(
    'INC-2026-9305', ORG_ID, sydneyId,
    'Minor cut — hand laceration during deburring',
    'injury',
    'Worker sustained superficial cut to left index finger while deburring aluminium panel. First aid applied on site — adhesive bandage.',
    '2026-04-28T11:15:00', 'Fabrication area', 'Deburring station', 'Production', null,
    5, 4, 0, 'C',
    'Closed', sarah.id, 0, 0, null,
    '["l_hand"]', null,
    0, 'first_aid', null, null, 0, null,
    JSON.stringify({ injured_person: { name: 'Jake Williams' }, treatment: ['First aid only'] }),
    null,
    '2026-04-28T12:00:00', 'Auto-closed (Track C)',
  );

  // -------------------------------------------------------------------------
  // 6. SafeWork NSW notifications (NSW-2026-92xx)
  // -------------------------------------------------------------------------
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

  nswIns.run(
    'NSW-2026-9201', fatalityIncId, ORG_ID, sydneyId, '2026-04-15',
    1, 0, 0, '[]', '[]',
    'released_by_inspector',
    'SafeWork NSW inspector attended 2026-04-15 08:30. Site released 2026-04-16 16:00 after forensic examination.',
    '2026-04-15T08:30:00',
    '2026-04-15T07:02:00', sarah.id, 'SafeWork NSW — Parramatta',
    'Phone notification made immediately. Spoke with duty officer. Reference provided.',
    '2026-04-15T07:02:00', '2026-04-17T07:02:00',
    '2026-04-15T18:45:00', sarah.id, 'SWNSW-2026-F-04821',
    'Written report submitted same day via SafeWork NSW online portal.',
    'SDS Manager Inc. (Australia)', '51 628 473 190', '2292',
    sarah.id,
    'SDS Manager Australia', '14 Industrial Ave, Sydney NSW 2000', 85,
  );

  nswIns.run(
    'NSW-2026-9202', spinalIncId, ORG_ID, sydneyId, '2026-05-05',
    0, 1, 0,
    JSON.stringify(['s36_a_inpatient_hospital', 's36_b_vi_spinal_injury']),
    '[]',
    'preserved',
    'Scaffold quarantined, access restricted with barrier tape. Awaiting inspector.',
    null,
    '2026-05-05T10:48:00', sarah.id, 'SafeWork NSW — Sydney CBD',
    'Phoned SafeWork immediately. Inspector scheduled for next business day.',
    '2026-05-05T10:48:00', '2026-05-07T10:48:00',
    null, null, null,
    'Written report overdue — regulator follow-up expected.',
    'SDS Manager Inc. (Australia)', '51 628 473 190', '2292',
    sarah.id,
    'SDS Manager Australia', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  nswIns.run(
    'NSW-2026-9203', burnIncId, ORG_ID, sydneyId, '2026-05-08',
    0, 1, 0,
    JSON.stringify(['s36_a_inpatient_hospital', 's36_b_iv_serious_burn']),
    '[]',
    'disturbed_to_make_safe',
    'Acid spill neutralised and cleaned for safety under s.39(3)(c). Hose coupling retained as evidence.',
    null,
    '2026-05-08T14:35:00', sarah.id, 'SafeWork NSW — Sydney CBD',
    'Phone notification within 25 minutes of incident.',
    '2026-05-08T14:35:00', '2026-05-10T14:35:00',
    '2026-05-09T09:20:00', sarah.id, 'SWNSW-2026-SI-05102',
    'Written report submitted next morning. Included photos of failed coupling.',
    'SDS Manager Inc. (Australia)', '51 628 473 190', '2292',
    sarah.id,
    'SDS Manager Australia', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  nswIns.run(
    'NSW-2026-9204', gasIncId, ORG_ID, sydneyId, '2026-05-10',
    0, 0, 1,
    '[]',
    JSON.stringify(['s37_c_uncontrolled_gas_or_steam']),
    'preserved',
    'Welding bay cordoned off. Gas manifold isolated. Awaiting regulator direction.',
    null,
    '2026-05-10T09:52:00', sarah.id, 'SafeWork NSW — Sydney CBD',
    'Phoned SafeWork within 20 minutes. No injuries reported.',
    null, null,
    null, null, null, null,
    'SDS Manager Inc. (Australia)', '51 628 473 190', '2292',
    sarah.id,
    'SDS Manager Australia', '8 Botany Rd, Mascot NSW 2020', 85,
  );

  // -------------------------------------------------------------------------
  // 7. Notifications (regulatory alerts panel)
  // -------------------------------------------------------------------------
  const notifIns = db.prepare('INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)');
  notifIns.run(ORG_ID, 'safework_nsw_immediate',       fatalityIncId, 'SafeWork NSW — fatality notification',          'Fatal forklift crush at Sydney Manufacturing. Phone notification completed. Written report submitted.',           'err',  null);
  notifIns.run(ORG_ID, 'safework_nsw_written_overdue', spinalIncId,   'SafeWork NSW — written report OVERDUE',         'Scaffold fall — spinal injury (Sydney Manufacturing). Written report was due 2026-05-07. Submit immediately.', 'err',  '2026-05-07T10:48:00');
  notifIns.run(ORG_ID, 'safework_nsw_immediate',       gasIncId,      'SafeWork NSW — dangerous incident notification', 'Uncontrolled gas release in Welding Bay 1. Phone notification completed. Site preserved.',                      'warn', null);

  // -------------------------------------------------------------------------
  // 8. Investigations + 5-Whys
  // -------------------------------------------------------------------------
  const invIns = db.prepare(
    'INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, status, track, findings, root_cause_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const inv1 = invIns.run(
    'INV-2026-9200', fatalityIncId, ORG_ID, sarah.id, 'progress', 'A',
    'Preliminary: forklift reversed without spotter in confined dock area. CCTV shows no audible reversing alarm. Pedestrian exclusion zone not established.',
    null,
  ).lastInsertRowid;
  const inv2 = invIns.run(
    'INV-2026-9201', spinalIncId, ORG_ID, sarah.id, 'progress', 'A',
    'Scaffold guardrail found detached at two connection points. Inspection records show last scaffold check was 6 weeks prior (should be weekly per AS/NZS 1576).',
    'Scaffold inspection regime non-compliant with AS/NZS 1576.3 requirements for regular inspection.',
  ).lastInsertRowid;
  const inv3 = invIns.run(
    'INV-2026-9202', burnIncId, ORG_ID, elena.id, 'pending', 'A', null, null,
  ).lastInsertRowid;

  const whyIns = db.prepare(
    'INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  );
  whyIns.run(inv2, 1, 'Why did the worker fall?',                        'Guardrail on scaffold platform detached when worker leaned against it.',                                       0, sarah.id);
  whyIns.run(inv2, 2, 'Why did the guardrail detach?',                   'Two of four connection clips were missing; remaining two had corroded threads.',                              0, sarah.id);
  whyIns.run(inv2, 3, 'Why were connection clips missing and corroded?', 'Last scaffold inspection was 6 weeks ago; defects were not identified.',                                     0, sarah.id);
  whyIns.run(inv2, 4, 'Why was the inspection 6 weeks overdue?',         'No scheduled inspection regime in place; inspections were ad-hoc.',                                          0, sarah.id);
  whyIns.run(inv2, 5, 'Why was there no scheduled inspection regime?',   'AS/NZS 1576.3 weekly inspection requirement was not incorporated into the site WHS management system.',     1, sarah.id);

  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv1, sarah.id, 'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv1, elena.id, 'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv2, sarah.id, 'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv2, marcus.id, 'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv3, elena.id, 'lead');

  // -------------------------------------------------------------------------
  // 9. CAPAs — owner ≠ verifier (DB trigger enforces)
  // -------------------------------------------------------------------------
  const capaIns = db.prepare(`
    INSERT INTO capas (capa_number, source_type, investigation_id, incident_id, org_id, title, description, type, priority, owner_id, verifier_id, due_date, status, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  capaIns.run('CAPA-9200', 'investigation', inv1, null,      ORG_ID, 'Install proximity sensors and reversing alarms on all forklifts',     null, 'corrective', 'critical', sarah.id,  elena.id,  '2026-05-20', 'progress', 40);
  capaIns.run('CAPA-9201', 'investigation', inv1, null,      ORG_ID, 'Establish pedestrian exclusion zones at all loading docks',           null, 'corrective', 'critical', elena.id,  sarah.id,  '2026-05-15', 'pending',  0);
  capaIns.run('CAPA-9202', 'investigation', inv2, null,      ORG_ID, 'Implement weekly scaffold inspection per AS/NZS 1576.3',              null, 'preventive', 'critical', sarah.id,  james.id,  '2026-05-18', 'progress', 60);
  capaIns.run('CAPA-9203', 'investigation', inv2, null,      ORG_ID, 'Replace all scaffold guardrail clips and conduct structural audit',   null, 'corrective', 'high',     marcus.id, sarah.id,  '2026-05-25', 'pending',  0);
  capaIns.run('CAPA-9204', 'incident',      null,  burnIncId, ORG_ID, 'Replace all chemical transfer hose couplings and test at 1.5x pressure rating', null, 'corrective', 'high', sarah.id, elena.id, '2026-05-22', 'pending', 0);
  capaIns.run('CAPA-9205', 'investigation', inv1, null,      ORG_ID, 'Traffic management plan review — all sites',                          null, 'preventive', 'high',     james.id,  sarah.id,  '2026-06-15', 'pending',  0);

  // -------------------------------------------------------------------------
  // 10. Activity log — chain trigger auto-hashes into org=1 chain
  // -------------------------------------------------------------------------
  const actIns = db.prepare('INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  actIns.run(ORG_ID, 'incident',      fatalityIncId, 'created',              'reported INC-2026-9300 — fatal forklift crush at Sydney Manufacturing',         sarah.id, '2026-04-15T06:55:00');
  actIns.run(ORG_ID, 'incident',      fatalityIncId, 'safework_nsw_phone',   'SafeWork NSW phone notification — fatality at Loading dock',                     sarah.id, '2026-04-15T07:02:00');
  actIns.run(ORG_ID, 'incident',      fatalityIncId, 'safework_nsw_written', 'SafeWork NSW written report submitted — ref SWNSW-2026-F-04821',                 sarah.id, '2026-04-15T18:45:00');
  actIns.run(ORG_ID, 'investigation', inv1,          'created',              'opened investigation INV-2026-9200 for fatal forklift incident',                sarah.id, '2026-04-15T09:00:00');
  actIns.run(ORG_ID, 'incident',      spinalIncId,   'created',              'reported INC-2026-9301 — fall from scaffold, spinal injury',                    sarah.id, '2026-05-05T10:30:00');
  actIns.run(ORG_ID, 'incident',      spinalIncId,   'safework_nsw_phone',   'SafeWork NSW phone notification — serious injury (spinal)',                     sarah.id, '2026-05-05T10:48:00');
  actIns.run(ORG_ID, 'investigation', inv2,          'created',              'opened investigation INV-2026-9201 for scaffold fall',                          sarah.id, '2026-05-05T14:00:00');
  actIns.run(ORG_ID, 'incident',      burnIncId,     'created',              'reported INC-2026-9302 — serious chemical burn, HCl splash',                    sarah.id, '2026-05-08T14:20:00');
  actIns.run(ORG_ID, 'incident',      burnIncId,     'safework_nsw_phone',   'SafeWork NSW phone notification — serious injury (burn)',                       sarah.id, '2026-05-08T14:35:00');
  actIns.run(ORG_ID, 'incident',      burnIncId,     'safework_nsw_written', 'SafeWork NSW written report submitted — ref SWNSW-2026-SI-05102',               sarah.id, '2026-05-09T09:20:00');
  actIns.run(ORG_ID, 'incident',      gasIncId,      'created',              'reported INC-2026-9303 — uncontrolled gas release, Welding Bay 1',              sarah.id, '2026-05-10T09:40:00');
  actIns.run(ORG_ID, 'incident',      gasIncId,      'safework_nsw_phone',   'SafeWork NSW phone notification — dangerous incident (gas release)',           sarah.id, '2026-05-10T09:52:00');

  writeActivity({
    org_id: ORG_ID,
    entity_type: 'site',
    entity_id: sydneyId,
    action: 'site_created',
    description: `Created AU site "${AU_SITE_NAME}"`,
    user_id: priya.id,
    metadata: { country: 'AU', timezone: 'Australia/Sydney', framework: 'safework_nsw' },
  });
  writeActivity({
    org_id: ORG_ID,
    entity_type: 'user',
    entity_id: sarah.id,
    action: 'user_moved',
    description: 'Sarah Mitchell transferred to SDS Manager Inc. as AU site lead',
    user_id: priya.id,
    metadata: { from_org_id: sarah.org_id, to_org_id: ORG_ID, site_id: sydneyId },
  });

  console.log(`  AU site:           ${AU_SITE_NAME} (id=${sydneyId})`);
  console.log(`  Moved user:        sarah@sdsmanager.com → org=${ORG_ID}, site=${sydneyId}`);
  console.log(`  Assets:            5`);
  console.log(`  Work-hours rows:   18 (18 months at ~14,500 hrs/mo)`);
  console.log(`  Incidents:         6 (INC-2026-9300..9305)`);
  console.log(`  Notifications:     4 (NSW-2026-9201..9204)`);
  console.log(`  Investigations:    3 (INV-2026-9200..9202)`);
  console.log(`  Five-Whys:         5 (scaffold fall chain)`);
  console.log(`  CAPAs:             6 (CAPA-9200..9205)`);
  console.log(`  Activity log:      14 entries (auto-hashed into org=1 chain)`);
});

run();
console.log('\nDone. Log in as sarah@sdsmanager.com (or priya/elena) to demo the SafeWork NSW workflow from SDS Manager Inc.');
