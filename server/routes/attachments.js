import { Router } from 'express';
import { join } from 'path';
import db from '../db/connection.js';
import { upload, uploadDir } from '../middleware/upload.js';

const router = Router();

router.post('/', upload.array('files', 10), (req, res) => {
  const { entity_type, entity_id } = req.body;
  if (!entity_type || !entity_id) {
    return res.status(400).json({ error: 'entity_type and entity_id are required' });
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
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const filePath = join(uploadDir, attachment.stored_filename);
  res.download(filePath, attachment.filename);
});

router.delete('/:id', (req, res) => {
  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

export default router;
