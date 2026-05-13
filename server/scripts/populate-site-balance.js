// server/scripts/populate-site-balance.js
//
// The dev DB has heavy data weight at Cleveland (229 incidents, 8 risks)
// and Sheffield (687 incidents), with Dallas + Sydney nearly empty.
// Flipping the global SiteSelector to Dallas or Sydney makes every page
// look broken even though it isn't — the data just isn't there.
//
// This script adds plausible workplace-scenario records to bring all
// three under-served sites up to a demo-credible baseline:
//
//   Site                            +Incidents  +Assets  +Risks
//   Dallas Distribution             ~15         +4       +3
//   Sheffield Site                  0           +4       +3
//   Sydney Manufacturing — AU       ~12         +3       +3
//
// (Sheffield already has 687 incidents — only the assets / risks gaps
// are filled.)
//
// All seeded records are deliberately non-regulatory: non-OSHA-recordable,
// non-RIDDOR-reportable, status mostly Closed with a handful Active.
// Keeps the regulator-reporting paths clean while still populating the
// list / kanban / risk-register views.
//
// Idempotent — tagged by inserting an activity_log marker
// (action='site_balance_seeded'); re-runs after the marker exists bail.
//
// Run from server/:
//   node scripts/populate-site-balance.js

import db from '../db/connection.js';
import { nextIncidentNumber, nextAssetNumber, nextRiskNumber } from '../services/numbering.js';
import { writeActivity } from '../services/activity_log.js';

const ORG_ID = 1;

// Idempotency: a single marker activity_log row per run.
const marker = db.prepare(
  "SELECT id FROM activity_log WHERE org_id = ? AND action = 'site_balance_seeded' LIMIT 1"
).get(ORG_ID);
if (marker) {
  console.log('Site-balance demo already seeded (activity_log marker exists). Skipping.');
  process.exit(0);
}

// ── Resolve sites + users ───────────────────────────────────────────────
const sitesByName = new Map(
  db.prepare("SELECT id, name FROM sites WHERE org_id = ?").all(ORG_ID).map(s => [s.name, s.id])
);
const site = (name) => {
  const id = sitesByName.get(name);
  if (!id) throw new Error(`Site not found: ${name}`);
  return id;
};
const DALLAS = site('Dallas Distribution');
const SHEFFIELD = site('Sheffield Site');
const SYDNEY = site('Sydney Manufacturing — AU');

const usersByEmail = new Map(
  db.prepare("SELECT id, email FROM users WHERE org_id = ?").all(ORG_ID).map(u => [u.email, u.id])
);
const user = (email) => {
  const id = usersByEmail.get(email);
  if (!id) throw new Error(`User not found: ${email}`);
  return id;
};
const mehta = user('mehta@sdsmanager.com');     // Dallas owner
const james = user('james@sdsmanager.com');     // Sheffield owner
const sarah = user('sarah@sdsmanager.com');     // Sydney owner
const elena = user('elena@sdsmanager.com');     // EHS-wide

// Risk matrix authoritative lookup so scored risks/incidents agree with
// the matrix the FE renders.
const matrixCell = db.prepare(
  'SELECT severity, level_label FROM risk_matrix_cells WHERE likelihood = ? AND consequence = ?'
);
function classify(l, c) {
  const r = matrixCell.get(l, c);
  if (!r) throw new Error(`No matrix cell for L=${l} C=${c}`);
  const track = r.severity <= 2 ? 'A' : r.severity === 3 ? 'B' : 'C';
  return { severity: r.severity, track, level: r.level_label };
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19);
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ── 1) Assets ───────────────────────────────────────────────────────────
const assetIns = db.prepare(`
  INSERT INTO assets (asset_number, org_id, site_id, name, asset_type, location_description, serial_number, active)
  VALUES (?, ?, ?, ?, ?, ?, ?, 1)
`);
function addAsset(siteId, name, type, location, serial) {
  return assetIns.run(nextAssetNumber(), ORG_ID, siteId, name, type, location, serial).lastInsertRowid;
}

