// server/routes/documents.js — standalone document library.
//
// Distinct from /api/attachments (which attaches files directly to a single
// incident/investigation/CAPA via the `attachments` table). Documents are
// org-level reusable assets — SDS sheets, manuals, policies, photos —
// that can be linked to multiple entities via entity_links.
//
// GET    /api/documents                  list (filters: document_type, active, q)
// GET    /api/documents/:id              detail (includes linked_entities)
// POST   /api/documents                  multipart upload + metadata (elevated)
// PATCH  /api/documents/:id              update metadata (elevated)
// DELETE /api/documents/:id              soft-delete (elevated)
// GET    /api/documents/:id/download     stream the LATEST underlying file
// POST   /api/documents/:id/versions     supersede with a new file (elevated)
// GET    /api/documents/:id/versions/:vid/download   stream a historical version

import { Router } from 'express';
import { join } from 'path';
import { unlinkSync } from 'fs';
import db from '../db/connection.js';
import { upload, uploadDir } from '../middleware/upload.js';
import { nextDocumentNumber } from '../services/numbering.js';
import { listLinksTouching, LINKABLE_TYPES } from '../services/entity_links.js';
import { writeActivity, diffFields } from '../services/activity_log.js';

const router = Router();

const DOCUMENT_AUDIT_FIELDS = ['name', 'document_type', 'folder_id', 'active'];

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

const DOCUMENT_TYPES = new Set(['sds', 'manual', 'policy', 'photo', 'video', 'log', 'certificate', 'other']);

const PARENT_TABLES = {
  incident: 'incidents',
  investigation: 'investigations',
  capa: 'capas',
  asset: 'assets',
  document: 'documents',
};

