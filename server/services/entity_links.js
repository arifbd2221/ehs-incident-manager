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
export const LINKABLE_TYPES = new Set([
  'incident', 'investigation', 'capa', 'asset', 'document',
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
           'asset_id' as link_source
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
           'entity_link' as link_source
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
