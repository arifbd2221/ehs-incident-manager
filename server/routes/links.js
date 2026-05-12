// server/routes/links.js — generic entity_links CRUD.
//
// POST   /api/links                        create link {source_type, source_id, target_type, target_id, link_role?}
// GET    /api/links?source_type=X&source_id=Y[&target_type=Z]   list links FROM
// GET    /api/links?target_type=X&target_id=Y[&source_type=Z]   list links TO
// GET    /api/links?entity_type=X&entity_id=Y                   list links touching either side
// DELETE /api/links/:id                    delete a link
//
// Permission: elevated roles only for write. Read is auth-only and org-scoped
// (we verify the touched entity belongs to the caller's org).

import { Router } from 'express';
import db from '../db/connection.js';
import { createLink, deleteLink, getLink, listLinksFrom, listLinksTo, listLinksTouching, referencesFor, LINKABLE_TYPES } from '../services/entity_links.js';
import { writeActivity } from '../services/activity_log.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const PARENT_TABLES = {
  incident: 'incidents',
  investigation: 'investigations',
  capa: 'capas',
  asset: 'assets',
  document: 'documents',
  inspection: 'inspections',
  risk: 'risks',
};

// Verify an entity exists in the user's org. Returns true/false.
function entityInOrg(entity_type, entity_id, orgId) {
  const table = PARENT_TABLES[entity_type];
  if (!table) return false;
  const row = db.prepare(`SELECT org_id FROM ${table} WHERE id = ?`).get(entity_id);
  return row && row.org_id === orgId;
}

router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot create links.' });
  }
  const { source_type, source_id, target_type, target_id, link_role } = req.body;
  if (!source_type || !source_id || !target_type || !target_id) {
    return res.status(400).json({ error: 'source_type, source_id, target_type, target_id are all required' });
  }
  if (!LINKABLE_TYPES.has(source_type)) {
    return res.status(400).json({ error: `Invalid source_type. Allowed: ${[...LINKABLE_TYPES].join(', ')}` });
  }
  if (!LINKABLE_TYPES.has(target_type)) {
    return res.status(400).json({ error: `Invalid target_type. Allowed: ${[...LINKABLE_TYPES].join(', ')}` });
  }
  if (!entityInOrg(source_type, source_id, req.user.org_id)) {
    return res.status(404).json({ error: `${source_type}:${source_id} not found in your organization` });
  }
  if (!entityInOrg(target_type, target_id, req.user.org_id)) {
    return res.status(404).json({ error: `${target_type}:${target_id} not found in your organization` });
  }

  try {
    const result = createLink({ source_type, source_id, target_type, target_id, link_role: link_role || null, created_by: req.user.id });
    const link = getLink(result.id);

    if (result.created) {
      writeActivity({
        org_id: req.user.org_id,
        entity_type: 'link',
        entity_id: link.id,
        action: 'link_created',
        description: `linked ${source_type}:${source_id} → ${target_type}:${target_id}`,
        user_id: req.user.id,
        metadata: { source_type, source_id, target_type, target_id, link_role: link_role || null },
      });
    }

    res.status(result.created ? 201 : 200).json({ link, created: result.created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/', (req, res) => {
  const { source_type, source_id, target_type, target_id, entity_type, entity_id, link_role } = req.query;

  if (entity_type && entity_id) {
    if (!entityInOrg(entity_type, Number(entity_id), req.user.org_id)) {
      return res.status(404).json({ error: 'Entity not found in your organization' });
    }
    return res.json({ links: listLinksTouching({ entity_type, entity_id: Number(entity_id) }) });
  }
  if (source_type && source_id) {
    if (!entityInOrg(source_type, Number(source_id), req.user.org_id)) {
      return res.status(404).json({ error: 'Source not found in your organization' });
    }
    return res.json({ links: listLinksFrom({ source_type, source_id: Number(source_id), target_type: target_type || null, link_role: link_role || null }) });
  }
  if (target_type && target_id) {
    if (!entityInOrg(target_type, Number(target_id), req.user.org_id)) {
      return res.status(404).json({ error: 'Target not found in your organization' });
    }
    return res.json({ links: listLinksTo({ target_type, target_id: Number(target_id), source_type: source_type || null, link_role: link_role || null }) });
  }
  return res.status(400).json({ error: 'Provide either {source_type,source_id} or {target_type,target_id} or {entity_type,entity_id}' });
});

// "Referenced by" — back-tracking endpoint (P3-L1).
// Given an entity, return everything that points at it grouped by entity type.
router.get('/references', (req, res) => {
  const { type, id } = req.query;
  if (!type || !id) {
    return res.status(400).json({ error: 'type and id query params are required' });
  }
  if (!LINKABLE_TYPES.has(type)) {
    return res.status(400).json({ error: `Invalid type. Allowed: ${[...LINKABLE_TYPES].join(', ')}` });
  }
  if (!entityInOrg(type, Number(id), req.user.org_id)) {
    return res.status(404).json({ error: 'Entity not found in your organization' });
  }
  const refs = referencesFor(type, Number(id), req.user.org_id);
  const total = refs.incidents.length + refs.investigations.length + refs.capas.length + refs.documents.length + (refs.inspections?.length || 0) + (refs.assets?.length || 0) + (refs.risks?.length || 0);
  res.json({ ...refs, total });
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Worker role cannot delete links.' });
  }
  const link = getLink(req.params.id);
  if (!link) return res.status(404).json({ error: 'Link not found' });
  // Verify caller has access to either side of the link
  if (!entityInOrg(link.source_type, link.source_id, req.user.org_id) &&
      !entityInOrg(link.target_type, link.target_id, req.user.org_id)) {
    return res.status(404).json({ error: 'Link not found' });
  }
  deleteLink(link.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'link',
    entity_id: link.id,
    action: 'link_deleted',
    description: `unlinked ${link.source_type}:${link.source_id} → ${link.target_type}:${link.target_id}`,
    user_id: req.user.id,
    metadata: {
      source_type: link.source_type, source_id: link.source_id,
      target_type: link.target_type, target_id: link.target_id,
      link_role: link.link_role,
    },
  });

  res.json({ success: true });
});

export default router;
