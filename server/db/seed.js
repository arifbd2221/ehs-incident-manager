// server/db/seed.js — Wave 6 demo seed.
//
// Drops a populated dev DB if SEED_FORCE=1 is set, otherwise skips so a
// developer's click-through state survives a re-run. Wraps everything in a
// single transaction so a partial failure rolls back cleanly.
//
// Covers the 10 demo beats from plan-phase-2.md §2:
//   1. Auto-classification (incidents have likelihood/consequence + reasoning)
//   2. Active stop-work (red banner on first paint)
//   3. OSHA 300 live (recordable incidents have 300_log rows)
//   4. CAPA verifier rule (existing trigger; CAPAs in seed have owner != verifier)
//   5. Anonymous near-miss (reported_by NULL)
//   6. Live TRIR/DART (24 months of work_hours per site)
//   7. EHS recordability verification (one incident already verified)
//   8. AI voice intake (one voice_extractions row tied to an incident)
//   9. Trending — 3 incidents at Press 4
//  10. Investigation Kanban + auto-close (Track C incidents auto-closed)
//
// Phase 2 W6 T6.2 + T6.3.

import db from './connection.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads');
mkdirSync(uploadDir, { recursive: true });

// Build a valid 1-page PDF with `title` rendered as text. xref offsets are
// computed from real byte lengths so PDF readers accept it.
function makeMinimalPdf(title) {
  const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const stream = `BT /F1 14 Tf 50 720 Td (${escape(title)}) Tj ET\n`;
  const objs = [
    null,
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  const chunks = [Buffer.from('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n', 'binary')];
  const offsets = [0];
  let pos = chunks[0].length;
  for (let i = 1; i < objs.length; i++) {
    offsets.push(pos);
    const c = Buffer.from(`${i} 0 obj\n${objs[i]}\nendobj\n`, 'binary');
    chunks.push(c);
    pos += c.length;
  }
  const xrefStart = pos;
  let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, 'binary'));
  return Buffer.concat(chunks);
}

function writeSeedPdf(title) {
  const filename = `${crypto.randomUUID()}.pdf`;
  const buf = makeMinimalPdf(title);
  writeFileSync(join(uploadDir, filename), buf);
  return { filename, size: buf.length };
}

const force = process.env.SEED_FORCE === '1';
const exists = db.prepare('SELECT COUNT(*) as c FROM organizations').get().c;
if (exists > 0 && !force) {
  console.log('Database already seeded. Skipping (set SEED_FORCE=1 to wipe + reseed).');
  process.exit(0);
}

if (force && exists > 0) {
  console.log('SEED_FORCE=1 — wiping existing data...');
  // Toggle FKs OFF for the wipe so we don't have to discover the perfect
  // delete order — every table that holds user data gets cleared atomically.
  // Schema-level tables (_schema_migrations, risk_matrix_cells) are kept
  // because they're managed by the migration runner, not by seed data.
  db.pragma('foreign_keys = OFF');
  const wipeOrder = [
    'regulatory_submissions', 'regulatory_certifications',
    'voice_extractions', 'activity_log', 'notifications',
    'riddor_reports', 'osha_300_log', 'severity_history',
    'capas', 'five_whys', 'investigation_team', 'investigations',
    'attachments', 'witnesses', 'entity_links', 'documents', 'document_folders',
    'incidents', 'work_hours', 'assets',
    'asset_categories',
    'users', 'sites', 'organizations',
  ];
  for (const t of wipeOrder) {
    try {
      db.prepare(`DELETE FROM ${t}`).run();
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(t);
    } catch (e) {
      // A real failure here would point to a missing table — log and continue
      // (the seed itself will fail loud if a critical table is gone).
      console.warn(`  warning wiping ${t}: ${e.message}`);
    }
  }
  db.pragma('foreign_keys = ON');
}

console.log('Seeding database...');

