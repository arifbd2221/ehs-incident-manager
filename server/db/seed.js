import db from './connection.js';
import bcrypt from 'bcryptjs';

const exists = db.prepare('SELECT COUNT(*) as c FROM organizations').get().c;
if (exists > 0) {
  console.log('Database already seeded. Skipping.');
  process.exit(0);
}

console.log('Seeding database...');

const orgResult = db.prepare("INSERT INTO organizations (name) VALUES ('SDS Manager Inc.')").run();
const orgId = orgResult.lastInsertRowid;

const site1 = db.prepare("INSERT INTO sites (org_id, name, country, establishment_id, naics_code, annual_avg_employees, total_hours_worked) VALUES (?, 'Cleveland Plant', 'US', '12-3456', '325199', 248, 508420)").run(orgId);
const site2 = db.prepare("INSERT INTO sites (org_id, name, country, hse_establishment_id, annual_avg_employees, total_hours_worked) VALUES (?, 'Sheffield Site', 'UK', 'HSE-12345', 120, 245000)").run(orgId);
const clevelandId = site1.lastInsertRowid;
const sheffieldId = site2.lastInsertRowid;

const pw = bcrypt.hashSync('password123', 10);
const insertUser = db.prepare('INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

const eh = insertUser.run(orgId, clevelandId, 'elena@sdsmanager.com', pw, 'Elena Hartmann', 'EH', 'ehs_manager', 'EHS', 'EHS Lead');
const mr = insertUser.run(orgId, clevelandId, 'marcus@sdsmanager.com', pw, 'Marcus Rivera', 'MR', 'supervisor', 'Operations', 'Supervisor');
const jc = insertUser.run(orgId, sheffieldId, 'james@sdsmanager.com', pw, 'James Chen', 'JC', 'ehs_manager', 'EHS', 'EHS Manager');
const dm = insertUser.run(orgId, clevelandId, 'mehta@sdsmanager.com', pw, 'Dr. Mehta', 'DM', 'ehs_officer', 'Occupational Health', 'Occupational Health Physician');

const ehId = eh.lastInsertRowid;
const mrId = mr.lastInsertRowid;
const jcId = jc.lastInsertRowid;
const dmId = dm.lastInsertRowid;

const insertInc = db.prepare(`INSERT INTO incidents (incident_number, org_id, site_id, title, type, description, incident_datetime, area, specific_location, department, severity, likelihood, consequence, track, status, reported_by, assigned_to, osha_recordable, osha_recordability_type, riddor_reportable, riddor_category, type_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

insertInc.run('INC-2026-0142', orgId, clevelandId, 'Forklift collision near loading dock', 'property', 'Forklift operator misjudged turning radius and struck a steel storage rack in Bay 3, causing structural damage to the rack and minor damage to the forklift mast.', '2026-05-02T09:42:00', 'Bay 3', 'Loading dock area', 'Logistics', 2, 1, 3, 'A', 'Investigating', mrId, mrId, 1, 'days_away', 0, null, '{}');

insertInc.run('INC-2026-0141', orgId, clevelandId, 'Chemical splash to forearm — IPA 70%', 'injury', 'Lab technician was decanting isopropyl alcohol from a 5L bottle into a wash bottle. A small splash of IPA hit the back of the right forearm. PPE in use included nitrile gloves and safety glasses, but the lab coat sleeve was rolled up.', '2026-05-02T08:18:00', 'Lab 2', 'Fume hood 3', 'QC Lab', 2, 1, 3, 'A', 'Investigating', ehId, ehId, 1, 'other_recordable', 0, null, '{"injured_person":{"name":"Priya Singh","job_title":"Lab technician II","department":"QC Lab"},"body_parts":["rArm"],"injury_type":"Chemical burn — 1st degree","mechanism":"Contact with chemical substance","object_substance":"Isopropyl alcohol 70% (CAS 67-63-0)","treatment":["Medical treatment"],"ppe":["Gloves","Goggles"]}');

insertInc.run('INC-2026-0140', orgId, sheffieldId, 'Slip on spilled coolant — no injury', 'nearmiss', 'Operator slipped on spilled coolant near CNC machine #7. Caught balance on nearby workbench. Coolant had leaked from a loose hose connection.', '2026-05-01T16:55:00', 'CNC area', null, 'Production', 3, 2, 2, 'B', 'Awaiting CAPA', jcId, jcId, 0, null, 0, null, '{}');

insertInc.run('INC-2026-0139', orgId, sheffieldId, 'Compressed-air hose burst', 'dangerous', 'A compressed-air hose in the maintenance bay burst at a coupling joint, releasing pressurized air at approximately 8 bar. No personnel were within 3 meters at the time of the failure.', '2026-05-01T14:02:00', 'Maintenance bay', null, 'Maintenance', 1, 0, 4, 'A', 'Investigating', jcId, jcId, 0, null, 1, 'dangerous_occurrence', '{}');

insertInc.run('INC-2026-0138', orgId, clevelandId, 'Eye irritation reported after solvent use', 'illness', 'Painter reported eye irritation and mild tearing after working in the paint booth for 3 hours. Ventilation fan was set to low instead of high.', '2026-05-01T11:30:00', 'Paint booth', null, 'Production', 3, 2, 2, 'B', 'Investigating', ehId, ehId, 1, 'other_recordable', 0, null, '{}');

insertInc.run('INC-2026-0137', orgId, clevelandId, '20L solvent spill — contained on-site', 'env', 'Approximately 20 liters of toluene leaked from a cracked container in solvent storage. Spill was contained within the secondary containment berm. No release to environment.', '2026-04-30T17:20:00', 'Solvent storage', null, 'Warehouse', 3, 2, 2, 'B', 'Investigating', mrId, mrId, 0, null, 0, null, '{}');

insertInc.run('INC-2026-0136', orgId, sheffieldId, 'Missing machine guard on grinder #4', 'unsafe', 'During routine safety inspection, the belt guard on bench grinder #4 was found to be missing. The guard had been removed for maintenance and not replaced.', '2026-04-30T14:07:00', 'Workshop B', null, 'Maintenance', 2, 1, 3, 'A', 'Investigating', jcId, jcId, 0, null, 0, null, '{}');

insertInc.run('INC-2026-0135', orgId, clevelandId, 'Worker observed lifting without proper form', 'observation', 'Self-reported observation. Worker in receiving was lifting boxes from pallet to shelf without bending knees or using available mechanical lift.', '2026-04-30T10:15:00', 'Receiving', null, 'Warehouse', 5, 4, 0, 'C', 'Closed', ehId, null, 0, null, 0, null, '{}');

insertInc.run('INC-2026-0134', orgId, clevelandId, 'Paper cut on packaging blade', 'injury', 'Worker sustained a minor paper cut on left index finger while handling corrugated packaging material. First aid administered on-site.', '2026-04-29T13:40:00', 'Shipping', null, 'Logistics', 5, 4, 0, 'C', 'Closed', ehId, null, 0, 'first_aid', 0, null, '{}');

// Investigations
const insertInv = db.prepare('INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, status, track, findings, root_cause_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

const inv1 = insertInv.run('INV-2026-0078', 2, orgId, ehId, 'progress', 'A', 'The immediate cause was an unsafe decanting practice (no funnel, working outside fume hood). Contributing factors include unclear SOP, missing engineering control (no dedicated refill station), and lapsed SOP review cadence.', 'Lab SOP review cadence is annual but lapsed during 2020-2022; no automated reminder exists in QMS.');
const inv2 = insertInv.run('INV-2026-0077', 4, orgId, jcId, 'progress', 'A', null, null);
const inv3 = insertInv.run('INV-2026-0076', 7, orgId, jcId, 'progress', 'A', null, null);
const inv4 = insertInv.run('INV-2026-0075', 6, orgId, mrId, 'progress', 'B', null, null);
const inv5 = insertInv.run('INV-2026-0073', 3, orgId, jcId, 'capa', 'B', null, null);
const inv6 = insertInv.run('INV-2026-0079', 1, orgId, null, 'pending', 'A', null, null);
const inv7 = insertInv.run('INV-2026-0080', 5, orgId, null, 'pending', 'B', null, null);

// 5-Whys for INC-0141 investigation
const insertWhy = db.prepare('INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by) VALUES (?, ?, ?, ?, ?, ?)');
insertWhy.run(inv1.lastInsertRowid, 1, 'Why did the splash occur?', 'IPA splashed onto forearm during decanting from 5L bottle.', 0, ehId);
insertWhy.run(inv1.lastInsertRowid, 2, 'Why did IPA splash during decanting?', 'Bottle was tipped too quickly without funnel; technician was working at desk height, not in the fume hood.', 0, ehId);
insertWhy.run(inv1.lastInsertRowid, 3, 'Why was the technician decanting outside the fume hood?', 'Wash bottle was stored at the bench, and procedure does not specify location for refill.', 0, ehId);
insertWhy.run(inv1.lastInsertRowid, 4, 'Why does the SOP not specify a refill location?', 'SOP was last updated in 2019 before the new wash-bottle workflow was introduced.', 0, ehId);
insertWhy.run(inv1.lastInsertRowid, 5, 'Why has the SOP not been reviewed since 2019?', 'Lab SOP review cadence is annual but lapsed during 2020-2022; no automated reminder exists in QMS.', 1, ehId);

// Investigation teams
const insertTeam = db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)');
insertTeam.run(inv1.lastInsertRowid, ehId, 'lead');
insertTeam.run(inv1.lastInsertRowid, mrId, 'member');
insertTeam.run(inv1.lastInsertRowid, dmId, 'occ_health');
insertTeam.run(inv2.lastInsertRowid, jcId, 'lead');

// CAPAs
const insertCapa = db.prepare('INSERT INTO capas (capa_number, investigation_id, org_id, title, type, priority, owner_id, verifier_id, due_date, status, progress) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

insertCapa.run('CAPA-048', inv1.lastInsertRowid, orgId, 'Audit chemical-decanting workflow across all labs', 'preventive', 'high', jcId, ehId, '2026-05-30', 'pending', 0);
insertCapa.run('CAPA-047', inv1.lastInsertRowid, orgId, 'Procure splash-resistant face shields for Lab 2', 'corrective', 'high', mrId, jcId, '2026-05-12', 'pending', 0);
insertCapa.run('CAPA-046', inv1.lastInsertRowid, orgId, 'Add automated annual SOP-review reminder to QMS', 'preventive', 'medium', jcId, ehId, '2026-05-15', 'verify', 100);
insertCapa.run('CAPA-045', inv1.lastInsertRowid, orgId, 'Install dedicated wash-bottle refill station in Lab 2', 'corrective', 'high', mrId, ehId, '2026-05-22', 'progress', 20);
insertCapa.run('CAPA-044', inv1.lastInsertRowid, orgId, 'Update SOP-LAB-014 to require funnel + fume-hood for IPA decanting', 'corrective', 'critical', ehId, mrId, '2026-05-08', 'progress', 65);
insertCapa.run('CAPA-039', inv3.lastInsertRowid, orgId, 'Replace damaged guard on grinder #4', 'corrective', 'high', jcId, mrId, '2026-04-20', 'verify', 100);
insertCapa.run('CAPA-038', inv5.lastInsertRowid, orgId, 'Retrain shift on lock-out / tag-out procedure', 'preventive', 'high', mrId, ehId, '2026-04-28', 'progress', 80);
insertCapa.run('CAPA-037', inv3.lastInsertRowid, orgId, 'Re-stripe pedestrian lanes in loading dock', 'corrective', 'medium', mrId, jcId, '2026-05-12', 'progress', 45);
insertCapa.run('CAPA-035', inv3.lastInsertRowid, orgId, 'Replace torn anti-fatigue mats at packing line 2', 'corrective', 'low', ehId, mrId, '2026-04-24', 'closed', 100);
insertCapa.run('CAPA-034', inv3.lastInsertRowid, orgId, 'Add wheel chocks to all dock doors', 'preventive', 'medium', mrId, jcId, '2026-04-18', 'closed', 100);

// OSHA 300 Log entries
const insertOsha = db.prepare('INSERT INTO osha_300_log (org_id, site_id, incident_id, calendar_year, case_number, employee_name, job_title, injury_date, location, description, classification_death, classification_days_away, classification_job_transfer, classification_other, days_away_count, days_restricted_count, injury_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

insertOsha.run(orgId, clevelandId, 2, 2026, 12, 'Singh, P.', 'Lab tech II', '2026-05-01', 'Lab 2', 'Chemical burn 1° · R forearm · IPA 70%', 0, 0, 0, 1, 0, 2, 'injury');
insertOsha.run(orgId, clevelandId, 1, 2026, 11, 'Reyes, C.', 'Forklift op', '2026-05-02', 'Bay 3', 'Concussion · head · steel rack', 0, 1, 0, 0, 3, 0, 'injury');
insertOsha.run(orgId, clevelandId, 5, 2026, 10, 'Tran, A.', 'Painter', '2026-05-01', 'Paint booth', 'Eye irritation · L eye · solvent vapor', 0, 0, 1, 0, 0, 1, 'respiratory');

// RIDDOR report
db.prepare("INSERT INTO riddor_reports (riddor_number, org_id, site_id, incident_id, event_date, category, description, hse_ref, phone_notified_at, status, written_deadline) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
  'RDR-2026-003', orgId, sheffieldId, 4, '2026-05-01', 'dangerous_occurrence', 'Compressed-air hose burst — Sheffield Site', 'HSE-2026-29841', '2026-05-01T14:30:00', 'phone_reported', '2026-05-11'
);

// Notifications
const insertNotif = db.prepare('INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)');
insertNotif.run(orgId, 'riddor_immediate', 4, 'RIDDOR — immediate phone report required', 'Compressed-air hose burst (Sheffield Site) classified as Dangerous Occurrence. Phone HSE without delay.', 'err', '2026-05-11T14:02:00');
insertNotif.run(orgId, 'osha_24hr', 1, 'OSHA 24-hour report', 'Forklift collision resulted in driver hospitalization. Report to OSHA Area Office.', 'warn', '2026-05-03T09:42:00');

// Activity log
const insertAct = db.prepare('INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
insertAct.run(orgId, 'incident', 1, 'classified', 'classified INC-2026-0142 as Sev 2 · routed to Track A', mrId, '2026-05-02T10:00:00');
insertAct.run(orgId, 'investigation', inv1.lastInsertRowid, 'created', 'opened investigation INV-2026-0078', ehId, '2026-05-02T09:00:00');
insertAct.run(orgId, 'system', null, 'notification', 'fired RIDDOR notification reminder for INC-2026-0139', null, '2026-05-02T08:00:00');
insertAct.run(orgId, 'capa', 9, 'verified', 'closed CAPA-039 — verified by E. Hartmann', jcId, '2026-05-01T16:00:00');
insertAct.run(orgId, 'incident', 8, 'auto_closed', 'auto-routed INC-2026-0135 to Track C and closed', null, '2026-04-30T10:20:00');

console.log('Seed complete.');
console.log('Demo users:');
console.log('  elena@sdsmanager.com / password123 (EHS Lead)');
console.log('  marcus@sdsmanager.com / password123 (Supervisor)');
console.log('  james@sdsmanager.com / password123 (EHS Manager)');
console.log('  mehta@sdsmanager.com / password123 (Occ. Health)');

process.exit(0);
