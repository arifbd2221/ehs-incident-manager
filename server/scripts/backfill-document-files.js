// server/scripts/backfill-document-files.js
//
// Repair documents with `stored_filename IS NULL`. These were inserted by an
// earlier version of populate-sdsmanager-extras.js that set file_url to a
// nonexistent /uploads/demo/... path and left stored_filename empty, which
// makes the preview endpoint 404 with "No file on disk for this document".
//
// Run from server/:
//   node scripts/backfill-document-files.js

import db from '../db/connection.js';
import { writeSeedPdf, writeSeedJpeg } from './seed-files.js';

const rows = db.prepare(
  `SELECT id, name, mime_type FROM documents WHERE stored_filename IS NULL`
).all();

console.log(`Found ${rows.length} documents missing stored_filename.`);

if (rows.length === 0) process.exit(0);

const upd = db.prepare(
  `UPDATE documents SET file_url = ?, stored_filename = ?, size_bytes = ? WHERE id = ?`
);

const apply = db.transaction(() => {
  for (const row of rows) {
    const isImage = (row.mime_type || '').startsWith('image/');
    const { filename, size } = isImage ? writeSeedJpeg() : writeSeedPdf(row.name);
    upd.run(`/uploads/${filename}`, filename, size, row.id);
    console.log(`  [${row.id}] ${row.name} → ${filename} (${size} bytes)`);
  }
});
apply();

console.log(`Backfilled ${rows.length} documents.`);