router.get('/', (req, res) => {
  const { document_type, active, q, folder_id, site_id, page = 1, limit = 100 } = req.query;
  const orgId = req.user.org_id;

  const where = ['d.org_id = ?'];
  const params = [orgId];

  if (document_type) { where.push('d.document_type = ?'); params.push(document_type); }
  if (active !== undefined && active !== '') { where.push('d.active = ?'); params.push(Number(active) ? 1 : 0); }
  if (q) {
    where.push('(d.name LIKE ? OR d.document_number LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }
  // Folder scope. `folder_id=null` (literal) or `folder_id=` (empty) → root only.
  // A numeric folder_id → that folder. Omitted entirely → no folder filter (full
  // library, used by the link-from-library modal's global search).
  if (folder_id !== undefined) {
    if (folder_id === '' || folder_id === 'null' || folder_id === '0') {
      where.push('d.folder_id IS NULL');
    } else {
      where.push('d.folder_id = ?');
      params.push(Number(folder_id));
    }
  }
  // Site filter only applies to docs that live in a folder. Root docs (folder
  // IS NULL) are org-wide and always visible regardless of site.
  if (site_id) {
    where.push('(d.folder_id IS NULL OR EXISTS (SELECT 1 FROM document_folders f WHERE f.id = d.folder_id AND f.site_id = ?))');
    params.push(Number(site_id));
  }

  const whereClause = where.join(' AND ');
  const offset = (Number(page) - 1) * Number(limit);

  const total = db.prepare(`SELECT COUNT(*) as c FROM documents d WHERE ${whereClause}`).get(...params).c;
  const documents = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE ${whereClause}
    ORDER BY d.active DESC, d.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, Number(limit), offset);

  res.json({ documents, total, page: Number(page), limit: Number(limit) });
});

router.get('/:id', (req, res) => {
  const doc = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM documents d
    LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.id = ? AND d.org_id = ?
  `).get(req.params.id, req.user.org_id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Linked entities (any direction) — annotated with display info.
  const rawLinks = listLinksTouching({ entity_type: 'document', entity_id: doc.id });
  const linked = [];
  for (const l of rawLinks) {
    const otherType = l.is_source ? l.target_type : l.source_type;
    const otherId = l.is_source ? l.target_id : l.source_id;
    const table = PARENT_TABLES[otherType];
    if (!table) continue;
    const labelCol = otherType === 'incident' ? 'incident_number'
      : otherType === 'investigation' ? 'investigation_number'
      : otherType === 'capa' ? 'capa_number'
      : otherType === 'asset' ? 'asset_number'
      : 'name';
    const titleCol = otherType === 'document' ? null : 'title';
    const cols = [labelCol === 'name' ? 'name' : `${labelCol} as label`, titleCol].filter(Boolean).join(', ');
    const row = db.prepare(`SELECT id, ${cols}, org_id FROM ${table} WHERE id = ?`).get(otherId);
    if (row && row.org_id === req.user.org_id) {
      linked.push({
        link_id: l.id,
        link_role: l.link_role,
        type: otherType,
        id: row.id,
        label: row.label || row.name,
        title: row.title || null,
      });
    }
  }
  doc.linked_entities = linked;

  // Immutable revision history (mig 022). DESC so the latest is first; the
  // frontend can render the timeline top-down without re-sorting. Every
  // document has ≥1 row thanks to the v1 backfill.
  doc.versions = db.prepare(`
    SELECT v.id, v.version_number, v.file_url, v.stored_filename,
           v.mime_type, v.size_bytes, v.notes, v.created_at,
           v.uploaded_by, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM document_versions v
    LEFT JOIN users u ON u.id = v.uploaded_by
    WHERE v.document_id = ?
    ORDER BY v.version_number DESC
  `).all(doc.id);

  res.json(doc);
});

router.post('/', upload.single('file'), (req, res) => {
  if (!isElevated(req.user)) {
    if (req.file) try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    return res.status(403).json({ error: 'Worker role cannot upload documents.' });
  }

  if (!req.file) return res.status(400).json({ error: 'A file is required' });
  const { name, document_type, folder_id } = req.body;

  if (!document_type || !DOCUMENT_TYPES.has(document_type)) {
    try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    return res.status(400).json({ error: `document_type must be one of: ${[...DOCUMENT_TYPES].join(', ')}` });
  }

  // Optional folder placement — verify it belongs to caller's org.
  let folderId = null;
  if (folder_id !== undefined && folder_id !== null && folder_id !== '' && folder_id !== 'null') {
    const f = db.prepare('SELECT id FROM document_folders WHERE id = ? AND org_id = ?').get(Number(folder_id), req.user.org_id);
    if (!f) {
      try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
      return res.status(404).json({ error: 'Folder not found in your organization' });
    }
    folderId = f.id;
  }

  const number = nextDocumentNumber();
  const finalName = (name && name.trim()) || req.file.originalname;
  const fileUrl = `/uploads/${req.file.filename}`;

  const result = db.prepare(`
    INSERT INTO documents (document_number, org_id, name, document_type, file_url, stored_filename, mime_type, size_bytes, uploaded_by, folder_id, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(number, req.user.org_id, finalName, document_type, fileUrl, req.file.filename, req.file.mimetype, req.file.size, req.user.id, folderId);

  const doc = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.id = ?
  `).get(result.lastInsertRowid);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'document',
    entity_id: doc.id,
    action: 'document_uploaded',
    description: `uploaded document ${doc.name}`,
    user_id: req.user.id,
    metadata: {
      document_type: doc.document_type,
      folder_id: doc.folder_id,
      mime_type: doc.mime_type,
      size_bytes: doc.size_bytes,
    },
  });

  res.status(201).json(doc);
});

router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot edit documents.' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  const updatable = ['name', 'document_type', 'active'];
  const sets = [];
  const params = [];
  for (const key of updatable) {
    if (req.body[key] !== undefined) {
      if (key === 'document_type' && !DOCUMENT_TYPES.has(req.body[key])) {
        return res.status(400).json({ error: `document_type must be one of: ${[...DOCUMENT_TYPES].join(', ')}` });
      }
      sets.push(`${key} = ?`);
      params.push(key === 'active' ? (req.body[key] ? 1 : 0) : req.body[key]);
    }
  }
  // folder_id is mutated separately (move). null → root; numeric → that folder
  // in the caller's org. We accept the literal "null" string too for HTTP/JSON
  // ergonomics from the frontend.
  if (req.body.folder_id !== undefined) {
    let nextFolderId = null;
    if (req.body.folder_id !== null && req.body.folder_id !== '' && req.body.folder_id !== 'null') {
      const f = db.prepare('SELECT id FROM document_folders WHERE id = ? AND org_id = ?').get(Number(req.body.folder_id), req.user.org_id);
      if (!f) return res.status(404).json({ error: 'Folder not found in your organization' });
      nextFolderId = f.id;
    }
    sets.push('folder_id = ?');
    params.push(nextFolderId);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  sets.push("updated_at = datetime('now')");
  params.push(doc.id);
  db.prepare(`UPDATE documents SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(`
    SELECT d.*, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by
    WHERE d.id = ?
  `).get(doc.id);

  // Use a distinct action when only folder_id moved — Drive-style "moved" reads
  // better in audit than "updated".
  const onlyFolder = req.body.folder_id !== undefined
    && req.body.name === undefined
    && req.body.document_type === undefined
    && req.body.active === undefined;
  const action = onlyFolder ? 'document_moved' : 'document_updated';
  const description = onlyFolder
    ? `moved document ${updated.name}`
    : `updated document ${updated.name}`;

  const changes = diffFields(doc, updated, DOCUMENT_AUDIT_FIELDS);
  if (changes) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'document',
      entity_id: doc.id,
      action,
      description,
      user_id: req.user.id,
      metadata: changes,
    });
  }

  res.json(updated);
});

