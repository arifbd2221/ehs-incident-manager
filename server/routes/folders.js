// server/routes/folders.js — document folder tree CRUD.
//
// Folders are site-scoped (each folder belongs to exactly one site). Root-
// level documents (folder_id NULL) remain org-wide. Single parent per folder;
// nested unlimited. Cycle-prevention is enforced on move.
//
// Routes:
//   GET    /api/folders?site_id=X            list all folders the caller can see
//   GET    /api/folders/:id                  one folder + breadcrumb (ancestors)
//   POST   /api/folders                      create  { name, site_id, parent_id? }
//   PATCH  /api/folders/:id                  rename and/or move { name?, parent_id? }
//   DELETE /api/folders/:id                  cascade-delete (children + orphan docs to root)
//
// Write ops require an elevated role; read is auth-only and org-scoped.

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

function getFolder(id, orgId) {
  return db.prepare('SELECT * FROM document_folders WHERE id = ? AND org_id = ?').get(id, orgId);
}

// Walk parent chain from `id` up to root. Returns array root → folder.
function breadcrumbOf(id, orgId) {
  const chain = [];
  let cur = id;
  const seen = new Set();
  while (cur != null) {
    if (seen.has(cur)) break; // safety
    seen.add(cur);
    const f = db.prepare('SELECT id, name, parent_id FROM document_folders WHERE id = ? AND org_id = ?').get(cur, orgId);
    if (!f) break;
    chain.unshift({ id: f.id, name: f.name });
    cur = f.parent_id;
  }
  return chain;
}

// True if `descendantId` is in the subtree rooted at `ancestorId` (or equal).
// Used to block moves that would create a cycle.
function isDescendantOf(descendantId, ancestorId, orgId) {
  if (descendantId === ancestorId) return true;
  let cur = descendantId;
  const seen = new Set();
  while (cur != null) {
    if (seen.has(cur)) return false;
    seen.add(cur);
    const f = db.prepare('SELECT parent_id FROM document_folders WHERE id = ? AND org_id = ?').get(cur, orgId);
    if (!f) return false;
    if (f.parent_id === ancestorId) return true;
    cur = f.parent_id;
  }
  return false;
}

router.get('/', (req, res) => {
  const { org_id } = req.user;
  const { site_id } = req.query;
  const where = ['f.org_id = ?'];
  const args = [org_id];
  if (site_id) { where.push('f.site_id = ?'); args.push(Number(site_id)); }
  const rows = db.prepare(`
    SELECT f.*, s.name as site_name,
      (SELECT COUNT(*) FROM document_folders WHERE parent_id = f.id) as child_folder_count,
      (SELECT COUNT(*) FROM documents WHERE folder_id = f.id AND active = 1) as document_count
    FROM document_folders f
    LEFT JOIN sites s ON s.id = f.site_id
    WHERE ${where.join(' AND ')}
    ORDER BY f.name COLLATE NOCASE
  `).all(...args);
  res.json({ folders: rows });
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const folder = getFolder(id, req.user.org_id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });
  res.json({ folder, breadcrumb: breadcrumbOf(id, req.user.org_id) });
});

