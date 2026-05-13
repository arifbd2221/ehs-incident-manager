// server/scripts/populate-risk-demo.js
//
// Seed a realistic risk register for SDS Manager Inc. (org_id=1) so the
// /risks pages aren't empty. 16 risks across the 4 sites and all 9
// categories, with a lifecycle mix: Identified → Assessed → Mitigating
// → Controlled, plus a couple Accepted and one Closed.
//
// Each risk carries:
//   - inherent L/C scores (looked up against risk_matrix_cells for the
//     authoritative severity / track / level mapping — never hand-computed)
//   - 1–3 risk_controls following the hierarchy of controls (elimination
//     → substitution → engineering → administrative → ppe)
//   - residual L/C set on risks whose controls are 'effective' (the
//     residual reflects the post-control reality)
//   - review_date 90–365 days out
//   - activity_log rows for created / assessed / control_added events
//
// Idempotent — bails if there are already risks for org 1, so re-running
// after Sarah's clicked around the page won't double up.
//
// Run from server/:
//   node scripts/populate-risk-demo.js

import db from '../db/connection.js';
import { nextRiskNumber } from '../services/numbering.js';
import { writeActivity } from '../services/activity_log.js';

const ORG_ID = 1;

const existing = db.prepare('SELECT COUNT(*) AS n FROM risks WHERE org_id = ?').get(ORG_ID);
if (existing.n > 0) {
  console.log(`Risks already populated (${existing.n} rows for org ${ORG_ID}). Skipping.`);
  process.exit(0);
}

// Authoritative L/C → severity/track/level lookup using the matrix the
// rest of the system uses. inherent_track is derived from severity using
// the same A/B/C split incidents use (S1–S2 → A, S3 → B, S4–S5 → C).
const matrixCell = db.prepare(
  'SELECT severity, level_label FROM risk_matrix_cells WHERE likelihood = ? AND consequence = ?'
);
function classify(likelihood, consequence) {
  const row = matrixCell.get(likelihood, consequence);
  if (!row) throw new Error(`No matrix cell for L=${likelihood} C=${consequence}`);
  const track = row.severity <= 2 ? 'A' : row.severity === 3 ? 'B' : 'C';
  return { severity: row.severity, track, level: row.level_label };
}

// Site lookup — fail loudly if a demo expects a site that's not seeded.
const sites = db.prepare("SELECT id, name FROM sites WHERE org_id = ?").all(ORG_ID);
const siteByName = new Map(sites.map(s => [s.name, s.id]));
function site(name) {
  const id = siteByName.get(name);
  if (!id) throw new Error(`Site not found: ${name}`);
  return id;
}

// User lookup — same fail-loud pattern.
const usersByEmail = new Map(
  db.prepare("SELECT id, email FROM users WHERE org_id = ?").all(ORG_ID).map(u => [u.email, u.id])
);
function user(email) {
  const id = usersByEmail.get(email);
  if (!id) throw new Error(`User not found: ${email}`);
  return id;
}

