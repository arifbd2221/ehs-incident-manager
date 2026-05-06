// server/routes/answer_sets.js — Answer set CRUD.
//
// Answer sets are reusable groups of response options (e.g. Yes/No,
// Pass/Fail/N/A) used by template questions during inspections.
//
// GET    /api/answer-sets          — list answer sets with options
// POST   /api/answer-sets          — create answer set with options (elevated)
// PATCH  /api/answer-sets/:id      — update answer set + options (elevated)
// DELETE /api/answer-sets/:id      — delete answer set (elevated, blocked if in use)

import { Router } from 'express';
import db from '../db/connection.js';
import { writeActivity } from '../services/activity_log.js';

const router = Router();

const ELEVATED_ROLES = new Set(['supervisor', 'ehs_officer', 'ehs_manager', 'admin']);
const isElevated = (user) => ELEVATED_ROLES.has(user?.role);

// ---------------------------------------------------------------------------
// GET / — list answer sets with their options
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const orgId = req.user.org_id;

  const sets = db.prepare(
    'SELECT * FROM answer_sets WHERE org_id = ? ORDER BY name'
  ).all(orgId);

  for (const as of sets) {
    as.options = db.prepare(
      'SELECT * FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
    ).all(as.id);
  }

  res.json({ answer_sets: sets });
});

// ---------------------------------------------------------------------------
// POST / — create answer set with options
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to create answer sets.' });
  }

  const { name, options } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  if (!Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: 'At least one option is required' });
  }

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO answer_sets (org_id, name) VALUES (?, ?)
    `).run(req.user.org_id, name.trim());

    const setId = result.lastInsertRowid;

    const insertOpt = db.prepare(`
      INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const opt of options) {
      insertOpt.run(
        setId,
        opt.label,
        opt.score ?? 0,
        opt.color || '#90A4AE',
        opt.is_failed ? 1 : 0,
        opt.position ?? 0,
      );
    }

    return setId;
  });

  const setId = create();

  const answerSet = db.prepare('SELECT * FROM answer_sets WHERE id = ?').get(setId);
  answerSet.options = db.prepare(
    'SELECT * FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
  ).all(setId);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'answer_set',
    entity_id: setId,
    action: 'answer_set_created',
    description: `created answer set ${answerSet.name}`,
    user_id: req.user.id,
    metadata: {
      option_count: answerSet.options.length,
      options: answerSet.options.map(o => ({ label: o.label, score: o.score, is_failed: !!o.is_failed })),
    },
  });

  res.status(201).json(answerSet);
});

// ---------------------------------------------------------------------------
// PATCH /:id — update answer set name + replace options
// ---------------------------------------------------------------------------
router.patch('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to edit answer sets.' });
  }

  const answerSet = db.prepare(
    'SELECT * FROM answer_sets WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!answerSet) return res.status(404).json({ error: 'Answer set not found' });

  const { name, options } = req.body;

  const update = db.transaction(() => {
    if (name !== undefined) {
      db.prepare('UPDATE answer_sets SET name = ? WHERE id = ?').run(name.trim(), answerSet.id);
    }

    if (Array.isArray(options)) {
      // Delete existing options and re-insert
      db.prepare('DELETE FROM answer_set_options WHERE answer_set_id = ?').run(answerSet.id);

      const insertOpt = db.prepare(`
        INSERT INTO answer_set_options (answer_set_id, label, score, color, is_failed, position)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      for (const opt of options) {
        insertOpt.run(
          answerSet.id,
          opt.label,
          opt.score ?? 0,
          opt.color || '#90A4AE',
          opt.is_failed ? 1 : 0,
          opt.position ?? 0,
        );
      }
    }
  });

  // Snapshot options before the update for the audit diff.
  const optionsBefore = db.prepare(
    'SELECT label, score, color, is_failed, position FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
  ).all(answerSet.id);

  update();

  const updated = db.prepare('SELECT * FROM answer_sets WHERE id = ?').get(answerSet.id);
  updated.options = db.prepare(
    'SELECT * FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
  ).all(answerSet.id);

  // Audit-relevant: when an answer set is mutated, every prior inspection
  // that recorded against it can no longer be re-displayed identically.
  // Capture name + options diff so the trail is reconstructible.
  const meta = { changes: {} };
  if (name !== undefined && name.trim() !== answerSet.name) {
    meta.changes.name = [answerSet.name, updated.name];
  }
  if (Array.isArray(options)) {
    meta.changes.options = [
      optionsBefore.map(o => ({ label: o.label, score: o.score, is_failed: !!o.is_failed })),
      updated.options.map(o => ({ label: o.label, score: o.score, is_failed: !!o.is_failed })),
    ];
  }
  if (Object.keys(meta.changes).length > 0) {
    writeActivity({
      org_id: req.user.org_id,
      entity_type: 'answer_set',
      entity_id: answerSet.id,
      action: 'answer_set_updated',
      description: `updated answer set ${updated.name}`,
      user_id: req.user.id,
      metadata: meta,
    });
  }

  res.json(updated);
});

// ---------------------------------------------------------------------------
// DELETE /:id — delete answer set (blocked if referenced by template items)
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  if (!isElevated(req.user)) {
    return res.status(403).json({ error: 'Insufficient permissions to delete answer sets.' });
  }

  const answerSet = db.prepare(
    'SELECT * FROM answer_sets WHERE id = ? AND org_id = ?'
  ).get(req.params.id, req.user.org_id);
  if (!answerSet) return res.status(404).json({ error: 'Answer set not found' });

  // Check if any template_items reference this answer set via their meta JSON.
  // meta is stored as JSON and may contain { answer_set_id: N }.
  const templateItems = db.prepare(`
    SELECT COUNT(*) as c FROM template_items ti
    JOIN templates t ON t.id = ti.template_id
    WHERE t.org_id = ?
      AND ti.meta LIKE ?
  `).get(req.user.org_id, `%"answer_set_id":${answerSet.id}%`);

  if (templateItems.c > 0) {
    return res.status(409).json({
      error: `Cannot delete — this answer set is referenced by ${templateItems.c} template item(s). Remove those references first.`,
      references: templateItems.c,
    });
  }

  // Also check a more lenient pattern (with space after colon)
  const templateItemsAlt = db.prepare(`
    SELECT COUNT(*) as c FROM template_items ti
    JOIN templates t ON t.id = ti.template_id
    WHERE t.org_id = ?
      AND ti.meta LIKE ?
  `).get(req.user.org_id, `%"answer_set_id": ${answerSet.id}%`);

  if (templateItemsAlt.c > 0) {
    return res.status(409).json({
      error: `Cannot delete — this answer set is referenced by ${templateItemsAlt.c} template item(s). Remove those references first.`,
      references: templateItemsAlt.c,
    });
  }

  // Snapshot options for the audit metadata before CASCADE wipes them.
  const optionsBefore = db.prepare(
    'SELECT label, score, color, is_failed, position FROM answer_set_options WHERE answer_set_id = ? ORDER BY position ASC'
  ).all(answerSet.id);

  // CASCADE will delete answer_set_options automatically
  db.prepare('DELETE FROM answer_sets WHERE id = ?').run(answerSet.id);

  writeActivity({
    org_id: req.user.org_id,
    entity_type: 'answer_set',
    entity_id: answerSet.id,
    action: 'answer_set_deleted',
    description: `deleted answer set ${answerSet.name}`,
    user_id: req.user.id,
    metadata: {
      name: answerSet.name,
      options: optionsBefore.map(o => ({ label: o.label, score: o.score, is_failed: !!o.is_failed })),
    },
  });

  res.json({ success: true });
});

export default router;
