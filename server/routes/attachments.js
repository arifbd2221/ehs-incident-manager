import { Router } from 'express';
import { join } from 'path';
import { unlinkSync } from 'fs';
import db from '../db/connection.js';
import { upload, uploadDir } from '../middleware/upload.js';

const router = Router();

const PARENT_TABLES = {
  incident: 'incidents',
  investigation: 'investigations',
  capa: 'capas',
  maintenance_event: 'asset_maintenance_events',
  risk: 'risks',
};

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// Returns the attachment row only if its parent entity belongs to the requester's org.
function getScopedAttachment(attachmentId, orgId) {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(attachmentId);
  if (!attachment) return null;
  const table = PARENT_TABLES[attachment.entity_type];
  if (!table) return null;
  const parent = db.prepare(`SELECT org_id FROM ${table} WHERE id = ?`).get(attachment.entity_id);
  if (!parent || parent.org_id !== orgId) return null;
  return attachment;
}

router.post('/', upload.array('files', 10), (req, res) => {
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
  }
  const table = PARENT_TABLES[entity_type];
  if (!table) {
    return res.status(400).json({ error: `Invalid entity_type: ${entity_type}` });
  }
  const parent = db.prepare(`SELECT org_id FROM ${table} WHERE id = ?`).get(entity_id);
  if (!parent || parent.org_id !== req.user.org_id) {
    // Clean up any uploaded files since we're not persisting them.
    for (const file of (req.files || [])) {
      try { unlinkSync(join(uploadDir, file.filename)); } catch { /* ignore */ }
    }
    return res.status(404).json({ error: `${entity_type} not found` });
  }

  const insertStmt = db.prepare(`
    INSERT INTO attachments (entity_type, entity_id, filename, stored_filename, mime_type, size_bytes, uploaded_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const attachments = [];
  for (const file of (req.files || [])) {
    const result = insertStmt.run(entity_type, entity_id, file.originalname, file.filename, file.mimetype, file.size, req.user.id);
    attachments.push({
      id: result.lastInsertRowid,
      filename: file.originalname,
      stored_filename: file.filename,
      mime_type: file.mimetype,
      size_bytes: file.size,
    });
  }

  // Audit trail: per OSHA 1904.33, post-creation evidence is fine but every
  // change must be attributable. One activity_log row per upload batch keeps
  // the timeline readable; metadata captures every filename for forensic use.
  //
  // maintenance_event isn't a top-level audit entity_type — its parent
  // schedule is. Roll the audit row up to entity_type='asset_maintenance' +
  // schedule_id so it appears on the schedule's audit timeline.
  if (attachments.length > 0) {
    const summary = attachments.length === 1
      ? `attached "${attachments[0].filename}"`
      : `attached ${attachments.length} files`;

    let logEntityType = entity_type;
    let logEntityId = Number(entity_id);
    if (entity_type === 'maintenance_event') {
      const ev = db.prepare('SELECT schedule_id FROM asset_maintenance_events WHERE id = ?').get(Number(entity_id));
      if (ev) {
        logEntityType = 'asset_maintenance';
        logEntityId = ev.schedule_id;
      }
    }

    db.prepare(`
      INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
      VALUES (?, ?, ?, 'attached', ?, ?, ?)
    `).run(
      req.user.org_id, logEntityType, logEntityId,
      summary, req.user.id,
      JSON.stringify({
        attachment_ids: attachments.map(a => a.id),
        filenames: attachments.map(a => a.filename),
        // Preserve the original entity_type/id when we rolled up to the parent.
        ...(entity_type !== logEntityType ? { source_entity_type: entity_type, source_entity_id: Number(entity_id) } : {}),
      }),
    );
  }

  res.status(201).json({ attachments });
});

router.get('/:id/download', (req, res) => {
  const attachment = getScopedAttachment(Number(req.params.id), req.user.org_id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const filePath = join(uploadDir, attachment.stored_filename);
  res.download(filePath, attachment.filename);
});

router.delete('/:id', (req, res) => {
  const attachment = getScopedAttachment(Number(req.params.id), req.user.org_id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  // Deletion authority: the original uploader can remove their own file,
  // or any elevated role can remove anyone's. Workers cannot wipe evidence
  // someone else attached.
  if (attachment.uploaded_by !== req.user.id && !isElevated(req.user)) {
    return res.status(403).json({
      error: 'Only the uploader or an elevated role can delete this attachment.',
    });
  }

  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
  try {
    unlinkSync(join(uploadDir, attachment.stored_filename));
  } catch {
    // File may have been removed already; not a hard error.
  }

  // Audit trail: capture the filename in description + full metadata so
  // a deleted attachment is recoverable in spirit (we know what was there).
  db.prepare(`
    INSERT INTO activity_log (org_id, entity_type, entity_id, action, description, user_id, metadata)
    VALUES (?, ?, ?, 'attachment_deleted', ?, ?, ?)
  `).run(
    req.user.org_id, attachment.entity_type, attachment.entity_id,
    `removed attachment "${attachment.filename}"`,
    req.user.id,
    JSON.stringify({
      attachment_id: attachment.id,
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      size_bytes: attachment.size_bytes,
      original_uploader: attachment.uploaded_by,
    }),
  );

  res.json({ success: true });
});

export default router;