router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) return res.status(403).json({ error: 'Worker role cannot delete documents.' });
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });

  // Soft-delete; keep the file on disk so historical links don't break.
  db.prepare("UPDATE documents SET active = 0, updated_at = datetime('now') WHERE id = ?").run(doc.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'document',
    entity_id: doc.id,
    action: 'document_deleted',
    description: `deleted document ${doc.name}`,
    user_id: req.user.id,
    metadata: { document_number: doc.document_number, document_type: doc.document_type },
  });

  res.json({ success: true, soft_deleted: true });
});

router.get('/:id/download', (req, res) => {
  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!doc) return res.status(404).json({ error: 'Document not found' });
  if (!doc.stored_filename) return res.status(404).json({ error: 'No file on disk for this document' });
  res.download(join(uploadDir, doc.stored_filename), doc.name || doc.stored_filename);
});

// P3-OB3 — supersede a document with a new file. Insert an immutable
// document_versions row + bump documents.* mirror fields atomically so the
// existing list/download paths keep serving the latest without rewrites.
// Old binaries on disk are NEVER overwritten or deleted (regulator audit).
router.post('/:id/versions', upload.single('file'), (req, res) => {
  if (!isElevated(req.user)) {
    if (req.file) try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    return res.status(403).json({ error: 'Worker role cannot supersede documents.' });
  }
  if (!req.file) return res.status(400).json({ error: 'A file is required' });

  const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND org_id = ?').get(req.params.id, req.user.org_id);
  if (!doc) {
    try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    return res.status(404).json({ error: 'Document not found' });
  }

  // Validate notes length up front so we can clean the orphan upload on reject.
  const rawNotes = (req.body.notes || '').toString().trim();
  if (rawNotes.length > 500) {
    try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    return res.status(400).json({ error: 'Notes must be 500 characters or fewer' });
  }
  const notes = rawNotes || null;

  const latestVersionNumber = db.prepare(
    'SELECT COALESCE(MAX(version_number), 0) as n FROM document_versions WHERE document_id = ?'
  ).get(doc.id).n;
  const nextVersion = latestVersionNumber + 1;

  const fileUrl = `/uploads/${req.file.filename}`;

  const apply = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO document_versions
        (document_id, version_number, file_url, stored_filename,
         mime_type, size_bytes, uploaded_by, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(doc.id, nextVersion, fileUrl, req.file.filename, req.file.mimetype, req.file.size, req.user.id, notes);

    db.prepare(`
      UPDATE documents
      SET file_url = ?, stored_filename = ?, mime_type = ?, size_bytes = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(fileUrl, req.file.filename, req.file.mimetype, req.file.size, doc.id);

    return result.lastInsertRowid;
  });

  let newVersionId;
  try {
    newVersionId = apply();
  } catch (err) {
    try { unlinkSync(join(uploadDir, req.file.filename)); } catch {}
    throw err;
  }

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'document',
    entity_id: doc.id,
    action: 'document_superseded',
    description: `superseded document ${doc.name} (v${latestVersionNumber} → v${nextVersion})`,
    user_id: req.user.id,
    metadata: {
      version_number: nextVersion,
      previous_version_number: latestVersionNumber,
      mime_type: req.file.mimetype,
      size_bytes: req.file.size,
      notes,
    },
  });

  const newVersion = db.prepare(`
    SELECT v.id, v.version_number, v.file_url, v.stored_filename,
           v.mime_type, v.size_bytes, v.notes, v.created_at,
           v.uploaded_by, u.name as uploaded_by_name, u.initials as uploaded_by_initials
    FROM document_versions v
    LEFT JOIN users u ON u.id = v.uploaded_by
    WHERE v.id = ?
  `).get(newVersionId);

  res.status(201).json({ version: newVersion });
});

// Serve a historical version's file. Auto-scoped: the version must belong to
// a document in the caller's org. Filename echoes the original document name
// with a "(vN)" suffix so saved files are self-describing.
router.get('/:id/versions/:vid/download', (req, res) => {
  const row = db.prepare(`
    SELECT v.*, d.name as document_name, d.org_id as document_org_id
    FROM document_versions v
    JOIN documents d ON d.id = v.document_id
    WHERE v.id = ? AND v.document_id = ?
  `).get(Number(req.params.vid), Number(req.params.id));

  if (!row || row.document_org_id !== req.user.org_id) {
    return res.status(404).json({ error: 'Version not found' });
  }
  if (!row.stored_filename) {
    return res.status(404).json({ error: 'No file on disk for this version' });
  }

  const baseName = row.document_name || row.stored_filename;
  // Insert "(vN)" before the extension so the suffix sits next to the name,
  // not at the end of "report.pdf (v2)" which some OSes mis-handle.
  const lastDot = baseName.lastIndexOf('.');
  const displayName = lastDot > 0
    ? `${baseName.slice(0, lastDot)} (v${row.version_number})${baseName.slice(lastDot)}`
    : `${baseName} (v${row.version_number})`;

  res.download(join(uploadDir, row.stored_filename), displayName);
});

export default router;