const dallasAssets = [
  addAsset(DALLAS, 'Forklift FL-12 — Class IV LPG', 'vehicle', 'Outbound dock', 'FL12-2021-77103'),
  addAsset(DALLAS, 'Battery charging station #1', 'machine', 'Charging room A', 'BCS-A-1981'),
  addAsset(DALLAS, 'Pallet wrapper PW-2', 'machine', 'Dispatch line', 'PW2-RotoStretch-44'),
  addAsset(DALLAS, 'Cardboard baler BA-1', 'machine', 'Recycling area', 'BA1-Maren-1102'),
];
const sheffieldAssets = [
  addAsset(SHEFFIELD, 'CNC mill CM-8', 'machine', 'Shop floor — Bay 2', 'CM8-Mazak-2019-318'),
  addAsset(SHEFFIELD, 'Hydraulic press HP-3', 'machine', 'Shop floor — Bay 4', 'HP3-Schuler-2017'),
  addAsset(SHEFFIELD, 'Cooling tower CT-1', 'building', 'Roof — North side', 'CT1-Baltimore-2015'),
  addAsset(SHEFFIELD, 'Forklift FL-21', 'vehicle', 'Goods-in dock', 'FL21-Linde-2020-447'),
];
const sydneyAssets = [
  addAsset(SYDNEY, 'Reactor vessel R-101', 'machine', 'Process bay 1', 'R101-Buchi-2022'),
  addAsset(SYDNEY, 'Reactor vessel R-203', 'machine', 'Process bay 2', 'R203-Buchi-2022'),
  addAsset(SYDNEY, 'Argon/CO2 gas manifold', 'chemical', 'Gas room', 'MAN-2024-AU-318'),
];
const assetCount = dallasAssets.length + sheffieldAssets.length + sydneyAssets.length;

// ── 2) Incidents (Dallas + Sydney only — Sheffield already has 687) ─────
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

// All seeded incidents are status='Closed' (most) or 'Triage' / 'Investigating'
// (a few) so the list, kanban, and dashboard all have material to render
// without firing any of the regulator-reporting paths.
function addIncident({ siteId, title, type, description, area, daysBack, severity, likelihood, consequence,
                       reportedBy, assetId = null, status = 'Closed', typeData = {}, immediateActions = null,
                       closedReason = null }) {
  const { track } = classify(likelihood, consequence);
  // The matrix cell's severity is authoritative for incidents too; recompute.
  const sev = matrixCell.get(likelihood, consequence).severity;
  const dt = daysAgo(daysBack);
  const closedAt = status === 'Closed' ? daysAgo(Math.max(0, daysBack - 7)) : null;
  return incIns.run(
    nextIncidentNumber(), ORG_ID, siteId, title, type, description, dt,
    area, null, null, assetId,
    sev, likelihood, consequence, track,
    status, reportedBy, 0, 0, null,
    '[]', null,
    0, null,
    null, null,
    0, null,
    JSON.stringify(typeData), immediateActions,
    closedAt, closedReason,
  ).lastInsertRowid;
}