router.post('/', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot create folders.' });
  const { name, site_id, parent_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!site_id) return res.status(400).json({ error: 'site_id is required' });

  // Site must belong to caller's org
  const site = db.prepare('SELECT id FROM sites WHERE id = ? AND org_id = ?').get(Number(site_id), req.user.org_id);
  if (!site) return res.status(404).json({ error: 'Site not found in your organization' });

  // If parent given: must be in same org and same site
  if (parent_id != null) {
    const parent = getFolder(Number(parent_id), req.user.org_id);
    if (!parent) return res.status(404).json({ error: 'Parent folder not found' });
    if (parent.site_id !== Number(site_id)) {
      return res.status(400).json({ error: 'Sub-folder must be in the same site as its parent' });
    }
  }

  // Block duplicate sibling names within the same parent
  const dupe = db.prepare(`
    SELECT id FROM document_folders
    WHERE org_id = ? AND name = ? AND ${parent_id == null ? 'parent_id IS NULL' : 'parent_id = ?'}
  `).get(...(parent_id == null ? [req.user.org_id, name.trim()] : [req.user.org_id, name.trim(), Number(parent_id)]));
  if (dupe) return res.status(409).json({ error: 'A folder with this name already exists here' });

  const result = db.prepare(`
    INSERT INTO document_folders (org_id, site_id, parent_id, name, created_by)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.org_id, Number(site_id), parent_id == null ? null : Number(parent_id), name.trim(), req.user.id);

  const folder = getFolder(result.lastInsertRowid, req.user.org_id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'folder',
    entity_id: folder.id,
    action: 'folder_created',
    description: `created folder ${folder.name}`,
    user_id: req.user.id,
    metadata: { site_id: folder.site_id, parent_id: folder.parent_id },
  });

  res.status(201).json({ folder });
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit folders.' });
  const id = Number(req.params.id);
  const folder = getFolder(id, req.user.org_id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  const { name, parent_id } = req.body;
  const sets = [];
  const args = [];

  if (name !== undefined) {
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
    sets.push('name = ?');
    args.push(name.trim());
  }

  let nextParentId = folder.parent_id;
  if (parent_id !== undefined) {
    nextParentId = parent_id == null ? null : Number(parent_id);
    if (nextParentId != null) {
      if (nextParentId === id) return res.status(400).json({ error: 'A folder cannot be its own parent' });
      const newParent = getFolder(nextParentId, req.user.org_id);
      if (!newParent) return res.status(404).json({ error: 'Parent folder not found' });
      if (newParent.site_id !== folder.site_id) {
        return res.status(400).json({ error: 'Cannot move a folder across sites' });
      }
      // Cycle check — newParent must not be a descendant of `id`
      if (isDescendantOf(nextParentId, id, req.user.org_id)) {
        return res.status(400).json({ error: 'Cannot move a folder into its own subtree' });
      }
    }
    sets.push('parent_id = ?');
    args.push(nextParentId);
  }

  // Sibling-name uniqueness when renaming or moving
  const checkName = name === undefined ? folder.name : name.trim();
  const dupe = db.prepare(`
    SELECT id FROM document_folders
    WHERE org_id = ? AND name = ? AND id != ? AND ${nextParentId == null ? 'parent_id IS NULL' : 'parent_id = ?'}
  `).get(...(nextParentId == null ? [req.user.org_id, checkName, id] : [req.user.org_id, checkName, id, nextParentId]));
  if (dupe) return res.status(409).json({ error: 'A folder with this name already exists here' });

  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE document_folders SET ${sets.join(', ')} WHERE id = ?`).run(...args, id);

  const updated = getFolder(id, req.user.org_id);

  // Two distinct actions for clarity in the audit trail.
  const renamed = name !== undefined && name.trim() !== folder.name;
  const moved = parent_id !== undefined && nextParentId !== folder.parent_id;
  const meta = { changes: {} };
  if (renamed) meta.changes.name = [folder.name, updated.name];
  if (moved) meta.changes.parent_id = [folder.parent_id, updated.parent_id];

  if (renamed || moved) {
    const action = (renamed && moved) ? 'folder_updated'
      : renamed ? 'folder_renamed'
      : 'folder_moved';
    const description = (renamed && moved) ? `renamed and moved folder ${updated.name}`
      : renamed ? `renamed folder ${folder.name} → ${updated.name}`
      : `moved folder ${updated.name}`;
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'folder',
      entity_id: id,
      action,
      description,
      user_id: req.user.id,
      metadata: meta,
    });
  }

  res.json({ folder: updated, breadcrumb: breadcrumbOf(id, req.user.org_id) });
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot delete folders.' });
  const id = Number(req.params.id);
  const folder = getFolder(id, req.user.org_id);
  if (!folder) return res.status(404).json({ error: 'Folder not found' });

  // Count contents for the response (UI uses this in its confirm dialog)
  const childFolders = db.prepare('SELECT COUNT(*) as c FROM document_folders WHERE parent_id = ?').get(id).c;
  const docCount = db.prepare('SELECT COUNT(*) as c FROM documents WHERE folder_id = ? AND active = 1').get(id).c;

  // Cascade is via FK ON DELETE on parent_id (sub-folders) and SET NULL on
  // documents.folder_id (docs orphan to root rather than disappear). Anything
  // policy-level beyond that (e.g. soft-deleting orphaned docs) can be added
  // here later if the UX calls for it.
  db.prepare('DELETE FROM document_folders WHERE id = ?').run(id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'folder',
    entity_id: id,
    action: 'folder_deleted',
    description: `deleted folder ${folder.name}`,
    user_id: req.user.id,
    metadata: {
      name: folder.name,
      site_id: folder.site_id,
      parent_id: folder.parent_id,
      cascaded_subfolders: childFolders,
      orphaned_documents: docCount,
    },
  });

  res.json({ success: true, deleted_folder_id: id, sub_folder_count: childFolders, document_count: docCount });
});

export default router;
