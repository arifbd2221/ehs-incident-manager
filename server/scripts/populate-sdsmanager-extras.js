// server/scripts/populate-sdsmanager-extras.js
//
// Non-destructive demo enrichment for SDS Manager Inc. (org_id=1):
//   - Maintenance schedules + history events on every major asset (14
//     assets currently have zero schedules).
//   - Inspection templates (Forklift Pre-Shift, Site Walk, Fire Safety)
//     plus completed + in-progress inspections.
//   - Additional documents (SDS sheets, policies, manuals, certificates).
//
// Idempotent: tagged via title prefix "DEMO:" / template name prefix "Demo".
// If the templates already exist, the script exits without changes.
//
// Run from server/:
//   node scripts/populate-sdsmanager-extras.js

import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';
import { writeSeedPdf, writeSeedJpeg } from './seed-files.js';

const ORG_ID = 1;

const existing = db.prepare(
  "SELECT COUNT(*) AS n FROM templates WHERE org_id = ? AND name LIKE 'Demo:%'"
).get(ORG_ID);
if (existing.n > 0) {
  console.log(`Demo extras already populated (${existing.n} "Demo:" templates).`);
  console.log('To re-run, delete templates / schedules / inspections / documents prefixed "Demo".');
  process.exit(0);
}

const u = (email) => {
  const r = db.prepare("SELECT id, name FROM users WHERE email = ? AND org_id = ?").get(email, ORG_ID);
  if (!r) throw new Error(`User missing: ${email}`);
  return r;
};
const priya  = u('priya@sdsmanager.com');
const elena  = u('elena@sdsmanager.com');
const marcus = u('marcus@sdsmanager.com');
const james  = u('james@sdsmanager.com');
const mehta  = u('mehta@sdsmanager.com');
const sarah  = u('sarah@sdsmanager.com');

const cleveland = db.prepare("SELECT id FROM sites WHERE org_id = ? AND name = 'Cleveland Plant'").get(ORG_ID);
const sheffield = db.prepare("SELECT id FROM sites WHERE org_id = ? AND name = 'Sheffield Site'").get(ORG_ID);
const dallas    = db.prepare("SELECT id FROM sites WHERE org_id = ? AND name = 'Dallas Distribution'").get(ORG_ID);
const sydney    = db.prepare("SELECT id FROM sites WHERE org_id = ? AND name LIKE 'Sydney%'").get(ORG_ID);

const assets = db.prepare("SELECT id, name, asset_type, site_id FROM assets WHERE org_id = ?").all(ORG_ID);

const today = new Date();
const daysFromToday = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoDT = (d) => d.toISOString().slice(0, 19).replace('T', ' ');

console.log('Populating SDS Manager Inc. demo extras (maintenance / inspections / documents)...');