const dallasIncidents = [
  { title: 'Near-miss — pallet collapse on staged outbound load', type: 'nearmiss',
    description: 'Operator noticed a leaning pallet during pre-shift walk; pallet shifted as it was being approached. No injury, area cordoned.',
    area: 'Outbound dock', daysBack: 12, likelihood: 2, consequence: 2,
    reportedBy: mehta, status: 'Closed', closedReason: 'Pallet stretched-wrapped + dunnage rule added to SOP.' },
  { title: 'Forklift FL-12 struck rack upright at row C-14', type: 'property',
    description: 'Operator clipped a rack upright while reversing. Upright dented but structurally sound per post-incident inspection.',
    area: 'Aisle C', daysBack: 21, likelihood: 3, consequence: 1, assetId: dallasAssets[0],
    reportedBy: mehta, status: 'Closed', closedReason: 'Repair completed; refresher training delivered.' },
  { title: 'Near-miss — pedestrian / forklift at receiving door', type: 'nearmiss',
    description: 'Driver entered receiving area through unmarked pedestrian gate; forklift braked hard at 4 m. No contact.',
    area: 'Receiving', daysBack: 28, likelihood: 2, consequence: 2,
    reportedBy: mehta, status: 'Closed', closedReason: 'High-vis floor decals + driver inductions updated.' },
  { title: 'Manual handling strain — outbound dispatch', type: 'injury',
    description: 'Dispatcher reported lower-back discomfort after lifting a 23 kg carton. Self-reported, declined medical attention.',
    area: 'Dispatch line', daysBack: 33, likelihood: 3, consequence: 1,
    reportedBy: mehta, status: 'Closed', closedReason: 'Two-person lift rule reinforced; vacuum lift-assist scheduled.' },
  { title: 'Hydrogen sensor false alarm — charging room A', type: 'unsafe',
    description: 'H2 sensor in charging room triggered automatic evacuation. Recalibration showed sensor drift, no actual H2 above LEL.',
    area: 'Charging room A', daysBack: 40, likelihood: 3, consequence: 2, assetId: dallasAssets[1],
    reportedBy: mehta, status: 'Closed', closedReason: 'Sensor recalibrated; quarterly cal cadence added.' },
  { title: 'Cardboard baler BA-1 jam — finger pinch (no injury)', type: 'nearmiss',
    description: 'Operator clearing a jam reached past the photoelectric guard; the door was open but ram retracted. No contact.',
    area: 'Recycling area', daysBack: 47, likelihood: 2, consequence: 3, assetId: dallasAssets[3],
    reportedBy: mehta, status: 'Closed', closedReason: 'LOTO refresher delivered; guard-position interlock verified.' },
  { title: 'Slip on melted snow — east entry vestibule', type: 'injury',
    description: 'Office staff slipped on tracked-in snow water. Caught balance on railing. No injury beyond a bruised palm.',
    area: 'East entry', daysBack: 55, likelihood: 3, consequence: 1,
    reportedBy: mehta, status: 'Closed', closedReason: 'Mat rotation cadence increased; salt-bin SLA changed.' },
  { title: 'Pallet wrapper PW-2 emergency stop activated', type: 'unsafe',
    description: 'Wrapper e-stop fired when an operator approached during cycle. No contact; root cause traced to misaligned light-curtain mount.',
    area: 'Dispatch line', daysBack: 64, likelihood: 2, consequence: 2, assetId: dallasAssets[2],
    reportedBy: mehta, status: 'Closed', closedReason: 'Curtain remounted; alignment now part of PM checklist.' },
  { title: 'Improper PPE observation — driver without high-vis', type: 'observation',
    description: 'External driver entered loading area without high-vis vest. Site PPE rules briefed at gate; driver returned in vest.',
    area: 'Loading area', daysBack: 70, likelihood: 4, consequence: 0,
    reportedBy: mehta, status: 'Closed', closedReason: 'Gate sign added; carrier compliance flagged with logistics partner.' },
  { title: 'Battery acid spill (~50 mL) during charging', type: 'env',
    description: 'Small electrolyte spill during charger handoff. Contained by acid-resistant spill kit; no drain entry.',
    area: 'Charging room A', daysBack: 78, likelihood: 3, consequence: 1, assetId: dallasAssets[1],
    reportedBy: mehta, status: 'Closed', closedReason: 'Drip tray added; handoff procedure updated.' },
  { title: 'Forklift FL-12 — overdue annual inspection flag', type: 'observation',
    description: 'Daily check sheet flagged annual inspection 6 days overdue. Truck removed from service pending inspection.',
    area: 'Outbound dock', daysBack: 85, likelihood: 2, consequence: 1, assetId: dallasAssets[0],
    reportedBy: mehta, status: 'Closed', closedReason: 'Inspection completed; PM calendar tightened.' },
  { title: 'Dock plate trip near-miss — Bay 3', type: 'nearmiss',
    description: 'Driver tripped on a stowed dock plate. No injury. Plate had been left out-of-position after morning unload.',
    area: 'Bay 3 dock', daysBack: 92, likelihood: 3, consequence: 1,
    reportedBy: mehta, status: 'Closed', closedReason: 'Dock-plate stow markings refreshed; checklist line added.' },
  // Two active to populate the kanban
  { title: 'Forklift collision with bollard at aisle D', type: 'property',
    description: 'Forklift glanced a bollard while backing out. Bollard scuffed, truck operational. Investigating root cause.',
    area: 'Aisle D', daysBack: 4, likelihood: 3, consequence: 1, assetId: dallasAssets[0],
    reportedBy: mehta, status: 'Investigating', immediateActions: 'Truck inspected; driver retraining scheduled.' },
  { title: 'Pedestrian gate latch failure — Bay 2 dock', type: 'unsafe',
    description: 'Pedestrian gate at Bay 2 dock fails to latch closed. Currently barriered off. Replacement latch ordered.',
    area: 'Bay 2 dock', daysBack: 2, likelihood: 3, consequence: 2,
    reportedBy: mehta, status: 'Triage', immediateActions: 'Barrier in place; replacement latch ETA 5 days.' },
  { title: 'Manual handling concern — palletizing station 3', type: 'observation',
    description: 'Repeated lifts above shoulder height at palletizing station 3. Ergonomic review requested.',
    area: 'Palletizing line', daysBack: 1, likelihood: 4, consequence: 1,
    reportedBy: mehta, status: 'New' },
];

