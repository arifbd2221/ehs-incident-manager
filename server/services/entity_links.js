// server/services/entity_links.js — polymorphic any-to-any link helpers.
//
// Wraps the entity_links table (created in migration 001):
//   (id, source_type, source_id, target_type, target_id, link_role, created_at, created_by)
//
// Use cases:
//   - Asset linked to Incident
//   - Document linked to Incident / Investigation / CAPA / Asset
//   - CAPA addresses multiple incidents (systemic fix)
// Whatever the model dictates — the link table is intentionally generic.

import db from '../db/connection.js';

// Recognized entity types. Add to this set when adding a new linkable entity.
// Inspections are linkable polymorphically — they have no direct FK to other
// entities, so cross-references travel exclusively via entity_links.
export const LINKABLE_TYPES = new Set([
  'incident', 'investigation', 'capa', 'asset', 'document', 'inspection', 'risk',
]);

/**
 * Create a link. Idempotent on (source_type, source_id, target_type, target_id, link_role)
 * via the unique index on those 5 columns. Returns the existing row id on duplicate.
 */
export function createLink({ source_type, source_id, target_type, target_id, link_role = null, created_by = null }) {
  if (!LINKABLE_TYPES.has(source_type)) throw new Error(`Invalid source_type: ${source_type}`);
  if (!LINKABLE_TYPES.has(target_type)) throw new Error(`Invalid target_type: ${target_type}`);

  const existing = db.prepare(`
    SELECT id FROM entity_links
    WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ?
      AND COALESCE(link_role, '') = COALESCE(?, '')
  `).get(source_type, source_id, target_type, target_id, link_role);

  if (existing) return { id: existing.id, created: false };

  const result = db.prepare(`
    INSERT INTO entity_links (source_type, source_id, target_type, target_id, link_role, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(source_type, source_id, target_type, target_id, link_role, created_by);

  return { id: result.lastInsertRowid, created: true };
}

export function deleteLink(id) {
  const result = db.prepare('DELETE FROM entity_links WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getLink(id) {
  return db.prepare('SELECT * FROM entity_links WHERE id = ?').get(id);
}

/**
 * List links where the given entity is the SOURCE.
 * e.g. listLinksFrom('asset', 5) → all rows where this asset is on the source side.
 */
export function listLinksFrom({ source_type, source_id, target_type = null, link_role = null }) {
  const where = ['source_type = ?', 'source_id = ?'];
  const params = [source_type, source_id];
  if (target_type) { where.push('target_type = ?'); params.push(target_type); }
  if (link_role) { where.push('link_role = ?'); params.push(link_role); }
  return db.prepare(`SELECT * FROM entity_links WHERE ${where.join(' AND ')} ORDER BY created_at DESC`).all(...params);
}

/**
 * List links where the given entity is the TARGET.
 */
export function listLinksTo({ target_type, target_id, source_type = null, link_role = null }) {
  const where = ['target_type = ?', 'target_id = ?'];
  const params = [target_type, target_id];
  if (source_type) { where.push('source_type = ?'); params.push(source_type); }
  if (link_role) { where.push('link_role = ?'); params.push(link_role); }
  return db.prepare(`SELECT * FROM entity_links WHERE ${where.join(' AND ')} ORDER BY created_at DESC`).all(...params);
}

/**
 * List links touching the given entity in EITHER direction.
 * Returns rows annotated with { is_source: bool } so callers know which side this entity is on.
 */
export function listLinksTouching({ entity_type, entity_id }) {
  const rows = db.prepare(`
    SELECT *,
      CASE WHEN source_type = ? AND source_id = ? THEN 1 ELSE 0 END AS is_source
    FROM entity_links
    WHERE (source_type = ? AND source_id = ?) OR (target_type = ? AND target_id = ?)
    ORDER BY created_at DESC
  `).all(entity_type, entity_id, entity_type, entity_id, entity_type, entity_id);
  return rows;
}

// ---------------------------------------------------------------------------
// Back-tracking ("Referenced by") helpers — P3-L1
// ---------------------------------------------------------------------------
// `referencesFor(entity_type, entity_id, orgId)` returns four buckets:
//   { incidents, investigations, capas, documents }
// Each row is enriched with the display fields the FE needs (numbers, titles,
// status, when, who) so a single round-trip feeds the Referenced-by card.
//
// "Referenced by" includes:
//   * direct FK references where they exist:
//       - incidents.asset_id   → for asset → incidents
//       - investigations.incident_id → for incident → investigations
//       - capas.incident_id    → for incident → capas
//       - capas.investigation_id → for investigation → capas
//   * polymorphic entity_links in either direction (source ↔ target).
// Direct + poly are deduped by row id; direct rows take precedence.
// Inspections aren't covered yet — they aren't in LINKABLE_TYPES and have no
// direct FK to any LINKABLE entity. Adding them is a follow-up.

const INCIDENT_FIELDS = `
  i.id, i.incident_number, i.title, i.type, i.severity, i.track, i.status,
  i.incident_datetime, i.created_at,
  s.name AS site_name,
  u.name AS reporter_name, u.initials AS reporter_initials
`;
const INCIDENT_JOINS = `
  LEFT JOIN sites s ON s.id = i.site_id
  LEFT JOIN users u ON u.id = i.reported_by
`;

const INVESTIGATION_FIELDS = `
  inv.id, inv.investigation_number, inv.status, inv.track,
  inv.started_at, inv.due_date, inv.created_at,
  inc.incident_number, inc.title AS incident_title,
  u.name AS lead_name, u.initials AS lead_initials
`;
const INVESTIGATION_JOINS = `
  LEFT JOIN incidents inc ON inc.id = inv.incident_id
  LEFT JOIN users u ON u.id = inv.lead_investigator
`;

const CAPA_FIELDS = `
  c.id, c.capa_number, c.title, c.type, c.priority, c.status,
  c.due_date, c.source_type, c.created_at,
  ow.name AS owner_name, ow.initials AS owner_initials,
  vf.name AS verifier_name, vf.initials AS verifier_initials
`;
const CAPA_JOINS = `
  LEFT JOIN users ow ON ow.id = c.owner_id
  LEFT JOIN users vf ON vf.id = c.verifier_id
`;

const DOCUMENT_FIELDS = `
  d.id, d.document_number, d.name, d.document_type,
  d.mime_type, d.size_bytes, d.folder_id, d.created_at,
  u.name AS uploader_name, u.initials AS uploader_initials
`;
const DOCUMENT_JOINS = `
  LEFT JOIN users u ON u.id = d.uploaded_by
`;

const INSPECTION_FIELDS = `
  ins.id, ins.inspection_number, ins.title, ins.status,
  ins.conducted_on, ins.location, ins.completed_at, ins.created_at,
  t.name AS template_name,
  u.name AS started_by_name, u.initials AS started_by_initials
`;
const INSPECTION_JOINS = `
  LEFT JOIN templates t ON t.id = ins.template_id
  LEFT JOIN users u ON u.id = ins.started_by
`;

const ASSET_FIELDS = `
  a.id, a.asset_number, a.name, a.asset_type, a.location_description,
  a.serial_number, a.active, a.created_at,
  s.name AS site_name
`;
const ASSET_JOINS = `
  LEFT JOIN sites s ON s.id = a.site_id
`;

const RISK_FIELDS = `
  r.id, r.risk_number, r.title, r.category, r.status,
  r.inherent_severity, r.inherent_risk_level,
  r.residual_severity, r.residual_risk_level,
  r.created_at,
  s.name AS site_name
`;
const RISK_JOINS = `
  LEFT JOIN sites s ON s.id = r.site_id
`;

// Pull rows of `target_alias` table linked to (entity_type, entity_id) via
// entity_links in either direction. Caller supplies the SELECT fields and
// JOINs for display. Always org-scoped via the target row's org_id.
//
// link_id is included so the FE can offer an "unlink" affordance per row.
// Direct-FK rows (e.g., incidents.asset_id) carry link_id=NULL and are not
// removable from the references card — those are structural FKs.
function polyJoinTo({ entity_type, entity_id, target_type, target_table, target_alias, select_fields, joins, orgId }) {
  return db.prepare(`
    SELECT ${select_fields}, el.id AS link_id
    FROM entity_links el
    JOIN ${target_table} ${target_alias} ON ${target_alias}.id = CASE
      WHEN el.source_type = ? AND el.source_id = ? AND el.target_type = ? THEN el.target_id
      WHEN el.target_type = ? AND el.target_id = ? AND el.source_type = ? THEN el.source_id
      ELSE NULL
    END
    ${joins}
    WHERE ${target_alias}.org_id = ?
  `).all(entity_type, entity_id, target_type, entity_type, entity_id, target_type, orgId);
}

function dedupeById(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

function incidentsReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'incident') return [];
  if (entity_type === 'asset') return incidentsLinkedToAsset(entity_id, orgId);
  // For investigation / capa / document, only polymorphic links apply.
  return polyJoinTo({
    entity_type, entity_id,
    target_type: 'incident', target_table: 'incidents', target_alias: 'i',
    select_fields: INCIDENT_FIELDS, joins: INCIDENT_JOINS, orgId,
  });
}

function investigationsReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'investigation') return [];

  // Direct FK: investigations.incident_id
  let direct = [];
  if (entity_type === 'incident') {
    direct = db.prepare(`
      SELECT ${INVESTIGATION_FIELDS}, NULL AS link_id
      FROM investigations inv
      ${INVESTIGATION_JOINS}
      WHERE inv.incident_id = ? AND inv.org_id = ?
    `).all(entity_id, orgId);
  }

  const poly = polyJoinTo({
    entity_type, entity_id,
    target_type: 'investigation', target_table: 'investigations', target_alias: 'inv',
    select_fields: INVESTIGATION_FIELDS, joins: INVESTIGATION_JOINS, orgId,
  });

  return dedupeById([...direct, ...poly]);
}

function capasReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'capa') return [];

  // Direct FK: capas.incident_id when entity is incident; capas.investigation_id when entity is investigation
  let direct = [];
  if (entity_type === 'incident') {
    direct = db.prepare(`
      SELECT ${CAPA_FIELDS}, NULL AS link_id
      FROM capas c
      ${CAPA_JOINS}
      WHERE c.incident_id = ? AND c.org_id = ?
    `).all(entity_id, orgId);
  } else if (entity_type === 'investigation') {
    direct = db.prepare(`
      SELECT ${CAPA_FIELDS}, NULL AS link_id
      FROM capas c
      ${CAPA_JOINS}
      WHERE c.investigation_id = ? AND c.org_id = ?
    `).all(entity_id, orgId);
  }

  const poly = polyJoinTo({
    entity_type, entity_id,
    target_type: 'capa', target_table: 'capas', target_alias: 'c',
    select_fields: CAPA_FIELDS, joins: CAPA_JOINS, orgId,
  });

  return dedupeById([...direct, ...poly]);
}

function documentsReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'document') return [];
  // Documents only link via entity_links — no direct FK columns exist.
  return polyJoinTo({
    entity_type, entity_id,
    target_type: 'document', target_table: 'documents', target_alias: 'd',
    select_fields: DOCUMENT_FIELDS, joins: DOCUMENT_JOINS, orgId,
  });
}

function inspectionsReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'inspection') return [];
  // Inspections only link via entity_links — no direct FK columns exist
  // between inspections and assets / incidents / capas / documents.
  return polyJoinTo({
    entity_type, entity_id,
    target_type: 'inspection', target_table: 'inspections', target_alias: 'ins',
    select_fields: INSPECTION_FIELDS, joins: INSPECTION_JOINS, orgId,
  });
}

function risksReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'risk') return [];
  return polyJoinTo({
    entity_type, entity_id,
    target_type: 'risk', target_table: 'risks', target_alias: 'r',
    select_fields: RISK_FIELDS, joins: RISK_JOINS, orgId,
  });
}

function assetsReferencing(entity_type, entity_id, orgId) {
  if (entity_type === 'asset') return [];

  // Direct FK: incidents.asset_id when entity is incident.
  let direct = [];
  if (entity_type === 'incident') {
    direct = db.prepare(`
      SELECT ${ASSET_FIELDS}, NULL AS link_id
      FROM assets a
      ${ASSET_JOINS}
      WHERE a.id = (SELECT asset_id FROM incidents WHERE id = ?) AND a.org_id = ?
    `).all(entity_id, orgId);
  }

  const poly = polyJoinTo({
    entity_type, entity_id,
    target_type: 'asset', target_table: 'assets', target_alias: 'a',
    select_fields: ASSET_FIELDS, joins: ASSET_JOINS, orgId,
  });

  return dedupeById([...direct, ...poly]);
}

export function referencesFor(entity_type, entity_id, orgId) {
  if (!LINKABLE_TYPES.has(entity_type)) {
    return { incidents: [], investigations: [], capas: [], documents: [], inspections: [], assets: [], risks: [] };
  }
  const eid = Number(entity_id);
  return {
    incidents: incidentsReferencing(entity_type, eid, orgId),
    investigations: investigationsReferencing(entity_type, eid, orgId),
    capas: capasReferencing(entity_type, eid, orgId),
    documents: documentsReferencing(entity_type, eid, orgId),
    inspections: inspectionsReferencing(entity_type, eid, orgId),
    assets: assetsReferencing(entity_type, eid, orgId),
    risks: risksReferencing(entity_type, eid, orgId),
  };
}

/**
 * For an asset, return the list of incident rows linked to it via either
 *   - the dedicated incidents.asset_id FK (set when reporting an incident at this asset)
 *   - an entity_link in either direction with target/source_type='incident'
 *
 * Returns merged + deduped, joined with site + reporter + assignee names so the FE can
 * render a useful row without extra queries.
 */
export function incidentsLinkedToAsset(assetId, orgId) {
  // Direct FK route
  const direct = db.prepare(`
    SELECT i.id, i.incident_number, i.title, i.type, i.severity, i.track, i.status,
           i.incident_datetime, i.created_at,
           s.name as site_name,
           u.name as reporter_name, u.initials as reporter_initials,
           'asset_id' as link_source,
           NULL as link_id
    FROM incidents i
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    WHERE i.asset_id = ? AND i.org_id = ?
  `).all(assetId, orgId);

  // Polymorphic route — links from asset → incident OR incident → asset
  const linked = db.prepare(`
    SELECT i.id, i.incident_number, i.title, i.type, i.severity, i.track, i.status,
           i.incident_datetime, i.created_at,
           s.name as site_name,
           u.name as reporter_name, u.initials as reporter_initials,
           'entity_link' as link_source,
           el.id as link_id
    FROM entity_links el
    JOIN incidents i ON i.id = CASE
      WHEN el.source_type = 'asset' AND el.source_id = ? AND el.target_type = 'incident' THEN el.target_id
      WHEN el.target_type = 'asset' AND el.target_id = ? AND el.source_type = 'incident' THEN el.source_id
      ELSE NULL
    END
    LEFT JOIN sites s ON s.id = i.site_id
    LEFT JOIN users u ON u.id = i.reported_by
    WHERE i.org_id = ?
  `).all(assetId, assetId, orgId);

  // Dedupe by incident id; prefer 'asset_id' over 'entity_link' if both
  const map = new Map();
  for (const row of direct) map.set(row.id, row);
  for (const row of linked) if (!map.has(row.id)) map.set(row.id, row);
  return [...map.values()].sort((a, b) => (b.incident_datetime || '').localeCompare(a.incident_datetime || ''));
}