const run = db.transaction(() => {

  // ==========================================================================
  // 1. Maintenance schedules — give every asset 1–3 schedules.
  // Spread next_due across overdue / due-soon / on-track / far-future so the
  // Maintenance page shows a healthy mix of statuses.
  // ==========================================================================
  const schedIns = db.prepare(`
    INSERT INTO asset_maintenance_schedules
      (asset_id, org_id, schedule_type, title, description, interval_days,
       start_date, next_due, last_completed_at, last_completed_by, last_outcome,
       active, created_by, assigned_to)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const evtIns = db.prepare(`
    INSERT INTO asset_maintenance_events
      (schedule_id, asset_id, org_id, completed_at, completed_by, outcome, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  // Pick a sensible schedule mix per asset_type
  const planFor = (type) => {
    switch (type) {
      case 'machine':
        return [
          { st: 'preventive',  title: 'Demo: Monthly cleaning & lubrication',     interval: 30,  due: -3 },  // overdue
          { st: 'calibration', title: 'Demo: Quarterly calibration',              interval: 90,  due: 14 },  // due-soon
          { st: 'inspection',  title: 'Demo: Annual structural inspection',       interval: 365, due: 120 }, // future
        ];
      case 'vehicle':
        return [
          { st: 'preventive',  title: 'Demo: Pre-shift forklift inspection',      interval: 7,   due: 1 },   // tomorrow
          { st: 'preventive',  title: 'Demo: Quarterly service',                  interval: 90,  due: -5 },  // overdue
          { st: 'inspection',  title: 'Demo: Annual safety inspection',           interval: 365, due: 60 },
        ];
      case 'building':
        return [
          { st: 'inspection',  title: 'Demo: Quarterly fire-extinguisher check',  interval: 90,  due: 7 },
          { st: 'inspection',  title: 'Demo: Annual structural audit',            interval: 365, due: 200 },
        ];
      case 'chemical':
        return [
          { st: 'inspection',  title: 'Demo: Weekly drum/seal integrity check',   interval: 7,   due: -1 },  // overdue
          { st: 'calibration', title: 'Demo: Monthly inventory reconciliation',   interval: 30,  due: 4 },
        ];
      default:
        return [{ st: 'preventive', title: 'Demo: Quarterly check', interval: 90, due: 30 }];
    }
  };

  let schedCount = 0;
  let evtCount = 0;

  for (const a of assets) {
    const plans = planFor(a.asset_type);
    for (const p of plans) {
      const startDate = daysFromToday(-Math.max(p.interval * 2, 60));
      // last_completed: one interval before today (so the chain makes sense)
      const lastDate = daysFromToday(p.due - p.interval);
      const sid = schedIns.run(
        a.id, ORG_ID, p.st, p.title,
        `${p.st[0].toUpperCase() + p.st.slice(1)} maintenance for ${a.name}.`,
        p.interval, startDate, daysFromToday(p.due),
        `${lastDate}T09:00:00`,
        marcus.id,
        'pass',
        priya.id,
        // assign to elena, marcus, or james
        [elena.id, marcus.id, james.id][schedCount % 3],
      ).lastInsertRowid;
      schedCount++;

      // 1-3 historical events for each schedule
      const eventCount = 1 + (schedCount % 3);
      for (let i = 1; i <= eventCount; i++) {
        const completedAt = daysFromToday(p.due - p.interval * i);
        const outcome = i === 1 ? 'pass' : (i === 2 ? 'pass' : ['pass', 'conditional', 'fail'][i % 3]);
        evtIns.run(
          sid, a.id, ORG_ID,
          `${completedAt}T${String(9 + (i % 6)).padStart(2, '0')}:00:00`,
          [marcus.id, james.id, elena.id][i % 3],
          outcome,
          outcome === 'pass'
            ? 'All checks passed; no abnormalities noted.'
            : outcome === 'conditional'
              ? 'Passed with minor wear noted; flag for next service.'
              : 'FAILED — escalated to CAPA. Asset taken offline pending repair.',
        );
        evtCount++;
      }
    }
  }

  // ==========================================================================
  // 2. Inspection templates + completed inspections
  // ==========================================================================
  const tplIns = db.prepare(`
    INSERT INTO templates (org_id, name, description, status, published_at, created_by, latest_version)
    VALUES (?, ?, ?, 'published', datetime('now'), ?, 1)
  `);
  const versionIns = db.prepare(`
    INSERT INTO template_versions (template_id, version_number, published_by)
    VALUES (?, 1, ?)
  `);
  const itemIns = db.prepare(`
    INSERT INTO template_version_items (version_id, item_key, type, label, sort_order, required)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const TEMPLATES = [
    {
      name: 'Demo: Forklift Pre-Shift Inspection',
      desc: 'OSHA 1910.178(q)(7) daily pre-shift forklift inspection.',
      items: [
        'Tyres and wheels free of damage',
        'Forks straight, no cracks, latches functional',
        'Hydraulic hoses + cylinders no leaks',
        'Mast chains + rollers lubricated, no damage',
        'Horn audible from 50ft',
        'Reversing alarm functional',
        'Headlights + tail-lights operational',
        'Seat belt latches, no fraying',
        'Operator manual present in cab',
        'Fire extinguisher charged + in date',
      ],
    },
    {
      name: 'Demo: Workplace Safety Walk',
      desc: 'Monthly site-wide safety walkthrough — exits, signage, housekeeping.',
      items: [
        'Emergency exits clear and unobstructed',
        'Fire extinguishers tagged + inspected this month',
        'First-aid kits stocked and accessible',
        'PPE stations stocked',
        'Spill kits located within 5m of decanting points',
        'Eyewash stations tested in last 7 days',
        'Floor markings + aisles visible',
        'No chemicals stored above eye level',
        'SDS binder current within last 12 months',
        'LOTO devices stocked at every isolation point',
      ],
    },
    {
      name: 'Demo: Fire Safety + Emergency Readiness',
      desc: 'Quarterly fire-safety audit per NFPA 1.',
      items: [
        'Sprinkler heads unobstructed (18in clearance)',
        'Fire doors close fully + self-latch',
        'Smoke detector batteries < 12 months old',
        'Evacuation routes posted at every junction',
        'Assembly point sign visible from all exits',
        'Fire-suppression system serviced this year',
      ],
    },
  ];

  let templateCount = 0;
  const versionIds = [];
  for (const t of TEMPLATES) {
    const tid = tplIns.run(ORG_ID, t.name, t.desc, elena.id).lastInsertRowid;
    const vid = versionIns.run(tid, elena.id).lastInsertRowid;
    versionIds.push({ template_id: tid, version_id: vid, name: t.name, items: t.items });
    t.items.forEach((label, idx) => {
      itemIns.run(vid, `q${idx + 1}`, 'question', label, idx + 1, 1);
    });
    templateCount++;
  }

  // Completed inspections — 6 across the templates, last few months, mix of
  // completed / in-progress / abandoned for the dashboard chips
  const inspIns = db.prepare(`
    INSERT INTO inspections
      (org_id, template_id, template_version_id, inspection_number, title, status,
       conducted_on, location, started_by, completed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const inspItemIns = db.prepare(`
    INSERT INTO inspection_items (inspection_id, item_key, type, response_text, is_flagged, is_failed, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const inspections = [
    { tplIdx: 0, status: 'completed',    daysAgo: 2,  who: marcus.id, where: 'Cleveland Plant — Bay 3', failKeys: [] },
    { tplIdx: 0, status: 'completed',    daysAgo: 9,  who: marcus.id, where: 'Cleveland Plant — Bay 3', failKeys: ['q6'] },
    { tplIdx: 0, status: 'in_progress',  daysAgo: 0,  who: marcus.id, where: 'Dallas Distribution',     failKeys: [] },
    { tplIdx: 1, status: 'completed',    daysAgo: 12, who: elena.id,  where: 'Cleveland Plant',         failKeys: ['q5','q10'] },
    { tplIdx: 1, status: 'completed',    daysAgo: 40, who: james.id,  where: 'Sheffield Site',          failKeys: [] },
    { tplIdx: 1, status: 'in_progress',  daysAgo: 1,  who: sarah.id,  where: 'Sydney Manufacturing',    failKeys: [] },
    { tplIdx: 2, status: 'completed',    daysAgo: 21, who: elena.id,  where: 'Cleveland Plant',         failKeys: [] },
    { tplIdx: 2, status: 'abandoned',    daysAgo: 60, who: james.id,  where: 'Sheffield Site',          failKeys: [] },
  ];

  let inspCount = 0;
  let inspItemCount = 0;
  for (let i = 0; i < inspections.length; i++) {
    const ins = inspections[i];
    const tpl = versionIds[ins.tplIdx];
    const conducted = daysFromToday(-ins.daysAgo);
    const inspId = inspIns.run(
      ORG_ID, tpl.template_id, tpl.version_id,
      `INSP-DEMO-${String(i + 1).padStart(3, '0')}`,
      `${tpl.name.replace('Demo: ', '')} — ${conducted}`,
      ins.status,
      `${conducted}T${String(8 + (i % 6)).padStart(2, '0')}:30:00`,
      ins.where,
      ins.who,
      ins.status === 'completed' ? `${conducted}T${String(10 + (i % 4)).padStart(2, '0')}:15:00` : null,
    ).lastInsertRowid;
    inspCount++;

    if (ins.status !== 'in_progress') {
      tpl.items.forEach((label, idx) => {
        const key = `q${idx + 1}`;
        const failed = ins.failKeys.includes(key);
        const resp = failed ? 'No' : 'Yes';
        inspItemIns.run(
          inspId, key, 'question', resp,
          failed ? 1 : 0,
          failed ? 1 : 0,
          failed ? `Flagged — ${label.split(' ').slice(0, 4).join(' ')} needs attention.` : null,
        );
        inspItemCount++;
      });
    }
  }

  // ==========================================================================
  // 3. Documents — add SDS / manuals / policies / certificates
  // Reuse existing folder structure under Cleveland Plant.
  // ==========================================================================
  const folders = db.prepare("SELECT id, name, site_id FROM document_folders WHERE org_id = ?").all(ORG_ID);
  const folderByName = (n) => folders.find(f => f.name === n);
  const sdsFolder      = folderByName('SDS');
  const manualsFolder  = folderByName('Equipment Manuals');
  const policiesFolder = folderByName('Policies');

  // stored_filename + a real file on disk are required by the
  // /api/documents/:id/download endpoint that powers preview — omitting them
  // makes the preview modal 404 with "No file on disk for this document".
  const docIns = db.prepare(`
    INSERT INTO documents
      (document_number, org_id, name, document_type, file_url, stored_filename, mime_type, size_bytes, uploaded_by, folder_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // existing docs use DOC-2026-NNNN format; query max number to continue
  const maxRow = db.prepare("SELECT document_number FROM documents WHERE org_id = ? ORDER BY id DESC LIMIT 1").get(ORG_ID);
  let nextN = 100;
  if (maxRow) {
    const m = String(maxRow.document_number).match(/(\d+)$/);
    if (m) nextN = Math.max(nextN, Number(m[1]) + 1);
  }
  const nextDocNo = () => `DOC-2026-${String(nextN++).padStart(4, '0')}`;

  const DOCS = [
    // SDS sheets (chemical inventory)
    { name: 'SDS — Acetone (CAS 67-64-1)',              type: 'sds',         folder: sdsFolder, size: 245000, mime: 'application/pdf', uploader: elena.id },
    { name: 'SDS — Methyl Ethyl Ketone (CAS 78-93-3)',  type: 'sds',         folder: sdsFolder, size: 198000, mime: 'application/pdf', uploader: elena.id },
    { name: 'SDS — Sodium Hydroxide 50% (CAS 1310-73-2)', type: 'sds',        folder: sdsFolder, size: 312000, mime: 'application/pdf', uploader: elena.id },
    { name: 'SDS — Hydrochloric Acid 32% (CAS 7647-01-0)', type: 'sds',       folder: sdsFolder, size: 287000, mime: 'application/pdf', uploader: elena.id },
    { name: 'SDS — Argon/CO₂ Welding Gas',              type: 'sds',         folder: sdsFolder, size: 156000, mime: 'application/pdf', uploader: marcus.id },
    // Equipment manuals
    { name: 'Forklift FL-7 — Operator Manual',          type: 'manual',      folder: manualsFolder, size: 4200000, mime: 'application/pdf', uploader: marcus.id },
    { name: 'CNC-7 — Maintenance & Service Guide',      type: 'manual',      folder: manualsFolder, size: 6800000, mime: 'application/pdf', uploader: marcus.id },
    { name: 'Bandsaw #1 — Operating Procedure',         type: 'manual',      folder: manualsFolder, size: 1500000, mime: 'application/pdf', uploader: marcus.id },
    // Policies
    { name: 'Hot-Work Permit Policy 2026',              type: 'policy',      folder: policiesFolder, size: 480000, mime: 'application/pdf', uploader: elena.id },
    { name: 'Working at Heights Policy 2026',           type: 'policy',      folder: policiesFolder, size: 520000, mime: 'application/pdf', uploader: elena.id },
    { name: 'Confined Space Entry SOP',                 type: 'policy',      folder: policiesFolder, size: 610000, mime: 'application/pdf', uploader: elena.id },
    { name: 'PPE Program 2026',                         type: 'policy',      folder: policiesFolder, size: 380000, mime: 'application/pdf', uploader: priya.id },
    // Certificates
    { name: 'Forklift FL-7 — Annual Safety Inspection Certificate 2026', type: 'certificate', folder: null,        size: 220000, mime: 'application/pdf', uploader: marcus.id },
    { name: 'CNC-7 — Calibration Certificate Q1 2026',  type: 'certificate', folder: null,        size: 195000, mime: 'application/pdf', uploader: marcus.id },
    { name: 'Site Fire-Suppression Service Report',     type: 'certificate', folder: null,        size: 410000, mime: 'application/pdf', uploader: elena.id },
    // Photos (incident evidence pattern)
    { name: 'Bay-3 incident photo — guarding damage',   type: 'photo',       folder: null,        size: 2100000, mime: 'image/jpeg', uploader: marcus.id },
    { name: 'Lab-2 chem-splash incident — kit aftermath', type: 'photo',     folder: null,        size: 1800000, mime: 'image/jpeg', uploader: mehta.id },
    // Logs
    { name: 'Forklift FL-3 — 2026 Daily Inspection Log', type: 'log',        folder: null,        size: 95000,   mime: 'application/pdf', uploader: marcus.id },
    { name: 'Press Line — Q1 2026 Maintenance Log',     type: 'log',         folder: null,        size: 145000,  mime: 'application/pdf', uploader: marcus.id },
  ];

  let docCount = 0;
  for (const d of DOCS) {
    const docNo = nextDocNo();
    const isImage = d.mime.includes('image');
    const { filename, size } = isImage ? writeSeedJpeg() : writeSeedPdf(d.name);
    docIns.run(
      docNo, ORG_ID, d.name, d.type,
      `/uploads/${filename}`,
      filename,
      d.mime, size, d.uploader,
      d.folder ? d.folder.id : null,
    );
    docCount++;
  }

  // ==========================================================================
  // Activity log summary — single rollup entry so the audit page shows the
  // demo enrichment without spamming individual rows.
  // ==========================================================================
  writeActivity({
    org_id: ORG_ID,
    entity_type: 'system',
    entity_id: null,
    action: 'demo_extras_populated',
    description: `Demo enrichment: ${schedCount} maintenance schedules, ${evtCount} events, ${templateCount} inspection templates, ${inspCount} inspections, ${docCount} documents`,
    user_id: priya.id,
    metadata: {
      maintenance_schedules: schedCount,
      maintenance_events: evtCount,
      inspection_templates: templateCount,
      inspections: inspCount,
      documents: docCount,
    },
  });

  console.log(`  Maintenance schedules:   ${schedCount} (across ${assets.length} assets)`);
  console.log(`  Maintenance events:      ${evtCount}`);
  console.log(`  Inspection templates:    ${templateCount} (Forklift / Safety Walk / Fire Safety)`);
  console.log(`  Template items:          ${TEMPLATES.reduce((s, t) => s + t.items.length, 0)}`);
  console.log(`  Inspections:             ${inspCount} (completed + in-progress + abandoned)`);
  console.log(`  Inspection responses:    ${inspItemCount}`);
  console.log(`  Documents:               ${docCount} (SDS / manuals / policies / certificates / logs)`);
});

run();
console.log('\nDone. Maintenance, Inspections, and Documents pages should now show populated data.');