const sydneyIncidents = [
  { title: 'Confined space entry — vessel R-101 routine cleanout', type: 'observation',
    description: 'Quarterly cleanout entry into R-101 completed under permit. Attendant present, 4-gas monitor calibrated. No issues — logged for audit trail.',
    area: 'Process bay 1', daysBack: 18, likelihood: 3, consequence: 1, assetId: sydneyAssets[0],
    reportedBy: sarah, status: 'Closed', closedReason: 'Standard entry, no abnormal readings.' },
  { title: 'Argon cylinder regulator leak — gas room', type: 'unsafe',
    description: 'Audible leak at the argon manifold regulator. O2 in gas room remained 20.9% via continuous monitor. Cylinder isolated.',
    area: 'Gas room', daysBack: 25, likelihood: 2, consequence: 2, assetId: sydneyAssets[2],
    reportedBy: sarah, status: 'Closed', closedReason: 'Regulator replaced; manifold pressure-tested.' },
  { title: 'Reactor R-203 — overpressure relief lifted', type: 'unsafe',
    description: 'Pressure relief valve on R-203 lifted at 6.2 bar during a batch. Valve reseated; batch quarantined for QA.',
    area: 'Process bay 2', daysBack: 31, likelihood: 2, consequence: 3, assetId: sydneyAssets[1],
    reportedBy: sarah, status: 'Closed', closedReason: 'Recipe parameters adjusted; PRV tested per AS 1271.' },
  { title: 'Near-miss — slip on hydraulic oil near forklift dock', type: 'nearmiss',
    description: 'Forklift driver dismounted, slipped on small hydraulic oil patch. Caught balance on the truck. No injury.',
    area: 'Forklift dock', daysBack: 38, likelihood: 3, consequence: 1,
    reportedBy: sarah, status: 'Closed', closedReason: 'Hydraulic seal replaced; spill-response kit relocated nearer the bay.' },
  { title: 'Eye-wash station obstruction — finishing bay', type: 'observation',
    description: 'Emergency eyewash in finishing bay obstructed by pallets staged for despatch. Cleared immediately.',
    area: 'Finishing bay', daysBack: 44, likelihood: 4, consequence: 1,
    reportedBy: sarah, status: 'Closed', closedReason: 'Floor markings added around eyewash; supervisor briefed.' },
  { title: 'Fatigue self-report on night shift', type: 'observation',
    description: 'Operator self-reported fatigue at handover (3rd consecutive 12-hr night). Rest break taken, partner covered the rest of the shift.',
    area: 'Process bay 1', daysBack: 50, likelihood: 4, consequence: 1,
    reportedBy: sarah, status: 'Closed', closedReason: 'Roster reviewed; recovery break enforced before next block.' },
  { title: 'Chemical splash — caustic, gloved hand contact', type: 'injury',
    description: 'Splash of 30% NaOH on gloved hand during decant. Glove changed immediately; no skin contact. Glove integrity post-incident OK.',
    area: 'Process bay 2', daysBack: 60, likelihood: 2, consequence: 2,
    reportedBy: sarah, status: 'Closed', closedReason: 'Decant SOP amended to require secondary containment.' },
  { title: 'Trip hazard — coiled hose, gas room', type: 'unsafe',
    description: 'Charging hose for the manifold left coiled across the gas-room walkway. Identified during morning walk-around.',
    area: 'Gas room', daysBack: 67, likelihood: 4, consequence: 0, assetId: sydneyAssets[2],
    reportedBy: sarah, status: 'Closed', closedReason: 'Wall reel installed; hose-stowage checklist updated.' },
  { title: 'Vehicle reversing near pedestrian — yard', type: 'nearmiss',
    description: 'Delivery truck reversed in the yard without spotter. Pedestrian at 6 m noticed and waved off. No contact.',
    area: 'External yard', daysBack: 74, likelihood: 2, consequence: 2,
    reportedBy: sarah, status: 'Closed', closedReason: 'Spotter policy formalised in yard SOP; signage installed.' },
  // Two active
  { title: 'Asbestos panel — minor surface damage observed', type: 'unsafe',
    description: 'Asbestos register panel A-12 shows a hairline surface crack. Encapsulation coating intact. Specialist review requested.',
    area: 'Finishing bay', daysBack: 5, likelihood: 1, consequence: 3,
    reportedBy: sarah, status: 'Investigating', immediateActions: 'Area cordoned; specialist scheduled this week.' },
  { title: 'Fatigue risk — roster spike on month-end', type: 'observation',
    description: 'Three consecutive 12-hr night shifts rostered for month-end close. Fatigue risk assessment flagged amber.',
    area: 'Process bay 1', daysBack: 3, likelihood: 4, consequence: 1,
    reportedBy: sarah, status: 'Triage' },
  { title: 'Confined space monitor calibration overdue', type: 'observation',
    description: 'Backup 4-gas monitor calibration overdue by 8 days. Primary monitor in date; backup tagged out of service.',
    area: 'Process bay 1', daysBack: 1, likelihood: 2, consequence: 2,
    reportedBy: sarah, status: 'New' },
];