db.transaction(() => {
  // ----- Organization -----
  const orgId = db.prepare("INSERT INTO organizations (name) VALUES ('SDS Manager Inc.')").run().lastInsertRowid;

  // ----- Sites — three so the dashboard has multi-site rollup -----
  const clevelandId = db.prepare(
    `INSERT INTO sites (org_id, name, country, establishment_id, naics_code, annual_avg_employees, total_hours_worked)
     VALUES (?, 'Cleveland Plant', 'US', '12-3456', '325199', 248, 508420)`
  ).run(orgId).lastInsertRowid;
  const sheffieldId = db.prepare(
    `INSERT INTO sites (org_id, name, country, hse_establishment_id, annual_avg_employees, total_hours_worked)
     VALUES (?, 'Sheffield Site', 'UK', 'HSE-12345', 120, 245000)`
  ).run(orgId).lastInsertRowid;
  const dallasId = db.prepare(
    `INSERT INTO sites (org_id, name, country, establishment_id, naics_code, annual_avg_employees, total_hours_worked)
     VALUES (?, 'Dallas Distribution', 'US', '34-9988', '493110', 92, 188400)`
  ).run(orgId).lastInsertRowid;

  // ----- Users — five-role demo cast -----
  const pw = bcrypt.hashSync('password123', 10);
  const ins = db.prepare(
    'INSERT INTO users (org_id, site_id, email, password_hash, name, initials, role, department, job_title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const elenaId = ins.run(orgId, clevelandId, 'elena@sdsmanager.com', pw, 'Elena Hartmann', 'EH', 'ehs_manager', 'EHS', 'EHS Lead').lastInsertRowid;
  const marcusId = ins.run(orgId, clevelandId, 'marcus@sdsmanager.com', pw, 'Marcus Rivera', 'MR', 'supervisor', 'Operations', 'Supervisor').lastInsertRowid;
  const jamesId = ins.run(orgId, sheffieldId, 'james@sdsmanager.com', pw, 'James Chen', 'JC', 'ehs_manager', 'EHS', 'EHS Manager').lastInsertRowid;
  const mehtaId = ins.run(orgId, clevelandId, 'mehta@sdsmanager.com', pw, 'Dr. Mehta', 'DM', 'ehs_officer', 'Occupational Health', 'Occupational Health Physician').lastInsertRowid;
  const wendyId = ins.run(orgId, clevelandId, 'wendy@sdsmanager.com', pw, 'Wendy Webb', 'WW', 'worker', 'Production', 'Press Operator').lastInsertRowid;

  // ----- Assets — Press 4 is the trending hotspot (3 incidents) -----
  const assetIns = db.prepare(
    `INSERT INTO assets (asset_number, org_id, site_id, name, asset_type, location_description, serial_number)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  let n = 0;
  const next = () => `AST-2026-${String(++n).padStart(5, '0')}`;
  const press4 = assetIns.run(next(), orgId, clevelandId, 'Press 4', 'machine', 'Bay 3 — Production floor', 'P4-2018-44211').lastInsertRowid;
  const forklift = assetIns.run(next(), orgId, clevelandId, 'Forklift FL-3', 'vehicle', 'Loading dock', 'CAT-FL3-77621').lastInsertRowid;
  const cnc7 = assetIns.run(next(), orgId, sheffieldId, 'CNC-7', 'machine', 'CNC area', 'HAAS-CNC7-11290').lastInsertRowid;
  const solventA = assetIns.run(next(), orgId, clevelandId, 'Solvent Storage A', 'building', 'East wing', null).lastInsertRowid;
  const grinder4 = assetIns.run(next(), orgId, sheffieldId, 'Bench Grinder #4', 'machine', 'Workshop B', 'BG-04-22019').lastInsertRowid;
  const paintBooth = assetIns.run(next(), orgId, clevelandId, 'Paint Booth #2', 'machine', 'Finishing line', 'PB-2-2017').lastInsertRowid;
  assetIns.run(next(), orgId, clevelandId, 'Bandsaw #1', 'machine', 'Workshop A', 'BS-01-2020');
  assetIns.run(next(), orgId, dallasId, 'Pallet Racking — Aisle 4', 'building', 'Warehouse aisle 4', null);
  assetIns.run(next(), orgId, dallasId, 'Forklift FL-7', 'vehicle', 'Yard', 'CAT-FL7-88102');
  assetIns.run(next(), orgId, sheffieldId, 'Lab 2 fume hood', 'building', 'QC Lab', null);
  assetIns.run(next(), orgId, clevelandId, 'Compressed-air manifold', 'building', 'Maintenance bay', null);
  assetIns.run(next(), orgId, clevelandId, 'IPA 70% — drum', 'chemical', 'Solvent Storage A', 'IPA-2026-040');

  // ----- Document folders — small tree per major site -----
  const folderIns = db.prepare(
    `INSERT INTO document_folders (org_id, site_id, parent_id, name, created_by) VALUES (?, ?, ?, ?, ?)`
  );
  const mkFolder = (siteId, parentId, name, createdBy) =>
    folderIns.run(orgId, siteId, parentId, name, createdBy).lastInsertRowid;

  // Cleveland — SDS / Manuals / Policies as top-level, plus a nested example.
  const fClvSds = mkFolder(clevelandId, null, 'SDS', elenaId);
  const fClvManuals = mkFolder(clevelandId, null, 'Equipment Manuals', marcusId);
  const fClvPolicies = mkFolder(clevelandId, null, 'Policies', elenaId);
  mkFolder(clevelandId, fClvManuals, 'Press Line', marcusId); // nested example

  // Sheffield — minimal set
  mkFolder(sheffieldId, null, 'SDS', jamesId);
  const fShfPolicies = mkFolder(sheffieldId, null, 'Policies', jamesId);

  // Dallas — minimal set
  mkFolder(dallasId, null, 'Forklift Records', marcusId);

  // ----- Documents — minimal set for evidence linking demo -----
  // Each seed doc gets a real 1-page PDF written to uploadDir so the download/
  // preview endpoint (which requires stored_filename + a real file on disk)
  // works out of the box on a fresh seed. Some land in folders, some at root.
  const docIns = db.prepare(
    `INSERT INTO documents (document_number, org_id, name, document_type, file_url, stored_filename, mime_type, size_bytes, uploaded_by, folder_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  let d = 0;
  const nextDoc = () => `DOC-2026-${String(++d).padStart(5, '0')}`;
  const seedDoc = (name, type, uploader, folderId = null) => {
    const { filename, size } = writeSeedPdf(name);
    docIns.run(nextDoc(), orgId, name, type, `/uploads/${filename}`, filename, 'application/pdf', size, uploader, folderId);
  };
  seedDoc('SDS — Isopropyl Alcohol 70% (CAS 67-63-0)', 'sds', elenaId, fClvSds);
  seedDoc('Press 4 — Operator Manual', 'manual', marcusId, fClvManuals);
  seedDoc('Lockout/Tagout Policy 2026', 'policy', elenaId, fClvPolicies);
  seedDoc('Forklift FL-3 — Maintenance Log', 'log', marcusId);              // root
  seedDoc('Annual Safety Training Cert — 2025', 'certificate', jamesId, fShfPolicies);

  // ----- 24 months of work_hours per site (TRIR/DART denominator) -----
  // Generates a synthetic monthly figure with mild variance.
  const whIns = db.prepare(
    `INSERT INTO work_hours (site_id, period_start, period_end, hours_worked, avg_employees, entered_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  function fillHours(siteId, baseHours, baseEmp, monthsBack, enteredBy, skipMostRecent = false) {
    const today = new Date();
    for (let i = monthsBack - 1; i >= 0; i--) {
      if (skipMostRecent && i === 0) continue; // leaves the latest month un-entered
      const start = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const end = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      const variance = Math.round((Math.random() - 0.5) * 0.08 * baseHours);
      const hours = baseHours + variance;
      whIns.run(siteId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), hours, baseEmp, enteredBy);
    }
  }
  fillHours(clevelandId, 42400, 248, 24, elenaId);
  fillHours(sheffieldId, 20400, 120, 24, jamesId, true);  // Sheffield missing the latest month
  fillHours(dallasId, 15700, 92, 14, elenaId);            // Dallas opened only 14 months ago

  // ----- Voice extraction (demo beat #8) — seeded so the activity log shows
  //       an entry even on a machine with no Anthropic key.
  const transcriptHash = crypto.createHash('sha256').update('demo-transcript').digest('hex');
  const voiceExtractionId = db.prepare(`
    INSERT INTO voice_extractions (transcript_hash, ai_extracted_json, user_confirmed_fields, user_edited_fields, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    transcriptHash,
    JSON.stringify({
      type: 'injury',
      title: 'Cut to right hand from press die',
      description: 'Operator caught right hand on press die during shift change. Cut required sutures.',
      body_parts_affected: ['r_hand'],
      site_match: 'Cleveland Plant',
      asset_match: 'Press 4',
      area: 'Bay 3',
    }),
    JSON.stringify(['type', 'title', 'body_parts', 'site', 'asset']),
    JSON.stringify(['description', 'area']),
    wendyId,
  ).lastInsertRowid;

  // =====================================================================
  // INCIDENTS — 11 covering the 10 demo beats
  // =====================================================================
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

  // (1) ACTIVE STOP-WORK — first-paint red banner
  const stopWorkIncId = incIns.run(
    'INC-2026-0150', orgId, clevelandId, 'STOP WORK — Compressed-air manifold leak', 'unsafe',
    'Pressure spike caused audible leak at the compressed-air manifold; operator triggered stop-work. Personnel evacuated within 10s.',
    new Date(Date.now() - 90 * 60 * 1000).toISOString(), 'Maintenance bay', null, 'Maintenance', null,
    1, 0, 4, 'A',
    'New', wendyId, 0, 1, 'active',
    '[]', null,
    0, null,
    null, null,
    0, null,
    '{}', 'Area cleared, energy isolated, supervisor notified.',
    null, null,
  ).lastInsertRowid;

  // (2) Chemical splash — EHS-VERIFIED + OSHA-recordable + body parts
  const chemSplashIncId = incIns.run(
    'INC-2026-0141', orgId, clevelandId, 'Chemical splash to forearm — IPA 70%', 'injury',
    'Lab tech decanting IPA from a 5L bottle into a wash bottle. Splash hit the back of the right forearm. PPE included nitrile gloves and safety glasses, but lab coat sleeve was rolled up.',
    '2026-05-02T08:18:00', 'Lab 2', 'Fume hood 3', 'QC Lab', null,
    2, 1, 3, 'A',
    'Investigating', elenaId, 0, 0, null,
    '["r_forearm"]', null,
    1, 'other_recordable',
    elenaId, '2026-05-02T11:00:00',
    0, null,
    JSON.stringify({
      injured_person: { name: 'Priya Singh', job_title: 'Lab technician II', department: 'QC Lab' },
      injury_type: 'Chemical burn — 1st degree',
      mechanism: 'Contact with chemical substance',
      object_substance: 'Isopropyl alcohol 70% (CAS 67-63-0)',
      treatment: ['Medical treatment'],
      ppe: ['Gloves', 'Goggles'],
    }),
    'Eyewash for 5 min, irrigation, occupational health consult.',
    null, null,
  ).lastInsertRowid;

  // (3) ANONYMOUS near-miss — reported_by NULL, demo-beat #5
  incIns.run(
    'INC-2026-0140', orgId, sheffieldId, 'Slip on spilled coolant — anonymous report', 'nearmiss',
    'Operator slipped on spilled coolant near CNC machine #7. Caught balance on workbench. Coolant had leaked from a loose hose connection.',
    '2026-05-01T16:55:00', 'CNC area', null, 'Production', cnc7,
    3, 2, 2, 'B',
    'New', null, 1, 0, null,
    '[]', null,
    0, null, null, null, 0, null,
    '{}', null, null, null,
  );

  // (4-6) THREE INCIDENTS AT PRESS 4 — trending banner, demo-beat #9
  const pressFmt = (n) => `INC-2026-${String(120 + n).padStart(4, '0')}`;
  incIns.run(
    pressFmt(0), orgId, clevelandId, 'Press 4 — coolant overflow', 'env',
    'Coolant tank overflowed during shift end at Press 4; ~5L on the floor.',
    new Date(Date.now() - 30 * 86400000).toISOString(), 'Bay 3', 'Press 4', 'Production', press4,
    4, 2, 1, 'C', 'Closed', marcusId, 0, 0, null, '[]', null, 0, null, null, null, 0, null,
    '{}', null,
    new Date(Date.now() - 29 * 86400000).toISOString(), 'Auto-closed (Track C)',
  );
  incIns.run(
    pressFmt(1), orgId, clevelandId, 'Press 4 — guard sensor intermittent', 'unsafe',
    'Light-curtain sensor on Press 4 intermittently fails to halt cycle when interrupted.',
    new Date(Date.now() - 14 * 86400000).toISOString(), 'Bay 3', 'Press 4', 'Production', press4,
    2, 1, 3, 'A', 'Investigating', marcusId, 0, 0, null, '[]', null, 0, null, null, null, 0, null,
    '{}', null, null, null,
  );

  // (6) VOICE-INTAKE-ASSISTED incident at Press 4 — demo-beat #8 + trending
  const voiceIncId = incIns.run(
    pressFmt(2), orgId, clevelandId, 'Cut to right hand from press die (voice intake)', 'injury',
    'Operator caught right hand on press die during shift change. Cut required sutures. Recorded via voice intake.',
    new Date(Date.now() - 3 * 86400000).toISOString(), 'Bay 3', 'Press 4', 'Production', press4,
    2, 1, 3, 'A', 'Investigating', wendyId, 0, 0, null,
    '["r_hand"]', voiceExtractionId,
    1, 'other_recordable', null, null, 0, null,
    JSON.stringify({
      injured_person: { name: 'Wendy Webb', job_title: 'Press Operator' },
      treatment: ['Medical treatment'],
      mechanism: 'Caught in / between machinery',
    }),
    'First aid on site, transported to occupational health.',
    null, null,
  ).lastInsertRowid;
  // Backfill the voice_extractions row with the incident link
  db.prepare('UPDATE voice_extractions SET incident_id = ? WHERE id = ?').run(voiceIncId, voiceExtractionId);

  // (7) Forklift collision — Track A, OSHA 24-hr beat
  const forkliftIncId = incIns.run(
    'INC-2026-0142', orgId, clevelandId, 'Forklift collision near loading dock', 'property',
    'Forklift operator misjudged turning radius and struck a steel storage rack in Bay 3. Driver bumped head, hospitalized for observation.',
    new Date(Date.now() - 1 * 86400000).toISOString(), 'Bay 3', 'Loading dock', 'Logistics', forklift,
    2, 1, 3, 'A', 'Investigating', marcusId, 0, 0, null,
    '["head"]', null,
    1, 'days_away', null, null, 0, null,
    JSON.stringify({ injured_person: { name: 'Carlos Reyes', job_title: 'Forklift operator' }, treatment: ['Hospitalization'] }),
    'Driver evaluated, operations resumed under spotter.',
    null, null,
  ).lastInsertRowid;

  // (8) Compressed-air hose burst — RIDDOR phone-required beat
  const riddorIncId = incIns.run(
    'INC-2026-0139', orgId, sheffieldId, 'Compressed-air hose burst', 'dangerous',
    'A compressed-air hose burst at a coupling joint in the maintenance bay, releasing pressurized air at ~8 bar. No personnel within 3 m.',
    '2026-05-01T14:02:00', 'Maintenance bay', null, 'Maintenance', null,
    1, 0, 4, 'A', 'Investigating', jamesId, 0, 0, null,
    '[]', null, 0, null, null, null, 1, 'dangerous_occurrence',
    '{}', null, null, null,
  ).lastInsertRowid;

  // (9-11) Misc to fill out the dashboard
  incIns.run(
    'INC-2026-0138', orgId, clevelandId, 'Eye irritation reported after solvent use', 'illness',
    'Painter reported eye irritation after 3 hours in the paint booth with low ventilation.',
    '2026-05-01T11:30:00', 'Paint booth', null, 'Production', paintBooth,
    3, 2, 2, 'B', 'Investigating', elenaId, 0, 0, null,
    '["face"]', null, 1, 'other_recordable', null, null, 0, null,
    JSON.stringify({ illness_category: 'Respiratory — Occupational asthma', substance: 'Solvent vapor' }),
    null, null, null,
  );
  incIns.run(
    'INC-2026-0136', orgId, sheffieldId, 'Missing machine guard on grinder #4', 'unsafe',
    'Belt guard on bench grinder #4 found missing during inspection.',
    '2026-04-30T14:07:00', 'Workshop B', null, 'Maintenance', grinder4,
    2, 1, 3, 'A', 'Investigating', jamesId, 0, 0, null,
    '[]', null, 0, null, null, null, 0, null, '{}', null, null, null,
  );
  incIns.run(
    'INC-2026-0134', orgId, clevelandId, 'Paper cut on packaging blade', 'injury',
    'Worker sustained minor paper cut on left index finger while handling packaging.',
    '2026-04-29T13:40:00', 'Shipping', null, 'Logistics', null,
    5, 4, 0, 'C', 'Closed', elenaId, 0, 0, null,
    '["l_hand"]', null, 0, 'first_aid', null, null, 0, null,
    JSON.stringify({ injured_person: { name: 'Sam Park' }, treatment: ['First aid only'] }),
    null,
    new Date(Date.now() - 5 * 86400000).toISOString(), 'Auto-closed (Track C)',
  );

  // =====================================================================
  // INVESTIGATIONS + 5-Why
  // =====================================================================
  const invIns = db.prepare(
    'INSERT INTO investigations (investigation_number, incident_id, org_id, lead_investigator, status, track, findings, root_cause_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const inv1 = invIns.run(
    'INV-2026-0078', chemSplashIncId, orgId, elenaId, 'progress', 'A',
    'Immediate cause: unsafe decanting practice (no funnel, working outside fume hood). Contributing factors: unclear SOP, missing engineering control (no dedicated refill station), lapsed SOP review cadence.',
    'Lab SOP review cadence is annual but lapsed during 2020-2022; no automated reminder in QMS.',
  ).lastInsertRowid;
  const inv2 = invIns.run('INV-2026-0079', forkliftIncId, orgId, marcusId, 'progress', 'A', null, null).lastInsertRowid;
  const inv3 = invIns.run('INV-2026-0080', riddorIncId, orgId, jamesId, 'pending', 'A', null, null).lastInsertRowid;

  const whyIns = db.prepare('INSERT INTO five_whys (investigation_id, level, question, answer, is_root_cause, created_by) VALUES (?, ?, ?, ?, ?, ?)');
  whyIns.run(inv1, 1, 'Why did the splash occur?', 'IPA splashed onto forearm during decanting from 5L bottle.', 0, elenaId);
  whyIns.run(inv1, 2, 'Why did IPA splash during decanting?', 'Bottle was tipped too quickly without funnel; technician working at desk height, not in fume hood.', 0, elenaId);
  whyIns.run(inv1, 3, 'Why was the technician decanting outside the fume hood?', 'Wash bottle stored at the bench; procedure does not specify location.', 0, elenaId);
  whyIns.run(inv1, 4, 'Why does the SOP not specify a refill location?', 'SOP last updated 2019 before the new wash-bottle workflow.', 0, elenaId);
  whyIns.run(inv1, 5, 'Why has the SOP not been reviewed since 2019?', 'Annual review cadence lapsed during 2020-2022; no automated QMS reminder.', 1, elenaId);

  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv1, elenaId, 'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv1, marcusId, 'member');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv1, mehtaId, 'occ_health');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv2, marcusId, 'lead');
  db.prepare('INSERT INTO investigation_team (investigation_id, user_id, role) VALUES (?, ?, ?)').run(inv3, jamesId, 'lead');

  // =====================================================================
  // CAPAs — mixed sources (investigation / incident / proactive)
  // =====================================================================
  const capaIns = db.prepare(`
    INSERT INTO capas (capa_number, source_type, investigation_id, incident_id, org_id, title, description, type, priority, owner_id, verifier_id, due_date, status, progress)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  capaIns.run('CAPA-048', 'investigation', inv1, null, orgId, 'Audit chemical-decanting workflow across all labs', null, 'preventive', 'high', jamesId, elenaId, '2026-05-30', 'pending', 0);
  capaIns.run('CAPA-047', 'investigation', inv1, null, orgId, 'Procure splash-resistant face shields for Lab 2', null, 'corrective', 'high', marcusId, jamesId, '2026-05-12', 'progress', 35);
  capaIns.run('CAPA-046', 'investigation', inv1, null, orgId, 'Add automated annual SOP-review reminder to QMS', null, 'preventive', 'medium', jamesId, elenaId, '2026-05-15', 'verify', 100);
  capaIns.run('CAPA-045', 'incident', null, voiceIncId, orgId, 'Replace damaged guarding on Press 4 die area', null, 'corrective', 'critical', marcusId, elenaId, '2026-05-10', 'pending', 0);
  capaIns.run('CAPA-044', 'proactive', null, null, orgId, 'Quarterly compressed-air system audit', null, 'preventive', 'medium', marcusId, elenaId, '2026-06-30', 'pending', 0);
  capaIns.run('CAPA-039', 'investigation', inv1, null, orgId, 'Update SOP-LAB-014: funnel + fume hood for IPA decanting', null, 'corrective', 'critical', elenaId, marcusId, '2026-05-08', 'progress', 65);

  // =====================================================================
  // OSHA 300 Log — keyed off the recordable incidents above
  // =====================================================================
  const oshaIns = db.prepare(`
    INSERT INTO osha_300_log (org_id, site_id, incident_id, calendar_year, case_number, employee_name, job_title, injury_date, location, description,
      classification_death, classification_days_away, classification_job_transfer, classification_other, days_away_count, days_restricted_count, injury_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  oshaIns.run(orgId, clevelandId, chemSplashIncId, 2026, 1, 'Singh, P.', 'Lab tech II', '2026-05-02', 'Lab 2', 'Chemical burn 1° — Right forearm — IPA 70%', 0, 0, 0, 1, 0, 2, 'injury');
  oshaIns.run(orgId, clevelandId, voiceIncId, 2026, 2, 'Webb, W.', 'Press Operator', new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), 'Bay 3', 'Cut to right hand from press die — Right hand', 0, 0, 0, 1, 0, 0, 'injury');
  oshaIns.run(orgId, clevelandId, forkliftIncId, 2026, 3, 'Reyes, C.', 'Forklift operator', new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10), 'Bay 3', 'Concussion — Head — steel rack', 0, 1, 0, 0, 3, 0, 'injury');

  // ----- Signed 300A annual cert for Cleveland 2025 -----
  db.prepare(`
    INSERT INTO regulatory_certifications (type, site_id, period_year, certifier_user_id, certifier_title, affirmation_text, signed_at)
    VALUES ('osha_300a', ?, 2025, ?, 'EHS Lead', ?, ?)
  `).run(
    clevelandId, elenaId,
    'I certify that I have examined this document and that to the best of my knowledge the entries are true, accurate, and complete.',
    '2026-02-01T09:00:00',
  );

  // =====================================================================
  // RIDDOR + Notifications — drive the regulatory banner
  // =====================================================================
  db.prepare(`
    INSERT INTO riddor_reports (riddor_number, org_id, site_id, incident_id, event_date, category, description, hse_ref, phone_notified_at, status, written_deadline)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'RDR-2026-003', orgId, sheffieldId, riddorIncId, '2026-05-01', 'dangerous_occurrence',
    'Compressed-air hose burst — Sheffield Site', 'HSE-2026-29841',
    '2026-05-01T14:30:00', 'phone_reported', '2026-05-11',
  );

  const notifIns = db.prepare('INSERT INTO notifications (org_id, type, incident_id, title, body, severity, deadline) VALUES (?, ?, ?, ?, ?, ?, ?)');
  notifIns.run(orgId, 'riddor_immediate', riddorIncId, 'RIDDOR — immediate phone report required', 'Compressed-air hose burst (Sheffield) — phone HSE without delay.', 'err', '2026-05-11T14:02:00');
  notifIns.run(orgId, 'osha_24hr', forkliftIncId, 'OSHA 24-hour report', 'Forklift collision resulted in driver hospitalization. Report to OSHA Area Office.', 'warn', new Date(Date.now() + 23 * 3600 * 1000).toISOString());
  notifIns.run(orgId, 'stop_work_active', stopWorkIncId, 'STOP WORK active — Maintenance bay', 'Compressed-air manifold leak. Acknowledge or resolve.', 'err', null);

  // =====================================================================
  // Activity log — sample entries for visible timeline
  // =====================================================================
  const actIns = db.prepare('INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  actIns.run(orgId, 'incident', stopWorkIncId, 'stop_work_submitted', 'STOP-WORK INC-2026-0150 submitted at Maintenance bay', wendyId, new Date(Date.now() - 90 * 60 * 1000).toISOString());
  actIns.run(orgId, 'incident', chemSplashIncId, 'recordability_verified', 'verified OSHA recordable as other_recordable for INC-2026-0141', elenaId, '2026-05-02T11:00:00');
  actIns.run(orgId, 'investigation', inv1, 'created', 'opened investigation INV-2026-0078', elenaId, '2026-05-02T09:30:00');
  actIns.run(orgId, 'system', null, 'voice_extracted', `voice transcript extracted (${transcriptHash.slice(0, 8)}…) — extraction_id=${voiceExtractionId}`, wendyId, new Date(Date.now() - 3 * 86400000).toISOString());
  actIns.run(orgId, 'capa', null, 'created', 'created proactive CAPA CAPA-044 (compressed-air audit)', elenaId, '2026-04-30T10:00:00');
})();

console.log('Seed complete.');
console.log('Demo users (password: password123):');
console.log('  elena@sdsmanager.com   (EHS Lead)');
console.log('  marcus@sdsmanager.com  (Supervisor)');
console.log('  james@sdsmanager.com   (EHS Manager — Sheffield)');
console.log('  mehta@sdsmanager.com   (Occupational Health)');
console.log('  wendy@sdsmanager.com   (Worker — Press Operator)');

// Wave 6 risk #5 mitigation: clean checkpoint before exit so the boot
// process never opens with WAL contention from the seed transaction.
db.pragma('wal_checkpoint(FULL)');

process.exit(0);