// 90-day offset helper for review dates.
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const RISKS = [
  // ─── Cleveland Plant ──────────────────────────────────────────────────
  {
    title: 'Hand crush hazard at Press 4 changeover',
    category: 'safety',
    site: 'Cleveland Plant',
    source: 'Recurrent incident — 3 events in 90 days',
    description: 'Operators repositioning dies on Press 4 during changeover have insufficient guarding between the ram and the bolster. Three hand-injury incidents in 90 days, including one Track A.',
    identified_by: 'marcus@sdsmanager.com',
    owner: 'elena@sdsmanager.com',
    inherent: [1, 3],         // rare-ish but catastrophic per matrix
    residual: [3, 1],         // mostly with eng controls
    status: 'Controlled',
    controls: [
      { type: 'engineering', title: 'Light curtain + two-hand control on Press 4', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'administrative', title: 'Changeover SOP rev. C — mandatory pre-task brief', effectiveness: 'effective', verified: true, implementer: 'elena@sdsmanager.com' },
      { type: 'ppe', title: 'Cut-5 rated nitrile-coated gloves during die handling', effectiveness: 'partially_effective', verified: false, implementer: 'marcus@sdsmanager.com' },
    ],
    review_offset_days: 90,
  },
  {
    title: 'Forklift / pedestrian conflict at Bay 3 intersection',
    category: 'safety',
    site: 'Cleveland Plant',
    source: 'Near-miss report INC-2026-0421',
    description: 'Forklift route crosses the main pedestrian aisle at Bay 3 without segregation. Sightlines obscured by racking. One near-miss reported; layout change increased traffic 30%.',
    identified_by: 'marcus@sdsmanager.com',
    owner: 'elena@sdsmanager.com',
    inherent: [2, 3],
    residual: [3, 1],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Convex mirrors at all 4 corners of Bay 3 intersection', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'engineering', title: 'Pedestrian-priority paint scheme + bollards (in progress)', effectiveness: 'pending', verified: false, implementer: null },
      { type: 'administrative', title: 'Forklift speed limit 5 mph in Bay 3 zone, monitored via telematics', effectiveness: 'effective', verified: true, implementer: 'elena@sdsmanager.com' },
    ],
    review_offset_days: 60,
  },
  {
    title: 'Heat stress in summer months — molding line',
    category: 'health',
    site: 'Cleveland Plant',
    source: 'OSHA NEP heat focus + 2 worker complaints',
    description: 'Injection molding bay regularly exceeds 90°F WBGT in July-August. No formal acclimatization protocol. OSHA National Emphasis Program on heat injury applies.',
    identified_by: 'elena@sdsmanager.com',
    owner: 'mehta@sdsmanager.com',
    inherent: [0, 2],
    residual: [2, 1],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Spot-cooler installed at workstations 4–7', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'administrative', title: 'Acclimatization schedule (20% on day 1 → 100% on day 5)', effectiveness: 'pending', verified: false, implementer: null },
      { type: 'administrative', title: 'Mandatory water breaks every 30 min when WBGT > 88°F', effectiveness: 'effective', verified: true, implementer: 'elena@sdsmanager.com' },
    ],
    review_offset_days: 120,
  },
  {
    title: 'Noise exposure above 90 dBA — stamping line',
    category: 'physical',
    site: 'Cleveland Plant',
    source: 'Annual noise survey',
    description: 'Sound level meter survey shows TWA at 92 dBA on the stamping line. Hearing conservation program required per 29 CFR 1910.95.',
    identified_by: 'mehta@sdsmanager.com',
    owner: 'elena@sdsmanager.com',
    inherent: [0, 1],
    residual: [2, 1],
    status: 'Controlled',
    controls: [
      { type: 'engineering', title: 'Acoustic enclosures on Stamper #1 + #2 (NRR 25)', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'administrative', title: 'Annual audiometric testing for line operators', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
      { type: 'ppe', title: 'Dual hearing protection (plugs + muffs) in stamping bay', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
    ],
    review_offset_days: 365,
  },
  {
    title: 'Repetitive strain — manual assembly line',
    category: 'ergonomic',
    site: 'Cleveland Plant',
    source: 'Ergonomic assessment',
    description: 'Assembly operators perform 1,200+ wrist flexions per shift on small-fastener torquing task. RULA score 5–6 (moderate-to-high). Two carpal tunnel claims in 12 months.',
    identified_by: 'mehta@sdsmanager.com',
    owner: 'elena@sdsmanager.com',
    inherent: [0, 1],
    residual: [2, 1],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Pneumatic torque drivers replacing hand drivers', effectiveness: 'pending', verified: false, implementer: null },
      { type: 'administrative', title: 'Job rotation — 2-hour rotation across 3 stations', effectiveness: 'partially_effective', verified: true, implementer: 'elena@sdsmanager.com' },
    ],
    review_offset_days: 90,
  },
  {
    title: 'Solvent vapor exposure in degreasing booth',
    category: 'chemical',
    site: 'Cleveland Plant',
    source: 'SDS review — MEK',
    description: 'Methyl ethyl ketone (MEK) used in degreasing booth without local exhaust ventilation. PEL 200 ppm TWA per 1910.1000; recent grab samples 80–120 ppm but no continuous monitoring.',
    identified_by: 'elena@sdsmanager.com',
    owner: 'mehta@sdsmanager.com',
    inherent: [1, 2],
    residual: [3, 1],
    status: 'Controlled',
    controls: [
      { type: 'substitution', title: 'Switched to lower-VOC aqueous degreaser where compatible', effectiveness: 'partially_effective', verified: true, implementer: 'elena@sdsmanager.com' },
      { type: 'engineering', title: 'Local exhaust ventilation hood at booth — 150 fpm face velocity', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'ppe', title: 'Half-face respirator with organic vapor cartridges', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
    ],
    review_offset_days: 180,
  },

  // ─── Sheffield Site ──────────────────────────────────────────────────
  {
    title: 'Working at height during structural inspection',
    category: 'safety',
    site: 'Sheffield Site',
    source: 'Quarterly hazard review',
    description: 'Roof-mounted gas line inspections require ladder access > 2 m. WAH Reg. 2005 applies; current practice uses extension ladder without fall arrest.',
    identified_by: 'james@sdsmanager.com',
    owner: 'james@sdsmanager.com',
    inherent: [1, 3],
    residual: [3, 1],
    status: 'Controlled',
    controls: [
      { type: 'elimination', title: 'Drone visual inspection for routine quarterly checks', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
      { type: 'engineering', title: 'Permanent anchor points installed at 4 roof locations', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
      { type: 'ppe', title: 'Full-body harness + SRL for any roof work', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
    ],
    review_offset_days: 180,
  },
  {
    title: 'Legionella in cooling tower',
    category: 'biological',
    site: 'Sheffield Site',
    source: 'HSE ACoP L8 audit',
    description: 'Cooling tower water testing inconsistent — last sampling 8 months ago. ACoP L8 requires quarterly sampling + remedial action above 1,000 cfu/L.',
    identified_by: 'james@sdsmanager.com',
    owner: 'james@sdsmanager.com',
    inherent: [1, 2],
    residual: [2, 1],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Automatic biocide dosing system commissioned', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
      { type: 'administrative', title: 'Quarterly sampling contract with accredited lab', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
    ],
    review_offset_days: 90,
  },
  {
    title: 'Diesel exhaust emission in goods-in dock',
    category: 'environmental',
    site: 'Sheffield Site',
    source: 'Site walk-around',
    description: 'HGVs idle for 5–15 min in covered goods-in bay during unloading. Diesel particulate exposure for dock workers; air quality concern under HSE EH40.',
    identified_by: 'james@sdsmanager.com',
    owner: 'james@sdsmanager.com',
    inherent: [1, 1],
    residual: [3, 0],
    status: 'Accepted',
    accepted_by: 'james@sdsmanager.com',
    accepted_justification: 'Reduction-to-ALARP achieved: dock door open-by-default during unloading, idle-time limited to 3 min via signage and contractor SLAs. Residual risk monitored via annual particulate sampling. Further engineering (electrification) deferred to 2027 capex cycle.',
    review_offset_days: 365,
    controls: [
      { type: 'administrative', title: 'No-idle policy — HGV engines off within 3 min of bay arrival', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
      { type: 'engineering', title: 'Dock door auto-open during unloading window', effectiveness: 'effective', verified: true, implementer: 'james@sdsmanager.com' },
    ],
  },

  // ─── Dallas Distribution ─────────────────────────────────────────────
  {
    title: 'Manual handling — heavy outbound cartons',
    category: 'ergonomic',
    site: 'Dallas Distribution',
    source: 'Workers comp claims trend',
    description: 'Outbound cartons regularly exceed NIOSH lifting equation recommended weight (>23 kg). Three lower-back claims in 6 months at the dispatch line.',
    identified_by: 'mehta@sdsmanager.com',
    owner: 'mehta@sdsmanager.com',
    inherent: [1, 1],
    residual: [3, 0],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Vacuum lift-assist installed at dispatch stations 1–4', effectiveness: 'partially_effective', verified: true, implementer: 'mehta@sdsmanager.com' },
      { type: 'administrative', title: 'Two-person lift rule for cartons over 18 kg', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
    ],
    review_offset_days: 120,
  },
  {
    title: 'Battery fire risk — forklift charging area',
    category: 'physical',
    site: 'Dallas Distribution',
    source: 'NFPA 505 review',
    description: 'Forklift battery charging room lacks dedicated ventilation and fire detection. Lead-acid hydrogen offgassing accumulates above LEL during peak charging hours.',
    identified_by: 'mehta@sdsmanager.com',
    owner: 'mehta@sdsmanager.com',
    inherent: [1, 3],
    residual: [3, 1],
    status: 'Controlled',
    controls: [
      { type: 'engineering', title: 'Dedicated exhaust fan + H2 sensor with auto-evac trigger', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
      { type: 'engineering', title: 'Class C fire suppression — clean agent in charging room', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
      { type: 'administrative', title: 'No charging during unattended hours (after 22:00)', effectiveness: 'effective', verified: true, implementer: 'mehta@sdsmanager.com' },
    ],
    review_offset_days: 365,
  },

  // ─── Sydney Manufacturing ─────────────────────────────────────────────
  {
    title: 'Shift-work fatigue — 12-hour rotating shifts',
    category: 'psychosocial',
    site: 'Sydney Manufacturing — AU',
    source: 'WHS audit + worker survey',
    description: 'Operators on 4-on/4-off 12-hour rotating shifts report cumulative fatigue. WHS Act 2011 (NSW) Code of Practice on workplace fatigue applies. Two near-misses on night shifts attributed to inattention.',
    identified_by: 'sarah@sdsmanager.com',
    owner: 'sarah@sdsmanager.com',
    inherent: [1, 2],
    residual: [3, 1],
    status: 'Mitigating',
    controls: [
      { type: 'administrative', title: 'Fatigue risk assessment integrated into rostering software', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
      { type: 'administrative', title: 'Mandatory 30-min nap room available night shifts', effectiveness: 'partially_effective', verified: false, implementer: null },
      { type: 'administrative', title: 'Fatigue self-assessment checklist at shift handover', effectiveness: 'pending', verified: false, implementer: null },
    ],
    review_offset_days: 90,
  },
  {
    title: 'Confined space entry — process vessels',
    category: 'safety',
    site: 'Sydney Manufacturing — AU',
    source: 'AS 2865 review',
    description: 'Reactor vessels R-101 and R-203 are permit-required confined spaces. Atmospheric testing currently relies on a single 4-gas monitor without backup, no continuous monitoring during entry.',
    identified_by: 'sarah@sdsmanager.com',
    owner: 'sarah@sdsmanager.com',
    inherent: [0, 3],
    residual: [2, 1],
    status: 'Mitigating',
    controls: [
      { type: 'engineering', title: 'Forced ventilation with calibrated airflow per AS 2865', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
      { type: 'administrative', title: 'Two-person entry permit with continuous standby attendant', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
      { type: 'ppe', title: 'SCBA available within 30 sec of entry point', effectiveness: 'pending', verified: false, implementer: null },
    ],
    review_offset_days: 90,
  },
  {
    title: 'Asbestos in pre-1990 wall panels',
    category: 'chemical',
    site: 'Sydney Manufacturing — AU',
    source: 'Asbestos register review',
    description: 'Wall panels in old finishing bay tested positive for chrysotile fibers at 5% w/w. WHS Regs 2017 (NSW) Part 8.7 — must remain undisturbed; demo trigger at any maintenance work.',
    identified_by: 'sarah@sdsmanager.com',
    owner: 'sarah@sdsmanager.com',
    inherent: [1, 2],
    residual: [3, 0],
    status: 'Accepted',
    accepted_by: 'sarah@sdsmanager.com',
    accepted_justification: 'Panels in good condition per annual asbestos register audit. WHS Regs 2017 (NSW) Part 8.7 permits in-situ retention while undisturbed. ALARP demonstrated via management plan, labelling, and a documented removal trigger on any future maintenance breaching the panel surface. Removal cost-benefit deferred until next major refit.',
    review_offset_days: 365,
    controls: [
      { type: 'administrative', title: 'Asbestos management plan with annual register update', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
      { type: 'administrative', title: 'Visible warning labels on all containing panels', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
      { type: 'engineering', title: 'Encapsulation coating reapplied every 5 years', effectiveness: 'effective', verified: true, implementer: 'sarah@sdsmanager.com' },
    ],
  },

  // ─── Multi-site / corporate ──────────────────────────────────────────
  {
    title: 'Workplace violence — lone evening shift workers',
    category: 'psychosocial',
    site: 'Cleveland Plant',
    source: 'Cal/OSHA SB 553 review',
    description: 'Single supervisor on site during 22:00–06:00 shift with public-facing receiving dock. Workplace Violence Prevention Plan required under newly-applicable state regs.',
    identified_by: 'elena@sdsmanager.com',
    owner: 'priya@sdsmanager.com',
    inherent: [1, 1],
    residual: null,
    status: 'Assessed',
    controls: [],
    review_offset_days: 60,
  },

  // ─── Closed example ─────────────────────────────────────────────────
  {
    title: 'Trip hazard — loose cable trays in QC lab',
    category: 'safety',
    site: 'Cleveland Plant',
    source: 'Safety walk Q3 2025',
    description: 'Power and data cables run across the QC lab floor without tray management. Three near-trip events reported in 2 weeks.',
    identified_by: 'marcus@sdsmanager.com',
    owner: 'marcus@sdsmanager.com',
    inherent: [2, 1],
    residual: [4, 0],
    status: 'Closed',
    closed_reason: 'All cables routed through overhead tray system + floor channels. No reported events in 6 months. Closed at quarterly review.',
    closed_by: 'elena@sdsmanager.com',
    review_offset_days: -10,
    controls: [
      { type: 'engineering', title: 'Overhead cable tray system installed across QC lab', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
      { type: 'engineering', title: 'Floor channels for remaining benchtop power runs', effectiveness: 'effective', verified: true, implementer: 'marcus@sdsmanager.com' },
    ],
  },
];

const insertRisk = db.prepare(`
  INSERT INTO risks (
    risk_number, org_id, site_id, title, description, category, source,
    inherent_likelihood, inherent_consequence, inherent_severity, inherent_track, inherent_risk_level,
    residual_likelihood, residual_consequence, residual_severity, residual_track, residual_risk_level,
    status, identified_by, owner_id, review_date,
    accepted_by, accepted_at, accepted_justification,
    closed_at, closed_by, closed_reason
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertControl = db.prepare(`
  INSERT INTO risk_controls (
    risk_id, org_id, title, control_type, effectiveness,
    implemented_at, implemented_by, verified_at, verified_by, notes
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let riskCount = 0, controlCount = 0;

const run = db.transaction(() => {
  for (const r of RISKS) {
    const siteId = site(r.site);
    const identifiedBy = user(r.identified_by);
    const ownerId = r.owner ? user(r.owner) : null;

    const inherent = classify(r.inherent[0], r.inherent[1]);
    const residual = r.residual ? classify(r.residual[0], r.residual[1]) : { severity: null, track: null, level: null };

    const acceptedAt = r.status === 'Accepted' ? new Date().toISOString().slice(0, 10) : null;
    const acceptedBy = r.accepted_by ? user(r.accepted_by) : null;
    const closedAt = r.status === 'Closed' ? new Date().toISOString().slice(0, 10) : null;
    const closedBy = r.closed_by ? user(r.closed_by) : null;

    const riskNumber = nextRiskNumber();

    const result = insertRisk.run(
      riskNumber, ORG_ID, siteId, r.title, r.description, r.category, r.source || null,
      r.inherent[0], r.inherent[1], inherent.severity, inherent.track, inherent.level,
      r.residual ? r.residual[0] : null,
      r.residual ? r.residual[1] : null,
      residual.severity, residual.track, residual.level,
      r.status, identifiedBy, ownerId,
      r.review_offset_days != null ? daysFromNow(r.review_offset_days) : null,
      acceptedBy, acceptedAt, r.accepted_justification || null,
      closedAt, closedBy, r.closed_reason || null,
    );
    const riskId = result.lastInsertRowid;
    riskCount++;

    writeActivity({
      org_id: ORG_ID,
      entity_type: 'risk',
      entity_id: riskId,
      action: 'created',
      description: `registered risk ${riskNumber} — ${r.title}`,
      user_id: identifiedBy,
    });

    if (r.status !== 'Identified') {
      writeActivity({
        org_id: ORG_ID,
        entity_type: 'risk',
        entity_id: riskId,
        action: 'assessed',
        description: `assessed risk ${riskNumber} — L=${r.inherent[0]} C=${r.inherent[1]} → ${inherent.level}`,
        user_id: identifiedBy,
      });
    }

    for (const c of (r.controls || [])) {
      const impBy = c.implementer ? user(c.implementer) : null;
      const impAt = c.effectiveness === 'pending' ? null : daysFromNow(-30 - Math.floor(Math.random() * 60));
      const verAt = c.verified ? daysFromNow(-Math.floor(Math.random() * 30)) : null;
      const verBy = c.verified ? user(r.owner || r.identified_by) : null;

      const ctlResult = insertControl.run(
        riskId, ORG_ID, c.title, c.type, c.effectiveness,
        impAt, impBy, verAt, verBy, c.notes || null,
      );
      controlCount++;

      writeActivity({
        org_id: ORG_ID,
        entity_type: 'risk',
        entity_id: riskId,
        action: 'control_added',
        description: `added ${c.type} control — ${c.title}`,
        user_id: impBy || identifiedBy,
        metadata: { control_id: ctlResult.lastInsertRowid, control_type: c.type, effectiveness: c.effectiveness },
      });
    }

    if (r.status === 'Accepted' && acceptedBy) {
      writeActivity({
        org_id: ORG_ID,
        entity_type: 'risk',
        entity_id: riskId,
        action: 'accepted',
        description: `accepted residual risk for ${riskNumber} (ALARP demonstrated)`,
        user_id: acceptedBy,
      });
    }
    if (r.status === 'Closed' && closedBy) {
      writeActivity({
        org_id: ORG_ID,
        entity_type: 'risk',
        entity_id: riskId,
        action: 'closed',
        description: `closed risk ${riskNumber}`,
        user_id: closedBy,
      });
    }
  }
});
run();

console.log(`Seeded ${riskCount} risks and ${controlCount} controls for org ${ORG_ID}.`);

// Status summary so a re-runner can sanity-check at a glance.
const byStatus = db.prepare(
  'SELECT status, COUNT(*) c FROM risks WHERE org_id = ? GROUP BY status ORDER BY c DESC'
).all(ORG_ID);
console.log('By status:'); byStatus.forEach(s => console.log(`  ${s.status.padEnd(12)} ${s.c}`));
const byCategory = db.prepare(
  'SELECT category, COUNT(*) c FROM risks WHERE org_id = ? GROUP BY category ORDER BY c DESC'
).all(ORG_ID);
console.log('By category:'); byCategory.forEach(s => console.log(`  ${s.category.padEnd(14)} ${s.c}`));