let incidentCount = 0;
for (const inc of dallasIncidents) { addIncident({ ...inc, siteId: DALLAS }); incidentCount++; }
for (const inc of sydneyIncidents) { addIncident({ ...inc, siteId: SYDNEY }); incidentCount++; }

// ── 3) Additional risks (Dallas, Sheffield, Sydney) ─────────────────────
const riskIns = db.prepare(`
  INSERT INTO risks (
    risk_number, org_id, site_id, title, description, category, source,
    inherent_likelihood, inherent_consequence, inherent_severity, inherent_track, inherent_risk_level,
    residual_likelihood, residual_consequence, residual_severity, residual_track, residual_risk_level,
    status, identified_by, owner_id, review_date
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const ctlIns = db.prepare(`
  INSERT INTO risk_controls (
    risk_id, org_id, title, control_type, effectiveness,
    implemented_at, implemented_by, verified_at, verified_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function addRisk({ title, description, category, siteId, ownerId, source, inherent, residual, status, review, controls = [] }) {
  const i = classify(inherent[0], inherent[1]);
  const r = residual ? classify(residual[0], residual[1]) : { severity: null, track: null, level: null };
  const result = riskIns.run(
    nextRiskNumber(), ORG_ID, siteId, title, description, category, source || null,
    inherent[0], inherent[1], i.severity, i.track, i.level,
    residual ? residual[0] : null, residual ? residual[1] : null, r.severity, r.track, r.level,
    status, ownerId, ownerId, review || null,
  );
  const riskId = result.lastInsertRowid;
  for (const c of controls) {
    const impAt = c.effectiveness === 'pending' ? null : daysAgo(30 + Math.floor(Math.random() * 60));
    const verAt = c.verified ? daysAgo(Math.floor(Math.random() * 30)) : null;
    ctlIns.run(riskId, ORG_ID, c.title, c.type, c.effectiveness, impAt, ownerId, verAt, c.verified ? ownerId : null);
  }
  writeActivity({ org_id: ORG_ID, entity_type: 'risk', entity_id: riskId, action: 'created',
    description: `registered risk (site balance seed) — ${title}`, user_id: ownerId });
  return riskId;
}

const newRisks = [
  // Dallas
  { siteId: DALLAS, title: 'Forklift charging — H2 buildup outside ventilation hours', category: 'physical', ownerId: mehta,
    source: 'NFPA 505 review', description: 'After-hours charging continues during the cooling-off period when the H2 exhaust fan is on its low-speed cycle. Confluence with humidity events raises the buildup risk.',
    inherent: [1, 2], residual: [3, 1], status: 'Controlled', review: daysFromNow(180),
    controls: [
      { type: 'engineering', title: 'Fan low-speed schedule extended through humidity events', effectiveness: 'effective', verified: true },
      { type: 'administrative', title: 'Off-hours charging block 22:00–05:00', effectiveness: 'effective', verified: true },
    ] },
  { siteId: DALLAS, title: 'Cold-stress exposure in chilled outbound staging', category: 'health', ownerId: mehta,
    source: 'Worker complaint', description: 'Staging area for chilled outbound pallets maintained at 4°C; dispatchers spend 30–60 min per shift in the zone without dedicated cold-weather PPE.',
    inherent: [0, 1], residual: [2, 0], status: 'Mitigating', review: daysFromNow(120),
    controls: [
      { type: 'ppe', title: 'Insulated jackets + thermal gloves issued to dispatch team', effectiveness: 'effective', verified: true },
      { type: 'administrative', title: 'Max 20 min continuous time in chilled staging', effectiveness: 'partially_effective', verified: false },
    ] },
  { siteId: DALLAS, title: 'Rack overload at high-bay storage', category: 'safety', ownerId: mehta,
    source: 'Annual rack inspection', description: 'High-bay rack at row G shows minor uprights deflection under peak load. Engineering review confirms within tolerance but recommends load redistribution.',
    inherent: [1, 2], residual: [3, 1], status: 'Mitigating', review: daysFromNow(90),
    controls: [
      { type: 'engineering', title: 'Capacity labels reduced by 15% across row G', effectiveness: 'effective', verified: true },
      { type: 'administrative', title: 'Quarterly rack inspection cadence (was annual)', effectiveness: 'effective', verified: true },
    ] },

  // Sheffield
  { siteId: SHEFFIELD, title: 'CNC coolant mist exposure', category: 'chemical', ownerId: james,
    source: 'HSE EH40 review', description: 'Mist sampling at CM-8 / HP-3 showed metalworking-fluid mist near the EH40 WEL (1 mg/m³). Current LEV needs uprating.',
    inherent: [0, 1], residual: [2, 1], status: 'Mitigating', review: daysFromNow(120),
    controls: [
      { type: 'engineering', title: 'High-velocity LEV upgrade scheduled Q3', effectiveness: 'pending', verified: false },
      { type: 'administrative', title: 'Quarterly mist sampling rota', effectiveness: 'effective', verified: true },
    ] },
  { siteId: SHEFFIELD, title: 'Hand-arm vibration on grinder bench', category: 'ergonomic', ownerId: james,
    source: 'HSE HAV exposure tool', description: 'Daily HAV exposure on the grinding bench measured at 3.5 m/s² A(8) — above the EAV. Controls and rotation in place.',
    inherent: [0, 1], residual: [2, 1], status: 'Controlled', review: daysFromNow(365),
    controls: [
      { type: 'engineering', title: 'Anti-vibration tooling deployed across grinder bench', effectiveness: 'effective', verified: true },
      { type: 'administrative', title: 'Rotation schedule capping daily grinder exposure to <2.5 m/s² A(8)', effectiveness: 'effective', verified: true },
      { type: 'administrative', title: 'Annual HAV health surveillance', effectiveness: 'effective', verified: true },
    ] },
  { siteId: SHEFFIELD, title: 'Yard reverse-manoeuvre risk', category: 'safety', ownerId: james,
    source: 'Near-miss INC-2026-0431', description: 'Articulated lorries reverse in the goods-in yard without a banksman during night shift unloading. Two near-misses in the last 60 days.',
    inherent: [1, 2], residual: null, status: 'Assessed', review: daysFromNow(60),
    controls: [] },

  // Sydney
  { siteId: SYDNEY, title: 'Hot-work permit compliance during minor repairs', category: 'safety', ownerId: sarah,
    source: 'AS 1674.1 review', description: 'Maintenance team performing brief grinding/welding for minor repairs sometimes skips formal hot-work permit. Two observations in the last quarter.',
    inherent: [1, 2], residual: [3, 1], status: 'Mitigating', review: daysFromNow(90),
    controls: [
      { type: 'administrative', title: 'Permit auto-issued via maintenance ticket integration', effectiveness: 'pending', verified: false },
      { type: 'administrative', title: 'Spot audits weekly during day shift', effectiveness: 'effective', verified: true },
    ] },
  { siteId: SYDNEY, title: 'Manual handling — drum decanting from R-203', category: 'ergonomic', ownerId: sarah,
    source: 'Workforce ergonomic survey', description: 'Operators decant 200L drums from R-203 outlet manually. Awkward posture + load >NIOSH RWL. Drum dolly available but inconsistently used.',
    inherent: [1, 1], residual: [3, 0], status: 'Mitigating', review: daysFromNow(120),
    controls: [
      { type: 'engineering', title: 'Powered drum trolley acquired for R-203 outlet', effectiveness: 'partially_effective', verified: true },
      { type: 'administrative', title: 'Drum-handling SOP mandates trolley use above 80L', effectiveness: 'effective', verified: true },
    ] },
  { siteId: SYDNEY, title: 'Workplace bullying — early indicators in night-shift team', category: 'psychosocial', ownerId: sarah,
    source: 'Anonymous worker feedback', description: 'Anonymous feedback channel surfaced two reports of intimidating behaviour on the night shift. WHS Act 2011 (NSW) "psychosocial hazards" obligations apply.',
    inherent: [1, 1], residual: null, status: 'Assessed', review: daysFromNow(60),
    controls: [] },
];

let riskCount = 0;
for (const r of newRisks) { addRisk(r); riskCount++; }

// ── 4) Idempotency marker ───────────────────────────────────────────────
writeActivity({
  org_id: ORG_ID,
  entity_type: 'system',
  entity_id: null,
  action: 'site_balance_seeded',
  description: `site-balance demo seed: +${incidentCount} incidents (Dallas/Sydney), +${assetCount} assets (Dallas/Sheffield/Sydney), +${riskCount} risks (Dallas/Sheffield/Sydney)`,
  user_id: elena,
  metadata: { incidents: incidentCount, assets: assetCount, risks: riskCount },
});

console.log(`Seeded:`);
console.log(`  incidents: +${incidentCount} (Dallas + Sydney)`);
console.log(`  assets:    +${assetCount} (Dallas/Sheffield/Sydney)`);
console.log(`  risks:     +${riskCount} (Dallas/Sheffield/Sydney)`);

// Sanity summary
const summary = db.prepare(`
  SELECT s.name,
    (SELECT COUNT(*) FROM incidents i WHERE i.site_id = s.id) AS incidents,
    (SELECT COUNT(*) FROM assets a WHERE a.site_id = s.id AND a.active = 1) AS assets,
    (SELECT COUNT(*) FROM risks r WHERE r.site_id = s.id) AS risks
  FROM sites s WHERE s.org_id = ? ORDER BY s.id
`).all(ORG_ID);
console.log('\nNew per-site totals:');
for (const row of summary) {
  console.log(`  ${row.name.padEnd(34)} incidents=${row.incidents}  assets=${row.assets}  risks=${row.risks}`);
}
