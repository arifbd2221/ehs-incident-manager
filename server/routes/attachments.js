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
};

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

  db.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id);
  try {
    unlinkSync(join(uploadDir, attachment.stored_filename));
  } catch {
    // File may have been removed already; not a hard error.
  }
  res.json({ success: true });
});

export default router;
